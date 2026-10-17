// Upsell (Server Component puro) — mostrado no lugar de um módulo travado quando o plano
// da igreja não o libera. Diz o que o recurso é, em qual plano ele está, e leva à vitrine
// de planos. Não é bloqueio de segurança (a RLS é): é convite comercial.
import Link from "next/link";
import { FEATURE_LABELS, PLANS, requiredPlanFor, type FeatureKey } from "../catalog";
import { SITE } from "@/config/site";
import styles from "../plans.module.css";

export function Upsell({ feature }: { feature: FeatureKey }) {
  const plan = PLANS[requiredPlanFor(feature)];
  const label = FEATURE_LABELS[feature];

  return (
    <div className="panel">
      <div className={styles.upsell}>
        <div className={styles.upsellIcon} aria-hidden="true">
          🔒
        </div>
        <div className={styles.upsellTitle}>{label} é do plano {plan.name}</div>
        <p className={styles.upsellText}>
          Este recurso faz parte do plano <strong>{plan.name}</strong>. Sua igreja está em outro plano
          no momento — dá uma olhada no que o {plan.name} desbloqueia.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Link className="btn" href="/plans">
            Ver planos
          </Link>
          {SITE.tourUrl ? (
            <a className="btn ghost" href={SITE.tourUrl} target="_blank" rel="noreferrer">
              Agendar um tour
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
