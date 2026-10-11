// Domínio Sticks (pessoas). É a "interface limpa" que outras features consomem
// (Care, Home, Journey importam estes tipos/regras, não o interior de Sticks).
// Regras portadas 1:1 de src/core/helpers.js e derived.js — sem inventar score,
// só contexto/padrões (DNA #3). "Uma pessoa = uma Stick."
import { absenceLabel, weeksSince } from "@/lib/utils/date";

export type Relationship =
  | "visitor_first"
  | "visitor_returning"
  | "attendee"
  | "member"
  | "inactive";

// Nome completo (roadmap #3.2): ao menos 2 palavras, cada uma com ≥2 letras.
// Bloqueia "João"/"Maria"; aceita "João Silva". Conta letras (acentos incluídos),
// então iniciais de 1 letra ("Ana P Silva") não passam — de propósito.
export function isFullName(name: string): boolean {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((w) => (w.match(/\p{L}/gu) || []).length >= 2);
}

export const RELATIONSHIPS: Relationship[] = [
  "visitor_first",
  "visitor_returning",
  "attendee",
  "member",
  "inactive",
];

const REL_FULL: Record<Relationship, string> = {
  visitor_first: "Visitante 1a vez",
  visitor_returning: "Visitante recorrente",
  attendee: "Frequentador",
  member: "Membro",
  inactive: "Inativo",
};

const REL_SHORT: Record<Relationship, string> = {
  visitor_first: "Visitante",
  visitor_returning: "Visitante",
  attendee: "Frequentador",
  member: "Membro",
  inactive: "Inativo",
};

export function relLabel(rel: Relationship): string {
  return REL_SHORT[rel] ?? "—";
}
export function relLabelFull(rel: Relationship): string {
  return REL_FULL[rel] ?? "—";
}
export function isVisitor(rel: Relationship): boolean {
  return rel === "visitor_first" || rel === "visitor_returning";
}

// Journey — estágios da caminhada (position 1..6 no banco = índice+1).
export const JOURNEY: ReadonlyArray<readonly [string, string]> = [
  ["first_visit", "Primeira visita"],
  ["returned", "Retornou"],
  ["connected", "Conectado"],
  ["group", "Em grupo"],
  ["serving", "Servindo"],
  ["leadership", "Liderança"],
];

export function journeyLabel(code: string): string {
  return JOURNEY.find((j) => j[0] === code)?.[1] ?? "—";
}
export function journeyCodeForPosition(position: number | null | undefined): string {
  if (!position) return "first_visit";
  return JOURNEY[position - 1]?.[0] ?? "first_visit";
}
export function positionForJourneyCode(code: string): number {
  const i = JOURNEY.findIndex((j) => j[0] === code);
  return i < 0 ? 1 : i + 1;
}

// Semanas sem aparecer a partir das quais entra no radar de Care (default do app).
export const CARE_WEEKS_DEFAULT = 3;

export interface CareReason {
  short: string;
  full: string;
}

// Motivos de cuidado — só padrões reais (sumiu, sem grupo, follow-up aberto).
export function careReasons(
  p: { lastSeen: string | null; group: string; followup: boolean },
  careWeeks: number = CARE_WEEKS_DEFAULT,
): CareReason[] {
  const reasons: CareReason[] = [];
  const weeks = weeksSince(p.lastSeen);
  if (weeks >= careWeeks) {
    reasons.push({ short: "sem aparecer", full: absenceLabel(p.lastSeen, weeks) });
  }
  if (!p.group) reasons.push({ short: "sem grupo", full: "Ainda não está em um grupo" });
  if (p.followup) reasons.push({ short: "follow-up", full: "Follow-up em aberto" });
  return reasons;
}

export type CareLevel = "em" | "at" | "ri";

export function careLevel(reasonCount: number): CareLevel {
  return reasonCount === 0 ? "em" : reasonCount === 1 ? "at" : "ri";
}

// ---------------------------------------------------------------------------
// Pessoas (spec 13): rótulos, campos da ficha, filtros da lista e formatação.
// Tudo puro (sem banco, sem React) para ser testado direto.
// ---------------------------------------------------------------------------

type Opt = readonly (readonly [string, string])[];

// Situação na tela: dois estados de visitante viram um só ("Visitante").
export const STATUS_OPTIONS: Opt = [
  ["visitor_first", "Visitante"],
  ["attendee", "Frequentador"],
  ["member", "Membro"],
  ["inactive", "Inativo"],
];
export const MARITAL_OPTIONS: Opt = [
  ["single", "Solteiro(a)"],
  ["married", "Casado(a)"],
  ["stable_union", "União estável"],
  ["divorced", "Divorciado(a)"],
  ["widowed", "Viúvo(a)"],
];
export const GENDER_OPTIONS: Opt = [
  ["male", "Masculino"],
  ["female", "Feminino"],
];
export const ADMISSION_OPTIONS: Opt = [
  ["baptism", "Batismo"],
  ["transfer", "Transferência"],
  ["acclamation", "Aclamação"],
  ["reconciliation", "Reconciliação"],
  ["other", "Outra"],
];
export const EXIT_OPTIONS: Opt = [
  ["transfer", "Transferência"],
  ["moved", "Mudança"],
  ["deceased", "Falecimento"],
  ["requested", "A pedido"],
  ["dismissed", "Desligamento"],
];
export const FAMILY_ROLES = ["head", "spouse", "child", "other"] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];
export const ROLE_OPTIONS: Opt = [
  ["head", "Responsável"],
  ["spouse", "Cônjuge"],
  ["child", "Filho(a)"],
  ["other", "Outro"],
];
// Bucket privado das fotos (caminho <org>/<pessoa>.jpg).
export const PHOTO_BUCKET = "people-photos";
export const OFFICE_SUGGESTIONS = ["Membro", "Diácono(isa)", "Presbítero", "Pastor(a)", "Evangelista", "Missionário(a)", "Líder de ministério"];
const YES_NO: Opt = [
  ["true", "Sim"],
  ["false", "Não"],
];

export function optionLabel(options: Opt, value: string | null | undefined): string {
  return options.find((o) => o[0] === value)?.[1] ?? "";
}
// "visitor_returning" aparece como "Visitante"; no seletor vira a mesma opção.
export function statusValue(rel: string): string {
  return rel === "visitor_returning" ? "visitor_first" : rel;
}

// Campos editáveis da ficha. `column` = coluna de `sticks`; null = tabela stick_documents.
export type FieldKind = "text" | "tel" | "email" | "date" | "select" | "cpf";
export interface FieldMeta {
  label: string;
  kind: FieldKind;
  column: string | null;
  max?: number;
  options?: Opt;
  required?: boolean; // select sem opção "vazio"
}

export const FIELD_META = {
  name: { label: "Nome", kind: "text", column: "full_name", max: 120, required: true },
  phone: { label: "Telefone", kind: "tel", column: "phone", max: 30 },
  whatsapp: { label: "WhatsApp", kind: "tel", column: "whatsapp", max: 30 },
  email: { label: "E-mail", kind: "email", column: "email", max: 160 },
  birthDate: { label: "Nascimento", kind: "date", column: "birth_date" },
  gender: { label: "Sexo", kind: "select", column: "gender", options: GENDER_OPTIONS },
  maritalStatus: { label: "Estado civil", kind: "select", column: "marital_status", options: MARITAL_OPTIONS },
  profession: { label: "Profissão", kind: "text", column: "profession", max: 120 },
  cpf: { label: "CPF", kind: "cpf", column: null },
  rg: { label: "RG", kind: "text", column: null, max: 20 },
  line1: { label: "Rua e número", kind: "text", column: "address_line_1", max: 160 },
  line2: { label: "Complemento", kind: "text", column: "address_line_2", max: 160 },
  city: { label: "Cidade", kind: "text", column: "city", max: 80 },
  state: { label: "UF", kind: "text", column: "state", max: 40 },
  postalCode: { label: "CEP", kind: "text", column: "postal_code", max: 12 },
  status: { label: "Situação", kind: "select", column: "relationship_status", options: STATUS_OPTIONS, required: true },
  firstVisit: { label: "Primeira visita", kind: "date", column: "first_visit_date" },
  conversionDate: { label: "Conversão", kind: "date", column: "conversion_date" },
  baptismDate: { label: "Batismo", kind: "date", column: "baptism_date" },
  admissionType: { label: "Forma de entrada", kind: "select", column: "admission_type", options: ADMISSION_OPTIONS },
  membershipDate: { label: "Membro desde", kind: "date", column: "membership_date" },
  office: { label: "Cargo", kind: "text", column: "church_office", max: 80 },
  isLeader: { label: "Líder", kind: "select", column: "is_leader", options: YES_NO, required: true },
  exitDate: { label: "Data de saída", kind: "date", column: "exit_date" },
  exitReason: { label: "Motivo da saída", kind: "select", column: "exit_reason", options: EXIT_OPTIONS },
} as const satisfies Record<string, FieldMeta>;
export type PersonField = keyof typeof FIELD_META;
export function isPersonField(v: string): v is PersonField {
  return Object.prototype.hasOwnProperty.call(FIELD_META, v);
}

// --- texto ---------------------------------------------------------------------------
export function onlyDigits(s: string): string {
  return (s || "").replace(/\D/g, "");
}
// Sem acento e minúsculo, para busca.
export function normalize(s: string): string {
  return (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
export function initialsOf(name: string): string {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return ((w[0]![0] ?? "") + (w.length > 1 ? (w[w.length - 1]![0] ?? "") : "")).toUpperCase();
}
export function lastNameOf(name: string): string {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? w[w.length - 1]! : w[0] ?? "";
}

export function formatCpf(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
// Dígitos verificadores do CPF; rejeita sequências repetidas (111.111.111-11).
export function isValidCpf(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}
// Telefone do Brasil: (47) 99999-0000 ou (47) 3333-0000. Outros formatos ficam como digitados.
export function formatPhone(raw: string): string {
  const t = (raw || "").trim();
  const d = onlyDigits(t);
  if (/^\+/.test(t) && !t.startsWith("+55")) return t;
  const n = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t;
}
export function formatCep(raw: string): string {
  const d = onlyDigits(raw);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (raw || "").trim();
}
// Link do WhatsApp: DDI 55 quando vier só com DDD + número.
export function whatsappLink(raw: string): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}

// --- datas ---------------------------------------------------------------------------
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function parts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? { y: +m[1]!, m: +m[2]!, d: +m[3]! } : null;
}
// Idade em anos completos na data `now` (sem aproximar o ano em 365,25 dias).
export function ageOn(birth: string | null | undefined, now: Date): number | null {
  const b = parts(birth);
  if (!b) return null;
  let age = now.getFullYear() - b.y;
  if (now.getMonth() + 1 < b.m || (now.getMonth() + 1 === b.m && now.getDate() < b.d)) age--;
  return age >= 0 ? age : null;
}
export function ageLabel(birth: string | null | undefined, now: Date): string {
  const a = ageOn(birth, now);
  return a == null ? "" : `${a} ${a === 1 ? "ano" : "anos"}`;
}
// "12 out"
export function birthdayShort(birth: string | null | undefined): string {
  const b = parts(birth);
  return b ? `${b.d} ${MONTHS[b.m - 1]}` : "";
}
// "12 de outubro de 2026"
export function longDate(iso: string | null | undefined): string {
  const b = parts(iso);
  if (!b) return "";
  const full = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${b.d} de ${full[b.m - 1]} de ${b.y}`;
}

// --- lista ---------------------------------------------------------------------------
export interface PersonLite {
  id: string;
  name: string;
  status: Relationship;
  office: string;
  phone: string;
  whatsapp: string;
  email: string;
  birthDate: string | null;
  archived: boolean;
  groupIds: string[];
}

export type StatusFilter = "" | "member" | "attendee" | "visitor" | "inactive";
export type BirthdayFilter = "" | "este" | "proximo";
export interface PeopleFilters {
  s: StatusFilter;
  cargo: string;
  aniv: BirthdayFilter;
  celula: string; // "" | id do grupo | "sem"
  q: string;
}
export const NO_FILTERS: PeopleFilters = { s: "", cargo: "", aniv: "", celula: "", q: "" };
const STATUS_FILTERS: StatusFilter[] = ["member", "attendee", "visitor", "inactive"];

export function parseFilters(sp: Record<string, string | string[] | undefined>): PeopleFilters {
  const one = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const s = one("s") as StatusFilter;
  const aniv = one("aniv");
  return {
    s: STATUS_FILTERS.includes(s) ? s : "",
    cargo: one("cargo").slice(0, 80),
    aniv: aniv === "este" || aniv === "proximo" ? aniv : "",
    celula: one("celula").slice(0, 60),
    q: one("q").slice(0, 80),
  };
}
export function filtersQuery(f: PeopleFilters): string {
  const p = new URLSearchParams();
  for (const k of ["s", "cargo", "aniv", "celula", "q"] as const) if (f[k]) p.set(k, f[k]);
  return p.toString();
}
export function hasFilters(f: PeopleFilters): boolean {
  return Boolean(f.s || f.cargo || f.aniv || f.celula || f.q.trim());
}

// Mês (1..12) do filtro de aniversário em relação a `now`.
function birthdayMonth(aniv: BirthdayFilter, now: Date): number {
  const m = now.getMonth() + 1;
  return aniv === "proximo" ? (m % 12) + 1 : m;
}
// Aniversariantes do mês, em ordem de dia.
export function birthdaysIn<T extends { birthDate: string | null }>(list: T[], month: number): T[] {
  return list
    .filter((p) => parts(p.birthDate)?.m === month)
    .sort((a, b) => parts(a.birthDate)!.d - parts(b.birthDate)!.d);
}

function matchesStatus(p: PersonLite, s: StatusFilter): boolean {
  if (s === "inactive") return p.archived || p.status === "inactive";
  if (p.archived) return false;
  if (!s) return true;
  return s === "visitor" ? isVisitor(p.status) : p.status === s;
}

// Filtros que somam (situação, cargo, aniversário, célula, busca). Arquivados só no chip Inativos.
export function filterPeople<T extends PersonLite>(list: T[], f: PeopleFilters, now: Date): T[] {
  const q = normalize(f.q);
  const qd = onlyDigits(f.q);
  const out = list.filter((p) => {
    if (!matchesStatus(p, f.s)) return false;
    if (f.cargo && p.office !== f.cargo) return false;
    if (f.celula === "sem" ? p.groupIds.length > 0 : f.celula && !p.groupIds.includes(f.celula)) return false;
    if (q) {
      const hit =
        normalize(p.name).includes(q) ||
        normalize(p.email).includes(q) ||
        (qd.length >= 3 && (onlyDigits(p.phone).includes(qd) || onlyDigits(p.whatsapp).includes(qd)));
      if (!hit) return false;
    }
    return true;
  });
  if (f.aniv) return birthdaysIn(out, birthdayMonth(f.aniv, now));
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// Linha de baixo da lista: só o que foge do normal. Membro sem cargo = nada (a linha some).
// Ex.: "Diácono", "Visitante", "Inativo · Diácono", "Arquivado".
export function personSubtitle(p: Pick<PersonLite, "status" | "office" | "archived">): string {
  const status = p.archived ? "Arquivado" : p.status === "member" ? "" : relLabel(p.status);
  return [status, p.office].filter(Boolean).join(" · ");
}
