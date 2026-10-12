import { describe, expect, it } from "vitest";
import type { MinistryDetail } from "@/features/ministries/types";
import { dayShort, inviteText, occurrences, parseCount, parseKey, servingAt, trend, weekCards, weekLabel, weekStart } from "./domain";
import type { EventItem, Service } from "./types";

// 2026-10-18 é domingo.
const SVC = "11111111-1111-1111-1111-111111111111";
const EV = "22222222-2222-2222-2222-222222222222";
const sunday: Service = { id: SVC, name: "Culto da Família", weekday: 0, time: "19:00", location: "Rua X, 100" };
const wed: Service = { id: "33333333-3333-3333-3333-333333333333", name: "Oração", weekday: 3, time: "20:00", location: "" };
const retiro: EventItem = { id: EV, name: "Retiro", date: "2026-10-24", time: "08:00", location: "", description: "", registration: true, capacity: 40, registered: 12 };

const louvor: MinistryDetail = {
  id: "m1",
  name: "Louvor",
  serviceId: SVC,
  day: "Domingo",
  time: "19:00",
  roles: ["Vocal", "Som"],
  slots: { Vocal: 2 },
  members: [{ stickId: "ana", name: "Ana Souza", role: "leader", roles: ["Vocal"], phone: "", photoUrl: null, access: "noEmail" }],
  assignments: [{ id: "a1", date: "2026-10-18", time: "19:00", role: "Vocal", stickId: "ana", status: "confirmed", notifiedAt: null }],
};
const recep: MinistryDetail = { ...louvor, id: "m2", name: "Recepção", serviceId: null, roles: ["Porta"], slots: {}, assignments: [] };

describe("semana", () => {
  it("começa no domingo", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-18");
    expect(weekStart("2026-10-18")).toBe("2026-10-18");
  });
  it("rótulos", () => {
    expect(dayShort("2026-10-18")).toBe("Dom 18/10");
    expect(weekLabel("2026-10-18")).toBe("18 a 24 de outubro");
    expect(weekLabel("2026-09-27")).toBe("27/09 a 03/10");
  });
  it("cultos pelo dia da semana, eventos pela data, cancelado marcado, em ordem", () => {
    const dates = [{ id: "d", serviceId: wed.id, date: "2026-10-21", headcount: null, visitors: null, kids: null, sermonId: null, cancelled: true }];
    const list = occurrences([sunday, wed], [retiro], dates, "2026-10-18", "2026-10-24");
    expect(list.map((o) => [o.date, o.name, o.cancelled])).toEqual([
      ["2026-10-18", "Culto da Família", false],
      ["2026-10-21", "Oração", true],
      ["2026-10-24", "Retiro", false],
    ]);
    expect(list[0]!.key).toBe(`s:${SVC}:2026-10-18`);
  });
});

describe("quem serve", () => {
  it("ministério ligado ao culto aparece mesmo sem escala; outro só com escala no horário", () => {
    const s = servingAt([louvor, recep], SVC, "2026-10-18", "19:00");
    expect(s.map((x) => [x.ministry.name, x.faces.length, x.open])).toEqual([["Louvor", 1, 2]]);
    expect(servingAt([louvor, recep], SVC, "2026-10-25", "19:00")[0]!.open).toBe(3);
  });
  it("cartão soma vagas e não conta cancelado", () => {
    const list = occurrences([sunday], [], [], "2026-10-18", "2026-10-24");
    expect(weekCards(list, [louvor])[0]).toMatchObject({ open: 2, faces: [{ stickId: "ana", status: "confirmed" }] });
    expect(weekCards([{ ...list[0]!, cancelled: true }], [louvor])[0]).toMatchObject({ open: 0, faces: [] });
  });
});

describe("convite, contagem e chave", () => {
  it("texto do convite", () => {
    expect(inviteText({ date: "2026-10-18", time: "19:00", name: "Culto da Família", location: "Rua X, 100" })).toBe("Domingo, 18/10 às 19h: Culto da Família. Rua X, 100. Te esperamos!");
    expect(inviteText({ date: "2026-10-21", time: "", name: "Oração", location: "" })).toBe("Quarta, 21/10: Oração. Te esperamos!");
  });
  it("número da contagem", () => {
    expect(parseCount(" 132 ")).toBe(132);
    expect(parseCount("")).toBeNull();
    expect(parseCount("12a")).toBeUndefined();
  });
  it("barras e média até a data", () => {
    const t = trend([{ date: "2026-10-04", headcount: 100 }, { date: "2026-10-11", headcount: 120 }, { date: "2026-10-25", headcount: 999 }], "2026-10-18");
    expect(t.points.map((p) => p.headcount)).toEqual([100, 120]);
    expect(t.avg).toBe(110);
  });
  it("chave da URL", () => {
    expect(parseKey(`s:${SVC}:2026-10-18`)).toEqual({ kind: "service", id: SVC, date: "2026-10-18" });
    expect(parseKey(`e:${EV}`)).toEqual({ kind: "event", id: EV });
    expect(parseKey("s:x:2026")).toBeNull();
  });
});
