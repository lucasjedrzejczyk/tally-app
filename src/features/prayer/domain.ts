// Domínio Oração (spec 17, Fase C): mural, pedidos que chegaram pelo link e respondidas.
// Respondida some do mural 30 dias depois (regra de sempre).
import { today } from "@/lib/utils/date";

export type Privacy = "church" | "group" | "leader" | "private";

export interface PrayerRequest {
  id: string;
  author: string;
  request: string;
  privacy: Privacy;
  praying: number;
  answered: boolean;
  answeredDate: string | null;
  date: string; // date
  pending: boolean; // chegou pelo link e a equipe ainda não aprovou
  contact: string; // telefone de quem pediu pelo link
}

export const PRIVATE_LABEL = "Só a equipe pastoral";
export const NAME_MAX = 80;
export const REQUEST_MAX = 1000;
export const CONTACT_MAX = 30;

function daysSince(iso: string): number {
  return (today().getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

// Respondidas sem answered_on nunca somem. Com data: some 30 dias depois.
export function isPrunable(p: Pick<PrayerRequest, "answered" | "answeredDate">): boolean {
  return p.answered && !!p.answeredDate && daysSince(p.answeredDate) >= 30;
}

/** Separa o que chegou pelo link, o mural e as respondidas (todas, mais novas primeiro). */
export function splitPrayers(list: PrayerRequest[]): { pending: PrayerRequest[]; wall: PrayerRequest[]; answered: PrayerRequest[] } {
  const byNew = (a: PrayerRequest, b: PrayerRequest) => b.date.localeCompare(a.date);
  return {
    pending: list.filter((p) => p.pending).sort(byNew),
    wall: list.filter((p) => !p.pending && !p.answered).sort(byNew),
    answered: list.filter((p) => !p.pending && p.answered && !isPrunable(p)).sort(byNew),
  };
}

/** Link público de pedidos para a igreja: token comprido, só letras e números. */
export function newPrayerToken(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}
