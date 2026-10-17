import { describe, it, expect } from "vitest";
import { effectivePlan, type PlanState } from "./effective";

const now = new Date("2026-10-17T12:00:00Z");
const base: PlanState = { plan: "free", plan_status: "none", pro_until: null, grace_until: null };
const at = (o: Partial<PlanState>) => effectivePlan({ ...base, ...o }, now);

describe("effectivePlan", () => {
  it("sem org ou tudo vazio: grátis", () => {
    expect(effectivePlan(null, now)).toBe("free");
    expect(at({})).toBe("free");
  });
  it("assinatura ativa: pago", () => expect(at({ plan: "pro", plan_status: "active" })).toBe("pro"));
  it("plan='pro' sem status ativo não libera", () => {
    expect(at({ plan: "pro" })).toBe("free");
    expect(at({ plan: "pro", plan_status: "canceled" })).toBe("free");
  });
  it("atraso dentro da tolerância: pago; depois: grátis", () => {
    expect(at({ plan: "pro", plan_status: "past_due", grace_until: "2026-10-20T00:00:00Z" })).toBe("pro");
    expect(at({ plan: "pro", plan_status: "past_due", grace_until: "2026-10-10T00:00:00Z" })).toBe("free");
    expect(at({ plan: "pro", plan_status: "past_due" })).toBe("free");
  });
  it("cortesia no prazo: pago; vencida: grátis", () => {
    expect(at({ pro_until: "2100-01-01T00:00:00Z" })).toBe("pro");
    expect(at({ pro_until: "2026-10-17T11:59:59Z" })).toBe("free");
  });
  it("cancelada usa até o fim do período (pro_until)", () => {
    expect(at({ plan: "pro", plan_status: "canceled", pro_until: "2026-11-01T00:00:00Z" })).toBe("pro");
  });
});
