"use server";

// Ações do Cuidado (spec 17). A RLS é a barreira (care.view, sigilo por caso, care.manage para
// apagar); `can` aqui só troca o erro cru por uma frase. Toda ação que muda o caso devolve a ficha nova.
import { revalidatePath } from "next/cache";
import { requireOrg, can, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { todayIso } from "@/features/groups/domain";
import { asContactKind, GROUP_STATUS } from "./domain";
import { getCare } from "./queries";
import type { Database } from "@/lib/database.types";
import type { CareDetail, StatusGroup } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_PERM = "Você não tem acesso ao Cuidado.";
const FAIL = "Não deu para salvar. Tente de novo.";
const TEXT_MAX = 2000;

async function viewer(): Promise<OrgContext | null> {
  const ctx = await requireOrg();
  return can(ctx, "care.view") ? ctx : null;
}
async function fresh(ctx: OrgContext, id: string): Promise<ActionResult<CareDetail>> {
  const d = await getCare(ctx.supabase, ctx.orgId, id);
  revalidatePath("/care");
  return d ? ok(d) : fail("Este acompanhamento não está mais disponível.");
}

/** Novo acompanhamento de uma pessoa (de uma sugestão já vem o motivo). Quem abre fica responsável. */
export async function createCareAction(stickId: string, reason: string): Promise<ActionResult<CareDetail>> {
  if (!UUID.test(stickId)) return fail("Escolha uma pessoa.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { data, error } = await ctx.supabase
    .from("care_items")
    .insert({ org_id: ctx.orgId, stick_id: stickId, title: reason.trim().slice(0, 200), assigned_to: ctx.user.id, status: "in_progress", created_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !data) return fail(toMessage(error, FAIL));
  return fresh(ctx, data.id);
}

export type CareField = "reason" | "nextStep" | "nextDate" | "assignedTo" | "confidential";

export async function updateCareFieldAction(id: string, field: CareField, raw: string): Promise<ActionResult<CareDetail>> {
  if (!UUID.test(id)) return fail("Acompanhamento inválido.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const v = raw.trim();
  let patch: Database["public"]["Tables"]["care_items"]["Update"];
  if (field === "reason") patch = { title: v.slice(0, 200) };
  else if (field === "nextStep") patch = { next_action: v.slice(0, 200) || null };
  else if (field === "nextDate") {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail("Data inválida.");
    patch = { due_date: v || null };
  } else if (field === "assignedTo") {
    if (v && !UUID.test(v)) return fail("Responsável inválido.");
    patch = { assigned_to: v || null };
  } else patch = { confidential: v === "1" };
  const { error } = await ctx.supabase.from("care_items").update(patch).eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  return fresh(ctx, id);
}

export async function setCareStatusAction(id: string, group: StatusGroup): Promise<ActionResult<CareDetail>> {
  if (!UUID.test(id) || !(group in GROUP_STATUS)) return fail("Acompanhamento inválido.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase
    .from("care_items")
    .update({ status: GROUP_STATUS[group], resolved_at: group === "done" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  return fresh(ctx, id);
}

/** Registra um contato de hoje e atualiza o "último contato" do caso. */
export async function addContactAction(id: string, method: string, note: string): Promise<ActionResult<CareDetail>> {
  if (!UUID.test(id)) return fail("Acompanhamento inválido.");
  const kind = asContactKind(method);
  if (!kind) return fail("Escolha o tipo de contato.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const today = todayIso();
  const { data: item } = await ctx.supabase.from("care_items").select("stick_id").eq("id", id).maybeSingle();
  if (!item) return fail("Este acompanhamento não está mais disponível.");
  const { error } = await ctx.supabase
    .from("care_contacts")
    .insert({ care_item_id: id, stick_id: item.stick_id, contacted_by: ctx.user.id, contacted_on: today, method: kind, note: note.trim().slice(0, TEXT_MAX) || null });
  if (error) return fail(toMessage(error, FAIL));
  await ctx.supabase.from("care_items").update({ last_contact_on: today }).eq("id", id);
  return fresh(ctx, id);
}

export async function addNoteAction(id: string, text: string): Promise<ActionResult<CareDetail>> {
  if (!UUID.test(id)) return fail("Acompanhamento inválido.");
  const content = text.trim().slice(0, TEXT_MAX);
  if (!content) return fail("Escreva a nota.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase.from("care_notes").insert({ care_item_id: id, author_id: ctx.user.id, visibility: "care_team", content });
  if (error) return fail(toMessage(error, FAIL));
  return fresh(ctx, id);
}

export async function deleteCareAction(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Acompanhamento inválido.");
  const ctx = await requireOrg();
  if (!can(ctx, "care.manage")) return fail("Só quem gerencia o Cuidado pode excluir.");
  const { error } = await ctx.supabase.from("care_items").delete().eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/care");
  return ok(null);
}

/** Dispensa (ou traz de volta) uma sugestão. A chave muda quando o fato muda, aí ela volta sozinha. */
export async function dismissSuggestionAction(key: string, on: boolean): Promise<ActionResult<null>> {
  if (!/^care:[a-z]+:[0-9a-f-]{36}:[\d-]{10}$/.test(key)) return fail("Sugestão inválida.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const q = on
    ? ctx.supabase.from("signal_overrides").upsert({ org_id: ctx.orgId, signal_key: key, status: "dismissed", updated_at: new Date().toISOString() }, { onConflict: "org_id,signal_key" })
    : ctx.supabase.from("signal_overrides").delete().eq("org_id", ctx.orgId).eq("signal_key", key);
  const { error } = await q;
  return error ? fail(toMessage(error, FAIL)) : ok(null);
}
