import { describe, expect, it } from "vitest";
import { STUDY_ONLY, studyOnlyRedirect } from "./nav";

describe.runIf(STUDY_ONLY)("modo só Estudo", () => {
  it("manda as telas desligadas para a Bíblia", () => {
    for (const p of ["/", "/teams", "/plans", "/communication"]) expect(studyOnlyRedirect(p)).toBe("/study/bible");
  });
  it("deixa passar Estudo, Finanças, Configurações, Admin e o que não é menu", () => {
    for (const p of ["/study", "/study/bible/JHN/1", "/people", "/people/abc", "/groups", "/groups/abc", "/finance", "/finance/contador/entries", "/settings", "/admin", "/login", "/onboarding", "/convite/abc", "/financeiro"]) expect(studyOnlyRedirect(p)).toBeNull();
  });
});
