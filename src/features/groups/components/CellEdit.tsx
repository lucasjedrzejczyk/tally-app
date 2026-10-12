"use client";

// Ficha da célula em modo Editar (spec 14, A6): nome, dia, horário, local, supervisor e a lista de
// membros com papel. Cada campo salva ao sair (Enter ou sair do campo; o Dia, ao escolher);
// "Pronto" volta para a leitura. Mudar membros e liderança só para quem gerencia células.
import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/shared/Select";
import { normalize } from "@/features/sticks/domain";
import type { PersonListItem } from "@/features/sticks/types";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { CELL_ROLES, WEEKDAYS, canonicalDay, parseTime } from "../domain";
import type { CellDetail, CellListItem } from "../types";
import { AddMembers } from "./AddMembers";
import g from "../groups.module.css";
import styles from "@/features/sticks/people.module.css";

export type SaveCellField = (field: "name" | "day" | "time" | "location", raw: string) => Promise<string | null>;
type Track = <T>(p: Promise<T>) => Promise<T>;

// Campo de texto que salva ao sair (mesmo comportamento dos campos de Pessoas).
export function TextField({ label, value, onSave, onState, wide, autoFocus, placeholder }: {
  label: string;
  value: string;
  onSave: (raw: string) => Promise<string | null>;
  onState: (hasError: boolean) => void;
  wide?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [err, setErr] = useState("");
  const inflight = useRef<Promise<unknown> | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);

  async function commit() {
    if (inflight.current) await inflight.current;
    if (draft === value) {
      setErr("");
      return void onState(false);
    }
    const run = onSave(draft);
    inflight.current = run;
    const e = await run;
    inflight.current = null;
    setErr(e ?? "");
    onState(Boolean(e));
  }

  return (
    <div className={`${styles.fld}${wide ? " " + styles.fldWide : ""}`}>
      <span className={styles.fLabel}>{label}</span>
      <div
        className={styles.fEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        onBlur={() => void commit()}
      >
        <input ref={input} className={styles.fInput} type="text" autoComplete="off" aria-label={label} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} />
        {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
      </div>
    </div>
  );
}

export function CellEdit({
  detail,
  persons,
  cells,
  focusName,
  onSave,
  onState,
  track,
  onSupervisor,
  onAdd,
  onRole,
  onRemove,
}: {
  detail: CellDetail;
  persons: PersonListItem[];
  cells: CellListItem[];
  focusName: boolean;
  onSave: SaveCellField;
  onState: (field: string, hasError: boolean) => void;
  track: Track;
  onSupervisor: (stickId: string | null) => Promise<string | null>;
  onAdd: (ids: string[]) => Promise<string | null>;
  onRole: (stickId: string, role: string) => Promise<string | null>;
  onRemove: (stickId: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const matches = useMemo(() => {
    const n = normalize(q);
    return persons.filter((p) => !p.archived && p.id !== detail.supervisor?.id && (!n || normalize(p.name).includes(n))).slice(0, 8);
  }, [persons, detail.supervisor, q]);

  async function run(p: Promise<string | null>) {
    setErr("");
    const e = await track(p);
    if (e) setErr(e);
  }
  const timeShown = parseTime(detail.time) ?? detail.time;

  return (
    <>
      <section className={styles.sec} aria-label="Dados da célula">
        <div className={styles.grid}>
          <TextField label="Nome" value={detail.name} wide autoFocus={focusName} onSave={(r) => onSave("name", r)} onState={(b) => onState("name", b)} />
          <div className={styles.fld}>
            <span className={styles.fLabel}>Dia</span>
            <Select
              aria-label="Dia"
              value={canonicalDay(detail.day)}
              onChange={(e) => void track(onSave("day", e.target.value)).then((m) => onState("day", Boolean(m)))}
            >
              <option value="">Não informado</option>
              {WEEKDAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          </div>
          <TextField label="Horário" value={timeShown} placeholder="20:00" onSave={(r) => onSave("time", r)} onState={(b) => onState("time", b)} />
          <TextField label="Local" value={detail.location} wide placeholder="Ex.: Casa da família Oliveira, Rua das Flores 120" onSave={(r) => onSave("location", r)} onState={(b) => onState("location", b)} />
        </div>
      </section>

      <section className={styles.sec} aria-labelledby="ed-sup">
        <h2 id="ed-sup" className={styles.secTitle}>Supervisor</h2>
        <div className={g.supRow}>
          {detail.supervisor ? (
            <>
              <span>{detail.supervisor.name}</span>
              <button type="button" className="link" onClick={() => void run(onSupervisor(null))}>Tirar</button>
            </>
          ) : null}
          <Popover trigger={detail.supervisor ? "Trocar" : "Escolher supervisor"} triggerClass="link" label="Escolher supervisor" haspopup="dialog">
            {(close) => (
              <>
                <input className={styles.search} type="search" placeholder="Buscar pessoa" aria-label="Buscar supervisor" value={q} onChange={(e) => setQ(e.target.value)} />
                <div className={studyStyles.popList}>
                  {matches.map((p) => (
                    <button key={p.id} type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); setQ(""); void run(onSupervisor(p.id)); }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Popover>
        </div>
      </section>

      <section className={styles.sec} aria-labelledby="ed-members">
        <h2 id="ed-members" className={styles.secTitle}>Membros ({detail.members.length})</h2>
        {detail.members.map((m) => (
          <div key={m.stickId} className={g.mEdit}>
            <span className={g.mEditName}>{m.name}</span>
            <Select compact className={g.mEditRole} aria-label={`Papel de ${m.name}`} value={m.role} onChange={(e) => void run(onRole(m.stickId, e.target.value))}>
              {CELL_ROLES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
            <button type="button" className="link" aria-label={`Tirar ${m.name} da célula`} onClick={() => void run(onRemove(m.stickId))}>Tirar da célula</button>
          </div>
        ))}
        <button type="button" className={`link ${g.addBtn}`} onClick={() => setAdding(true)}>Adicionar membros</button>
        {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
      </section>

      {adding ? (
        <AddMembers cellId={detail.id} persons={persons} cells={cells} memberIds={detail.members.map((m) => m.stickId)} onAdd={onAdd} onClose={() => setAdding(false)} />
      ) : null}
    </>
  );
}
