"use client";

// Entrega (spec 18, B3): os rostos de quem vai sair, "Quem buscou?" (responsáveis, autorizados ou
// outra pessoa) e Entregar. Se quem busca bate com o "não pode buscar" da ficha, a tela trava em
// coral e não deixa seguir (o servidor confere de novo). Entregue mostra "Desfazer" por 5 s.
import { useEffect, useRef, useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { checkoutAction, undoCheckoutAction } from "../actions";
import { BLOCKED, matchesBlocked } from "../domain";
import type { Checkin, Kid, Room } from "../types";
import { KidFace, RoomIcon, buzz } from "./Parts";
import k from "../kids.module.css";

const UNDO_MS = 5000;

export function Pickup({
  list,
  kids,
  rooms,
  today,
  withoutCode,
  onDone,
  onUndo,
  onFinished,
}: {
  list: Checkin[];
  kids: Map<string, Kid>;
  rooms: Room[];
  today: string;
  withoutCode?: boolean;
  onDone: (ids: string[]) => void;
  onUndo: (list: Checkin[]) => void;
  onFinished: () => void;
}) {
  const people = list.map((c) => kids.get(c.kidId)).filter((x): x is Kid => Boolean(x));
  const guardians = people[0]?.guardians ?? [];
  const authorized = [...new Set(people.flatMap((p) => p.authorizedPickup.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)))];
  const blocked = people.map((p) => p.pickupBlocked).filter(Boolean);
  const brought = list[0]?.guardianId ?? null;

  const [who, setWho] = useState<string>(guardians.find((g) => g.id === brought)?.name ?? guardians[0]?.name ?? "");
  const [other, setOther] = useState(false);
  const [state, setState] = useState<"pick" | "busy" | "blocked" | "done">("pick");
  const [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function deliver() {
    const name = who.trim();
    if (!name) return setError("Diga quem buscou.");
    if (blocked.some((b) => matchesBlocked(name, b))) {
      buzz([200, 80, 200]);
      return setState("blocked");
    }
    setState("busy");
    setError("");
    const ids = list.map((c) => c.id);
    try {
      const r = await checkoutAction(ids, name, Boolean(withoutCode));
      if (!r.success) {
        if (r.message === BLOCKED) {
          buzz([200, 80, 200]);
          return setState("blocked");
        }
        setState("pick");
        return setError(r.message);
      }
    } catch {
      setState("pick");
      return setError("Sem internet agora. Confira o código de novo quando a rede voltar.");
    }
    buzz();
    onDone(ids);
    setState("done");
    timer.current = window.setTimeout(onFinished, UNDO_MS);
  }

  async function undo() {
    window.clearTimeout(timer.current);
    const r = await undoCheckoutAction(list.map((c) => c.id));
    if (r.success) {
      onUndo(list);
      setState("pick");
    } else setError(r.message);
  }

  if (state === "blocked") {
    return (
      <div className={k.blocked} role="alert">
        <ShieldAlert size={48} strokeWidth={2} aria-hidden="true" />
        <h3>Não entregue. Chame a liderança.</h3>
        <p>
          {who.trim()} está na lista de quem não pode buscar {people.length > 1 ? "estas crianças" : people[0]?.name.split(" ")[0]}.
        </p>
        <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={onFinished}>
          Entendi
        </button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className={k.delivered} role="status">
        <span className={k.doneMark} aria-hidden="true">
          <Check size={36} strokeWidth={3} />
        </span>
        <h3>Entregue</h3>
        <p className={k.muted}>
          {people.map((p) => p.name.split(" ")[0]).join(" e ")} com {who.trim()}
        </p>
        <div className={k.row}>
          <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={undo}>
            Desfazer
          </button>
          <button type="button" className={`${k.big} ${k.bigOut}`} onClick={() => (window.clearTimeout(timer.current), onFinished())}>
            Próximo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={k.flow}>
      <ul className={k.leaving}>
        {list.map((c) => {
          const kid = kids.get(c.kidId);
          const room = rooms.find((r) => r.id === c.roomId);
          return kid ? (
            <li key={c.id}>
              <KidFace kid={kid} today={today} size={56} />
              <b>{kid.name.split(" ")[0]}</b>
              {room ? (
                <span className={k.roomTag}>
                  <RoomIcon color={room.color} animal={room.animal} size="sm" />
                  {room.name}
                </span>
              ) : null}
            </li>
          ) : null;
        })}
      </ul>

      <div>
        <h3 className={k.subhead}>Quem buscou?</h3>
        <div className={k.chips}>
          {guardians.map((g) => (
            <button key={g.id} type="button" className={k.chip} aria-pressed={!other && who === g.name} onClick={() => (setOther(false), setWho(g.name))}>
              {g.name}
            </button>
          ))}
          {authorized.map((a) => (
            <button key={a} type="button" className={k.chip} aria-pressed={!other && who === a} onClick={() => (setOther(false), setWho(a))}>
              {a}
            </button>
          ))}
          <button type="button" className={k.chip} aria-pressed={other} onClick={() => (setOther(true), setWho(""))}>
            Outra pessoa
          </button>
        </div>
        {other ? (
          <label className={k.field}>
            <span>Nome de quem buscou</span>
            <input value={who} onChange={(e) => setWho(e.target.value)} autoFocus maxLength={120} autoComplete="off" />
          </label>
        ) : null}
        {withoutCode ? <p className={k.notice}>Saída sem código fica registrada com o seu nome.</p> : null}
      </div>

      {error ? (
        <p className={k.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className={`${k.big} ${k.bigOut} ${k.wide}`} disabled={state === "busy" || !who.trim()} onClick={deliver}>
        {state === "busy" ? "Entregando…" : "Entregar"}
      </button>
    </div>
  );
}
