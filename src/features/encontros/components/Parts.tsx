"use client";

// Peças pequenas da ficha de Encontros: copiar convite, quem serve, contagem e barras.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { openLabel } from "@/features/ministries/domain";
import type { MinistryDetail } from "@/features/ministries/types";
import { inviteText, parseCount, trend } from "../domain";
import type { CountPoint, Serving } from "../types";
import people from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import m from "@/features/ministries/ministries.module.css";
import e from "../encontros.module.css";

const COPIED_MS = 2000;

/** "Copiar convite": copia o texto pronto; o rótulo vira "Copiado" com um blur curto e volta em 2 s. */
export function CopyInvite({ item }: { item: { date: string; time: string; name: string; location: string } }) {
  const [done, setDone] = useState(false);
  const [swap, setSwap] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  function flip(to: boolean) {
    setSwap(true);
    timers.current.push(window.setTimeout(() => { setDone(to); setSwap(false); }, 150));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteText(item));
    } catch {
      return;
    }
    flip(true);
    timers.current.push(window.setTimeout(() => flip(false), COPIED_MS));
  }
  return (
    <button type="button" className="btn ghost sm" onClick={() => void copy()} aria-live="polite">
      <span className={`${e.copy}${swap ? " " + e.copySwap : ""}`}>
        <UiIcon icon={done ? Check : Copy} />
        {done ? "Copiado" : "Copiar convite"}
      </span>
    </button>
  );
}

/** Quem serve: uma linha por ministério (nome, vagas e rostos escalados); tocar abre a Montar escala. */
export function ServingList({ serving, linkNames, onOpen }: { serving: Serving[]; linkNames: boolean; onOpen: (m: MinistryDetail) => void }) {
  if (!serving.length) return <p className={g.lastText}>Nenhum ministério ligado a este culto. No Editar do ministério, escolha este culto.</p>;
  return (
    <ul className={e.list}>
      {serving.map((s) => {
        const ready = s.ministry.roles.length > 0 && s.ministry.members.length > 0;
        const body = (
          <>
            <span className={e.rowMain}>
              <span className={e.rowName}>{s.ministry.name}</span>
              <span className={e.rowSub}>{s.faces.length ? `${s.faces.length} ${s.faces.length === 1 ? "escalado" : "escalados"}` : ready ? "Montar escala" : "Sem funções ou pessoas ainda"}</span>
            </span>
            <span className={e.rowEnd}>
              {s.open ? <span className={g.pill}>{openLabel(s.open)}</span> : null}
              {s.faces.length ? (
                <span className={e.faces} role="img" aria-label={s.faces.map((f) => f.name).join(", ")}>
                  {s.faces.map((f) => (
                    <span key={f.stickId} className={[m.ring, f.status === "confirmed" ? m.ringOk : f.notified ? m.ringSent : ""].filter(Boolean).join(" ")}>
                      <Avatar name={f.name} photoUrl={f.photoUrl} size={32} />
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </>
        );
        return (
          <li key={s.ministry.id}>
            {ready ? (
              <button type="button" className={e.row} onClick={() => onOpen(s.ministry)} aria-label={`Escala de ${s.ministry.name}`}>{body}</button>
            ) : linkNames ? (
              <Link className={e.row} href={`/ministries?m=${s.ministry.id}`}>{body}</Link>
            ) : (
              <div className={e.row}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Um número da contagem: tocar vira campo; Enter ou sair grava, Esc desfaz. */
export function CountBox({ label, value, canEdit, onSave }: { label: string; value: number | null; canEdit: boolean; onSave: (v: number | null) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(value);
  const [bump, setBump] = useState(0);
  if (!editing && shown !== value) {
    setShown(value);
    setBump((b) => b + 1);
  }
  const cancel = useRef(false);

  async function commit() {
    if (cancel.current) {
      cancel.current = false;
      return setEditing(false);
    }
    const v = parseCount(draft);
    if (v === undefined) return setErr("Use só números.");
    setEditing(false);
    setErr("");
    if (v === value) return;
    setShown(v);
    setBump((b) => b + 1);
    const e2 = await onSave(v);
    if (e2) {
      setErr(e2);
      setShown(value);
    }
  }

  const id = `count-${label}`;
  return (
    <div>
      {editing ? (
        <label className={e.countEdit} htmlFor={id}>
          <input
            id={id}
            className={e.countInput}
            inputMode="numeric"
            autoFocus
            aria-label={label}
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            onFocus={(ev) => ev.currentTarget.select()}
            onBlur={() => void commit()}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") ev.currentTarget.blur();
              if (ev.key === "Escape") {
                ev.preventDefault();
                cancel.current = true;
                ev.currentTarget.blur();
              }
            }}
          />
          <span className={e.countLabel}>{label}</span>
        </label>
      ) : (
        <button type="button" className={e.count} disabled={!canEdit} aria-label={`${label}: ${shown ?? "sem contagem"}`} onClick={() => { setDraft(shown === null ? "" : String(shown)); setEditing(true); }}>
          <span key={bump} className={`${e.countN}${shown === null ? " " + e.countNone : ""}${bump ? " " + e.countSwap : ""}`}>{shown ?? "-"}</span>
          <span className={e.countLabel}>{label}</span>
        </button>
      )}
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
    </div>
  );
}

/** Barras das últimas contagens (a do dia em azul) e a média. */
export function Bars({ history, date, headcount }: { history: CountPoint[]; date: string; headcount: number | null }) {
  const all = headcount === null ? history.filter((p) => p.date !== date) : [...history.filter((p) => p.date !== date), { date, headcount }];
  const t = trend(all, date);
  if (t.points.length < 2) return null;
  return (
    <>
      <div className={e.bars} role="img" aria-label={`Últimas contagens: ${t.points.map((p) => p.headcount).join(", ")}`}>
        {t.points.map((p) => (
          <span key={p.date} className={`${e.bar}${p.date === date ? " " + e.barNow : ""}`} style={{ "--h": p.headcount / t.max } as React.CSSProperties} />
        ))}
      </div>
      <p className={e.barsFoot}>Média {t.avg} nos últimos {t.points.length} cultos</p>
    </>
  );
}
