// Plano que VALE para a igreja agora (spec 20). Pura: o banco guarda o estado da cobrança
// e da cortesia, isto decide. `plan='pro'` sozinho não libera: precisa de assinatura ativa,
// de atraso ainda na tolerância ou de cortesia no prazo. O admin_list_orgs (m74) repete esta
// regra em SQL para o painel; mudou aqui, muda lá.
import type { PlanCode } from "./catalog";

export interface PlanState {
  plan: string | null;
  plan_status: string | null;
  pro_until: string | null;
  grace_until: string | null;
}

const before = (now: Date, iso: string | null): boolean => iso !== null && now.getTime() < new Date(iso).getTime();

export function effectivePlan(org: PlanState | null | undefined, now: Date = new Date()): PlanCode {
  if (!org) return "free";
  if (org.plan === "pro" && org.plan_status === "active") return "pro";
  if (org.plan_status === "past_due" && before(now, org.grace_until)) return "pro";
  if (before(now, org.pro_until)) return "pro";
  return "free";
}

// Aviso para quem cuida da igreja: pagamento atrasado (até quando o pago continua) ou
// cortesia acabando em até 7 dias. Assinatura ativa não avisa nada.
export type BillingNotice = { kind: "past_due" | "courtesy_ending"; until: string } | null;

export function billingNotice(org: PlanState | null | undefined, now: Date = new Date()): BillingNotice {
  if (!org || (org.plan === "pro" && org.plan_status === "active")) return null;
  if (org.plan_status === "past_due" && before(now, org.grace_until)) return { kind: "past_due", until: org.grace_until! };
  if (before(now, org.pro_until) && new Date(org.pro_until!).getTime() - now.getTime() <= 7 * 86_400_000)
    return { kind: "courtesy_ending", until: org.pro_until! };
  return null;
}
