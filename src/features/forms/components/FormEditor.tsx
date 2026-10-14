"use client";

// Editor de perguntas (spec 19, A4). Rascunho local e Salvar explícito; "Salvo" some em 2 s.
// Nome e telefone ficam fixos no topo (sempre vêm), só para quem monta saber que existem.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { Select } from "@/components/shared/Select";
import { saveFormAction } from "../actions";
import { FIELD_TYPES, FIELDS_MAX, hasOptions, INTRO_MAX, LABEL_MAX, newFieldId, optionsFromText, TITLE_MAX, type FieldType, type FormField } from "../domain";
import type { FormDetail } from "../queries";
import people from "@/features/sticks/people.module.css";
import s from "../forms.module.css";

// Opções ficam em texto enquanto se digita (uma por linha); viram lista só ao salvar.
type Draft = FormField & { optionsText: string };
const toDraft = (f: FormField): Draft => ({ ...f, optionsText: f.options.join("\n") });

export function FormEditor({ detail, focusTitle, onDetail }: { detail: FormDetail; focusTitle: boolean; onDetail: (d: FormDetail) => void }) {
  const [title, setTitle] = useState(detail.title);
  const [intro, setIntro] = useState(detail.intro);
  const [fields, setFields] = useState<Draft[]>(detail.fields.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (focusTitle) titleRef.current?.select();
  }, [focusTitle]);
  useEffect(() => {
    if (focusId) document.getElementById(`fl-${focusId}`)?.focus();
  }, [focusId]);

  const patch = (id: string, p: Partial<Draft>) => {
    setSaved(false);
    setFields((l) => l.map((f) => (f.id === id ? { ...f, ...p } : f)));
  };
  function move(i: number, d: -1 | 1) {
    setSaved(false);
    setFields((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      if (x) n.splice(i + d, 0, x);
      return n;
    });
  }
  function add() {
    const id = newFieldId(fields.map((f) => f.id));
    setSaved(false);
    setFields((l) => [...l, { id, label: "", type: "short", required: false, options: [], optionsText: "" }]);
    setFocusId(id);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr("");
    const r = await saveFormAction(detail.id, title, intro, fields.map(({ optionsText, ...f }) => ({ ...f, options: hasOptions(f.type) ? optionsFromText(optionsText) : [] })));
    setBusy(false);
    if (!r.success) return setErr(r.message);
    onDetail(r.data);
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={s.editor}>
      <label className={s.fld}>
        <span className={people.fLabel}>Título</span>
        <input ref={titleRef} className={people.fInput} value={title} maxLength={TITLE_MAX} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} />
      </label>
      <label className={s.fld}>
        <span className={people.fLabel}>Texto de abertura</span>
        <textarea className={s.area} rows={2} value={intro} maxLength={INTRO_MAX} placeholder="Opcional. Aparece embaixo do título." onChange={(e) => { setIntro(e.target.value); setSaved(false); }} />
      </label>

      <div className={s.qHead}>Perguntas</div>
      <p className={s.fixed}>Nome e telefone sempre vêm primeiro.</p>
      <ol className={s.qs}>
        {fields.map((f, i) => (
          <li key={f.id} className={s.q}>
            <div className={s.qTop}>
              <input
                id={`fl-${f.id}`}
                className={people.fInput}
                aria-label={`Pergunta ${i + 1}`}
                placeholder="Escreva a pergunta"
                value={f.label}
                maxLength={LABEL_MAX}
                onChange={(e) => patch(f.id, { label: e.target.value })}
              />
              <Select compact aria-label="Tipo de resposta" value={f.type} onChange={(e) => patch(f.id, { type: e.target.value as FieldType })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </Select>
            </div>
            {hasOptions(f.type) ? (
              <label className={s.fld}>
                <span className={people.fHint}>Opções, uma por linha</span>
                <textarea className={s.area} rows={Math.max(3, f.optionsText.split("\n").length + 1)} value={f.optionsText} onChange={(e) => patch(f.id, { optionsText: e.target.value })} />
              </label>
            ) : null}
            <div className={s.qBar}>
              <button type="button" className={s.req} aria-pressed={f.required} onClick={() => patch(f.id, { required: !f.required })}>Obrigatória</button>
              <span className={s.qTools}>
                <button type="button" className="iconbtn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><UiIcon icon={ArrowUp} /></button>
                <button type="button" className="iconbtn" aria-label="Descer" disabled={i === fields.length - 1} onClick={() => move(i, 1)}><UiIcon icon={ArrowDown} /></button>
                <button type="button" className="iconbtn" aria-label="Remover pergunta" onClick={() => { setSaved(false); setFields((l) => l.filter((x) => x.id !== f.id)); }}><UiIcon icon={Trash2} /></button>
              </span>
            </div>
          </li>
        ))}
      </ol>
      {fields.length < FIELDS_MAX ? (
        <button type="button" className={`btn ghost sm ${s.addQ}`} onClick={add}>
          <UiIcon icon={Plus} />
          Adicionar pergunta
        </button>
      ) : null}

      <div className={s.saveBar}>
        <button type="button" className={people.primary} disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</button>
        <span className={s.saved} data-on={saved || undefined} role="status">Salvo</span>
      </div>
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}
    </div>
  );
}
