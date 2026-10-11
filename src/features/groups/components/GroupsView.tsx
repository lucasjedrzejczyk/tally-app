"use client";

// Células: a lista à esquerda e a ficha à direita (>= 900px); no celular só a lista, e a ficha
// entra em tela cheia pela direita (mesmo movimento de Pessoas). A seleção vive em ?g=<id>
// (replaceState no computador, pushState no celular para o voltar do aparelho fechar a ficha);
// o modo Editar da ficha é ?edit=1.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { useSwipeToClose } from "@/features/sticks/swipe";
import type { PersonListItem } from "@/features/sticks/types";
import { createCellAction } from "../actions";
import { NO_CELL_FILTERS, filterCells, listItemFromDetail, type CellFilters } from "../domain";
import type { CellDetail, CellListItem } from "../types";
import { CellList } from "./CellList";
import { CellProfile } from "./CellProfile";
import people from "@/features/sticks/people.module.css";

const urlFor = (id: string | null, edit = false): string => (id ? `/groups?g=${id}${edit ? "&edit=1" : ""}` : "/groups");

export function GroupsView({
  cells: initialCells,
  people: initialPeople,
  initialSelected,
  initialDetail,
  initialMobileOpen,
  initialEditing,
  canManage,
  today,
}: {
  cells: CellListItem[];
  people: PersonListItem[];
  initialSelected: string | null;
  initialDetail: CellDetail | null;
  initialMobileOpen: boolean;
  initialEditing: boolean;
  canManage: boolean;
  today: string;
}) {
  const [cells, setCells] = useState(initialCells);
  const [persons, setPersons] = useState(initialPeople);
  const [filters, setFilters] = useState<CellFilters>(NO_CELL_FILTERS);
  const [sel, setSel] = useState(initialSelected);
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  const [details, setDetails] = useState<Record<string, CellDetail>>(initialDetail ? { [initialDetail.id]: initialDetail } : {});
  const [editing, setEditing] = useState(initialEditing);
  const [fresh, setFresh] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const pushed = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);

  const isMobile = () => window.matchMedia("(max-width: 56.1875rem)").matches;
  const have = sel ? Boolean(details[sel]) : true;

  const select = useCallback((id: string, edit = false) => {
    setSel(id);
    setError("");
    setEditing(edit);
    setFresh((cur) => (cur === id ? cur : null));
    if (isMobile()) {
      setMobileOpen(true);
      window.history.pushState({ g: id }, "", urlFor(id, edit));
      pushed.current = true;
    } else window.history.replaceState(null, "", urlFor(id, edit));
  }, []);

  function setEdit(on: boolean) {
    setEditing(on);
    if (!on) setFresh(null);
    window.history.replaceState(null, "", urlFor(sel, on));
  }

  function closeMobile() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      setMobileOpen(false);
      window.history.replaceState(null, "", urlFor(null));
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

  // Carrega a ficha da célula escolhida na lista (a primeira já vem do servidor).
  useEffect(() => {
    if (!sel || have) return;
    let alive = true;
    fetch(`/api/groups/${sel}`)
      .then((r) => (r.ok ? (r.json() as Promise<CellDetail>) : Promise.reject(new Error("Não consegui abrir a célula."))))
      .then((d) => alive && setDetails((all) => ({ ...all, [sel]: d })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sel, have]);

  function apply(next: Partial<CellFilters>) {
    const f = { ...filters, ...next };
    setFilters(f);
    // Se o filtro tira da lista a célula aberta, abre a primeira que sobrou (ou deixa a ficha vazia).
    if (sel && !filterCells(cells, f).some((c) => c.id === sel)) {
      const id = filterCells(cells, f)[0]?.id ?? null;
      setSel(id);
      setEditing(false);
      setError("");
      window.history.replaceState(null, "", urlFor(id));
    }
  }

  async function create() {
    setCreating(true);
    setError("");
    const r = await createCellAction();
    setCreating(false);
    if (!r.success) return void setError(r.message);
    const item: CellListItem = { id: r.data.id, name: "Nova célula", day: "", time: "", location: "", supervisorId: null, supervisorName: "", leaderName: "", memberCount: 0, lastSession: null, missing: 0 };
    setCells((l) => [item, ...l]);
    setFilters(NO_CELL_FILTERS);
    select(item.id, true);
    setFresh(item.id);
  }

  // Ficha nova (de uma gravação ou da busca): guarda e refaz a linha da lista.
  const setDetail = useCallback((d: CellDetail) => {
    setDetails((all) => ({ ...all, [d.id]: d }));
    setCells((l) => l.map((c) => (c.id === d.id ? listItemFromDetail(d) : c)));
    setPersons((l) =>
      l.map((p) => {
        const here = d.members.some((m) => m.stickId === p.id);
        const had = p.groupIds.includes(d.id);
        if (here === had) return p;
        return { ...p, groupIds: here ? [d.id] : p.groupIds.filter((g) => g !== d.id) };
      }),
    );
  }, []);
  // Mudança só dos campos de texto (nome, dia, hora, local).
  const patch = useCallback((id: string, fields: Partial<Pick<CellDetail, "name" | "day" | "time" | "location">>) => {
    setDetails((all) => (all[id] ? { ...all, [id]: { ...all[id], ...fields } } : all));
    setCells((l) => l.map((c) => (c.id === id ? { ...c, ...fields } : c)));
  }, []);
  // Quem mudou de célula: as outras células perdem membro. Atualiza a ficha de cada uma.
  const refetch = useCallback((ids: string[]) => {
    for (const id of ids)
      fetch(`/api/groups/${id}`)
        .then((r) => (r.ok ? (r.json() as Promise<CellDetail>) : null))
        .then((d) => d && setDetail(d))
        .catch(() => undefined);
  }, [setDetail]);

  const detail = sel ? details[sel] : undefined;

  return (
    <div className={people.wrap}>
      <CellList cells={cells} filters={filters} onFilters={apply} selectedId={sel} onSelect={(id) => select(id)} onNew={() => void create()} canManage={canManage} creating={creating} today={today} />

      <div ref={paneRef} className={`${people.pane}${mobileOpen ? " " + people.paneOpen : ""}`}>
        <button type="button" className={people.back} onClick={closeMobile}>
          <UiIcon icon={ChevronLeft} />
          Células
        </button>
        {detail ? (
          <CellProfile
            key={detail.id}
            detail={detail}
            people={persons}
            cells={cells}
            canManage={canManage}
            focusName={sel === fresh}
            editing={canManage && editing}
            onEditing={setEdit}
            onDetail={setDetail}
            onPatch={patch}
            onMoved={refetch}
            onArchived={(id) => {
              setCells((l) => l.filter((c) => c.id !== id));
              const next = cells.find((c) => c.id !== id)?.id ?? null;
              setSel(next);
              setEditing(false);
              window.history.replaceState(null, "", urlFor(next));
            }}
          />
        ) : sel ? (
          <p className="muted" role={error ? "alert" : undefined}>{error || "Abrindo a célula…"}</p>
        ) : (
          <p className="muted">Nenhuma célula para mostrar.</p>
        )}
        {error && detail ? <p className={people.fErr} role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
