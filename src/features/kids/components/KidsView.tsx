"use client";

// Crianças, tela Hoje (spec 18): o culto de agora, Entrada e Saída, as salas com os rostos e o
// relatório recolhido. Entrada é otimista: o código aparece na hora e, sem rede, a entrada fica na
// fila do aparelho ("Salvando") e sobe quando a rede volta. A lista se atualiza a cada 20 s.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, LogIn, LogOut, MonitorSmartphone, Settings2 } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { Select } from "@/components/shared/Select";
import { dayMonth } from "@/features/groups/domain";
import { cancelCheckinAction, checkinAction, openCheckinsAction, suggestedRoomsAction, type CheckinInput } from "../actions";
import { rangeLabel } from "../domain";
import { happensOn } from "@/features/encontros/domain";
import type { Checkin, DayCount, Kid, Room, ServiceOption } from "../types";
import { Lamb, Wordmark } from "./Brand";
import { KIDS_THEME } from "./KidsShell";
import { RoomIcon, tone, KidAvatar } from "./Parts";
import { Entrada, type CheckinResult } from "./Entrada";
import { Saida } from "./Saida";
import { RoomSheet } from "./RoomSheet";
import { EndOfDay } from "./EndOfDay";
import k from "../kids.module.css";

type Mode = null | { t: "in" } | { t: "out" } | { t: "room"; id: string } | { t: "end" };
type Queued = { input: CheckinInput; temp: string[] };
const QUEUE_KEY = "mercy-kids-fila";

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* sem armazenamento: a fila vive só na memória */
  }
}

export function KidsView({
  rooms,
  kids: initialKids,
  open: initialOpen,
  services,
  initialService,
  days,
  away,
  today,
  canManage,
}: {
  rooms: Room[];
  kids: Kid[];
  open: Checkin[];
  services: ServiceOption[];
  initialService: string | null;
  days: DayCount[];
  away: { id: string; last: string }[];
  today: string;
  canManage: boolean;
}) {
  const [kids, setKids] = useState(initialKids);
  const [open, setOpen] = useState(initialOpen);
  const [serviceId, setServiceId] = useState(initialService ?? "");
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const queue = useRef<Queued[]>([]);

  const byId = useMemo(() => new Map(kids.map((x) => [x.id, x])), [kids]);
  const activeRooms = rooms.filter((r) => r.active);
  const todays = services.filter((s) => s.weekday !== null && happensOn({ weekday: s.weekday, monthWeek: s.monthWeek }, today));
  const close = useCallback(() => setMode(null), []);

  // Entradas guardadas sem rede: mantém os rostos com "Salvando" e tenta de novo.
  const flush = useCallback(async () => {
    const q = readQueue();
    queue.current = q;
    for (const item of q) {
      try {
        const r = await checkinAction(item.input);
        queue.current = queue.current.filter((x) => x !== item);
        writeQueue(queue.current);
        setOpen((all) => [...all.filter((c) => !item.temp.includes(c.id)), ...(r.success ? r.data.checkins : [])]);
        if (!r.success) setError(`Uma entrada guardada não subiu: ${r.message}`);
      } catch {
        return; // ainda sem rede
      }
    }
  }, []);
  useEffect(() => {
    const q = readQueue();
    if (q.length) {
      setOpen((all) => [
        ...all,
        ...q.flatMap((item) => item.input.kids.map((x, i) => ({ id: item.temp[i]!, kidId: x.id, roomId: x.roomId, guardianId: item.input.guardianId, code: item.input.code, date: item.input.date, at: new Date().toISOString(), saving: true }))),
      ]);
      void flush();
    }
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  // Atualiza a lista quando a tela está à vista (outras recepções e salas mexem ao mesmo tempo).
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible" || queue.current.length) return;
      try {
        const r = await openCheckinsAction();
        if (r.success) setOpen((all) => [...r.data, ...all.filter((c) => c.saving)]);
      } catch {
        /* sem rede: tenta no próximo */
      }
    };
    const id = window.setInterval(tick, 20000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  /** Entrada otimista: mostra já; devolve o código que valeu (ou o mesmo, se ficou na fila). */
  async function submit(input: CheckinInput): Promise<CheckinResult> {
    const temp = input.kids.map((_, i) => `tmp-${Date.now()}-${i}`);
    const optimistic: Checkin[] = input.kids.map((x, i) => ({ id: temp[i]!, kidId: x.id, roomId: x.roomId, guardianId: input.guardianId, code: input.code, date: input.date, at: new Date().toISOString(), saving: true }));
    setOpen((all) => [...all, ...optimistic]);
    try {
      const r = await checkinAction(input);
      if (!r.success) {
        setOpen((all) => all.filter((c) => !temp.includes(c.id)));
        return { ok: false, message: r.message };
      }
      setOpen((all) => [...all.filter((c) => !temp.includes(c.id)), ...r.data.checkins]);
      return { ok: true, code: r.data.code, saving: false };
    } catch {
      queue.current = [...readQueue(), { input, temp }];
      writeQueue(queue.current);
      return { ok: true, code: input.code, saving: true };
    }
  }

  async function cancel(ids: string[]) {
    const prev = open;
    setOpen((all) => all.filter((c) => !ids.includes(c.id)));
    const r = await cancelCheckinAction(ids.filter((i) => !i.startsWith("tmp-")));
    if (!r.success) {
      setOpen(prev);
      setError(r.message);
    }
  }

  async function applySuggested() {
    setBusy(true);
    const r = await suggestedRoomsAction();
    setBusy(false);
    if (!r.success) setError(r.message);
    else window.location.reload();
  }

  const inRoom = (id: string) => open.filter((c) => c.roomId === id && c.date === today);
  const stale = open.filter((c) => c.date < today);
  const takenCodes = new Set(open.filter((c) => c.date === today).map((c) => c.code));
  const max = Math.max(1, ...days.map((d) => d.total));

  return (
    <div className={k.today}>
      <header className={k.top}>
        <Wordmark size="sm" />
        <label className={k.service}>
          <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} compact aria-label="Culto">
            <option value="">Sem culto ligado</option>
            {todays.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.startTime ? ` · ${s.startTime.replace(":00", "h").replace(":", "h")}` : ""}
              </option>
            ))}
          </Select>
        </label>
        <div className={k.mainActions}>
          <button type="button" className={`${k.big} ${k.bigIn}`} onClick={() => setMode({ t: "in" })} disabled={!activeRooms.length}>
            <LogIn size={20} strokeWidth={2.2} aria-hidden="true" />
            Entrada
          </button>
          <button type="button" className={`${k.big} ${k.bigOut}`} onClick={() => setMode({ t: "out" })}>
            <LogOut size={20} strokeWidth={2.2} aria-hidden="true" />
            Saída
          </button>
        </div>
      </header>

      {error ? (
        <p className={k.error} role="alert">
          {error}
        </p>
      ) : null}

      {!activeRooms.length ? (
        <div className={k.empty}>
          <Lamb size={96} />
          <h1>Vamos montar as salas</h1>
          <p>Cada sala tem uma faixa de idade, uma cor e um bicho. As crianças entram na sala certa sozinhas.</p>
          {canManage ? (
            <div className={k.row}>
              <button type="button" className={`${k.big} ${k.bigIn}`} onClick={applySuggested} disabled={busy}>
                {busy ? "Criando…" : "Usar salas sugeridas"}
              </button>
              <Link href="/kids/salas" className={`${k.big} ${k.bigGhost}`}>
                Montar do meu jeito
              </Link>
            </div>
          ) : (
            <p>Peça para quem gerencia Crianças criar as salas.</p>
          )}
        </div>
      ) : (
        <>
          <div className={k.rooms}>
            {activeRooms.map((r) => {
              const list = inRoom(r.id);
              const full = r.capacity !== null && list.length >= r.capacity;
              return (
                <button key={r.id} type="button" className={`${k.roomCard} ${tone(r.color)}`} onClick={() => setMode({ t: "room", id: r.id })}>
                  <RoomIcon color={r.color} animal={r.animal} />
                  <span className={k.roomName}>{r.name}</span>
                  <span className={k.roomMeta}>
                    {rangeLabel(r.minMonths, r.maxMonths)} · {list.length === 1 ? "1 criança" : `${list.length} crianças`}
                    {full ? <b className={k.full}> · Cheia</b> : null}
                  </span>
                  <span className={k.stack} aria-hidden="true">
                    {list.slice(0, 5).map((c) => {
                      const kid = byId.get(c.kidId);
                      return kid ? <KidAvatar key={c.id} name={kid.name} photoUrl={kid.photoUrl} size={32} className={c.saving ? k.savingFace : ""} /> : null;
                    })}
                    {list.length > 5 ? <span className={k.more}>+{list.length - 5}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {stale.length || canManage ? (
            <div className={k.endRow}>
              {stale.length ? (
                <p className={k.warnText}>
                  {stale.length === 1 ? "1 criança ficou sem saída" : `${stale.length} crianças ficaram sem saída`} em dias anteriores.
                </p>
              ) : null}
              <button type="button" className={k.link} onClick={() => setMode({ t: "end" })}>
                Encerrar o dia
              </button>
            </div>
          ) : null}

          <details className={k.report}>
            <summary>
              Presença das últimas semanas
              <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
            </summary>
            {days.length ? (
              <div className={k.bars} role="img" aria-label={days.map((d) => `${dayMonth(d.date)}: ${d.total}`).join(", ")}>
                {days.map((d) => (
                  <span key={d.date} className={k.barCol}>
                    <span className={`${k.bar} ${d.date === today ? k.barToday : ""}`} style={{ "--h": `${(d.total / max) * 100}%` } as CSSProperties} />
                    <span className={k.barNum}>{d.total}</span>
                    <span className={k.barDay}>{dayMonth(d.date)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className={k.muted}>As presenças aparecem aqui depois do primeiro culto.</p>
            )}
            {away.length ? (
              <>
                <h3 className={k.subhead}>Não vêm há 4 semanas</h3>
                <ul className={k.awayList}>
                  {away.map((a) => {
                    const kid = byId.get(a.id);
                    return kid ? (
                      <li key={a.id}>
                        <KidAvatar name={kid.name} photoUrl={kid.photoUrl} size={32} />
                        <span>{kid.name}</span>
                        <span className={k.muted}>Veio dia {dayMonth(a.last)}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
              </>
            ) : null}
          </details>

          <nav className={k.footLinks} aria-label="Mais de Crianças">
            <Link href="/kids/totem">
              <UiIcon icon={MonitorSmartphone} />
              Abrir o totem neste aparelho
            </Link>
            {canManage ? (
              <Link href="/kids/salas">
                <UiIcon icon={Settings2} />
                Salas
              </Link>
            ) : null}
          </nav>
        </>
      )}

      {mode?.t === "in" ? (
        <Entrada
          kids={kids}
          rooms={activeRooms}
          open={open}
          today={today}
          serviceId={serviceId || null}
          takenCodes={takenCodes}
          onSubmit={submit}
          onNewKid={(kid) => setKids((all) => [...all, kid].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))}
          onClose={close}
          theme={KIDS_THEME}
        />
      ) : null}
      {mode?.t === "out" ? <Saida kids={byId} rooms={rooms} open={open} today={today} onDone={(ids) => setOpen((all) => all.filter((c) => !ids.includes(c.id)))} onUndo={(list) => setOpen((all) => [...all, ...list])} onClose={close} theme={KIDS_THEME} /> : null}
      {mode?.t === "room"
        ? (() => {
            const room = rooms.find((r) => r.id === mode.id);
            return room ? (
              <RoomSheet
                room={room}
                rooms={rooms}
                list={open.filter((c) => c.roomId === room.id)}
                kids={byId}
                today={today}
                canManage={canManage}
                onCheckedOut={(ids) => setOpen((all) => all.filter((c) => !ids.includes(c.id)))}
                onUndo={(list) => setOpen((all) => [...all, ...list])}
                onCancel={cancel}
                onClose={close}
                theme={KIDS_THEME}
              />
            ) : null;
          })()
        : null}
      {mode?.t === "end" ? (
        <EndOfDay
          open={open}
          kids={byId}
          rooms={rooms}
          today={today}
          onOpenRoom={(id) => setMode({ t: "room", id })}
          onClose={close}
          theme={KIDS_THEME}
        />
      ) : null}
    </div>
  );
}
