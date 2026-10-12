import { describe, expect, it } from "vitest";
import { careSuggestions, sinceLabel, sortOpen, stale, statusGroup, suggestionKey, twoDeclines } from "./domain";
import type { CareStatus } from "./types";

const T = "2026-10-12";
const it_ = (lastContact: string | null, createdOn = "2026-10-01", status: CareStatus = "in_progress") => ({ lastContact, createdOn, status });

describe("statusGroup", () => {
  it("junta os estados do banco em três", () => {
    expect(["new", "assigned", "in_progress"].map((s) => statusGroup(s as CareStatus))).toEqual(["open", "open", "open"]);
    expect(statusGroup("waiting")).toBe("waiting");
    expect(statusGroup("resolved")).toBe("done");
    expect(statusGroup("closed")).toBe("done");
  });
});

describe("sinceLabel e stale", () => {
  it("sem contato, recente", () => expect(sinceLabel(it_(null, "2026-10-10"), T)).toBe("Sem contato ainda"));
  it("hoje e ontem", () => {
    expect(sinceLabel(it_(T), T)).toBe("Último contato hoje");
    expect(sinceLabel(it_("2026-10-11"), T)).toBe("Último contato ontem");
  });
  it("há 9 dias não é parado", () => {
    expect(sinceLabel(it_("2026-10-03"), T)).toBe("Último contato há 9 dias");
    expect(stale(it_("2026-10-03"), T)).toBe(false);
  });
  it("14 dias ou mais é parado, inclusive sem contato desde a abertura", () => {
    expect(stale(it_("2026-09-28"), T)).toBe(true);
    expect(sinceLabel(it_("2026-09-27"), T)).toBe("Sem contato há 15 dias");
    expect(stale(it_(null, "2026-09-20"), T)).toBe(true);
  });
  it("concluído nunca é parado", () => expect(stale(it_("2026-01-01", "2026-01-01", "resolved"), T)).toBe(false));
});

describe("sortOpen", () => {
  it("parados primeiro (mais antigo no topo), depois os mais recentes", () => {
    const a = { id: "a", ...it_("2026-10-11") };
    const b = { id: "b", ...it_("2026-09-01") };
    const c = { id: "c", ...it_("2026-09-20") };
    const d = { id: "d", ...it_("2026-10-05") };
    expect(sortOpen([a, b, c, d], T).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("careSuggestions", () => {
  const face = (id: string) => ({ stickId: id, name: id.toUpperCase(), photoUrl: null });
  const input = {
    absences: [
      { ...face("ana"), group: "Esperança", streak: 3, lastSession: "2026-10-09" },
      { ...face("bia"), group: "Esperança", streak: 2, lastSession: "2026-10-09" },
    ],
    visitors: [
      { ...face("caio"), firstVisit: "2026-10-03" },
      { ...face("davi"), firstVisit: "2026-10-11" }, // há 1 dia: cedo demais
      { ...face("eva"), firstVisit: "2026-07-01" }, // há mais de 45 dias
      { ...face("ana"), firstVisit: "2026-10-01" }, // já sugerida por falta
    ],
    declines: [{ ...face("fabi"), ministry: "Louvor", lastDate: "2026-10-05" }],
  };
  it("monta os três motivos, uma linha por pessoa", () => {
    const r = careSuggestions(input, new Set(), new Set(), T);
    expect(r.map((s) => s.reason)).toEqual([
      "Faltou aos 3 últimos encontros da célula Esperança",
      "Visitante desde 03/10, ninguém acompanhando",
      "Não pôde nas 2 últimas escalas do Louvor",
    ]);
  });
  it("tira quem já tem caso aberto e o que foi dispensado", () => {
    const r = careSuggestions(input, new Set(["ana"]), new Set([suggestionKey.declined("fabi", "2026-10-05")]), T);
    expect(r.map((s) => s.stickId)).toEqual(["caio"]);
  });
  it("não repete a palavra célula", () => {
    const r = careSuggestions({ ...input, absences: [{ ...face("ana"), group: "Célula Vila Nova", streak: 4, lastSession: "2026-10-09" }] }, new Set(), new Set(), T);
    expect(r[0]?.reason).toBe("Faltou aos 4 últimos encontros da Célula Vila Nova");
  });
  it("dispensar vale até o fato mudar (chave nova volta a sugerir)", () => {
    const dismissed = new Set([suggestionKey.absent("ana", "2026-10-02")]);
    expect(careSuggestions(input, new Set(), dismissed, T)[0]?.stickId).toBe("ana");
  });
});

describe("twoDeclines", () => {
  it("só quando as duas últimas foram recusa", () => {
    expect(twoDeclines([{ date: "2026-10-05", status: "declined" }, { date: "2026-09-28", status: "declined" }, { date: "2026-09-21", status: "confirmed" }])).toBe("2026-10-05");
    expect(twoDeclines([{ date: "2026-10-05", status: "declined" }, { date: "2026-09-28", status: "confirmed" }])).toBeNull();
    expect(twoDeclines([{ date: "2026-10-05", status: "declined" }])).toBeNull();
  });
});
