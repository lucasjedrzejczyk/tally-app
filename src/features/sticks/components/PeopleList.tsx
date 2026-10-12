"use client";

// Lista de Pessoas (spec 13, C1): uma fileira de controles (busca, Situação, Filtros, Listas) e,
// só quando há filtro ligado, etiquetas removíveis logo abaixo. Mesmo padrão da biblioteca de
// Sermões. Quem guarda os filtros (e a URL) é o pai; aqui só se desenha e se avisa o que mudou.
import { useMemo, useState } from "react";
import { ChevronDown, MoreHorizontal, Plus, X } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { exportPeopleAction } from "../bulk-actions";
import { saveCsv, slug } from "../download";
import { ListsMenu, sameFilters } from "./SavedLists";
import { NO_FILTERS, birthdayShort, filterPeople, hasFilters, personSubtitle, type PeopleFilters } from "../domain";
import type { PersonListItem, SavedList } from "../types";
import { MenuItem } from "@/features/study/components/FilterChips";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import styles from "../people.module.css";

const STATUS_CHIPS: ReadonlyArray<readonly [PeopleFilters["s"], string]> = [
  ["", "Todos"],
  ["member", "Membros"],
  ["attendee", "Frequentadores"],
  ["visitor", "Visitantes"],
  ["inactive", "Inativos"],
];
const BIRTHDAY_LABEL = { este: "Este mês", proximo: "Próximo mês" } as const;

export function PeopleList({
  people,
  groups,
  filters,
  onFilters,
  selectedId,
  onSelect,
  onNew,
  onImport,
  lists,
  onLists,
  canEdit,
  creating,
}: {
  people: PersonListItem[];
  groups: { id: string; name: string }[];
  filters: PeopleFilters;
  onFilters: (next: Partial<PeopleFilters>) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
  lists: SavedList[];
  onLists: (next: SavedList[]) => void;
  canEdit: boolean;
  creating: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const visible = useMemo(() => filterPeople(people, filters, now), [people, filters, now]);
  const active = useMemo(() => people.filter((p) => !p.archived), [people]);

  const offices = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of active) if (p.office) n.set(p.office, (n.get(p.office) ?? 0) + 1);
    return [...n].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [active]);
  const groupCount = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of active) for (const g of p.groupIds) n.set(g, (n.get(g) ?? 0) + 1);
    return n;
  }, [active]);
  const withoutGroup = useMemo(() => active.filter((p) => p.groupIds.length === 0).length, [active]);
  const groupName = filters.celula === "sem" ? "Sem célula" : groups.find((g) => g.id === filters.celula)?.name ?? null;

  const [notice, setNotice] = useState("");
  async function exportIds(ids: string[], name?: string) {
    setNotice("");
    const r = await exportPeopleAction(ids);
    if (!r.success) return void setNotice(r.message);
    saveCsv(name ? `${slug(name)}-${r.data.filename.slice(-14)}` : r.data.filename, r.data.csv);
  }

  const total = visible.length;
  const nothing = active.length === 0 && people.length === 0;
  const emptyNew = canEdit ? (
    <button type="button" className={styles.primary} onClick={onNew} disabled={creating}>Nova pessoa</button>
  ) : null;
  const statusLabel = STATUS_CHIPS.find(([k]) => k === filters.s)?.[1] ?? "Todos";
  const statusText = statusLabel === "Todos" ? "Situação" : statusLabel;
  const filterCount = [filters.cargo, filters.aniv, filters.celula].filter(Boolean).length;
  const filtersText = filterCount ? `Filtros (${filterCount})` : "Filtros";
  const savedMatch = lists.find((l) => hasFilters(l.filters) && sameFilters(filters, l.filters));
  const tags: { key: string; label: string; clear: () => void }[] = savedMatch
    ? [{ key: "lista", label: savedMatch.name, clear: () => onFilters(NO_FILTERS) }]
    : [
        ...(filters.cargo ? [{ key: "cargo", label: `Cargo: ${filters.cargo}`, clear: () => onFilters({ cargo: "" }) }] : []),
        ...(filters.aniv ? [{ key: "aniv", label: `Aniversário: ${BIRTHDAY_LABEL[filters.aniv]}`, clear: () => onFilters({ aniv: "" }) }] : []),
        ...(filters.celula && groupName ? [{ key: "celula", label: `Célula: ${groupName}`, clear: () => onFilters({ celula: "" }) }] : []),
      ];
  const pick = <K extends "cargo" | "aniv" | "celula">(key: K, value: PeopleFilters[K], close: () => void) => {
    onFilters({ [key]: filters[key] === value ? "" : value });
    close();
  };

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const at = visible.findIndex((p) => p.id === selectedId);
    const next = visible[at < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    onSelect(next.id);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${CSS.escape(next.id)}"]`)?.focus();
  }

  return (
    <div className={styles.list}>
      <div className={styles.head}>
        <h1 className="page">Pessoas</h1>
        {nothing ? null : <span className={styles.count}>{total} {total === 1 ? "pessoa" : "pessoas"}</span>}
        {nothing ? null : (
          <div className={styles.headEnd}>
            {canEdit ? (
              <button type="button" className="iconbtn" aria-label="Nova pessoa" onClick={onNew} disabled={creating}>
                <UiIcon icon={Plus} />
              </button>
            ) : null}
            <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações da lista" align="right">
              {(close) => (
                <>
                  {canEdit ? (
                    <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { onImport(); close(); }}>Importar planilha</button>
                  ) : null}
                  <button type="button" role="menuitem" className={studyStyles.mi} disabled={visible.length === 0} onClick={() => { void exportIds(visible.map((p) => p.id)); close(); }}>Exportar lista</button>
                </>
              )}
            </Popover>
          </div>
        )}
      </div>
      {notice ? <p className={styles.fErr} role="alert">{notice}</p> : null}

      {nothing ? (
        <div className={styles.empty}>
          <p>Nenhuma pessoa ainda.</p>
          {emptyNew}
          {canEdit ? <button type="button" className="btn ghost sm" onClick={onImport}>Importar planilha</button> : null}
        </div>
      ) : (
        <>
          <input
            className={styles.search}
            type="search"
            placeholder="Buscar por nome, telefone ou e-mail"
            aria-label="Buscar por nome, telefone ou e-mail"
            value={filters.q}
            onChange={(e) => onFilters({ q: e.target.value })}
          />

          <div className={styles.chips} role="group" aria-label="Filtros">
            <Popover trigger={<>{statusText}<UiIcon icon={ChevronDown} /></>} triggerClass={studyStyles.chipBtn} label={statusText}>
              {(close) => (
                <>
                  {STATUS_CHIPS.map(([key, label]) => (
                    <MenuItem key={key || "all"} on={filters.s === key} onClick={() => { onFilters({ s: key }); close(); }}>{label}</MenuItem>
                  ))}
                </>
              )}
            </Popover>
            <Popover trigger={<>{filtersText}<UiIcon icon={ChevronDown} /></>} triggerClass={studyStyles.chipBtn} label={filtersText}>
              {(close) => (
                <div className={studyStyles.popList}>
                  <p className={styles.menuHead}>Cargo</p>
                  {offices.length === 0 ? <p className={styles.menuHead}>Nenhum cargo cadastrado ainda.</p> : null}
                  {offices.map(([name, count]) => (
                    <MenuItem key={name} on={filters.cargo === name} count={count} onClick={() => pick("cargo", name, close)}>{name}</MenuItem>
                  ))}
                  <p className={styles.menuHead}>Aniversário</p>
                  <MenuItem on={filters.aniv === "este"} onClick={() => pick("aniv", "este", close)}>Este mês</MenuItem>
                  <MenuItem on={filters.aniv === "proximo"} onClick={() => pick("aniv", "proximo", close)}>Próximo mês</MenuItem>
                  <p className={styles.menuHead}>Célula</p>
                  {groups.map((g) => (
                    <MenuItem key={g.id} on={filters.celula === g.id} count={groupCount.get(g.id) ?? 0} onClick={() => pick("celula", g.id, close)}>{g.name}</MenuItem>
                  ))}
                  <MenuItem on={filters.celula === "sem"} count={withoutGroup} onClick={() => pick("celula", "sem", close)}>Sem célula</MenuItem>
                </div>
              )}
            </Popover>
            <ListsMenu
              lists={lists}
              filters={filters}
              canEdit={canEdit}
              onApply={(f) => onFilters(f)}
              onExport={(l) => void exportIds(filterPeople(people, l.filters, now).map((p) => p.id), l.name)}
              onLists={onLists}
            />
          </div>
          {tags.length ? (
            <div className={styles.tags}>
              {tags.map((t) => (
                <span key={t.key} className={styles.tag}>
                  {t.label}
                  <button type="button" className={styles.tagX} aria-label={`Remover ${t.label}`} onClick={t.clear}>
                    <UiIcon icon={X} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className={styles.rows} onKeyDown={onKey}>
            {visible.length === 0 ? (
              <div className={styles.empty}>
                <p>{hasFilters(filters) ? "Nenhuma pessoa com esses filtros." : "Nenhuma pessoa por aqui."}</p>
              </div>
            ) : (
              visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-id={p.id}
                  className={styles.row}
                  aria-current={p.id === selectedId ? "true" : undefined}
                  onClick={() => onSelect(p.id)}
                >
                  <Avatar name={p.name} photoUrl={p.photoUrl} size={32} className={styles.avatar} />
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{p.name}</span>
                    {personSubtitle(p) ? <span className={styles.rowSub}>{personSubtitle(p)}</span> : null}
                  </span>
                  <span className={styles.rowAside}>{filters.aniv ? birthdayShort(p.birthDate) : ""}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
