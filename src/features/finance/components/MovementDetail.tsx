"use client";

// Detalhe de um lançamento, no mesmo painel do Novo lançamento. Anular pede um segundo
// toque no próprio botão (sem diálogo): o lançamento postado não se apaga (m48).
import { useState, useTransition } from "react";
import { brDate } from "@/lib/utils/date";
import { money } from "@/lib/utils/money";
import { voidTransactionAction } from "../actions";
import type { Movement } from "../domain";
import type { FinanceFile } from "../files";
import { Attachments } from "./Attachments";
import { PlanLockLink } from "@/features/plans/components/PlanLockLink";
import styles from "../finance.module.css";

const KIND_LABEL: Record<Movement["kind"], string> = {
  in: "Entrada",
  out: "Saída",
  transfer: "Transferência",
  opening: "Saldo inicial",
  other: "Lançamento do contador",
};

export function MovementDetail({
  movement,
  nameOf,
  currency,
  files,
  onFilesChanged,
  full,
  onVoided,
  onClose,
}: {
  movement: Movement;
  nameOf: (id: string | null) => string;
  currency: string;
  files: FinanceFile[];
  onFilesChanged: () => void;
  full: boolean;
  onVoided: () => void;
  onClose: () => void;
}) {
  const [isArmed, setIsArmed] = useState(false);
  const [error, setError] = useState("");
  const [isVoiding, startVoiding] = useTransition();
  const m = movement;
  const canVoid = m.status === "posted" && m.kind !== "other" && m.kind !== "opening";

  const confirmVoid = (): void => {
    if (!isArmed) {
      setIsArmed(true);
      return;
    }
    startVoiding(async () => {
      const res = await voidTransactionAction(m.id);
      if (res.success) onVoided();
      else setError(res.message);
    });
  };

  return (
    <div className={styles.panelForm}>
      <div className={styles.panelBody}>
        <div className="muted">{KIND_LABEL[m.kind]}</div>
        <div className={`${styles.detailAmount}${m.kind === "in" ? ` ${styles.in}` : ""}`}>{money(m.amount, currency)}</div>
        {m.kind === "transfer" ? (
          <>
            <Row label="De" value={nameOf(m.accountId)} />
            <Row label="Para" value={nameOf(m.counterId)} />
          </>
        ) : m.kind !== "other" ? (
          <>
            <Row label="Categoria" value={nameOf(m.counterId)} />
            <Row label={m.kind === "in" ? "Entrou em" : "Saiu de"} value={nameOf(m.accountId)} />
          </>
        ) : null}
        {m.donor ? <Row label="De quem" value={m.donor} /> : null}
        <Row label="Data" value={brDate(m.date)} />
        {m.memo ? <Row label="Descrição" value={m.memo} /> : null}
        {m.kind === "other" ? (
          <p className="muted" style={{ marginTop: 14, lineHeight: 1.5 }}>
            Feito com várias partidas na Contabilidade. Para mudar, abra por lá.
          </p>
        ) : null}
        {m.status !== "posted" ? null : full ? (
          <Attachments files={files} target={{ entryId: m.id }} onChanged={onFilesChanged} />
        ) : (
          <p style={{ marginTop: 14 }}>
            <PlanLockLink>Anexar comprovante</PlanLockLink>
          </p>
        )}
        {error ? <div className="gerr">{error}</div> : null}
      </div>
      <div className={styles.panelFoot}>
        <button className={`btn ghost ${styles.press}`} type="button" onClick={onClose}>
          Fechar
        </button>
        {canVoid ? (
          <button className={`btn danger ${styles.press}`} type="button" disabled={isVoiding} onClick={confirmVoid}>
            {isVoiding ? "Anulando…" : isArmed ? "Toque de novo para anular" : "Anular lançamento"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
