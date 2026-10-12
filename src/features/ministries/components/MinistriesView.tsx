"use client";

// Ministérios: lista à esquerda e ficha à direita (>= 900px); no celular a ficha entra em tela cheia
// com o mesmo gesto de voltar de Pessoas e Células. Seleção em ?m=<id>; modo Editar em ?edit=1.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { useSwipeToClose } from "@/features/sticks/swipe";
import type { PersonListItem } from "@/features/sticks/types";
import type { Service } from "@/features/encontros/types";
import { createMinistryAction } from "../actions";
import { listItemFromDetail } from "../domain";
import type { MinistryDetail, MinistryListItem } from "../types";
import { MinistryList } from "./MinistryList";
import { MinistryProfile } from "./MinistryProfile";
import people from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";

const urlFor = (id: string | null, edit = false): string => (id ? `/ministries?m=${id}${edit ? "&edit=1" : ""}` : "/ministries");

export function MinistriesView({
  items: initialItems,
  people: persons,
  services,
  initialSelected,
  initialDetail,
  initialMobileOpen,
  initialEditing,
  canManage,
  canInvite,
  isStaff,
  today,
}: {
  items: MinistryListItem[];
  people: PersonListItem[];
  services: Service[];
  initialSelected: string | null;
  initialDetail: MinistryDetail | null;
  initialMobileOpen: boolean;
  initialEditing: boolean;
  canManage: boolean;
  canInvite: boolean;
  isStaff: boolean;
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(initialSelected);
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  const [details, setDetails] = useState<Record<string, MinistryDetail>>(initialDetail ? { [initialDetail.id]: initialDetail } : {});
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
      window.history.pushState({ m: id }, "", urlFor(id, edit));
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

  useEffect(() => {
    if (!sel || have) return;
    let alive = true;
    fetch(`/api/ministries/${sel}`)
      .then((r) => (r.ok ? (r.json() as Promise<MinistryDetail>) : Promise.reject(new Error("Não consegui abrir o ministério."))))
      .then((d) => alive && setDetails((all) => ({ ...all, [sel]: d })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sel, have]);

  async function create() {
    setCreating(true);
    setError("");
    const r = await createMinistryAction();
    setCreating(false);
    if (!r.success) return void setError(r.message);
    const d: MinistryDetail = { id: r.data.id, name: "Novo ministério", serviceId: null, day: "", time: "", roles: [], slots: {}, members: [], assignments: [] };
    setDetails((all) => ({ ...all, [d.id]: d }));
    setItems((l) => [listItemFromDetail(d, today), ...l]);
    setQ("");
    select(d.id, true);
    setFresh(d.id);
  }

  // Ficha nova (de uma gravação): guarda e refaz o cartão da lista.
  const setDetail = useCallback(
    (d: MinistryDetail) => {
      setDetails((all) => ({ ...all, [d.id]: d }));
      setItems((l) => l.map((c) => (c.id === d.id ? listItemFromDetail(d, today) : c)));
    },
    [today],
  );

  const detail = sel ? details[sel] : undefined;
  const solo = !isStaff && items.length === 1;
  const profile = detail ? (
    <MinistryProfile
      key={detail.id}
      detail={detail}
      people={persons}
      services={services}
      canManage={canManage}
      canInvite={canInvite}
      isStaff={isStaff}
      today={today}
      focusName={sel === fresh}
      editing={canManage && editing}
      onEditing={setEdit}
      onDetail={setDetail}
      onArchived={(id) => {
        setItems((l) => l.filter((c) => c.id !== id));
        const next = items.find((c) => c.id !== id)?.id ?? null;
        setSel(next);
        setEditing(false);
        setMobileOpen(false);
        window.history.replaceState(null, "", urlFor(next));
      }}
    />
  ) : sel ? (
    <p className="muted" role={error ? "alert" : undefined}>{error || "Abrindo o ministério…"}</p>
  ) : (
    <p className="muted">Nenhum ministério para mostrar.</p>
  );
  if (solo) return <div className={g.solo}>{profile}{error && detail ? <p className={people.fErr} role="alert">{error}</p> : null}</div>;

  return (
    <div className={people.wrap}>
      <MinistryList items={items} q={q} onQ={setQ} selectedId={sel} onSelect={(id) => select(id)} onNew={() => void create()} canManage={canManage} creating={creating} today={today} />
      <div ref={paneRef} className={`${people.pane}${mobileOpen ? " " + people.paneOpen : ""}`}>
        <button type="button" className={people.back} onClick={closeMobile}>
          <UiIcon icon={ChevronLeft} />
          Ministérios
        </button>
        {profile}
        {error && detail ? <p className={people.fErr} role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
