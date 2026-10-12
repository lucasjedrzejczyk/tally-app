// Consultas de Ministérios (spec 15). O RLS decide o que cada um vê: a equipe vê todos; o líder,
// só o ministério dele, as fichas (sem documentos) de quem serve com ele e as escalas dele.
import type { DB } from "@/lib/auth/session";
import { PHOTO_BUCKET } from "@/features/sticks/domain";
import { WEEKDAYS, accessOf, todayIso } from "@/features/groups/domain";
import { HISTORY_DAYS, addDays, listItemFromDetail, normTime, readRoles, readSlots } from "./domain";
import type { Assignment, AssignmentStatus, Conflict, MinistryDetail, MinistryListItem, MinistryMember, MinistryRole } from "./types";

export async function photoUrls(supabase: DB, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (!list.length) return urls;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list, 3600);
  for (const r of data ?? []) if (r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  return urls;
}

const asRole = (v: string): MinistryRole => (v === "leader" || v === "co_leader" ? v : "member");
const asStatus = (v: string): AssignmentStatus => (v === "confirmed" || v === "declined" ? v : "assigned");

type Row = { id: string; name: string; meeting_day: string | null; meeting_time: string | null; roles: unknown; slots: unknown; service_id: string | null; services: { weekday: number | null; start_time: string | null } | null };

// Monta as fichas de vários ministérios de uma vez (a lista usa o mesmo caminho da ficha).
async function details(supabase: DB, orgId: string, rows: Row[], today: string): Promise<MinistryDetail[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [membersRes, asgRes] = await Promise.all([
    supabase
      .from("ministry_members")
      .select("ministry_id, stick_id, role, roles, sticks(full_name, email, user_id, phone, whatsapp, profile_photo)")
      .in("ministry_id", ids)
      .is("left_at", null),
    supabase
      .from("schedule_assignments")
      .select("id, ministry_id, assignment_date, service_time, role, stick_id, status, notified_at")
      .eq("org_id", orgId)
      .in("ministry_id", ids)
      .gte("assignment_date", addDays(today, -HISTORY_DAYS))
      .order("created_at"),
  ]);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (asgRes.error) throw new Error(asgRes.error.message);
  const urls = await photoUrls(supabase, (membersRes.data ?? []).map((m) => m.sticks?.profile_photo));

  return rows.map((r) => {
    const members: MinistryMember[] = (membersRes.data ?? [])
      .filter((m) => m.ministry_id === r.id)
      .map((m) => ({
        stickId: m.stick_id,
        name: m.sticks?.full_name ?? "",
        role: asRole(m.role),
        roles: m.roles ?? [],
        phone: m.sticks?.whatsapp || m.sticks?.phone || "",
        photoUrl: (m.sticks?.profile_photo && urls.get(m.sticks.profile_photo)) || null,
        access: accessOf(m.sticks),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const assignments: Assignment[] = (asgRes.data ?? [])
      .filter((a) => a.ministry_id === r.id && a.assignment_date && a.stick_id)
      .map((a) => ({
        id: a.id,
        date: a.assignment_date!,
        time: normTime(a.service_time),
        role: a.role ?? "",
        stickId: a.stick_id!,
        status: asStatus(a.status),
        notifiedAt: a.notified_at,
      }));
    const svc = r.service_id ? r.services : null;
    const day = svc ? (WEEKDAYS[svc.weekday ?? -1] ?? "") : r.meeting_day ?? "";
    const time = normTime(svc ? svc.start_time : r.meeting_time);
    return { id: r.id, name: r.name, serviceId: r.service_id, day, time, roles: readRoles(r.roles), slots: readSlots(r.slots), members, assignments };
  });
}

const COLS = "id, name, meeting_day, meeting_time, roles, slots, service_id, services(weekday, start_time)";

export async function listMinistries(supabase: DB, orgId: string, today = todayIso()): Promise<MinistryListItem[]> {
  const { data, error } = await supabase.from("ministries").select(COLS).eq("org_id", orgId).neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  const all = await details(supabase, orgId, data ?? [], today);
  return all.map((d) => listItemFromDetail(d, today)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Todas as fichas de uma vez (Encontros cruza as escalas de todos os ministérios com a semana).
export async function listMinistryDetails(supabase: DB, orgId: string, today = todayIso()): Promise<MinistryDetail[]> {
  const { data, error } = await supabase.from("ministries").select(COLS).eq("org_id", orgId).neq("status", "archived").order("name");
  if (error) throw new Error(error.message);
  return details(supabase, orgId, data ?? [], today);
}

export async function getMinistry(supabase: DB, orgId: string, id: string, today = todayIso()): Promise<MinistryDetail | null> {
  const { data, error } = await supabase.from("ministries").select(COLS).eq("org_id", orgId).eq("id", id).neq("status", "archived").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return (await details(supabase, orgId, [data], today))[0] ?? null;
}

// Pessoas escaladas em OUTROS ministérios no mesmo dia (só nome do ministério e função).
export async function getConflicts(supabase: DB, orgId: string, ministryId: string, date: string): Promise<Conflict[]> {
  const { data, error } = await supabase.rpc("schedule_conflicts", { p_org: orgId, p_date: date, p_ministry: ministryId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ stickId: c.stick_id, time: normTime(c.service_time), ministryName: c.ministry_name, role: c.role ?? "" }));
}

// Onde a pessoa serve (para a ficha de Pessoas): "Louvor (Vocal)".
export async function servesIn(supabase: DB, stickId: string): Promise<{ id: string; name: string; roles: string[] }[]> {
  const { data } = await supabase.from("ministry_members").select("ministry_id, roles, ministries(name, status)").eq("stick_id", stickId).is("left_at", null);
  return (data ?? [])
    .filter((m) => m.ministries && m.ministries.status !== "archived")
    .map((m) => ({ id: m.ministry_id, name: m.ministries!.name, roles: m.roles ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
