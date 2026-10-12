"use client";

// Montar escala (spec 15, fase B): a tela que o líder mais usa. Uma seção por função, as vagas como
// círculos (vazia = tracejado com +, preenchida = rosto). Tocar na vaga vazia abre as sugestões;
// tocar num rosto abre Avisar no WhatsApp / Confirmou / Não pode / Tirar. Cada toque grava na hora
// (otimista); as gravações de uma mesma função entram numa fila, nunca fora de ordem.
// Trocar de culto pelas setas não anima (uso repetido).
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { DateField } from "@/components/shared/DateField";
import { UiIcon } from "@/components/shared/UiIcon";
import { firstName, isIso } from "@/features/groups/domain";
import { Sheet } from "@/features/groups/components/Sheet";
import studyStyles from "@/features/study/study.module.css";
import { assignAction, assignManyAction, markNotifiedAction, removeAssignmentsAction, setAssignmentStatusAction } from "../actions";
import { addDays, previousService, repeatPlan, seats, serviceLong, servedLabel, suggestPeople, waLink, whatsappText } from "../domain";
import type { Assignment, Conflict, MinistryDetail } from "../types";
import { Anchored } from "./Anchored";
import people from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import m from "../ministries.module.css";

const FAIL = "Não deu para salvar. Tente de novo.";
const UNDO_MS = 5000;
const OUT_MS = 120;
let tmpSeq = 0;

// Gravações ainda na fila: sair da página agora perderia a última mudança, então o navegador pergunta.
let inflight = 0;
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", (e) => {
    if (inflight > 0) e.preventDefault();
  });

type Pick = { kind: "seat"; role: string; el: HTMLElement } | { kind: "person"; a: Assignment; el: HTMLElement };

export function ScheduleSheet({
  detail,
  initial,
  today,
  onDetail,
  onClose,
}: {
  detail: MinistryDetail;
  initial: { date: string; time: string };
  today: string;
  onDetail: (d: MinistryDetail) => void;
  onClose: () => void;
}) {
  const [svc, setSvc] = useState(initial);
  const [list, setList] = useState<Assignment[]>(detail.assignments);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // pessoa com conflito: precisa de 2º toque
  const [fresh, setFresh] = useState<Map<string, number>>(new Map()); // id -> atraso da entrada (cascata)
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ text: string; run: () => void } | null>(null); // "Desfazer" por 5 s
  const [dating, setDating] = useState(false); // calendário aberto no topo
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(0);
  const listRef = useRef(list);
  const queues = useRef(new Map<string, Promise<unknown>>());
  const real = useRef(new Map<string, string>()); // id provisório -> id do banco
  const undoTimer = useRef<number | undefined>(undefined);
  const nameOf = new Map(detail.members.map((x) => [x.stickId, x]));

  // Guarda a lista e devolve a ficha nova para a tela de trás (lista de ministérios e próximos cultos).
  const commit = useCallback(
    (next: (l: Assignment[]) => Assignment[]) => {
      const l = next(listRef.current);
      listRef.current = l;
      setList(l);
      // Os rostos guardam o id provisório (a chave não muda, nada pisca); para fora vai o id do banco.
      if (!l.some((a) => a.id.startsWith("tmp-") && !real.current.has(a.id))) onDetail({ ...detail, assignments: l.map((a) => ({ ...a, id: real.current.get(a.id) ?? a.id })) });
    },
    [detail, onDetail],
  );
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  useEffect(() => {
    let alive = true;
    setConflicts([]);
    fetch(`/api/ministries/${detail.id}/conflicts?date=${svc.date}`)
      .then((r) => (r.ok ? (r.json() as Promise<Conflict[]>) : []))
      .then((c) => alive && setConflicts(c))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [detail.id, svc.date]);

  // Fila por função: cada gravação espera a anterior da mesma função.
  function enqueue(role: string, job: () => Promise<void>) {
    inflight++;
    setSaving((n) => n + 1);
    const prev = queues.current.get(role) ?? Promise.resolve();
    const next = prev.then(job, job).finally(() => {
      inflight--;
      setSaving((n) => n - 1);
    });
    queues.current.set(role, next);
  }
  const idOf = (id: string) => real.current.get(id) ?? id;
  function offerUndo(text: string, run: () => void) {
    window.clearTimeout(undoTimer.current);
    setUndo({ text, run });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
  }
  const firstOf = (stickId: string) => firstName(nameOf.get(stickId)?.name ?? "");

  function assign(role: string, stickId: string) {
    const tmp: Assignment = { id: `tmp-${++tmpSeq}`, date: svc.date, time: svc.time, role, stickId, status: "assigned", notifiedAt: null };
    const at = { ...svc };
    setPick(null);
    setConfirming(null);
    setMsg("");
    setFresh((f) => new Map(f).set(tmp.id, 0));
    commit((l) => [...l, tmp]);
    try {
      navigator.vibrate?.(10); // só Android; o iPhone ignora
    } catch {
      /* sem vibração */
    }
    enqueue(role, async () => {
      const r = await assignAction(detail.id, at.date, at.time, role, stickId);
      if (r.success) {
        real.current.set(tmp.id, r.data.id);
        commit((l) => l.map((a) => (a.id === tmp.id ? { ...r.data, id: tmp.id } : a)));
      } else {
        commit((l) => l.filter((a) => a.id !== tmp.id));
        setMsg(r.message || FAIL);
      }
    });
  }

  // Some com fade curto e só então sai da lista (Não pode / Tirar).
  function fadeOut(id: string, then: () => void) {
    setLeaving((s) => new Set(s).add(id));
    window.setTimeout(() => {
      then();
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : OUT_MS);
  }

  function remove(a: Assignment) {
    setPick(null);
    offerUndo(`${firstOf(a.stickId)} saiu da escala`, () => {
      setUndo(null);
      assign(a.role, a.stickId);
    });
    const before = listRef.current;
    fadeOut(a.id, () => commit((l) => l.filter((x) => x.id !== a.id)));
    enqueue(a.role, async () => {
      const r = await removeAssignmentsAction([idOf(a.id)]);
      if (!r.success) {
        commit(() => before);
        setMsg(r.message || FAIL);
      }
    });
  }

  function status(a: Assignment, s: "confirmed" | "declined") {
    setPick(null);
    if (s === "declined")
      offerUndo(`${firstOf(a.stickId)} não pode`, () => {
        setUndo(null);
        setFresh((f) => new Map(f).set(a.id, 0));
        commit((l) => l.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)));
        enqueue(a.role, async () => {
          const r = await setAssignmentStatusAction(idOf(a.id), a.status);
          if (!r.success) setMsg(r.message || FAIL);
        });
      });
    const apply = () => commit((l) => l.map((x) => (x.id === a.id ? { ...x, status: s } : x)));
    if (s === "declined") fadeOut(a.id, apply);
    else apply();
    enqueue(a.role, async () => {
      const r = await setAssignmentStatusAction(idOf(a.id), s);
      if (!r.success) {
        commit((l) => l.map((x) => (x.id === a.id || x.id === idOf(a.id) ? { ...x, status: a.status } : x)));
        setMsg(r.message || FAIL);
      }
    });
  }

  function notified(a: Assignment) {
    setPick(null);
    commit((l) => l.map((x) => (x.id === a.id ? { ...x, notifiedAt: new Date().toISOString() } : x)));
    enqueue(a.role, async () => {
      await markNotifiedAction(idOf(a.id));
    });
  }

  const here = { ...detail, assignments: list };
  const rows = seats(here, svc.date, svc.time);
  const filled = rows.reduce((n, r) => n + r.seats.filter(Boolean).length, 0);
  const total = rows.reduce((n, r) => n + r.seats.length, 0);
  const from = filled === 0 ? previousService(list, svc.date, svc.time) : null;

  function repeat() {
    if (!from) return;
    const plan = repeatPlan(here, from, svc.date, svc.time, conflicts);
    if (!plan.length) return void setMsg("Ninguém do culto anterior pode neste horário.");
    const at = { ...svc };
    const temps = plan.map((p) => ({ id: `tmp-${++tmpSeq}`, date: at.date, time: at.time, role: p.role, stickId: p.stickId, status: "assigned" as const, notifiedAt: null }));
    setFresh(new Map(temps.map((t, i) => [t.id, i * 30])));
    setMsg("");
    commit((l) => [...l, ...temps]);
    enqueue("*repeat", async () => {
      const r = await assignManyAction(detail.id, at.date, at.time, plan);
      const ids = new Set(temps.map((t) => t.id));
      if (!r.success) {
        commit((l) => l.filter((a) => !ids.has(a.id)));
        return void setMsg(r.message || FAIL);
      }
      const saved = [...r.data];
      for (const t of temps) {
        const i = saved.findIndex((a) => a.stickId === t.stickId && a.role === t.role);
        if (i >= 0) real.current.set(t.id, saved.splice(i, 1)[0]!.id);
      }
      commit((l) => [...l]);
      const madeIds = temps.map((t) => t.id);
      offerUndo("Escala anterior repetida", () => undoRepeat(madeIds));
    });
  }
  function undoRepeat(list: string[]) {
    const ids = new Set(list);
    const before = listRef.current;
    setUndo(null);
    commit((l) => l.filter((a) => !ids.has(a.id)));
    enqueue("*repeat", async () => {
      const r = await removeAssignmentsAction([...ids].map(idOf));
      if (!r.success) {
        commit(() => before);
        setMsg(r.message || FAIL);
      }
    });
  }

  function go(days: number) {
    setPick(null);
    setUndo(null);
    setFresh(new Map());
    setSvc((s) => ({ ...s, date: addDays(s.date, days) }));
  }
  const closePick = useCallback(() => setPick(null), []);

  const head = (
    <span className={m.nav}>
      <button type="button" className="iconbtn" aria-label="Culto anterior" onClick={() => go(-7)}><UiIcon icon={ChevronLeft} /></button>
      <button type="button" className="iconbtn" aria-label="Escolher a data" aria-expanded={dating} onClick={() => setDating((d) => !d)}><UiIcon icon={CalendarDays} /></button>
      <button type="button" className="iconbtn" aria-label="Próximo culto" onClick={() => go(7)}><UiIcon icon={ChevronRight} /></button>
    </span>
  );
  const datePick = dating ? (
    <div className={m.datePick}>
      <span className={`field ${people.dateBox} ${g.sheetDate}`}>
        <DateField
          value={svc.date}
          onChange={(iso) => {
            if (!isIso(iso)) return;
            setPick(null);
            setDating(false);
            setSvc((s) => ({ ...s, date: iso }));
          }}
          aria-label="Data do culto"
        />
      </span>
    </div>
  ) : null;
  const foot = (
    <>
      {msg ? <p className={g.footMsg} role="alert">{msg}</p> : null}
      <div className={g.footRow}>
        <span className={g.footCount}>{filled} de {total}</span>
        <span className={m.footWhen} aria-live="polite">{undo ? undo.text : saving > 0 ? "Salvando…" : ""}</span>
        {undo ? <button type="button" className="btn ghost sm" onClick={undo.run}>Desfazer</button> : null}
      </div>
    </>
  );

  const pickSeat = pick?.kind === "seat" ? pick : null;
  const pickPerson = pick?.kind === "person" ? pick : null;
  const suggestions = pickSeat ? suggestPeople(pickSeat.role, detail.members, list, svc.date, svc.time, today, conflicts) : [];

  return (
    <Sheet title="Escala" heading={serviceLong(svc.date, svc.time)} headExtra={head} onClose={onClose} foot={foot} tall>
      {datePick}
      {from ? (
        <div className={g.shortcut}>
          <button type="button" className="btn ghost sm" onClick={repeat}>Repetir a escala anterior</button>
        </div>
      ) : null}
      {rows.map((r) => (
        <section key={r.role} className={m.roleSec} aria-label={r.role}>
          <h3 className={m.roleHead}>{r.role}</h3>
          <ul className={m.seats}>
            {r.seats.map((a, i) => {
              if (!a)
                return (
                  <li key={`empty-${i}`}>
                    <button type="button" className={m.seat} aria-label={`Escalar ${r.role}`} aria-expanded={pickSeat?.role === r.role} onClick={(e) => { setConfirming(null); setPick({ kind: "seat", role: r.role, el: e.currentTarget }); }}>
                      <span className={m.empty}><UiIcon icon={Plus} /></span>
                      <span className={m.seatName}>Vaga</span>
                    </button>
                  </li>
                );
              const p = nameOf.get(a.stickId);
              const delay = fresh.get(a.id);
              const cls = [m.ring, a.status === "confirmed" ? m.ringOk : a.notifiedAt ? m.ringSent : ""].filter(Boolean).join(" ");
              return (
                <li key={a.id} className={leaving.has(a.id) ? m.out : delay !== undefined ? m.in : undefined} style={delay ? ({ "--d": `${delay}ms` } as CSSProperties) : undefined}>
                  <button type="button" className={m.seat} aria-label={`${p?.name ?? ""}, ${r.role}${a.status === "confirmed" ? ", confirmou" : a.notifiedAt ? ", avisado" : ""}`} onClick={(e) => setPick({ kind: "person", a, el: e.currentTarget })}>
                    <span className={cls}>
                      <Avatar name={p?.name ?? "?"} photoUrl={p?.photoUrl} size={56} />
                      {a.status === "confirmed" ? <span className={g.tick}><Check size={12} strokeWidth={2.5} aria-hidden="true" focusable="false" /></span> : null}
                    </span>
                    <span className={m.seatName}>{firstName(p?.name ?? "")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {pickSeat ? (
        <Anchored anchor={pickSeat.el} title={`Escalar ${pickSeat.role}`} onClose={closePick}>
          {suggestions.length === 0 ? (
            <p className={m.none}>Todo mundo já está neste culto.</p>
          ) : (
            [suggestions.filter((x) => x.doesRole), suggestions.filter((x) => !x.doesRole)].map((group, gi) =>
              group.length ? (
                <div key={gi}>
                  {gi === 1 ? <p className={m.suggGroup}>Também servem aqui</p> : null}
                  <ul className={m.sugg}>
                    {group.map((s) => {
                const c = s.conflict;
                const sub = c ? `Já está em ${c.ministryName}${c.role ? ` (${c.role})` : ""} neste horário` : servedLabel(s.served);
                const asking = confirming === s.member.stickId;
                return (
                  <li key={s.member.stickId}>
                    <button
                      type="button"
                      className={`${m.suggRow}${c ? " " + m.suggBusy : ""}`}
                      onClick={() => (c && !asking ? setConfirming(s.member.stickId) : assign(pickSeat.role, s.member.stickId))}
                    >
                      <Avatar name={s.member.name} photoUrl={s.member.photoUrl} size={32} />
                      <span className={m.suggMain}>
                        <span className={m.suggName}>{s.member.name}</span>
                        <span className={m.suggSub}>{asking ? "Toque de novo para escalar mesmo assim" : sub}</span>
                      </span>
                    </button>
                  </li>
                );
                    })}
                  </ul>
                </div>
              ) : null,
            )
          )}
        </Anchored>
      ) : null}

      {pickPerson ? (
        <Anchored anchor={pickPerson.el} title={nameOf.get(pickPerson.a.stickId)?.name ?? "Pessoa"} onClose={closePick}>
          {(() => {
            const a = pickPerson.a;
            const p = nameOf.get(a.stickId);
            const link = p ? waLink(p.phone, whatsappText(p.name, detail.name, a.date, a.time, a.role)) : "";
            return (
              <div className={g.who}>
                <p className={g.whoName}>{p?.name}</p>
                <p className={g.whoNote}>{a.role}{a.status === "confirmed" ? " · confirmou" : a.notifiedAt ? " · avisado" : ""}</p>
                {link ? (
                  <a className={studyStyles.mi} href={link} target="_blank" rel="noreferrer" onClick={() => notified(a)}>Avisar no WhatsApp</a>
                ) : (
                  <span className={`${studyStyles.mi} ${studyStyles.miMuted}`}>Sem telefone na ficha</span>
                )}
                {a.status !== "confirmed" ? <button type="button" className={studyStyles.mi} onClick={() => status(a, "confirmed")}>Confirmou</button> : null}
                <button type="button" className={studyStyles.mi} onClick={() => status(a, "declined")}>Não pode</button>
                <button type="button" className={`${studyStyles.mi} ${studyStyles.miDanger}`} onClick={() => remove(a)}>Tirar</button>
              </div>
            );
          })()}
        </Anchored>
      ) : null}
    </Sheet>
  );
}
