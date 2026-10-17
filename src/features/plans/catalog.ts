// Catálogo de planos da Mercy — FONTE DA VERDADE (em código, sem tabela nova). O plano que
// vale para a igreja é calculado em effective.ts a partir de organizations (plan,
// plan_status, pro_until, grace_until). Aqui vive o que cada plano libera e os rótulos.
// Diferenciação é SÓ por recurso (feature-gating), não por tamanho. Ver
// docs/superpowers/specs/2026-08-01-planos-feature-gating-design.md.

export type PlanCode = "free" | "pro";

// Recursos TRAVÁVEIS (o que só o plano Igreja libera, spec 20). Tudo que não tem chave é do
// grátis: Bíblia (leitura, destaques, notas, busca), Sermões, Pessoas, Células e Finanças
// básica. Travas de tela inteira vão no layout (makeGatedLayout); as de pedaço de tela
// (palavra original, comentários, partes de Finanças) usam planAllows/Upsell no lugar.
export type FeatureKey =
  | "bible_original"
  | "bible_commentary"
  | "finance_full"
  | "accounting"
  | "ministries"
  | "encontros"
  | "care"
  | "kids"
  | "forms"
  | "reminders"
  | "giving"
  | "communication"
  | "teams"
  | "events"
  | "members";

// Todos os recursos travados, na ordem de exibição (usado na comparação e nos testes).
export const ALL_FEATURES: FeatureKey[] = [
  "bible_original",
  "bible_commentary",
  "finance_full",
  "accounting",
  "ministries",
  "encontros",
  "care",
  "kids",
  "forms",
  "reminders",
  "giving",
  "communication",
  "teams",
  "events",
  "members",
];

// Rótulo humano de cada recurso (para a vitrine de planos e o Upsell).
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  bible_original: "Palavra original (grego e hebraico)",
  bible_commentary: "Comentários bíblicos",
  finance_full: "Finanças completa (contas a pagar, comprovantes, extrato, recibos)",
  accounting: "Área do contador",
  ministries: "Ministérios e escalas",
  encontros: "Encontros",
  care: "Cuidado",
  kids: "Crianças",
  forms: "Formulários",
  reminders: "Lembretes",
  giving: "Doações e recibos",
  communication: "Comunicação (Espaços, Mensagens, Chat)",
  teams: "Escalas",
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

// Grátis não libera nenhum recurso travado (só o que não tem chave); Igreja libera todos.
export const PLANS: Record<PlanCode, Plan> = {
  free: {
    code: "free",
    name: "Comunidade",
    tagline: "Bíblia, sermões, pessoas, células e finanças básica. De graça.",
    priceHint: "Grátis",
    features: [],
  },
  pro: {
    code: "pro",
    name: "Igreja",
    tagline: "Tudo do grátis, mais palavra original, comentários, finanças completa e os ministérios.",
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
