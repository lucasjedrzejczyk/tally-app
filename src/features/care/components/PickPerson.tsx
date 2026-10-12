"use client";

// Novo acompanhamento: busca em Pessoas e um toque escolhe. A ficha abre no Editar.
import { useMemo, useState } from "react";
import { Avatar } from "@/components/shared/Avatar";
import { normalize } from "@/features/sticks/domain";
import type { PersonListItem } from "@/features/sticks/types";
import { Sheet } from "@/features/groups/components/Sheet";
import people from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import c from "../care.module.css";

const SHOW = 40;

export function PickPerson({ persons, onPick, onClose }: { persons: PersonListItem[]; onPick: (id: string) => Promise<string | null>; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shown = useMemo(() => {
    const n = normalize(q);
    return persons.filter((p) => !p.archived && (!n || normalize(p.name).includes(n))).slice(0, SHOW);
  }, [persons, q]);

  async function pick(id: string) {
    setBusy(true);
    setErr("");
    const e = await onPick(id);
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  }

  return (
    <Sheet title="Novo acompanhamento" tall onClose={onClose}>
      <input className={`${people.search} ${g.addSearch}`} type="search" placeholder="Buscar pessoa" aria-label="Buscar pessoa" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
      {shown.length === 0 ? (
        <p className="muted">Ninguém com esse nome.</p>
      ) : (
        <ul className={c.plain}>
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" className={`${people.row} ${c.pickRow}`} disabled={busy} onClick={() => void pick(p.id)}>
                <Avatar name={p.name} photoUrl={p.photoUrl} size={32} />
                <span className={people.rowName}>{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
