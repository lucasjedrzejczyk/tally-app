"use client";

// Lista de ministérios (spec 15, A3): cartões como os das Células. Nome, pilha de rostos, próximo
// culto e, só quando falta gente na próxima escala, a etiqueta "2 vagas".
import { useMemo } from "react";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { normalize } from "@/features/sticks/domain";
import { peopleCount } from "@/features/groups/domain";
import { STACK_SIZE, nextLabel, openLabel } from "../domain";
import type { MinistryListItem } from "../types";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";

export function MinistryList({
  items,
  q,
  onQ,
  selectedId,
  onSelect,
  onNew,
  canManage,
  creating,
  today,
}: {
  items: MinistryListItem[];
  q: string;
  onQ: (q: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  canManage: boolean;
  creating: boolean;
  today: string;
}) {
  const visible = useMemo(() => {
    const n = normalize(q);
    return items.filter((c) => !n || normalize(c.name).includes(n));
  }, [items, q]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const at = visible.findIndex((c) => c.id === selectedId);
    const next = visible[at < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    onSelect(next.id);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus();
  }

  const nothing = items.length === 0;
  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <h1 className="page">Ministérios</h1>
        {nothing ? null : <span className={styles.count}>{visible.length}</span>}
        {nothing || !canManage ? null : (
          <div className={styles.headEnd}>
            <button type="button" className="iconbtn" aria-label="Novo ministério" onClick={onNew} disabled={creating}>
              <UiIcon icon={Plus} />
            </button>
          </div>
        )}
      </div>

      {nothing ? (
        <div className={styles.empty}>
          <p>Nenhum ministério ainda.</p>
          {canManage ? <button type="button" className={styles.primary} onClick={onNew} disabled={creating}>Novo ministério</button> : null}
        </div>
      ) : (
        <>
          {items.length > 6 ? (
            <input className={styles.search} type="search" placeholder="Buscar ministério" aria-label="Buscar ministério" value={q} onChange={(e) => onQ(e.target.value)} />
          ) : null}
          <div className={`${styles.rows} ${g.cards}`} onKeyDown={onKey}>
            {visible.length === 0 ? (
              <div className={styles.empty}><p>Nenhum ministério com esse nome.</p></div>
            ) : (
              visible.map((c) => {
                const more = c.memberCount - c.faces.length;
                const sub = nextLabel(c.next, today);
                return (
                  <button key={c.id} type="button" data-id={c.id} className={g.card} aria-current={c.id === selectedId ? "true" : undefined} onClick={() => onSelect(c.id)}>
                    <span className={g.cardTop}>
                      <span className={g.cardName}>{c.name}</span>
                      {c.faces.length ? (
                        <span className={g.stack} role="img" aria-label={peopleCount(c.memberCount)}>
                          {more > 0 ? <span className={g.more}>+{more}</span> : null}
                          {c.faces.slice(0, STACK_SIZE).reverse().map((f, i) => (
                            <Avatar key={i} name={f.name} photoUrl={f.photoUrl} size={24} className={g.stackFace} />
                          ))}
                        </span>
                      ) : null}
                    </span>
                    {sub || c.open ? (
                      <span className={g.cardFoot}>
                        <span className={g.cardSub}>{sub}</span>
                        {c.open ? <span className={g.pill}>{openLabel(c.open)}</span> : null}
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
