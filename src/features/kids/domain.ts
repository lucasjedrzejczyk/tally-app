// Lógica pura do módulo Crianças (spec 18): idade e sala, código de retirada, telefone do totem,
// culto de agora e as mensagens prontas de WhatsApp. Sem banco, sem React: tudo testável.
import { happensOn } from "@/features/encontros/domain";

export type RoomColor = "sol" | "coral" | "ceu" | "folha";
export type RoomAnimal = "rabbit" | "bird" | "fish" | "turtle" | "squirrel" | "snail" | "cat" | "dog";
export const ROOM_COLORS: RoomColor[] = ["sol", "coral", "ceu", "folha"];
export const ROOM_ANIMALS: RoomAnimal[] = ["rabbit", "bird", "fish", "turtle", "squirrel", "snail", "cat", "dog"];
export const asColor = (v: string): RoomColor => (ROOM_COLORS.includes(v as RoomColor) ? (v as RoomColor) : "sol");
export const asAnimal = (v: string): RoomAnimal => (ROOM_ANIMALS.includes(v as RoomAnimal) ? (v as RoomAnimal) : "rabbit");

export interface RoomLike {
  id: string;
  minMonths: number;
  maxMonths: number;
  active: boolean;
  position: number;
}

/** Salas sugeridas na primeira abertura. */
export const SUGGESTED_ROOMS: { name: string; color: RoomColor; animal: RoomAnimal; minMonths: number; maxMonths: number }[] = [
  { name: "Berçário", color: "sol", animal: "bird", minMonths: 0, maxMonths: 35 },
  { name: "Maternal", color: "coral", animal: "rabbit", minMonths: 36, maxMonths: 71 },
  { name: "Kids", color: "ceu", animal: "fish", minMonths: 72, maxMonths: 107 },
  { name: "Juniores", color: "folha", animal: "turtle", minMonths: 108, maxMonths: 143 },
];

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** Meses completos entre o nascimento e hoje (datas ISO). */
export function ageMonths(birth: string, today: string): number {
  const [by, bm, bd] = parts(birth);
  const [ty, tm, td] = parts(today);
  return Math.max(0, (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0));
}

/** "8 meses", "1 ano", "5 anos"; antes de 1 mês, "Recém-nascido". */
export function ageLabel(months: number): string {
  if (months < 1) return "Recém-nascido";
  if (months < 12) return months === 1 ? "1 mês" : `${months} meses`;
  const y = Math.floor(months / 12);
  return y === 1 ? "1 ano" : `${y} anos`;
}

/** "0 a 2 anos" a partir da faixa em meses da sala. */
export function rangeLabel(min: number, max: number): string {
  const a = Math.floor(min / 12);
  const b = Math.floor(max / 12);
  return a === b ? `${a} ${a === 1 ? "ano" : "anos"}` : `${a} a ${b} anos`;
}

/** A sala da idade (primeira ativa, pela ordem). Sem nascimento ou sem faixa = null. */
export function roomFor<T extends RoomLike>(rooms: T[], birth: string | null, today: string): T | null {
  if (!birth) return null;
  const m = ageMonths(birth, today);
  return [...rooms].filter((r) => r.active).sort((a, b) => a.position - b.position).find((r) => m >= r.minMonths && m <= r.maxMonths) ?? null;
}

// Código de retirada: 4 caracteres sem os que confundem (0/O, 1/I/L). Igual ao check do banco.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const isCode = (v: string): boolean => /^[A-HJKMNP-Z2-9]{4}$/.test(v);

/** Sorteia um código que ainda não está em uso hoje. */
export function newCode(taken: ReadonlySet<string>, rnd: () => number = Math.random): string {
  for (let t = 0; t < 200; t++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
    if (!taken.has(c)) return c;
  }
  return "";
}

/** Mantém só o que pode estar num código (maiúsculas, sem ambíguos), até 4. */
export function cleanCode(raw: string): string {
  return [...raw.toUpperCase()].filter((ch) => CODE_ALPHABET.includes(ch)).join("").slice(0, 4);
}

export const phoneDigits = (raw: string): string => raw.replace(/\D/g, "").slice(0, 11);

/** Máscara montando enquanto digita: "(47) 99999-9999" (ou fixo com 10 dígitos). */
export function formatPhone(raw: string): string {
  const d = phoneDigits(raw);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const cut = rest.startsWith("9") ? 5 : 4; // celular começa com 9
  return rest.length <= cut ? `(${ddd}) ${rest}` : `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** Telefone completo o bastante para buscar no totem (celular com 11 dígitos). */
export const phoneReady = (raw: string): boolean => phoneDigits(raw).length === 11;

export interface ServiceLike {
  id: string;
  name: string;
  weekday: number | null;
  monthWeek: number | null;
  startTime: string | null;
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Culto de agora: o de hoje cuja janela (1h antes até 3h depois do início) contém o horário;
 *  fora de qualquer janela, o de hoje mais perto do horário; sem culto hoje, null. */
export function currentService<T extends ServiceLike>(services: T[], today: string, nowHHMM: string): T | null {
  const now = minutes(nowHHMM);
  const todays = services.filter((s) => s.weekday !== null && happensOn({ weekday: s.weekday, monthWeek: s.monthWeek }, today));
  if (!todays.length) return null;
  const dist = (s: T) => {
    const st = minutes(s.startTime ?? "00:00");
    return now >= st - 60 && now <= st + 180 ? 0 : Math.abs(now - st);
  };
  return [...todays].sort((a, b) => dist(a) - dist(b))[0] ?? null;
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Faz 5 anos hoje" / "Faz 5 anos quinta" quando o aniversário cai nos próximos 7 dias; senão null. */
export function birthdayThisWeek(birth: string | null, today: string): string | null {
  if (!birth) return null;
  const [by, bm, bd] = parts(birth);
  const [ty] = parts(today);
  const t = Date.UTC(...(parts(today).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]));
  for (const y of [ty, ty + 1]) {
    const d = Date.UTC(y, bm - 1, bd);
    const diff = Math.round((d - t) / 86400000);
    if (diff >= 0 && diff < 7) {
      const age = y - by;
      return diff === 0 ? `Faz ${age} ${age === 1 ? "ano" : "anos"} hoje` : `Faz ${age} ${age === 1 ? "ano" : "anos"} ${WEEKDAYS[new Date(d).getUTCDay()]}`;
    }
  }
  return null;
}

/** Frase da trava de quem não pode buscar (a action devolve, a tela reconhece). */
export const BLOCKED = "Não entregue. Chame a liderança.";

const first = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** "Theo", "Theo e Bia", "Theo, Bia e Lu". */
export function joinNames(names: string[]): string {
  const f = names.map(first);
  return f.length <= 1 ? (f[0] ?? "") : `${f.slice(0, -1).join(", ")} e ${f[f.length - 1]}`;
}

/** Mensagem do código para o responsável. */
export function codeMessage(children: string[], code: string): string {
  return `Código de retirada ${children.length > 1 ? "de" : "do(a)"} ${joinNames(children)}: ${code}. Mostre na saída da sala.`;
}

/** Chamar o responsável até a sala. */
export function callGuardianMessage(guardian: string, room: string, child: string): string {
  return `Oi, ${first(guardian)}! Pode vir até a sala ${room}? É sobre ${first(child)}.`;
}

/** Quem busca pode ser a pessoa bloqueada na ficha? Basta o primeiro nome aparecer como palavra no
 *  bloqueio (sem acento e sem caixa). Erra para o lado seguro: na dúvida, trava e chama a liderança. */
export function matchesBlocked(pickup: string, blocked: string | null): boolean {
  const words = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const b = new Set(words(blocked ?? ""));
  const p = words(pickup)[0];
  return Boolean(p && p.length > 1 && b.has(p));
}

/** Hora de agora no fuso da igreja ("19:05"); o servidor da Vercel roda em UTC. */
export function nowInChurch(): { date: string; time: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour") === "24" ? "00" : v("hour")}:${v("minute")}` };
}
