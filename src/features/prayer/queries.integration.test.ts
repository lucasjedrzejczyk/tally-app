import { describe, it, expect } from "vitest";
import { hasTestFixture, signInTestUser } from "@/test-support/supabase";
import { listPrayers } from "./queries";

// Integração: pedidos de oração da org de teste (org-scoping/RLS/shape).
describe.skipIf(!hasTestFixture)("Prayer queries (integração, org de teste)", () => {
  it("listPrayers devolve pedidos da org no shape esperado", async () => {
    const { supabase, orgId } = await signInTestUser();
    const prayers = await listPrayers(supabase, orgId);
    expect(Array.isArray(prayers)).toBe(true);
    for (const p of prayers) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.request).toBe("string");
      expect(["church", "group", "leader", "private"]).toContain(p.privacy);
    }
    // A fixture semeia ao menos 1 pedido (Bruno, "Saúde da família").
    expect(prayers.some((p) => p.request.length > 0)).toBe(true);
  });
});
