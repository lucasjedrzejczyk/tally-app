"use client";

// Cuidado (spec 17): abas Acompanhamentos | Orações. Acompanhamentos = lista à esquerda e ficha à
// direita (>= 900px); no celular a ficha entra em tela cheia com o gesto de voltar das outras telas.
// Seleção em ?c=<id>, Editar em ?edit=1, aba Orações em ?tab=oracoes. Troca de aba é instantânea.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { useSwipeToClose } from "@/features/sticks/swipe";
import type { PersonListItem } from "@/features/sticks/types";
import type { PrayerRequest } from "@/features/prayer/domain";
import { PrayerTab } from "@/features/prayer/components/PrayerTab";
import { createCareAction } from "../actions";
import type { CareDetail, CareListItem, StaffOption, Suggestion } from "../types";
import { CareList } from "./CareList";
import { CareProfile } from "./CareProfile";
import { PickPerson } from "./PickPerson";
import people from "@/features/sticks/people.module.css";
import c from "../care.module.css";

type Tab = "care" | "prayer";
const urlFor = (tab: Tab, id: string | null, edit = false): string =>
  tab === "prayer" ? "/care?tab=oracoes" : id ? `/care?c=${id}${edit ? "&edit=1" : ""}` : "/care";
const listItem = ({ timeline: _t, ...rest }: CareDetail): CareListItem => rest;

export function CareView({
  initialTab,
  canView,
  canManage,
  canManagePrayer,
  me,
  items: initialItems,
  suggestions: initialSuggestions,
  staff,
  people: persons,
  prayers,
  token,
  initialSelected,
  initialDetail,
  initialMobileOpen,
  initialEditing,
  today,
}: {
  initialTab: Tab;
  canView: boolean;
  canManage: boolean;
  canManagePrayer: boolean;
  me: string;
  items: CareListItem[];
  suggestions: Suggestion[];
  staff: StaffOption[];
  people: PersonListItem[];
  prayers: PrayerRequest[];
  token: string | null;
  initialSelected: string | null;
  initialDetail: CareDetail | null;
  initialMobileOpen: boolean;
  initialEditing: boolean;
  today: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState(initialItems);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [pending, setPending] = useState(prayers.filter((p) => p.pending).length);
  const [sel, setSel] = useState(initialSelected);
  const [details, setDetails] = useState<Record<string, CareDetail>>(initialDetail ? { [initialDetail.id]: initialDetail } : {});
  const [editing, setEditing] = useState(initialEditing);
  const [fresh, setFresh] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const pushed = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const isMobile = () => window.matchMedia("(max-width: 56.1875rem)").matches;

  const have = sel ? Boolean(details[sel]) : true;
  useEffect(() => {
    if (!sel || have) return;
    let alive = true;
    fetch(`/api/care/${sel}`)
      .then((r) => (r.ok ? (r.json() as Promise<CareDetail>) : Promise.reject(new Error("Não consegui abrir o acompanhamento."))))
      .then((d) => alive && setDetails((all) => ({ ...all, [sel]: d })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sel, have]);

  const select = useCallback((id: string, edit = false) => {
    setSel(id);
    setError("");
    setEditing(edit);
    setFresh((cur) => (cur === id ? cur : null));
    if (isMobile()) {
      setMobileOpen(true);
      if (!pushed.current) {
        window.history.pushState({ c: id }, "", urlFor("care", id, edit));
        pushed.current = true;
      } else window.history.replaceState({ c: id }, "", urlFor("care", id, edit));
    } else window.history.replaceState(null, "", urlFor("care", id, edit));
  }, []);

  function setEdit(on: boolean) {
    setEditing(on);
    if (!on) setFresh(null);
    window.history.replaceState(window.history.state, "", urlFor("care", sel, on));
  }
  function closeMobile() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      setMobileOpen(false);
      window.history.replaceState(null, "", urlFor("care", null));
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

  function goTab(t: Tab) {
    setTab(t);
    setMobileOpen(false);
    pushed.current = false;
    window.history.replaceState(null, "", urlFor(t, t === "care" ? sel : null));
  }

  const setDetail = useCallback((d: CareDetail) => {
    setDetails((all) => ({ ...all, [d.id]: d }));
    setItems((l) => (l.some((x) => x.id === d.id) ? l.map((x) => (x.id === d.id ? listItem(d) : x)) : [listItem(d), ...l]));
  }, []);

  async function create(stickId: string, reason: string, key?: string): Promise<string | null> {
    const r = await createCareAction(stickId, reason);
    if (!r.success) return r.message;
    setDetail(r.data);
    if (key) setSuggestions((l) => l.filter((s) => s.key !== key));
    else setSuggestions((l) => l.filter((s) => s.stickId !== stickId));
    select(r.data.id, !key);
    if (!key) setFresh(r.data.id);
    return null;
  }

  const head = (
    <div className={c.top}>
      <div className={people.head}>
        <h1 className="page">Cuidado</h1>
        {tab === "care" && canView ? (
          <div className={people.headEnd}>
            <button type="button" className="iconbtn" aria-label="Novo acompanhamento" onClick={() => setPicking(true)}>
              <UiIcon icon={Plus} />
            </button>
          </div>
        ) : null}
      </div>
      {canView ? (
        <div className={c.tabs} role="tablist" aria-label="Cuidado">
          <button type="button" role="tab" aria-selected={tab === "care"} className={c.tab} onClick={() => goTab("care")}>Acompanhamentos</button>
          <button type="button" role="tab" aria-selected={tab === "prayer"} className={c.tab} onClick={() => goTab("prayer")}>
            Orações{pending ? <span className={c.tabN}>{pending}</span> : null}
          </button>
        </div>
      ) : null}
    </div>
  );

  if (tab === "prayer")
    return (
      <div className={c.single}>
        {head}
        <PrayerTab initial={prayers} people={persons} token={token} canManage={canManagePrayer} onPending={setPending} />
      </div>
    );

  const detail = sel ? details[sel] : undefined;
  const profile = detail ? (
    <CareProfile
      key={detail.id}
      detail={detail}
      staff={staff}
      me={me}
      canManage={canManage}
      today={today}
      focusReason={sel === fresh}
      editing={editing}
      onEditing={setEdit}
      onDetail={setDetail}
      onDeleted={(id) => {
        const rest = items.filter((x) => x.id !== id);
        setItems(rest);
        const next = rest[0]?.id ?? null;
        setSel(next);
        setEditing(false);
        setMobileOpen(false);
        window.history.replaceState(null, "", urlFor("care", next));
      }}
    />
  ) : sel ? (
    <p className="muted" role={error ? "alert" : undefined}>{error || "Abrindo…"}</p>
  ) : (
    <p className="muted">Nenhum acompanhamento aberto. Escolha alguém em &quot;Pode precisar de atenção&quot; ou toque em + para começar.</p>
  );

  return (
    <>
      <div className={people.wrap}>
        <div className={people.list}>
          {head}
          <CareList items={items} suggestions={suggestions} selectedId={sel} today={today} onSelect={(id) => select(id)} onFollow={(s) => create(s.stickId, s.reason, s.key)} onSuggestions={setSuggestions} />
        </div>
        <div ref={paneRef} className={`${people.pane}${mobileOpen ? " " + people.paneOpen : ""}`}>
          <button type="button" className={people.back} onClick={closeMobile}>
            <UiIcon icon={ChevronLeft} />
            Cuidado
          </button>
          {profile}
          {error && detail ? <p className={people.fErr} role="alert">{error}</p> : null}
        </div>
      </div>
      {picking ? <PickPerson persons={persons} onPick={(id) => create(id, "")} onClose={() => setPicking(false)} /> : null}
    </>
  );
}
