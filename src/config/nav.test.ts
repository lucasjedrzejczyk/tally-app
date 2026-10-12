import { describe, expect, it } from "vitest";
import { STUDY_ONLY, STUDY_ITEMS, nonStaffRedirect, splitTabs, studyNavFor, studyOnlyRedirect } from "./nav";

describe.runIf(STUDY_ONLY)("modo só Estudo", () => {
  it("manda as telas desligadas para a Bíblia", () => {
    for (const p of ["/", "/teams", "/plans", "/communication"]) expect(studyOnlyRedirect(p)).toBe("/study/bible");
  });
  it("deixa passar Estudo, Finanças, Configurações, Admin e o que não é menu", () => {
    for (const p of ["/study", "/study/bible/JHN/1", "/people", "/people/abc", "/groups", "/groups/abc", "/finance", "/finance/contador/entries", "/settings", "/admin", "/login", "/onboarding", "/convite/abc", "/financeiro"]) expect(studyOnlyRedirect(p)).toBeNull();
  });
});

describe("menu de quem não é equipe (líder/supervisor de célula)", () => {
  it("equipe vê tudo", () => {
    expect(studyNavFor(true, false)).toBe(STUDY_ITEMS);
  });
  it("líder vê só Bíblia e Células", () => {
    expect(studyNavFor(false, true).map((i) => i.key)).toEqual(["bible", "groups"]);
  });
  it("quem não lidera nada vê só a Bíblia", () => {
    expect(studyNavFor(false, false).map((i) => i.key)).toEqual(["bible"]);
  });
});

describe("telas só da equipe", () => {
  it("não redireciona a equipe", () => expect(nonStaffRedirect(true, false)).toBeNull());
  it("líder volta para as células", () => expect(nonStaffRedirect(false, true)).toBe("/groups"));
  it("sem célula volta para a Bíblia", () => expect(nonStaffRedirect(false, false)).toBe("/study/bible"));
  it("líder só de ministério vai para Ministérios", () => expect(nonStaffRedirect(false, false, true)).toBe("/ministries"));
  it("menu do líder de ministério", () => expect(studyNavFor(false, false, true).map((i) => i.key)).toEqual(["bible", "ministries"]));
});

describe("barra de abas do celular", () => {
  const tab = (key: string) => ({ key });
  it("até 5 itens: todos à mostra, sem Mais", () => {
    const r = splitTabs(["bible", "groups"].map(tab));
    expect(r.more).toEqual([]);
    expect(r.shown.map((t) => t.key)).toEqual(["bible", "groups"]);
  });
  it("equipe (10 itens): 4 primeiros com Pessoas e Células à mostra, o resto em Mais", () => {
    const all = [...STUDY_ITEMS, tab("search"), tab("settings")];
    const r = splitTabs(all);
    expect(r.shown.map((t) => t.key)).toEqual(["bible", "people", "groups", "finance"]);
    expect(r.more.map((t) => t.key)).toEqual(["ministries", "encontros", "sermons", "notes", "search", "settings"]);
  });
});
