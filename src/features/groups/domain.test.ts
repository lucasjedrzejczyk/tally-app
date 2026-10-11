import { describe, it, expect } from "vitest";
import { absenceStreak, accessOf, bandOf, defaultMeetingDate, filterCells, groupsHealth, inMeeting, isIso, leadersNeedingAccess, leadershipParts, listItemFromDetail, meetingLabel, missingFlag, monthYear, orderMembers, parseTime, shortDate, staleGroup, staleLabel, wasMember, type CellSession, type Group } from "./domain";
import type { CellDetail, CellListItem, CellMember } from "./types";
import type { Person } from "@/features/sticks/types";

function person(p: Partial<Person>): Person {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    name: p.name ?? "X",
    relationship: p.relationship ?? "member",
    isLeader: p.isLeader ?? false,
    campus: p.campus ?? "Sede",
    lastSeen: p.lastSeen ?? new Date().toISOString().slice(0, 10),
    followup: p.followup ?? false,
    firstVisit: null,
    source: null,
    birthDate: null,
    journeyStage: "connected",
    group: p.group ?? "",
    email: null,
    userId: null,
  };
}

function group(name: string): Group {
  return { id: name, name, campus: "Sede", leader: "", day: "", time: "", newMembers: 0, leftRecently: 0 };
}

describe("bandOf", () => {
  it("grupo vazio = atenção", () => expect(bandOf(0, 0)).toBe("attention"));
  it(">=85% = saudável", () => expect(bandOf(10, 90)).toBe("healthy"));
  it("70-84% = atenção", () => expect(bandOf(10, 75)).toBe("attention"));
  it("<70% = risco", () => expect(bandOf(10, 50)).toBe("risk"));
});

describe("groupsHealth (paridade com derived.js)", () => {
  it("calcula taxa 'em dia' e faixa por grupo do campus ativo", () => {
    const people = [
      person({ name: "A", group: "G1", lastSeen: new Date().toISOString().slice(0, 10) }), // em dia
      person({ name: "B", group: "G1", followup: true }), // 1 motivo
      person({ name: "C", group: "G2", followup: false, lastSeen: new Date().toISOString().slice(0, 10) }),
    ];
    const health = groupsHealth(people, [group("G1"), group("G2")], "Sede");
    const g1 = health.find((g) => g.name === "G1")!;
    expect(g1.count).toBe(2);
    expect(g1.acc).toBe(1);
    expect(g1.rate).toBe(50);
    expect(g1.band).toBe("risk");
  });

  it("ignora grupos de outro campus e ordena por menor taxa primeiro", () => {
    const g1 = group("G1"); // Sede, saudável
    const g2 = group("G2"); // Sede, risco
    const people = [
      person({ name: "A", group: "G1" }),
      person({ name: "B", group: "G2", followup: true }),
    ];
    const health = groupsHealth(people, [g1, g2], "Sede");
    expect(health[0]!.name).toBe("G2"); // menor taxa primeiro
  });
});

describe("Células: lógica pura (spec 14)", () => {
  // 2026-10-11 é domingo; 2026-10-08 é quinta.
  it("defaultMeetingDate: hoje se for o dia, senão o último dia do encontro", () => {
    expect(defaultMeetingDate("Quinta", "2026-10-08")).toBe("2026-10-08");
    expect(defaultMeetingDate("Quinta", "2026-10-11")).toBe("2026-10-08");
    expect(defaultMeetingDate("quinta-feira", "2026-10-09")).toBe("2026-10-08");
    expect(defaultMeetingDate("Domingo", "2026-10-11")).toBe("2026-10-11");
    expect(defaultMeetingDate("Sábado", "2026-10-11")).toBe("2026-10-10");
    expect(defaultMeetingDate("Sexta", "2026-03-02")).toBe("2026-02-27"); // vira o mês
    expect(defaultMeetingDate("", "2026-10-11")).toBe("2026-10-11");
    expect(defaultMeetingDate(null, "2026-10-11")).toBe("2026-10-11");
  });

  const S = (date: string, presentIds: string[], cancelled = false): CellSession => ({ date, presentIds, cancelled });
  it("absenceStreak: conta seguidos desde o mais recente e para na presença", () => {
    const sessions = [S("2026-10-08", ["b"]), S("2026-10-01", ["b"]), S("2026-09-24", ["a", "b"]), S("2026-09-17", ["a"])];
    expect(absenceStreak("a", sessions, "2026-01-01")).toBe(2);
    expect(absenceStreak("b", sessions, "2026-01-01")).toBe(0);
    expect(absenceStreak("c", sessions, "2026-01-01")).toBe(4);
  });
  it("absenceStreak: cancelado não conta nem interrompe; antes da entrada não conta", () => {
    const sessions = [S("2026-10-08", [], true), S("2026-10-01", []), S("2026-09-24", ["a"]), S("2026-09-17", [])];
    expect(absenceStreak("a", sessions, "2026-01-01")).toBe(1);
    expect(absenceStreak("a", sessions, "2026-10-01")).toBe(1); // 09-24 e 09-17 são anteriores à entrada
    expect(absenceStreak("a", sessions, "2026-10-05")).toBe(0);
    expect(absenceStreak("a", [], "2026-01-01")).toBe(0);
  });
  it("absenceStreak: presença registrada antes da entrada conta e interrompe a sequência", () => {
    const sessions = [S("2026-10-08", []), S("2026-10-01", ["a"]), S("2026-09-24", [])];
    expect(absenceStreak("a", sessions, "2026-10-05")).toBe(1); // entrou dia 05, mas veio dia 01
    expect(absenceStreak("a", [S("2026-10-08", []), S("2026-10-01", [])], "2026-10-05")).toBe(1); // 10-01 é anterior à entrada e sem presença
  });
  it("inMeeting: ativo na data OU com presença registrada (presença conta sempre)", () => {
    const m = { joinedAt: "2026-10-05", leftAt: null };
    expect(inMeeting(m, "2026-10-01", false)).toBe(false);
    expect(inMeeting(m, "2026-10-01", true)).toBe(true);
    expect(inMeeting(m, "2026-10-08", false)).toBe(true);
    expect(inMeeting({ joinedAt: "2026-01-01", leftAt: "2026-09-01" }, "2026-10-01", false)).toBe(false);
    expect(inMeeting({ joinedAt: "2026-01-01", leftAt: "2026-09-01" }, "2026-10-01", true)).toBe(true);
  });
  it("accessOf e leadersNeedingAccess: só líder, co-líder e supervisor sem login, uma linha por pessoa", () => {
    expect(accessOf({ email: "a@b.com", user_id: "u" })).toBe("has");
    expect(accessOf({ email: " a@b.com ", user_id: null })).toBe("ready");
    expect(accessOf({ email: " ", user_id: null })).toBe("noEmail");
    expect(accessOf(null)).toBe("noEmail");
    const mem = (stickId: string, role: CellMember["role"], access: CellMember["access"]): CellMember => ({ stickId, name: stickId, role, joinedAt: "2026-01-01", lastPresent: null, streak: 0, access });
    const out = leadersNeedingAccess({
      members: [mem("p", "leader", "ready"), mem("a", "co_leader", "has"), mem("h", "host", "ready"), mem("m", "member", "noEmail")],
      supervisor: { id: "p", name: "p", access: "ready" },
    });
    expect(out).toEqual([{ id: "p", name: "p", roles: "Líder, Supervisor", access: "ready" }]);
  });
  it("missingFlag: 3 encontros ou mais", () => {
    expect(missingFlag(2)).toBe(false);
    expect(missingFlag(3)).toBe(true);
  });
  it("staleGroup: sem encontro há 14+ dias, ou nunca", () => {
    expect(staleGroup(null, "2026-10-11")).toBe(true);
    expect(staleGroup("2026-09-27", "2026-10-11")).toBe(true); // 14 dias
    expect(staleGroup("2026-09-28", "2026-10-11")).toBe(false); // 13 dias
    expect(staleLabel("2026-09-20", "2026-10-11")).toBe("Sem registro há 3 semanas");
    expect(staleLabel(null, "2026-10-11")).toBe("Sem registro");
  });
  it("rótulos: encontro, hora e datas", () => {
    expect(meetingLabel("Quinta", "20:00")).toBe("Quintas, 20h");
    expect(meetingLabel("Quarta", "20h")).toBe("Quartas, 20h"); // dado antigo
    expect(meetingLabel("Sábado", "19:30")).toBe("Sábados, 19h30");
    expect(meetingLabel("", "20:00")).toBe("20h");
    expect(meetingLabel("Terça", "")).toBe("Terças");
    expect(meetingLabel("", "")).toBe("");
    expect(parseTime("8")).toBe("08:00");
    expect(parseTime("20h30")).toBe("20:30");
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime(" ")).toBe("");
    expect(shortDate("2026-10-09")).toBe("Sex 09/10");
    expect(monthYear("2024-03-09")).toBe("mar/2024");
    expect(isIso("2026-02-30")).toBe(false);
    expect(isIso("2026-10-09")).toBe(true);
  });
  it("wasMember: entrou até a data e não tinha saído", () => {
    expect(wasMember({ joinedAt: "2026-09-01", leftAt: null }, "2026-10-01")).toBe(true);
    expect(wasMember({ joinedAt: "2026-10-02", leftAt: null }, "2026-10-01")).toBe(false);
    expect(wasMember({ joinedAt: "2026-09-01", leftAt: "2026-09-20" }, "2026-10-01")).toBe(false);
  });
});

describe("Células: lista e ficha", () => {
  const cell = (o: Partial<CellListItem>): CellListItem => ({ id: "x", name: "Célula", day: "", time: "", location: "", supervisorId: null, supervisorName: "", leaderName: "", memberCount: 0, lastSession: null, missing: 0, ...o });
  it("filterCells: busca sem acento, supervisor e dia", () => {
    const list = [cell({ id: "1", name: "Célula Oliveira", day: "Quinta", supervisorId: "s1" }), cell({ id: "2", name: "Jovens", day: "Sábado" })];
    expect(filterCells(list, { q: "oliveira", sup: "", dia: "" }).map((c) => c.id)).toEqual(["1"]);
    expect(filterCells(list, { q: "CELULA", sup: "", dia: "" }).map((c) => c.id)).toEqual(["1"]);
    expect(filterCells(list, { q: "", sup: "s1", dia: "" }).map((c) => c.id)).toEqual(["1"]);
    expect(filterCells(list, { q: "", sup: "sem", dia: "" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterCells(list, { q: "", sup: "", dia: "Sábado" }).map((c) => c.id)).toEqual(["2"]);
  });
  const m = (name: string, streak: number, role: CellMember["role"] = "member"): CellMember => ({ stickId: name, name, role, joinedAt: "2026-01-01", lastPresent: null, streak, access: "has" });
  it("orderMembers: quem some vem primeiro", () => {
    expect(orderMembers([m("Bia", 0), m("Zé", 3), m("Ana", 0), m("Caio", 5)]).map((x) => x.name)).toEqual(["Caio", "Zé", "Ana", "Bia"]);
  });
  it("leadershipParts e listItemFromDetail: só quem existe", () => {
    const d: CellDetail = { id: "g", name: "G", day: "Quinta", time: "20:00", location: "", archived: false, supervisor: { id: "s", name: "João", access: "has" }, members: [m("Paulo", 0, "leader"), m("Ana", 3, "co_leader"), m("Rui", 0)], sessions: [{ date: "2026-10-08", cancelled: false, present: 2, of: 3 }] };
    expect(leadershipParts(d).map((p) => `${p.label} ${p.people.map((x) => x.name).join(", ")}`)).toEqual(["Líder Paulo", "Co-líder Ana", "Supervisor João"]);
    expect(listItemFromDetail(d)).toMatchObject({ leaderName: "Paulo", supervisorName: "João", memberCount: 3, missing: 1, lastSession: "2026-10-08" });
  });
});
