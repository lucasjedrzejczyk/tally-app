// Catálogo de planos da Mercy — FONTE DA VERDADE (em código, sem tabela nova). O único
// estado no banco é organizations.plan (text, default 'free'). Aqui vive o que cada plano
// libera, os rótulos e o gancho de preço (pronto p/ apontar ao Stripe numa fase futura).
// Diferenciação é SÓ por recurso (feature-gating), não por tamanho. Ver
// docs/superpowers/specs/2026-08-01-planos-feature-gating-design.md.

export type PlanCode = "free" | "pro";

// Recursos TRAVÁVEIS (os módulos Pro). Módulos de núcleo (Sticks, Grupos, Cultos, Oração,
// Journey, Trilhas, Agenda, Care, Coordenação, Home, Inbox) NÃO têm chave — são sempre
// liberados, então nem entram aqui.
export type FeatureKey =
  | "finance"
  | "accounting"
  | "giving"
  | "communication"
  | "study"
  | "teams"
  | "events"
  | "members";

// Todos os recursos travados, na ordem de exibição (usado na comparação e nos testes).
export const ALL_FEATURES: FeatureKey[] = [
  "finance",
  "accounting",
  "giving",
  "communication",
  "study",
  "teams",
  "events",
  "members",
];

// Rótulo humano de cada recurso (para a vitrine de planos).
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  finance: "Financeiro",
  accounting: "Contabilidade",
  giving: "Doações e recibos",
  communication: "Comunicação (Espaços, Mensagens, Chat)",
  study: "Estudo (sermões + estudo bíblico)",
  teams: "Ministérios e escalas",
  events: "Eventos",
  members: "Contas de membro e convites",
};

export interface Plan {
  code: PlanCode;
  name: string; // nome comercial
  tagline: string; // frase curta de marketing
  priceHint: string; // gancho de preço (vira o preço do Stripe depois)
  features: FeatureKey[]; // recursos travados que ESTE plano libera
}

// Free não libera nenhum recurso travado (só o núcleo pastoral); Pro libera todos.
export const PLANS: Record<PlanCode, Plan> = {
  free: {
    code: "free",
    name: "Comunidade",
    tagline: "O coração pastoral da Mercy — de graça para pastorear.",
    priceHint: "Grátis",
    features: [],
  },
  pro: {
    code: "pro",
    name: "Igreja",
    tagline: "Tudo para operar a igreja — finanças, comunicação, ensino e times.",
    priceHint: "Em breve",
    features: [...ALL_FEATURES],
  },
};

export const PLAN_ORDER: PlanCode[] = ["free", "pro"];

// Coage um texto do banco a um PlanCode conhecido; desconhecido/vazio → "free" (o mais
// restritivo, nunca libera por engano).
export function asPlanCode(v: string | null | undefined): PlanCode {
  return v === "pro" ? "pro" : "free";
}

// A trava: o plano da igreja libera este recurso?
export function planAllows(plan: string | null | undefined, feature: FeatureKey): boolean {
  return PLANS[asPlanCode(plan)].features.includes(feature);
}

// Menor plano que libera um recurso (para a mensagem de upsell: "recurso do plano X").
export function requiredPlanFor(feature: FeatureKey): PlanCode {
  for (const code of PLAN_ORDER) {
    if (PLANS[code].features.includes(feature)) return code;
  }
  return "pro"; // fallback defensivo (todo recurso travado está no Pro)
}

export function planName(plan: string | null | undefined): string {
  return PLANS[asPlanCode(plan)].name;
}
