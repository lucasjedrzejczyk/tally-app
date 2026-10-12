import { describe, expect, it } from "vitest";
import {
  cleanRole,
  conflictFor,
  listItemFromDetail,
  nextServiceDate,
  normTime,
  openSlots,
  previousService,
  readRoles,
  readSlots,
  repeatPlan,
  seats,
  servedLabel,
  serviceLong,
  suggestPeople,
  upcomingServices,
  waLink,
  whatsappText,
} from "./domain";
import type { Assignment, MinistryDetail, MinistryMember } from "./types";

const mem = (stickId: string, name: string, roles: string[], role: MinistryMember["role"] = "member"): MinistryMember => ({ stickId, name, roles, role, phone: "", photoUrl: null, access: "noEmail" });
let n = 0;
const asg = (date: string, role: string, stickId: string, extra: Partial<Assignment> = {}): Assignment => ({ id: `a${++n}`, date, time: "19:00", role, stickId, status: "assigned", notifiedAt: null, ...extra });

// 2026-10-12 é segunda; 2026-10-18 é domingo.
const TODAY = "2026-10-12";
const base: MinistryDetail = {
  id: "m1",
  name: "Louvor",
  serviceId: null,
  day: "Domingo",
  time: "19:00",
  roles: ["Vocal", "Som"],
  slots: { Vocal: 2 },
  members: [mem("ana", "Ana Souza", ["Vocal"], "leader"), mem("bia", "Bia Lima", ["Vocal"]), mem("caio", "Caio Reis", ["Som", "Vocal"])],
  assignments: [],
};

describe("datas e horários", () => {
  it("próximo domingo a partir de segunda", () => expect(nextServiceDate("Domingo", TODAY)).toBe("2026-10-18"));
  it("hoje quando é o dia", () => expect(nextServiceDate("Segunda", TODAY)).toBe(TODAY));
  it("sem dia padrão = hoje", () => expect(nextServiceDate("", TODAY)).toBe(TODAY));
  it("rótulo longo do culto", () => expect(serviceLong("2026-10-18", "19:00")).toBe("Domingo, 18/10 · 19h"));
  it("normaliza o horário do banco", () => {
    expect(normTime("19:00:00")).toBe("19:00");
    expect(normTime(null)).toBe("");
  });
});

describe("vagas", () => {
  it("cadeiras por função com vagas vazias", () => {
    const d = { ...base, assignments: [asg("2026-10-18", "Vocal", "ana")] };
    const s = seats(d, "2026-10-18", "19:00");
    expect(s.map((r) => [r.role, r.seats.length, r.seats.filter((x) => x === null).length])).toEqual([["Vocal", 2, 1], ["Som", 1, 1]]);
    expect(openSlots(d, "2026-10-18", "19:00")).toBe(2);
  });
  it("recusa reabre a vaga", () => {
    const d = { ...base, assignments: [asg("2026-10-18", "Som", "caio", { status: "declined" })] };
    expect(openSlots(d, "2026-10-18", "19:00")).toBe(3);
  });
  it("sem dia padrão nem escala, não inventa culto", () => expect(upcomingServices({ ...base, day: "" }, TODAY)).toEqual([]));
  it("próximos cultos incluem o dia padrão e escalas já feitas", () => {
    const d = { ...base, assignments: [asg("2026-10-25", "Vocal", "ana"), asg("2026-10-05", "Vocal", "ana")] };
    expect(upcomingServices(d, TODAY)).toEqual([{ date: "2026-10-18", time: "19:00" }, { date: "2026-10-25", time: "19:00" }]);
  });
});

describe("sugestões e conflitos", () => {
  it("quem faz a função e serviu menos vem primeiro; conflito por último; quem já está fica fora", () => {
    const all = [asg("2026-10-05", "Vocal", "ana"), asg("2026-10-18", "Som", "caio")];
    const conflicts = [{ stickId: "bia", time: "19:00", ministryName: "Recepção", role: "Porta" }];
    const s = suggestPeople("Vocal", base.members, all, "2026-10-18", "19:00", TODAY, conflicts);
    expect(s.map((x) => x.member.stickId)).toEqual(["ana", "bia"]);
    expect(s[0]!.served).toBe(1);
    expect(s[1]!.conflict?.ministryName).toBe("Recepção");
  });
  it("dia inteiro conflita com qualquer horário; horários diferentes não", () => {
    expect(conflictFor("a", "10:00", [{ stickId: "a", time: "", ministryName: "X", role: "" }])).not.toBeNull();
    expect(conflictFor("a", "10:00", [{ stickId: "a", time: "19:00", ministryName: "X", role: "" }])).toBeNull();
  });
  it("rótulo de quantas vezes serviu", () => {
    expect(servedLabel(0)).toBe("Não serviu no último mês");
    expect(servedLabel(2)).toBe("Serviu 2x no último mês");
  });
});

describe("WhatsApp", () => {
  it("mensagem pronta sem gênero", () =>
    expect(whatsappText("Ana Souza", "Louvor", "2026-10-18", "19:00", "Vocal")).toBe("Oi Ana! Escala de Louvor: domingo 18/10 às 19h, função Vocal. Pode confirmar?"));
  it("link com DDI 55 e texto", () => expect(waLink("(11) 98888-7777", "Oi!")).toBe("https://wa.me/5511988887777?text=Oi!"));
  it("sem telefone, sem link", () => expect(waLink("", "Oi")).toBe(""));
});

describe("repetir a escala anterior", () => {
  it("copia as pessoas do culto anterior do mesmo horário, sem conflito nem passar das vagas", () => {
    const d = {
      ...base,
      assignments: [asg("2026-10-11", "Vocal", "ana"), asg("2026-10-11", "Vocal", "bia"), asg("2026-10-11", "Som", "caio"), asg("2026-10-04", "Som", "bia")],
    };
    const from = previousService(d.assignments, "2026-10-18", "19:00");
    expect(from).toBe("2026-10-11");
    const plan = repeatPlan({ ...d, slots: { Vocal: 1 } }, from!, "2026-10-18", "19:00", [{ stickId: "caio", time: "19:00", ministryName: "X", role: "" }]);
    expect(plan).toEqual([{ role: "Vocal", stickId: "ana" }]);
  });
});

describe("leitura do banco", () => {
  it("funções e vagas", () => {
    expect(readRoles(["Vocal", " Som ", 3, "", "Vocal"])).toEqual(["Vocal", "Som"]);
    expect(readSlots({ Vocal: 2, Som: 0, X: "a" })).toEqual({ Vocal: 2 });
    expect(cleanRole("  backing  vocal ")).toBe("Backing vocal");
    expect(cleanRole("")).toBe("");
  });
  it("cartão da lista com vagas do próximo culto", () => {
    const item = listItemFromDetail({ ...base, assignments: [asg("2026-10-18", "Vocal", "bia")] }, TODAY);
    expect(item.next).toEqual({ date: "2026-10-18", time: "19:00" });
    expect(item.open).toBe(2);
    expect(item.faces[0]!.name).toBe("Ana Souza");
  });
});
