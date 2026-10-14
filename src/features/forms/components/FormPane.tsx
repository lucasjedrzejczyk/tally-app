"use client";

// Ficha do formulário (spec 19, A2 a A4): link (Copiar, Abrir), interruptor "Recebendo respostas" e
// abas Respostas | Perguntas (troca instantânea). Respostas abrem no toque; Perguntas é o editor.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, MoreHorizontal, UserPlus, UserRound } from "lucide-react";
import { Avatar } from "@/components/shared/Avatar";
import { UiIcon } from "@/components/shared/UiIcon";
import { Popover } from "@/features/study/components/Popover";
import { waLink } from "@/features/ministries/domain";
import { deleteFormAction, deleteResponseAction, responseToPersonAction, setFormOpenAction } from "../actions";
import { answerText, firstAnswer, shortDateTime, toCsv } from "../domain";
import type { FormDetail, FormResponse } from "../queries";
import { FormEditor } from "./FormEditor";
import people from "@/features/sticks/people.module.css";
import studyStyles from "@/features/study/study.module.css";
import c from "@/features/care/care.module.css";
import s from "../forms.module.css";

type Tab = "responses" | "questions";

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={s.wa}>
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z" />
    </svg>
  );
}

function ResponseRow({ form, r, open, onToggle, canAddPeople, onDetail }: { form: FormDetail; r: FormResponse; open: boolean; onToggle: () => void; canAddPeople: boolean; onDetail: (d: FormDetail) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wa = r.phone ? waLink(r.phone, `Oi ${r.name.split(" ")[0]}! Recebemos sua resposta em "${form.title}".`) : "";

  async function run(p: Promise<{ success: true; data: FormDetail } | { success: false; message: string }>) {
    setBusy(true);
    setErr("");
    const res = await p;
    setBusy(false);
    if (res.success) onDetail(res.data);
    else setErr(res.message);
  }

  return (
    <div className={s.resp} data-open={open || undefined}>
      <button type="button" className={`${people.row} ${s.respHead}`} aria-expanded={open} onClick={onToggle}>
        <Avatar name={r.name} size={32} />
        <span className={people.rowMain}>
          <span className={people.rowName}>{r.name}</span>
          <span className={people.rowSub}>{firstAnswer(form.fields, r.answers) || r.phone || "Sem respostas além do nome"}</span>
        </span>
        <span className={people.rowAside}>{shortDateTime(r.createdAt)}</span>
      </button>
      <div className={s.fold}>
        <div className={s.foldIn}>
          <dl className={s.answers}>
            {r.phone ? (
              <div>
                <dt>Telefone</dt>
                <dd>{r.phone}</dd>
              </div>
            ) : null}
            {form.fields.map((f) => {
              const t = answerText(f, r.answers[f.id]);
              return t ? (
                <div key={f.id}>
                  <dt>{f.label}</dt>
                  <dd>{t}</dd>
                </div>
              ) : null;
            })}
          </dl>
          <div className={s.respActions}>
            {r.stickId ? (
              <Link className="btn ghost sm" href={`/people?p=${r.stickId}`}>
                <UiIcon icon={UserRound} />
                Ver em Pessoas
              </Link>
            ) : canAddPeople ? (
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => void run(responseToPersonAction(form.id, r.id))}>
                <UiIcon icon={UserPlus} />
                {busy ? "Adicionando…" : "Adicionar em Pessoas"}
              </button>
            ) : null}
            {wa ? (
              <a className="btn ghost sm" href={wa} target="_blank" rel="noreferrer">
                <WhatsAppIcon />
                WhatsApp
              </a>
            ) : null}
            <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações da resposta" align="right">
              {(close) => (
                <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => { close(); void run(deleteResponseAction(form.id, r.id)); }}>
                  Excluir resposta
                </button>
              )}
            </Popover>
          </div>
          {err ? <p className={people.fErr} role="alert">{err}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function FormPane({ detail, startEditing, canAddPeople, onDetail, onDeleted }: { detail: FormDetail; startEditing: boolean; canAddPeople: boolean; onDetail: (d: FormDetail) => void; onDeleted: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>(startEditing ? "questions" : "responses");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<number | undefined>(undefined);
  // O endereço completo só existe no navegador; no servidor fica o caminho (sem divergir na hidratação).
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    return () => window.clearTimeout(timer.current);
  }, []);

  const link = `${origin}/formulario/${detail.token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("Não consegui copiar. Segure no link para copiar.");
    }
  }
  async function toggleOpen() {
    const next = !detail.open;
    onDetail({ ...detail, open: next });
    const r = await setFormOpenAction(detail.id, next);
    if (!r.success) {
      onDetail({ ...detail, open: !next });
      setErr(r.message);
    }
  }
  async function remove(close: () => void) {
    close();
    if (!window.confirm(`Excluir "${detail.title}" e todas as respostas?`)) return;
    const r = await deleteFormAction(detail.id);
    if (r.success) onDeleted(detail.id);
    else setErr(r.message);
  }
  function download() {
    const csv = toCsv(detail.fields, detail.responses);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.title.replace(/[\\/:*?"<>|]/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={people.prof}>
      <div className={s.titleRow}>
        <h2 className={s.title}>{detail.title}</h2>
        <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações do formulário" align="right">
          {(close) => <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void remove(close)}>Excluir formulário</button>}
        </Popover>
      </div>

      <div className={s.linkRow}>
        <span className={s.linkText} title={link}>{link.replace(/^https?:\/\//, "")}</span>
        <button type="button" className={`btn ghost sm ${s.copy}`} onClick={() => void copy()} aria-live="polite">
          <span className={s.swap} data-on={copied || undefined}>
            <UiIcon icon={copied ? Check : Copy} />
            {copied ? "Copiado" : "Copiar link"}
          </span>
        </button>
        <a className="iconbtn" href={link} target="_blank" rel="noreferrer" aria-label="Abrir o formulário">
          <UiIcon icon={ExternalLink} />
        </a>
      </div>

      <div className={s.openRow}>
        <span>
          <span className={s.openLabel}>Recebendo respostas</span>
          <span className={s.openHint}>{detail.open ? "Quem tem o link consegue responder" : "O link mostra que o formulário está fechado"}</span>
        </span>
        <button type="button" role="switch" aria-checked={detail.open} aria-label="Recebendo respostas" className={s.switch} onClick={() => void toggleOpen()} />
      </div>
      {err ? <p className={people.fErr} role="alert">{err}</p> : null}

      <div className={s.tabsRow}>
        <div className={c.tabs} role="tablist" aria-label="Formulário">
          <button type="button" role="tab" aria-selected={tab === "responses"} className={c.tab} onClick={() => setTab("responses")}>
            Respostas{detail.responses.length ? <span className={s.tabCount}>{detail.responses.length}</span> : null}
          </button>
          <button type="button" role="tab" aria-selected={tab === "questions"} className={c.tab} onClick={() => setTab("questions")}>Perguntas</button>
        </div>
        {tab === "responses" && detail.responses.length ? (
          <button type="button" className="btn ghost sm" onClick={download}>
            <UiIcon icon={Download} />
            Baixar planilha
          </button>
        ) : null}
      </div>

      {tab === "questions" ? (
        <FormEditor detail={detail} focusTitle={startEditing} onDetail={onDetail} />
      ) : detail.responses.length ? (
        <div className={s.resps}>
          {detail.responses.map((r) => (
            <ResponseRow key={r.id} form={detail} r={r} open={openId === r.id} onToggle={() => setOpenId((o) => (o === r.id ? null : r.id))} canAddPeople={canAddPeople} onDetail={onDetail} />
          ))}
        </div>
      ) : (
        <div className={s.noResp}>
          <p>Nenhuma resposta ainda. Copie o link e mande no grupo da igreja.</p>
          <p className={s.noRespHint}>Quem responde não precisa de conta.</p>
        </div>
      )}
    </div>
  );
}
