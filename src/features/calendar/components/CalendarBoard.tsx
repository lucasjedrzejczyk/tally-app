"use client";

// Agenda unificada (Client): agrega Cultos + Eventos + Escala numa timeline. Views
// Agenda/Semana/Mês, filtro por tipo, campus-aware. Todos os dados vêm prontos do
// servidor (RSC); a projeção/interação é em memória (sem round-trip por clique).
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  KIND_COLOR,
  KIND_LBL,
  WD_SHORT,
  addDays,
  groupByDay,
  occurrences,
  parseIso,
  periodLabel,
  startOfWeek,
  ymd,
} from "../domain";
import type { CalItem, CalKind, CalendarSources } from "../types";
import styles from "../calendar.module.css";

type View = "agenda" | "week" | "month";

function hrefFor(it: CalItem): string {
  if (it.kind === "service") return `/services/${it.ref}`;
  if (it.kind === "event") return `/events/${it.ref}`;
  return "/ministries";
}
function brShort(iso: string): string {
  return iso.split("-").reverse().join("/").slice(0, 5);
}
function Dot({ kind }: { kind: CalKind }) {
  return <span className={styles.dot} style={{ background: KIND_COLOR[kind] }} />;
}

export function CalendarBoard({ sources, activeCampus }: { sources: CalendarSources; activeCampus: string }) {
  const [view, setView] = useState<View>("agenda");
  const [typeFilter, setTypeFilter] = useState<CalKind | null>(null);
  const [anchorIso, setAnchorIso] = useState<string | null>(null);

  const now0 = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayIso = ymd(now0);
  const anchor = anchorIso ? parseIso(anchorIso) : now0;

  function shift(dir: number) {
    let a = anchor;
    if (view === "month") a = new Date(a.getFullYear(), a.getMonth() + dir, 1);
    else a = addDays(startOfWeek(a), dir * 7);
    setAnchorIso(ymd(a));
  }

  const VIEWS: [View, string][] = [["agenda", "Agenda"], ["week", "Semana"], ["month", "Mês"]];
  const TYPES: [CalKind | null, string][] = [[null, "Tudo"], ["service", "Cultos"], ["event", "Eventos"], ["assignment", "Escala"]];

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <h1 className="page">Agenda</h1>
        <p className="sub" style={{ margin: 0 }}>
          Cultos, eventos e escala num só lugar — só o que realmente tem data. Campus: {activeCampus}.
        </p>
      </div>

      <div className={styles.filters}>
        <div className={styles.chips}>
          {VIEWS.map(([v, lbl]) => (
            <button key={v} className={`${styles.chip}${view === v ? " " + styles.on : ""}`} onClick={() => setView(v)}>{lbl}</button>
          ))}
        </div>
        <div className={styles.chips}>
          {TYPES.map(([t, lbl]) => (
            <button key={lbl} className={`${styles.chip}${typeFilter === t ? " " + styles.on : ""}`} onClick={() => setTypeFilter(t)}>{lbl}</button>
          ))}
        </div>
        {view !== "agenda" ? (
          <div className={styles.nav}>
            <button className="btn ghost sm" onClick={() => shift(-1)}>‹</button>
            <b>{periodLabel(anchor, view)}</b>
            <button className="btn ghost sm" onClick={() => shift(1)}>›</button>
            <button className="btn ghost sm" onClick={() => setAnchorIso(null)}>Hoje</button>
          </div>
        ) : null}
      </div>

      {view === "agenda" ? (
        <AgendaView sources={sources} activeCampus={activeCampus} typeFilter={typeFilter} now0={now0} todayIso={todayIso} />
      ) : view === "week" ? (
        <WeekView sources={sources} activeCampus={activeCampus} typeFilter={typeFilter} anchor={anchor} todayIso={todayIso} />
      ) : (
        <MonthView sources={sources} activeCampus={activeCampus} typeFilter={typeFilter} anchor={anchor} todayIso={todayIso} />
      )}
    </>
  );
}

function AgendaView({ sources, activeCampus, typeFilter, now0, todayIso }: { sources: CalendarSources; activeCampus: string; typeFilter: CalKind | null; now0: Date; todayIso: string }) {
  const to = addDays(now0, 60);
  const byDay = groupByDay(occurrences(now0, to, sources, activeCampus, typeFilter));
  const days = [...byDay.keys()];
  if (days.length === 0) {
    return <div className="empty">Nada agendado nos próximos 60 dias. Cadastre cultos e eventos, ou monte a escala em Escalas.</div>;
  }
  return (
    <>
      {days.map((d) => {
        const dt = parseIso(d);
        const isToday = d === todayIso;
        return (
          <div key={d}>
            <div className="ph" style={{ margin: "10px 0 4px" }}>
              <h3 style={{ margin: 0, fontSize: 14, ...(isToday ? { color: "var(--blue)" } : {}) }}>
                {WD_SHORT[dt.getDay()]} {brShort(d)}/{dt.getFullYear()}{isToday ? " · hoje" : ""}
              </h3>
            </div>
            <div className="panel" style={{ padding: "6px 14px" }}>
              {byDay.get(d)!.map((o, i) => (
                <div className="li" key={i}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                    <Dot kind={o.kind} />
                    <div>
                      <div><b>{o.title}</b> <span className="muted">· {KIND_LBL[o.kind]}</span></div>
                      {o.sub ? <div className="meta">{o.sub}</div> : null}
                    </div>
                  </div>
                  <div className="right"><Link className="link" href={hrefFor(o)}>abrir</Link></div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function WeekView({ sources, activeCampus, typeFilter, anchor, todayIso }: { sources: CalendarSources; activeCampus: string; typeFilter: CalKind | null; anchor: Date; todayIso: string }) {
  const ws = startOfWeek(anchor);
  const byDay = groupByDay(occurrences(ws, addDays(ws, 6), sources, activeCampus, typeFilter));
  return (
    <div className={styles.week7}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(ws, i);
        const di = ymd(d);
        const items = byDay.get(di) ?? [];
        return (
          <div key={di} className={`panel${di === todayIso ? " " + styles.today : ""}`} style={{ padding: 10 }}>
            <div className="mi-k" style={{ fontSize: 11, marginBottom: 4 }}>{WD_SHORT[d.getDay()]} {brShort(di)}</div>
            {items.length === 0 ? (
              <div className="muted" style={{ padding: "6px 0" }}>—</div>
            ) : (
              items.map((o, k) => (
                <Link key={k} href={hrefFor(o)} className={styles.weekItem}>
                  <div style={{ display: "flex", alignItems: "center" }}><Dot kind={o.kind} /><b style={{ fontSize: 12.5 }}>{o.title}</b></div>
                  {o.sub ? <div className="meta" style={{ marginLeft: 13 }}>{o.sub}</div> : null}
                </Link>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ sources, activeCampus, typeFilter, anchor, todayIso }: { sources: CalendarSources; activeCampus: string; typeFilter: CalKind | null; anchor: Date; todayIso: string }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);
  const byDay = groupByDay(occurrences(gridStart, gridEnd, sources, activeCampus, typeFilter));

  const cells: Date[] = [];
  for (let cur = new Date(gridStart); cur <= gridEnd; cur = addDays(cur, 1)) cells.push(new Date(cur));

  return (
    <>
      <div className={styles.monthHead}>
        {WD_SHORT.map((w) => <div key={w} className="mi-k" style={{ fontSize: 11, textAlign: "center" }}>{w}</div>)}
      </div>
      <div className={styles.monthGrid}>
        {cells.map((cur) => {
          const di = ymd(cur);
          const inMonth = cur.getMonth() === anchor.getMonth();
          const items = byDay.get(di) ?? [];
          return (
            <div key={di} className={`${styles.monthCell}${di === todayIso ? " " + styles.today : ""}`} style={{ background: inMonth ? "var(--surface)" : "transparent" }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, ...(inMonth ? {} : { opacity: 0.4 }) }}>{cur.getDate()}</div>
              {items.slice(0, 3).map((o, k) => (
                <Link key={k} href={hrefFor(o)} className={styles.monthItem} title={o.title}><Dot kind={o.kind} />{o.title}</Link>
              ))}
              {items.length > 3 ? <div className="muted" style={{ fontSize: 9 }}>+{items.length - 3}</div> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
