// Evento do Asaas → mudança no plano da igreja (spec 20). Pura e testada: o webhook lê o
// estado, chama isto e grava o resultado. Atraso só conta para quem estava pagando (a
// primeira fatura vencida não dá 7 dias de pago a quem nunca pagou); cancelamento usa até
// o fim do que foi pago, sem encurtar uma cortesia mais longa.

export interface BillingContext {
  plan_status: string;
  pro_until: string | null;
  cycle: string | null; // MONTHLY | YEARLY da assinatura
  periodEnd: string | null; // current_period_end da assinatura
}

export interface Effect {
  org?: { plan?: string; plan_status?: string; grace_until?: string | null; pro_until?: string | null };
  sub?: { status?: string; current_period_end?: string; invoice_url?: string | null };
}

const GRACE_DAYS = 7;
const DAY = 86_400_000;

// Vencimento (YYYY-MM-DD) + um ciclo. ponytail: 31/01 + 1 mês vira 03/03 (overflow do Date); o
// próximo pagamento corrige, troque por fim-de-mês se alguém reclamar.
export function addCycle(dueDate: string, cycle: string | null): string {
  const d = new Date(`${dueDate}T23:59:59-03:00`);
  if (cycle === "YEARLY") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

const later = (a: string | null, b: string | null): string | null => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
};

export function effectOf(
  event: string,
  payment: { dueDate?: string | null; invoiceUrl?: string | null } | null,
  ctx: BillingContext,
  now: Date,
): Effect | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const sub: Effect["sub"] = { status: "ACTIVE" };
      if (payment?.dueDate) sub.current_period_end = addCycle(payment.dueDate, ctx.cycle);
      return { org: { plan: "pro", plan_status: "active", grace_until: null }, sub };
    }
    case "PAYMENT_OVERDUE":
      if (ctx.plan_status !== "active") return { sub: { invoice_url: payment?.invoiceUrl ?? null } };
      return {
        org: { plan_status: "past_due", grace_until: new Date(now.getTime() + GRACE_DAYS * DAY).toISOString() },
        sub: { invoice_url: payment?.invoiceUrl ?? null },
      };
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      return {
        org: { plan_status: "canceled", grace_until: null, pro_until: later(ctx.pro_until, ctx.periodEnd) },
        sub: { status: "INACTIVE" },
      };
    default:
      return null;
  }
}
