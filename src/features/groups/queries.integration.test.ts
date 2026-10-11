import { describe, it, expect } from "vitest";
import { hasTestFixture, signInTestUser } from "@/test-support/supabase";
import { getCell, listCells, listGroups } from "./queries";

// Integração: células da org de teste (org-scoping/RLS/shape).
describe.skipIf(!hasTestFixture)("Groups queries (integração, org de teste)", () => {
  it("listGroups devolve grupos com líder e contadores resolvidos", async () => {
    const { supabase, orgId } = await signInTestUser();
    const groups = await listGroups(supabase, orgId);
    expect(Array.isArray(groups)).toBe(true);
    for (const g of groups) {
      expect(typeof g.name).toBe("string");
      expect(typeof g.leader).toBe("string");
      expect(typeof g.newMembers).toBe("number");
    }
  });

  it("listCells e getCell devolvem a mesma célula com membros e encontros", async () => {
    const { supabase, orgId } = await signInTestUser();
    const cells = await listCells(supabase, orgId);
    expect(Array.isArray(cells)).toBe(true);
    const first = cells[0];
    if (!first) return;
    const detail = await getCell(supabase, orgId, first.id);
    expect(detail?.name).toBe(first.name);
    expect(detail?.members.length).toBe(first.memberCount);
    expect(detail!.sessions.length).toBeLessThanOrEqual(8);
  });
});
