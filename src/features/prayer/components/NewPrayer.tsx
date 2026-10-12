"use client";

// Novo pedido pela equipe (spec 17, C4): nome livre ou alguém da igreja pela busca, o pedido e
// "Só a equipe pastoral".
import { useMemo, useState } from "react";
import { normalize } from "@/features/sticks/domain";
import type { PersonListItem } from "@/features/sticks/types";
import { Sheet } from "@/features/groups/components/Sheet";
import { createPrayerAction } from "../actions";
import { NAME_MAX, PRIVATE_LABEL, REQUEST_MAX, type PrayerRequest } from "../domain";
import people from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import m from "@/features/ministries/ministries.module.css";
import c from "@/features/care/care.module.css";

export function NewPrayer({ persons, onCreated, onClose }: { persons: PersonListItem[]; onCreated: (p: PrayerRequest) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [stickId, setStickId] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [onlyPastoral, setOnlyPastoral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const matches = useMemo(() => {
    const n = normalize(name);
    if (stickId || n.length < 2) return [];
    return persons.filter((p) => !p.archived && normalize(p.name).includes(n)).slice(0, 4);
  }, [persons, name, stickId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr("");
    const r = await createPrayerAction(name, request, onlyPastoral, stickId);
    setBusy(false);
    if (!r.success) return setErr(r.message);
    onCreated(r.data);
    onClose();
  }

  const foot = (
    <>
      {err ? <p className={g.footMsg} role="alert">{err}</p> : null}
      <div className={g.footRow}>
        <span />
        <button type="button" className={people.primary} disabled={busy || !request.trim()} onClick={() => void save()}>{busy ? "Publicando…" : "Publicar"}</button>
      </div>
    </>
  );

  return (
    <Sheet title="Novo pedido" onClose={onClose} foot={foot}>
      <div className={c.form}>
        <label className={people.fld}>
          <span className={people.fLabel}>Nome</span>
          <input className={people.fInput} value={name} maxLength={NAME_MAX} placeholder="Quem pediu (ou busque alguém da igreja)" onChange={(e) => { setName(e.target.value); setStickId(null); }} />
        </label>
        {matches.length ? (
          <div className={m.fnChips} aria-label="Pessoas da igreja">
            {matches.map((p) => (
              <button key={p.id} type="button" className={m.fnChip} onClick={() => { setName(p.name); setStickId(p.id); }}>{p.name}</button>
            ))}
          </div>
        ) : null}
        <label className={people.fld}>
          <span className={people.fLabel}>Pedido</span>
          <textarea className={`${people.fInput} ${c.area}`} rows={4} maxLength={REQUEST_MAX} value={request} onChange={(e) => setRequest(e.target.value)} />
        </label>
        <div className={m.fnChips}>
          <button type="button" aria-pressed={onlyPastoral} className={`${m.fnChip}${onlyPastoral ? " " + m.fnOn : ""}`} onClick={() => setOnlyPastoral((v) => !v)}>{PRIVATE_LABEL}</button>
        </div>
      </div>
    </Sheet>
  );
}
