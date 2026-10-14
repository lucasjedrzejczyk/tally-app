"use client";

// Formulário público (spec 19, A5). Quem responde não conhece o app: perguntas claras, obrigatória
// marcada, "Enviando…" evita o duplo envio e o obrigado desenha o Check.
import { useState } from "react";
import { DateField } from "@/components/shared/DateField";
import { submitPublicFormAction } from "../actions";
import { ANSWER_MAX, missingRequired, NAME_MAX, PHONE_MAX, type Answers, type FormField } from "../domain";
import p from "@/features/prayer/prayer.module.css";
import s from "../forms.module.css";

export function PublicForm({ token, church, title, intro, fields }: { token: string; church: string; title: string; intro: string; fields: FormField[] }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const set = (id: string, v: string | string[]) => setAnswers((a) => ({ ...a, [id]: v }));
  const toggle = (id: string, o: string) => {
    const cur = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    set(id, cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]);
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setErr("Escreva o seu nome.");
    const miss = missingRequired(fields, answers);
    if (miss) return setErr(`Falta responder: ${miss.label}`);
    setBusy(true);
    setErr("");
    const r = await submitPublicFormAction(token, name, phone, answers);
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
        <div className="gtitle">Recebemos sua resposta</div>
        <div className="gsub">Obrigado! A equipe da {church} vai ver em breve.</div>
      </div>
    );

  return (
    <form onSubmit={send} className={p.pub} noValidate>
      <div className={s.pubChurch}>{church}</div>
      <div className="gtitle">{title}</div>
      {intro ? <p className={s.pubIntro}>{intro}</p> : <div className={s.pubGap} />}
      <label className="gfield">
        <span className={p.pubLabel}>Seu nome<span className={s.star} aria-hidden="true"> *</span></span>
        <input value={name} maxLength={NAME_MAX} autoComplete="name" required onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="gfield">
        <span className={p.pubLabel}>Telefone (opcional)</span>
        <input value={phone} maxLength={PHONE_MAX} inputMode="tel" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
        <span className={p.pubHint}>Usado só para a igreja falar com você</span>
      </label>
      {fields.map((f) => {
        const label = (
          <span className={p.pubLabel}>
            {f.label}
            {f.required ? <span className={s.star} aria-hidden="true"> *</span> : null}
          </span>
        );
        if (f.type === "choice" || f.type === "multi")
          return (
            <fieldset key={f.id} className={`gfield ${s.pubSet}`}>
              <legend className={s.pubLegend}>{label}</legend>
              <div className={s.pubChips}>
                {f.options.map((o) => {
                  const on = f.type === "multi" ? Array.isArray(answers[f.id]) && (answers[f.id] as string[]).includes(o) : answers[f.id] === o;
                  return (
                    <button key={o} type="button" aria-pressed={on} className={`${p.pubChip}${on ? " " + p.pubChipOn : ""}`} onClick={() => (f.type === "multi" ? toggle(f.id, o) : set(f.id, on ? "" : o))}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        if (f.type === "date")
          return (
            <div key={f.id} className="gfield">
              {label}
              <DateField value={typeof answers[f.id] === "string" ? (answers[f.id] as string) : ""} onChange={(v: string) => set(f.id, v)} aria-label={f.label} />
            </div>
          );
        return (
          <label key={f.id} className="gfield">
            {label}
            {f.type === "long" ? (
              <textarea className={p.pubArea} rows={4} maxLength={ANSWER_MAX} value={typeof answers[f.id] === "string" ? (answers[f.id] as string) : ""} onChange={(e) => set(f.id, e.target.value)} />
            ) : (
              <input maxLength={ANSWER_MAX} value={typeof answers[f.id] === "string" ? (answers[f.id] as string) : ""} onChange={(e) => set(f.id, e.target.value)} />
            )}
          </label>
        );
      })}
      <div className="gerr" role="alert">{err}</div>
      <button className="gbtn" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar"}</button>
    </form>
  );
}
