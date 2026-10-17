// Faixa discreta para quem cuida da igreja (spec 20): pagamento atrasado ou cortesia acabando.
import Link from "next/link";
import type { BillingNotice } from "@/features/plans/effective";
import { brDay } from "@/features/admin/domain";
import { SITE } from "@/config/site";

export function BillingBanner({ notice, invoiceUrl }: { notice: NonNullable<BillingNotice>; invoiceUrl: string | null }) {
  const day = brDay(notice.until).slice(0, 5);
  return (
    <div className="muted" role="status" style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)", fontSize: "var(--t-13)" }}>
      {notice.kind === "past_due" ? (
        <>
          O pagamento não caiu. Seu plano continua até {day}.{" "}
          {invoiceUrl ? (
            <a className="link" href={invoiceUrl} target="_blank" rel="noreferrer">
              Ver a fatura
            </a>
          ) : null}
        </>
      ) : (
        <>
          Sua cortesia termina em {day}. <Link className="link" href="/plans">Assinar</Link>
          {SITE.tourUrl ? (
            <>
              {" "}ou{" "}
              <a className="link" href={SITE.tourUrl} target="_blank" rel="noreferrer">
                agendar um tour
              </a>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
