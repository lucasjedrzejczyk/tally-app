"use client";

// Campo do formulário Editar (spec 13, C3): rótulo em cima e o controle sempre à mostra. Salva ao
// sair do campo ou com Enter (selects salvam ao escolher). Quem grava é o pai (`onSave` devolve a
// mensagem de erro, ou null se salvou); `onState` avisa o pai se o campo está com erro.
import { useEffect, useRef, useState } from "react";
import { DateField } from "@/components/shared/DateField";
import { Select } from "@/components/shared/Select";
import { FIELD_META, formatCpf, onlyDigits, type PersonField } from "../domain";
import styles from "../people.module.css";

export type SaveField = (field: PersonField, raw: string) => Promise<string | null>;

export function Field({
  field,
  value,
  onSave,
  onState,
  suggestions,
  wide = false,
  autoFocus = false,
  label,
  hint,
}: {
  field: PersonField;
  value: string;
  onSave: SaveField;
  onState: (field: PersonField, hasError: boolean) => void;
  suggestions?: readonly string[]; // atalhos de texto sob o input (ex.: cargos)
  wide?: boolean; // ocupa a linha inteira da grade
  autoFocus?: boolean; // foca (e seleciona) ao abrir: ficha recém-criada
  label?: string; // rótulo no lugar do padrão (ex.: Celular)
  hint?: string; // apoio sob o rótulo
}) {
  const base = FIELD_META[field] as { label: string; kind: string; options?: readonly (readonly [string, string])[]; required?: boolean };
  const meta = { ...base, label: label ?? base.label };
  const shown = (v: string) => (meta.kind === "cpf" ? formatCpf(v) : v); // CPF guardado só com dígitos
  const [draft, setDraft] = useState(shown(value));
  const [seen, setSeen] = useState(value);
  const [err, setErr] = useState("");
  const inflight = useRef<Promise<unknown> | null>(null); // salvamento em andamento: o próximo espera
  const wrap = useRef<HTMLDivElement>(null);

  // Quando o valor salvo muda de fora (ex.: UF em maiúsculas), o campo acompanha.
  if (seen !== value) {
    setSeen(value);
    setDraft(shown(value));
  }
  useEffect(() => {
    if (!autoFocus) return;
    const el = wrap.current?.querySelector<HTMLInputElement>("input:not([type=hidden])");
    el?.focus();
    el?.select();
  }, [autoFocus]);

  function fail(msg: string) {
    setErr(msg);
    onState(field, Boolean(msg));
  }
  async function commit(next: string) {
    if (inflight.current) await inflight.current;
    if (meta.kind === "date" && next === "" && (wrap.current?.querySelector<HTMLInputElement>("input[type=text]")?.value ?? "").trim()) return void fail("Data inválida.");
    if ((meta.kind === "cpf" ? onlyDigits(next) : next) === value) return void fail("");
    const run = onSave(field, next);
    inflight.current = run;
    const e = await run;
    inflight.current = null;
    fail(e ?? "");
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && meta.kind !== "select") {
      e.preventDefault();
      void commit(draft);
    }
  }
  function onBlur(e: React.FocusEvent) {
    if (!wrap.current?.contains(e.relatedTarget as Node | null)) void commit(draft);
  }

  return (
    <div className={`${styles.fld}${wide ? " " + styles.fldWide : ""}`}>
      <span className={styles.fLabel}>{meta.label}</span>
      {hint ? <span className={styles.fHint}>{hint}</span> : null}
      <div ref={wrap} className={styles.fEdit} onKeyDown={onKeyDown} onBlur={onBlur}>
        {meta.kind === "select" ? (
          <Select
            aria-label={meta.label}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              void commit(e.target.value);
            }}
          >
            {meta.required ? null : <option value="">Não informado</option>}
            {meta.options?.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        ) : meta.kind === "date" ? (
          <div className={`field ${styles.dateBox}`}>
            <DateField value={draft} onChange={setDraft} aria-label={meta.label} />
          </div>
        ) : (
          <input
            className={styles.fInput}
            type={meta.kind === "tel" ? "tel" : meta.kind === "email" ? "email" : "text"}
            inputMode={meta.kind === "tel" ? "tel" : meta.kind === "cpf" ? "numeric" : undefined}
            autoComplete="off"
            aria-label={meta.label}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        )}
        {suggestions?.length ? (
          <div className={styles.sugg}>
            {suggestions.map((s) => (
              <button key={s} type="button" className={styles.suggBtn} onPointerDown={(e) => e.preventDefault()} onClick={() => { setDraft(s); void commit(s); }}>{s}</button>
            ))}
          </div>
        ) : null}
        {err ? <p className={styles.fErr} role="alert">{err}</p> : null}
      </div>
    </div>
  );
}
