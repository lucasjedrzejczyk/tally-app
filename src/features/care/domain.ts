// Domínio puro do Cuidado (spec 17): grupos de status, "último contato", parado, ordem da lista,
// sugestões ("Pode precisar de atenção") e a chave de dispensar. Sem I/O.
import { dayMonth, daysBetween } from "@/features/groups/domain";
import type { CareListItem, CareStatus, ContactKind, StatusGroup, Suggestion } from "./types";

export const STALE_DAYS = 14;
export const SUGGESTION_LIMIT = 5;

export function statusGroup(s: CareStatus): StatusGroup {
  if (s === "waiting") return "waiting";
  if (s === "resolved" || s === "closed") return "done";
  return "open";
}
// O que gravamos para cada grupo (o enum do banco tem mais estados, a tela só três).
export const GROUP_STATUS: Record<StatusGroup, CareStatus> = { open: "in_progress", waiting: "waiting", done: "resolved" };
export const GROUP_LABEL: Record<StatusGroup, string> = { open: "Em andamento", waiting: "Aguardando", done: "Concluído" };

export const CONTACT_KINDS: ContactKind[] = ["visit", "call", "whatsapp", "talk"];
export const CONTACT_LABEL: Record<ContactKind, string> = { visit: "Visita", call: "Ligação", whatsapp: "WhatsApp", talk: "Conversa" };
export const asContactKind = (v: string | null | undefined): ContactKind | "" => (CONTACT_KINDS as string[]).includes(v ?? "") ? (v as ContactKind) : "";

// Data de referência do "parado": o último contato, ou a abertura se nunca houve contato.
const since = (it: Pick<CareListItem, "lastContact" | "createdOn">): string => it.lastContact ?? it.createdOn;

/** 14 dias ou mais sem contato (contando da abertura quando ainda não houve nenhum). */
export function stale(it: Pick<CareListItem, "lastContact" | "createdOn" | "status">, today: string): boolean {
  return statusGroup(it.status) === "open" && daysBetween(since(it), today) >= STALE_DAYS;
}

/** "Sem contato ainda", "Último contato hoje", "Último contato há 9 dias", "Sem contato há 15 dias". */
export function sinceLabel(it: Pick<CareListItem, "lastContact" | "createdOn" | "status">, today: string): string {
  const n = Math.max(0, daysBetween(since(it), today));
  if (stale(it, today)) return `Sem contato há ${n} dias`;
  if (!it.lastContact) return "Sem contato ainda";
  if (n === 0) return "Último contato hoje";
  if (n === 1) return "Último contato ontem";
  return `Último contato há ${n} dias`;
}

/** Parados primeiro (o mais antigo no topo), depois os mais recentes. */
export function sortOpen<T extends Pick<CareListItem, "lastContact" | "createdOn" | "status">>(items: T[], today: string): T[] {
  return [...items].sort((a, b) => {
    const sa = stale(a, today);
    const sb = stale(b, today);
    if (sa !== sb) return sa ? -1 : 1;
    return sa ? since(a).localeCompare(since(b)) : since(b).localeCompare(since(a));
  });
}

export function splitCare<T extends CareListItem>(items: T[], today: string): { open: T[]; waiting: T[]; done: T[] } {
  return {
    open: sortOpen(items.filter((i) => statusGroup(i.status) === "open"), today),
    waiting: items.filter((i) => statusGroup(i.status) === "waiting"),
    done: items.filter((i) => statusGroup(i.status) === "done").sort((a, b) => since(b).localeCompare(since(a))),
  };
}

// ── Sugestões ───────────────────────────────────────────────────────────────────────────────────
interface Face {
  stickId: string;
  name: string;
  photoUrl: string | null;
}
export interface SuggestionInput {
  absences: (Face & { group: string; streak: number; lastSession: string })[];
  visitors: (Face & { firstVisit: string })[];
  declines: (Face & { ministry: string; lastDate: string })[];
}
export const ABSENT_AT = 3;
export const VISITOR_MIN = 3;
export const VISITOR_MAX = 45;

export const suggestionKey = {
  absent: (stickId: string, lastSession: string) => `care:absent:${stickId}:${lastSession}`,
  visitor: (stickId: string, firstVisit: string) => `care:visitor:${stickId}:${firstVisit}`,
  declined: (stickId: string, lastDate: string) => `care:declined:${stickId}:${lastDate}`,
};

/** Quem pode precisar de atenção, sem quem já tem caso aberto e sem o que foi dispensado. Uma linha por pessoa. */
export function careSuggestions(input: SuggestionInput, open: Set<string>, dismissed: Set<string>, today: string): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (f: Face, key: string, reason: string) => {
    if (open.has(f.stickId) || seen.has(f.stickId) || dismissed.has(key)) return;
    seen.add(f.stickId);
    out.push({ key, stickId: f.stickId, name: f.name, photoUrl: f.photoUrl, reason });
  };
  for (const a of [...input.absences].sort((x, y) => y.streak - x.streak))
    if (a.streak >= ABSENT_AT) add(a, suggestionKey.absent(a.stickId, a.lastSession), `Faltou aos ${a.streak} últimos encontros da ${/^c[eé]lula/i.test(a.group) ? a.group : `célula ${a.group}`}`);
  for (const v of [...input.visitors].sort((x, y) => x.firstVisit.localeCompare(y.firstVisit))) {
    const d = daysBetween(v.firstVisit, today);
    if (d >= VISITOR_MIN && d <= VISITOR_MAX) add(v, suggestionKey.visitor(v.stickId, v.firstVisit), `Visitante desde ${dayMonth(v.firstVisit)}, ninguém acompanhando`);
  }
  for (const d of input.declines) add(d, suggestionKey.declined(d.stickId, d.lastDate), `Não pôde nas 2 últimas escalas do ${d.ministry}`);
  return out;
}

/** Duas recusas seguidas nas últimas escalas da pessoa num ministério (a mais recente primeiro). */
export function twoDeclines(statuses: { date: string; status: string }[]): string | null {
  const last = [...statuses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  const [a, b] = last;
  return a && b && a.status === "declined" && b.status === "declined" ? a.date : null;
}
