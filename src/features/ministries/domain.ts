// Lógica pura de Ministérios e escalas (spec 15). Sem Supabase, testável sozinha.
// Datas como texto ISO; horário "HH:MM" ou "" (dia inteiro). Reaproveita o calendário das Células.
import { WEEKDAYS, daysBetween, firstName, parseTime, timeLabel, weekdayIndex } from "@/features/groups/domain";
import { whatsappLink } from "@/features/sticks/domain";
import type { Assignment, Conflict, MinistryDetail, MinistryListItem, MinistryMember } from "./types";

export const MINISTRY_ROLES = [
  ["leader", "Líder"],
  ["co_leader", "Co-líder"],
  ["member", "Serve"],
] as const;
export const ministryRoleLabel = (r: string): string => MINISTRY_ROLES.find(([k]) => k === r)?.[1] ?? "Serve";

export const STACK_SIZE = 4;
export const UPCOMING = 4; // cultos na ficha
export const RECENT_DAYS = 30; // janela do "Serviu 2x no último mês"
export const HISTORY_DAYS = 35; // quanto de escala passada a ficha carrega

/** "19:00:00" (do banco) ou "19h" -> "19:00"; "" se vazio ou inválido. */
export const normTime = (t: string | null | undefined): string => parseTime((t ?? "").slice(0, 5)) ?? "";

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Próximo dia do culto a partir de hoje (hoje, se for o dia); sem dia padrão = hoje. */
export function nextServiceDate(day: string | null | undefined, today: string): string {
  const want = weekdayIndex(day);
  if (want < 0) return today;
  return addDays(today, (want - weekdayOf(today) + 7) % 7);
}

export const serviceKey = (date: string, time: string): string => `${date}|${time}`;
const live = (a: Assignment) => a.status !== "declined";

/** Próximos cultos: os que já têm escala a partir de hoje + o próximo do dia padrão (se houver); em ordem, até `n`. */
export function upcomingServices(d: Pick<MinistryDetail, "day" | "time" | "assignments">, today: string, n = UPCOMING): { date: string; time: string }[] {
  const seen = new Map<string, { date: string; time: string }>();
  const add = (date: string, time: string) => seen.set(serviceKey(date, time), { date, time });
  for (const a of d.assignments) if (a.date >= today && live(a)) add(a.date, a.time);
  if (weekdayIndex(d.day) >= 0) add(nextServiceDate(d.day, today), normTime(d.time));
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, n);
}

/** Vagas de uma função (mínimo 1). */
export const slotsFor = (slots: Record<string, number>, role: string): number => Math.max(1, Math.floor(slots[role] ?? 1));

/** Escalados de um culto (sem os que recusaram). */
export const assignmentsOf = (all: Assignment[], date: string, time: string): Assignment[] =>
  all.filter((a) => a.date === date && a.time === time && live(a));

/** Cadeiras de cada função num culto: escalados primeiro, depois vagas vazias (null). */
export function seats(d: Pick<MinistryDetail, "roles" | "slots" | "assignments">, date: string, time: string): { role: string; seats: (Assignment | null)[] }[] {
  const here = assignmentsOf(d.assignments, date, time);
  const roles = [...d.roles, ...new Set(here.map((a) => a.role).filter((r) => !d.roles.includes(r)))];
  return roles.map((role) => {
    const taken = here.filter((a) => a.role === role);
    const empty = Math.max(0, slotsFor(d.slots, role) - taken.length);
    return { role, seats: [...taken, ...Array<null>(empty).fill(null)] };
  });
}

/** Quantas vagas faltam num culto. */
export const openSlots = (d: Pick<MinistryDetail, "roles" | "slots" | "assignments">, date: string, time: string): number =>
  seats(d, date, time).reduce((n, r) => n + r.seats.filter((s) => s === null).length, 0);

export const openLabel = (n: number): string => `${n} ${n === 1 ? "vaga" : "vagas"}`;

/** Outro ministério com a pessoa no mesmo dia e horário (dia inteiro conflita com qualquer horário). */
export function conflictFor(stickId: string, time: string, conflicts: Conflict[]): Conflict | null {
  return conflicts.find((c) => c.stickId === stickId && (c.time === time || !c.time || !time)) ?? null;
}

/** Quantas vezes cada pessoa serviu (escala não recusada) nos últimos 30 dias até hoje. */
export function recentCounts(all: Assignment[], today: string): Map<string, number> {
  const from = addDays(today, -RECENT_DAYS);
  const n = new Map<string, number>();
  for (const a of all) if (live(a) && a.date >= from && a.date <= today) n.set(a.stickId, (n.get(a.stickId) ?? 0) + 1);
  return n;
}

export const servedLabel = (n: number): string => (n === 0 ? "Não serviu no último mês" : `Serviu ${n}x no último mês`);

export interface Suggestion {
  member: MinistryMember;
  served: number;
  doesRole: boolean;
  conflict: Conflict | null;
}

/** Sugestões para uma vaga: quem faz a função (menos escalado antes, depois por nome), depois o resto do
 *  ministério; quem tem conflito de horário vai para o fim. Quem já está neste culto não aparece. */
export function suggestPeople(role: string, members: MinistryMember[], all: Assignment[], date: string, time: string, today: string, conflicts: Conflict[]): Suggestion[] {
  const busy = new Set(assignmentsOf(all, date, time).map((a) => a.stickId));
  const counts = recentCounts(all, today);
  return members
    .filter((m) => !busy.has(m.stickId))
    .map((m) => ({ member: m, served: counts.get(m.stickId) ?? 0, doesRole: m.roles.includes(role), conflict: conflictFor(m.stickId, time, conflicts) }))
    .sort(
      (a, b) =>
        Number(Boolean(a.conflict)) - Number(Boolean(b.conflict)) ||
        Number(b.doesRole) - Number(a.doesRole) ||
        a.served - b.served ||
        a.member.name.localeCompare(b.member.name, "pt-BR"),
    );
}

/** "domingo 19/10 às 19h" */
export function serviceLabel(date: string, time: string): string {
  const day = (WEEKDAYS[weekdayOf(date)] ?? "").toLowerCase();
  const t = timeLabel(time);
  return `${day} ${date.slice(8, 10)}/${date.slice(5, 7)}${t ? ` às ${t}` : ""}`;
}
/** "Dom 19/10 · 19h" (cartões e topo da escala). */
export function serviceShort(date: string, time: string): string {
  const day = (WEEKDAYS[weekdayOf(date)] ?? "").slice(0, 3);
  const t = timeLabel(time);
  return `${day} ${date.slice(8, 10)}/${date.slice(5, 7)}${t ? ` · ${t}` : ""}`;
}

/** Mensagem pronta do WhatsApp (sem gênero da pessoa nem do ministério: "do Louvor" / "da Recepção"). */
export function whatsappText(name: string, ministry: string, date: string, time: string, role: string): string {
  return `Oi ${firstName(name)}! Escala de ${ministry}: ${serviceLabel(date, time)}, função ${role}. Pode confirmar?`;
}
/** Link do WhatsApp com a mensagem; "" se não há telefone. */
export function waLink(phone: string, text: string): string {
  const base = whatsappLink(phone);
  return base ? `${base}?text=${encodeURIComponent(text)}` : "";
}

/** Culto anterior com escala no mesmo horário (para "Repetir a escala anterior"). */
export function previousService(all: Assignment[], date: string, time: string): string | null {
  const dates = all.filter((a) => live(a) && a.time === time && a.date < date).map((a) => a.date);
  return dates.length ? dates.sort().at(-1)! : null;
}

/** O que copiar do culto anterior: as mesmas pessoas e funções, sem quem tem conflito e sem passar das vagas. */
export function repeatPlan(d: Pick<MinistryDetail, "roles" | "slots" | "assignments" | "members">, from: string, date: string, time: string, conflicts: Conflict[]): { role: string; stickId: string }[] {
  const active = new Set(d.members.map((m) => m.stickId));
  const used = new Map<string, number>();
  const out: { role: string; stickId: string }[] = [];
  for (const a of assignmentsOf(d.assignments, from, time)) {
    if (!active.has(a.stickId) || conflictFor(a.stickId, time, conflicts) || out.some((o) => o.stickId === a.stickId)) continue;
    const n = used.get(a.role) ?? 0;
    if (n >= slotsFor(d.slots, a.role)) continue;
    used.set(a.role, n + 1);
    out.push({ role: a.role, stickId: a.stickId });
  }
  return out;
}

/** Lê o jsonb de funções/vagas do banco sem confiar no formato. */
export function readRoles(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()))] : [];
}
export function readSlots(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v))
    for (const [k, n] of Object.entries(v)) if (typeof n === "number" && n >= 1) out[k] = Math.min(20, Math.floor(n));
  return out;
}

/** Nome de função limpo ("vocal " -> "Vocal"); "" se inválido. */
export function cleanRole(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t || t.length > 40) return "";
  return t[0]!.toUpperCase() + t.slice(1);
}

/** A linha da lista refeita a partir da ficha. */
export function listItemFromDetail(d: MinistryDetail, today: string): MinistryListItem {
  const next = upcomingServices(d, today, 1)[0] ?? null;
  const rank = (r: string) => (r === "leader" ? 0 : r === "co_leader" ? 1 : 2);
  return {
    id: d.id,
    name: d.name,
    memberCount: d.members.length,
    faces: [...d.members].sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name, "pt-BR")).slice(0, STACK_SIZE).map(({ name, photoUrl }) => ({ name, photoUrl })),
    next,
    open: next && d.roles.length ? openSlots(d, next.date, next.time) : 0,
  };
}

/** "Próximo: dom 19/10" */
export function nextLabel(next: { date: string; time: string } | null, today: string): string {
  if (!next) return "";
  const days = daysBetween(today, next.date);
  return days === 0 ? "Hoje" : `Próximo: ${serviceShort(next.date, "").toLowerCase()}`;
}
