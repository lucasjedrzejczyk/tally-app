// Vitrine de planos (Server Component puro) — os dois planos lado a lado, o plano atual da
// igreja em destaque, com o que cada um libera. Derivada do catálogo. Marketing/comparação;
// sem cobrança ainda, o pago vem da cortesia dada no /admin.
import { PLAN_ORDER, PLANS, ALL_FEATURES, FEATURE_LABELS, asPlanCode, planAllows } from "../catalog";
import styles from "../plans.module.css";

export function PlansComparison({ currentPlan }: { currentPlan: string }) {
  const current = asPlanCode(currentPlan);

  return (
    <>
      <div className={styles.grid}>
        {PLAN_ORDER.map((code) => {
          const plan = PLANS[code];
          const isCurrent = code === current;
          return (
            <div key={code} className={`${styles.card}${isCurrent ? " " + styles.current : ""}`}>
              <div className={styles.cardHead}>
                <span className={styles.planName}>{plan.name}</span>
                {isCurrent ? <span className={styles.currentBadge}>Plano atual</span> : <span className={styles.planPrice}>{plan.priceHint}</span>}
              </div>
              <p className={styles.planTag}>{plan.tagline}</p>
              <ul className={styles.featureList}>
                {ALL_FEATURES.map((f) => {
                  const on = planAllows(code, f);
                  return (
                    <li key={f} className={on ? "" : styles.off}>
                      <span className={on ? styles.check : styles.dash} aria-hidden="true">
                        {on ? "✓" : "—"}
                      </span>
                      {FEATURE_LABELS[f]}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className={styles.coreNote}>
        Todos os planos incluem a Bíblia (leitura, destaques, notas e busca), Sermões, Pessoas, Células e
        Finanças básica (lançamentos, saldo, dízimos e fechamento do mês). O plano Igreja acrescenta o que
        está acima. Ao voltar para o grátis, nada é apagado.
      </p>
    </>
  );
}
