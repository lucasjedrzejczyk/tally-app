"use client";

// Pessoas: a lista à esquerda e a ficha à direita (>= 900px); no celular só a lista, e a ficha
// entra em tela cheia pela direita (mesmo movimento de Notas). A seleção vive em ?p=<id>
// (replaceState no computador, pushState no celular para o voltar do aparelho fechar a ficha);
// os filtros também ficam na URL, e o modo Editar da ficha é ?edit=1.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { createPersonAction } from "../actions";
import { NO_FILTERS, filterPeople, filtersQuery, type PeopleFilters } from "../domain";
import { useSwipeToClose } from "../swipe";
import type { PersonDetail, PersonListItem, SavedList } from "../types";
import { Panel } from "@/features/finance/components/Panel";
import { ImportPeople } from "./ImportPeople";
import { PeopleList } from "./PeopleList";
import { PersonProfile } from "./PersonProfile";
import styles from "../people.module.css";

function urlFor(f: PeopleFilters, id: string | null, edit = false): string {
  const p = new URLSearchParams(filtersQuery(f));
  if (id) p.set("p", id);
  if (id && edit) p.set("edit", "1");
  const qs = p.toString();
  return qs ? `/people?${qs}` : "/people";
}

export function PeopleView({
  people: initialPeople,
  groups,
  initialFilters,
  initialSelected,
  initialDetail,
  initialMobileOpen,
  initialEditing,
  initialLists,
  canEdit,
  canDocs,
  canFinance,
}: {
  people: PersonListItem[];
  groups: { id: string; name: string }[];
  initialFilters: PeopleFilters;
  initialSelected: string | null;
  initialDetail: PersonDetail | null;
  initialMobileOpen: boolean;
  initialEditing: boolean;
  initialLists: SavedList[];
  canEdit: boolean;
  canDocs: boolean;
  canFinance: boolean;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [filters, setFilters] = useState(initialFilters);
  const [sel, setSel] = useState(initialSelected);
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  const [details, setDetails] = useState<Record<string, PersonDetail>>(initialDetail ? { [initialDetail.id]: initialDetail } : {});
  const [editing, setEditing] = useState(initialEditing);
  const [fresh, setFresh] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lists, setLists] = useState(initialLists);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const pushed = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);

  const isMobile = () => window.matchMedia("(max-width: 56.1875rem)").matches;
  const have = sel ? Boolean(details[sel]) : true;

  const select = useCallback(
    (id: string, f: PeopleFilters = filters, edit = false) => {
      setSel(id);
      setError("");
      setEditing(edit);
      setFresh((cur) => (cur === id ? cur : null));
      if (isMobile()) {
        setMobileOpen(true);
        window.history.pushState({ p: id }, "", urlFor(f, id, edit));
        pushed.current = true;
      } else window.history.replaceState(null, "", urlFor(f, id, edit));
    },
    [filters],
  );

  function setEdit(on: boolean) {
    setEditing(on);
    if (!on) setFresh(null);
    window.history.replaceState(null, "", urlFor(filters, sel, on));
  }

  function closeMobile() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      setMobileOpen(false);
      window.history.replaceState(null, "", urlFor(filters, null));
    }
  }
  useSwipeToClose(paneRef, mobileOpen, closeMobile);

  useEffect(() => {
    function onPop() {
      pushed.current = false;
      setMobileOpen(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Carrega a ficha de quem foi escolhido na lista (a primeira já vem do servidor).
  useEffect(() => {
    if (!sel || have) return;
    let alive = true;
    fetch(`/api/people/${sel}`)
      .then((r) => (r.ok ? (r.json() as Promise<PersonDetail>) : Promise.reject(new Error("Não consegui abrir a ficha."))))
      .then((d) => alive && setDetails((all) => ({ ...all, [sel]: d })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sel, have]);

  function apply(next: Partial<PeopleFilters>) {
    const f = { ...filters, ...next };
    setFilters(f);
    // Se o filtro tira da lista a pessoa aberta, abre a primeira que sobrou (ou deixa a ficha vazia).
    let id = sel;
    if (sel && !filterPeople(people, f, new Date()).some((p) => p.id === sel)) {
      id = filterPeople(people, f, new Date())[0]?.id ?? null;
      setSel(id);
      setEditing(false);
      setError("");
    }
    window.history.replaceState(null, "", urlFor(f, id));
  }

  async function create() {
    setCreating(true);
    setError("");
    const r = await createPersonAction();
    setCreating(false);
    if (!r.success) return void setError(r.message);
    const item: PersonListItem = { id: r.data.id, name: "Nova pessoa", status: "visitor_first", office: "", phone: "", whatsapp: "", email: "", birthDate: null, archived: false, groupIds: [], photoUrl: null };
    setPeople((l) => [item, ...l]);
    setFilters(NO_FILTERS);
    select(item.id, NO_FILTERS, true);
    setFresh(item.id);
  }

  const update = useCallback((id: string, fn: (d: PersonDetail) => PersonDetail) => {
    setDetails((d) => (d[id] ? { ...d, [id]: fn(d[id]) } : d));
  }, []);
  const patchList = useCallback((id: string, patch: Partial<PersonListItem>) => {
    setPeople((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const detail = sel ? details[sel] : undefined;

  return (
    <div className={styles.wrap}>
      <PeopleList
        people={people}
        groups={groups}
        filters={filters}
        onFilters={apply}
        selectedId={sel}
        onSelect={(id) => select(id)}
        onNew={() => void create()}
        onImport={() => setImporting(true)}
        lists={lists}
        onLists={setLists}
        canEdit={canEdit}
        creating={creating}
      />

      <div ref={paneRef} className={`${styles.pane}${mobileOpen ? " " + styles.paneOpen : ""}`}>
        <button type="button" className={styles.back} onClick={closeMobile}>
          <UiIcon icon={ChevronLeft} />
          Pessoas
        </button>
        {detail ? (
          <PersonProfile
            key={detail.id}
            detail={detail}
            people={people}
            canEdit={canEdit}
            canDocs={canDocs}
            canFinance={canFinance}
            focusName={sel === fresh}
            editing={canEdit && editing}
            onEditing={setEdit}
            update={update}
            patchList={patchList}
            onOpenPerson={(id) => select(id)}
          />
        ) : sel ? (
          <p className="muted" role={error ? "alert" : undefined}>{error || "Abrindo a ficha…"}</p>
        ) : (
          <p className="muted">Nenhuma pessoa para mostrar.</p>
        )}
        {error && detail ? <p className={styles.fErr} role="alert">{error}</p> : null}
      </div>

      {importing ? (
        <Panel title="Importar planilha" onClose={() => setImporting(false)}>
          {(close) => <ImportPeople canDocs={canDocs} onClose={(changed) => (changed ? window.location.reload() : close())} />}
        </Panel>
      ) : null}
    </div>
  );
}
