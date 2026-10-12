"use client";

// Bloco "Crianças" na ficha de Pessoas (spec 18, D2): alergias, cuidados, quem pode e quem não pode
// buscar, fotos. Ler separado de editar; editar só com kids.manage. Fica no visual de Pessoas (Mercy):
// a identidade kids vale dentro do módulo.
import { useState } from "react";
import { saveProfileAction } from "../actions";
import type { KidProfile } from "../types";

export function KidBlock({ kidId, profile: initial, canEdit, sec, title, line, dim }: { kidId: string; profile: KidProfile; canEdit: boolean; sec?: string; title?: string; line?: string; dim?: string }) {
  const [p, setP] = useState(initial);
  const [draft, setDraft] = useState<KidProfile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const empty = !p.allergies && !p.careNotes && !p.authorizedPickup && !p.pickupBlocked && p.photoOk;

  async function save() {
    if (!draft) return;
    setBusy(true);
    const r = await saveProfileAction(kidId, draft);
    setBusy(false);
    if (!r.success) return setError(r.message);
    setP(draft);
    setDraft(null);
    setError("");
  }

  const field = (key: "allergies" | "careNotes" | "authorizedPickup" | "pickupBlocked", label: string, hint: string) => (
    <div className="field">
      <label htmlFor={`kid-${key}`}>{label}</label>
      <input id={`kid-${key}`} value={draft![key]} onChange={(e) => setDraft({ ...draft!, [key]: e.target.value })} placeholder={hint} maxLength={key === "careNotes" ? 1000 : 300} />
    </div>
  );

  return (
    <section className={sec} aria-labelledby="sec-kids">
      <h2 id="sec-kids" className={title}>
        Crianças
      </h2>
      {draft ? (
        <div>
          {field("allergies", "Alergias", "Ex.: amendoim, lactose")}
          {field("careNotes", "Cuidados", "Ex.: usa bombinha, precisa de ajuda no banheiro")}
          {field("authorizedPickup", "Também podem buscar", "Nomes separados por vírgula")}
          {field("pickupBlocked", "Não pode buscar", "Nome e motivo curto")}
          <div className="field">
            <button type="button" className="btn ghost sm" aria-pressed={draft.photoOk} onClick={() => setDraft({ ...draft, photoOk: !draft.photoOk })}>
              {draft.photoOk ? "Pode aparecer em fotos" : "Não pode aparecer em fotos"}
            </button>
          </div>
          {error ? <p className={line} role="alert">{error}</p> : null}
          <div className={line}>
            <button type="button" className="btn sm" onClick={save} disabled={busy}>
              {busy ? "Salvando…" : "Pronto"}
            </button>{" "}
            <button type="button" className="btn ghost sm" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          {p.pickupBlocked ? <p className={line}><b>Não pode buscar:</b> {p.pickupBlocked}</p> : null}
          {p.allergies ? <p className={line}>Alergias: {p.allergies}</p> : null}
          {p.careNotes ? <p className={line}>Cuidados: {p.careNotes}</p> : null}
          {p.authorizedPickup ? <p className={line}>Também podem buscar: {p.authorizedPickup}</p> : null}
          {!p.photoOk ? <p className={line}>Não pode aparecer em fotos</p> : null}
          {empty ? <p className={`${line} ${dim}`}>Sem alergias nem cuidados anotados.</p> : null}
          {canEdit ? (
            <button type="button" className="btn ghost sm" onClick={() => setDraft(p)}>
              Editar
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
