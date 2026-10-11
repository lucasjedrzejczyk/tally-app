// Consultas de Grupos. Resolve líder (group_members role='leader') e os contadores
// de novos/saídas (≤30 dias) a partir de group_members — sem depender do blob.
import type { DB } from "@/lib/auth/session";
import { absenceStreak, missingFlag, wasMember, type CellRole, type CellSession, type Group } from "./domain";
import type { CellDetail, CellListItem, CellMember, DaySession } from "./types";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function listGroups(supabase: DB, orgId: string): Promise<Group[]> {
  const [groupsRes, campusRes, membersRes, sticksRes] = await Promise.all([
    supabase.from("groups").select("id, name, campus_id, meeting_day, meeting_time").eq("org_id", orgId).eq("archived", false),
    supabase.from("campuses").select("id, name").eq("org_id", orgId),
    supabase.from("group_members").select("group_id, stick_id, role, status, joined_at, left_at"),
    supabase.from("sticks").select("id, full_name").eq("org_id", orgId),
  ]);

  if (groupsRes.error) throw new Error(groupsRes.error.message);

  const campusById = new Map<string, string>();
  for (const c of campusRes.data ?? []) campusById.set(c.id, c.name);
  const nameById = new Map<string, string>();
  for (const s of sticksRes.data ?? []) nameById.set(s.id, s.full_name);

  const nowMs = Date.now();
  const members = membersRes.data ?? [];

  return (groupsRes.data ?? []).map((g): Group => {
    const gm = members.filter((m) => m.group_id === g.id);
    const leaderRow = gm.find((m) => m.role === "leader" && m.status === "active");
    const newMembers = gm.filter((m) => m.status === "active" && m.joined_at && nowMs - new Date(m.joined_at).getTime() <= THIRTY_DAYS).length;
    const leftRecently = gm.filter((m) => m.left_at && nowMs - new Date(m.left_at).getTime() <= THIRTY_DAYS).length;
    return {
      id: g.id,
      name: g.name,
      campus: (g.campus_id && campusById.get(g.campus_id)) || "",
      leader: (leaderRow && nameById.get(leaderRow.stick_id)) || "",
      day: g.meeting_day ?? "",
      time: g.meeting_time ?? "",
      newMembers,
      leftRecently,
    };
  });
}

// ---- Células (spec 14) -------------------------------------------------------------------
const KEEP_SESSIONS = 12; // encontros recentes por célula (a ficha mostra 8; a sequência de faltas usa todos)
const CHUNK = 80;

const asRole = (v: string): CellRole => (v === "leader" || v === "co_leader" || v === "host" ? v : "member");

// Encontros recentes (com quem veio) de cada célula, recentes primeiro. Cancelado = "não teve encontro".
async function recentSessions(supabase: DB, orgId: string, groupIds: string[]): Promise<Map<string, CellSession[]>> {
  const out = new Map<string, CellSession[]>();
  if (!groupIds.length) return out;
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("id, context_id, session_date, cancelled")
    .eq("org_id", orgId)
    .eq("context_type", "group")
    .in("context_id", groupIds)
    .order("session_date", { ascending: false });
  if (error) throw new Error(error.message);

  const kept: { id: string; group: string; date: string; cancelled: boolean }[] = [];
  const seen = new Map<string, number>();
  for (const r of data ?? []) {
    if (!r.context_id) continue;
    const n = seen.get(r.context_id) ?? 0;
    if (n >= KEEP_SESSIONS) continue;
    seen.set(r.context_id, n + 1);
    kept.push({ id: r.id, group: r.context_id, date: r.session_date, cancelled: r.cancelled });
  }

  const present = new Map<string, string[]>();
  for (let i = 0; i < kept.length; i += CHUNK) {
    const ids = kept.slice(i, i + CHUNK).map((k) => k.id);
    const { data: recs, error: rErr } = await supabase.from("attendance_records").select("session_id, stick_id").in("session_id", ids).eq("status", "present");
    if (rErr) throw new Error(rErr.message);
    for (const r of recs ?? []) present.set(r.session_id, [...(present.get(r.session_id) ?? []), r.stick_id]);
  }
  for (const k of kept) out.set(k.group, [...(out.get(k.group) ?? []), { date: k.date, cancelled: k.cancelled, presentIds: present.get(k.id) ?? [] }]);
  return out;
}

// Lista de células da org (não arquivadas), em ordem alfabética.
export async function listCells(supabase: DB, orgId: string): Promise<CellListItem[]> {
  const [groupsRes, membersRes, sticksRes] = await Promise.all([
    supabase.from("groups").select("id, name, meeting_day, meeting_time, location, supervisor_stick_id").eq("org_id", orgId).eq("archived", false).order("name"),
    supabase.from("group_members").select("group_id, stick_id, role, joined_at").is("left_at", null),
    supabase.from("sticks").select("id, full_name").eq("org_id", orgId),
  ]);
  if (groupsRes.error) throw new Error(groupsRes.error.message);
  const groups = groupsRes.data ?? [];
  const nameOf = new Map((sticksRes.data ?? []).map((s) => [s.id, s.full_name]));
  const sessions = await recentSessions(supabase, orgId, groups.map((g) => g.id));

  return groups
    .map((g): CellListItem => {
      const members = (membersRes.data ?? []).filter((m) => m.group_id === g.id);
      const list = sessions.get(g.id) ?? [];
      const leader = members.find((m) => m.role === "leader");
      return {
        id: g.id,
        name: g.name,
        day: g.meeting_day ?? "",
        time: g.meeting_time ?? "",
        location: g.location ?? "",
        supervisorId: g.supervisor_stick_id,
        supervisorName: (g.supervisor_stick_id && nameOf.get(g.supervisor_stick_id)) || "",
        leaderName: (leader && nameOf.get(leader.stick_id)) || "",
        memberCount: members.length,
        lastSession: list[0]?.date ?? null,
        missing: members.filter((m) => missingFlag(absenceStreak(m.stick_id, list, m.joined_at))).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Ficha da célula: membros ativos (com última presença e faltas seguidas) e os 8 últimos encontros.
export async function getCell(supabase: DB, orgId: string, id: string): Promise<CellDetail | null> {
  const { data: g, error } = await supabase
    .from("groups")
    .select("id, name, meeting_day, meeting_time, location, archived, supervisor_stick_id")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!g) return null;

  const [membersRes, sessions] = await Promise.all([
    supabase.from("group_members").select("stick_id, role, joined_at, left_at, sticks(full_name)").eq("group_id", id),
    recentSessions(supabase, orgId, [id]),
  ]);
  const list = sessions.get(id) ?? [];
  const all = membersRes.data ?? [];

  const members: CellMember[] = all
    .filter((m) => !m.left_at)
    .map((m) => ({
      stickId: m.stick_id,
      name: m.sticks?.full_name ?? "",
      role: asRole(m.role),
      joinedAt: m.joined_at,
      lastPresent: list.find((s) => !s.cancelled && s.presentIds.includes(m.stick_id))?.date ?? null,
      streak: absenceStreak(m.stick_id, list, m.joined_at),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  let supervisor: CellDetail["supervisor"] = null;
  if (g.supervisor_stick_id) {
    const { data: s } = await supabase.from("sticks").select("id, full_name").eq("id", g.supervisor_stick_id).maybeSingle();
    if (s) supervisor = { id: s.id, name: s.full_name };
  }

  return {
    id: g.id,
    name: g.name,
    day: g.meeting_day ?? "",
    time: g.meeting_time ?? "",
    location: g.location ?? "",
    archived: g.archived,
    supervisor,
    members,
    sessions: list.slice(0, 8).map((s) => ({
      date: s.date,
      cancelled: s.cancelled,
      present: s.presentIds.length,
      of: all.filter((m) => s.presentIds.includes(m.stick_id) || wasMember({ joinedAt: m.joined_at, leftAt: m.left_at }, s.date)).length,
    })),
  };
}

// O encontro de um dia (para o Marcar presença abrir já com as marcações dele).
export async function getDaySession(supabase: DB, orgId: string, groupId: string, date: string): Promise<DaySession> {
  const { data: s } = await supabase
    .from("attendance_sessions")
    .select("id, cancelled")
    .eq("org_id", orgId)
    .eq("context_type", "group")
    .eq("context_id", groupId)
    .eq("session_date", date)
    .maybeSingle();
  if (!s) return { exists: false, cancelled: false, presentIds: [] };
  const { data: recs } = await supabase.from("attendance_records").select("stick_id").eq("session_id", s.id).eq("status", "present");
  return { exists: true, cancelled: s.cancelled, presentIds: (recs ?? []).map((r) => r.stick_id) };
}
