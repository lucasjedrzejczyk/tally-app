import { describe, expect, it, vi, afterEach } from "vitest";
import { isPrunable, newPrayerToken, splitPrayers, type PrayerRequest } from "./domain";

afterEach(() => vi.useRealTimers());

const p = (id: string, over: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id,
  author: "Ana",
  request: "x",
  privacy: "church",
  praying: 0,
  answered: false,
  answeredDate: null,
  date: "2026-10-01",
  pending: false,
  contact: "",
  ...over,
});

describe("isPrunable (+30 dias)", () => {
  it("respondida sem data nunca some", () => expect(isPrunable({ answered: true, answeredDate: null })).toBe(false));
  it("respondida há 40 dias some; há 10 fica", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T12:00:00"));
    expect(isPrunable({ answered: true, answeredDate: "2026-09-02" })).toBe(true);
    expect(isPrunable({ answered: true, answeredDate: "2026-10-02" })).toBe(false);
  });
});

describe("splitPrayers", () => {
  it("separa pendentes, mural e respondidas, mais novos primeiro", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T12:00:00"));
    const r = splitPrayers([
      p("a", { date: "2026-10-01" }),
      p("b", { date: "2026-10-05" }),
      p("c", { pending: true }),
      p("d", { answered: true, answeredDate: "2026-10-10" }),
      p("e", { answered: true, answeredDate: "2026-08-01" }),
    ]);
    expect(r.pending.map((x) => x.id)).toEqual(["c"]);
    expect(r.wall.map((x) => x.id)).toEqual(["b", "a"]);
    expect(r.answered.map((x) => x.id)).toEqual(["d"]);
  });
});

describe("newPrayerToken", () => {
  it("vira texto do mesmo tamanho, sem letras que confundem", () => {
    const t = newPrayerToken(new Uint8Array([0, 31, 32, 255, 8, 11]));
    expect(t).toHaveLength(6);
    expect(t).toMatch(/^[a-km-np-z2-9]+$/);
  });
});
