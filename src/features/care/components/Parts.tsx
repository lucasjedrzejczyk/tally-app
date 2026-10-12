"use client";

// Peças da ficha do Cuidado: o formulário de contato (tipo em chips + nota + Registrar) e a linha do
// tempo (contatos e notas juntos, mais novo em cima; só o item novo entra com movimento).
import { useState } from "react";
import { Footprints, MessageCircle, MessagesSquare, Phone, StickyNote, type LucideIcon } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { daysBetween, shortDate } from "@/features/groups/domain";
import { CONTACT_KINDS, CONTACT_LABEL } from "../domain";
import type { ContactKind, TimelineEntry } from "../types";
import people from "@/features/sticks/people.module.css";
import m from "@/features/ministries/ministries.module.css";
import c from "../care.module.css";

const KIND_ICON: Record<ContactKind, LucideIcon> = { visit: Footprints, call: Phone, whatsapp: MessageCircle, talk: MessagesSquare };

export function ContactForm({ kind, onKind, onSave, autoFocus }: { kind: ContactKind; onKind: (k: ContactKind) => void; onSave: (text: string) => Promise<string | null>; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true);
    setErr("");
    const e = await onSave(text);
    setBusy(false);
    if (e) setErr(e);
    else setText("");
  }
  return (
    <div className={c.contact}>
      <div className={m.fnChips} role="radiogroup" aria-label="Tipo de contato">
        {CONTACT_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === kind} className={`${m.fnChip} ${c.kind}${k === kind ? " " + m.fnOn : ""}`} onClick={() => onKind(k)}>
            <UiIcon icon={KIND_ICON[k]} />
            {CONTACT_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea className={`${people.fInput} ${c.area}`} rows={3} maxLength={2000} value={text} autoFocus={autoFocus} placeholder="Como foi (opcional)" aria-label="Como foi o contato" onChange={(ev) => setText(ev.target.value)} />
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
      <div className={c.contactEnd}>
        <button type="button" className={people.primary} disabled={busy} onClick={() => void save()}>{busy ? "Registrando…" : "Registrar"}</button>
      </div>
    </div>
  );
}

function when(at: string, today: string): string {
  const d = at.slice(0, 10);
  const n = daysBetween(d, today);
  return n === 0 ? "Hoje" : n === 1 ? "Ontem" : shortDate(d);
}

// `owner` = responsável do caso: o nome dele não se repete em cada linha.
export function Timeline({ entries, newId, today, owner }: { entries: TimelineEntry[]; newId: string | null; today: string; owner: string }) {
  if (!entries.length) return <p className={c.none}>Nenhum contato ainda. O primeiro registro aparece aqui.</p>;
  return (
    <ul className={c.tl}>
      {entries.map((t) => (
        <li key={t.id} className={`${c.tlItem}${t.id === newId ? " " + c.tlNew : ""}`}>
          <span className={c.tlIcon}><UiIcon icon={t.kind === "note" ? StickyNote : t.method ? KIND_ICON[t.method] : MessagesSquare} /></span>
          <span className={c.tlBody}>
            <span className={c.tlHead}>
              {t.kind === "note" ? "Nota interna" : t.method ? CONTACT_LABEL[t.method] : "Contato"}
              <span className={c.muted}> · {when(t.at, today)}{t.byName && t.byName !== owner ? ` · ${t.byName}` : ""}</span>
            </span>
            {t.text ? <span className={c.tlText}>{t.text}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
