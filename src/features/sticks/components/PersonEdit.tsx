"use client";

// Ficha em modo Editar (spec 13, C3): formulário completo, agrupado, rótulo em cima, grade que vira
// uma coluna quando falta espaço. Cada campo salva ao sair (Field); "Pronto" volta para a leitura.
import { addressLine, OFFICE_SUGGESTIONS, type PersonField } from "../domain";
import type { PersonDetail, PersonListItem } from "../types";
import { Field, type SaveField } from "./Field";
import { FamilySection } from "./FamilySection";
import styles from "../people.module.css";

export function PersonEdit({
  detail,
  people,
  canDocs,
  focusName,
  onSave,
  onState,
  onFamily,
  onSaved,
  onShareAddress,
  addrErr,
  sameAddress,
}: {
  detail: PersonDetail;
  people: PersonListItem[];
  canDocs: boolean;
  focusName: boolean;
  onSave: SaveField;
  onState: (field: PersonField, hasError: boolean) => void;
  onFamily: (f: PersonDetail["family"]) => void;
  onSaved: () => void;
  onShareAddress: () => void;
  addrErr: string;
  sameAddress: boolean;
}) {
  const v = detail.values;
  const F = (field: PersonField, extra?: { wide?: boolean; suggestions?: readonly string[]; autoFocus?: boolean }) => (
    <Field field={field} value={v[field]} onSave={onSave} onState={onState} {...extra} />
  );
  const ownAddress = addressLine(v);

  return (
    <>
      <section className={styles.sec} aria-labelledby="ed-contact">
        <h2 id="ed-contact" className={styles.secTitle}>Contato</h2>
        <div className={styles.grid}>
          {F("phone")}
          {F("whatsapp")}
          {F("email", { wide: true })}
        </div>
      </section>

      <section className={styles.sec} aria-labelledby="ed-personal">
        <h2 id="ed-personal" className={styles.secTitle}>Dados pessoais</h2>
        <div className={styles.grid}>
          {F("name", { wide: true, autoFocus: focusName })}
          {F("birthDate")}
          {F("gender")}
          {F("maritalStatus")}
          {F("profession")}
        </div>
      </section>

      {canDocs ? (
        <section className={styles.sec} aria-labelledby="ed-docs">
          <h2 id="ed-docs" className={styles.secTitle}>Documentos</h2>
          <div className={styles.grid}>
            {F("cpf")}
            {F("rg")}
          </div>
        </section>
      ) : null}

      <section className={styles.sec} aria-labelledby="ed-address">
        <h2 id="ed-address" className={styles.secTitle}>Endereço</h2>
        <div className={styles.grid}>
          {F("line1", { wide: true })}
          {F("line2")}
          {F("postalCode")}
          {F("city")}
          {F("state")}
        </div>
        {detail.family && ownAddress && !sameAddress ? (
          <button type="button" className={`link ${styles.famAdd}`} onClick={onShareAddress}>Usar este endereço para todos da família</button>
        ) : null}
        {addrErr ? <p className={styles.fErr} role="alert">{addrErr}</p> : null}
      </section>

      <FamilySection key={detail.id} personId={detail.id} family={detail.family} people={people} onFamily={onFamily} onSaved={onSaved} />

      <section className={styles.sec} aria-labelledby="ed-church">
        <h2 id="ed-church" className={styles.secTitle}>Na igreja</h2>
        <div className={styles.grid}>
          {F("status")}
          {F("office", { suggestions: OFFICE_SUGGESTIONS })}
          {F("firstVisit")}
          {F("conversionDate")}
          {F("baptismDate")}
          {F("admissionType")}
          {F("membershipDate")}
          {F("isLeader")}
          {F("exitDate")}
          {F("exitReason")}
        </div>
      </section>
    </>
  );
}
