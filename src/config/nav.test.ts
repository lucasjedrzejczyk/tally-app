import { describe, it, expect } from "vitest";
import { nonStaffRedirect, splitTabs, studyNavFor, studyOnlyRedirect, STUDY_ITEMS } from "./nav";

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
  it("/people, /finance e /groups continuam ligados no modo só Estudo", () => {
    for (const p of ["/people", "/people/abc", "/finance", "/groups", "/groups/abc"]) expect(studyOnlyRedirect(p)).toBeNull();
  });
});

describe("barra de abas do celular", () => {
  const tab = (key: string) => ({ key });
  it("até 5 itens: todos à mostra, sem Mais", () => {
    const r = splitTabs(["bible", "groups"].map(tab));
    expect(r.more).toEqual([]);
    expect(r.shown.map((t) => t.key)).toEqual(["bible", "groups"]);
  });
  it("equipe (8 itens): 4 primeiros com Pessoas e Células à mostra, o resto em Mais", () => {
    const all = [...STUDY_ITEMS, tab("search"), tab("settings")];
    const r = splitTabs(all);
    expect(r.shown.map((t) => t.key)).toEqual(["bible", "people", "groups", "finance"]);
    expect(r.more.map((t) => t.key)).toEqual(["sermons", "notes", "search", "settings"]);
  });
});
