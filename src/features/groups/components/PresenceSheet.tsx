"use client";

// Marcar presença (spec 14, A5): a tela que o líder mais usa, então é rápida com um dedo. Painel
// pela direita no computador, tela cheia no celular. Reabrir um dia carrega as marcações dele.
// Sem conexão: as marcações ficam num rascunho no aparelho (por célula e data) e voltam ao reabrir.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { DateField } from "@/components/shared/DateField";
import { UiIcon } from "@/components/shared/UiIcon";
import { saveAttendanceAction } from "../actions";
import { isIso, todayIso } from "../domain";
import type { CellDetail, CellMember, DaySession } from "../types";
import g from "../groups.module.css";
import people from "@/features/sticks/people.module.css";

const OFFLINE = "Sem conexão. As marcações ficam guardadas aqui; tente salvar de novo.";
const draftKey = (group: string, date: string) => `mercy:presenca:${group}:${date}`;

function readDraft(group: string, date: string): { ids: string[]; cancelled: boolean } | null {
  try {
    const raw = window.localStorage.getItem(draftKey(group, date));
    const v = raw ? (JSON.parse(raw) as { ids?: unknown; cancelled?: unknown }) : null;
    return v && Array.isArray(v.ids) ? { ids: v.ids.filter((x): x is string => typeof x === "string"), cancelled: v.cancelled === true } : null;
  } catch {
    return null;
  }
}
function writeDraft(group: string, date: string, ids: string[], cancelled: boolean) {
  try {
    window.localStorage.setItem(draftKey(group, date), JSON.stringify({ ids, cancelled }));
  } catch {
    /* sem armazenamento: segue sem rascunho */
  }
}
function clearDraft(group: string, date: string) {
  try {
    window.localStorage.removeItem(draftKey(group, date));
  } catch {
    /* idem */
  }
}

export function PresenceSheet({
  groupId,
  members,
  initialDate,
  onClose,
  onSaved,
}: {
  groupId: string;
  members: CellMember[];
  initialDate: string;
  onClose: () => void;
  onSaved: (d: CellDetail) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [marks, setMarks] = useState<Set<string>>(new Set());
  const [cancelled, setCancelled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const ids = members.map((m) => m.stickId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadErr("");
    setMsg("");
    const apply = (idsIn: string[], c: boolean) => {
      setMarks(new Set(idsIn.filter((i) => ids.includes(i))));
      setCancelled(c);
      setLoading(false);
    };
    const draft = readDraft(groupId, date);
    fetch(`/api/groups/${groupId}/session?date=${date}`)
      .then((r) => (r.ok ? (r.json() as Promise<DaySession>) : Promise.reject(new Error("falhou"))))
      .then((s) => {
        if (!alive) return;
        if (draft) {
          apply(draft.ids, draft.cancelled);
          setMsg("Marcações guardadas neste aparelho. Toque em Salvar.");
        } else apply(s.presentIds, s.cancelled);
      })
      .catch(() => {
        if (!alive) return;
        if (draft) apply(draft.ids, draft.cancelled);
        else {
          setLoading(false);
          setLoadErr("Não consegui abrir este dia. Confira a conexão e tente de novo.");
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, date]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(id: string) {
    setMarks((m) => {
      const n = new Set(m);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  async function submit(asCancelled: boolean) {
    setSaving(true);
    setMsg("");
    const chosen = ids.filter((i) => marks.has(i));
    let r: Awaited<ReturnType<typeof saveAttendanceAction>> | null = null;
    try {
      r = await saveAttendanceAction(groupId, date, chosen, asCancelled);
    } catch {
      r = null;
    }
    setSaving(false);
    if (r?.success) {
      clearDraft(groupId, date);
      onSaved(r.data);
      return;
    }
    writeDraft(groupId, date, chosen, asCancelled);
    setMsg(r ? r.message : OFFLINE);
  }

  const count = ids.filter((i) => marks.has(i)).length;
  return createPortal(
    <>
      <div className={g.scrim} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Presença" className={g.sheet}>
        <div className={g.sheetHead}>
          <h2>Presença</h2>
          <span className={`field ${people.dateBox} ${g.sheetDate}`}>
            <DateField
              value={date}
              onChange={(iso) => {
                if (isIso(iso) && iso <= todayIso(new Date(Date.now() + 86_400_000))) setDate(iso);
              }}
              aria-label="Data do encontro"
            />
          </span>
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Fechar" onClick={onClose}>
            <UiIcon icon={X} />
          </button>
        </div>

        <div className={g.sheetBody}>
          {loading ? (
            <p className="muted">Abrindo o dia…</p>
          ) : loadErr ? (
            <p className={people.fErr} role="alert">{loadErr}</p>
          ) : cancelled ? (
            <div className={g.blank}>
              <p>Marcado como sem encontro neste dia.</p>
              <button type="button" className="link" onClick={() => setCancelled(false)}>Teve encontro neste dia</button>
            </div>
          ) : members.length === 0 ? (
            <p className="muted">Nenhum membro para marcar.</p>
          ) : (
            <ul className={g.list}>
              {members.map((m) => {
                const on = marks.has(m.stickId);
                return (
                  <li key={m.stickId}>
                    <button type="button" role="checkbox" aria-checked={on} className={g.pRow} onClick={() => toggle(m.stickId)}>
                      <span className={g.pName}>{m.name}</span>
                      <span className={`${g.box}${on ? " " + g.boxOn : ""}`} aria-hidden="true">{on ? <UiIcon icon={Check} /> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={g.sheetFoot}>
          {msg ? <p className={g.footMsg} role="alert">{msg}</p> : null}
          {cancelled || loadErr ? null : (
            <>
              <div className={g.footRow}>
                <span className={g.footCount}>{count} de {members.length}</span>
                <button type="button" className={people.primary} disabled={loading || saving} onClick={() => void submit(false)}>Salvar</button>
              </div>
              <button type="button" className={`link ${g.footLink}`} disabled={loading || saving} onClick={() => void submit(true)}>Não teve encontro neste dia</button>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
