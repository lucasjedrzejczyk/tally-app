"use client";

// Ficha do acompanhamento (spec 17, Fase B). Leitura: nome com WhatsApp/Editar/···, motivo, chips
// (status, responsável, sigiloso com quem vê), próximo passo, status segmentado com a pílula
// deslizando (Concluir tem Desfazer), registrar contato (no celular: botão fixo no rodapé que abre a
// folha), nota interna e a linha do tempo. Editar fica separado e salva cada campo ao sair.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, MessageCircle, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { DateField } from "@/components/shared/DateField";
import { UiIcon } from "@/components/shared/UiIcon";
import { Popover } from "@/features/study/components/Popover";
import { MenuItem } from "@/features/study/components/FilterChips";
import studyStyles from "@/features/study/study.module.css";
import { whatsappLink } from "@/features/sticks/domain";
import { isIso, shortDate } from "@/features/groups/domain";
import { TextField } from "@/features/groups/components/CellEdit";
import { Sheet } from "@/features/groups/components/Sheet";
import { addContactAction, addNoteAction, deleteCareAction, setCareStatusAction, updateCareFieldAction, type CareField } from "../actions";
import { GROUP_LABEL, statusGroup } from "../domain";
import type { CareDetail, ContactKind, StaffOption, StatusGroup } from "../types";
import { ContactForm, Timeline } from "./Parts";
import people from "@/features/sticks/people.module.css";
import m from "@/features/ministries/ministries.module.css";
import e from "@/features/encontros/encontros.module.css";
import c from "../care.module.css";

const GROUPS: StatusGroup[] = ["open", "waiting", "done"];
const UNDO_MS = 5000;
const SECRET = "Só você, quem abriu e a pastoral veem este caso";
const KIND_KEY = "mercy.care.kind";

function buzz() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* sem vibração */
  }
}
function lastKind(): ContactKind {
  try {
    const v = window.localStorage.getItem(KIND_KEY);
    if (v === "visit" || v === "call" || v === "whatsapp" || v === "talk") return v;
  } catch {
    /* sem armazenamento */
  }
  return "visit";
}

export function CareProfile({
  detail,
  staff,
  me,
  canManage,
  today,
  focusReason,
  editing,
  onEditing,
  onDetail,
  onDeleted,
}: {
  detail: CareDetail;
  staff: StaffOption[];
  me: string;
  canManage: boolean;
  today: string;
  focusReason: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onDetail: (d: CareDetail) => void;
  onDeleted: (id: string) => void;
}) {
  const id = detail.id;
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<ContactKind>("visit");
  const [sheet, setSheet] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const [undo, setUndo] = useState<StatusGroup | null>(null);
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setKind(lastKind());
    return () => window.clearTimeout(undoTimer.current);
  }, []);

  const group = statusGroup(detail.status);
  const phone = whatsappLink(detail.phone);

  function pickKind(k: ContactKind) {
    setKind(k);
    try {
      window.localStorage.setItem(KIND_KEY, k);
    } catch {
      /* sem armazenamento */
    }
  }
  function took(r: { success: true; data: CareDetail } | { success: false; message: string }): string | null {
    if (!r.success) return r.message;
    onDetail(r.data);
    return null;
  }
  async function field(f: CareField, raw: string): Promise<string | null> {
    return took(await updateCareFieldAction(id, f, raw));
  }
  async function status(to: StatusGroup, viaUndo = false) {
    if (to === group) return;
    setErr("");
    const from = group;
    onDetail({ ...detail, status: to === "open" ? "in_progress" : to === "waiting" ? "waiting" : "resolved" });
    if (to === "done") buzz();
    const msg = took(await setCareStatusAction(id, to));
    if (msg) {
      setErr(msg);
      onDetail(detail);
      return;
    }
    window.clearTimeout(undoTimer.current);
    if (to === "done" && !viaUndo) {
      setUndo(from);
      undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS);
    } else setUndo(null);
  }
  async function contact(text: string): Promise<string | null> {
    const before = new Set(detail.timeline.map((t) => t.id));
    const r = await addContactAction(id, kind, text);
    if (!r.success) return r.message;
    setNewId(r.data.timeline.find((t) => !before.has(t.id))?.id ?? null);
    onDetail(r.data);
    return null;
  }
  async function addNote() {
    if (!note.trim()) return;
    const before = new Set(detail.timeline.map((t) => t.id));
    const r = await addNoteAction(id, note);
    if (!r.success) return void setErr(r.message);
    setNote("");
    setNoting(false);
    setNewId(r.data.timeline.find((t) => !before.has(t.id))?.id ?? null);
    onDetail(r.data);
  }
  async function remove(close: () => void) {
    close();
    const r = await deleteCareAction(id);
    if (!r.success) return void setErr(r.message);
    onDeleted(id);
  }

  const actions = (
    <span className={e.actions}>
      {!editing && phone ? (
        <a className={`btn ghost sm ${c.btnLink}`} href={phone} target="_blank" rel="noreferrer" aria-label="WhatsApp"><UiIcon icon={MessageCircle} /><span className={c.waText}>WhatsApp</span></a>
      ) : null}
      {editing ? <button type="button" className={people.primary} onClick={() => onEditing(false)}>Pronto</button> : <button type="button" className="btn ghost sm" onClick={() => onEditing(true)}>Editar</button>}
      {canManage ? (
        <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do acompanhamento" align="right">
          {(close) => <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void remove(close)}>Excluir acompanhamento</button>}
        </Popover>
      ) : null}
    </span>
  );
  const head = (
    <header className={e.top}>
      <div className={e.titleRow}>
        <h1 className={people.name}>{detail.stickId ? <Link className={c.nameLink} href={`/people?p=${detail.stickId}`}>{detail.name}</Link> : detail.name}</h1>
        {actions}
      </div>
    </header>
  );

  if (editing) {
    const resp = staff.find((s) => s.id === detail.assignedTo);
    return (
      <article className={people.prof}>
        {head}
        {err ? <p className={people.fErr} role="alert">{err}</p> : null}
        <section className={people.sec} aria-label="Dados do acompanhamento">
          <div className={people.grid}>
            <TextField label="Motivo" value={detail.reason} wide autoFocus={focusReason} placeholder="Por que estamos acompanhando" onSave={(r) => field("reason", r)} onState={() => undefined} />
            <div className={`${people.fld} ${people.fldWide}`}>
              <span className={people.fLabel}>Responsável</span>
              <Popover trigger={<>{resp ? <Avatar name={resp.name} size={24} /> : null}{resp?.name ?? "Ninguém"}</>} triggerClass={`${studyStyles.chipBtn} ${c.respBtn}`} label="Responsável">
                {(close) => (
                  <div className={studyStyles.popList}>
                    {staff.map((s) => (
                      <MenuItem key={s.id} on={s.id === detail.assignedTo} onClick={() => { close(); void field("assignedTo", s.id).then((x) => x && setErr(x)); }}>
                        {s.id === me ? `${s.name} (você)` : s.name}
                      </MenuItem>
                    ))}
                  </div>
                )}
              </Popover>
            </div>
            <div className={`${people.fld} ${people.fldWide}`}>
              <div className={m.fnChips}>
                <button type="button" aria-pressed={detail.confidential} className={`${m.fnChip} ${c.kind}${detail.confidential ? " " + m.fnOn : ""}`} onClick={() => void field("confidential", detail.confidential ? "0" : "1").then((x) => x && setErr(x))}>
                  <UiIcon icon={Lock} />Sigiloso
                </button>
              </div>
              <span className={people.fHint}>{detail.confidential ? SECRET : "Toda a equipe com acesso ao Cuidado vê este caso"}</span>
            </div>
            <TextField label="Próximo passo" value={detail.nextStep} placeholder="Visitar na quinta" onSave={(r) => field("nextStep", r)} onState={() => undefined} />
            <div className={people.fld}>
              <span className={people.fLabel}>Data do próximo passo</span>
              <span className={`field ${people.dateBox}`}>
                <DateField value={detail.nextDate} aria-label="Data do próximo passo" onChange={(iso) => { if ((iso === "" || isIso(iso)) && iso !== detail.nextDate) void field("nextDate", iso).then((x) => x && setErr(x)); }} />
              </span>
            </div>
          </div>
        </section>
        <div className={people.doneRow}><button type="button" className={people.primary} onClick={() => onEditing(false)}>Pronto</button></div>
      </article>
    );
  }

  const at = GROUPS.indexOf(group);
  return (
    <article className={`${people.prof} ${c.prof}`}>
      {head}
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
      <p className={c.why}>{detail.reason || <span className={c.muted}>Sem motivo ainda</span>}</p>
      <p className={c.meta}>
        {detail.assignedName ? `Com ${detail.assignedName}` : "Sem responsável"}
        {detail.confidential ? <span className={c.metaLock}><UiIcon icon={Lock} />Sigiloso</span> : null}
      </p>
      {detail.confidential ? <p className={c.secret}>{SECRET}</p> : null}

      <div className={c.next}>
        {detail.nextStep ? (
          <p className={c.nextText}>
            <span className={c.nextLabel}>Próximo passo</span>
            {detail.nextStep}
            {detail.nextDate ? <span className={c.muted}> · {shortDate(detail.nextDate).toLowerCase()}</span> : null}
          </p>
        ) : (
          <button type="button" className="link" onClick={() => onEditing(true)}>Definir próximo passo</button>
        )}
      </div>

      <div className={c.seg} role="radiogroup" aria-label="Situação">
        <span className={c.segPill} style={{ "--i": at } as React.CSSProperties} aria-hidden="true" />
        {GROUPS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === group} className={c.segBtn} onClick={() => void status(s)}>{GROUP_LABEL[s]}</button>
        ))}
      </div>
      {undo ? (
        <p className={c.undo} role="status">
          Concluído.
          <button type="button" className="btn ghost sm" onClick={() => void status(undo, true)}>Desfazer</button>
        </p>
      ) : null}

      <section className={`${people.sec} ${c.inlineOnly}`} aria-labelledby="sec-contact">
        <h2 id="sec-contact" className={people.secTitle}>Registrar contato</h2>
        <ContactForm kind={kind} onKind={pickKind} onSave={contact} />
      </section>

      <section className={people.sec} aria-labelledby="sec-tl">
        <div className={c.secHead}>
          <h2 id="sec-tl" className={people.secTitle}>Linha do tempo</h2>
          {noting ? null : <button type="button" className="link" onClick={() => setNoting(true)}>Adicionar nota</button>}
        </div>
        {noting ? (
          <div className={c.noteRow}>
            <input className={people.fInput} value={note} maxLength={2000} autoFocus placeholder="Nota interna, só a equipe vê" aria-label="Nota interna" onChange={(ev) => setNote(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") void addNote(); if (ev.key === "Escape") { setNote(""); setNoting(false); } }} />
            <button type="button" className={`btn ghost sm ${c.nowrap}`} disabled={!note.trim()} onClick={() => void addNote()}>Salvar</button>
          </div>
        ) : null}
        <Timeline entries={detail.timeline} newId={newId} today={today} owner={detail.assignedName} />
      </section>

      <div className={c.dock}>
        <button type="button" className={`${people.primary} ${c.dockBtn}`} onClick={() => setSheet(true)}>Registrar contato</button>
      </div>
      {sheet ? (
        <Sheet title="Registrar contato" onClose={() => setSheet(false)}>
          <ContactForm kind={kind} onKind={pickKind} onSave={async (t) => { const x = await contact(t); if (!x) setSheet(false); return x; }} autoFocus />
        </Sheet>
      ) : null}
    </article>
  );
}
