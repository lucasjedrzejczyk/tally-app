"use client";

// A semana da igreja (spec 16, A3): dia a dia, cultos e eventos em cartões com os rostos de quem serve
// e "2 vagas" quando falta gente. Dia vazio é só a linha do rótulo. Setas trocam a semana sem animar.
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { peopleCount } from "@/features/groups/domain";
import { STACK_SIZE, openLabel } from "@/features/ministries/domain";
import { Anchored } from "@/features/ministries/components/Anchored";
import { dayShort, registeredLabel, timeShort, weekDays, weekLabel } from "../domain";
import type { WeekCard } from "../types";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import e from "../encontros.module.css";

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
  const nothing = cards !== null && cards.length === 0;

  function onKey(ev: React.KeyboardEvent) {
    if ((ev.key !== "ArrowDown" && ev.key !== "ArrowUp") || !cards?.length) return;
    const at = cards.findIndex((c) => c.key === selectedKey);
    const next = cards[at < 0 ? 0 : Math.min(cards.length - 1, Math.max(0, at + (ev.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    ev.preventDefault();
    onSelect(next.key);
    (ev.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.focus();
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

      {cards === null ? (
        <p className="muted" role="status">{loading ? "Abrindo a semana…" : ""}</p>
      ) : nothing && thisWeek ? (
        <div className={styles.empty}>
          <p>Nenhum culto cadastrado ainda.</p>
          {canManage ? <button type="button" className={styles.primary} onClick={onNewService} disabled={creating}>Cadastrar o primeiro culto</button> : null}
        </div>
      ) : (
        <ul className={e.days} onKeyDown={onKey} aria-busy={loading || undefined}>
          {days.map((d) => {
            const here = cards.filter((c) => c.date === d);
            const label = (
              <span className={`${e.dayHead}${d === today ? " " + e.today : ""}`}>
                {dayShort(d)}
                {d === today ? <span>Hoje</span> : null}
              </span>
            );
            if (!here.length) return <li key={d} className={`${e.day} ${e.dayEmpty}`}>{label}</li>;
            return (
              <li key={d} className={e.day}>
                {label}
                <div className={`${g.cards} ${e.dayCards}`}>
                  {here.map((c) => {
                    const more = c.faces.length - STACK_SIZE;
                    return (
                      <button key={c.key} type="button" data-key={c.key} className={`${g.card}${c.cancelled ? " " + e.cancelled : ""}`} aria-current={c.key === selectedKey ? "true" : undefined} onClick={() => onSelect(c.key)}>
                        <span className={g.cardTop}>
                          <span className={e.cardHead}>
                            <span className={e.time}>{timeShort(c.time)}</span>
                            <span className={g.cardName}>{c.name}</span>
                          </span>
                          {c.faces.length ? (
                            <span className={g.stack} role="img" aria-label={`Servem: ${peopleCount(c.faces.length)}`}>
                              {more > 0 ? <span className={g.more}>+{more}</span> : null}
                              {c.faces.slice(0, STACK_SIZE).reverse().map((f) => (
                                <Avatar key={f.stickId} name={f.name} photoUrl={f.photoUrl} size={24} className={g.stackFace} />
                              ))}
                            </span>
                          ) : null}
                        </span>
                        {c.cancelled || c.kind === "event" || c.open ? (
                          <span className={g.cardFoot}>
                            <span className={g.cardSub}>
                              {c.cancelled ? "Cancelado" : c.kind === "event" ? <span className={e.tag}>Evento</span> : null}
                              {!c.cancelled && c.registration ? ` ${registeredLabel(c.registered, null)}` : null}
                            </span>
                            {!c.cancelled && c.open ? <span className={g.pill}>{openLabel(c.open)}</span> : null}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
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
