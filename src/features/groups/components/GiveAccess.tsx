"use client";

// Dar acesso ao líder (spec 14, B3): lista quem lidera ou supervisiona a célula e ainda não tem login.
// Com e-mail na ficha, gera o link do convite (fluxo de convites que já existe) para copiar e mandar;
// sem e-mail, avisa e leva para Pessoas.
import { useEffect, useState } from "react";
import Link from "next/link";
import { inviteUrl } from "@/features/invites/domain";
import { inviteLeaderAction } from "../actions";
import { leadersNeedingAccess } from "../domain";
import type { CellDetail } from "../types";
import { Sheet } from "./Sheet";
import g from "../groups.module.css";

export function GiveAccess({ detail, onClose }: { detail: CellDetail; onClose: () => void }) {
  const [origin, setOrigin] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const list = leadersNeedingAccess(detail);

  async function invite(id: string) {
    setBusy(id);
    setErr("");
    const r = await inviteLeaderAction(id);
    setBusy("");
    if (r.success) setLinks((l) => ({ ...l, [id]: inviteUrl(origin, r.data.token) }));
    else setErr(r.message);
  }
  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(links[id] ?? "");
      setCopied(id);
      window.setTimeout(() => setCopied(""), 2000);
    } catch {
      setErr("Não consegui copiar. Selecione o link e copie.");
    }
  }

  return (
    <Sheet title="Dar acesso ao líder" onClose={onClose}>
      {list.length === 0 ? (
        <p className="muted">Todos os líderes e o supervisor desta célula já têm acesso ao app.</p>
      ) : (
        <ul className={g.list}>
          {list.map((p) => (
            <li key={p.id} className={g.accRow}>
              <div className={g.accHead}>
                <span className={g.accName}>{p.name}</span>
                <span className={g.mNote}>{p.roles}</span>
              </div>
              {p.access === "noEmail" ? (
                <p className={g.accNote}>
                  Cadastre o e-mail de {p.name} em <Link className={g.nameLink} href={`/people?p=${p.id}`}>Pessoas</Link> para enviar o convite.
                </p>
              ) : links[p.id] ? (
                <div className={g.accLink}>
                  <input readOnly value={links[p.id]} aria-label={`Link de convite de ${p.name}`} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="btn ghost sm" onClick={() => void copy(p.id)}>{copied === p.id ? "Copiado" : "Copiar"}</button>
                </div>
              ) : (
                <button type="button" className="btn ghost sm" disabled={busy === p.id} onClick={() => void invite(p.id)}>
                  {busy === p.id ? "Gerando…" : "Gerar convite"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {err ? <p className={g.footMsg} role="alert">{err}</p> : null}
    </Sheet>
  );
}
