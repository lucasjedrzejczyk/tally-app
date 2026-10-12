"use client";

// Ficha do culto num dia (spec 16, Fase B): quem serve (escalas dos ministérios), contagem com
// barras, ordem do culto, sermão e convite. "Editar" troca para os dados do culto.
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, MapPin, MoreHorizontal, X } from "lucide-react";
import { Select } from "@/components/shared/Select";
import { UiIcon } from "@/components/shared/UiIcon";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { WEEKDAYS } from "@/features/groups/domain";
import { TextField } from "@/features/groups/components/CellEdit";
import { addDays } from "@/features/ministries/domain";
import { ScheduleSheet } from "@/features/ministries/components/ScheduleSheet";
import type { MinistryDetail } from "@/features/ministries/types";
import { archiveServiceAction, savePlanAction, setCancelledAction, setCountAction, setSermonAction, updateServiceFieldAction } from "../actions";
import { occurrenceTitle, servingAt } from "../domain";
import type { PlanItem, Service, ServiceDate, ServiceDay, SermonRef } from "../types";
import { Bars, CopyInvite, CountBox, ServingList } from "./Parts";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import e from "../encontros.module.css";

const FAIL = "Não deu para salvar. Tente de novo.";
type Draft = { key: number; time: string; title: string; responsible: string };
let seq = 0;
// Linha vazia do culto num dia (antes da primeira gravação).
const blankRow = (d: ServiceDay): ServiceDate => ({ id: "", serviceId: d.service.id, date: d.date, headcount: null, visitors: null, kids: null, sermonId: null, cancelled: false });
type OnDay = (fn: (d: ServiceDay) => ServiceDay) => void;
const toDraft = (p: { time: string; title: string; responsible: string }): Draft => ({ key: ++seq, time: p.time, title: p.title, responsible: p.responsible });

export function ServiceDayView({
  day,
  ministries,
  today,
  canManage,
  focusName,
  editing,
  onEditing,
  onDay,
  onService,
  onMinistry,
  onCancelled,
  onGo,
  onArchived,
}: {
  day: ServiceDay;
  ministries: MinistryDetail[];
  today: string;
  canManage: boolean;
  focusName: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onDay: OnDay;
  onService: (s: Service) => void;
  onMinistry: (m: MinistryDetail) => void;
  onCancelled: (cancelled: boolean) => void;
  onGo: (date: string) => void;
  onArchived: () => void;
}) {
  const s = day.service;
  const cancelled = Boolean(day.row?.cancelled);
  const [err, setErr] = useState("");
  const [sheet, setSheet] = useState<MinistryDetail | null>(null);
  const serving = servingAt(ministries, s.id, day.date, s.time);

  async function field(f: "name" | "day" | "time" | "location", raw: string): Promise<string | null> {
    const r = await updateServiceFieldAction(s.id, f, raw);
    if (!r.success) return r.message;
    const next = f === "day" ? { ...s, weekday: WEEKDAYS.indexOf(raw as (typeof WEEKDAYS)[number]) } : { ...s, [f === "name" ? "name" : f === "time" ? "time" : "location"]: r.data.text };
    onService(next);
    onDay((d) => ({ ...d, service: next }));
    return null;
  }
  async function cancel(on: boolean, close?: () => void) {
    close?.();
    setErr("");
    onCancelled(on);
    onDay((d) => ({ ...d, row: { ...(d.row ?? blankRow(d)), cancelled: on } }));
    const r = await setCancelledAction(s.id, day.date, on);
    if (!r.success) {
      setErr(r.message || FAIL);
      onCancelled(!on);
      onDay((d) => ({ ...d, row: { ...(d.row ?? blankRow(d)), cancelled: !on } }));
    }
  }
  async function archive(close: () => void) {
    close();
    const r = await archiveServiceAction(s.id);
    if (!r.success) return void setErr(r.message);
    onArchived();
  }
  const count = (f: "headcount" | "visitors" | "kids") => async (v: number | null) => {
    const r = await setCountAction(s.id, day.date, f, v);
    if (!r.success) return r.message || FAIL;
    onDay((d) => ({ ...d, row: { ...(d.row ?? blankRow(d)), [f]: v } }));
    return null;
  };

  const head = (
    <>
      <div className={styles.profBar}>
        <span className={g.lastText}>{day.date === today ? "Hoje" : ""}</span>
        <span className={e.weekNav}>
          <button type="button" className="iconbtn" aria-label="Semana anterior deste culto" onClick={() => onGo(addDays(day.date, -7))}><UiIcon icon={ChevronLeft} /></button>
          <button type="button" className="iconbtn" aria-label="Próxima semana deste culto" onClick={() => onGo(addDays(day.date, 7))}><UiIcon icon={ChevronRight} /></button>
        </span>
        {canManage ? (editing ? <button type="button" className={styles.primary} onClick={() => onEditing(false)}>Pronto</button> : <button type="button" className="btn ghost sm" onClick={() => onEditing(true)}>Editar</button>) : null}
        {canManage ? (
          <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do culto" align="right">
            {(close) => (
              <>
                <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void cancel(!cancelled, close)}>{cancelled ? "Reabrir este dia" : "Cancelar este dia"}</button>
                <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void archive(close)}>Arquivar culto</button>
              </>
            )}
          </Popover>
        ) : null}
      </div>
      <header className={styles.ph}>
        <div className={styles.phMain}>
          <h1 className={styles.name}>{s.name}</h1>
          {editing ? null : (
            <div className={g.chips}>
              <span className={g.chip}><UiIcon icon={CalendarDays} />{occurrenceTitle(day.date, s.time)}</span>
              {s.location ? <span className={g.chip}><UiIcon icon={MapPin} />{s.location}</span> : null}
            </div>
          )}
        </div>
      </header>
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
    </>
  );

  if (editing)
    return (
      <article className={styles.prof}>
        {head}
        <section className={styles.sec} aria-label="Dados do culto">
          <div className={styles.grid}>
            <TextField label="Nome" value={s.name} wide autoFocus={focusName} onSave={(r) => field("name", r)} onState={() => undefined} />
            <div className={styles.fld}>
              <span className={styles.fLabel}>Dia</span>
              <Select aria-label="Dia do culto" value={WEEKDAYS[s.weekday ?? 0]} onChange={(ev) => void field("day", ev.target.value).then((m) => m && setErr(m))}>
                {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            </div>
            <TextField label="Horário" value={s.time} placeholder="19:00" onSave={(r) => field("time", r)} onState={() => undefined} />
            <TextField label="Local" value={s.location} wide placeholder="Endereço ou sala" onSave={(r) => field("location", r)} onState={() => undefined} />
          </div>
        </section>
        <div className={styles.doneRow}><button type="button" className={styles.primary} onClick={() => onEditing(false)}>Pronto</button></div>
      </article>
    );

  return (
    <article className={styles.prof}>
      {head}
      {cancelled ? (
        <div className={g.presenceRow}>
          <span className={g.lastText}>Culto cancelado neste dia.</span>
          {canManage ? <button type="button" className="btn ghost sm" onClick={() => void cancel(false)}>Reabrir</button> : null}
        </div>
      ) : (
        <div className={g.presenceRow}>
          <CopyInvite item={{ date: day.date, time: s.time, name: s.name, location: s.location }} />
        </div>
      )}

      {cancelled ? null : (
        <>
          <section className={styles.sec} aria-labelledby="sec-serving">
            <h2 id="sec-serving" className={styles.secTitle}>Quem serve</h2>
            <ServingList serving={serving} linkNames onOpen={setSheet} />
          </section>

          <section className={styles.sec} aria-labelledby="sec-count">
            <h2 id="sec-count" className={styles.secTitle}>Contagem</h2>
            <div className={e.counts}>
              <CountBox label="Pessoas" value={day.row?.headcount ?? null} canEdit={canManage} onSave={count("headcount")} />
              <CountBox label="Visitantes" value={day.row?.visitors ?? null} canEdit={canManage} onSave={count("visitors")} />
              <CountBox label="Crianças" value={day.row?.kids ?? null} canEdit={canManage} onSave={count("kids")} />
            </div>
            <Bars history={day.history} date={day.date} headcount={day.row?.headcount ?? null} />
          </section>

          <PlanSection day={day} canManage={canManage} onDay={onDay} />
          <SermonSection day={day} canManage={canManage} onDay={onDay} />
        </>
      )}

      {sheet ? <ScheduleSheet detail={sheet} initial={{ date: day.date, time: s.time }} today={today} onDetail={(d) => { onMinistry(d); setSheet(d); }} onClose={() => setSheet(null)} /> : null}
    </article>
  );
}

function PlanSection({ day, canManage, onDay }: { day: ServiceDay; canManage: boolean; onDay: OnDay }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const own = day.plan.length > 0;
  const shown = own ? day.plan : day.template;

  async function save(date: string | null, items: { time: string; title: string; responsible: string }[]): Promise<PlanItem[] | null> {
    setBusy(true);
    setErr("");
    const r = await savePlanAction(day.service.id, date, items);
    setBusy(false);
    if (!r.success) {
      setErr(r.message || FAIL);
      return null;
    }
    return r.data;
  }
  async function done() {
    if (!drafts) return;
    const items = drafts.filter((d) => d.title.trim());
    const plan = await save(day.date, items);
    if (!plan) return;
    onDay((d) => ({ ...d, plan }));
    setDrafts(null);
  }
  async function asTemplate() {
    const items = (drafts ?? shown).filter((d) => d.title.trim());
    const template = await save(null, items);
    if (!template) return;
    onDay((d) => ({ ...d, template }));
    setNote("Esta é a ordem de sempre agora.");
  }
  async function applyTemplate() {
    const plan = await save(day.date, day.template);
    if (plan) onDay((d) => ({ ...d, plan }));
  }
  const set = (k: number, patch: Partial<Draft>) => setDrafts((l) => l && l.map((d) => (d.key === k ? { ...d, ...patch } : d)));
  const move = (i: number, by: number) =>
    setDrafts((l) => {
      if (!l) return l;
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(Math.max(0, Math.min(n.length, i + by)), 0, x!);
      return n;
    });
  function addAfter(i: number) {
    const d = toDraft({ time: "", title: "", responsible: "" });
    setDrafts((l) => l && [...l.slice(0, i + 1), d, ...l.slice(i + 1)]);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-plan="${d.key}"]`)?.focus());
  }

  return (
    <section className={styles.sec} aria-labelledby="sec-plan">
      <h2 id="sec-plan" className={styles.secTitle}>Ordem do culto</h2>
      {drafts ? (
        <>
          {drafts.map((d, i) => (
            <div key={d.key} className={e.planEdit}>
              <input className={styles.search} aria-label="Horário do item" placeholder="19h" value={d.time} onChange={(ev) => set(d.key, { time: ev.target.value })} />
              <input
                className={styles.search}
                data-plan={d.key}
                aria-label="Item"
                placeholder="Ex.: Louvor"
                value={d.title}
                onChange={(ev) => set(d.key, { title: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    addAfter(i);
                  }
                }}
              />
              <input className={`${styles.search} ${e.planWhoIn}`} aria-label="Responsável" placeholder="Quem" value={d.responsible} onChange={(ev) => set(d.key, { responsible: ev.target.value })} />
              <span className={e.planBtns}>
                <button type="button" className="iconbtn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><UiIcon icon={ArrowUp} /></button>
                <button type="button" className="iconbtn" aria-label="Descer" disabled={i === drafts.length - 1} onClick={() => move(i, 1)}><UiIcon icon={ArrowDown} /></button>
                <button type="button" className="iconbtn" aria-label="Tirar item" onClick={() => setDrafts((l) => l && l.filter((x) => x.key !== d.key))}><UiIcon icon={X} /></button>
              </span>
            </div>
          ))}
          <div className={e.planActions}>
            <button type="button" className="link" onClick={() => addAfter(drafts.length - 1)}>Adicionar item</button>
            <span className={styles.headEnd}>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void asTemplate()}>Salvar como ordem de sempre</button>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => void done()}>Pronto</button>
            </span>
          </div>
        </>
      ) : shown.length ? (
        <>
          <ol className={`${e.plan}${own ? "" : " " + e.planGhost}`}>
            {shown.map((p) => (
              <li key={p.id} className={e.planRow}>
                <span className={e.planTime}>{p.time}</span>
                <span>
                  {p.title}
                  {p.responsible ? <span className={e.planWho}>{p.responsible}</span> : null}
                </span>
              </li>
            ))}
          </ol>
          {canManage ? (
            <div className={e.planActions}>
              {own ? null : <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void applyTemplate()}>Usar neste dia</button>}
              <button type="button" className="link" onClick={() => { setNote(""); setDrafts(shown.map(toDraft)); }}>Editar ordem</button>
              {own ? null : <span className={g.lastText}>Ordem de sempre</span>}
            </div>
          ) : null}
        </>
      ) : canManage ? (
        <button type="button" className="btn ghost sm" onClick={() => { setNote(""); setDrafts([toDraft({ time: "", title: "", responsible: "" })]); }}>Montar a ordem do culto</button>
      ) : (
        <p className={g.lastText}>Sem ordem do culto.</p>
      )}
      {note ? <p className={g.lastText} role="status">{note}</p> : null}
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
    </section>
  );
}

function SermonSection({ day, canManage, onDay }: { day: ServiceDay; canManage: boolean; onDay: OnDay }) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SermonRef[] | null>(null);
  const [err, setErr] = useState("");

  async function search(text: string) {
    setQ(text);
    const r = await fetch(`/api/encontros/sermons?q=${encodeURIComponent(text)}`);
    if (r.ok) setFound((await r.json()) as SermonRef[]);
  }
  async function link(id: string | null) {
    setErr("");
    const r = await setSermonAction(day.service.id, day.date, id);
    if (!r.success) return void setErr(r.message || FAIL);
    setPicking(false);
    onDay((d) => ({ ...d, sermon: r.data, row: { ...(d.row ?? blankRow(d)), sermonId: id } }));
  }

  return (
    <section className={styles.sec} aria-labelledby="sec-sermon">
      <h2 id="sec-sermon" className={styles.secTitle}>Sermão</h2>
      {day.sermon && !picking ? (
        <div className={g.presenceRow}>
          <Link className={e.sermon} href={`/study/sermon/${day.sermon.id}`}>
            {day.sermon.title}
            {day.sermon.passage ? <span className={e.planWho}>{day.sermon.passage}</span> : null}
          </Link>
          {canManage ? <button type="button" className="link" onClick={() => { setPicking(true); void search(""); }}>Trocar</button> : null}
          {canManage ? <button type="button" className="link" onClick={() => void link(null)}>Tirar</button> : null}
        </div>
      ) : picking ? (
        <div>
          <input className={styles.search} type="search" autoFocus placeholder="Buscar sermão pelo título" aria-label="Buscar sermão" value={q} onChange={(ev) => void search(ev.target.value)} onKeyDown={(ev) => ev.key === "Escape" && setPicking(false)} />
          <ul className={e.plan}>
            {(found ?? []).map((f) => (
              <li key={f.id}>
                <button type="button" className={e.menuItem} onClick={() => void link(f.id)}>
                  {f.title}
                  {f.passage ? <span className={e.menuSub}>{f.passage}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {found && !found.length ? <p className={g.lastText}>Nenhum sermão com esse título.</p> : null}
        </div>
      ) : canManage ? (
        <button type="button" className="btn ghost sm" onClick={() => { setPicking(true); void search(""); }}>Ligar sermão</button>
      ) : (
        <p className={g.lastText}>Sem sermão ligado.</p>
      )}
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
    </section>
  );
}
