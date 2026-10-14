// Lembretes (spec 19, fase B): lógica pura. Junta escalas, aniversários, próximos passos do Cuidado
// e respostas novas de formulário numa lista por dia, com a mensagem pronta do WhatsApp.
import { daysBetween, firstName, WEEKDAYS } from "@/features/groups/domain";
import { addDays, serviceLabel, waLink, whatsappText } from "@/features/ministries/domain";

export type ReminderKind = "escala" | "niver" | "cuidado" | "form";
export type ReminderDay = "today" | "tomorrow" | "week";
export interface Reminder {
  key: string; // marca de "lembrado" em signal_overrides; tem a data, então volta sozinho no dia seguinte
  kind: ReminderKind;
  date: string;
  day: ReminderDay;
  name: string; // rosto da linha
  title: string;
  sub: string;
  wa: string; // link do WhatsApp com a mensagem ("" = sem telefone)
  href: string; // para onde "Abrir" leva (Cuidado, Formulário, ficha da pessoa)
}

export interface ScheduleInput {
  id: string;
  date: string;
  time: string;
  role: string;
  ministry: string;
  stickId: string;
  name: string;
  phone: string;
  confirmed: boolean;
}
export interface BirthdayInput {
  stickId: string;
  name: string;
  phone: string;
  birthDate: string;
}
export interface CareInput {
  id: string;
  name: string;
  nextStep: string;
  dueDate: string;
}
export interface FormInput {
  id: string;
  title: string;
  unseen: number;
}

export const ESCALA_DAYS = 1; // hoje e amanhã
export const NIVER_DAYS = 6; // hoje e os próximos 6 dias

const dayOf = (date: string, today: string): ReminderDay => {
  const d = daysBetween(today, date);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : "week";
};
const weekday = (iso: string): string => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";
const short = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Próximo aniversário (data ISO) a partir de hoje e a idade que a pessoa faz. 29/02 vira 28/02 em ano comum. */
export function nextBirthday(birthDate: string, today: string): { date: string; age: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  const at = (year: number): string => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return `${year}-${mo}-${mo === "02" && d === "29" && !leap ? "28" : d}`;
  };
  const year = Number(today.slice(0, 4));
  const date = at(year) >= today ? at(year) : at(year + 1);
  return { date, age: Number(date.slice(0, 4)) - Number(y) };
}

export function buildReminders(
  input: { escalas: ScheduleInput[]; birthdays: BirthdayInput[]; care: CareInput[]; forms: FormInput[] },
  today: string,
): Reminder[] {
  const out: Reminder[] = [];
  const lastEscala = addDays(today, ESCALA_DAYS);
  for (const e of input.escalas) {
    if (e.date < today || e.date > lastEscala) continue;
    out.push({
      key: `rem:escala:${e.id}:${today}`,
      kind: "escala",
      date: e.date,
      day: dayOf(e.date, today),
      name: e.name,
      title: `${e.name} · ${e.ministry}${e.role ? `, ${e.role}` : ""}`,
      sub: `Escala ${serviceLabel(e.date, e.time)}${e.confirmed ? " · confirmou" : ""}`,
      wa: e.phone ? waLink(e.phone, whatsappText(e.name, e.ministry, e.date, e.time, e.role)) : "",
      href: `/people?p=${e.stickId}`,
    });
  }
  const lastNiver = addDays(today, NIVER_DAYS);
  for (const b of input.birthdays) {
    const n = nextBirthday(b.birthDate, today);
    if (!n || n.date > lastNiver || n.age <= 0) continue;
    const when = n.date === today ? "hoje" : `${weekday(n.date).toLowerCase()} ${short(n.date)}`;
    out.push({
      key: `rem:niver:${b.stickId}:${n.date}`,
      kind: "niver",
      date: n.date,
      day: dayOf(n.date, today),
      name: b.name,
      title: `${b.name} faz ${n.age} anos`,
      sub: `Aniversário ${when}`,
      wa: b.phone ? waLink(b.phone, `Feliz aniversário, ${firstName(b.name)}! Que Deus abençoe seu novo ano. Um abraço da sua igreja.`) : "",
      href: `/people?p=${b.stickId}`,
    });
  }
  for (const c of input.care) {
    if (!c.dueDate || c.dueDate > addDays(today, 1)) continue;
    const date = c.dueDate < today ? today : c.dueDate;
    out.push({
      key: `rem:cuidado:${c.id}:${today}`,
      kind: "cuidado",
      date,
      day: dayOf(date, today),
      name: c.name,
      title: `${c.nextStep || "Próximo passo"} · ${c.name}`,
      sub: c.dueDate < today ? `Cuidado · era para ${short(c.dueDate)}` : "Cuidado · próximo passo",
      wa: "",
      href: `/care?c=${c.id}`,
    });
  }
  for (const f of input.forms) {
    if (f.unseen <= 0) continue;
    out.push({
      key: `rem:form:${f.id}:${today}:${f.unseen}`,
      kind: "form",
      date: today,
      day: "today",
      name: f.title,
      title: `${f.unseen === 1 ? "1 resposta nova" : `${f.unseen} respostas novas`} · ${f.title}`,
      sub: "Formulário",
      wa: "",
      href: `/forms?f=${f.id}`,
    });
  }
  const order: Record<ReminderKind, number> = { cuidado: 0, escala: 1, niver: 2, form: 3 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.title.localeCompare(b.title, "pt-BR"));
}

export const DAY_TITLE: Record<ReminderDay, string> = { today: "Hoje", tomorrow: "Amanhã", week: "Próximos dias" };
