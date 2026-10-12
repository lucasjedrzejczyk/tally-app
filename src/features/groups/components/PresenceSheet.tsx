"use client";

// Marcar presença (spec 14, A5 e C3): a tela que o líder mais usa, então é rápida com um dedo: uma
// grade de rostos, tocar marca. Painel no computador, folha de baixo no celular. Reabrir um dia
// carrega as marcações dele.
// Sem conexão: as marcações ficam num rascunho no aparelho (por célula e data) e voltam ao reabrir.
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { DateField } from "@/components/shared/DateField";
import { UiIcon } from "@/components/shared/UiIcon";
import { saveAttendanceAction } from "../actions";
import { firstName, isIso, todayIso } from "../domain";
import type { CellDetail, CellMember, DaySession } from "../types";
import { Sheet } from "./Sheet";
import g from "../groups.module.css";
import people from "@/features/sticks/people.module.css";

const SAVED_MS = 900;
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
  const [done, setDone] = useState(false); // "Salvo" por um instante antes de fechar
  const [tapped, setTapped] = useState<string | null>(null); // o selo só anima em quem foi tocado agora
  const closeTimer = useRef<number | undefined>(undefined);
  const ids = members.map((m) => m.stickId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadErr("");
    setMsg("");
    setTapped(null);
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

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  function toggle(id: string) {
    setTapped(id);
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
      setDone(true);
      closeTimer.current = window.setTimeout(() => onSaved(r.data), SAVED_MS);
      return;
    }
    writeDraft(groupId, date, chosen, asCancelled);
    setMsg(r ? r.message : OFFLINE);
  }

  const count = ids.filter((i) => marks.has(i)).length;
  const everyone = members.length > 0 && count === members.length;
  function markAll() {
    setTapped(null);
    setMarks(everyone ? new Set() : new Set(ids));
  }
  const dateField = (
    <span className={`field ${people.dateBox} ${g.sheetDate}`}>
      <DateField
        value={date}
        onChange={(iso) => {
          if (isIso(iso) && iso <= todayIso(new Date(Date.now() + 86_400_000))) setDate(iso);
        }}
        aria-label="Data do encontro"
      />
    </span>
  );
  const foot = (
    <>
      {msg ? <p className={g.footMsg} role="alert">{msg}</p> : null}
      {cancelled || loadErr ? null : (
        <>
          <button type="button" className={`link ${g.footLink}`} disabled={loading || saving || done} onClick={() => void submit(true)}>Não teve encontro neste dia</button>
          <div className={g.footRow}>
            <span className={g.footCount}>{count} de {members.length}</span>
            <button type="button" className={people.primary} disabled={loading || saving || done} onClick={() => void submit(false)}>
              {done ? <><UiIcon icon={Check} />Salvo</> : "Salvar"}
            </button>
          </div>
        </>
      )}
    </>
  );

  return (
    <Sheet title="Presença" headExtra={dateField} onClose={onClose} foot={foot}>
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
        <>
          <div className={g.shortcut}>
            <button type="button" className="btn ghost sm" onClick={markAll}>{everyone ? "Limpar" : "Todos vieram"}</button>
          </div>
          <ul className={g.pgrid}>
            {members.map((m) => {
              const on = marks.has(m.stickId);
              return (
                <li key={m.stickId}>
                  <button type="button" className={g.pface} aria-label={`${on ? "Desmarcar" : "Marcar"} ${m.name}`} onClick={() => toggle(m.stickId)}>
                    <span className={`${g.pring}${on ? " " + g.pringOn : ""}`}>
                      <Avatar name={m.name} photoUrl={m.photoUrl} size={56} />
                      {on ? <span className={`${g.tick}${tapped === m.stickId ? " " + g.tickIn : ""}`}><Check size={12} strokeWidth={2.5} aria-hidden="true" focusable="false" /></span> : null}
                    </span>
                    <span className={`${g.pname}${on ? " " + g.pnameOn : ""}`}>{firstName(m.name)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}
