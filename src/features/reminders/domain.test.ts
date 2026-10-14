import { describe, expect, it } from "vitest";
import { buildReminders, nextBirthday, type ScheduleInput } from "./domain";

const today = "2026-10-14"; // quarta
const esc = (p: Partial<ScheduleInput>): ScheduleInput => ({ id: "a1", date: today, time: "19:30", role: "vocal", ministry: "Louvor", stickId: "s1", name: "Ana Souza", phone: "11988887777", confirmed: false, ...p });
const empty = { escalas: [], birthdays: [], care: [], forms: [] };

describe("lembretes", () => {
  it("acha o próximo aniversário e a idade", () => {
    expect(nextBirthday("1990-10-14", today)).toEqual({ date: "2026-10-14", age: 36 });
    expect(nextBirthday("1990-10-13", today)).toEqual({ date: "2027-10-13", age: 37 });
    expect(nextBirthday("2000-02-29", "2027-02-01")).toEqual({ date: "2027-02-28", age: 27 });
    expect(nextBirthday("ontem", today)).toBeNull();
  });

  it("escala de hoje e amanhã, com a mensagem pronta", () => {
    const r = buildReminders({ ...empty, escalas: [esc({}), esc({ id: "a2", date: "2026-10-15" }), esc({ id: "a3", date: "2026-10-16" }), esc({ id: "a4", date: "2026-10-13" })] }, today);
    expect(r.map((x) => [x.day, x.key])).toEqual([
      ["today", "rem:escala:a1:2026-10-14"],
      ["tomorrow", "rem:escala:a2:2026-10-14"],
    ]);
    expect(r[0]?.title).toBe("Ana Souza · Louvor, vocal");
    expect(r[0]?.wa).toContain("https://wa.me/5511988887777?text=");
    expect(decodeURIComponent(r[0]?.wa ?? "")).toContain("Oi Ana! Escala de Louvor");
  });

  it("sem telefone não tem WhatsApp", () => {
    expect(buildReminders({ ...empty, escalas: [esc({ phone: "" })] }, today)[0]?.wa).toBe("");
  });

  it("aniversários da semana", () => {
    const r = buildReminders({ ...empty, birthdays: [{ stickId: "s2", name: "Marcos Lima", phone: "", birthDate: "1992-10-16" }, { stickId: "s3", name: "Longe", phone: "", birthDate: "1992-11-30" }] }, today);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ day: "week", title: "Marcos Lima faz 34 anos", sub: "Aniversário sexta 16/10", key: "rem:niver:s2:2026-10-16" });
  });

  it("próximo passo atrasado vem para hoje; formulário só com resposta nova", () => {
    const r = buildReminders(
      { ...empty, care: [{ id: "c1", name: "Rui", nextStep: "Visitar", dueDate: "2026-10-10" }, { id: "c2", name: "Bia", nextStep: "Ligar", dueDate: "2026-10-20" }], forms: [{ id: "f1", title: "Visitantes", unseen: 2 }, { id: "f2", title: "Vazio", unseen: 0 }] },
      today,
    );
    expect(r.map((x) => x.title)).toEqual(["Visitar · Rui", "2 respostas novas · Visitantes"]);
    expect(r[0]?.sub).toBe("Cuidado · era para 10/10");
    expect(r[1]?.href).toBe("/forms?f=f1");
  });
});
