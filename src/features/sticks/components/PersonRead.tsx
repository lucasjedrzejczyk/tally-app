// Ficha em modo leitura (spec 13, C2): só o que existe. Campo vazio não aparece; seção sem nada
// também não. Telefone, WhatsApp e e-mail viram botões de ação no cabeçalho (PersonProfile).
import Link from "next/link";
import { money } from "@/lib/utils/money";
import { addressLine, aboutLine, churchTimeline, optionLabel, ROLE_OPTIONS } from "../domain";
import type { PersonDetail } from "../types";
import styles from "../people.module.css";

export function personAddress(d: PersonDetail): { line: string; fromFamily: boolean } {
  const own = addressLine({ line1: d.values.line1, line2: d.values.line2, city: d.values.city, state: d.values.state, postalCode: d.values.postalCode });
  if (own || !d.family) return { line: own, fromFamily: false };
  return { line: addressLine(d.family), fromFamily: Boolean(addressLine(d.family)) };
}

export function PersonRead({
  detail,
  canEdit,
  canFinance,
  now,
  onOpenPerson,
  onEdit,
  hasActions,
}: {
  detail: PersonDetail;
  canEdit: boolean;
  canFinance: boolean;
  now: Date;
  onOpenPerson: (id: string) => void;
  onEdit: () => void;
  hasActions: boolean;
}) {
  const v = detail.values;
  const about = aboutLine(v, now);
  const address = personAddress(detail);
  const others = detail.family && detail.family.members.length > 1 ? detail.family.members : [];
  const timeline = churchTimeline(v);
  const tithes = canFinance && detail.tithes && detail.tithes.count > 0 ? detail.tithes : null;

  if (!hasActions && !about && !address.line && !others.length && !timeline.length && !tithes)
    return (
      <div className={styles.blank}>
        <p>Ainda sem dados.</p>
        {canEdit ? <button type="button" className="btn ghost sm" onClick={onEdit}>Completar cadastro</button> : null}
      </div>
    );

  return (
    <>
      {about ? (
        <section className={styles.sec} aria-labelledby="sec-about">
          <h2 id="sec-about" className={styles.secTitle}>Sobre</h2>
          <p className={styles.line}>{about}</p>
        </section>
      ) : null}

      {address.line ? (
        <section className={styles.sec} aria-labelledby="sec-address">
          <h2 id="sec-address" className={styles.secTitle}>Endereço</h2>
          <p className={styles.line}>
            <a className="link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.line)}`} target="_blank" rel="noreferrer">{address.line}</a>
            {address.fromFamily ? <span className={styles.dim}> (endereço da família)</span> : null}
          </p>
        </section>
      ) : null}

      {others.length ? (
        <section className={styles.sec} aria-labelledby="sec-family">
          <h2 id="sec-family" className={styles.secTitle}>Família</h2>
          <p className={styles.line}>
            {others.map((m, i) => (
              <span key={m.stickId}>
                {i > 0 ? ", " : ""}
                {m.stickId === detail.id ? m.name : <button type="button" className={styles.famLink} onClick={() => onOpenPerson(m.stickId)}>{m.name}</button>}
                <span className={styles.dim}> ({optionLabel(ROLE_OPTIONS, m.role).toLowerCase()})</span>
              </span>
            ))}
          </p>
        </section>
      ) : null}

      {timeline.length ? (
        <section className={styles.sec} aria-labelledby="sec-church">
          <h2 id="sec-church" className={styles.secTitle}>Na igreja</h2>
          <ol className={styles.tl}>
            {timeline.map((m) => (
              <li key={m.key} className={styles.tlItem}>
                <span>{m.label}</span>
                {m.when ? <span className={styles.dim}> {m.when}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {tithes ? (
        <section className={styles.sec} aria-labelledby="sec-tithes">
          <h2 id="sec-tithes" className={styles.secTitle}>Contribuições</h2>
          <p className={styles.line}>
            {tithes.year}: {money(tithes.total, tithes.currency)} em {tithes.count} {tithes.count === 1 ? "contribuição" : "contribuições"}
            {" · "}
            <Link href="/finance?tab=dizimos" className="link">Ver em Finanças</Link>
          </p>
        </section>
      ) : null}
    </>
  );
}
