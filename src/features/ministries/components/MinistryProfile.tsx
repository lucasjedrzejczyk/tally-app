"use client";

// Ficha do ministério (spec 15, A4 e A5): nome, chips do culto padrão e das funções, botão primário
// Montar escala, e abaixo a leitura em rostos ou o Editar. "Editar" e "···" só para quem gerencia.
import { useEffect, useRef, useState } from "react";
import { CalendarDays, MoreHorizontal } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import type { PersonListItem } from "@/features/sticks/types";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { meetingLabel } from "@/features/groups/domain";
import { GiveAccess } from "@/features/groups/components/GiveAccess";
import { archiveMinistryAction, updateMinistryFieldAction } from "../actions";
import { ministryRoleLabel, upcomingServices } from "../domain";
import type { MinistryDetail } from "../types";
import { MinistryEdit } from "./MinistryEdit";
import { MinistryRead } from "./MinistryRead";
import { ScheduleSheet } from "./ScheduleSheet";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";

const SAVED_MS = 1500;
type Result = { success: true; data: MinistryDetail } | { success: false; message: string };

export function MinistryProfile({
  detail,
  people,
  canManage,
  canInvite,
  isStaff,
  today,
  focusName,
  editing,
  onEditing,
  onDetail,
  onArchived,
}: {
  detail: MinistryDetail;
  people: PersonListItem[];
  canManage: boolean;
  canInvite: boolean;
  isStaff: boolean;
  today: string;
  focusName: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onDetail: (d: MinistryDetail) => void;
  onArchived: (id: string) => void;
}) {
  const id = detail.id;
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [access, setAccess] = useState(false);
  const [service, setService] = useState<{ date: string; time: string } | null>(null);
  const savedTimer = useRef<number | undefined>(undefined);
  const pending = useRef(new Set<Promise<unknown>>());
  const broken = useRef(new Set<string>());
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
  const saveField = (field: "name" | "day" | "time", raw: string): Promise<string | null> =>
    track(
      updateMinistryFieldAction(id, field, raw).then((r) => {
        if (!r.success) return r.message;
        onDetail({ ...detail, [field]: r.data.text });
        flash();
        return null;
      }),
    );
  async function applied(p: Promise<Result>): Promise<string | null> {
    const r = await track(p);
    if (!r.success) return r.message;
    onDetail(r.data);
    flash();
    return null;
  }
  function fieldState(field: string, hasError: boolean) {
    if (hasError) broken.current.add(field);
    else broken.current.delete(field);
  }
  async function finish() {
    (document.activeElement as HTMLElement | null)?.blur?.();
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
    const r = await archiveMinistryAction(id);
    close();
    if (!r.success) return void setErr(r.message);
    onArchived(id);
  }

  const when = meetingLabel(detail.day, detail.time);
  const next = upcomingServices(detail, today, 1)[0] ?? { date: today, time: detail.time };
  const leaders = detail.members
    .filter((m) => (m.role === "leader" || m.role === "co_leader") && m.access !== "has")
    .map((m) => ({ id: m.stickId, name: m.name, roles: ministryRoleLabel(m.role), access: m.access }));
  const done = <button type="button" className={styles.primary} onClick={() => void finish()}>Pronto</button>;

  return (
    <article className={styles.prof} onKeyDown={editing ? onEditKey : undefined}>
      <div className={styles.profBar}>
        <span className={`${styles.saved}${saved ? " " + styles.savedOn : ""}`} aria-live="polite">{saved ? "Salvo" : ""}</span>
        {canManage ? (editing ? done : <button type="button" className="btn ghost sm" onClick={() => onEditing(true)}>Editar</button>) : null}
        {canManage || canInvite ? (
          <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do ministério" align="right">
            {(close) => (
              <>
                {canInvite ? <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); setAccess(true); }}>Dar acesso ao líder</button> : null}
                {canManage ? <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void archive(close)}>Arquivar ministério</button> : null}
              </>
            )}
          </Popover>
        ) : null}
      </div>

      <header className={styles.ph}>
        <div className={styles.phMain}>
          <h1 className={styles.name}>{detail.name}</h1>
          {!editing && (when || detail.roles.length) ? (
            <div className={g.chips}>
              {when ? <span className={g.chip}><UiIcon icon={CalendarDays} />{when}</span> : null}
              {detail.roles.map((r) => <span key={r} className={g.chip}>{r}</span>)}
            </div>
          ) : null}
        </div>
      </header>
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}

      {editing ? null : (
        <div className={g.presenceRow}>
          <button type="button" className={styles.primary} onClick={() => (detail.roles.length && detail.members.length ? setService(next) : canManage ? onEditing(true) : undefined)}>Montar escala</button>
          {!detail.roles.length ? <span className={g.lastText}>Primeiro, as funções (ex.: Vocal, Som).</span> : !detail.members.length ? <span className={g.lastText}>Primeiro, quem serve.</span> : null}
        </div>
      )}

      <div key={editing ? "edit" : "read"} className={first.current ? undefined : styles.fade}>
        {editing ? (
          <>
            <MinistryEdit detail={detail} persons={people} focusName={focusName} onSave={saveField} onState={fieldState} track={track} onApplied={applied} />
            <div className={styles.doneRow}>{done}</div>
          </>
        ) : (
          <MinistryRead detail={detail} today={today} canManage={canManage} linkNames={isStaff} onOpen={setService} onEdit={() => onEditing(true)} />
        )}
      </div>

      {access ? <GiveAccess list={leaders} allDone="Todos os líderes deste ministério já têm acesso ao app." onClose={() => setAccess(false)} /> : null}
      {service ? <ScheduleSheet detail={detail} initial={service} today={today} onDetail={onDetail} onClose={() => setService(null)} /> : null}
    </article>
  );
}
