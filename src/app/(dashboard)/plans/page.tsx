import { requireOrg } from "@/lib/auth/session";
import { PLANS } from "@/features/plans/catalog";
import { PlansComparison } from "@/features/plans/components/PlansComparison";
import { SITE } from "@/config/site";

// Planos (Server Component) — vitrine: o plano atual da igreja + comparação dos planos.
// Visível a qualquer membro. Sem cobrança ainda: o pago vem da cortesia que o dono dá no
// /admin depois do tour (spec 20). Ver docs/superpowers/specs/2026-08-01-planos-feature-gating-design.md.
export default async function PlansPage() {
  const { plan } = await requireOrg();

  return (
    <>
      <h1 className="page">Planos</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Sua igreja está no plano <strong>{PLANS[plan].name}</strong>. Veja o que cada plano oferece.
      </p>
      <PlansComparison currentPlan={plan} />
      {plan === "free" && SITE.tourUrl ? (
        <p style={{ marginTop: 16 }}>
          Quer conhecer o plano {PLANS.pro.name}? Marque uma conversa de 30 minutos com a gente.{" "}
          <a className="btn" href={SITE.tourUrl} target="_blank" rel="noreferrer">
            Agendar um tour
          </a>
        </p>
      ) : null}
    </>
  );
}
