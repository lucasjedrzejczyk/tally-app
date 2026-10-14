import { describe, expect, it } from "vitest";
import { answerText, cleanFields, firstAnswer, missingRequired, newFieldId, phoneKey, readAnswers, readFields, responsesLabel, TEMPLATES, toCsv, type FormField } from "./domain";

const choice: FormField = { id: "q1", label: "Vem?", type: "choice", required: true, options: ["Sim", "Não"] };

describe("formulários", () => {
  it("lê o jsonb sem confiar nele", () => {
    expect(readFields([choice, { id: "x", label: "y", type: "upload" }, null, "z"])).toEqual([choice]);
    expect(readFields("nada")).toEqual([]);
    expect(readAnswers({ a: "1", b: ["x", 2], c: 3 })).toEqual({ a: "1", b: ["x"] });
  });

  it("limpa as perguntas antes de gravar", () => {
    expect(cleanFields([{ ...choice, label: "  Vem?  ", options: [" Sim", "Sim", "Não", ""] }])).toEqual([choice]);
    expect(cleanFields([{ ...choice, options: ["Sim"] }])).toBe('"Vem?" precisa de pelo menos duas opções.');
    expect(cleanFields([{ ...choice, label: " " }])).toBe("Toda pergunta precisa de um texto.");
    expect(cleanFields([choice, choice])).toBe("Pergunta inválida.");
    expect(cleanFields([{ ...choice, type: "short", options: ["a"] }])).toEqual([{ ...choice, type: "short", options: [] }]);
  });

  it("os pontos de partida já passam na limpeza", () => {
    for (const t of TEMPLATES) expect(cleanFields(t.fields)).toEqual(t.fields);
  });

  it("dá id novo sem repetir", () => {
    expect(newFieldId([])).toBe("q1");
    expect(newFieldId(["q1", "q3"])).toBe("q4");
    expect(newFieldId(["q2"])).toBe("q3");
  });

  it("mostra as respostas em texto", () => {
    expect(answerText({ type: "date" }, "2026-10-14")).toBe("14/10/2026");
    expect(answerText({ type: "multi" }, ["a", "b"])).toBe("a, b");
    expect(answerText({ type: "short" }, undefined)).toBe("");
    expect(firstAnswer([{ ...choice, id: "a" }, choice], { q1: "Sim" })).toBe("Sim");
  });

  it("aponta a obrigatória que falta", () => {
    expect(missingRequired([choice], {})).toBe(choice);
    expect(missingRequired([choice], { q1: "Sim" })).toBeNull();
    expect(missingRequired([{ ...choice, type: "multi" }], { q1: [] })?.id).toBe("q1");
  });

  it("monta a planilha para o Excel", () => {
    const csv = toCsv([choice], [{ name: 'Ana "Lu"', phone: "11 9", createdAt: "2026-10-14T22:05:00Z", answers: { q1: "Sim" } }]);
    expect(csv.startsWith("﻿Data;Nome;Telefone;Vem?\r\n")).toBe(true);
    expect(csv).toContain('14/10 19:05;"Ana ""Lu""";11 9;Sim');
  });

  it("compara telefones e conta respostas", () => {
    expect(phoneKey("+55 (11) 98888-7777")).toBe(phoneKey("11988887777"));
    expect(responsesLabel(0)).toBe("Nenhuma resposta");
    expect(responsesLabel(1)).toBe("1 resposta");
    expect(responsesLabel(5)).toBe("5 respostas");
  });
});
