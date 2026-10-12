// Navegação principal. Os itens ficam agrupados por domínio (arquitetura de informação).
//
// RÓTULO ≠ ROTA. A Fase 0/Parte C renomeou rótulos GENÉRICOS de menu para o que o pastor
// ganha ("Finance Lite" → Financeiro, Times → Escalas, Saúde dos Grupos → Células,
// Comunicação → Espaços). As chaves de rota e as pastas NÃO mudam (`/teams`,
// `features/teams`): renomear pasta destrói o histórico do git sem ganho nenhum.
// Termos de produto do Tally continuam intocados: Stick, Signal, Care, Journey,
// Milestone, Inbox, Timeline.
//
// "Células" é o PADRÃO em PT-BR, não uma escolha final: a spec 04 prevê rótulo
// configurável por igreja (célula, GC, conexão, casa de paz), e o inglês recebe "Groups"
// quando a i18n entrar.
// `key` = feature; `href` = rota no App Router; `count` marca itens com contador.
// `feature` = recurso travável: se presente e o plano da igreja não o libera, o item
// aparece com cadeado (a página mostra o upsell). Sem `feature` = núcleo, sempre liberado.
import type { FeatureKey } from "@/features/plans/catalog";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  count?: "inbox" | "people" | "tasks";
  feature?: FeatureKey;
}

// Um grupo colapsável do menu (um domínio). `key` identifica o grupo para
// persistir aberto/fechado; `label` é o cabeçalho quieto (não é rota).
export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

// Itens soltos no topo (sem grupo): as duas superfícies de uso diário.
export const TOP_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Home", href: "/" },
  { key: "inbox", label: "Inbox", href: "/inbox", count: "inbox" },
];

// Grupos por domínio. Um item ativo por vez; grupos revelam-se sob demanda.
// Sem reintroduzir campus e sem renomear termos de produto (Stick/Care/Journey...).
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "pessoas",
    label: "Pessoas",
    items: [
      { key: "people", label: "Pessoas", href: "/people", count: "people" },
      { key: "members", label: "Membros", href: "/members", feature: "members" },
      { key: "groups", label: "Células", href: "/groups" },
      { key: "teams", label: "Escalas", href: "/teams", feature: "teams" },
      { key: "coord", label: "Coordenação", href: "/coordination", count: "tasks" },
      { key: "journey", label: "Journey", href: "/journey" },
      { key: "study", label: "Trilhas", href: "/tracks" },
    ],
  },
  {
    key: "encontros",
    label: "Encontros",
    items: [
      { key: "services", label: "Cultos", href: "/services" },
      { key: "events", label: "Eventos", href: "/events", feature: "events" },
      { key: "calendar", label: "Agenda", href: "/calendar" },
    ],
  },
  {
    key: "cuidado",
    label: "Cuidado",
    items: [
      { key: "care", label: "Care", href: "/care" },
      { key: "prayer", label: "Oração", href: "/prayer" },
    ],
  },
  {
    key: "ensino",
    label: "Ensino",
    items: [{ key: "sermons", label: "Estudo", href: "/study", feature: "study" }],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    items: [
      // Finanças unificado (spec 10): Contabilidade e Doações viraram abas de /finance.
      { key: "finance", label: "Finanças", href: "/finance", feature: "finance" },
    ],
  },
  {
    key: "comunicacao",
    label: "Comunicação",
    // Comunicação = hub de espaços (estilo Basecamp) + mensagens diretas 1:1. O fluxo
    // antigo de e-mail (/communication compor/preparar/"Enviar agora") continua no
    // código, mas sai do menu — a nav "Comunicação" agora aponta para /spaces.
    items: [
      { key: "spaces", label: "Espaços", href: "/spaces", feature: "communication" },
      { key: "dm", label: "Mensagens", href: "/dm", feature: "communication" },
    ],
  },
];

export const PLANS_ITEM: NavItem = { key: "plans", label: "Planos", href: "/plans" };

export const SETTINGS_ITEM: NavItem = { key: "settings", label: "Configurações", href: "/settings" };

// Painel super-admin da plataforma. Só aparece para quem é platform-admin (a visibilidade
// é decidida no servidor e passada ao Sidebar) — e o /admin gateia de novo no servidor.
export const ADMIN_ITEM: NavItem = { key: "admin", label: "Admin", href: "/admin" };

// Modo "só Estudo" (pedido do dono em 2026-10-01): o menu mostra só o Estudo (mais
// Configurações e Admin) e as outras telas redirecionam para /study no middleware.
// O código das outras funções fica intacto; para religar tudo, troque para false.
export const STUDY_ONLY = true;
const STUDY_HREF = "/study";
const STUDY_HOME = "/study/bible"; // o Estudo abre na Bíblia, no último capítulo lido

// Menu do modo só Estudo. `match` = prefixos que acendem o item.
export interface StudyNavItem {
  key: string;
  label: string;
  href: string;
  icon: "book" | "sermon" | "notes" | "people" | "groups" | "ministries" | "finance";
  match: string[];
}
export const STUDY_ITEMS: StudyNavItem[] = [
  { key: "bible", label: "Bíblia", href: "/study/bible", icon: "book", match: ["/study/bible"] },
  { key: "sermons", label: "Sermões", href: "/study", icon: "sermon", match: ["/study", "/study/sermon", "/study/series", "/study/map"] },
  { key: "notes", label: "Notas", href: "/study/notes", icon: "notes", match: ["/study/notes"] },
  // Pessoas (spec 13): lista + ficha, só para a equipe (o RLS decide quem lê e quem edita).
  { key: "people", label: "Pessoas", href: "/people", icon: "people", match: ["/people"] },
  // Células (spec 14): lista + ficha + presença; a equipe vê todas (o RLS decide, líder só as dele).
  { key: "groups", label: "Células", href: "/groups", icon: "groups", match: ["/groups"] },
  // Ministérios e escalas (spec 15): equipe vê todos; o líder do ministério, só o dele (RLS).
  { key: "ministries", label: "Ministérios", href: "/ministries", icon: "ministries", match: ["/ministries"] },
  // Finanças liberada pelo dono em 2026-10-08 (spec 10/11), mesmo no modo só Estudo.
  { key: "finance", label: "Finanças", href: "/finance", icon: "finance", match: ["/finance"] },
];

// Menu de quem não é equipe (líder de célula ou de ministério): Bíblia e o que ele lidera.
export function studyNavFor(isStaff: boolean, hasCells: boolean, hasMinistries = false): StudyNavItem[] {
  return isStaff
    ? STUDY_ITEMS
    : STUDY_ITEMS.filter((i) => i.key === "bible" || (i.key === "groups" && hasCells) || (i.key === "ministries" && hasMinistries));
}

// Para onde vai quem não é equipe ao abrir uma tela só da equipe (null = pode ficar).
export function nonStaffRedirect(isStaff: boolean, hasCells: boolean, hasMinistries = false): string | null {
  return isStaff ? null : hasCells ? "/groups" : hasMinistries ? "/ministries" : STUDY_HOME;
}

// Barra de abas do celular: cabem 5 itens; passou disso, os 4 primeiros ficam e o resto vai para "Mais".
export const TAB_LIMIT = 5;
const TAB_ORDER = ["bible", "people", "groups", "finance", "ministries", "sermons", "notes"];
export function splitTabs<T extends { key: string }>(tabs: T[]): { shown: T[]; more: T[] } {
  const rank = (k: string) => (TAB_ORDER.includes(k) ? TAB_ORDER.indexOf(k) : TAB_ORDER.length);
  const sorted = [...tabs].sort((a, b) => rank(a.key) - rank(b.key));
  return sorted.length <= TAB_LIMIT ? { shown: sorted, more: [] } : { shown: sorted.slice(0, TAB_LIMIT - 1), more: sorted.slice(TAB_LIMIT - 1) };
}

// Telas que continuam ligadas no modo só Estudo além do próprio Estudo.
const STUDY_ONLY_KEEPS = ["/finance", "/people", "/groups", "/ministries"];

// Rotas desligadas no modo só Estudo: tudo que o menu lista, menos o próprio Estudo.
// O fluxo antigo de e-mail (/communication) não está no menu, entra à mão.
const OFF_HREFS = [...TOP_ITEMS, ...NAV_GROUPS.flatMap((g) => g.items), PLANS_ITEM]
  .map((i) => i.href)
  .filter((h) => h !== STUDY_HREF && !STUDY_ONLY_KEEPS.includes(h))
  .concat("/communication");

export function studyOnlyRedirect(pathname: string): string | null {
  if (!STUDY_ONLY) return null;
  const off = OFF_HREFS.some((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/")));
  return off ? STUDY_HOME : null;
}
