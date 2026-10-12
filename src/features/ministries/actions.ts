"use server";

// Server Actions de Ministérios (spec 15). Mudar o ministério (nome, culto padrão, funções, quem serve)
// exige ministries.manage_all; mexer na escala o RLS libera também para quem lidera o ministério.
import { requireOrg, can, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { canonicalDay, isIso, parseTime, todayIso } from "@/features/groups/domain";
import { cleanRole, normTime } from "./domain";
import { getMinistry } from "./queries";
import type { Assignment, AssignmentStatus, MinistryDetail } from "./types";

const DENIED = "Você não tem permissão para gerenciar ministérios.";
const FIELDS = ["name", "day", "time"] as const;

async function managerOrg(): Promise<{ ctx: OrgContext } | { error: ActionResult<never> }> {
  const ctx = await requireOrg();
  return can(ctx, "ministries.manage_all") ? { ctx } : { error: fail(DENIED) };
}
async function fresh(ctx: OrgContext, id: string): Promise<ActionResult<MinistryDetail>> {
  const d = await getMinistry(ctx.supabase, ctx.orgId, id);
  return d ? ok(d) : fail("Ministério não encontrado.");
}

export async function createMinistryAction(): Promise<ActionResult<{ id: string }>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { data, error } = await g.ctx.supabase.from("ministries").insert({ org_id: g.ctx.orgId, name: "Novo ministério" }).select("id").single();
  if (error || !data) return fail(toMessage(error, "Não consegui criar o ministério."));
  return ok({ id: data.id });
}

export async function updateMinistryFieldAction(id: string, field: string, raw: string): Promise<ActionResult<{ text: string }>> {
  if (!(FIELDS as readonly string[]).includes(field)) return fail("Campo inválido.");
  const g = await managerOrg();
  if ("error" in g) return g.error;
  let text = raw.trim();
  if (field === "name") {
    if (!text) return fail("Dê um nome ao ministério.");
    if (text.length > 80) return fail("Nome grande demais (até 80 letras).");
  } else if (field === "day") {
    text = canonicalDay(text);
    if (raw.trim() && !text) return fail("Dia inválido.");
  } else {
    const t = parseTime(text);
    if (t === null) return fail("Horário inválido. Ex.: 19:00");
    text = t;
  }
  const patch = field === "name" ? { name: text } : field === "day" ? { meeting_day: text || null } : { meeting_time: text || null };
  const { data, error } = await g.ctx.supabase.from("ministries").update(patch).eq("org_id", g.ctx.orgId).eq("id", id).select("id").maybeSingle();
  if (error) return fail(toMessage(error));
  if (!data) return fail("Ministério não encontrado.");
  return ok({ text });
}

// Culto da igreja do ministério (spec 16, D1). null = "Outro dia e horário" (usa os campos próprios).
export async function setMinistryServiceAction(id: string, serviceId: string | null): Promise<ActionResult<MinistryDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  if (serviceId) {
    const { data } = await supabase.from("services").select("id").eq("org_id", orgId).eq("id", serviceId).maybeSingle();
    if (!data) return fail("Culto não encontrado.");
  }
  const { error } = await supabase.from("ministries").update({ service_id: serviceId }).eq("org_id", orgId).eq("id", id);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

// Funções e vagas por função (substitui as duas listas de uma vez).
export async function setRolesAction(id: string, roles: string[], slots: Record<string, number>): Promise<ActionResult<MinistryDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const clean = [...new Set(roles.map(cleanRole).filter(Boolean))].slice(0, 30);
  const s: Record<string, number> = {};
  for (const r of clean) {
    const n = Math.floor(slots[r] ?? 1);
    if (n > 1) s[r] = Math.min(20, n);
  }
  const { error } = await g.ctx.supabase.from("ministries").update({ roles: clean, slots: s }).eq("org_id", g.ctx.orgId).eq("id", id);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

export async function addMinistryMembersAction(id: string, stickIds: string[]): Promise<ActionResult<MinistryDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const ids = [...new Set(stickIds)].filter(Boolean);
  if (!ids.length) return fresh(g.ctx, id);
  const { data: valid } = await supabase.from("sticks").select("id").eq("org_id", orgId).in("id", ids);
  const { data: here } = await supabase.from("ministry_members").select("stick_id").eq("ministry_id", id).is("left_at", null);
  const already = new Set((here ?? []).map((m) => m.stick_id));
  const rows = (valid ?? []).filter((s) => !already.has(s.id)).map((s) => ({ org_id: orgId, ministry_id: id, stick_id: s.id, joined_at: todayIso() }));
  if (rows.length) {
    const { error } = await supabase.from("ministry_members").insert(rows);
    if (error) return fail(toMessage(error));
  }
  return fresh(g.ctx, id);
}

export async function setMemberFunctionsAction(id: string, stickId: string, roles: string[]): Promise<ActionResult<MinistryDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const clean = [...new Set(roles.map(cleanRole).filter(Boolean))];
  const { error } = await g.ctx.supabase.from("ministry_members").update({ roles: clean }).eq("ministry_id", id).eq("stick_id", stickId).is("left_at", null);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

export async function setMemberRoleAction(id: string, stickId: string, role: string): Promise<ActionResult<MinistryDetail>> {
  if (!["leader", "co_leader", "member"].includes(role)) return fail("Papel inválido.");
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("ministry_members").update({ role }).eq("ministry_id", id).eq("stick_id", stickId).is("left_at", null);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

export async function removeMinistryMemberAction(id: string, stickId: string): Promise<ActionResult<MinistryDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("ministry_members").update({ left_at: todayIso() }).eq("ministry_id", id).eq("stick_id", stickId).is("left_at", null);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

export async function archiveMinistryAction(id: string): Promise<ActionResult> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("ministries").update({ status: "archived" }).eq("org_id", g.ctx.orgId).eq("id", id);
  return error ? fail(toMessage(error)) : ok(undefined);
}

// ---- Escala (equipe ou líder do ministério; o RLS é a barreira) ---------------------------------
const SEL = "id, assignment_date, service_time, role, stick_id, status, notified_at";
type AsgRow = { id: string; assignment_date: string | null; service_time: string | null; role: string | null; stick_id: string | null; status: string; notified_at: string | null };
const toAsg = (a: AsgRow): Assignment => ({
  id: a.id,
  date: a.assignment_date ?? "",
  time: normTime(a.service_time),
  role: a.role ?? "",
  stickId: a.stick_id ?? "",
  status: a.status === "confirmed" || a.status === "declined" ? a.status : "assigned",
  notifiedAt: a.notified_at,
});

function validService(date: string, time: string): string | null {
  if (!isIso(date)) return "Data inválida.";
  if (time && parseTime(time) !== time) return "Horário inválido.";
  return null;
}

async function memberOf(ctx: OrgContext, ministryId: string, stickId: string): Promise<boolean> {
  const { data } = await ctx.supabase.from("ministry_members").select("id").eq("ministry_id", ministryId).eq("stick_id", stickId).is("left_at", null).maybeSingle();
  return Boolean(data);
}

export async function assignAction(ministryId: string, date: string, time: string, role: string, stickId: string): Promise<ActionResult<Assignment>> {
  const bad = validService(date, time);
  if (bad) return fail(bad);
  const ctx = await requireOrg();
  if (!(await memberOf(ctx, ministryId, stickId))) return fail("Essa pessoa não serve neste ministério.");
  const { data, error } = await ctx.supabase
    .from("schedule_assignments")
    .insert({ org_id: ctx.orgId, ministry_id: ministryId, assignment_date: date, service_time: time || null, role: cleanRole(role) || null, stick_id: stickId })
    .select(SEL)
    .single();
  if (error || !data) return fail(toMessage(error, "Não deu para salvar. Tente de novo."));
  return ok(toAsg(data));
}

// Várias de uma vez ("Repetir a escala anterior"); devolve as criadas (para o Desfazer).
export async function assignManyAction(ministryId: string, date: string, time: string, items: { role: string; stickId: string }[]): Promise<ActionResult<Assignment[]>> {
  const bad = validService(date, time);
  if (bad) return fail(bad);
  const ctx = await requireOrg();
  if (!items.length) return ok([]);
  const rows = items.slice(0, 60).map((i) => ({ org_id: ctx.orgId, ministry_id: ministryId, assignment_date: date, service_time: time || null, role: cleanRole(i.role) || null, stick_id: i.stickId }));
  const { data, error } = await ctx.supabase.from("schedule_assignments").insert(rows).select(SEL);
  if (error) return fail(toMessage(error, "Não deu para salvar. Tente de novo."));
  return ok((data ?? []).map(toAsg));
}

export async function removeAssignmentsAction(ids: string[]): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (!ids.length) return ok(undefined);
  const { error } = await ctx.supabase.from("schedule_assignments").delete().eq("org_id", ctx.orgId).in("id", ids);
  return error ? fail(toMessage(error, "Não deu para salvar. Tente de novo.")) : ok(undefined);
}

export async function setAssignmentStatusAction(id: string, status: AssignmentStatus): Promise<ActionResult<Assignment>> {
  if (!["assigned", "confirmed", "declined"].includes(status)) return fail("Situação inválida.");
  const ctx = await requireOrg();
  const { data, error } = await ctx.supabase
    .from("schedule_assignments")
    .update({ status, confirmed_at: status === "confirmed" ? new Date().toISOString() : null })
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .select(SEL)
    .maybeSingle();
  if (error || !data) return fail(toMessage(error, "Não deu para salvar. Tente de novo."));
  return ok(toAsg(data));
}

export async function markNotifiedAction(id: string): Promise<ActionResult<Assignment>> {
  const ctx = await requireOrg();
  const { data, error } = await ctx.supabase.from("schedule_assignments").update({ notified_at: new Date().toISOString() }).eq("org_id", ctx.orgId).eq("id", id).select(SEL).maybeSingle();
  if (error || !data) return fail(toMessage(error, "Não deu para salvar. Tente de novo."));
  return ok(toAsg(data));
}
