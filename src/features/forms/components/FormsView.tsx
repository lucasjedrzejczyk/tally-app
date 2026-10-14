"use client";

// Formulários (spec 19): lista à esquerda e ficha à direita (>= 900px); no celular a ficha entra em
// tela cheia com o gesto de voltar das outras telas. Seleção em ?f=<id>.
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ClipboardList, Plus } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { useSwipeToClose } from "@/features/sticks/swipe";
import { Sheet } from "@/features/groups/components/Sheet";
import { createFormAction, markSeenAction } from "../actions";
import { responsesLabel, TEMPLATES } from "../domain";
import type { FormDetail, FormListItem } from "../queries";
import { FormPane } from "./FormPane";
import people from "@/features/sticks/people.module.css";
import s from "../forms.module.css";

const urlFor = (id: string | null): string => (id ? `/forms?f=${id}` : "/forms");
const TEMPLATE_HINT: Record<string, string> = {
  blank: "Só nome e telefone; você monta o resto",
  visitor: "Como conheceu, bairro, visita, oração",
  signup: "Para eventos, cursos e retiros",
  baptism: "Nascimento, curso e a história da pessoa",
};

export function FormsView({ initialForms, initialDetail, initialMobileOpen, canAddPeople }: { initialForms: FormListItem[]; initialDetail: FormDetail | null; initialMobileOpen: boolean; canAddPeople: boolean }) {
  const [forms, setForms] = useState(initialForms);
  const [sel, setSel] = useState<string | null>(initialDetail?.id ?? null);
  const [details, setDetails] = useState<Record<string, FormDetail>>(initialDetail ? { [initialDetail.id]: initialDetail } : {});
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pushed = useRef(false);
  const paneRef = useRef<HTMLDivElement>(null);
  const isMobile = () => window.matchMedia("(max-width: 56.1875rem)").matches;

  // Abrir a ficha marca as respostas como vistas; o número "novas" da linha some na hora.
  const seen = useCallback((id: string) => {
    setForms((l) => l.map((f) => (f.id === id && f.unseen ? { ...f, unseen: 0 } : f)));
    void markSeenAction(id);
  }, []);
  useEffect(() => {
    if (initialDetail) seen(initialDetail.id);
  }, [initialDetail, seen]);

  const have = sel ? Boolean(details[sel]) : true;
  useEffect(() => {
    if (!sel || have) return;
    let alive = true;
    fetch(`/api/forms/${sel}`)
      .then((r) => (r.ok ? (r.json() as Promise<FormDetail>) : Promise.reject(new Error("Não consegui abrir o formulário."))))
      .then((d) => alive && setDetails((all) => ({ ...all, [sel]: d })))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [sel, have]);

  function select(id: string) {
    setSel(id);
    setError("");
    seen(id);
    if (isMobile()) {
      setMobileOpen(true);
      if (!pushed.current) {
        window.history.pushState({ f: id }, "", urlFor(id));
        pushed.current = true;
      } else window.history.replaceState({ f: id }, "", urlFor(id));
    } else window.history.replaceState(null, "", urlFor(id));
  }
  function closeMobile() {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      setMobileOpen(false);
      window.history.replaceState(null, "", urlFor(null));
    }
  }
  useSwipeToClose(paneRef, mobileOpen, closeMobile);
  useEffect(() => {
    function onPop() {
      pushed.current = false;
      setMobileOpen(false);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const onDetail = useCallback((d: FormDetail) => {
    setDetails((all) => ({ ...all, [d.id]: d }));
    setForms((l) => l.map((f) => (f.id === d.id ? { ...f, title: d.title, open: d.open, count: d.responses.length } : f)));
  }, []);

  async function create(template: string) {
    if (busy) return;
    setBusy(true);
    const r = await createFormAction(template);
    setBusy(false);
    if (!r.success) return setError(r.message);
    setDetails((all) => ({ ...all, [r.data.id]: r.data }));
    setForms((l) => [{ id: r.data.id, title: r.data.title, open: true, count: 0, unseen: 0 }, ...l]);
    setCreating(false);
    setFreshId(r.data.id);
    select(r.data.id);
  }

  const detail = sel ? details[sel] : undefined;

  return (
    <>
      <div className={people.wrap}>
        <div className={people.list}>
          <div className={people.head}>
            <h1 className="page">Formulários</h1>
            <div className={people.headEnd}>
              <button type="button" className="iconbtn" aria-label="Novo formulário" onClick={() => setCreating(true)}>
                <UiIcon icon={Plus} />
              </button>
            </div>
          </div>
          {forms.length ? (
            <div className={people.rows}>
              {forms.map((f) => (
                <button key={f.id} type="button" className={`${people.row} ${s.row}`} aria-current={f.id === sel ? "true" : undefined} onClick={() => select(f.id)}>
                  <span className={s.rowIcon} aria-hidden="true"><UiIcon icon={ClipboardList} /></span>
                  <span className={people.rowMain}>
                    <span className={people.rowName}>{f.title}</span>
                    <span className={people.rowSub}>{f.open ? responsesLabel(f.count) : `Fechado · ${responsesLabel(f.count)}`}</span>
                  </span>
                  {f.unseen ? <span className={s.unseen}>{f.unseen === 1 ? "1 nova" : `${f.unseen} novas`}</span> : <span />}
                </button>
              ))}
            </div>
          ) : (
            <div className={people.empty}>
              <p>Ficha de visitante, inscrição, pedido de batismo: crie um formulário e mande o link no WhatsApp. As respostas chegam aqui.</p>
              <button type="button" className={people.primary} onClick={() => setCreating(true)}>Novo formulário</button>
            </div>
          )}
          {error && !detail ? <p className={people.fErr} role="alert">{error}</p> : null}
        </div>
        <div ref={paneRef} className={`${people.pane}${mobileOpen ? " " + people.paneOpen : ""}`}>
          <button type="button" className={people.back} onClick={closeMobile}>
            <UiIcon icon={ChevronLeft} />
            Formulários
          </button>
          {detail ? (
            <FormPane
              key={detail.id}
              detail={detail}
              startEditing={detail.id === freshId}
              canAddPeople={canAddPeople}
              onDetail={onDetail}
              onDeleted={(id) => {
                const rest = forms.filter((f) => f.id !== id);
                setForms(rest);
                setSel(rest[0]?.id ?? null);
                setMobileOpen(false);
                window.history.replaceState(null, "", urlFor(rest[0]?.id ?? null));
              }}
            />
          ) : sel ? (
            <p className="muted" role={error ? "alert" : undefined}>{error || "Abrindo…"}</p>
          ) : forms.length ? (
            <p className="muted">Escolha um formulário na lista.</p>
          ) : null}
        </div>
      </div>
      {creating ? (
        <Sheet title="Novo formulário" onClose={() => setCreating(false)}>
          <p className={s.sheetLead}>Comece de um modelo e ajuste as perguntas depois.</p>
          <div className={s.templates}>
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" className={s.template} disabled={busy} onClick={() => void create(t.key)}>
                <span className={s.templateName}>{t.key === "blank" ? "Em branco" : t.title}</span>
                <span className={s.templateHint}>{TEMPLATE_HINT[t.key]}</span>
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
