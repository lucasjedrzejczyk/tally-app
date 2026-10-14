"use server";

// Ações de Formulários (spec 19). A RLS é a barreira (forms.manage); `can` aqui só troca o erro
// cru por uma frase. O envio público passa pelo RPC submit_form, que valida tudo de novo no banco.
import { revalidatePath } from "next/cache";
import { requireOrg, can, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { canEditPeople } from "@/features/sticks/access";
import { positionForJourneyCode } from "@/features/sticks/domain";
import { cleanFields, INTRO_MAX, NAME_MAX, PHONE_MAX, phoneKey, TEMPLATES, TITLE_MAX, type Answers, type FormField } from "./domain";
import { getForm, type FormDetail } from "./queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_PERM = "Você não tem acesso aos Formulários.";
const FAIL = "Não deu para salvar. Tente de novo.";

async function manager(): Promise<OrgContext | null> {
  const ctx = await requireOrg();
  return can(ctx, "forms.manage") ? ctx : null;
}
async function fresh(ctx: OrgContext, id: string): Promise<ActionResult<FormDetail>> {
  const d = await getForm(ctx.supabase, ctx.orgId, id);
  revalidatePath("/forms");
  return d ? ok(d) : fail("Este formulário não está mais disponível.");
}

export async function createFormAction(template: string): Promise<ActionResult<FormDetail>> {
  const t = TEMPLATES.find((x) => x.key === template);
  if (!t) return fail("Escolha um ponto de partida.");
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  const { data, error } = await ctx.supabase.from("forms").insert({ org_id: ctx.orgId, title: t.title, intro: t.intro, fields: t.fields as never }).select("id").single();
  if (error || !data) return fail(toMessage(error, FAIL));
  return fresh(ctx, data.id);
}

export async function saveFormAction(id: string, title: string, intro: string, fields: FormField[]): Promise<ActionResult<FormDetail>> {
  if (!UUID.test(id)) return fail("Formulário inválido.");
  const t = title.trim().slice(0, TITLE_MAX);
  if (!t) return fail("Dê um título ao formulário.");
  const clean = cleanFields(fields);
  if (typeof clean === "string") return fail(clean);
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase
    .from("forms")
    .update({ title: t, intro: intro.trim().slice(0, INTRO_MAX), fields: clean as never, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  return fresh(ctx, id);
}

export async function setFormOpenAction(id: string, open: boolean): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Formulário inválido.");
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase.from("forms").update({ open }).eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/forms");
  return ok(null);
}

export async function deleteFormAction(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Formulário inválido.");
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase.from("forms").delete().eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/forms");
  return ok(null);
}

/** Abrir a ficha marca as respostas como vistas (some o "3 novas"). */
export async function markSeenAction(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Formulário inválido.");
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  await ctx.supabase.from("form_responses").update({ seen: true }).eq("form_id", id).eq("seen", false);
  return ok(null);
}

export async function deleteResponseAction(formId: string, id: string): Promise<ActionResult<FormDetail>> {
  if (!UUID.test(formId) || !UUID.test(id)) return fail("Resposta inválida.");
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase.from("form_responses").delete().eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  return fresh(ctx, formId);
}

/**
 * Leva a resposta para Pessoas: se já existe alguém com o mesmo telefone, liga a essa pessoa;
 * senão cria um visitante com nome e telefone. Precisa poder editar pessoas.
 */
export async function responseToPersonAction(formId: string, id: string): Promise<ActionResult<FormDetail>> {
  if (!UUID.test(formId) || !UUID.test(id)) return fail("Resposta inválida.");
  const ctx = await manager();
  if (!ctx) return fail(NO_PERM);
  if (!canEditPeople(ctx)) return fail("Você não tem permissão para adicionar pessoas.");
  const { supabase, orgId } = ctx;
  const { data: r } = await supabase.from("form_responses").select("name, phone, stick_id, forms(title)").eq("id", id).maybeSingle();
  if (!r) return fail("Esta resposta não está mais disponível.");
  if (r.stick_id) return fresh(ctx, formId);

  let stickId: string | null = null;
  const key = phoneKey(r.phone ?? "");
  if (key.length >= 8) {
    // ponytail: varre os telefones da igreja inteira; trocar por coluna normalizada se passar de ~20 mil pessoas.
    const { data: people } = await supabase.from("sticks").select("id, phone, whatsapp").eq("org_id", orgId);
    stickId = (people ?? []).find((p) => phoneKey(p.phone ?? "") === key || phoneKey(p.whatsapp ?? "") === key)?.id ?? null;
  }
  if (!stickId) {
    const { data: stage } = await supabase.from("journey_stages").select("id").eq("position", positionForJourneyCode("first_visit")).limit(1).maybeSingle();
    const { data, error } = await supabase
      .from("sticks")
      .insert({
        org_id: orgId,
        full_name: r.name,
        phone: r.phone || null,
        relationship_status: "visitor_first",
        first_visit_date: new Date().toISOString().slice(0, 10),
        source: `Formulário: ${r.forms?.title ?? ""}`.slice(0, 120),
        journey_stage_id: stage?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return fail(toMessage(error, "Não consegui criar a pessoa."));
    stickId = data.id;
  }
  const { error } = await supabase.from("form_responses").update({ stick_id: stickId }).eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/people");
  return fresh(ctx, formId);
}

/** Envio da página pública (sem login). */
export async function submitPublicFormAction(token: string, name: string, phone: string, answers: Answers): Promise<ActionResult<null>> {
  if (!/^[0-9a-f]{16,64}$/.test(token)) return fail("Este formulário não está recebendo respostas.");
  const n = name.trim();
  if (!n) return fail("Escreva o seu nome.");
  if (n.length > NAME_MAX || phone.trim().length > PHONE_MAX) return fail("Algum campo passou do tamanho.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_form", { p_token: token, p_name: n, p_phone: phone.trim(), p_answers: answers });
  if (error) {
    const m = error.message;
    if (m.includes("falta responder")) return fail("Falta responder uma pergunta obrigatória.");
    if (m.includes("muitas respostas")) return fail("Muitas respostas agora. Tente de novo em alguns minutos.");
    return fail("Não deu para enviar. Confira as respostas e tente de novo.");
  }
  return data ? ok(null) : fail("Este formulário não está recebendo respostas.");
}
