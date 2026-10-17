import { describe, it, expect } from "vitest";
import {
  buildStatTiles,
  coerceOrgStatus,
  filterOrgs,
  formatCount,
  nextStatus,
  orgStatusBand,
  orgStatusLabel,
  planLabel,
  billingLabel,
  sortOrgs,
  statusActionLabel,
  type AdminOrgRow,
} from "./domain";

// Fábrica mínima: só os campos que ordenação/filtro tocam, com defaults sensatos.
function org(over: Partial<AdminOrgRow> = {}): AdminOrgRow {
  return {
    name: "Igreja",
    country: "BR",
    plan: "free",
    status: "active",
    createdAt: "2026-01-01T00:00:00Z",
    members: 0,
    sticks: 0,
    groups: 0,
    ...over,
  };
}

describe("domain — status da org", () => {
  it("coerção: valores conhecidos passam, o resto cai para active", () => {
    expect(coerceOrgStatus("active")).toBe("active");
    expect(coerceOrgStatus("suspended")).toBe("suspended");
    expect(coerceOrgStatus("weird")).toBe("active");
    expect(coerceOrgStatus("")).toBe("active");
  });

  it("rótulos em PT-BR", () => {
    expect(orgStatusLabel("active")).toBe("Ativa");
    expect(orgStatusLabel("suspended")).toBe("Suspensa");
  });

  it("banda visual: ativa saudável, suspensa em risco", () => {
    expect(orgStatusBand("active")).toBe("healthy");
    expect(orgStatusBand("suspended")).toBe("risk");
  });

  it("próximo status é o oposto (para o botão de alternância)", () => {
    expect(nextStatus("active")).toBe("suspended");
    expect(nextStatus("suspended")).toBe("active");
  });

  it("rótulo da ação reflete o destino", () => {
    expect(statusActionLabel("active")).toBe("Suspender");
    expect(statusActionLabel("suspended")).toBe("Reativar");
  });
});

describe("domain — plano (gancho, só leitura)", () => {
  it("free vira Free; capitaliza o resto; vazio cai para Free", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("pro")).toBe("Pro");
    expect(planLabel("")).toBe("Free");
    expect(planLabel("  ")).toBe("Free");
  });
});

describe("domain — formatação de métricas", () => {
  it("agrupa milhares no padrão PT-BR (ponto)", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(42)).toBe("42");
    expect(formatCount(1234)).toBe("1.234");
    expect(formatCount(1000000)).toBe("1.000.000");
  });
});

describe("domain — cards de estatística do cabeçalho", () => {
  it("monta os 5 cards (igrejas, ativas, suspensas, membros, contatos) já formatados", () => {
    const tiles = buildStatTiles({ orgs: 1200, active: 1100, suspended: 100, members: 34000, sticks: 98000 });
    expect(tiles.map((t) => t.key)).toEqual(["orgs", "active", "suspended", "members", "sticks"]);
    expect(tiles.map((t) => t.label)).toEqual(["Igrejas", "Ativas", "Suspensas", "Membros", "Contatos"]);
    const byKey = Object.fromEntries(tiles.map((t) => [t.key, t.value]));
    expect(byKey.orgs).toBe("1.200");
    expect(byKey.members).toBe("34.000");
    expect(byKey.sticks).toBe("98.000");
  });
});

describe("domain — ordenação", () => {
  it("por nome (asc/desc), sem sensibilidade a acento/caixa", () => {
    const rows = [org({ name: "Zoe" }), org({ name: "ágape" }), org({ name: "Betel" })];
    expect(sortOrgs(rows, "name", "asc").map((o) => o.name)).toEqual(["ágape", "Betel", "Zoe"]);
    expect(sortOrgs(rows, "name", "desc").map((o) => o.name)).toEqual(["Zoe", "Betel", "ágape"]);
  });

  it("por número (membros)", () => {
    const rows = [org({ name: "A", members: 5 }), org({ name: "B", members: 100 }), org({ name: "C", members: 30 })];
    expect(sortOrgs(rows, "members", "desc").map((o) => o.name)).toEqual(["B", "C", "A"]);
    expect(sortOrgs(rows, "members", "asc").map((o) => o.name)).toEqual(["A", "C", "B"]);
  });

  it("por data de criação", () => {
    const rows = [
      org({ name: "A", createdAt: "2026-03-01T00:00:00Z" }),
      org({ name: "B", createdAt: "2026-01-01T00:00:00Z" }),
      org({ name: "C", createdAt: "2026-02-01T00:00:00Z" }),
    ];
    expect(sortOrgs(rows, "createdAt", "desc").map((o) => o.name)).toEqual(["A", "C", "B"]);
  });

  it("country nulo não quebra a ordenação", () => {
    const rows = [org({ name: "A", country: null }), org({ name: "B", country: "US" })];
    expect(() => sortOrgs(rows, "country", "asc")).not.toThrow();
  });

  it("não muta o array de entrada", () => {
    const rows = [org({ name: "B" }), org({ name: "A" })];
    const before = rows.map((o) => o.name);
    sortOrgs(rows, "name", "asc");
    expect(rows.map((o) => o.name)).toEqual(before);
  });
});

describe("domain — filtro", () => {
  const rows = [
    org({ name: "Ágape Centro", country: "BR", status: "active" }),
    org({ name: "Betel", country: "US", status: "suspended" }),
    org({ name: "Zoe Church", country: "US", status: "active" }),
  ];

  it("busca por texto casa nome (sem caixa/acento) e país", () => {
    expect(filterOrgs(rows, { query: "agape", status: "all" }).map((o) => o.name)).toEqual(["Ágape Centro"]);
    expect(filterOrgs(rows, { query: "us", status: "all" }).map((o) => o.name)).toEqual(["Betel", "Zoe Church"]);
  });

  it("filtro por status", () => {
    expect(filterOrgs(rows, { query: "", status: "suspended" }).map((o) => o.name)).toEqual(["Betel"]);
    expect(filterOrgs(rows, { query: "", status: "active" }).map((o) => o.name)).toEqual(["Ágape Centro", "Zoe Church"]);
  });

  it("query vazia + status all devolve tudo", () => {
    expect(filterOrgs(rows, { query: "  ", status: "all" })).toHaveLength(3);
  });

  it("combina texto e status", () => {
    expect(filterOrgs(rows, { query: "us", status: "active" }).map((o) => o.name)).toEqual(["Zoe Church"]);
  });
});

describe("billingLabel", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const b = { plan: "free", planStatus: "none", proUntil: null, graceUntil: null };
  it("cada situação em palavras", () => {
    expect(billingLabel(b, now)).toBe("Grátis");
    expect(billingLabel({ ...b, plan: "pro", planStatus: "active" }, now)).toBe("Ativa");
    expect(billingLabel({ ...b, planStatus: "past_due", graceUntil: "2026-10-24T12:00:00Z" }, now)).toBe("Atrasada, até 24/10/2026");
    expect(billingLabel({ ...b, proUntil: "2026-12-02T02:59:59Z" }, now)).toBe("Cortesia até 01/12/2026");
    expect(billingLabel({ ...b, proUntil: "2100-01-01T00:00:00Z" }, now)).toBe("Cortesia sem data");
    expect(billingLabel({ ...b, planStatus: "canceled", proUntil: "2026-10-01T00:00:00Z" }, now)).toBe("Cancelada");
  });
});
