"use server";

// Assinar o plano pago (spec 20). Só quem tem org.manage. Cria o cliente no Asaas uma vez,
// cria a assinatura (Pix, boleto ou cartão, a pessoa escolhe na fatura) e manda para a
// primeira fatura. O pago só liga quando o webhook confirma o pagamento.
import { redirect } from "next/navigation";
import { can, requireOrg } from "@/lib/auth/session";
import { fail, toMessage, type ActionResult } from "@/lib/errors";
import { PRICE_MONTHLY, PRICE_YEARLY } from "@/config/billing";
import { createCustomer, createSubscription, firstInvoiceUrl } from "./asaas";
import { parseBillingDoc } from "./doc";

export async function subscribeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (!can(ctx, "org.manage")) return fail("Só quem administra a igreja pode assinar.");
  if (ctx.planState?.plan === "pro" && ctx.planState.plan_status === "active") return fail("A igreja já tem uma assinatura ativa.");

  const cycle = fd.get("cycle") === "YEARLY" ? "YEARLY" : "MONTHLY";
  const value = cycle === "YEARLY" ? PRICE_YEARLY : PRICE_MONTHLY;
  if (!value) return fail("A assinatura ainda não está aberta.");

  const { supabase, orgId } = ctx;
  const { data: org } = await supabase.from("organizations").select("name, billing_doc, asaas_customer_id").eq("id", orgId).maybeSingle();
  if (!org) return fail("Igreja não encontrada.");
  const doc = org.billing_doc ?? parseBillingDoc(String(fd.get("doc") ?? ""));
  if (!doc) return fail("CPF ou CNPJ inválido.", { doc: ["Confira os números."] });

  let invoice: string | null;
  try {
    let customer = org.asaas_customer_id;
    if (!customer) {
      customer = (await createCustomer(org.name, doc, orgId)).id;
      const { error } = await supabase.rpc("billing_set_customer", { p_org: orgId, p_doc: doc, p_customer: customer });
      if (error) throw error;
    }
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const sub = await createSubscription({ customer, value, cycle, orgId, nextDueDate: today });
    invoice = await firstInvoiceUrl(sub.id);
    const { error } = await supabase.rpc("billing_add_subscription", { p_org: orgId, p_sub: sub.id, p_cycle: cycle, p_invoice: invoice });
    if (error) throw error;
  } catch (e) {
    console.error("assinar", e);
    return fail(`Não consegui abrir a assinatura agora. ${toMessage(e, "")}`.trim());
  }
  redirect(invoice ?? "/plans");
}
