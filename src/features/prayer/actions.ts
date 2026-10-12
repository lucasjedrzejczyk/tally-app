"use server";

// Ações de Oração (spec 17, Fase C). A equipe cria, aprova, recusa, ora e marca respondida; o link
// público grava pelo RPC submit_prayer (m71), que não precisa de login.
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireOrg, can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { isoDate, today } from "@/lib/utils/date";
import { CONTACT_MAX, NAME_MAX, REQUEST_MAX, newPrayerToken, type PrayerRequest } from "./domain";
import { PRAYER_COLS, toPrayer } from "./queries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAIL = "Não deu para salvar. Tente de novo.";

export async function createPrayerAction(name: string, request: string, onlyPastoral: boolean, stickId: string | null): Promise<ActionResult<PrayerRequest>> {
  const text = request.trim();
  if (!text) return fail("Escreva o pedido.");
  if (text.length > REQUEST_MAX) return fail("O pedido ficou comprido demais.");
  const ctx = await requireOrg();
  const { data, error } = await ctx.supabase
    .from("prayer_requests")
    .insert({
      org_id: ctx.orgId,
      author_name: name.trim().slice(0, NAME_MAX) || "Anônimo",
      request: text,
      privacy: onlyPastoral ? "leader" : "church",
      stick_id: stickId && UUID.test(stickId) ? stickId : null,
      status: "approved",
    })
    .select(PRAYER_COLS)
    .single();
  if (error || !data) return fail(toMessage(error, FAIL));
  revalidatePath("/care");
  return ok(toPrayer(data));
}

export async function approvePrayerAction(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Pedido inválido.");
  const ctx = await requireOrg();
  const { error } = await ctx.supabase.from("prayer_requests").update({ status: "approved" }).eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/care");
  return ok(null);
}

/** Recusar um pedido do link ou excluir do mural (apaga). */
export async function deletePrayerAction(id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Pedido inválido.");
  const ctx = await requireOrg();
  if (!can(ctx, "prayer.manage")) return fail("Só quem gerencia as orações pode apagar um pedido.");
  const { error } = await ctx.supabase.from("prayer_requests").delete().eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/care");
  return ok(null);
}

// "Orei": lê e soma (a contagem é sinal de comunhão, não um número crítico).
export async function prayForAction(id: string): Promise<ActionResult<number>> {
  if (!UUID.test(id)) return fail("Pedido inválido.");
  const ctx = await requireOrg();
  const { data } = await ctx.supabase.from("prayer_requests").select("praying_count").eq("id", id).maybeSingle();
  if (!data) return fail("Pedido não encontrado.");
  const next = data.praying_count + 1;
  const { error } = await ctx.supabase.from("prayer_requests").update({ praying_count: next }).eq("id", id);
  return error ? fail(toMessage(error, FAIL)) : ok(next);
}

export async function setAnsweredAction(id: string, on: boolean): Promise<ActionResult<string | null>> {
  if (!UUID.test(id)) return fail("Pedido inválido.");
  const ctx = await requireOrg();
  const date = on ? isoDate(today()) : null;
  const { error } = await ctx.supabase.from("prayer_requests").update({ answered: on, answered_on: date }).eq("id", id);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/care");
  return ok(date);
}

/** O link de pedidos da igreja; `renew` troca o token (o link antigo para de funcionar). */
export async function prayerLinkAction(renew: boolean): Promise<ActionResult<string>> {
  const ctx = await requireOrg();
  if (!ctx.isStaff) return fail("Só a equipe pode gerar o link.");
  if (!renew) {
    const { data } = await ctx.supabase.from("organizations").select("prayer_token").eq("id", ctx.orgId).maybeSingle();
    if (data?.prayer_token) return ok(data.prayer_token);
  }
  const token = newPrayerToken(randomBytes(20));
  const { error } = await ctx.supabase.from("organizations").update({ prayer_token: token }).eq("id", ctx.orgId);
  return error ? fail(toMessage(error, FAIL)) : ok(token);
}

/** Página pública: grava o pedido como pendente. Sem login. */
export async function submitPublicPrayerAction(token: string, name: string, request: string, onlyPastoral: boolean, contact: string): Promise<ActionResult<null>> {
  const text = request.trim();
  if (!text) return fail("Escreva o seu pedido.");
  if (text.length > REQUEST_MAX || name.trim().length > NAME_MAX || contact.trim().length > CONTACT_MAX) return fail("Algum campo ficou comprido demais.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_prayer", { p_token: token, p_name: name, p_request: text, p_private: onlyPastoral, p_contact: contact });
  if (error) return fail(error.message.includes("muitos") ? "Recebemos muitos pedidos agora. Tente de novo daqui a pouco." : "Não deu para enviar. Tente de novo.");
  if (!data) return fail("Este link não funciona mais. Peça um novo para a igreja.");
  return ok(null);
}
