"use client";

// A semana da igreja (spec 16, A3): faixa dos 7 dias no topo (ponto nos dias com encontro, hoje
// em destaque) e, embaixo, só os dias que têm alguma coisa, em linhas alinhadas pelo horário.
// Setas trocam a semana sem animar (uso repetido).
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { WEEKDAYS, peopleCount } from "@/features/groups/domain";
import { STACK_SIZE, openLabel } from "@/features/ministries/domain";
import { Anchored } from "@/features/ministries/components/Anchored";
import { registeredLabel, timeShort, weekDays, weekLabel } from "../domain";
import type { WeekCard } from "../types";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import e from "../encontros.module.css";

const dow = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";

export function WeekList({
  start,
  today,
  cards,
  loading,
  selectedKey,
  canManage,
  creating,
  onWeek,
  onSelect,
  onNewService,
  onNewEvent,
}: {
  start: string;
  today: string;
  cards: WeekCard[] | null;
  loading: boolean;
  selectedKey: string | null;
  canManage: boolean;
  creating: boolean;
  onWeek: (dir: -1 | 0 | 1) => void;
  onSelect: (key: string) => void;
  onNewService: () => void;
  onNewEvent: () => void;
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const days = weekDays(start);
  const thisWeek = days.includes(today);
  const busy = days.filter((d) => cards?.some((c) => c.date === d));
  const selDate = cards?.find((c) => c.key === selectedKey)?.date;

  function onKey(ev: React.KeyboardEvent) {
    if ((ev.key !== "ArrowDown" && ev.key !== "ArrowUp") || !cards?.length) return;
    const at = cards.findIndex((c) => c.key === selectedKey);
    const next = cards[at < 0 ? 0 : Math.min(cards.length - 1, Math.max(0, at + (ev.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    ev.preventDefault();
    onSelect(next.key);
    (ev.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.focus();
  }
  function pickDay(d: string) {
    const first = cards?.find((c) => c.date === d);
    if (first) onSelect(first.key);
  }

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <h1 className="page">Encontros</h1>
        {canManage ? (
          <div className={styles.headEnd}>
            <button type="button" className="iconbtn" aria-label="Novo encontro" aria-expanded={Boolean(menu)} disabled={creating} onClick={(ev) => setMenu(menu ? null : ev.currentTarget)}>
              <UiIcon icon={Plus} />
            </button>
          </div>
        ) : null}
      </div>

      <div className={e.weekNav}>
        <span className={e.weekLabel} aria-live="polite">{weekLabel(start)}</span>
        {thisWeek ? null : <button type="button" className="btn ghost sm" onClick={() => onWeek(0)}>Hoje</button>}
        <button type="button" className="iconbtn" aria-label="Semana anterior" onClick={() => onWeek(-1)}><UiIcon icon={ChevronLeft} /></button>
        <button type="button" className="iconbtn" aria-label="Próxima semana" onClick={() => onWeek(1)}><UiIcon icon={ChevronRight} /></button>
      </div>

      <div className={e.strip} role="group" aria-label="Dias da semana">
        {days.map((d) => {
          const has = busy.includes(d);
          return (
            <button
              key={d}
              type="button"
              className={`${e.stripDay}${d === today ? " " + e.stripToday : ""}${d === selDate ? " " + e.stripOn : ""}`}
              disabled={!has}
              aria-label={`${dow(d)} ${Number(d.slice(8, 10))}${has ? "" : ", nada marcado"}`}
              onClick={() => pickDay(d)}
            >
              <span className={e.stripDow}>{dow(d).slice(0, 3)}</span>
              <span className={e.stripN}>{Number(d.slice(8, 10))}</span>
              <span className={`${e.dot}${has ? " " + e.dotOn : ""}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {cards === null ? (
        <p className="muted" role="status">{loading ? "Abrindo a semana…" : ""}</p>
      ) : cards.length === 0 ? (
        <div className={styles.empty}>
          <p>{thisWeek ? "Nenhum culto cadastrado ainda." : "Nada marcado nesta semana."}</p>
          {canManage && thisWeek ? <button type="button" className={styles.primary} onClick={onNewService} disabled={creating}>Cadastrar o primeiro culto</button> : null}
        </div>
      ) : (
        <div className={e.agenda} onKeyDown={onKey} aria-busy={loading || undefined}>
          {busy.map((d) => (
            <section key={d} aria-label={`${dow(d)} ${d.slice(8, 10)}/${d.slice(5, 7)}`}>
              <h2 className={`${e.dayHead}${d === today ? " " + e.today : ""}`}>
                {d === today ? "Hoje" : dow(d)}
                <span className={e.dayDate}>{d.slice(8, 10)}/{d.slice(5, 7)}</span>
              </h2>
              {cards
                .filter((c) => c.date === d)
                .map((c) => {
                  const more = c.faces.length - STACK_SIZE;
                  const sub = c.cancelled ? "Cancelado" : c.kind === "event" ? (c.registration ? `Evento · ${registeredLabel(c.registered, null)}` : "Evento") : c.location;
                  return (
                    <button key={c.key} type="button" data-key={c.key} className={`${e.row}${c.cancelled ? " " + e.cancelled : ""}`} aria-current={c.key === selectedKey ? "true" : undefined} onClick={() => onSelect(c.key)}>
                      <span className={e.time}>{timeShort(c.time)}</span>
                      <span className={e.rowMain}>
                        <span className={e.rowName}>{c.name}</span>
                        {sub ? <span className={e.rowSub}>{sub}</span> : null}
                      </span>
                      <span className={e.rowEnd}>
                        {!c.cancelled && c.open ? <span className={g.pill}>{openLabel(c.open)}</span> : null}
                        {c.faces.length ? (
                          <span className={g.stack} role="img" aria-label={`Servem: ${peopleCount(c.faces.length)}`}>
                            {more > 0 ? <span className={g.more}>+{more}</span> : null}
                            {c.faces.slice(0, STACK_SIZE).reverse().map((f) => (
                              <Avatar key={f.stickId} name={f.name} photoUrl={f.photoUrl} size={24} className={g.stackFace} />
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
            </section>
          ))}
        </div>
      )}

      {menu ? (
        <Anchored anchor={menu} title="Novo encontro" onClose={() => setMenu(null)}>
          <button type="button" className={e.menuItem} onClick={() => { setMenu(null); onNewService(); }}>
            Culto que repete
            <span className={e.menuSub}>Toda semana no mesmo dia e horário</span>
          </button>
          <button type="button" className={e.menuItem} onClick={() => { setMenu(null); onNewEvent(); }}>
            Evento
            <span className={e.menuSub}>Uma data só: retiro, conferência, batismo</span>
          </button>
        </Anchored>
      ) : null}
    </div>
  );
}
