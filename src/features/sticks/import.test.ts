import { describe, it, expect } from "vitest";
import { buildRows, classifyRows, cleanValues, guessMapping, importDate, readSheet, type Existing } from "./import";

const TODAY = "2026-10-09";

describe("guessMapping", () => {
  it("acha as colunas pelo cabeçalho, sem acento e sem diferenciar maiúsculas", () => {
    expect(guessMapping(["Nome Completo", "Celular", "E-mail", "Data de Nascimento", "Estado Civil", "UF", "Observações"])).toEqual([
      "name", "phone", "email", "birthDate", "maritalStatus", "state", "",
    ]);
  });
  it("cada campo é usado uma vez só; a segunda coluna igual fica para ignorar", () => {
    expect(guessMapping(["Nome", "Celular", "Telefone"])).toEqual(["name", "phone", ""]);
  });
  it("estado civil não é confundido com UF", () => {
    expect(guessMapping(["Estado", "Estado civil"])).toEqual(["state", "maritalStatus"]);
  });
});

describe("importDate", () => {
  it("aceita dd/mm/aaaa, d/m/aaaa e aaaa-mm-dd", () => {
    expect(importDate("05/03/1990", TODAY)).toBe("1990-03-05");
    expect(importDate("5/3/1990", TODAY)).toBe("1990-03-05");
    expect(importDate("1990-03-05", TODAY)).toBe("1990-03-05");
    expect(importDate("1990-03-05 00:00:00", TODAY)).toBe("1990-03-05");
  });
  it("dd/mm/aa: ano que cairia no futuro vira 19xx", () => {
    expect(importDate("05/03/85", TODAY)).toBe("1985-03-05");
    expect(importDate("05/03/12", TODAY)).toBe("2012-03-05");
  });
  it("lixo vira null", () => {
    expect(importDate("ontem", TODAY)).toBeNull();
  });
});

describe("cleanValues", () => {
  it("lê a situação da planilha", () => {
    expect(guessMapping(["Nome", "Situação"])).toEqual(["name", "status"]);
    expect(cleanValues({ name: "Ana", status: "INATIVA" }, TODAY).values.status).toBe("inactive");
    expect(cleanValues({ name: "Ana", status: "Congregado" }, TODAY).values.status).toBe("attendee");
    expect(cleanValues({ name: "Ana", status: "talvez" }, TODAY).error).toMatch(/^Situação/);
  });
  it("traduz rótulos em português e usa as regras da ficha", () => {
    const r = cleanValues(
      { name: "  Ruth Alves ", gender: "Feminino", maritalStatus: "Casada", birthDate: "05/03/1990", state: "sc", postalCode: "88010400", cpf: "529.982.247-25" },
      TODAY,
    );
    expect(r.error).toBeNull();
    expect(r.values).toEqual({ name: "Ruth Alves", gender: "female", maritalStatus: "married", birthDate: "1990-03-05", state: "SC", postalCode: "88010-400", cpf: "52998224725" });
  });
  it("erros apontam o campo", () => {
    expect(cleanValues({ name: "" }, TODAY).error).toBe("Informe o nome.");
    expect(cleanValues({ name: "Ana", email: "xx" }, TODAY).error).toBe("E-mail: E-mail inválido.");
    expect(cleanValues({ name: "Ana", cpf: "111.111.111-11" }, TODAY).error).toBe("CPF: CPF inválido.");
    expect(cleanValues({ name: "Ana", birthDate: "31/02/1990" }, TODAY).error).toBe("Nascimento: Data inválida.");
    expect(cleanValues({ name: "Ana", gender: "x" }, TODAY).error).toBe("Sexo: use Masculino ou Feminino.");
  });
  it("é idempotente (o servidor limpa de novo o que o navegador já limpou)", () => {
    const first = cleanValues({ name: "Ana Lima", maritalStatus: "União estável", gender: "M", birthDate: "01/02/80" }, TODAY).values;
    expect(cleanValues(first, TODAY).values).toEqual(first);
  });
});

describe("readSheet e buildRows", () => {
  const csv = "Nome;Celular;Nascimento\r\nRuth Alves;47999990000;05/03/1990\r\n\r\nPedro Souza;;\r\n;;\r\n";
  it("lê CSV com ; (UTF-8 com BOM) e numera as linhas (sem contar as em branco)", () => {
    const bytes = new TextEncoder().encode("\uFEFF" + csv);
    const { headers, rows } = readSheet(bytes);
    expect(headers).toEqual(["Nome", "Celular", "Nascimento"]);
    const built = buildRows(rows, guessMapping(headers), TODAY);
    expect(built.map((r) => [r.line, r.values.name, r.error])).toEqual([[2, "Ruth Alves", null], [3, "Pedro Souza", null]]);
  });
  it("lê Latin-1 sem estragar acentos", () => {
    const bytes = Uint8Array.from([..."Nome\nJos"].map((c) => c.charCodeAt(0)).concat([0xe9]));
    expect(readSheet(bytes).rows[0]).toEqual(["José"]);
  });
  it("lê CSV com vírgula", () => {
    expect(readSheet(new TextEncoder().encode("Nome,Cidade\nAna Lima,Joinville")).rows).toEqual([["Ana Lima", "Joinville"]]);
  });
});

describe("classifyRows", () => {
  const rows = buildRows(
    [["Ruth Alves", "529.982.247-25"], ["ruth alves", ""], ["Pedro Souza", ""], ["Maria Lima", "529.982.247-25"], ["", ""], ["Paulo Reis", "123"], ["JOSÉ Dias", ""]],
    ["name", "cpf"],
    TODAY,
  );
  it("conta novas, já existentes (nome ou CPF, na casa ou na própria planilha) e erros", () => {
    const existing: Existing = { names: new Set(["pedro souza"]), cpfs: new Set() };
    const r = classifyRows(rows, existing);
    // linha vazia é descartada por buildRows; "123" é CPF inválido
    expect(r.kinds).toEqual(["new", "exists", "exists", "exists", "error", "new"]);
    expect([r.news, r.exists, r.errors]).toEqual([2, 3, 1]);
  });
  it("CPF já cadastrado conta como existente mesmo com nome diferente; acento não atrapalha", () => {
    const existing: Existing = { names: new Set(["jose dias"]), cpfs: new Set(["52998224725"]) };
    const r = classifyRows(rows, existing);
    expect(r.kinds).toEqual(["exists", "new", "new", "exists", "error", "exists"]);
  });
});
