// Consultas de Encontros (spec 16). Só a equipe vê esta tela (o RLS também só deixa a equipe ler
// dias, ordens e eventos).
import type { DB } from "@/lib/auth/session";
import { addDays, normTime } from "@/features/ministries/domain";
import { photoUrls } from "@/features/ministries/queries";
import { TREND } from "./domain";
import type { CountPoint, EventDay, EventItem, PlanItem, Registration, Service, ServiceDate, ServiceDay, SermonRef } from "./types";

type SvcRow = { id: string; name: string; weekday: number | null; start_time: string | null; location: string | null };
const svc = (r: SvcRow): Service => ({ id: r.id, name: r.name, weekday: r.weekday, time: normTime(r.start_time), location: r.location ?? "" });

export async function listServices(supabase: DB, orgId: string): Promise<Service[]> {
  const { data, error } = await supabase.from("services").select("id, name, weekday, start_time, location").eq("org_id", orgId).eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(svc);
}

type DateRow = { id: string; service_id: string; date: string; headcount: number | null; visitors: number | null; kids: number | null; sermon_id: string | null; cancelled: boolean };
const DATE_COLS = "id, service_id, date, headcount, visitors, kids, sermon_id, cancelled";
const dateOf = (r: DateRow): ServiceDate => ({ id: r.id, serviceId: r.service_id, date: r.date, headcount: r.headcount, visitors: r.visitors, kids: r.kids, sermonId: r.sermon_id, cancelled: r.cancelled });

const EVENT_COLS = "id, name, event_date, time, location, description, registration_required, capacity, event_registrations(count)";
type EvRow = { id: string; name: string; event_date: string | null; time: string | null; location: string | null; description: string | null; registration_required: boolean; capacity: number | null; event_registrations: { count: number }[] };
const eventOf = (r: EvRow): EventItem => ({
  id: r.id,
  name: r.name,
  date: r.event_date ?? "",
  time: normTime(r.time),
  location: r.location ?? "",
  description: r.description ?? "",
  registration: r.registration_required,
  capacity: r.capacity,
  registered: r.event_registrations[0]?.count ?? 0,
});

/** Eventos e dias de culto mexidos de uma semana (os cultos em si vêm de listServices). */
export async function weekData(supabase: DB, orgId: string, start: string): Promise<{ events: EventItem[]; dates: ServiceDate[] }> {
  const end = addDays(start, 6);
  const [ev, dt] = await Promise.all([
    supabase.from("events").select(EVENT_COLS).eq("org_id", orgId).neq("status", "cancelled").gte("event_date", start).lte("event_date", end),
    supabase.from("service_dates").select(DATE_COLS).eq("org_id", orgId).gte("date", start).lte("date", end),
  ]);
  if (ev.error) throw new Error(ev.error.message);
  if (dt.error) throw new Error(dt.error.message);
  return { events: (ev.data ?? []).map(eventOf), dates: (dt.data ?? []).map(dateOf) };
}

type PlanRow = { id: string; time_label: string | null; title: string; responsible: string | null };
const planOf = (r: PlanRow): PlanItem => ({ id: r.id, time: r.time_label ?? "", title: r.title, responsible: r.responsible ?? "" });

export async function getServiceDay(supabase: DB, orgId: string, serviceId: string, date: string): Promise<ServiceDay | null> {
  const { data: s } = await supabase.from("services").select("id, name, weekday, start_time, location").eq("org_id", orgId).eq("id", serviceId).eq("active", true).maybeSingle();
  if (!s) return null;
  const [rowRes, tplRes, histRes] = await Promise.all([
    supabase.from("service_dates").select(DATE_COLS).eq("service_id", serviceId).eq("date", date).maybeSingle(),
    supabase.from("service_plan_items").select("id, time_label, title, responsible").eq("service_id", serviceId).is("date_id", null).order("position"),
    supabase.from("service_dates").select("date, headcount").eq("service_id", serviceId).lte("date", date).not("headcount", "is", null).order("date", { ascending: false }).limit(TREND),
  ]);
  const row = rowRes.data ? dateOf(rowRes.data) : null;
  const [planRes, sermonRes] = await Promise.all([
    row ? supabase.from("service_plan_items").select("id, time_label, title, responsible").eq("date_id", row.id).order("position") : Promise.resolve({ data: [] as PlanRow[] }),
    row?.sermonId ? supabase.from("sermons").select("id, title, main_passage").eq("id", row.sermonId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const sermon: SermonRef | null = sermonRes.data ? { id: sermonRes.data.id, title: sermonRes.data.title, passage: sermonRes.data.main_passage ?? "" } : null;
  const history: CountPoint[] = (histRes.data ?? []).map((h) => ({ date: h.date, headcount: h.headcount ?? 0 })).reverse();
  return { kind: "service", service: svc(s), date, row, plan: (planRes.data ?? []).map(planOf), template: (tplRes.data ?? []).map(planOf), history, sermon };
}

export async function getEventDay(supabase: DB, orgId: string, id: string): Promise<EventDay | null> {
  const { data } = await supabase.from("events").select(EVENT_COLS).eq("org_id", orgId).eq("id", id).neq("status", "cancelled").maybeSingle();
  if (!data) return null;
  const { data: regs, error } = await supabase
    .from("event_registrations")
    .select("id, stick_id, name, checked_in, created_at, sticks(full_name, profile_photo)")
    .eq("event_id", id)
    .order("created_at");
  if (error) throw new Error(error.message);
  const urls = await photoUrls(supabase, (regs ?? []).map((r) => r.sticks?.profile_photo));
  const registrations: Registration[] = (regs ?? []).map((r) => ({
    id: r.id,
    stickId: r.stick_id,
    name: r.sticks?.full_name || r.name || "",
    photoUrl: (r.sticks?.profile_photo && urls.get(r.sticks.profile_photo)) || null,
    checkedIn: r.checked_in,
  }));
  return { kind: "event", event: eventOf(data), registrations };
}

/** Sermões para ligar ao culto (busca por título). */
export async function findSermons(supabase: DB, orgId: string, q: string): Promise<SermonRef[]> {
  let query = supabase.from("sermons").select("id, title, main_passage").eq("org_id", orgId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(8);
  if (q.trim()) query = query.ilike("title", `%${q.trim().replace(/[%_]/g, "")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ id: s.id, title: s.title, passage: s.main_passage ?? "" }));
}
