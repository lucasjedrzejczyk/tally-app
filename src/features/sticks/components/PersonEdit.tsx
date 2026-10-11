"use client";

// Ficha em modo Editar (spec 13, C3 e D): só o essencial à mostra; o resto fica em "Mais dados",
// recolhido. Rótulo em cima, grade que vira uma coluna quando falta espaço. Cada campo salva ao sair (Field); "Pronto" volta para a leitura.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { addressLine, moreFilled, OFFICE_SUGGESTIONS, type PersonField } from "../domain";
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
  const F = (field: PersonField, extra?: { wide?: boolean; suggestions?: readonly string[]; autoFocus?: boolean; label?: string; hint?: string }) => (
    <Field field={field} value={v[field]} onSave={onSave} onState={onState} {...extra} />
  );
  const ownAddress = addressLine(v);
  const [more, setMore] = useState(false);
  const filled = moreFilled(v, canDocs);

  return (
    <>
      <section className={styles.sec} aria-label="Dados básicos">
        <div className={styles.grid}>
          {F("name", { wide: true, autoFocus: focusName })}
          {F("phone", { label: "Celular", hint: "Também usado no WhatsApp" })}
          {F("birthDate")}
        </div>
      </section>

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
          {F("baptismDate")}
          {F("membershipDate")}
        </div>
      </section>

      <div className={more ? styles.moreOpen : undefined}>
        <button type="button" className={styles.moreBtn} aria-expanded={more} onClick={() => setMore(!more)}>
          Mais dados
          <span className={styles.moreChev}><UiIcon icon={ChevronDown} /></span>
          {filled > 0 ? <span className={styles.moreCount}>{filled} {filled === 1 ? "preenchido" : "preenchidos"}</span> : null}
        </button>
        {more ? (
          <section className={`${styles.sec} ${styles.fade}`} aria-label="Mais dados">
            <div className={styles.grid}>
              {F("email", { wide: true })}
              {F("whatsapp", { hint: "Só se for outro número" })}
              {F("gender")}
              {F("maritalStatus")}
              {F("profession")}
              {canDocs ? F("cpf") : null}
              {canDocs ? F("rg") : null}
              {F("firstVisit")}
              {F("conversionDate")}
              {F("admissionType")}
              {F("isLeader")}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
