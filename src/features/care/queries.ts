// Consultas do Cuidado (spec 17). A RLS é a barreira: sem `care.view` volta [], e caso sigiloso só
// chega para o responsável, quem abriu e quem tem `care.manage` (m71). Notas e contatos não têm
// org_id: vêm por care_item_id dos itens que a RLS já deixou passar.
import type { DB } from "@/lib/auth/session";
import { photoUrls, recentSessions } from "@/features/groups/queries";
import { absenceStreak } from "@/features/groups/domain";
import { addDays as addDaysIso } from "@/features/ministries/domain";
import { careSuggestions, asContactKind, twoDeclines, VISITOR_MAX, VISITOR_MIN, type SuggestionInput } from "./domain";
import type { CareDetail, CareListItem, CareStatus, StaffOption, Suggestion, TimelineEntry } from "./types";

const STATUSES = new Set<CareStatus>(["new", "assigned", "in_progress", "waiting", "resolved", "closed"]);
const asStatus = (v: string | null): CareStatus => (v && STATUSES.has(v as CareStatus) ? (v as CareStatus) : "new");

// Nome de cada pessoa da equipe (auth.users → profiles: nome, e-mail ou "Alguém da equipe").
async function staffNames(supabase: DB, orgId: string): Promise<Map<string, string>> {
  const mem = await supabase.from("memberships").select("user_id").eq("org_id", orgId);
  const ids = (mem.data ?? []).map((m) => m.user_id);
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const prof = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  for (const p of prof.data ?? []) map.set(p.id, p.full_name || p.email || "Alguém da equipe");
  for (const id of ids) if (!map.has(id)) map.set(id, "Alguém da equipe");
  return map;
}

/** Quem pode ser responsável: o dono e quem tem alguma permissão (a "equipe"). */
export async function listStaff(supabase: DB, orgId: string): Promise<StaffOption[]> {
  const [mem, names] = await Promise.all([
    supabase.from("memberships").select("user_id, is_owner, permissions, roles(permissions)").eq("org_id", orgId),
    staffNames(supabase, orgId),
  ]);
  return (mem.data ?? [])
    .filter((m) => m.is_owner || m.permissions.length > 0 || (m.roles?.permissions?.length ?? 0) > 0)
    .map((m) => ({ id: m.user_id, name: names.get(m.user_id) ?? "Alguém da equipe" }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const ITEM_COLS = "id, stick_id, title, assigned_to, status, confidential, last_contact_on, next_action, due_date, created_by, created_at, sticks(full_name, phone, whatsapp, profile_photo)";
type ItemRow = {
  id: string;
  stick_id: string | null;
  title: string;
  assigned_to: string | null;
  status: string;
  confidential: boolean;
  last_contact_on: string | null;
  next_action: string | null;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  sticks: { full_name: string; phone: string | null; whatsapp: string | null; profile_photo: string | null } | null;
};

function toItem(r: ItemRow, names: Map<string, string>, urls: Map<string, string>): CareListItem {
  return {
    id: r.id,
    stickId: r.stick_id,
    name: r.sticks?.full_name ?? "Pessoa sem ficha",
    photoUrl: (r.sticks?.profile_photo && urls.get(r.sticks.profile_photo)) || null,
    phone: r.sticks?.whatsapp || r.sticks?.phone || "",
    reason: r.title,
    assignedTo: r.assigned_to,
    assignedName: (r.assigned_to && names.get(r.assigned_to)) || "",
    status: asStatus(r.status),
    confidential: r.confidential,
    lastContact: r.last_contact_on,
    nextStep: r.next_action ?? "",
    nextDate: r.due_date ?? "",
    createdBy: r.created_by,
    createdOn: r.created_at.slice(0, 10),
  };
}

export async function listCare(supabase: DB, orgId: string): Promise<CareListItem[]> {
  const [res, names] = await Promise.all([
    supabase.from("care_items").select(ITEM_COLS).eq("org_id", orgId).order("created_at", { ascending: false }),
    staffNames(supabase, orgId),
  ]);
  if (res.error) throw new Error(res.error.message);
  const rows = (res.data ?? []) as ItemRow[];
  const urls = await photoUrls(supabase, rows.map((r) => r.sticks?.profile_photo));
  return rows.map((r) => toItem(r, names, urls));
}

export async function getCare(supabase: DB, orgId: string, id: string): Promise<CareDetail | null> {
  const [res, names] = await Promise.all([
    supabase.from("care_items").select(ITEM_COLS).eq("org_id", orgId).eq("id", id).maybeSingle(),
    staffNames(supabase, orgId),
  ]);
  if (res.error) throw new Error(res.error.message);
  const r = res.data as ItemRow | null;
  if (!r) return null;
  const [urls, contacts, notes] = await Promise.all([
    photoUrls(supabase, [r.sticks?.profile_photo]),
    supabase.from("care_contacts").select("id, contacted_by, contacted_on, method, note, created_at").eq("care_item_id", id),
    supabase.from("care_notes").select("id, author_id, content, created_at").eq("care_item_id", id),
  ]);
  const by = (u: string | null) => (u && names.get(u)) || "";
  const timeline: TimelineEntry[] = [
    ...(contacts.data ?? []).map((c) => ({ id: c.id, kind: "contact" as const, method: asContactKind(c.method), text: c.note ?? "", at: `${c.contacted_on}T${c.created_at.slice(11)}`, byName: by(c.contacted_by) })),
    ...(notes.data ?? []).map((n) => ({ id: n.id, kind: "note" as const, method: "" as const, text: n.content, at: n.created_at, byName: by(n.author_id) })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { ...toItem(r, names, urls), timeline };
}

/** Caso aberto visível para quem olha (para a ficha da pessoa em Pessoas). */
export async function openCareFor(supabase: DB, orgId: string, stickId: string): Promise<{ id: string; assignedName: string } | null> {
  const { data } = await supabase
    .from("care_items")
    .select("id, assigned_to")
    .eq("org_id", orgId)
    .eq("stick_id", stickId)
    .in("status", ["new", "assigned", "in_progress", "waiting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const names = data.assigned_to ? await staffNames(supabase, orgId) : new Map<string, string>();
  return { id: data.id, assignedName: (data.assigned_to && names.get(data.assigned_to)) || "" };
}

// ── Sugestões ─────────────────────────────────────────────────────────────────────────────────
export async function listSuggestions(supabase: DB, orgId: string, today: string, open: Set<string>): Promise<Suggestion[]> {
  const [groupsRes, visitorsRes, schedRes, ministriesRes, overridesRes] = await Promise.all([
    supabase.from("groups").select("id, name").eq("org_id", orgId).eq("archived", false),
    supabase
      .from("sticks")
      .select("id, full_name, profile_photo, first_visit_date")
      .eq("org_id", orgId)
      .eq("archived", false)
      .in("relationship_status", ["visitor_first", "visitor_returning"])
      .gte("first_visit_date", addDaysIso(today, -VISITOR_MAX))
      .lte("first_visit_date", addDaysIso(today, -VISITOR_MIN)),
    supabase
      .from("schedule_assignments")
      .select("stick_id, ministry_id, assignment_date, status")
      .eq("org_id", orgId)
      .not("stick_id", "is", null)
      .not("ministry_id", "is", null)
      .gte("assignment_date", addDaysIso(today, -90))
      .lte("assignment_date", addDaysIso(today, 30)),
    supabase.from("ministries").select("id, name").eq("org_id", orgId),
    supabase.from("signal_overrides").select("signal_key").eq("org_id", orgId).eq("status", "dismissed").like("signal_key", "care:%"),
  ]);

  const groups = groupsRes.data ?? [];
  const [sessions, membersRes] = await Promise.all([
    recentSessions(supabase, orgId, groups.map((g) => g.id)),
    groups.length ? supabase.from("group_members").select("group_id, stick_id, joined_at").in("group_id", groups.map((g) => g.id)).is("left_at", null) : Promise.resolve({ data: [] as { group_id: string; stick_id: string; joined_at: string }[] }),
  ]);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const absent: { stickId: string; group: string; streak: number; lastSession: string }[] = [];
  for (const m of membersRes.data ?? []) {
    const list = sessions.get(m.group_id) ?? [];
    const streak = absenceStreak(m.stick_id, list, m.joined_at);
    const last = list.find((s) => !s.cancelled)?.date;
    if (streak >= 3 && last) absent.push({ stickId: m.stick_id, group: groupName.get(m.group_id) ?? "", streak, lastSession: last });
  }

  const ministryName = new Map((ministriesRes.data ?? []).map((m) => [m.id, m.name]));
  const byPair = new Map<string, { stickId: string; ministry: string; list: { date: string; status: string }[] }>();
  for (const s of schedRes.data ?? []) {
    if (!s.stick_id || !s.assignment_date) continue;
    const k = `${s.stick_id}|${s.ministry_id}`;
    const cur = byPair.get(k) ?? byPair.set(k, { stickId: s.stick_id, ministry: (s.ministry_id && ministryName.get(s.ministry_id)) || "", list: [] }).get(k)!;
    cur.list.push({ date: s.assignment_date, status: s.status });
  }
  const declines: { stickId: string; ministry: string; lastDate: string }[] = [];
  for (const p of byPair.values()) {
    const d = twoDeclines(p.list);
    if (d) declines.push({ stickId: p.stickId, ministry: p.ministry, lastDate: d });
  }

  const ids = [...new Set([...absent.map((a) => a.stickId), ...declines.map((d) => d.stickId)])];
  const people = ids.length ? (await supabase.from("sticks").select("id, full_name, profile_photo, archived").in("id", ids)).data ?? [] : [];
  const visitors = visitorsRes.data ?? [];
  const urls = await photoUrls(supabase, [...people.map((p) => p.profile_photo), ...visitors.map((v) => v.profile_photo)]);
  const face = new Map(people.filter((p) => !p.archived).map((p) => [p.id, { name: p.full_name, photoUrl: (p.profile_photo && urls.get(p.profile_photo)) || null }]));

  const input: SuggestionInput = {
    absences: absent.flatMap((a) => (face.has(a.stickId) ? [{ ...a, ...face.get(a.stickId)! }] : [])),
    visitors: visitors.flatMap((v) => (v.first_visit_date ? [{ stickId: v.id, name: v.full_name, photoUrl: (v.profile_photo && urls.get(v.profile_photo)) || null, firstVisit: v.first_visit_date }] : [])),
    declines: declines.flatMap((d) => (face.has(d.stickId) ? [{ ...d, ...face.get(d.stickId)! }] : [])),
  };
  return careSuggestions(input, open, new Set((overridesRes.data ?? []).map((o) => o.signal_key)), today);
}
