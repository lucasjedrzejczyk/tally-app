"use client";

// Família no modo Editar (spec 13): membros com o papel de cada um (Select), juntar a outra pessoa
// (ou criar a família) e tirar da família. Na leitura a família é só uma linha (PersonRead).
import { useMemo, useState } from "react";
import { Select } from "@/components/shared/Select";
import { Popover } from "@/features/study/components/Popover";
import { addToFamilyAction, removeFromFamilyAction, setFamilyRoleAction } from "../actions";
import { normalize, ROLE_OPTIONS } from "../domain";
import type { Family, PersonListItem } from "../types";
import studyStyles from "@/features/study/study.module.css";
import styles from "../people.module.css";

export function FamilySection({
  personId,
  family,
  people,
  onFamily,
  onSaved,
}: {
  personId: string;
  family: Family | null;
  people: PersonListItem[];
  onFamily: (f: Family | null) => void;
  onSaved: () => void;
}) {
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const matches = useMemo(() => {
    const n = normalize(q);
    return people.filter((p) => p.id !== personId && !p.archived && (!n || normalize(p.name).includes(n))).slice(0, 8);
  }, [people, personId, q]);

  async function add(withId: string | null, close: () => void) {
    setErr("");
    const r = await addToFamilyAction(personId, withId);
    if (!r.success) return void setErr(r.message);
    close();
    setQ("");
    onFamily(r.data);
    onSaved();
  }
  async function role(stickId: string, value: string) {
    if (!family) return;
    setErr("");
    const r = await setFamilyRoleAction(stickId, value);
    if (!r.success) return void setErr(r.message);
    onFamily({ ...family, members: family.members.map((m) => (m.stickId === stickId ? { ...m, role: value as typeof m.role } : m)) });
    onSaved();
  }
  async function leave() {
    setErr("");
    const r = await removeFromFamilyAction(personId);
    if (!r.success) return void setErr(r.message);
    onFamily(null);
    onSaved();
  }

  return (
    <section className={styles.sec} aria-labelledby="sec-family">
      <h2 id="sec-family" className={styles.secTitle}>Família</h2>
      {family ? (
        <>
          <p className={styles.famName}>{family.name}</p>
          {family.members.map((m) => (
            <div key={m.stickId} className={styles.famRow}>
              <span className={m.stickId === personId ? styles.famSelf : undefined}>{m.name}</span>
              <Select compact aria-label={`Papel de ${m.name}`} value={m.role} onChange={(e) => void role(m.stickId, e.target.value)}>
                {ROLE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
          ))}
          <button type="button" className={`link ${styles.famLeave}`} onClick={() => void leave()}>Tirar da família</button>
        </>
      ) : (
        <Popover trigger="Adicionar à família" triggerClass={`link ${styles.famAdd}`} label="Adicionar à família" haspopup="dialog">
          {(close) => (
            <>
              <input
                className={styles.search}
                type="search"
                placeholder="Buscar pessoa"
                aria-label="Buscar pessoa da família"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className={studyStyles.popList}>
                {matches.map((p) => (
                  <button key={p.id} type="button" role="menuitem" className={studyStyles.mi} onClick={() => void add(p.id, close)}>
                    Juntar à família de {p.name}
                  </button>
                ))}
              </div>
              <hr className={studyStyles.miSep} />
              <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void add(null, close)}>Criar família</button>
            </>
          )}
        </Popover>
      )}
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
    </section>
  );
}
