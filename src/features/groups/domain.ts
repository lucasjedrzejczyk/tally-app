// Domínio Saúde dos Grupos. Health portado 1:1 de derived.js (groupsHealth).
// Depende do domínio de Sticks (careReasons) — interface limpa entre features.
import { careReasons } from "@/features/sticks/domain";
import type { Person } from "@/features/sticks/types";
import { SWIPE_FLICK } from "@/features/study/domain";
import type { CellAccess, CellDetail, CellListItem } from "./types";

export type Band = "healthy" | "attention" | "risk";

export interface Group {
  id: string;
  name: string;
  campus: string;
  leader: string;
  day: string;
  time: string;
  newMembers: number;
  leftRecently: number;
}

export interface GroupHealth {
  id: string;
  name: string;
  leader: string;
  count: number;
  acc: number;
  rate: number;
  band: Band;
  newMembers: number;
  leftRecently: number;
  noLeader: boolean;
}

export function bandOf(count: number, rate: number): Band {
  if (count === 0) return "attention";
  return rate >= 85 ? "healthy" : rate >= 70 ? "attention" : "risk";
}

// Saúde de cada grupo do campus ativo: membros, "em dia" (sem motivos de care),
// taxa e faixa. Ordena da menor taxa para a maior (o que precisa de atenção primeiro).
export function groupsHealth(people: Person[], groups: Group[], activeCampus: string): GroupHealth[] {
  return groups
    .filter((g) => g.campus === activeCampus || !g.campus)
    .map((g) => {
      const members = people.filter((p) => p.group === g.name && p.campus === activeCampus);
      const acc = members.filter((p) => careReasons(p).length === 0).length;
      const rate = members.length ? Math.round((acc / members.length) * 100) : 0;
      return {
        id: g.id,
        name: g.name,
        leader: g.leader,
        count: members.length,
        acc,
        rate,
        band: bandOf(members.length, rate),
        newMembers: g.newMembers,
        leftRecently: g.leftRecently,
        noLeader: !g.leader,
      };
    })
    .sort((a, b) => a.rate - b.rate);
}

// ---- Células (spec 14) -------------------------------------------------------------------
// Lógica pura: datas sempre como texto ISO ("2026-10-09"), sem fuso, para o servidor e o
// navegador chegarem ao mesmo resultado.

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const WEEKDAYS_PLURAL = ["Domingos", "Segundas", "Terças", "Quartas", "Quintas", "Sextas", "Sábados"] as const;

export const CELL_ROLES = [
  ["leader", "Líder"],
  ["co_leader", "Co-líder"],
  ["host", "Anfitrião"],
  ["member", "Membro"],
] as const;
export type CellRole = (typeof CELL_ROLES)[number][0];
export const roleLabel = (r: string): string => CELL_ROLES.find(([k]) => k === r)?.[1] ?? "Membro";

/** Data local de hoje ("aaaa-mm-dd"), sem passar por UTC. */
export function todayIso(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const utcDay = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
export const daysBetween = (from: string, to: string): number => utcDay(to) - utcDay(from);
const weekdayOf = (iso: string): number => (((utcDay(iso) + 4) % 7) + 7) % 7; // 1970-01-01 foi quinta
export function isIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const plain = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Índice do dia (0 = domingo) a partir do texto salvo ("Quinta", "quinta-feira"...); -1 se não entender. */
export function weekdayIndex(day: string | null | undefined): number {
  const t = plain(day ?? "");
  if (!t) return -1;
  return WEEKDAYS.findIndex((w) => t.startsWith(plain(w).slice(0, 3)));
}
/** Nome canônico do dia para guardar ("Quinta"); "" se vazio ou inválido. */
export const canonicalDay = (day: string): string => WEEKDAYS[weekdayIndex(day)] ?? "";

/** "20:00" a partir de "20", "20h", "20h30", "8:5"... ; "" se vazio; null se inválido. */
export function parseTime(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s/g, "");
  if (!t) return "";
  const m = /^(\d{1,2})(?:[:h](\d{1,2})?)?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
/** "20:00" ou "20h" -> "20h"; "20:30" -> "20h30". */
export function timeLabel(time: string | null | undefined): string {
  const t = parseTime(time ?? "");
  if (!t) return "";
  const [h, m] = t.split(":") as [string, string];
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** "Quintas, 20h" (só o que existe). */
export function meetingLabel(day: string | null | undefined, time: string | null | undefined): string {
  const i = weekdayIndex(day);
  return [i >= 0 ? WEEKDAYS_PLURAL[i] : "", timeLabel(time)].filter(Boolean).join(", ");
}

/** Data padrão do "Marcar presença": hoje se for o dia da célula; senão o último dia do encontro até hoje. */
export function defaultMeetingDate(meetingDay: string | null | undefined, today: string): string {
  const want = weekdayIndex(meetingDay);
  if (want < 0) return today;
  const back = (weekdayOf(today) - want + 7) % 7;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export interface CellSession {
  date: string;
  cancelled: boolean;
  presentIds: string[];
}

/** Encontros seguidos, do mais recente para trás, sem presença do membro. Encontro cancelado não conta
 *  (nem interrompe); só entram encontros de quando ele já estava na célula (joinedAt). */
export function absenceStreak(memberId: string, sessions: CellSession[], joinedAt: string): number {
  let n = 0;
  for (const s of [...sessions].sort((a, b) => b.date.localeCompare(a.date))) {
    if (s.cancelled) continue;
    if (s.presentIds.includes(memberId)) break; // uma presença registrada vale sempre, mesmo antes da entrada
    if (s.date < joinedAt) break;
    n++;
  }
  return n;
}
export const MISSING_AT = 3;
export const missingFlag = (streak: number): boolean => streak >= MISSING_AT;

export const STALE_DAYS = 14;
/** Sem encontro registrado há 14 dias ou mais (ou nunca). */
export const staleGroup = (lastSessionDate: string | null, today: string): boolean =>
  !lastSessionDate || daysBetween(lastSessionDate, today) >= STALE_DAYS;
/** "Sem registro há 3 semanas" / "Sem registro". */
export function staleLabel(lastSessionDate: string | null, today: string): string {
  if (!lastSessionDate) return "Sem registro";
  const w = Math.floor(daysBetween(lastSessionDate, today) / 7);
  return `Sem registro há ${w} ${w === 1 ? "semana" : "semanas"}`;
}

/** "Qui 09/10" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-") as [string, string, string];
  return `${WEEKDAYS[weekdayOf(iso)]!.slice(0, 3)} ${d}/${m}`;
}
/** "12/10" */
export const dayMonth = (iso: string): string => iso.slice(8, 10) + "/" + iso.slice(5, 7);
/** "mar/2024" */
export function monthYear(iso: string): string {
  const m = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(iso.slice(5, 7)) - 1] ?? "";
  return `${m}/${iso.slice(0, 4)}`;
}

/** Quem estava na célula naquele dia (entrou até a data e ainda não tinha saído). */
export const wasMember = (m: { joinedAt: string; leftAt: string | null }, date: string): boolean =>
  m.joinedAt <= date && (!m.leftAt || m.leftAt >= date);

/** Fazia parte do encontro: estava ativo na data OU tem presença registrada nele (presença conta sempre). */
export const inMeeting = (m: { joinedAt: string; leftAt: string | null }, date: string, present: boolean): boolean => present || wasMember(m, date);

export interface SeriesPoint {
  date: string;
  cancelled: boolean;
  present: number;
  of: number; // quantos faziam parte da célula naquele dia
  ratio: number; // presentes / membros, de 0 a 1 (0 se não teve encontro)
}

/** Os últimos `n` encontros, do mais antigo para o mais novo, com a razão presentes/membros de cada um. */
export function presenceSeries(sessions: CellSession[], members: { stickId: string; joinedAt: string; leftAt: string | null }[], n: number): SeriesPoint[] {
  return [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-n)
    .map((s) => {
      const present = s.presentIds.length;
      const of = members.filter((m) => inMeeting(m, s.date, s.presentIds.includes(m.stickId))).length;
      return { date: s.date, cancelled: s.cancelled, present, of, ratio: s.cancelled || of === 0 ? 0 : Math.min(1, present / of) };
    });
}

/** "Ana" de "Ana Souza". */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? "";

const ROLE_RANK: Record<string, number> = { leader: 0, co_leader: 1, host: 2, member: 3 };
/** Os primeiros `n` rostos da pilha: líder e co-líder antes, depois por nome. */
export function stackFaces<T extends { name: string; role: string }>(members: T[], n: number): T[] {
  return [...members].sort((a, b) => (ROLE_RANK[a.role] ?? 3) - (ROLE_RANK[b.role] ?? 3) || a.name.localeCompare(b.name, "pt-BR")).slice(0, n);
}

/** A folha de baixo do celular fecha se foi arrastada além de 30% da altura ou saiu rápido (mesma velocidade do swipe de Pessoas). */
export const sheetCloses = (dy: number, velocity: number, height: number): boolean => dy > 0 && (dy > height * 0.3 || velocity > SWIPE_FLICK);

/** "Não vem há 3 encontros" / "Veio dia 08/10" / "Ainda sem presença". */
export function memberNote(m: { streak: number; lastPresent: string | null }): string {
  return missingFlag(m.streak) ? `Não vem há ${m.streak} encontros` : m.lastPresent ? `Veio dia ${dayMonth(m.lastPresent)}` : "Ainda sem presença";
}

/** Acesso ao app a partir da ficha (login ligado, e-mail para convidar, ou nada). */
export function accessOf(s: { email: string | null; user_id: string | null } | null | undefined): CellAccess {
  return s?.user_id ? "has" : s?.email?.trim() ? "ready" : "noEmail";
}

/** Líderes (líder, co-líder) e supervisor que ainda não têm login, uma linha por pessoa. */
export function leadersNeedingAccess(d: Pick<CellDetail, "members" | "supervisor">): { id: string; name: string; roles: string; access: CellAccess }[] {
  const out = new Map<string, { id: string; name: string; roles: string[]; access: CellAccess }>();
  const add = (id: string, name: string, role: string, access: CellAccess) => {
    if (access === "has") return;
    const cur = out.get(id);
    if (cur) cur.roles.push(role);
    else out.set(id, { id, name, roles: [role], access });
  };
  for (const m of d.members) if (m.role === "leader" || m.role === "co_leader") add(m.stickId, m.name, roleLabel(m.role), m.access);
  if (d.supervisor) add(d.supervisor.id, d.supervisor.name, "Supervisor", d.supervisor.access);
  return [...out.values()].map((p) => ({ ...p, roles: p.roles.join(", ") }));
}

/** "3 pessoas" / "1 pessoa" */
export const peopleCount = (n: number): string => `${n} ${n === 1 ? "pessoa" : "pessoas"}`;

export const STRIP_SIZE = 8; // encontros na faixa de presença da lista
export const STACK_SIZE = 4; // rostos na pilha da lista
export const CHART_SIZE = 12; // encontros no gráfico da ficha

// ---- Lista de células: filtros e espelho da ficha --------------------------------------------
export interface CellFilters {
  q: string;
  sup: string; // id do supervisor ("" = todos, "sem" = sem supervisor)
  dia: string; // nome do dia ("" = todos)
}
export const NO_CELL_FILTERS: CellFilters = { q: "", sup: "", dia: "" };
export const hasCellFilters = (f: CellFilters): boolean => Boolean(f.q.trim() || f.sup || f.dia);

export function filterCells(cells: CellListItem[], f: CellFilters): CellListItem[] {
  const q = plain(f.q);
  const dia = weekdayIndex(f.dia);
  return cells.filter(
    (c) =>
      (!q || plain(c.name).includes(q)) &&
      (!f.sup || (f.sup === "sem" ? !c.supervisorId : c.supervisorId === f.sup)) &&
      (!f.dia || weekdayIndex(c.day) === dia),
  );
}

/** A linha da lista refeita a partir da ficha (a tela atualiza a lista sem recarregar). */
export function listItemFromDetail(d: CellDetail): CellListItem {
  return {
    id: d.id,
    name: d.name,
    day: d.day,
    time: d.time,
    location: d.location,
    supervisorId: d.supervisor?.id ?? null,
    supervisorName: d.supervisor?.name ?? "",
    leaderName: d.members.find((m) => m.role === "leader")?.name ?? "",
    memberCount: d.members.length,
    lastSession: d.sessions.at(-1)?.date ?? null,
    strip: d.sessions.slice(-STRIP_SIZE).map(({ date, cancelled, ratio }) => ({ date, cancelled, ratio })),
    faces: stackFaces(d.members, STACK_SIZE).map(({ name, photoUrl }) => ({ name, photoUrl })),
    missing: d.members.filter((m) => missingFlag(m.streak)).length,
  };
}

/** Membros na ordem da ficha: quem some primeiro (mais faltas antes), depois os outros por nome. */
export function orderMembers<T extends { name: string; streak: number }>(members: T[]): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pt-BR");
  return [
    ...members.filter((m) => missingFlag(m.streak)).sort((a, b) => b.streak - a.streak || byName(a, b)),
    ...members.filter((m) => !missingFlag(m.streak)).sort(byName),
  ];
}

/** Liderança por papel: Líder, Co-líder, Anfitrião, Supervisor (só os que existem). */
export function leadershipParts(d: Pick<CellDetail, "members" | "supervisor">): { label: string; people: { id: string; name: string; photoUrl: string | null }[] }[] {
  const of = (role: CellRole) => d.members.filter((m) => m.role === role).map((m) => ({ id: m.stickId, name: m.name, photoUrl: m.photoUrl }));
  return [
    { label: "Líder", people: of("leader") },
    { label: "Co-líder", people: of("co_leader") },
    { label: "Anfitrião", people: of("host") },
    { label: "Supervisor", people: d.supervisor ? [{ id: d.supervisor.id, name: d.supervisor.name, photoUrl: d.supervisor.photoUrl }] : [] },
  ].filter((p) => p.people.length > 0);
}
