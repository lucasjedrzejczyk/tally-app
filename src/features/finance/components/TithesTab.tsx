"use client";

// Aba Dízimos (spec 10, fase 3): quanto entrou em dízimos e ofertas no mês (o livro todo,
// inclusive o que veio do banco sem nome) e, embaixo, quem contribuiu, por pessoa. Tocar na
// pessoa abre as contribuições dela com o recibo de cada uma e a declaração anual. "Lançar
// culto" registra vários de uma vez; o PIX com nome vira dízimo da pessoa no Classificar.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { brDate, isoDate, today } from "@/lib/utils/date";
import { money } from "@/lib/utils/money";
import type { ActionResult } from "@/lib/errors";
import { inPeriod, type PeriodRange } from "@/lib/utils/period";
import { donorKey, donorTotals, methodLabel, sumDonations, type DonorTotal } from "@/features/giving/domain";
import { issueAnnualReceipt, issueGiftReceipt } from "@/features/giving/actions";
import type { Donation, ReceiptListItem } from "@/features/giving/types";
import { Panel } from "./Panel";
import { PlanLockLink } from "@/features/plans/components/PlanLockLink";
import styles from "../finance.module.css";

const normalize = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TithesTab({
  donations,
  receipts,
  range,
  monthName,
  givingTotal,
  currency,
  onRegister,
  full,
}: {
  donations: Donation[];
  receipts: ReceiptListItem[];
  range: PeriodRange;
  monthName: string;
  givingTotal: number; // dízimos, ofertas e doações do mês no livro, com ou sem nome
  currency: string;
  onRegister: () => void;
  full: boolean; // recibos e declaração anual são do plano pago
}) {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const inRange = useMemo(() => donations.filter((d) => inPeriod(d.date, range)), [donations, range]);
  const lastDateByDonor = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of inRange) {
      const k = donorKey(d);
      if ((m.get(k) ?? "") < d.date) m.set(k, d.date);
    }
    return m;
  }, [inRange]);
  const allDonors = useMemo(() => donorTotals(inRange), [inRange]);
  const q = normalize(query.trim());
  const donors = q ? allDonors.filter((t) => normalize(t.name).includes(q)) : allDonors;
  const opened = openKey ? allDonors.find((t) => t.key === openKey) : undefined;

  const named = sumDonations(inRange);
  const unnamed = Math.max(0, givingTotal - named);

  if (donations.length === 0 && givingTotal === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Nenhum dízimo em {monthName}</div>
        <p>Depois do culto, lance os envelopes numa lista só: nome, valor, Enter. O PIX que chega com nome no extrato entra sozinho.</p>
        <button type="button" className={`btn ${styles.press}`} onClick={onRegister}>
          Lançar culto
        </button>
      </div>
    );
  }

  return (
    <>
      <section className={styles.hero} aria-label="Total do mês">
        <div className={styles.heroLabel}>Dízimos e ofertas em {monthName}</div>
        <div className={styles.heroValue}>{money(Math.max(givingTotal, named), currency)}</div>
        <div className={styles.periodSummary}>
          <b>{money(named, currency)}</b> de {allDonors.length === 1 ? "1 pessoa" : `${allDonors.length} pessoas`}
          {unnamed >= 0.005 ? (
            <>
              {" "}· <b>{money(unnamed, currency)}</b> sem nome (ofertas do culto, PIX sem identificação)
            </>
          ) : null}
        </div>
      </section>

      <input
        className="searchbox"
        type="search"
        placeholder="Buscar pessoa"
        aria-label="Buscar pessoa"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {donors.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{query ? "Ninguém com esse nome" : "Nenhuma contribuição com nome"}</div>
          <p>{query ? "Confira a grafia ou limpe a busca." : "Use “Lançar culto” para os envelopes. PIX com nome no extrato entra aqui ao classificar."}</p>
        </div>
      ) : (
        donors.map((t) => (
          <button key={t.key} type="button" className={styles.row} onClick={() => setOpenKey(t.key)}>
            <div className={styles.rowMain}>
              <div className={styles.rowTitle}>{t.name}</div>
              <div className={styles.rowSub}>
                {t.count === 1 ? "1 contribuição" : `${t.count} contribuições`} · última em {brDate(lastDateByDonor.get(t.key) ?? "")}
              </div>
            </div>
            <div className={styles.amount}>{money(t.total, currency)}</div>
          </button>
        ))
      )}

      {opened ? (
        <Panel title={opened.name} onClose={() => setOpenKey(null)}>
          {(close) => (
            <DonorDetail
              donor={opened}
              donations={inRange.filter((d) => donorKey(d) === opened.key)}
              receipts={receipts}
              year={Number((range.to ?? isoDate(today())).slice(0, 4))}
              currency={currency}
              full={full}
              onClose={close}
            />
          )}
        </Panel>
      ) : null}
    </>
  );
}

function DonorDetail({
  donor,
  donations,
  receipts,
  year,
  currency,
  full,
  onClose,
}: {
  donor: DonorTotal;
  donations: Donation[];
  receipts: ReceiptListItem[];
  year: number;
  currency: string;
  full: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isIssuing, startIssuing] = useTransition();
  const receiptByDonation = new Map(receipts.filter((r) => r.kind === "gift" && r.donationId).map((r) => [r.donationId, r.id]));
  const isAnonymous = donor.key === "__anon__";

  const issue = (run: () => Promise<ActionResult<{ receiptId: string }>>): void => {
    setError("");
    startIssuing(async () => {
      const res = await run();
      if (res.success) router.push(`/finance/recibo/${res.data.receiptId}`);
      else setError(res.message);
    });
  };

  return (
    <div className={styles.panelForm}>
      <div className={styles.panelBody}>
        <div className="muted">No período</div>
        <div className={styles.detailAmount}>{money(donor.total, currency)}</div>
        {donations
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((d) => {
            const receiptId = receiptByDonation.get(d.id);
            return (
              <div key={d.id} className="kv">
                <span>
                  {brDate(d.date)} · {methodLabel(d.method)}
                  {d.fundName ? ` · ${d.fundName}` : ""}
                </span>
                <b>
                  {money(d.amount, currency)}{" "}
                  {!full ? (
                    <PlanLockLink>Recibo</PlanLockLink>
                  ) : receiptId ? (
                    <button type="button" className="link" onClick={() => router.push(`/finance/recibo/${receiptId}`)}>
                      Ver recibo
                    </button>
                  ) : (
                    <button type="button" className="link" disabled={isIssuing} onClick={() => issue(() => issueGiftReceipt(d.id))}>
                      Recibo
                    </button>
                  )}
                </b>
              </div>
            );
          })}
        {error ? <div className="gerr">{error}</div> : null}
      </div>
      <div className={styles.panelFoot}>
        <button className={`btn ghost ${styles.press}`} type="button" onClick={onClose}>
          Fechar
        </button>
        {isAnonymous ? null : !full ? (
          <PlanLockLink>Declaração de {year}</PlanLockLink>
        ) : (
          <button
            className={`btn ${styles.press}`}
            type="button"
            disabled={isIssuing}
            onClick={() => issue(() => issueAnnualReceipt({ stickId: donor.stickId, donorName: donor.name, year }))}
          >
            {isIssuing ? "Emitindo…" : `Declaração de ${year}`}
          </button>
        )}
      </div>
    </div>
  );
}
