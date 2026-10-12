// Lógica pura de Encontros (spec 16): a semana, quem serve em cada encontro, convite e contagens.
import { WEEKDAYS, timeLabel } from "@/features/groups/domain";
import { addDays, assignmentsOf, openSlots, serviceLabel, serviceLong } from "@/features/ministries/domain";
import type { MinistryDetail } from "@/features/ministries/types";
import type { CountPoint, EventItem, Occurrence, Service, ServiceDate, Serving, WeekCard } from "./types";

export const TREND = 8; // contagens nas barras
export const UNDO_MS = 5000;

const weekdayOf = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Domingo da semana da data (a semana da igreja começa no domingo). */
export const weekStart = (iso: string): string => addDays(iso, -weekdayOf(iso));
export const weekDays = (start: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

/** "Dom 18/10" */
export const dayShort = (iso: string): string => `${(WEEKDAYS[weekdayOf(iso)] ?? "").slice(0, 3)} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "18 a 24 de outubro" ou "28/09 a 04/10" quando vira o mês. */
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  if (start.slice(5, 7) === end.slice(5, 7)) return `${Number(start.slice(8, 10))} a ${Number(end.slice(8, 10))} de ${MONTHS[Number(start.slice(5, 7)) - 1]}`;
  return `${start.slice(8, 10)}/${start.slice(5, 7)} a ${end.slice(8, 10)}/${end.slice(5, 7)}`;
}

export const serviceKeyOf = (serviceId: string, date: string): string => `s:${serviceId}:${date}`;
export const eventKeyOf = (eventId: string): string => `e:${eventId}`;
/** Lê a chave da URL; null se não for válida. */
export function parseKey(key: string | null | undefined): { kind: "service"; id: string; date: string } | { kind: "event"; id: string } | null {
  const s = /^s:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/.exec(key ?? "");
  if (s) return { kind: "service", id: s[1]!, date: s[2]! };
  const e = /^e:([0-9a-f-]{36})$/.exec(key ?? "");
  return e ? { kind: "event", id: e[1]! } : null;
}

/** Encontros de um período: cultos pelo dia da semana (cancelados marcados) + eventos; em ordem. */
export function occurrences(services: Service[], events: EventItem[], dates: ServiceDate[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const cancelled = new Set(dates.filter((d) => d.cancelled).map((d) => `${d.serviceId}|${d.date}`));
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const s of services) {
      if (s.weekday !== weekdayOf(day)) continue;
      out.push({ key: serviceKeyOf(s.id, day), kind: "service", id: s.id, date: day, time: s.time, name: s.name, location: s.location, cancelled: cancelled.has(`${s.id}|${day}`), registration: false, registered: 0 });
    }
  }
  for (const e of events) {
    if (e.date < from || e.date > to) continue;
    out.push({ key: eventKeyOf(e.id), kind: "event", id: e.id, date: e.date, time: e.time, name: e.name, location: e.location, cancelled: false, registration: e.registration, registered: e.registered });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99") || a.name.localeCompare(b.name, "pt-BR"));
}

/** Ministérios que servem num encontro: os ligados ao culto + os que têm escala no mesmo dia e horário. */
export function servingAt(ministries: MinistryDetail[], serviceId: string | null, date: string, time: string): Serving[] {
  return ministries
    .filter((m) => (serviceId && m.serviceId === serviceId) || assignmentsOf(m.assignments, date, time).length > 0)
    .map((m) => {
      const byId = new Map(m.members.map((p) => [p.stickId, p]));
      const faces = assignmentsOf(m.assignments, date, time).map((a) => ({
        stickId: a.stickId,
        name: byId.get(a.stickId)?.name ?? "",
        photoUrl: byId.get(a.stickId)?.photoUrl ?? null,
        status: a.status,
        notified: Boolean(a.notifiedAt),
      }));
      return { ministry: m, faces, open: m.roles.length ? openSlots(m, date, time) : 0 };
    })
    .sort((a, b) => a.ministry.name.localeCompare(b.ministry.name, "pt-BR"));
}

/** Cartões da semana com os rostos de quem serve (sem repetir a pessoa) e as vagas somadas. */
export function weekCards(list: Occurrence[], ministries: MinistryDetail[]): WeekCard[] {
  return list.map((o) => {
    const serving = o.cancelled ? [] : servingAt(ministries, o.kind === "service" ? o.id : null, o.date, o.time);
    const seen = new Set<string>();
    const faces = serving.flatMap((s) => s.faces).filter((f) => !seen.has(f.stickId) && seen.add(f.stickId));
    return { ...o, faces, open: serving.reduce((n, s) => n + s.open, 0) };
  });
}

/** Texto do convite: "Domingo, 18/10 às 19h: Culto da Família. Rua X, 100. Te esperamos!" */
export function inviteText(o: { date: string; time: string; name: string; location: string }): string {
  const when = serviceLabel(o.date, o.time);
  const head = when.charAt(0).toUpperCase() + when.slice(1).replace(" ", ", ");
  return `${head}: ${o.name}.${o.location ? ` ${o.location}.` : ""} Te esperamos!`;
}

export const occurrenceTitle = (date: string, time: string): string => serviceLong(date, time);
export const timeShort = (time: string): string => timeLabel(time) || "Dia todo";

/** Barras: as últimas `TREND` contagens até a data (inclusive) e a média delas. */
export function trend(history: CountPoint[], upTo: string): { points: CountPoint[]; avg: number; max: number } {
  const points = history.filter((p) => p.date <= upTo).sort((a, b) => a.date.localeCompare(b.date)).slice(-TREND);
  const avg = points.length ? Math.round(points.reduce((n, p) => n + p.headcount, 0) / points.length) : 0;
  return { points, avg, max: Math.max(1, ...points.map((p) => p.headcount)) };
}

/** Número digitado na contagem: inteiro >= 0; "" = sem contagem (null); undefined se inválido. */
export function parseCount(raw: string): number | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{1,6}$/.test(t)) return undefined;
  return Number(t);
}

export const registeredLabel = (n: number, cap: number | null): string => (cap ? `${n} de ${cap}` : `${n} ${n === 1 ? "inscrito" : "inscritos"}`);
