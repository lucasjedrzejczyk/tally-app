import { describe, expect, it } from "vitest";
import {
  ageLabel,
  ageMonths,
  birthdayThisWeek,
  callGuardianMessage,
  cleanCode,
  codeMessage,
  currentService,
  formatPhone,
  isCode,
  joinNames,
  matchesBlocked,
  newCode,
  phoneReady,
  rangeLabel,
  roomFor,
  SUGGESTED_ROOMS,
} from "./domain";

const rooms = SUGGESTED_ROOMS.map((r, i) => ({ ...r, id: r.name, active: true, position: i }));

describe("idade e sala", () => {
  it("ageMonths conta meses completos", () => {
    expect(ageMonths("2024-10-12", "2026-10-12")).toBe(24);
    expect(ageMonths("2024-10-13", "2026-10-12")).toBe(23);
    expect(ageMonths("2026-10-01", "2026-10-12")).toBe(0);
  });
  it("ageLabel", () => {
    expect(ageLabel(0)).toBe("Recém-nascido");
    expect(ageLabel(1)).toBe("1 mês");
    expect(ageLabel(8)).toBe("8 meses");
    expect(ageLabel(12)).toBe("1 ano");
    expect(ageLabel(65)).toBe("5 anos");
  });
  it("rangeLabel", () => {
    expect(rangeLabel(0, 35)).toBe("0 a 2 anos");
    expect(rangeLabel(36, 47)).toBe("3 anos");
  });
  it("roomFor escolhe pela idade e ignora sala inativa", () => {
    expect(roomFor(rooms, "2025-01-01", "2026-10-12")?.name).toBe("Berçário");
    expect(roomFor(rooms, "2021-05-01", "2026-10-12")?.name).toBe("Maternal");
    expect(roomFor(rooms, "2010-05-01", "2026-10-12")).toBeNull();
    expect(roomFor(rooms, null, "2026-10-12")).toBeNull();
    const off = rooms.map((r) => (r.name === "Maternal" ? { ...r, active: false } : r));
    expect(roomFor(off, "2021-05-01", "2026-10-12")).toBeNull();
  });
});

describe("código", () => {
  it("newCode evita os já usados e os ambíguos", () => {
    let i = 0;
    const seq = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const c = newCode(new Set(["AAAA"]), () => seq[i++ % seq.length]!);
    expect(c).not.toBe("AAAA");
    expect(isCode(c)).toBe(true);
    for (let k = 0; k < 50; k++) expect(newCode(new Set())).toMatch(/^[A-HJKMNP-Z2-9]{4}$/);
  });
  it("cleanCode tira o que não pode e corta em 4", () => {
    expect(cleanCode("k7 px9")).toBe("K7PX");
    expect(cleanCode("O0I1")).toBe("");
  });
});

describe("telefone", () => {
  it("formatPhone monta a máscara enquanto digita", () => {
    expect(formatPhone("4")).toBe("(4");
    expect(formatPhone("479")).toBe("(47) 9");
    expect(formatPhone("4799999")).toBe("(47) 99999");
    expect(formatPhone("47999990000")).toBe("(47) 99999-0000");
    expect(formatPhone("4733330000")).toBe("(47) 3333-0000");
  });
  it("phoneReady só com 11 dígitos", () => {
    expect(phoneReady("(47) 99999-000")).toBe(false);
    expect(phoneReady("(47) 99999-0000")).toBe(true);
  });
});

describe("culto de agora", () => {
  const sv = [
    { id: "m", name: "Manhã", weekday: 0, monthWeek: null, startTime: "10:00" },
    { id: "n", name: "Noite", weekday: 0, monthWeek: null, startTime: "19:00" },
    { id: "q", name: "Quarta", weekday: 3, monthWeek: null, startTime: "20:00" },
  ];
  it("dentro da janela", () => {
    expect(currentService(sv, "2026-10-11", "09:10")?.id).toBe("m");
    expect(currentService(sv, "2026-10-11", "12:30")?.id).toBe("m");
    expect(currentService(sv, "2026-10-11", "18:30")?.id).toBe("n");
  });
  it("fora da janela, o mais perto; sem culto no dia, null", () => {
    expect(currentService(sv, "2026-10-11", "15:00")?.id).toBe("n");
    expect(currentService(sv, "2026-10-12", "19:00")).toBeNull();
  });
});

describe("textos", () => {
  it("birthdayThisWeek", () => {
    expect(birthdayThisWeek("2021-10-12", "2026-10-12")).toBe("Faz 5 anos hoje");
    expect(birthdayThisWeek("2021-10-15", "2026-10-12")).toBe("Faz 5 anos quinta");
    expect(birthdayThisWeek("2021-10-25", "2026-10-12")).toBeNull();
    expect(birthdayThisWeek("2021-01-02", "2026-12-30")).toBe("Faz 6 anos sábado");
  });
  it("nomes e mensagens", () => {
    expect(joinNames(["Theo Souza"])).toBe("Theo");
    expect(joinNames(["Theo Souza", "Bia Souza", "Lu"])).toBe("Theo, Bia e Lu");
    expect(codeMessage(["Theo Souza", "Bia Souza"], "K7PX")).toBe("Código de retirada de Theo e Bia: K7PX. Mostre na saída da sala.");
    expect(callGuardianMessage("Ana Souza", "Maternal", "Theo Souza")).toBe("Oi, Ana! Pode vir até a sala Maternal? É sobre Theo.");
  });
  it("matchesBlocked erra para o lado seguro", () => {
    expect(matchesBlocked("Carlos Souza", "Carlos (pai), guarda judicial")).toBe(true);
    expect(matchesBlocked("Cárlos", "carlos")).toBe(true);
    expect(matchesBlocked("Ana Souza", "Carlos (pai)")).toBe(false);
    expect(matchesBlocked("Ana", null)).toBe(false);
  });
});
