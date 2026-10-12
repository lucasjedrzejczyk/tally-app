"use client";

// Encontros: a semana à esquerda e a ficha à direita (>= 900px); no celular a ficha entra em tela cheia
// com o gesto de voltar de Pessoas, Células e Ministérios. Seleção em ?o=<chave>; Editar em ?edit=1.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { useSwipeToClose } from "@/features/sticks/swipe";
import type { PersonListItem } from "@/features/sticks/types";
import { addDays } from "@/features/ministries/domain";
import type { MinistryDetail } from "@/features/ministries/types";
import { createEventAction, createServiceAction } from "../actions";
import { eventKeyOf, happensOn, occurrences, parseKey, serviceKeyOf, stepService, weekCards, weekStart } from "../domain";
import type { EventDay, EventItem, Service, ServiceDate, ServiceDay } from "../types";
import { EventView } from "./EventView";
import { ServiceDayView } from "./ServiceDayView";
import { WeekList } from "./WeekList";
import people from "@/features/sticks/people.module.css";

type Week = { events: EventItem[]; dates: ServiceDate[] };
type Item = ServiceDay | EventDay;
const urlFor = (key: string | null, edit = false): string => (key ? `/encontros?o=${key}${edit ? "&edit=1" : ""}` : "/encontros");

export function EncontrosView({
  services: initialServices,
  ministries: initialMinistries,
  people: persons,
  initialStart,
  initialWeek,
  initialSelected,
  initialDetail,
  initialMobileOpen,
  initialEditing,
  canManage,
  today,
}: {
  services: Service[];
  ministries: MinistryDetail[];
  people: PersonListItem[];
  initialStart: string;
  initialWeek: Week;
  initialSelected: string | null;
  initialDetail: Item | null;
  initialMobileOpen: boolean;
  initialEditing: boolean;
  canManage: boolean;
  today: string;
}) {
  const [services, setServices] = useState(initialServices);
  const [ministries, setMinistries] = useState(initialMinistries);
  const [start, setStart] = useState(initialStart);
  const [weeks, setWeeks] = useState<Record<string, Week>>({ [initialStart]: initialWeek });
  const [sel, setSel] = useState(initialSelected);
  const [items, setItems] = useState<Record<string, Item>>(initialDetail && initialSelected ? { [initialSelected]: initialDetail } : {});
  const [editing, setEditing] = useState(initialEditing);
  const [fresh, setFresh] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const pushed = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const isMobile = () => window.matchMedia("(max-width: 56.1875rem)").matches;

  const week = weeks[start];
  const fresh_ = useMemo(
    () => (week ? weekCards(occurrences(services, week.events, week.dates, start, addDays(start, 6), today), ministries) : null),
    [week, services, ministries, start, today],
  );
  // Enquanto a semana chega, a anterior fica na tela (esmaecida) em vez de sumir.
  const last = useRef(fresh_);
  if (fresh_) last.current = fresh_;
  const cards = fresh_ ?? last.current;

  // Semana pedida + as vizinhas por trás (as setas abrem na hora). Cada semana é buscada uma vez.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const s of [start, addDays(start, 7), addDays(start, -7)]) {
      if (weeks[s] || asked.current.has(s)) continue;
      asked.current.add(s);
      const mine = s === start;
      fetch(`/api/encontros/week?start=${s}`)
        .then((r) => (r.ok ? (r.json() as Promise<Week>) : Promise.reject(new Error("Não consegui abrir a semana."))))
        .then((w) => setWeeks((all) => ({ ...all, [s]: w })))
        .catch((e: Error) => {
          asked.current.delete(s);
          if (mine) setError(e.message);
        });
    }
  }, [start, weeks]);

  // Ficha ainda não carregada.
  const have = sel ? Boolean(items[sel]) : true;
  useEffect(() => {
    if (!sel || have) return;
    let alive = true;
    fetch(`/api/encontros/item?key=${encodeURIComponent(sel)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Item>) : Promise.reject(new Error("Não consegui abrir o encontro."))))
      .then((d) => alive && setItems((all) => ({ ...all, [sel]: d })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sel, have]);

  const select = useCallback((key: string, edit = false) => {
    setSel(key);
    setError("");
    setEditing(edit);
    setFresh((cur) => (cur === key ? cur : null));
    if (isMobile()) {
      setMobileOpen(true);
      if (!pushed.current) {
        window.history.pushState({ o: key }, "", urlFor(key, edit));
        pushed.current = true;
      } else window.history.replaceState({ o: key }, "", urlFor(key, edit));
    } else window.history.replaceState(null, "", urlFor(key, edit));
  }, []);

  function setEdit(on: boolean) {
    setEditing(on);
    if (!on) setFresh(null);
    window.history.replaceState(window.history.state, "", urlFor(sel, on));
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

  function goWeek(dir: -1 | 0 | 1) {
    setError("");
    setStart((s) => (dir === 0 ? weekStart(today) : addDays(s, dir * 7)));
  }

  // ── Mudanças que mexem na semana ────────────────────────────────────────────────────────────
  const patchWeeks = (fn: (w: Week) => Week) => setWeeks((all) => Object.fromEntries(Object.entries(all).map(([k, w]) => [k, fn(w)])));
  function putEvent(ev: EventItem | null, id: string) {
    patchWeeks((w) => ({ ...w, events: w.events.filter((x) => x.id !== id) }));
    if (ev) {
      const k = weekStart(ev.date);
      setWeeks((all) => (all[k] ? { ...all, [k]: { ...all[k], events: [...all[k].events, ev] } } : all));
    }
  }
  // Guarda na semana o culto num dia como a ficha acabou de deixar (idempotente).
  function syncDate(row: ServiceDate) {
    const k = weekStart(row.date);
    setWeeks((all) => {
      const w = all[k];
      if (!w) return all;
      const rest = w.dates.filter((d) => !(d.serviceId === row.serviceId && d.date === row.date));
      return { ...all, [k]: { ...w, dates: [...rest, row] } };
    });
  }
  function setCancelled(serviceId: string, date: string, cancelled: boolean) {
    const k = weekStart(date);
    setWeeks((all) => {
      const w = all[k];
      if (!w) return all;
      const has = w.dates.some((d) => d.serviceId === serviceId && d.date === date);
      const dates = has
        ? w.dates.map((d) => (d.serviceId === serviceId && d.date === date ? { ...d, cancelled } : d))
        : [...w.dates, { id: "", serviceId, date, headcount: null, visitors: null, kids: null, sermonId: null, cancelled }];
      return { ...all, [k]: { ...w, dates } };
    });
  }
  const setMinistry = useCallback((d: MinistryDetail) => setMinistries((l) => l.map((x) => (x.id === d.id ? d : x))), []);

  function afterRemoval() {
    const next = cards?.find((c) => c.key !== sel && !c.cancelled)?.key ?? null;
    setSel(next);
    setEditing(false);
    setMobileOpen(false);
    window.history.replaceState(null, "", urlFor(next));
  }

  async function newService() {
    setCreating(true);
    setError("");
    const r = await createServiceAction();
    setCreating(false);
    if (!r.success) return void setError(r.message);
    const s: Service = { id: r.data.id, name: "Novo culto", weekday: 0, monthWeek: null, time: "19:00", location: "" };
    const key = serviceKeyOf(s.id, start);
    setServices((l) => [...l, s]);
    setItems((all) => ({ ...all, [key]: { kind: "service", service: s, date: start, row: null, plan: [], template: [], history: [], sermon: null } }));
    select(key, true);
    setFresh(key);
  }
  async function newEvent() {
    setCreating(true);
    setError("");
    const date = start <= today && today <= addDays(start, 6) ? today : start;
    const r = await createEventAction(date);
    setCreating(false);
    if (!r.success) return void setError(r.message);
    const ev: EventItem = { id: r.data.id, name: "Novo evento", date, time: "19:00", location: "", description: "", registration: false, capacity: null, registered: 0 };
    const key = eventKeyOf(ev.id);
    putEvent(ev, ev.id);
    setItems((all) => ({ ...all, [key]: { kind: "event", event: ev, registrations: [] } }));
    select(key, true);
    setFresh(key);
  }

  const detail = sel ? items[sel] : undefined;
  const k = parseKey(sel);
  let profile: React.ReactNode;
  if (detail?.kind === "service" && k?.kind === "service") {
    const key = sel!;
    profile = (
      <ServiceDayView
        key={key}
        day={detail}
        ministries={ministries}
        today={today}
        canManage={canManage}
        focusName={key === fresh}
        editing={canManage && editing}
        onEditing={setEdit}
        onDay={(fn) =>
          setItems((all) => {
            const cur = all[key];
            if (cur?.kind !== "service") return all;
            const next = fn(cur);
            if (next.row) syncDate(next.row); // a semana enxerga contagem e cancelado na hora
            return { ...all, [key]: next };
          })
        }
        onService={(s) => {
          setServices((l) => l.map((x) => (x.id === s.id ? s : x)));
          // dia mudou: a ficha aberta passa para o mesmo culto na semana
          setItems((all) => Object.fromEntries(Object.entries(all).filter(([kk, it]) => kk === key || it.kind !== "service" || it.service.id !== s.id).map(([kk, it]) => [kk, it.kind === "service" && it.service.id === s.id ? { ...it, service: s } : it])));
          // dia ou repetição mudou: abre o mesmo culto no próximo dia em que ele acontece
          if (!happensOn(s, detail.date)) {
            const d = stepService(s, addDays(weekStart(detail.date), -1), 1);
            setStart(weekStart(d));
            select(serviceKeyOf(s.id, d), true);
          }
        }}
        onMinistry={setMinistry}
        onCancelled={(c) => setCancelled(detail.service.id, detail.date, c)}
        onGo={(date) => {
          setStart(weekStart(date));
          select(serviceKeyOf(detail.service.id, date));
        }}
        onArchived={() => {
          setServices((l) => l.filter((x) => x.id !== detail.service.id));
          afterRemoval();
        }}
      />
    );
  } else if (detail?.kind === "event") {
    const key = sel!;
    profile = (
      <EventView
        key={key}
        day={detail}
        ministries={ministries}
        people={persons}
        today={today}
        canManage={canManage}
        focusName={key === fresh}
        editing={canManage && editing}
        onEditing={setEdit}
        onDay={(fn) =>
          setItems((all) => {
            const cur = all[key];
            if (cur?.kind !== "event") return all;
            const next = fn(cur);
            putEvent({ ...next.event, registered: next.registrations.length }, next.event.id);
            return { ...all, [key]: next };
          })
        }
        onMinistry={setMinistry}
        onDuplicated={(d) => {
          const nk = eventKeyOf(d.event.id);
          putEvent(d.event, d.event.id);
          setItems((all) => ({ ...all, [nk]: d }));
          select(nk, true);
          setFresh(nk);
        }}
        onArchived={() => {
          putEvent(null, detail.event.id);
          afterRemoval();
        }}
      />
    );
  } else
    profile = sel ? <p className="muted" role={error ? "alert" : undefined}>{error || "Abrindo…"}</p> : <p className="muted">Escolha um culto ou evento na semana.</p>;

  return (
    <div className={people.wrap}>
      <WeekList
        start={start}
        today={today}
        cards={cards}
        loading={!week}
        selectedKey={sel}
        canManage={canManage}
        creating={creating}
        onWeek={goWeek}
        onSelect={(key) => select(key)}
        onNewService={() => void newService()}
        onNewEvent={() => void newEvent()}
      />
      <div ref={paneRef} className={`${people.pane}${mobileOpen ? " " + people.paneOpen : ""}`}>
        <button type="button" className={people.back} onClick={closeMobile}>
          <UiIcon icon={ChevronLeft} />
          Encontros
        </button>
        {profile}
        {error && detail ? <p className={people.fErr} role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
