"use client";

// Salas (spec 18, D1): lista com cor, bicho, faixa de idade e capacidade; editar num painel;
// ordem por setas (sem arrastar, igual à ordem do culto). Idade em anos na tela, meses no banco.
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, Plus } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { moveRoomAction, saveRoomAction, suggestedRoomsAction, type RoomInput } from "../actions";
import { rangeLabel, ROOM_ANIMALS, ROOM_COLORS, type RoomColor } from "../domain";
import type { Room } from "../types";
import { ANIMAL_ICON, ANIMAL_LABEL } from "./Brand";
import { RoomIcon, tone } from "./Parts";
import k from "../kids.module.css";
import a from "../rooms.module.css";

const COLOR_LABEL: Record<RoomColor, string> = { sol: "Sol", coral: "Coral", ceu: "Céu", folha: "Folha" };
const blank: RoomInput = { name: "", color: "sol", animal: "rabbit", minMonths: 0, maxMonths: 35, capacity: null, active: true };

export function RoomsAdmin({ rooms }: { rooms: Room[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(p: Promise<{ success: boolean; message?: string }>) {
    setBusy(true);
    setError("");
    const r = await p;
    setBusy(false);
    if (!r.success) setError(r.message ?? "Não deu para salvar.");
    else window.location.reload();
  }

  return (
    <div className={a.wrap}>
      <header className={a.head}>
        <Link href="/kids" className={a.backLink}>
          <UiIcon icon={ChevronLeft} />
          Crianças
        </Link>
        <h1>Salas</h1>
        <button type="button" className={`${k.big} ${k.bigIn}`} onClick={() => setEditing("new")}>
          <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
          Nova sala
        </button>
      </header>
      {error ? (
        <p className={k.error} role="alert">
          {error}
        </p>
      ) : null}

      {!rooms.length && editing !== "new" ? (
        <div className={k.empty}>
          <p>Ainda não há salas. Comece pelas sugeridas (Berçário, Maternal, Kids e Juniores) e ajuste depois.</p>
          <button type="button" className={`${k.big} ${k.bigIn}`} disabled={busy} onClick={() => run(suggestedRoomsAction())}>
            Usar salas sugeridas
          </button>
        </div>
      ) : null}

      {editing === "new" ? <RoomForm initial={blank} busy={busy} onCancel={() => setEditing(null)} onSave={(r) => run(saveRoomAction(null, r))} /> : null}

      <ul className={a.list}>
        {rooms.map((r, i) =>
          editing === r.id ? (
            <li key={r.id}>
              <RoomForm initial={r} busy={busy} onCancel={() => setEditing(null)} onSave={(v) => run(saveRoomAction(r.id, v))} />
            </li>
          ) : (
            <li key={r.id} className={`${a.item} ${r.active ? "" : a.off}`}>
              <button type="button" className={a.open} onClick={() => setEditing(r.id)}>
                <RoomIcon color={r.color} animal={r.animal} />
                <span className={a.text}>
                  <b>{r.name}</b>
                  <span>
                    {rangeLabel(r.minMonths, r.maxMonths)}
                    {r.capacity ? ` · até ${r.capacity}` : ""}
                    {r.active ? "" : " · Desativada"}
                  </span>
                </span>
              </button>
              <span className={a.moves}>
                <button type="button" className="iconbtn" aria-label={`Subir ${r.name}`} disabled={busy || i === 0} onClick={() => run(moveRoomAction(r.id, -1))}>
                  <UiIcon icon={ArrowUp} />
                </button>
                <button type="button" className="iconbtn" aria-label={`Descer ${r.name}`} disabled={busy || i === rooms.length - 1} onClick={() => run(moveRoomAction(r.id, 1))}>
                  <UiIcon icon={ArrowDown} />
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function RoomForm({ initial, busy, onSave, onCancel }: { initial: RoomInput; busy: boolean; onSave: (r: RoomInput) => void; onCancel: () => void }) {
  const [r, setR] = useState<RoomInput>(initial);
  const [fromY, setFromY] = useState(String(Math.floor(initial.minMonths / 12)));
  const [toY, setToY] = useState(String(Math.floor(initial.maxMonths / 12)));
  const [cap, setCap] = useState(initial.capacity ? String(initial.capacity) : "");
  const num = (v: string) => Math.max(0, Math.min(17, parseInt(v.replace(/\D/g, ""), 10) || 0));

  return (
    <form
      className={`${a.form} ${tone(r.color)}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...r, minMonths: num(fromY) * 12, maxMonths: num(toY) * 12 + 11, capacity: cap ? parseInt(cap, 10) || null : null });
      }}
    >
      <div className={a.preview}>
        <RoomIcon color={r.color} animal={r.animal} size="lg" />
        <label className={k.field}>
          <span>Nome</span>
          <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} autoFocus maxLength={60} />
        </label>
      </div>
      <div>
        <h3 className={k.subhead}>Cor</h3>
        <div className={k.chips}>
          {ROOM_COLORS.map((c) => (
            <button key={c} type="button" className={`${a.swatch} ${tone(c)}`} aria-pressed={r.color === c} onClick={() => setR({ ...r, color: c })}>
              {COLOR_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className={k.subhead}>Bicho</h3>
        <div className={a.animals}>
          {ROOM_ANIMALS.map((an) => {
            const Icon = ANIMAL_ICON[an];
            return (
              <button key={an} type="button" className={a.animal} aria-pressed={r.animal === an} aria-label={ANIMAL_LABEL[an]} title={ANIMAL_LABEL[an]} onClick={() => setR({ ...r, animal: an })}>
                <Icon size={26} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      <div className={a.ages}>
        <label className={k.field}>
          <span>De (anos)</span>
          <input inputMode="numeric" value={fromY} onChange={(e) => setFromY(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
        <label className={k.field}>
          <span>Até (anos)</span>
          <input inputMode="numeric" value={toY} onChange={(e) => setToY(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
        <label className={k.field}>
          <span>Capacidade</span>
          <input inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Sem limite" />
        </label>
      </div>
      <button type="button" className={k.chip} aria-pressed={r.active} onClick={() => setR({ ...r, active: !r.active })}>
        {r.active ? "Sala ativa" : "Sala desativada"}
      </button>
      <div className={k.row}>
        <button type="submit" className={`${k.big} ${k.bigIn}`} disabled={busy || !r.name.trim()}>
          {busy ? "Salvando…" : "Pronto"}
        </button>
        <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
