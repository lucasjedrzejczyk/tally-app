"use client";

// Encerrar o dia (spec 18, B4): quem ainda não saiu, por sala, em coral. Tocar na sala abre a sala
// (lá o gestor faz a saída sem código ou "Entrou por engano").
import { Sheet } from "@/features/groups/components/Sheet";
import { dayMonth } from "@/features/groups/domain";
import type { Checkin, Kid, Room } from "../types";
import { RoomIcon, KidAvatar } from "./Parts";
import k from "../kids.module.css";

export function EndOfDay({ open, kids, rooms, today, onOpenRoom, onClose, theme }: { open: Checkin[]; kids: Map<string, Kid>; rooms: Room[]; today: string; onOpenRoom: (id: string) => void; onClose: () => void; theme: string }) {
  const still = open.filter((c) => !c.saving);
  const byRoom = rooms.map((r) => ({ r, list: still.filter((c) => c.roomId === r.id) })).filter((x) => x.list.length);
  return (
    <Sheet title="Encerrar o dia" onClose={onClose} className={theme}>
      {!still.length ? (
        <p className={k.muted}>Todas as crianças já saíram. Pode encerrar.</p>
      ) : (
        <div className={k.flow}>
          <p className={k.warnText}>{still.length === 1 ? "1 criança ainda não saiu." : `${still.length} crianças ainda não saíram.`}</p>
          {byRoom.map(({ r, list }) => (
            <button key={r.id} type="button" className={k.endRoom} onClick={() => onOpenRoom(r.id)}>
              <RoomIcon color={r.color} animal={r.animal} size="sm" />
              <b>{r.name}</b>
              <span className={k.endFaces}>
                {list.map((c) => {
                  const kid = kids.get(c.kidId);
                  return kid ? (
                    <span key={c.id} className={k.endKid}>
                      <KidAvatar name={kid.name} photoUrl={kid.photoUrl} size={24} />
                      {kid.name.split(" ")[0]}
                      {c.date < today ? <span className={k.muted}> desde {dayMonth(c.date)}</span> : null}
                    </span>
                  ) : null;
                })}
              </span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
