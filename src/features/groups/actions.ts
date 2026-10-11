"use server";

// Server Actions de Células (spec 14). Cada uma: confere sessão/org e permissão no servidor,
// valida a entrada, grava no Supabase (o RLS é a barreira real) e devolve um resultado simples.
// Mudar célula, membros e liderança exige groups.manage_all; marcar presença o RLS libera
// também para quem lidera a célula.
import { requireOrg, can, type DB, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { canonicalDay, isIso, parseTime, todayIso, type CellRole } from "./domain";
import { getCell } from "./queries";
import type { CellDetail } from "./types";

const DENIED = "Você não tem permissão para gerenciar células.";
const ROLES: readonly string[] = ["leader", "co_leader", "host", "member"];
const CELL_FIELDS = ["name", "day", "time", "location"] as const;

async function managerOrg(): Promise<{ ctx: OrgContext } | { error: ActionResult<never> }> {
  const ctx = await requireOrg();
  return can(ctx, "groups.manage_all") ? { ctx } : { error: fail(DENIED) };
}

async function ownGroup(supabase: DB, orgId: string, id: string): Promise<{ id: string; campus_id: string | null } | null> {
  const { data } = await supabase.from("groups").select("id, campus_id").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data;
}

// Cria a célula só com o nome provisório (a tela abre no Editar, com o foco no nome).
export async function createCellAction(): Promise<ActionResult<{ id: string }>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const { data, error } = await supabase.from("groups").insert({ org_id: orgId, name: "Nova célula" }).select("id").single();
  if (error || !data) return fail(toMessage(error, "Não consegui criar a célula."));
  return ok({ id: data.id });
}

// Salva UM campo da célula; devolve o texto canônico (ex.: "20:00") para a tela mostrar.
export async function updateCellFieldAction(id: string, field: string, raw: string): Promise<ActionResult<{ text: string }>> {
  if (!(CELL_FIELDS as readonly string[]).includes(field)) return fail("Campo inválido.");
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;

  let text = raw.trim();
  if (field === "name") {
    if (!text) return fail("Dê um nome à célula.");
    if (text.length > 80) return fail("Nome grande demais (até 80 letras).");
  } else if (field === "day") {
    text = canonicalDay(text);
    if (raw.trim() && !text) return fail("Dia inválido.");
  } else if (field === "time") {
    const t = parseTime(text);
    if (t === null) return fail("Horário inválido. Ex.: 20:00");
    text = t;
  } else if (text.length > 200) return fail("Texto grande demais (até 200 letras).");

  const value = text || null;
  const patch = field === "name" ? { name: text } : field === "day" ? { meeting_day: value } : field === "time" ? { meeting_time: value } : { location: value };
  const { data, error } = await supabase.from("groups").update(patch).eq("org_id", orgId).eq("id", id).select("id").maybeSingle();
  if (error) return fail(toMessage(error));
  if (!data) return fail("Célula não encontrada.");
  return ok({ text });
}

// Supervisor (uma pessoa de Pessoas) ou nenhum.
export async function setSupervisorAction(id: string, stickId: string | null): Promise<ActionResult<CellDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  if (stickId) {
    const { data } = await supabase.from("sticks").select("id").eq("org_id", orgId).eq("id", stickId).maybeSingle();
    if (!data) return fail("Pessoa não encontrada.");
  }
  const { error } = await supabase.from("groups").update({ supervisor_stick_id: stickId }).eq("org_id", orgId).eq("id", id);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

async function fresh(ctx: OrgContext, id: string): Promise<ActionResult<CellDetail>> {
  const detail = await getCell(ctx.supabase, ctx.orgId, id);
  return detail ? ok(detail) : fail("Célula não encontrada.");
}

// Põe pessoas na célula. Uma célula ativa por pessoa: a anterior fecha (left_at = hoje) e fica no histórico.
export async function addMembersAction(id: string, stickIds: string[]): Promise<ActionResult<CellDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const ids = [...new Set(stickIds)].filter(Boolean);
  if (!ids.length) return fresh(g.ctx, id);
  try {
    if (!(await ownGroup(supabase, orgId, id))) return fail("Célula não encontrada.");
    const { data: valid } = await supabase.from("sticks").select("id").eq("org_id", orgId).in("id", ids);
    const okIds = (valid ?? []).map((s) => s.id);
    if (!okIds.length) return fail("Pessoa não encontrada.");
    const day = todayIso();

    const left = await supabase.from("group_members").update({ left_at: day, status: "left" }).in("stick_id", okIds).is("left_at", null).neq("group_id", id);
    if (left.error) return fail(toMessage(left.error));

    // Quem já está nesta célula fica como está; quem voltou de uma saída antiga entra de novo (histórico antigo é substituído).
    const { data: here } = await supabase.from("group_members").select("stick_id").eq("group_id", id).is("left_at", null).in("stick_id", okIds);
    const already = new Set((here ?? []).map((m) => m.stick_id));
    const rows = okIds.filter((s) => !already.has(s)).map((stick_id) => ({ group_id: id, stick_id, role: "member" as const, status: "active", joined_at: day, left_at: null }));
    if (rows.length) {
      const up = await supabase.from("group_members").upsert(rows, { onConflict: "group_id,stick_id" });
      if (up.error) return fail(toMessage(up.error));
    }
  } catch (e) {
    return fail(toMessage(e));
  }
  return fresh(g.ctx, id);
}

export async function setMemberRoleAction(id: string, stickId: string, role: string): Promise<ActionResult<CellDetail>> {
  if (!ROLES.includes(role)) return fail("Papel inválido.");
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("group_members").update({ role: role as CellRole }).eq("group_id", id).eq("stick_id", stickId).is("left_at", null);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

export async function removeMemberAction(id: string, stickId: string): Promise<ActionResult<CellDetail>> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("group_members").update({ left_at: todayIso(), status: "left" }).eq("group_id", id).eq("stick_id", stickId).is("left_at", null);
  if (error) return fail(toMessage(error));
  return fresh(g.ctx, id);
}

export async function setCellArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const g = await managerOrg();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("groups").update({ archived }).eq("org_id", g.ctx.orgId).eq("id", id);
  return error ? fail(toMessage(error)) : ok(undefined);
}

// Grava o encontro de um dia: um por célula por dia (reabrir o dia edita o mesmo). Troca as
// presenças (só quem veio); "não teve encontro" grava cancelled sem presenças.
export async function saveAttendanceAction(id: string, date: string, stickIds: string[], cancelled: boolean): Promise<ActionResult<CellDetail>> {
  if (!isIso(date) || date > todayIso(new Date(Date.now() + 86_400_000))) return fail("Data inválida.");
  const ctx = await requireOrg();
  const { supabase, orgId, user } = ctx;
  try {
    const group = await ownGroup(supabase, orgId, id);
    if (!group) return fail("Célula não encontrada.");

    let sessionId: string | null = null;
    for (let attempt = 0; attempt < 2 && !sessionId; attempt++) {
      const found = await supabase.from("attendance_sessions").select("id").eq("org_id", orgId).eq("context_type", "group").eq("context_id", id).eq("session_date", date).maybeSingle();
      if (found.data) {
        const upd = await supabase.from("attendance_sessions").update({ cancelled }).eq("id", found.data.id);
        if (upd.error) return fail(toMessage(upd.error));
        sessionId = found.data.id;
      } else {
        const ins = await supabase
          .from("attendance_sessions")
          .insert({ org_id: orgId, context_type: "group", context_id: id, campus_id: group.campus_id, session_date: date, cancelled, created_by: user.id })
          .select("id")
          .single();
        if (ins.data) sessionId = ins.data.id;
        else if (ins.error?.code !== "23505") return fail(toMessage(ins.error, "Não consegui salvar o encontro."));
      }
    }
    if (!sessionId) return fail("Não consegui salvar o encontro.");

    // Quem a tela lista é a célula inteira: se o dia é anterior à entrada de alguém, ele já fazia parte
    // (senão "12 de 15" e as faltas seguidas ignorariam esse encontro). Só quem gerencia pode mexer na entrada.
    if (!cancelled) await supabase.from("group_members").update({ joined_at: date }).eq("group_id", id).is("left_at", null).gt("joined_at", date);

    const del = await supabase.from("attendance_records").delete().eq("session_id", sessionId);
    if (del.error) return fail(toMessage(del.error));
    if (!cancelled && stickIds.length) {
      const { data: members } = await supabase.from("group_members").select("stick_id").eq("group_id", id).is("left_at", null).in("stick_id", stickIds);
      const rows = (members ?? []).map((m) => ({ session_id: sessionId, stick_id: m.stick_id, status: "present" as const, source: "checkin" }));
      if (rows.length) {
        const ins = await supabase.from("attendance_records").insert(rows);
        if (ins.error) return fail(toMessage(ins.error));
      }
    }
  } catch (e) {
    return fail(toMessage(e));
  }
  return fresh(ctx, id);
}
