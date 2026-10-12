import { describe, it, expect } from "vitest";
import { baptismText, fichaSections } from "./print";
import type { PersonDetail } from "./types";
import { FIELD_META, type PersonField } from "./domain";

const empty = Object.fromEntries((Object.keys(FIELD_META) as PersonField[]).map((k) => [k, ""])) as Record<PersonField, string>;
const detail = (v: Partial<Record<PersonField, string>>, family: PersonDetail["family"] = null): PersonDetail => ({
  id: "1", values: { ...empty, ...v }, archived: false, photoUrl: null, family, tithes: null, cell: null, serves: [],
});
const NOW = new Date(2026, 9, 9);

describe("fichaSections", () => {
  it("só mostra o que está preenchido, com rótulos e formatos em português", () => {
    const s = fichaSections(detail({ name: "Ruth Alves", phone: "47999990000", birthDate: "1990-03-05", maritalStatus: "married", cpf: "52998224725", status: "member", baptismDate: "2010-06-01" }), NOW);
    expect(s.map((x) => x.title)).toEqual(["Contato", "Dados pessoais", "Documentos", "Vida na igreja"]);
    expect(s[0]!.rows).toEqual([["Telefone", "(47) 99999-0000"]]);
    expect(s[1]!.rows).toEqual([["Nascimento", "05/03/1990 · 36 anos"], ["Estado civil", "Casado(a)"]]);
    expect(s[2]!.rows).toEqual([["CPF", "529.982.247-25"]]);
    expect(s[3]!.rows).toEqual([["Situação", "Membro"], ["Batismo", "01/06/2010"]]);
  });
  it("sem endereço próprio, usa o da família e avisa; lista os membros com o papel", () => {
    const family = { id: "f", name: "Família Alves", line1: "Rua A, 10", line2: "", city: "Joinville", state: "SC", postalCode: "", members: [{ stickId: "1", name: "Ruth Alves", role: "head" as const }, { stickId: "2", name: "Pedro Alves", role: "child" as const }] };
    const s = fichaSections(detail({ name: "Ruth Alves", status: "member" }, family), NOW);
    expect(s.find((x) => x.title === "Endereço")!.rows).toEqual([["Endereço", "Rua A, 10 · Joinville/SC (endereço da família)"]]);
    expect(s.find((x) => x.title === "Família Alves")!.rows).toEqual([["Responsável", "Ruth Alves"], ["Filho(a)", "Pedro Alves"]]);
  });
});

describe("baptismText", () => {
  const church = { name: "Igreja Batista Central", city: "Joinville", state: "SC" };
  it("ajusta o gênero e escreve a data por extenso", () => {
    expect(baptismText("Ruth Alves", "female", "2010-06-01", church).after).toBe("foi batizada nas águas em 1 de junho de 2010, na Igreja Batista Central, em Joinville/SC.");
    expect(baptismText("Davi", "male", "2010-06-01", church).after).toContain("foi batizado nas águas");
    expect(baptismText("Davi", "", "2010-06-01", church).after).toContain("foi batizado(a) nas águas");
  });
  it("sem cidade ou UF, omite a parte do lugar", () => {
    expect(baptismText("Davi", "", "2010-06-01", { name: "Igreja X", city: "", state: "" }).after).toBe("foi batizado(a) nas águas em 1 de junho de 2010, na Igreja X.");
    expect(baptismText("Davi", "", "2010-06-01", { name: "Igreja X", city: "Joinville", state: "" }).after).toMatch(/, em Joinville\.$/);
  });
});
