"use client";

// Formulário público de pedido de oração (spec 17, C5). Quem usa costuma estar fragilizado: poucos
// campos, o telefone diz para que serve, "Enviando…" evita o duplo envio e o obrigado desenha o Check.
import { useState } from "react";
import { submitPublicPrayerAction } from "../actions";
import { CONTACT_MAX, NAME_MAX, PRIVATE_LABEL, REQUEST_MAX } from "../domain";
import p from "../prayer.module.css";

export function PublicPrayerForm({ token, church }: { token: string; church: string }) {
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [contact, setContact] = useState("");
  const [onlyPastoral, setOnlyPastoral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!request.trim()) return setErr("Escreva o seu pedido.");
    setBusy(true);
    setErr("");
    const r = await submitPublicPrayerAction(token, name, request, onlyPastoral, contact);
    setBusy(false);
    if (!r.success) return setErr(r.message);
    setSent(true);
  }

  if (sent)
    return (
      <div className={p.thanks} role="status">
        <svg className={p.check} viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <div className="gtitle">Recebemos seu pedido</div>
        <div className="gsub">A equipe vai orar por você.</div>
      </div>
    );

  return (
    <form onSubmit={send} className={p.pub} noValidate>
      <div className="gtitle">Pedido de oração</div>
      <div className="gsub">para {church}</div>
      <label className="gfield">
        <span className={p.pubLabel}>Seu nome</span>
        <input value={name} maxLength={NAME_MAX} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="Pode deixar em branco" />
      </label>
      <label className="gfield">
        <span className={p.pubLabel}>Pedido</span>
        <textarea className={p.pubArea} value={request} maxLength={REQUEST_MAX} rows={5} onChange={(e) => setRequest(e.target.value)} required />
      </label>
      <label className="gfield">
        <span className={p.pubLabel}>Telefone (opcional)</span>
        <input value={contact} maxLength={CONTACT_MAX} inputMode="tel" autoComplete="tel" onChange={(e) => setContact(e.target.value)} />
        <span className={p.pubHint}>Usado só para a equipe falar com você</span>
      </label>
      <button type="button" aria-pressed={onlyPastoral} className={`${p.pubChip}${onlyPastoral ? " " + p.pubChipOn : ""}`} onClick={() => setOnlyPastoral((v) => !v)}>
        {PRIVATE_LABEL}
      </button>
      <div className="gerr" role="alert">{err}</div>
      <button className="gbtn" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar"}</button>
    </form>
  );
}
