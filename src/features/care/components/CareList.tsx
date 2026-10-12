"use client";

// Lista do Cuidado (spec 17, A3 e A4): "Pode precisar de atenção" (tocar = acompanhar, x = dispensar
// com Desfazer por 5 s), "Em andamento" (parados primeiro, com relógio além da cor) e, recolhidos,
// "Aguardando" e "Concluídos". Caso sigiloso mostra "Caso sigiloso" no lugar do motivo.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, Lock, X } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { dismissSuggestionAction } from "../actions";
import { sinceLabel, splitCare, stale, SUGGESTION_LIMIT } from "../domain";
import type { CareListItem, Suggestion } from "../types";
import people from "@/features/sticks/people.module.css";
import c from "../care.module.css";

const UNDO_MS = 5000;
const FADE_MS = 150;

function Row({ it, selected, today, onSelect }: { it: CareListItem; selected: boolean; today: string; onSelect: (id: string) => void }) {
  const late = stale(it, today);
  return (
    <button type="button" data-id={it.id} className={`${people.row} ${c.row}`} aria-current={selected ? "true" : undefined} onClick={() => onSelect(it.id)}>
      <Avatar name={it.name} photoUrl={it.photoUrl} size={32} />
      <span className={people.rowMain}>
        <span className={c.rowName}>
          <span className={c.ellipsis}>{it.name}</span>
          {it.confidential ? <span className={c.lock} title="Sigiloso"><UiIcon icon={Lock} /><span className={c.srOnly}>Sigiloso</span></span> : null}
        </span>
        <span className={people.rowSub}>{it.confidential ? "Caso sigiloso" : it.reason || "Sem motivo ainda"}</span>
        <span className={`${c.since}${late ? " " + c.late : ""}`}>
          {late ? <UiIcon icon={Clock} /> : null}
          {sinceLabel(it, today)}
        </span>
      </span>
      {it.assignedName ? <Avatar name={it.assignedName} size={24} className={c.resp} /> : <span />}
    </button>
  );
}

function Fold({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <section className={c.sec}>
      <button type="button" className={`${people.moreBtn} ${c.fold}${open ? " " + people.moreOpen : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {title} <span className={people.moreCount}>({count})</span>
        <span className={people.moreChev}><UiIcon icon={ChevronDown} /></span>
      </button>
      {open ? <div className={people.rows}>{children}</div> : null}
    </section>
  );
}

export function CareList({
  items,
  suggestions,
  selectedId,
  today,
  onSelect,
  onFollow,
  onSuggestions,
}: {
  items: CareListItem[];
  suggestions: Suggestion[];
  selectedId: string | null;
  today: string;
  onSelect: (id: string) => void;
  onFollow: (s: Suggestion) => Promise<string | null>;
  onSuggestions: (fn: (l: Suggestion[]) => Suggestion[]) => void;
}) {
  const [all, setAll] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ s: Suggestion; at: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const { open, waiting, done } = splitCare(items, today);
  const shown = all ? suggestions : suggestions.slice(0, SUGGESTION_LIMIT);

  function dismiss(s: Suggestion, at: number) {
    setErr("");
    setLeaving(s.key);
    timers.current.push(
      window.setTimeout(() => {
        setLeaving(null);
        onSuggestions((l) => l.filter((x) => x.key !== s.key));
        setUndo({ s, at });
        void dismissSuggestionAction(s.key, true).then((r) => !r.success && setErr(r.message));
        timers.current.push(window.setTimeout(() => setUndo((u) => (u?.s.key === s.key ? null : u)), UNDO_MS));
      }, FADE_MS),
    );
  }
  function restore() {
    if (!undo) return;
    const { s, at } = undo;
    setUndo(null);
    onSuggestions((l) => [...l.slice(0, at), s, ...l.slice(at)]);
    void dismissSuggestionAction(s.key, false);
  }
  async function follow(s: Suggestion) {
    setBusy(s.key);
    setErr("");
    const e = await onFollow(s);
    setBusy(null);
    if (e) setErr(e);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const ids = [...open, ...waiting].map((i) => i.id);
    const at = ids.indexOf(selectedId ?? "");
    const next = ids[at < 0 ? 0 : Math.min(ids.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    onSelect(next);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${CSS.escape(next)}"]`)?.focus();
  }

  return (
    <div onKeyDown={onKey}>
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
      {suggestions.length || undo ? (
        <section className={c.sec} aria-labelledby="sec-sugg">
          <h2 id="sec-sugg" className={people.secTitle}>Pode precisar de atenção</h2>
          <ul className={c.plain}>
            {shown.map((s, i) => (
              <li key={s.key} className={`${c.sugg}${leaving === s.key ? " " + c.gone : ""}`}>
                <button type="button" className={`${people.row} ${c.suggRow}`} disabled={busy === s.key} aria-label={`Acompanhar ${s.name}: ${s.reason}`} onClick={() => void follow(s)}>
                  <Avatar name={s.name} photoUrl={s.photoUrl} size={32} />
                  <span className={people.rowMain}>
                    <span className={people.rowName}>{s.name}</span>
                    <span className={c.reason}>{s.reason}</span>
                  </span>
                </button>
                <button type="button" className={`iconbtn ${c.x}`} aria-label={`Dispensar ${s.name}`} onClick={() => dismiss(s, i)}>
                  <UiIcon icon={X} />
                </button>
              </li>
            ))}
          </ul>
          {undo ? (
            <p className={c.undo} role="status">
              Sugestão dispensada.
              <button type="button" className="btn ghost sm" onClick={restore}>Desfazer</button>
            </p>
          ) : null}
          {!all && suggestions.length > SUGGESTION_LIMIT ? (
            <button type="button" className={`link ${c.moreLink}`} onClick={() => setAll(true)}>Ver mais ({suggestions.length - SUGGESTION_LIMIT})</button>
          ) : null}
        </section>
      ) : null}

      <section className={c.sec} aria-labelledby="sec-open">
        <h2 id="sec-open" className={people.secTitle}>Em andamento</h2>
        {open.length ? (
          <div className={people.rows}>
            {open.map((it) => <Row key={it.id} it={it} selected={it.id === selectedId} today={today} onSelect={onSelect} />)}
          </div>
        ) : (
          <p className={c.none}>Ninguém sendo acompanhado agora.</p>
        )}
      </section>
      <Fold title="Aguardando" count={waiting.length}>
        {waiting.map((it) => <Row key={it.id} it={it} selected={it.id === selectedId} today={today} onSelect={onSelect} />)}
      </Fold>
      <Fold title="Concluídos" count={done.length}>
        {done.map((it) => <Row key={it.id} it={it} selected={it.id === selectedId} today={today} onSelect={onSelect} />)}
      </Fold>
    </div>
  );
}
