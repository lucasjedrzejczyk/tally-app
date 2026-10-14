"use client";

// Lembretes (spec 19, B1 a B4). Tocar em WhatsApp abre a conversa com a mensagem pronta e a linha vira
// "Lembrado" por 5 s (com Desfazer); depois recolhe para "Lembrados". Nada anima ao abrir a tela.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { markReminderAction } from "../actions";
import { DAY_TITLE, type Reminder, type ReminderDay } from "../domain";
import people from "@/features/sticks/people.module.css";
import s from "../reminders.module.css";

const UNDO_MS = 5000;
const FOLD_MS = 200;
type Phase = "undo" | "leaving";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={s.waIcon}>
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" />
    </svg>
  );
}

export function RemindersView({ items, initialDone }: { items: Reminder[]; initialDone: string[] }) {
  const [done, setDone] = useState(() => new Set(initialDone));
  const [phase, setPhase] = useState<Record<string, Phase>>({});
  const [openDone, setOpenDone] = useState(false);
  const [err, setErr] = useState("");
  const timers = useRef<Map<string, number[]>>(new Map());
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((ts) => ts.forEach((t) => window.clearTimeout(t)));
  }, []);

  const clear = (key: string) => {
    (timers.current.get(key) ?? []).forEach((t) => window.clearTimeout(t));
    timers.current.delete(key);
  };
  const setP = (key: string, p: Phase | null) =>
    setPhase((cur) => {
      const n = { ...cur };
      if (p) n[key] = p;
      else delete n[key];
      return n;
    });

  function mark(r: Reminder) {
    if (done.has(r.key) || phase[r.key]) return;
    setErr("");
    setP(r.key, "undo");
    clear(r.key);
    timers.current.set(r.key, [
      window.setTimeout(() => setP(r.key, "leaving"), UNDO_MS),
      window.setTimeout(() => {
        setP(r.key, null);
        setDone((d) => new Set(d).add(r.key));
        timers.current.delete(r.key);
      }, UNDO_MS + FOLD_MS),
    ]);
    void markReminderAction(r.key, true).then((res) => {
      if (res.success) return;
      clear(r.key);
      setP(r.key, null);
      setErr(res.message);
    });
  }
  function undo(key: string) {
    clear(key);
    setP(key, null);
    setDone((d) => {
      const n = new Set(d);
      n.delete(key);
      return n;
    });
    void markReminderAction(key, false);
  }

  const pending = items.filter((r) => !done.has(r.key));
  const finished = items.filter((r) => done.has(r.key));
  const days: ReminderDay[] = ["today", "tomorrow", "week"];

  function row(r: Reminder) {
    const p = phase[r.key];
    const canMark = r.kind === "escala" || r.kind === "niver";
    return (
      <li key={r.key} className={s.item} data-phase={p}>
        <div className={s.itemIn}>
          <div className={s.row}>
            {r.kind === "form" ? <span className={s.formDot} aria-hidden="true" /> : <Avatar name={r.name} size={32} />}
            <span className={people.rowMain}>
              <span className={people.rowName}>{r.title}</span>
              <span className={people.rowSub}>{r.sub}</span>
            </span>
            <span className={s.act}>
              {p ? (
                <span className={s.lembrado}>
                  <UiIcon icon={Check} />
                  Lembrado
                  <button type="button" className={s.undo} onClick={() => undo(r.key)}>Desfazer</button>
                </span>
              ) : !canMark ? (
                <Link className="btn ghost sm" href={r.href}>Abrir</Link>
              ) : r.wa ? (
                <a className={`btn ghost sm ${s.wa}`} href={r.wa} target="_blank" rel="noreferrer" onClick={() => mark(r)}>
                  <WhatsAppIcon />
                  WhatsApp
                </a>
              ) : (
                <>
                  <Link className={s.noPhone} href={r.href}>Sem telefone</Link>
                  <button type="button" className="iconbtn" aria-label="Marcar como lembrado" onClick={() => mark(r)}>
                    <UiIcon icon={Check} />
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className={s.page}>
      <div className={people.head}>
        <h1 className="page">Lembretes</h1>
      </div>
      <p className={s.lead}>O que lembrar hoje e nos próximos dias. Toque em WhatsApp e a mensagem já vai pronta.</p>
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}

      {pending.length === 0 ? (
        <p className={s.empty}>{finished.length ? "Tudo lembrado por hoje." : "Nada para lembrar agora. Escalas de hoje e amanhã, aniversários da semana e próximos passos do Cuidado aparecem aqui."}</p>
      ) : (
        days.map((d) => {
          const list = pending.filter((r) => r.day === d);
          return list.length ? (
            <section key={d} className={s.sec}>
              <h2 className={s.secTitle}>{DAY_TITLE[d]}</h2>
              <ul className={s.list}>{list.map(row)}</ul>
            </section>
          ) : null;
        })
      )}

      {finished.length ? (
        <section className={s.sec}>
          <button type="button" className={`${people.moreBtn}${openDone ? " " + people.moreOpen : ""}`} aria-expanded={openDone} onClick={() => setOpenDone((o) => !o)}>
            Lembrados <span className={people.moreCount}>({finished.length})</span>
            <span className={people.moreChev}><UiIcon icon={ChevronDown} /></span>
          </button>
          {openDone ? (
            <ul className={s.list}>
              {finished.map((r) => (
                <li key={r.key} className={`${s.item} ${s.doneItem}`}>
                  <div className={s.itemIn}>
                    <div className={s.row}>
                      <Avatar name={r.name} size={32} />
                      <span className={people.rowMain}>
                        <span className={people.rowName}>{r.title}</span>
                        <span className={people.rowSub}>{r.sub}</span>
                      </span>
                      <button type="button" className={s.undo} onClick={() => undo(r.key)}>Desfazer</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
