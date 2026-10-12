"use client";

// Adicionar membros (spec 14, A6): busca em Pessoas com múltipla seleção. Quem já está em outra
// célula mostra "Sai da Célula X" antes de confirmar (uma célula ativa por pessoa).
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { normalize } from "@/features/sticks/domain";
import type { PersonListItem } from "@/features/sticks/types";
import type { CellListItem } from "../types";
import { Sheet } from "./Sheet";
import g from "../groups.module.css";
import people from "@/features/sticks/people.module.css";

export function AddMembers({
  cellId,
  persons,
  cells,
  memberIds,
  onAdd,
  onClose,
}: {
  cellId: string;
  persons: PersonListItem[];
  cells: CellListItem[];
  memberIds: string[];
  onAdd: (ids: string[]) => Promise<string | null>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const n = normalize(q);
    return persons.filter((p) => !p.archived && !memberIds.includes(p.id) && (!n || normalize(p.name).includes(n)));
  }, [persons, memberIds, q]);

  const leaves = (p: PersonListItem): string => {
    const other = p.groupIds.find((id) => id !== cellId);
    const name = other ? cells.find((c) => c.id === other)?.name : null;
    return name ? `Sai da ${/^c[eé]lula/i.test(name) ? "" : "célula "}${name}` : "";
  };

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }
  async function add() {
    setBusy(true);
    setErr("");
    const e = await onAdd([...picked]);
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  }

  const foot = (
    <>
      {err ? <p className={g.footMsg} role="alert">{err}</p> : null}
      <div className={g.footRow}>
        <span className={g.footCount}>{picked.size ? `${picked.size} ${picked.size === 1 ? "escolhida" : "escolhidas"}` : ""}</span>
        <button type="button" className={people.primary} disabled={busy || picked.size === 0} onClick={() => void add()}>
          {picked.size ? `Adicionar ${picked.size}` : "Adicionar"}
        </button>
      </div>
    </>
  );

  return (
    <Sheet title="Adicionar membros" tall onClose={onClose} foot={foot}>
      <input className={`${people.search} ${g.addSearch}`} type="search" placeholder="Buscar pessoa" aria-label="Buscar pessoa" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? (
        <p className="muted">{q ? "Ninguém com esse nome." : "Todas as pessoas já estão nesta célula."}</p>
      ) : (
        <ul className={g.list}>
          {shown.map((p) => {
            const on = picked.has(p.id);
            const sub = leaves(p);
            return (
              <li key={p.id}>
                <button type="button" role="checkbox" aria-checked={on} className={g.pRow} onClick={() => toggle(p.id)}>
                  <span className={g.pMain}>
                    <span className={g.pName}>{p.name}</span>
                    {sub ? <span className={g.pSub}>{sub}</span> : null}
                  </span>
                  <span className={`${g.box}${on ? " " + g.boxOn : ""}`} aria-hidden="true">{on ? <UiIcon icon={Check} /> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
