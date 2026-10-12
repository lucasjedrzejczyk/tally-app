"use client";

// Ministério em modo Editar (spec 15, A5): nome, dia e horário do culto padrão, funções (chips; Enter
// adiciona, x tira, - e + mudam as vagas) e quem serve, com as funções de cada um e o papel.
// Cada coisa salva sozinha; "Pronto" volta para a leitura.
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Select } from "@/components/shared/Select";
import { UiIcon } from "@/components/shared/UiIcon";
import type { PersonListItem } from "@/features/sticks/types";
import { WEEKDAYS, canonicalDay } from "@/features/groups/domain";
import { AddMembers } from "@/features/groups/components/AddMembers";
import { TextField } from "@/features/groups/components/CellEdit";
import { addMinistryMembersAction, removeMinistryMemberAction, setMemberFunctionsAction, setMemberRoleAction, setRolesAction } from "../actions";
import { MINISTRY_ROLES, cleanRole, slotsFor } from "../domain";
import type { MinistryDetail } from "../types";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import m from "../ministries.module.css";

type Result = { success: true; data: MinistryDetail } | { success: false; message: string };

export function MinistryEdit({
  detail,
  persons,
  focusName,
  onSave,
  onState,
  track,
  onApplied,
}: {
  detail: MinistryDetail;
  persons: PersonListItem[];
  focusName: boolean;
  onSave: (field: "name" | "day" | "time", raw: string) => Promise<string | null>;
  onState: (field: string, hasError: boolean) => void;
  track: <T>(p: Promise<T>) => Promise<T>;
  onApplied: (p: Promise<Result>) => Promise<string | null>;
}) {
  const id = detail.id;
  const [newRole, setNewRole] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  // Fila: cada gravação parte da ficha que a anterior devolveu (dois toques rápidos nunca se apagam).
  const latest = useRef(detail);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const busy = useRef(0);
  useEffect(() => {
    if (busy.current === 0) latest.current = detail;
  }, [detail]);
  function later(make: (d: MinistryDetail) => Promise<Result>) {
    setErr("");
    busy.current++;
    const job = queue.current.then(async () => {
      const r = await make(latest.current);
      if (r.success) latest.current = r.data;
      const e = await onApplied(Promise.resolve(r));
      if (e) setErr(e);
    });
    queue.current = job.finally(() => busy.current--);
    void track(job);
  }
  const saveRoles = (next: (d: MinistryDetail) => { roles: string[]; slots: Record<string, number> }) =>
    later((d) => {
      const n = next(d);
      return setRolesAction(id, n.roles, n.slots);
    });
  function addRole() {
    const r = cleanRole(newRole);
    if (!r) return;
    setNewRole("");
    saveRoles((d) => ({ roles: d.roles.includes(r) ? d.roles : [...d.roles, r], slots: d.slots }));
  }
  const removeRole = (r: string) => saveRoles((d) => ({ roles: d.roles.filter((x) => x !== r), slots: d.slots }));
  const step = (r: string, n: number) => saveRoles((d) => ({ roles: d.roles, slots: { ...d.slots, [r]: Math.max(1, Math.min(20, slotsFor(d.slots, r) + n)) } }));
  function toggleFunction(stickId: string, r: string) {
    later((d) => {
      const cur = d.members.find((x) => x.stickId === stickId)?.roles ?? [];
      return setMemberFunctionsAction(id, stickId, cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);
    });
  }

  return (
    <>
      <section className={styles.sec} aria-label="Dados do ministério">
        <div className={styles.grid}>
          <TextField label="Nome" value={detail.name} wide autoFocus={focusName} onSave={(r) => onSave("name", r)} onState={(b) => onState("name", b)} />
          <div className={styles.fld}>
            <span className={styles.fLabel}>Dia do culto</span>
            <Select aria-label="Dia do culto" value={canonicalDay(detail.day)} onChange={(e) => void track(onSave("day", e.target.value)).then((msg) => onState("day", Boolean(msg)))}>
              <option value="">Não informado</option>
              {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <TextField label="Horário" value={detail.time} placeholder="19:00" onSave={(r) => onSave("time", r)} onState={(b) => onState("time", b)} />
        </div>
      </section>

      <section className={styles.sec} aria-labelledby="ed-roles">
        <h2 id="ed-roles" className={styles.secTitle}>Funções</h2>
        <ul className={m.roleList}>
          {detail.roles.map((r) => {
            const n = slotsFor(detail.slots, r);
            return (
              <li key={r} className={m.roleRow}>
                <span className={m.roleName}>{r}</span>
                <span className={m.stepper} role="group" aria-label={`Vagas de ${r}`}>
                  <button type="button" className="iconbtn" aria-label={`Menos uma vaga de ${r}`} disabled={n <= 1} onClick={() => step(r, -1)}><UiIcon icon={Minus} /></button>
                  <span className={m.stepN}>{n} {n === 1 ? "vaga" : "vagas"}</span>
                  <button type="button" className="iconbtn" aria-label={`Mais uma vaga de ${r}`} disabled={n >= 20} onClick={() => step(r, 1)}><UiIcon icon={Plus} /></button>
                </span>
                <button type="button" className="iconbtn" aria-label={`Tirar a função ${r}`} onClick={() => removeRole(r)}><UiIcon icon={X} /></button>
              </li>
            );
          })}
        </ul>
        <input
          className={`${styles.search} ${m.roleInput}`}
          type="text"
          placeholder="Nova função (ex.: Vocal) e Enter"
          aria-label="Nova função"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addRole();
            }
          }}
          onBlur={addRole}
        />
      </section>

      <section className={styles.sec} aria-labelledby="ed-members">
        <h2 id="ed-members" className={styles.secTitle}>Quem serve ({detail.members.length})</h2>
        {detail.members.map((p) => (
          <div key={p.stickId} className={m.mRow}>
            <div className={g.mEdit}>
              <span className={g.mEditName}>{p.name}</span>
              <Select compact className={m.mRole} aria-label={`Papel de ${p.name}`} value={p.role} onChange={(e) => { const v = e.target.value; later(() => setMemberRoleAction(id, p.stickId, v)); }}>
                {MINISTRY_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <button type="button" className="link" aria-label={`Tirar ${p.name} do ministério`} onClick={() => later(() => removeMinistryMemberAction(id, p.stickId))}>Tirar</button>
            </div>
            {detail.roles.length ? (
              <div className={m.fnChips} role="group" aria-label={`Funções de ${p.name}`}>
                {detail.roles.map((r) => {
                  const on = p.roles.includes(r);
                  return (
                    <button key={r} type="button" aria-pressed={on} className={`${m.fnChip}${on ? " " + m.fnOn : ""}`} onClick={() => toggleFunction(p.stickId, r)}>{r}</button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" className={`link ${g.addBtn}`} onClick={() => setAdding(true)}>Adicionar pessoas</button>
        {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
      </section>

      {adding ? (
        <AddMembers
          title="Adicionar pessoas"
          allIn="Todas as pessoas já servem neste ministério."
          cellId={id}
          persons={persons}
          cells={[]}
          memberIds={detail.members.map((x) => x.stickId)}
          onAdd={(ids) => onApplied(addMinistryMembersAction(id, ids))}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </>
  );
}
