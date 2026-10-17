import { describe, it, expect } from "vitest";
import { addCycle, effectOf, type BillingContext } from "./events";
import { handleAsaasWebhook, type WebhookDeps } from "./webhook";
import { isValidCnpj, parseBillingDoc } from "./doc";

const now = new Date("2026-10-17T12:00:00Z");
const ctx: BillingContext = { plan_status: "active", pro_until: null, cycle: "MONTHLY", periodEnd: "2026-11-17T02:59:59.000Z" };

describe("effectOf", () => {
  it("pagamento liga o pago e estende o período", () => {
    const e = effectOf("PAYMENT_CONFIRMED", { dueDate: "2026-10-17" }, { ...ctx, plan_status: "none" }, now);
    expect(e?.org).toEqual({ plan: "pro", plan_status: "active", grace_until: null });
    expect(e?.sub?.current_period_end).toBe(addCycle("2026-10-17", "MONTHLY"));
  });
  it("anual soma um ano", () => expect(addCycle("2026-10-17", "YEARLY").slice(0, 10)).toBe("2027-10-18"));
  it("atraso de quem pagava dá 7 dias", () => {
    const e = effectOf("PAYMENT_OVERDUE", { invoiceUrl: "u" }, ctx, now);
    expect(e?.org).toEqual({ plan_status: "past_due", grace_until: "2026-10-24T12:00:00.000Z" });
  });
  it("primeira fatura vencida não dá pago", () => {
    expect(effectOf("PAYMENT_OVERDUE", {}, { ...ctx, plan_status: "none" }, now)?.org).toBeUndefined();
  });
  it("cancelamento usa até o fim do período sem encurtar cortesia", () => {
    expect(effectOf("SUBSCRIPTION_DELETED", null, ctx, now)?.org?.pro_until).toBe(ctx.periodEnd);
    expect(effectOf("SUBSCRIPTION_DELETED", null, { ...ctx, pro_until: "2100-01-01T00:00:00Z" }, now)?.org?.pro_until).toBe("2100-01-01T00:00:00Z");
  });
  it("outros eventos não mudam nada", () => expect(effectOf("PAYMENT_CREATED", null, ctx, now)).toBeNull());
});

function fakeDeps() {
  const seen = new Set<string>();
  const applied: unknown[] = [];
  const deps: WebhookDeps = {
    record: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    load: async (ref) => (ref ? { orgId: ref, subId: "sub_1", ctx } : null),
    apply: async (...a) => void applied.push(a),
    done: async () => {},
  };
  return { deps, applied };
}
const body = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", subscription: "sub_1", externalReference: "org-1", dueDate: "2026-10-17" } };

describe("webhook", () => {
  it("recusa token errado ou ausente sem gravar", async () => {
    const { deps, applied } = fakeDeps();
    expect(await handleAsaasWebhook("errado", "certo", body, deps, now)).toBe(401);
    expect(await handleAsaasWebhook(null, "certo", body, deps, now)).toBe(401);
    expect(await handleAsaasWebhook("certo", undefined, body, deps, now)).toBe(401);
    expect(applied).toHaveLength(0);
  });
  it("ignora evento repetido", async () => {
    const { deps, applied } = fakeDeps();
    expect(await handleAsaasWebhook("certo", "certo", body, deps, now)).toBe(200);
    expect(await handleAsaasWebhook("certo", "certo", body, deps, now)).toBe(200);
    expect(applied).toHaveLength(1);
  });
  it("sem igreja: grava e ignora", async () => {
    const { deps, applied } = fakeDeps();
    const orphan = { ...body, id: "evt_2", payment: { ...body.payment, externalReference: null } };
    expect(await handleAsaasWebhook("certo", "certo", orphan, deps, now)).toBe(200);
    expect(applied).toHaveLength(0);
  });
});

describe("documento", () => {
  it("CNPJ com dígito", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("aceita CPF ou CNPJ válidos, só dígitos", () => {
    expect(parseBillingDoc("529.982.247-25")).toBe("52998224725");
    expect(parseBillingDoc("11.222.333/0001-81")).toBe("11222333000181");
    expect(parseBillingDoc("123")).toBeNull();
  });
});
