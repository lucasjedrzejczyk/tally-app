import { describe, it, expect } from "vitest";
import {
  careReasons,
  careLevel,
  isVisitor,
  journeyLabel,
  journeyCodeForPosition,
  positionForJourneyCode,
  relLabel,
  relLabelFull,
} from "./domain";

// Helper: data ISO N dias atrás (para exercitar weeksSince de forma determinística).
function daysAgoIso(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe("careReasons (paridade com derived.js)", () => {
  it("membro visto hoje, em grupo, sem follow-up → nenhum motivo (em dia)", () => {
    const r = careReasons({ lastSeen: daysAgoIso(0), group: "Célula A", followup: false });
    expect(r).toHaveLength(0);
    expect(careLevel(r.length)).toBe("em");
  });

  it("sem aparecer há 4 semanas → 1 motivo (atenção), com o tempo REAL no texto", () => {
    const r = careReasons({ lastSeen: daysAgoIso(28), group: "Célula A", followup: false });
    expect(r.map((x) => x.short)).toContain("sem aparecer");
    expect(r).toHaveLength(1);
    expect(r[0]!.full).toBe("Sem aparecer há 4 semanas"); // nunca "há um tempo"
    expect(careLevel(r.length)).toBe("at");
  });

  it("uma semana → singular", () => {
    const r = careReasons({ lastSeen: daysAgoIso(7), group: "G", followup: false }, 1);
    expect(r[0]!.full).toBe("Sem aparecer há 1 semana");
  });

  it("sem grupo + follow-up aberto → 2 motivos (risco)", () => {
    const r = careReasons({ lastSeen: daysAgoIso(0), group: "", followup: true });
    expect(r.map((x) => x.short).sort()).toEqual(["follow-up", "sem grupo"]);
    expect(careLevel(r.length)).toBe("ri");
  });

  it("respeita o limiar careWeeks custom", () => {
    // 14 dias = 2 semanas: com limiar 3 não conta; com limiar 2 conta.
    expect(careReasons({ lastSeen: daysAgoIso(14), group: "G", followup: false }, 3)).toHaveLength(0);
    expect(careReasons({ lastSeen: daysAgoIso(14), group: "G", followup: false }, 2)).toHaveLength(1);
  });

  it("sem data de última presença → conta como sumido, sem inventar número de semanas", () => {
    const r = careReasons({ lastSeen: null, group: "G", followup: false });
    expect(r.map((x) => x.short)).toContain("sem aparecer");
    expect(r[0]!.full).toBe("Nunca apareceu");
  });
});

describe("mapeamento de jornada (position ↔ código)", () => {
  it("position → código", () => {
    expect(journeyCodeForPosition(1)).toBe("first_visit");
    expect(journeyCodeForPosition(3)).toBe("connected");
    expect(journeyCodeForPosition(6)).toBe("leadership");
  });
  it("position ausente → first_visit (fallback seguro)", () => {
    expect(journeyCodeForPosition(null)).toBe("first_visit");
    expect(journeyCodeForPosition(undefined)).toBe("first_visit");
  });
  it("código → position", () => {
    expect(positionForJourneyCode("connected")).toBe(3);
    expect(positionForJourneyCode("leadership")).toBe(6);
    expect(positionForJourneyCode("desconhecido")).toBe(1);
  });
  it("rótulo em PT-BR", () => {
    expect(journeyLabel("group")).toBe("Em grupo");
    expect(journeyLabel("first_visit")).toBe("Primeira visita");
    expect(journeyLabel("xyz")).toBe("—");
  });
});

describe("relação (rótulos e visitante)", () => {
  it("rótulos curto/completo", () => {
    expect(relLabel("member")).toBe("Membro");
    expect(relLabel("visitor_first")).toBe("Visitante");
    expect(relLabelFull("visitor_first")).toBe("Visitante 1a vez");
  });
  it("isVisitor cobre as duas formas de visitante", () => {
    expect(isVisitor("visitor_first")).toBe(true);
    expect(isVisitor("visitor_returning")).toBe(true);
    expect(isVisitor("member")).toBe(false);
    expect(isVisitor("attendee")).toBe(false);
  });
});

// ---- Pessoas (spec 13) ----------------------------------------------------------------
import {
  ageLabel,
  ageOn,
  birthdayShort,
  birthdaysIn,
  filterPeople,
  filtersQuery,
  formatCpf,
  formatPhone,
  isValidCpf,
  longDate,
  NO_FILTERS,
  normalize,
  parseFilters,
  personSubtitle,
  aboutLine,
  addressLine,
  churchTimeline,
  profileMeta,
  statusValue,
  whatsappLink,
  type PersonLite,
} from "./domain";

const person = (o: Partial<PersonLite>): PersonLite => ({
  id: "x", name: "Fulano", status: "member", office: "", phone: "", whatsapp: "", email: "", birthDate: null, archived: false, groupIds: [], ...o,
});

describe("CPF e telefone", () => {
  it("valida dígitos verificadores e rejeita repetidos", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata CPF e telefone do Brasil", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatPhone("47999990000")).toBe("(47) 99999-0000");
    expect(formatPhone("4733330000")).toBe("(47) 3333-0000");
    expect(formatPhone("+5547999990000")).toBe("(47) 99999-0000");
    expect(formatPhone("+1 555 0100")).toBe("+1 555 0100");
  });
  it("link do WhatsApp assume DDI 55 quando falta", () => {
    expect(whatsappLink("(47) 99999-0000")).toBe("https://wa.me/5547999990000");
    expect(whatsappLink("5547999990000")).toBe("https://wa.me/5547999990000");
    expect(whatsappLink("")).toBe("");
  });
});

describe("datas da ficha", () => {
  const now = new Date(2026, 9, 9); // 9/out/2026
  it("idade em anos completos", () => {
    expect(ageOn("1990-10-09", now)).toBe(36);
    expect(ageOn("1990-10-10", now)).toBe(35);
    expect(ageOn(null, now)).toBeNull();
    expect(ageLabel("2025-10-09", now)).toBe("1 ano");
  });
  it("aniversário curto e data por extenso", () => {
    expect(birthdayShort("1990-10-12")).toBe("12 out");
    expect(longDate("2020-03-08")).toBe("8 de março de 2020");
  });
  it("aniversariantes do mês em ordem de dia", () => {
    const l = [person({ name: "B", birthDate: "1980-10-20" }), person({ name: "A", birthDate: "1990-10-02" }), person({ name: "C", birthDate: "1990-11-01" })];
    expect(birthdaysIn(l, 10).map((p) => p.name)).toEqual(["A", "B"]);
  });
});

describe("filtros da lista", () => {
  const now = new Date(2026, 9, 9);
  const list = [
    person({ id: "1", name: "Ana Souza", status: "member", office: "Diácono(isa)", phone: "47999990000", birthDate: "1990-10-12", groupIds: ["g1"] }),
    person({ id: "2", name: "Bruno Lima", status: "visitor_first", email: "bruno@x.com", birthDate: "1985-11-03" }),
    person({ id: "3", name: "Álvaro Dias", status: "visitor_returning" }),
    person({ id: "4", name: "Carla Reis", status: "inactive" }),
    person({ id: "5", name: "Davi Paz", status: "member", archived: true }),
    person({ id: "6", name: "Eva Nunes", status: "attendee", groupIds: ["g1", "g2"] }),
  ];
  const ids = (f: Partial<typeof NO_FILTERS>) => filterPeople(list, { ...NO_FILTERS, ...f }, now).map((p) => p.id);

  it("sem filtro: ordem alfabética e sem arquivados", () => {
    expect(ids({})).toEqual(["3", "1", "2", "4", "6"]);
  });
  it("situação: visitantes juntam os dois tipos; inativos trazem os arquivados", () => {
    expect(ids({ s: "visitor" })).toEqual(["3", "2"]);
    expect(ids({ s: "member" })).toEqual(["1"]);
    expect(ids({ s: "inactive" })).toEqual(["4", "5"]);
  });
  it("busca ignora acento e acha por e-mail e telefone", () => {
    expect(ids({ q: "alvaro" })).toEqual(["3"]);
    expect(ids({ q: "bruno@x" })).toEqual(["2"]);
    expect(ids({ q: "99999" })).toEqual(["1"]);
  });
  it("cargo, célula e aniversário somam", () => {
    expect(ids({ cargo: "Diácono(isa)" })).toEqual(["1"]);
    expect(ids({ celula: "g1" })).toEqual(["1", "6"]);
    expect(ids({ celula: "sem" })).toEqual(["3", "2", "4"]);
    expect(ids({ aniv: "este" })).toEqual(["1"]);
    expect(ids({ aniv: "proximo" })).toEqual(["2"]);
    expect(ids({ celula: "g1", s: "attendee" })).toEqual(["6"]);
  });
  it("vira querystring e volta igual", () => {
    const f = { ...NO_FILTERS, s: "member" as const, cargo: "Pastor(a)", aniv: "este" as const, celula: "g1", q: "ana" };
    const qs = filtersQuery(f);
    expect(parseFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
    expect(parseFilters({ s: "lixo", aniv: "x" })).toEqual(NO_FILTERS);
  });
  it("subtítulo da linha e rótulos", () => {
    expect(personSubtitle(person({ office: "Diácono", phone: "47999990000" }))).toBe("Diácono");
    expect(personSubtitle(person({}))).toBe("");
    expect(personSubtitle(person({ status: "visitor_returning" }))).toBe("Visitante");
    expect(personSubtitle(person({ status: "inactive", office: "Diácono" }))).toBe("Inativo · Diácono");
    expect(personSubtitle(person({ archived: true }))).toBe("Arquivado");
    expect(statusValue("visitor_returning")).toBe("visitor_first");
    expect(normalize("Álvaro")).toBe("alvaro");
  });
});

describe("ficha em modo leitura", () => {
  const now = new Date(2026, 9, 11);
  it("linha Sobre usa só o que existe e ajusta o gênero", () => {
    expect(aboutLine({ birthDate: "1985-03-12", gender: "female", maritalStatus: "married", profession: "Professora" }, now)).toBe("41 anos (12/03) · Casada · Professora");
    expect(aboutLine({ birthDate: "", gender: "", maritalStatus: "stable_union", profession: "" }, now)).toBe("União estável");
    expect(aboutLine({ birthDate: "", gender: "", maritalStatus: "married", profession: " " }, now)).toBe("Casado(a)");
    expect(aboutLine({ birthDate: "", gender: "male", maritalStatus: "", profession: "" }, now)).toBe("");
  });
  it("endereço em uma linha", () => {
    expect(addressLine({ line1: "Rua das Flores, 120", line2: "Casa 2", city: "Joinville", state: "SC", postalCode: "89201000" })).toBe("Rua das Flores, 120, Casa 2, Joinville/SC, 89201-000");
    expect(addressLine({ line1: "", line2: "", city: "Joinville", state: "", postalCode: "" })).toBe("Joinville");
    expect(addressLine({ line1: "", line2: "", city: "", state: "", postalCode: "" })).toBe("");
  });
  it("cabeçalho com situação, cargo, idade e líder", () => {
    expect(profileMeta({ status: "member", office: "Diácono", birthDate: "1985-03-12", isLeader: "true" }, false, now)).toBe("Membro · Diácono · 41 anos · líder");
    expect(profileMeta({ status: "visitor_returning", office: "", birthDate: "", isLeader: "false" }, true, now)).toBe("Arquivado");
  });
  it("linha do tempo em ordem de data, com forma de entrada e saída", () => {
    const t = churchTimeline({
      firstVisit: "2012-02-10",
      conversionDate: "2013-05-01",
      baptismDate: "2013-12-08",
      membershipDate: "2013-12-08",
      admissionType: "baptism",
      exitDate: "2020-05-03",
      exitReason: "transfer",
    });
    expect(t.map((m) => `${m.label}|${m.when}`)).toEqual([
      "Primeira visita|fev/2012",
      "Conversão|mai/2013",
      "Batismo|dez/2013",
      "Membro desde|dez/2013, por batismo",
      "Saída|mai/2020, transferência",
    ]);
    // datas fora de ordem e marcos ausentes
    const u = churchTimeline({ firstVisit: "", conversionDate: "", baptismDate: "2010-06-10", membershipDate: "2008-01-01", admissionType: "", exitDate: "", exitReason: "moved" });
    expect(u.map((m) => `${m.label}|${m.when}`)).toEqual(["Membro desde|jan/2008", "Batismo|jun/2010", "Saída|mudança"]);
    expect(churchTimeline({ firstVisit: "", conversionDate: "", baptismDate: "", membershipDate: "", admissionType: "baptism", exitDate: "", exitReason: "" })).toEqual([]);
  });
});
