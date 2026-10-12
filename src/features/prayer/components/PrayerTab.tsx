"use client";

// Aba Orações do Cuidado (spec 17, Fase C): link público de pedidos, "Chegaram pelo link" (Aprovar /
// Recusar com Desfazer), mural com "Orei" (soma 1 por pedido neste aparelho) e Respondidas recolhidas.
// Linha que sai recolhe (200ms) em vez de sumir seco.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, HandHeart, MoreHorizontal } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { shortDate } from "@/features/groups/domain";
import type { PersonListItem } from "@/features/sticks/types";
import { approvePrayerAction, deletePrayerAction, prayForAction, prayerLinkAction, setAnsweredAction } from "../actions";
import { PRIVATE_LABEL, splitPrayers, type PrayerRequest } from "../domain";
import { NewPrayer } from "./NewPrayer";
import people from "@/features/sticks/people.module.css";
import c from "@/features/care/care.module.css";

const UNDO_MS = 5000;
const LEAVE_MS = 200;
const PRAYED_KEY = "mercy.prayed";
const COPIED_MS = 2000;

function readPrayed(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(PRAYED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function buzz() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* sem vibração */
  }
}

export function PrayerTab({
  initial,
  people: persons,
  token: initialToken,
  canManage,
  onPending,
}: {
  initial: PrayerRequest[];
  people: PersonListItem[];
  token: string | null;
  canManage: boolean;
  onPending: (n: number) => void;
}) {
  const [list, setList] = useState(initial);
  const [token, setToken] = useState(initialToken);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ p: PrayerRequest; text: string; timer: number } | null>(null);
  const [prayed, setPrayed] = useState<Set<string>>(new Set());
  const [bump, setBump] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);
  const [err, setErr] = useState("");
  const timers = useRef<number[]>([]);
  useEffect(() => {
    setPrayed(readPrayed());
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  const { pending, wall, answered } = useMemo(() => splitPrayers(list), [list]);
  useEffect(() => onPending(pending.length), [pending.length, onPending]);

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  // Linha que sai: recolhe e só então muda a lista.
  function leave(id: string, then: () => void) {
    setLeaving((s) => new Set(s).add(id));
    later(() => {
      then();
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, LEAVE_MS);
  }
  function patch(id: string, fields: Partial<PrayerRequest>) {
    setList((l) => l.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  }

  // Apagar (recusar ou excluir): some na hora e só apaga no banco depois de 5 s sem Desfazer.
  function remove(p: PrayerRequest, text: string) {
    setErr("");
    if (undo) commitDelete(undo);
    leave(p.id, () => setList((l) => l.filter((x) => x.id !== p.id)));
    const timer = window.setTimeout(() => {
      setUndo((u) => (u?.p.id === p.id ? null : u));
      void deletePrayerAction(p.id).then((r) => {
        if (!r.success) {
          setErr(r.message);
          setList((l) => [p, ...l]);
        }
      });
    }, UNDO_MS);
    setUndo({ p, text, timer });
  }
  function commitDelete(u: { p: PrayerRequest; timer: number }) {
    window.clearTimeout(u.timer);
    void deletePrayerAction(u.p.id);
  }
  function restore() {
    if (!undo) return;
    window.clearTimeout(undo.timer);
    setList((l) => [undo.p, ...l]);
    setUndo(null);
  }

  async function approve(p: PrayerRequest) {
    setErr("");
    leave(p.id, () => patch(p.id, { pending: false }));
    const r = await approvePrayerAction(p.id);
    if (!r.success) {
      setErr(r.message);
      patch(p.id, { pending: true });
    }
  }
  async function pray(p: PrayerRequest) {
    if (prayed.has(p.id)) return;
    buzz();
    const next = new Set(prayed).add(p.id);
    setPrayed(next);
    try {
      window.localStorage.setItem(PRAYED_KEY, JSON.stringify([...next].slice(-500)));
    } catch {
      /* sem armazenamento */
    }
    patch(p.id, { praying: p.praying + 1 });
    setBump((b) => ({ ...b, [p.id]: (b[p.id] ?? 0) + 1 }));
    const r = await prayForAction(p.id);
    if (r.success) patch(p.id, { praying: r.data });
    else setErr(r.message);
  }
  async function answer(p: PrayerRequest, on: boolean) {
    setErr("");
    leave(p.id, () => patch(p.id, { answered: on, answeredDate: on ? new Date().toISOString().slice(0, 10) : null }));
    const r = await setAnsweredAction(p.id, on);
    if (!r.success) {
      setErr(r.message);
      patch(p.id, { answered: !on });
    }
  }
  async function copyLink(renew: boolean) {
    setErr("");
    const r = renew || !token ? await prayerLinkAction(renew) : { success: true as const, data: token };
    if (!r.success) return void setErr(r.message);
    setToken(r.data);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pedido/${r.data}`);
    } catch {
      return void setErr("Não consegui copiar. O link é " + `${window.location.origin}/pedido/${r.data}`);
    }
    setCopied(true);
    later(() => setCopied(false), COPIED_MS);
  }

  const row = (p: PrayerRequest, kind: "pending" | "wall" | "answered") => {
    const expanded = open.has(p.id);
    const done = prayed.has(p.id);
    return (
      <li key={p.id} className={`${c.collapse}${leaving.has(p.id) ? " " + c.leaving : ""}`}>
        <div className={c.collapseIn}>
          <div className={c.pr}>
            <div className={c.prHead}>
              <span className={c.prName}>{p.author}</span>
              <span className={c.muted}>{shortDate(p.date)}</span>
              {p.privacy === "leader" ? <span className={c.tag}>{PRIVATE_LABEL}</span> : null}
            </div>
            <button type="button" className={`${c.prText}${expanded ? "" : " " + c.clamp}`} aria-expanded={expanded} onClick={() => setOpen((s) => { const n = new Set(s); if (!n.delete(p.id)) n.add(p.id); return n; })}>
              {p.request}
            </button>
            {kind === "pending" && p.contact ? <a className={c.prContact} href={`tel:${p.contact.replace(/[^\d+]/g, "")}`}>{p.contact}</a> : null}
            <div className={c.prEnd}>
              {kind === "pending" ? (
                <>
                  <button type="button" className={people.primary} onClick={() => void approve(p)}>Aprovar</button>
                  {canManage ? <button type="button" className="btn ghost sm" onClick={() => remove(p, "Pedido recusado.")}>Recusar</button> : null}
                </>
              ) : (
                <>
                  {kind === "wall" ? (
                    <button type="button" className={`${c.orei}${done ? " " + c.oreiDone : ""}`} aria-pressed={done} aria-label={`Orei. ${p.praying} ${p.praying === 1 ? "pessoa orou" : "pessoas oraram"}`} onClick={() => void pray(p)}>
                      <UiIcon icon={HandHeart} />
                      Orei
                      <span key={bump[p.id] ?? 0} className={`${c.oreiN}${bump[p.id] ? " " + c.numSwap : ""}`}>{p.praying}</span>
                    </button>
                  ) : null}
                  <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do pedido" align="right">
                    {(close) => (
                      <>
                        <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); void answer(p, kind === "wall"); }}>
                          {kind === "wall" ? "Respondida" : "Voltar ao mural"}
                        </button>
                        {canManage ? <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); remove(p, "Pedido excluído."); }}>Excluir</button> : null}
                      </>
                    )}
                  </Popover>
                </>
              )}
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <div className={c.prTools}>
        <button type="button" className="btn ghost sm" onClick={() => setCreating(true)}>Novo pedido</button>
        <button type="button" className="btn ghost sm" onClick={() => void copyLink(false)} aria-live="polite">
          <UiIcon icon={copied ? Check : Copy} />
          {copied ? "Link copiado" : "Link de pedidos"}
        </button>
        {token ? (
          <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do link" align="right">
            {(close) => (
              <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); void copyLink(true); }}>
                Gerar novo link
              </button>
            )}
          </Popover>
        ) : null}
      </div>
      <p className={c.hint}>Mande o link no grupo do WhatsApp. O pedido chega aqui para a equipe aprovar.</p>
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
      {undo ? (
        <p className={c.undo} role="status">
          {undo.text}
          <button type="button" className="btn ghost sm" onClick={restore}>Desfazer</button>
        </p>
      ) : null}

      {pending.length ? (
        <section className={c.sec} aria-labelledby="sec-pending">
          <h2 id="sec-pending" className={people.secTitle}>Chegaram pelo link ({pending.length})</h2>
          <ul className={c.plain}>{pending.map((p) => row(p, "pending"))}</ul>
        </section>
      ) : null}

      <section className={c.sec} aria-labelledby="sec-wall">
        <h2 id="sec-wall" className={people.secTitle}>Mural</h2>
        {wall.length ? <ul className={c.plain}>{wall.map((p) => row(p, "wall"))}</ul> : <p className={c.none}>Nenhum pedido no mural.</p>}
      </section>

      {answered.length ? (
        <section className={c.sec}>
          <button type="button" className={`${people.moreBtn} ${c.fold}${showAnswered ? " " + people.moreOpen : ""}`} aria-expanded={showAnswered} onClick={() => setShowAnswered((o) => !o)}>
            Respondidas <span className={people.moreCount}>({answered.length})</span>
            <span className={people.moreChev}><UiIcon icon={ChevronDown} /></span>
          </button>
          {showAnswered ? <ul className={c.plain}>{answered.map((p) => row(p, "answered"))}</ul> : null}
        </section>
      ) : null}

      {creating ? <NewPrayer persons={persons} onCreated={(p) => setList((l) => [p, ...l])} onClose={() => setCreating(false)} /> : null}
    </>
  );
}
