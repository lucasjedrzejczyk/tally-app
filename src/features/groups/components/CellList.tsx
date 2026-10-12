"use client";

// Lista de células (spec 14, A3 e C1): cabeçalho com contagem e "+", busca em pílula, dois chips
// (Supervisor e Dia) e um cartão por célula: nome, pilha de rostos, dia e hora, faixa de presença
// dos últimos encontros e, só quando há, uma etiqueta calma ("Sem registro há 3 semanas",
// "2 sumidos"). Sem número de "saúde". Quem guarda os filtros é o pai.
import { useMemo } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { MenuItem } from "@/features/study/components/FilterChips";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { STACK_SIZE, filterCells, hasCellFilters, meetingLabel, peopleCount, staleGroup, staleLabel, weekdayIndex, WEEKDAYS, type CellFilters } from "../domain";
import type { CSSProperties } from "react";
import type { CellListItem } from "../types";
import styles from "@/features/sticks/people.module.css";
import g from "../groups.module.css";

function aside(c: CellListItem, today: string): string {
  if (staleGroup(c.lastSession, today)) return staleLabel(c.lastSession, today);
  if (c.missing > 0) return `${c.missing} ${c.missing === 1 ? "sumido" : "sumidos"}`;
  return "";
}

export function CellList({
  cells,
  filters,
  onFilters,
  selectedId,
  onSelect,
  onNew,
  canManage,
  creating,
  today,
}: {
  cells: CellListItem[];
  filters: CellFilters;
  onFilters: (next: Partial<CellFilters>) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  canManage: boolean;
  creating: boolean;
  today: string;
}) {
  const visible = useMemo(() => filterCells(cells, filters), [cells, filters]);
  const supervisors = useMemo(() => {
    const n = new Map<string, { name: string; count: number }>();
    for (const c of cells) if (c.supervisorId) n.set(c.supervisorId, { name: c.supervisorName, count: (n.get(c.supervisorId)?.count ?? 0) + 1 });
    return [...n].sort((a, b) => a[1].name.localeCompare(b[1].name, "pt-BR"));
  }, [cells]);
  const withoutSupervisor = useMemo(() => cells.filter((c) => !c.supervisorId).length, [cells]);
  const days = useMemo(() => WEEKDAYS.map((d, i) => [d, cells.filter((c) => weekdayIndex(c.day) === i).length] as const).filter(([, n]) => n > 0), [cells]);

  const supText = filters.sup === "sem" ? "Sem supervisor" : supervisors.find(([id]) => id === filters.sup)?.[1].name ?? "Supervisor";
  const diaText = filters.dia || "Dia";

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const at = visible.findIndex((c) => c.id === selectedId);
    const next = visible[at < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    onSelect(next.id);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus();
  }

  const nothing = cells.length === 0;
  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <h1 className="page">Células</h1>
        {nothing ? null : <span className={styles.count}>{visible.length} {visible.length === 1 ? "célula" : "células"}</span>}
        {nothing || !canManage ? null : (
          <div className={styles.headEnd}>
            <button type="button" className="iconbtn" aria-label="Nova célula" onClick={onNew} disabled={creating}>
              <UiIcon icon={Plus} />
            </button>
          </div>
        )}
      </div>

      {nothing ? (
        <div className={styles.empty}>
          <p>Nenhuma célula ainda.</p>
          {canManage ? <button type="button" className={styles.primary} onClick={onNew} disabled={creating}>Nova célula</button> : null}
        </div>
      ) : (
        <>
          <input
            className={styles.search}
            type="search"
            placeholder="Buscar célula"
            aria-label="Buscar célula"
            value={filters.q}
            onChange={(e) => onFilters({ q: e.target.value })}
          />
          <div className={styles.chips} role="group" aria-label="Filtros">
            <Popover trigger={<>{supText}<UiIcon icon={ChevronDown} /></>} triggerClass={studyStyles.chipBtn} label="Supervisor">
              {(close) => (
                <div className={studyStyles.popList}>
                  <MenuItem on={!filters.sup} onClick={() => { onFilters({ sup: "" }); close(); }}>Todos</MenuItem>
                  {supervisors.map(([id, s]) => (
                    <MenuItem key={id} on={filters.sup === id} count={s.count} onClick={() => { onFilters({ sup: id }); close(); }}>{s.name}</MenuItem>
                  ))}
                  {withoutSupervisor ? (
                    <MenuItem on={filters.sup === "sem"} count={withoutSupervisor} onClick={() => { onFilters({ sup: "sem" }); close(); }}>Sem supervisor</MenuItem>
                  ) : null}
                </div>
              )}
            </Popover>
            <Popover trigger={<>{diaText}<UiIcon icon={ChevronDown} /></>} triggerClass={studyStyles.chipBtn} label="Dia">
              {(close) => (
                <div className={studyStyles.popList}>
                  <MenuItem on={!filters.dia} onClick={() => { onFilters({ dia: "" }); close(); }}>Todos</MenuItem>
                  {days.map(([d, n]) => (
                    <MenuItem key={d} on={filters.dia === d} count={n} onClick={() => { onFilters({ dia: d }); close(); }}>{d}</MenuItem>
                  ))}
                </div>
              )}
            </Popover>
          </div>

          <div className={`${styles.rows} ${g.cards}`} onKeyDown={onKey}>
            {visible.length === 0 ? (
              <div className={styles.empty}>
                <p>{hasCellFilters(filters) ? "Nenhuma célula com esses filtros." : "Nenhuma célula por aqui."}</p>
              </div>
            ) : (
              visible.map((c) => {
                const note = aside(c, today);
                const more = c.memberCount - c.faces.length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-id={c.id}
                    className={g.card}
                    aria-current={c.id === selectedId ? "true" : undefined}
                    onClick={() => onSelect(c.id)}
                  >
                    <span className={g.cardTop}>
                      <span className={g.cardName}>{c.name}</span>
                      {c.faces.length ? (
                        <span className={g.stack} role="img" aria-label={peopleCount(c.memberCount)}>
                          {c.faces.slice(0, STACK_SIZE).map((f, i) => (
                            <Avatar key={i} name={f.name} photoUrl={f.photoUrl} size={24} className={g.stackFace} />
                          ))}
                          {more > 0 ? <span className={g.more}>+{more}</span> : null}
                        </span>
                      ) : null}
                    </span>
                    {meetingLabel(c.day, c.time) ? <span className={g.cardSub}>{meetingLabel(c.day, c.time)}</span> : null}
                    {c.strip.length || note ? (
                      <span className={g.cardFoot}>
                        {c.strip.length ? (
                          <span className={g.strip} role="img" aria-label={`Presença nos últimos ${c.strip.length} encontros`}>
                            {c.strip.map((p, i) => (
                              <span
                                key={p.date}
                                className={`${p.cancelled ? g.stripGhost : g.stripBar}${i === c.strip.length - 1 ? " " + g.stripLast : ""}`}
                                style={{ "--h": p.ratio } as CSSProperties}
                              />
                            ))}
                          </span>
                        ) : <span />}
                        {note ? <span className={g.pill}>{note}</span> : null}
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
