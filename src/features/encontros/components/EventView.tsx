"use client";

// Ficha do evento (spec 16, Fase C): dados, convite, quem serve e inscritos em rostos. No dia, tocar no
// rosto marca que chegou (selo azul); tocar de novo desfaz. Inscrição é feita pela equipe.
import { useState } from "react";
import { Check, MapPin, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { DateField } from "@/components/shared/DateField";
import { UiIcon } from "@/components/shared/UiIcon";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import type { PersonListItem } from "@/features/sticks/types";
import { firstName, isIso } from "@/features/groups/domain";
import { TextField } from "@/features/groups/components/CellEdit";
import { AddMembers } from "@/features/groups/components/AddMembers";
import { ScheduleSheet } from "@/features/ministries/components/ScheduleSheet";
import type { MinistryDetail } from "@/features/ministries/types";
import { addGuestAction, addRegistrationsAction, archiveEventAction, duplicateEventAction, removeRegistrationAction, setCheckInAction, updateEventFieldAction } from "../actions";
import { occurrenceTitle, registeredLabel, servingAt } from "../domain";
import type { EventDay } from "../types";
import { CopyInvite, ServingList } from "./Parts";
import styles from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import m from "@/features/ministries/ministries.module.css";
import e from "../encontros.module.css";

const FAIL = "Não deu para salvar. Tente de novo.";

export function EventView({
  day,
  ministries,
  people,
  today,
  canManage,
  focusName,
  editing,
  onEditing,
  onDay,
  onMinistry,
  onDuplicated,
  onArchived,
}: {
  day: EventDay;
  ministries: MinistryDetail[];
  people: PersonListItem[];
  today: string;
  canManage: boolean;
  focusName: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onDay: (fn: (d: EventDay) => EventDay) => void;
  onMinistry: (m: MinistryDetail) => void;
  onDuplicated: (d: EventDay) => void;
  onArchived: () => void;
}) {
  const ev = day.event;
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [guest, setGuest] = useState("");
  const [sheet, setSheet] = useState<MinistryDetail | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const serving = servingAt(ministries, null, ev.date, ev.time);
  const arrived = day.registrations.filter((r) => r.checkedIn).length;

  async function field(f: string, raw: string): Promise<string | null> {
    const r = await updateEventFieldAction(ev.id, f, raw);
    if (!r.success) return r.message;
    onDay(() => r.data);
    return null;
  }
  async function archive(close: () => void) {
    close();
    const r = await archiveEventAction(ev.id);
    if (!r.success) return void setErr(r.message);
    onArchived();
  }
  async function duplicate(close: () => void) {
    close();
    const r = await duplicateEventAction(ev.id);
    if (!r.success) return void setErr(r.message || FAIL);
    onDuplicated(r.data);
  }
  async function toggle(id: string, on: boolean) {
    setErr("");
    if (on) {
      setFresh((s) => new Set(s).add(id));
      try {
        navigator.vibrate?.(10);
      } catch {
        /* sem vibração */
      }
    }
    onDay((d) => ({ ...d, registrations: d.registrations.map((x) => (x.id === id ? { ...x, checkedIn: on } : x)) }));
    const r = await setCheckInAction(id, on);
    if (!r.success) {
      setErr(r.message || FAIL);
      onDay((d) => ({ ...d, registrations: d.registrations.map((x) => (x.id === id ? { ...x, checkedIn: !on } : x)) }));
    }
  }
  async function remove(id: string) {
    const r = await removeRegistrationAction(ev.id, id);
    if (!r.success) return void setErr(r.message || FAIL);
    onDay(() => r.data);
  }
  async function addGuest() {
    if (!guest.trim()) return;
    const r = await addGuestAction(ev.id, guest);
    if (!r.success) return void setErr(r.message || FAIL);
    setGuest("");
    onDay(() => r.data);
  }

  const actions = (
    <span className={e.actions}>
      {editing ? null : <CopyInvite item={ev} />}
      {canManage ? (editing ? <button type="button" className={styles.primary} onClick={() => onEditing(false)}>Pronto</button> : <button type="button" className="btn ghost sm" onClick={() => onEditing(true)}>Editar</button>) : null}
      {canManage ? (
        <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do evento" align="right">
          {(close) => (
            <>
              <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void duplicate(close)}>Duplicar evento</button>
              <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void archive(close)}>Arquivar evento</button>
            </>
          )}
        </Popover>
      ) : null}
    </span>
  );
  const head = (
    <header className={e.top}>
      <div className={e.titleRow}>
        <h1 className={styles.name}>{ev.name}</h1>
        {actions}
      </div>
      {editing ? null : (
        <div className={`${e.when} ${e.whenPlain}`}>
          <span className={e.whenText}>{occurrenceTitle(ev.date, ev.time)}</span>
          {ev.location ? <span className={e.where}><UiIcon icon={MapPin} />{ev.location}</span> : null}
        </div>
      )}
    </header>
  );

  if (editing)
    return (
      <article className={styles.prof}>
        {head}
        {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
        <section className={styles.sec} aria-label="Dados do evento">
          <div className={styles.grid}>
            <TextField label="Nome" value={ev.name} wide autoFocus={focusName} onSave={(r) => field("name", r)} onState={() => undefined} />
            <div className={styles.fld}>
              <span className={styles.fLabel}>Data</span>
              <span className={`field ${styles.dateBox}`}>
                <DateField value={ev.date} aria-label="Data do evento" onChange={(iso) => { if (isIso(iso) && iso !== ev.date) void field("date", iso).then((m) => m && setErr(m)); }} />
              </span>
            </div>
            <TextField label="Horário" value={ev.time} placeholder="19:00" onSave={(r) => field("time", r)} onState={() => undefined} />
            <TextField label="Local" value={ev.location} wide placeholder="Endereço ou sala" onSave={(r) => field("location", r)} onState={() => undefined} />
            <TextField label="Descrição" value={ev.description} wide placeholder="O que é, para quem é" onSave={(r) => field("description", r)} onState={() => undefined} />
          </div>
        </section>
        <section className={styles.sec} aria-labelledby="ed-reg">
          <h2 id="ed-reg" className={styles.secTitle}>Inscrição</h2>
          <div className={m.fnChips}>
            <button type="button" aria-pressed={ev.registration} className={`${m.fnChip}${ev.registration ? " " + m.fnOn : ""}`} onClick={() => void field("registration", ev.registration ? "0" : "1").then((x) => x && setErr(x))}>
              Com inscrição
            </button>
          </div>
          <p className={g.lastText}>A equipe inscreve e marca quem chegou no dia.</p>
          {ev.registration ? (
            <div className={styles.grid}>
              <TextField label="Limite de vagas" value={ev.capacity ? String(ev.capacity) : ""} placeholder="Sem limite" onSave={(r) => field("capacity", r)} onState={() => undefined} />
            </div>
          ) : null}
          {ev.registration && day.registrations.length ? (
            <ul className={e.plan}>
              {day.registrations.map((r) => (
                <li key={r.id} className={g.mEdit}>
                  <span className={g.mEditName}>{r.name}</span>
                  <button type="button" className="link" aria-label={`Tirar ${r.name} da inscrição`} onClick={() => void remove(r.id)}>Tirar</button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <div className={styles.doneRow}><button type="button" className={styles.primary} onClick={() => onEditing(false)}>Pronto</button></div>
      </article>
    );

  const full = Boolean(ev.capacity && day.registrations.length >= ev.capacity);
  return (
    <article className={styles.prof}>
      {head}
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
      {ev.description ? <p className={e.desc}>{ev.description}</p> : null}

      {ev.registration ? (
        <section className={styles.sec} aria-labelledby="sec-reg">
          <h2 id="sec-reg" className={styles.secTitle}>
            Inscritos ({registeredLabel(day.registrations.length, ev.capacity).replace(/ inscritos?$/, "")})
          </h2>
          {day.registrations.length ? (
            <>
              <ul className={g.faces}>
                {day.registrations.map((r) => (
                  <li key={r.id}>
                    <button type="button" className={g.face} aria-pressed={r.checkedIn} aria-label={`${r.name}${r.checkedIn ? ", chegou" : ""}`} disabled={!canManage} onClick={() => void toggle(r.id, !r.checkedIn)}>
                      <span className={g.faceAvatar}>
                        <Avatar name={r.name} photoUrl={r.photoUrl} size={56} />
                        {r.checkedIn ? <span className={`${g.tick}${fresh.has(r.id) ? " " + e.checkTick : ""}`}><Check size={12} strokeWidth={2.5} aria-hidden="true" focusable="false" /></span> : null}
                      </span>
                      <span className={g.faceName}>{firstName(r.name)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className={g.lastText} aria-live="polite">{arrived} de {day.registrations.length} chegaram</p>
            </>
          ) : (
            <p className={g.lastText}>Ninguém inscrito ainda.</p>
          )}
          {canManage && !full ? (
            <>
              <button type="button" className={`link ${g.addBtn}`} onClick={() => setAdding(true)}>Inscrever pessoas da igreja</button>
              <div className={e.guestRow}>
                <input
                  className={styles.search}
                  aria-label="Nome de quem não é da igreja"
                  placeholder="Nome de quem não é da igreja"
                  value={guest}
                  onChange={(x) => setGuest(x.target.value)}
                  onKeyDown={(x) => {
                    if (x.key === "Enter") {
                      x.preventDefault();
                      void addGuest();
                    }
                  }}
                />
                <button type="button" className="btn ghost sm" disabled={!guest.trim()} onClick={() => void addGuest()}>Inscrever</button>
              </div>
            </>
          ) : full ? (
            <p className={g.lastText}>Vagas esgotadas.</p>
          ) : null}
        </section>
      ) : null}

      {serving.length ? (
        <section className={styles.sec} aria-labelledby="sec-serving">
          <h2 id="sec-serving" className={styles.secTitle}>Quem serve</h2>
          <ServingList serving={serving} linkNames onOpen={setSheet} />
        </section>
      ) : null}

      {adding ? (
        <AddMembers
          title="Inscrever pessoas"
          allIn="Todas as pessoas já estão inscritas."
          cellId={ev.id}
          persons={people}
          cells={[]}
          memberIds={day.registrations.flatMap((r) => (r.stickId ? [r.stickId] : []))}
          onAdd={async (ids) => {
            const r = await addRegistrationsAction(ev.id, ids);
            if (!r.success) return r.message;
            onDay(() => r.data);
            return null;
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
      {sheet ? <ScheduleSheet detail={sheet} initial={{ date: ev.date, time: ev.time }} today={today} onDetail={(d) => { onMinistry(d); setSheet(d); }} onClose={() => setSheet(null)} /> : null}
    </article>
  );
}
