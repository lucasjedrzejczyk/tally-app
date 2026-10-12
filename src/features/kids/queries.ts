// Consultas do módulo Crianças (spec 18). A RLS é a barreira: sem kids.view, salas, fichas e
// entradas voltam vazias (m72). As crianças vêm das famílias (papel "filho"), até 12 anos.
import type { DB } from "@/lib/auth/session";
import { photoUrls } from "@/features/groups/queries";
import { addDays } from "@/features/ministries/domain";
import { asAnimal, asColor } from "./domain";
import type { Checkin, DayCount, Guardian, Kid, Room, ServiceOption } from "./types";

export async function listRooms(supabase: DB, orgId: string): Promise<Room[]> {
  const { data } = await supabase.from("kids_rooms").select("*").eq("org_id", orgId).order("position").order("created_at");
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    color: asColor(r.color),
    animal: asAnimal(r.animal),
    minMonths: r.min_months,
    maxMonths: r.max_months,
    capacity: r.capacity,
    position: r.position,
    active: r.active,
  }));
}

const phoneOf = (s: { whatsapp: string | null; phone: string | null }) => s.whatsapp || s.phone || "";

export async function listKids(supabase: DB, orgId: string, today: string): Promise<Kid[]> {
  const oldest = addDays(today, -13 * 366);
  const { data: hm } = await supabase
    .from("household_members")
    .select("household_id, stick_id, relationship_type, sticks!inner(id, org_id, full_name, preferred_name, birth_date, profile_photo, phone, whatsapp, archived)")
    .eq("sticks.org_id", orgId)
    .eq("sticks.archived", false);
  type Row = NonNullable<typeof hm>[number];
  const rows = (hm ?? []) as Row[];
  const kids = rows.filter((r) => r.relationship_type === "child" && (!r.sticks.birth_date || r.sticks.birth_date > oldest));
  if (!kids.length) return [];

  const guardians = new Map<string, Guardian[]>();
  for (const r of rows) {
    if (r.relationship_type !== "head" && r.relationship_type !== "spouse") continue;
    const list = guardians.get(r.household_id) ?? [];
    const g = { id: r.sticks.id, name: r.sticks.full_name, phone: phoneOf(r.sticks) };
    if (r.relationship_type === "head") list.unshift(g);
    else list.push(g);
    guardians.set(r.household_id, list);
  }

  const ids = kids.map((k) => k.stick_id);
  const [{ data: prof }, urls] = await Promise.all([
    supabase.from("kids_profiles").select("*").in("stick_id", ids),
    photoUrls(supabase, kids.map((k) => k.sticks.profile_photo)),
  ]);
  const profiles = new Map((prof ?? []).map((p) => [p.stick_id, p]));

  return kids
    .map((k): Kid => {
      const p = profiles.get(k.stick_id);
      return {
        id: k.stick_id,
        name: k.sticks.preferred_name || k.sticks.full_name,
        photoUrl: (k.sticks.profile_photo && urls.get(k.sticks.profile_photo)) || null,
        birth: k.sticks.birth_date,
        householdId: k.household_id,
        guardians: guardians.get(k.household_id) ?? [],
        allergies: p?.allergies ?? "",
        careNotes: p?.care_notes ?? "",
        authorizedPickup: p?.authorized_pickup ?? "",
        pickupBlocked: p?.pickup_blocked ?? "",
        photoOk: p?.photo_ok ?? true,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const CHECKIN_COLS = "id, stick_id, room_id, guardian_id, code, date, checked_in_at";
type CheckinRow = { id: string; stick_id: string; room_id: string | null; guardian_id: string | null; code: string; date: string; checked_in_at: string };
export const toCheckin = (r: CheckinRow): Checkin => ({
  id: r.id,
  kidId: r.stick_id,
  roomId: r.room_id,
  guardianId: r.guardian_id,
  code: r.code,
  date: r.date,
  at: r.checked_in_at,
});

/** Entradas abertas (inclusive de dias anteriores que ninguém fechou). */
export async function listOpen(supabase: DB, orgId: string): Promise<Checkin[]> {
  const { data } = await supabase.from("kids_checkins").select(CHECKIN_COLS).eq("org_id", orgId).is("checked_out_at", null).order("checked_in_at");
  return (data ?? []).map(toCheckin);
}

/** Entradas abertas de hoje com esse código. */
export async function openByCode(supabase: DB, orgId: string, code: string): Promise<Checkin[]> {
  const { data } = await supabase.from("kids_checkins").select(CHECKIN_COLS).eq("org_id", orgId).eq("code", code).is("checked_out_at", null);
  return (data ?? []).map(toCheckin);
}

export async function listServiceOptions(supabase: DB, orgId: string): Promise<ServiceOption[]> {
  const { data } = await supabase.from("services").select("id, name, weekday, month_week, start_time").eq("org_id", orgId).eq("active", true).order("start_time");
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, weekday: s.weekday, monthWeek: s.month_week, startTime: s.start_time?.slice(0, 5) ?? null }));
}

/** Crianças por dia nas últimas 8 semanas (só dias com entrada). */
export async function recentDays(supabase: DB, orgId: string, today: string): Promise<DayCount[]> {
  const { data } = await supabase.from("kids_checkins").select("date, stick_id").eq("org_id", orgId).gte("date", addDays(today, -56)).lte("date", today);
  const byDay = new Map<string, Set<string>>();
  for (const r of data ?? []) byDay.set(r.date, (byDay.get(r.date) ?? new Set()).add(r.stick_id));
  return [...byDay.entries()].map(([date, s]) => ({ date, total: s.size })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Última vez que cada criança entrou (para "não vem há 4 semanas"). */
export async function lastSeen(supabase: DB, orgId: string): Promise<Map<string, string>> {
  const { data } = await supabase.from("kids_checkins").select("stick_id, date").eq("org_id", orgId).order("date", { ascending: false }).limit(5000);
  const m = new Map<string, string>();
  for (const r of data ?? []) if (!m.has(r.stick_id)) m.set(r.stick_id, r.date);
  return m;
}
