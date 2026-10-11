"use client";

// Menu "Listas" (spec 13, B3 e C1): listas salvas, sugestões (quando a igreja não tem nenhuma) e
// "Salvar lista atual" quando há filtro. A lista guarda só os filtros (o mesmo objeto da
// querystring); escolher uma APLICA os filtros (nada é criado sozinho). Renomear, exportar e
// apagar ficam numa segunda tela do mesmo menu.
import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { MenuItem } from "@/features/study/components/FilterChips";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { createPeopleListAction, deletePeopleListAction, renamePeopleListAction } from "../bulk-actions";
import { NO_FILTERS, filtersQuery, hasFilters, type PeopleFilters } from "../domain";
import type { SavedList } from "../types";
import styles from "../people.module.css";

const SUGGESTIONS: { name: string; filters: Partial<PeopleFilters> }[] = [
  { name: "Aniversariantes do mês", filters: { aniv: "este" } },
  { name: "Membros sem célula", filters: { s: "member", celula: "sem" } },
  { name: "Visitantes", filters: { s: "visitor" } },
];

export const sameFilters = (a: PeopleFilters, b: Partial<PeopleFilters>): boolean => filtersQuery(a) === filtersQuery({ ...NO_FILTERS, ...b });

function NameForm({ initial, submit, label, onDone }: { initial: string; submit: (name: string) => Promise<string | null>; label: string; onDone: () => void }) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    const msg = await submit(name);
    setBusy(false);
    if (msg) setErr(msg);
    else onDone();
  }
  return (
    <form className={styles.exitForm} onSubmit={(e) => void go(e)}>
      <label className={styles.exitLabel}>
        Nome da lista
        <input className={styles.fInput} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nome da lista" />
      </label>
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
      <div className={styles.exitActions}>
        <button type="submit" className={styles.primary} disabled={busy}>{label}</button>
      </div>
    </form>
  );
}

type View = { k: "menu" } | { k: "manage"; list: SavedList } | { k: "rename"; list: SavedList } | { k: "save" };

export function ListsMenu({
  lists,
  filters,
  canEdit,
  onApply,
  onExport,
  onLists,
}: {
  lists: SavedList[];
  filters: PeopleFilters;
  canEdit: boolean;
  onApply: (f: PeopleFilters) => void;
  onExport: (list: SavedList) => void;
  onLists: (next: SavedList[]) => void;
}) {
  const [view, setView] = useState<View>({ k: "menu" });
  const back = <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => setView({ k: "menu" })}>Voltar</button>;
  const suggested = SUGGESTIONS.find((s) => sameFilters(filters, s.filters))?.name ?? "";
  const canSave = canEdit && hasFilters(filters) && !lists.some((l) => sameFilters(filters, l.filters));

  return (
    <Popover trigger={<>Listas<UiIcon icon={ChevronDown} /></>} triggerClass={studyStyles.chipBtn} label="Listas" haspopup="menu">
      {(close) => {
        const done = () => {
          setView({ k: "menu" });
          close();
        };
        if (view.k === "save")
          return (
            <>
              <NameForm
                key={suggested}
                initial={suggested}
                label="Salvar"
                submit={async (name) => {
                  const r = await createPeopleListAction(name, filters);
                  if (!r.success) return r.message;
                  onLists([...lists, r.data]);
                  return null;
                }}
                onDone={done}
              />
              {back}
            </>
          );
        if (view.k === "rename") {
          const l = view.list;
          return (
            <>
              <NameForm
                initial={l.name}
                label="Renomear"
                submit={async (name) => {
                  const r = await renamePeopleListAction(l.id, name);
                  if (!r.success) return r.message;
                  onLists(lists.map((x) => (x.id === l.id ? { ...x, name: r.data.name } : x)));
                  return null;
                }}
                onDone={done}
              />
              {back}
            </>
          );
        }
        if (view.k === "manage") {
          const l = view.list;
          return (
            <>
              <p className={styles.menuHead}>{l.name}</p>
              <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { onExport(l); done(); }}>Exportar</button>
              {canEdit ? (
                <>
                  <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => setView({ k: "rename", list: l })}>Renomear</button>
                  <button
                    type="button"
                    role="menuitem"
                    className={studyStyles.mi}
                    onClick={() => {
                      done();
                      void deletePeopleListAction(l.id).then((r) => r.success && onLists(lists.filter((x) => x.id !== l.id)));
                    }}
                  >
                    Apagar
                  </button>
                </>
              ) : null}
              {back}
            </>
          );
        }
        return (
          <>
            {lists.map((l) => (
              <div key={l.id} className={styles.listRow}>
                <MenuItem on={sameFilters(filters, l.filters)} onClick={() => { onApply({ ...NO_FILTERS, ...l.filters }); done(); }}>{l.name}</MenuItem>
                <button type="button" className="iconbtn" aria-label={`Mais ações da lista ${l.name}`} onClick={() => setView({ k: "manage", list: l })}>
                  <UiIcon icon={MoreHorizontal} />
                </button>
              </div>
            ))}
            {lists.length === 0 && canEdit ? (
              <>
                <p className={styles.menuHead}>Sugestões</p>
                {SUGGESTIONS.map((s) => (
                  <MenuItem key={s.name} on={sameFilters(filters, s.filters)} onClick={() => { onApply({ ...NO_FILTERS, ...s.filters }); done(); }}>{s.name}</MenuItem>
                ))}
              </>
            ) : null}
            {lists.length === 0 && !canEdit ? <p className={styles.menuHead}>Nenhuma lista salva.</p> : null}
            {canSave ? (
              <>
                <hr className={studyStyles.miSep} />
                <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => setView({ k: "save" })}>Salvar lista atual</button>
              </>
            ) : null}
          </>
        );
      }}
    </Popover>
  );
}
