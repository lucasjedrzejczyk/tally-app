"use client";

// Sala aberta (spec 18, A5): grade de rostos com selos (alergia, aniversário, sem foto, bloqueio).
// Tocar no rosto abre a ficha curta: responsáveis, alergias e cuidados, quem pode e quem não pode
// buscar, "Chamar responsável" (WhatsApp pronto), Saída sem código (gestor) e "Entrou por engano".
import { useState } from "react";
import { ChevronLeft, MessageCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { Sheet } from "@/features/groups/components/Sheet";
import { waLink } from "@/features/ministries/domain";
import { ageLabel, ageMonths, birthdayThisWeek, callGuardianMessage, formatPhone } from "../domain";
import type { Checkin, Kid, Room } from "../types";
import { KidFace, RoomIcon, badgesText } from "./Parts";
import { Pickup } from "./Pickup";
import k from "../kids.module.css";

export function RoomSheet({
  room,
  rooms,
  list,
  kids,
  today,
  canManage,
  onCheckedOut,
  onUndo,
  onCancel,
  onClose,
  theme,
}: {
  room: Room;
  rooms: Room[];
  list: Checkin[];
  kids: Map<string, Kid>;
  today: string;
  canManage: boolean;
  onCheckedOut: (ids: string[]) => void;
  onUndo: (list: Checkin[]) => void;
  onCancel: (ids: string[]) => void;
  onClose: () => void;
  theme: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const c = list.find((x) => x.id === sel) ?? null;
  const kid = c ? kids.get(c.kidId) : null;

  const heading = (
    <span className={k.sheetTitle}>
      <RoomIcon color={room.color} animal={room.animal} size="sm" />
      {room.name}
      <span className={k.muted}>{list.length === 1 ? "1 criança" : `${list.length} crianças`}</span>
    </span>
  );
  const back = c ? (
    <button type="button" className="iconbtn" aria-label="Voltar para a sala" onClick={() => (setSel(null), setLeaving(false))}>
      <UiIcon icon={ChevronLeft} />
    </button>
  ) : null;

  return (
    <Sheet title={room.name} heading={c && kid ? kid.name : heading} headExtra={back} onClose={onClose} tall className={theme}>
      {!c || !kid ? (
        list.length ? (
          <ul className={k.faceGrid}>
            {list.map((x) => {
              const kd = kids.get(x.kidId);
              if (!kd) return null;
              const extra = badgesText(kd, today);
              return (
                <li key={x.id}>
                  <button type="button" className={k.faceBtn} onClick={() => setSel(x.id)} aria-label={`${kd.name}${extra ? `, ${extra}` : ""}`} disabled={x.saving}>
                    <KidFace kid={kd} today={today} size={56} />
                    <b>{kd.name.split(" ")[0]}</b>
                    <span>{x.saving ? "Salvando" : kd.birth ? ageLabel(ageMonths(kd.birth, today)) : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={k.muted}>Ninguém nesta sala ainda.</p>
        )
      ) : leaving ? (
        <Pickup
          list={[c]}
          kids={kids}
          rooms={rooms}
          today={today}
          withoutCode
          onDone={onCheckedOut}
          onUndo={onUndo}
          onFinished={() => (setSel(null), setLeaving(false))}
        />
      ) : (
        <KidCard
          kid={kid}
          checkin={c}
          room={room}
          today={today}
          canManage={canManage}
          onLeave={() => setLeaving(true)}
          onCancel={() => {
            onCancel([c.id]);
            setSel(null);
          }}
        />
      )}
    </Sheet>
  );
}

function KidCard({ kid, checkin, room, today, canManage, onLeave, onCancel }: { kid: Kid; checkin: Checkin; room: Room; today: string; canManage: boolean; onLeave: () => void; onCancel: () => void }) {
  const guardian = kid.guardians.find((g) => g.id === checkin.guardianId) ?? kid.guardians[0];
  const bday = birthdayThisWeek(kid.birth, today);
  const call = guardian?.phone ? waLink(guardian.phone, callGuardianMessage(guardian.name, room.name, kid.name)) : "";
  return (
    <div className={k.flow}>
      <div className={k.kidHead}>
        <KidFace kid={kid} today={today} size={56} />
        <div>
          <p className={k.muted}>
            {kid.birth ? ageLabel(ageMonths(kid.birth, today)) : "Sem data de nascimento"} · código {checkin.code}
          </p>
          {bday ? <p className={k.cakeLine}>{bday}</p> : null}
        </div>
      </div>

      {kid.pickupBlocked ? (
        <p className={k.blockedLine}>
          <ShieldAlert size={18} strokeWidth={2.2} aria-hidden="true" />
          <span>
            <b>Não pode buscar:</b> {kid.pickupBlocked}
          </span>
        </p>
      ) : null}
      {kid.allergies ? (
        <p className={k.allergyLine}>
          <TriangleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
          Alergia: {kid.allergies}
        </p>
      ) : null}

      <dl className={k.facts}>
        <div>
          <dt>Responsáveis</dt>
          <dd>
            {kid.guardians.length
              ? kid.guardians.map((g) => (
                  <span key={g.id}>
                    {g.name}
                    {g.phone ? <span className={k.muted}> · {formatPhone(g.phone)}</span> : null}
                  </span>
                ))
              : "Sem responsável cadastrado"}
          </dd>
        </div>
        {kid.careNotes ? (
          <div>
            <dt>Cuidados</dt>
            <dd>{kid.careNotes}</dd>
          </div>
        ) : null}
        {kid.authorizedPickup ? (
          <div>
            <dt>Também podem buscar</dt>
            <dd>{kid.authorizedPickup}</dd>
          </div>
        ) : null}
        {!kid.photoOk ? (
          <div>
            <dt>Fotos</dt>
            <dd>Não pode aparecer em fotos</dd>
          </div>
        ) : null}
      </dl>

      <div className={k.row}>
        {call ? (
          <a className={`${k.big} ${k.bigWa}`} href={call} target="_blank" rel="noreferrer">
            <MessageCircle size={18} strokeWidth={2.2} aria-hidden="true" />
            Chamar responsável
          </a>
        ) : null}
        {canManage ? (
          <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={onLeave}>
            Saída sem código
          </button>
        ) : null}
      </div>
      <button type="button" className={k.link} onClick={onCancel}>
        Entrou por engano
      </button>
    </div>
  );
}
