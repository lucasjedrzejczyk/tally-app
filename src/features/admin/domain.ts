// Domínio PURO do painel super-admin da plataforma (Tally sobre TODAS as igrejas).
// Sem I/O, determinístico, testável: coerção/rótulo/banda do status de uma org, o
// gancho de plano (só leitura por ora), a formatação das métricas do cabeçalho e a
// ordenação/filtro da lista de igrejas no cliente. A leitura do banco (RPCs gated) vive
// em queries.ts; as mutações em actions.ts. Nada aqui toca o Supabase.

// Situação de uma igreja. No banco a coluna organizations.status guarda active/suspended
// (check constraint). Coeragimos texto solto para a união conhecida (default active).
export type OrgStatus = "active" | "suspended";

const STATUSES: OrgStatus[] = ["active", "suspended"];

export function coerceOrgStatus(raw: string): OrgStatus {
  return (STATUSES as string[]).includes(raw) ? (raw as OrgStatus) : "active";
}

const STATUS_LABEL: Record<OrgStatus, string> = {
  active: "Ativa",
  suspended: "Suspensa",
};

export function orgStatusLabel(status: OrgStatus): string {
  return STATUS_LABEL[status];
}

// Banda visual (classe global .hb): ativa = saudável, suspensa = risco.
export type StatusBand = "healthy" | "risk";

export function orgStatusBand(status: OrgStatus): StatusBand {
  return status === "active" ? "healthy" : "risk";
}

// O status "de destino" ao alternar — é o que o botão de ação aplica.
export function nextStatus(status: OrgStatus): OrgStatus {
  return status === "active" ? "suspended" : "active";
}

// Rótulo da ação de alternância (o verbo, não o estado atual).
export function statusActionLabel(status: OrgStatus): string {
  return status === "active" ? "Suspender" : "Reativar";
}

// Rótulo do plano — gancho de monetização, só LEITURA por ora. Capitaliza; vazio → "Free".
export function planLabel(plan: string): string {
  const p = (plan ?? "").trim();
  if (!p) return "Free";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// Inteiro no padrão PT-BR (ponto de milhar). Determinístico e sem depender de ICU/locale.
export function formatCount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// --- Estatísticas do cabeçalho (admin_platform_stats) ---

export interface PlatformStats {
  orgs: number;
  members: number;
  sticks: number; // "Contatos" na UI (uma pessoa = uma Stick)
  active: number;
  suspended: number;
}

export interface StatTile {
  key: "orgs" | "active" | "suspended" | "members" | "sticks";
  label: string;
  value: string; // já formatado
}

// Cinco cards, em ordem fixa, já formatados — mantém o componente burro.
export function buildStatTiles(stats: PlatformStats): StatTile[] {
  return [
    { key: "orgs", label: "Igrejas", value: formatCount(stats.orgs) },
    { key: "active", label: "Ativas", value: formatCount(stats.active) },
    { key: "suspended", label: "Suspensas", value: formatCount(stats.suspended) },
    { key: "members", label: "Membros", value: formatCount(stats.members) },
    { key: "sticks", label: "Contatos", value: formatCount(stats.sticks) },
  ];
}

// --- Ordenação e filtro da tabela (no cliente) ---

// Campos que ordenação/filtro tocam — subconjunto de AdminOrgRow, definido aqui para o
// domínio ficar independente de types.ts (a linha completa estende esta forma).
export interface AdminOrgRow {
  name: string;
  country: string | null;
  plan: string;
  status: OrgStatus;
  createdAt: string; // ISO
  members: number;
  sticks: number;
  groups: number;
}

export type OrgSortKey = "name" | "country" | "plan" | "status" | "createdAt" | "members" | "sticks" | "groups";
export type SortDir = "asc" | "desc";

const NUMERIC_KEYS: OrgSortKey[] = ["members", "sticks", "groups"];

// Normaliza texto para comparar/buscar sem sensibilidade a caixa ou acento.
function fold(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Ordena uma CÓPIA (não muta a entrada). Números por valor; texto por localeCompare
// (pt-BR, ignorando acento/caixa); datas ISO por comparação lexicográfica.
export function sortOrgs<T extends AdminOrgRow>(rows: T[], key: OrgSortKey, dir: SortDir): T[] {
  const factor = dir === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp: number;
    if ((NUMERIC_KEYS as string[]).includes(key)) {
      cmp = (a[key] as number) - (b[key] as number);
    } else {
      const av = (a[key] ?? "").toString();
      const bv = (b[key] ?? "").toString();
      cmp = av.localeCompare(bv, "pt-BR", { sensitivity: "base" });
    }
    return cmp * factor;
  });
  return copy;
}

export type StatusFilter = OrgStatus | "all";

export interface OrgFilter {
  query: string;
  status: StatusFilter;
}

// Filtra por texto (nome ou país, sem caixa/acento) e por status.
export function filterOrgs<T extends AdminOrgRow>(rows: T[], filter: OrgFilter): T[] {
  const q = fold(filter.query.trim());
  return rows.filter((r) => {
    if (filter.status !== "all" && r.status !== filter.status) return false;
    if (!q) return true;
    const hay = fold(`${r.name} ${r.country ?? ""}`);
    return hay.includes(q);
  });
}

// Situação da cobrança de uma igreja, em palavras (spec 20). Mesma ordem de effectivePlan:
// assinatura ativa, atraso na tolerância, cortesia no prazo; senão cancelada ou grátis.
export interface BillingRow {
  plan: string;
  planStatus: string;
  proUntil: string | null;
  graceUntil: string | null;
}

// Data no fuso de Brasília (a cortesia vence às 23:59 de lá, que já é o dia seguinte em UTC).
export const brDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function billingLabel(o: BillingRow, now: Date = new Date()): string {
  const future = (iso: string | null) => iso !== null && new Date(iso) > now;
  if (o.planStatus === "active") return "Ativa";
  if (o.planStatus === "past_due" && future(o.graceUntil)) return `Atrasada, até ${brDay(o.graceUntil!)}`;
  if (future(o.proUntil)) return o.proUntil!.startsWith("2100") ? "Cortesia sem data" : `Cortesia até ${brDay(o.proUntil!)}`;
  if (o.planStatus === "canceled") return "Cancelada";
  return "Grátis";
}
