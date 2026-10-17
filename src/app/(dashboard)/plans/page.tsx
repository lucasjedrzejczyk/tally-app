import { can, requireOrg } from "@/lib/auth/session";
import { PLANS } from "@/features/plans/catalog";
import { PlansComparison } from "@/features/plans/components/PlansComparison";
import { SubscribeForm } from "@/features/billing/components/SubscribeForm";
import { PRICE_MONTHLY, PRICE_YEARLY } from "@/config/billing";
import { SITE } from "@/config/site";

// Planos (Server Component) — vitrine: o plano atual da igreja + comparação dos planos.
// Visível a qualquer membro. Assinar só para quem tem org.manage e só com preço definido
// (config/billing.ts); sem preço, "Fale com a gente" + Agendar um tour (spec 20).
export default async function PlansPage() {
  const ctx = await requireOrg();
  const { plan, planState, supabase, orgId } = ctx;
  const active = planState?.plan === "pro" && planState.plan_status === "active";
  const canSubscribe = !active && can(ctx, "org.manage") && PRICE_MONTHLY > 0;

  let needsDoc = true;
  if (canSubscribe) {
    const { data } = await supabase.from("organizations").select("billing_doc").eq("id", orgId).maybeSingle();
    needsDoc = !data?.billing_doc;
  }

  return (
    <>
      <h1 className="page">Planos</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Sua igreja está no plano <strong>{PLANS[plan].name}</strong>
        {active ? ", com assinatura ativa" : ""}. Veja o que cada plano oferece.
      </p>
      <PlansComparison currentPlan={plan} />
      {canSubscribe ? <SubscribeForm monthly={PRICE_MONTHLY} yearly={PRICE_YEARLY} needsDoc={needsDoc} /> : null}
      {!active && SITE.tourUrl ? (
        <p style={{ marginTop: 16 }}>
          {canSubscribe ? "Prefere conhecer antes?" : `Quer o plano ${PLANS.pro.name}? Fale com a gente numa conversa de 30 minutos.`}{" "}
          <a className="btn" href={SITE.tourUrl} target="_blank" rel="noreferrer">
            Agendar um tour
          </a>
        </p>
      ) : null}
    </>
  );
}
