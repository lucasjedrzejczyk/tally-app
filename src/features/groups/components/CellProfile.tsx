"use client";

// Ficha da célula (spec 14, A4, A6 e C2): nome, chips de dia/hora e local, botão primário Marcar
// presença com o último encontro ao lado, e abaixo a leitura em rostos (CellRead) ou o formulário (CellEdit). "Editar" e "···" só para quem
// gerencia células. Cada campo do formulário salva ao sair; "Pronto" espera os salvamentos.
import { useEffect, useRef, useState } from "react";
import { CalendarDays, MapPin, MoreHorizontal } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import type { PersonListItem } from "@/features/sticks/types";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { addMembersAction, removeMemberAction, setCellArchivedAction, setMemberRoleAction, setSupervisorAction, updateCellFieldAction } from "../actions";
import { defaultMeetingDate, leadersNeedingAccess, meetingLabel, shortDate, todayIso } from "../domain";
import type { CellDetail, CellListItem } from "../types";
import { CellEdit, type SaveCellField } from "./CellEdit";
import { CellRead } from "./CellRead";
import { GiveAccess } from "./GiveAccess";
import { PresenceSheet } from "./PresenceSheet";
import styles from "@/features/sticks/people.module.css";
import g from "../groups.module.css";

const SAVED_MS = 1500;

export function CellProfile({
  detail,
  people,
  cells,
  canManage,
  canInvite,
  isStaff,
  focusName,
  editing,
  onEditing,
  onDetail,
  onPatch,
  onMoved,
  onArchived,
}: {
  detail: CellDetail;
  people: PersonListItem[];
  cells: CellListItem[];
  canManage: boolean;
  canInvite: boolean;
  isStaff: boolean;
  focusName: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onDetail: (d: CellDetail) => void;
  onPatch: (id: string, fields: Partial<Pick<CellDetail, "name" | "day" | "time" | "location">>) => void;
  onMoved: (ids: string[]) => void;
  onArchived: (id: string) => void;
}) {
  const id = detail.id;
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [access, setAccess] = useState(false);
  const [presence, setPresence] = useState<string | null>(null); // data aberta no Marcar presença
  const savedTimer = useRef<number | undefined>(undefined);
  // Salvamentos em andamento e campos com erro: "Pronto" só volta para a leitura sem pendência.
  const pending = useRef(new Set<Promise<unknown>>());
  const broken = useRef(new Set<string>());
  // Só a troca Leitura/Editar faz o fade; abrir outra célula aparece sem animação.
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
    return () => window.clearTimeout(savedTimer.current);
  }, []);

  function flash() {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), SAVED_MS);
  }
  function track<T>(p: Promise<T>): Promise<T> {
    pending.current.add(p);
    const drop = () => void pending.current.delete(p);
    p.then(drop, drop);
    return p;
  }

  const saveField: SaveCellField = (field, raw) =>
    track(
      updateCellFieldAction(id, field, raw).then((r) => {
        if (!r.success) return r.message;
        onPatch(id, { [field]: r.data.text });
        flash();
        return null;
      }),
    );
  // Ações de membros e liderança devolvem a ficha nova; a tela só a guarda.
  async function applied(p: Promise<{ success: true; data: CellDetail } | { success: false; message: string }>, moved: string[] = []): Promise<string | null> {
    const r = await p;
    if (!r.success) return r.message;
    onDetail(r.data);
    if (moved.length) onMoved(moved);
    flash();
    return null;
  }
  function addMembers(ids: string[]) {
    const moved = [...new Set(people.filter((p) => ids.includes(p.id)).flatMap((p) => p.groupIds).filter((g) => g !== id))];
    return track(applied(addMembersAction(id, ids), moved));
  }
  function fieldState(field: string, hasError: boolean) {
    if (hasError) broken.current.add(field);
    else broken.current.delete(field);
  }
  async function finish() {
    (document.activeElement as HTMLElement | null)?.blur?.(); // o campo aberto salva ao perder o foco
    do {
      await new Promise((r) => setTimeout(r, 0));
      await Promise.all([...pending.current]);
    } while (pending.current.size > 0);
    if (broken.current.size === 0) onEditing(false);
  }
  function onEditKey(e: React.KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest('[role="dialog"], [role="menu"]')) return;
    e.preventDefault();
    void finish();
  }

  async function archive(close: () => void) {
    const r = await setCellArchivedAction(id, true);
    close();
    if (!r.success) return void setErr(r.message);
    onArchived(id);
  }

  const when = meetingLabel(detail.day, detail.time);
  const last = detail.sessions.at(-1);
  const lastText = last ? `Último: ${shortDate(last.date).toLowerCase()}, ${last.cancelled ? "não teve encontro" : `${last.present} de ${last.of}`}` : "";
  const done = <button type="button" className={styles.primary} onClick={() => void finish()}>Pronto</button>;

  return (
    <article className={styles.prof} onKeyDown={editing ? onEditKey : undefined}>
      <div className={styles.profBar}>
        <span className={`${styles.saved}${saved ? " " + styles.savedOn : ""}`} aria-live="polite">{saved ? "Salvo" : ""}</span>
        {canManage ? (editing ? done : <button type="button" className="btn ghost sm" onClick={() => onEditing(true)}>Editar</button>) : null}
        {canManage || canInvite ? (
          <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações da célula" align="right">
            {(close) => (
              <>
                {canInvite ? (
                  <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); setAccess(true); }}>Dar acesso ao líder</button>
                ) : null}
                {canManage ? <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void archive(close)}>Arquivar célula</button> : null}
              </>
            )}
          </Popover>
        ) : null}
      </div>

      <header className={styles.ph}>
        <div className={styles.phMain}>
          <h1 className={styles.name}>{detail.name}</h1>
          {!editing && (when || detail.location) ? (
            <div className={g.chips}>
              {when ? <span className={g.chip}><UiIcon icon={CalendarDays} />{when}</span> : null}
              {detail.location ? (
                <a className={g.chip} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detail.location)}`} target="_blank" rel="noreferrer">
                  <UiIcon icon={MapPin} />{detail.location}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}

      {editing ? null : (
        <div className={g.presenceRow}>
          <button type="button" className={styles.primary} onClick={() => setPresence(defaultMeetingDate(detail.day, todayIso()))}>Marcar presença</button>
          {lastText ? <span className={g.lastText}>{lastText}</span> : null}
        </div>
      )}

      <div key={editing ? "edit" : "read"} className={first.current ? undefined : styles.fade}>
        {editing ? (
          <>
            <CellEdit
              detail={detail}
              persons={people}
              cells={cells}
              focusName={focusName}
              onSave={saveField}
              onState={fieldState}
              track={track}
              onSupervisor={(stickId) => track(applied(setSupervisorAction(id, stickId)))}
              onAdd={addMembers}
              onRole={(stickId, role) => track(applied(setMemberRoleAction(id, stickId, role)))}
              onRemove={(stickId) => track(applied(removeMemberAction(id, stickId)))}
            />
            <div className={styles.doneRow}>{done}</div>
          </>
        ) : (
          <CellRead detail={detail} canManage={canManage} linkNames={isStaff} onPresence={setPresence} onEdit={() => onEditing(true)} />
        )}
      </div>

      {access ? <GiveAccess list={leadersNeedingAccess(detail)} allDone="Todos os líderes e o supervisor desta célula já têm acesso ao app." onClose={() => setAccess(false)} /> : null}

      {presence ? (
        <PresenceSheet
          groupId={id}
          members={detail.members}
          initialDate={presence}
          onClose={() => setPresence(null)}
          onSaved={(d) => {
            onDetail(d);
            setPresence(null);
            flash();
          }}
        />
      ) : null}
    </article>
  );
}
