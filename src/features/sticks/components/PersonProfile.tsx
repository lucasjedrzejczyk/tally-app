"use client";

// Ficha da pessoa (spec 13, C2 e C3): cabeçalho com foto, nome e botões de ação; abaixo, ou a
// leitura enxuta (PersonRead) ou o formulário (PersonEdit). Cada campo do formulário salva ao
// sair (Server Actions); "Pronto" espera os salvamentos e volta para a leitura.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, MoreHorizontal, Phone } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { DateField } from "@/components/shared/DateField";
import { Select } from "@/components/shared/Select";
import { createClient } from "@/lib/supabase/client";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import {
  attachPhotoAction,
  preparePhotoAction,
  registerExitAction,
  setArchivedAction,
  updatePersonFieldAction,
  shareFamilyAddressAction,
} from "../actions";
import {
  EXIT_OPTIONS,
  PHOTO_BUCKET,
  addressLine,
  formatPhone,
  initialsOf,
  onlyDigits,
  profileMeta,
  whatsappLink,
  type PersonField,
  type Relationship,
} from "../domain";
import type { PersonDetail, PersonListItem } from "../types";
import { PersonEdit } from "./PersonEdit";
import { PersonRead } from "./PersonRead";
import styles from "../people.module.css";

const SAVED_MS = 1500;

// Reduz a foto para um quadrado de 512px em JPEG (centro da imagem).
async function squareJpeg(file: File, size: number): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Não consegui ler essa imagem. Use JPG, PNG ou WebP.");
  }
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")?.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Não consegui preparar a imagem."))), "image/jpeg", 0.85));
}

export function PersonProfile({
  detail,
  people,
  canEdit,
  canDocs,
  canFinance,
  focusName,
  editing,
  onEditing,
  update,
  patchList,
  onOpenPerson,
}: {
  detail: PersonDetail;
  people: PersonListItem[];
  canEdit: boolean;
  canDocs: boolean;
  canFinance: boolean;
  focusName: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  update: (id: string, fn: (d: PersonDetail) => PersonDetail) => void;
  patchList: (id: string, patch: Partial<PersonListItem>) => void;
  onOpenPerson: (id: string) => void;
}) {
  const id = detail.id;
  const v = detail.values;
  const [saved, setSaved] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const [exiting, setExiting] = useState(false);
  const [exitDate, setExitDate] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [exitErr, setExitErr] = useState("");
  const [addrErr, setAddrErr] = useState("");
  const savedTimer = useRef<number | undefined>(undefined);
  const file = useRef<HTMLInputElement>(null);
  const now = useRef(new Date());
  const router = useRouter();
  // Salvamentos em andamento e campos com erro: "Pronto" só volta para a leitura sem pendência.
  const pending = useRef(new Set<Promise<unknown>>());
  const broken = useRef(new Set<PersonField>());
  // Só troca Leitura/Editar faz o fade; abrir uma pessoa (ou filtrar) aparece sem animação.
  const first = useRef(true);

  useEffect(() => {
    first.current = false;
    return () => window.clearTimeout(savedTimer.current);
  }, []);

  function flash() {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), SAVED_MS);
  }

  async function saveNow(field: PersonField, raw: string): Promise<string | null> {
    const r = await updatePersonFieldAction(id, field, raw);
    if (!r.success) return r.message;
    const text = r.data.text;
    update(id, (d) => ({ ...d, values: { ...d.values, [field]: text } }));
    const patch: Partial<PersonListItem> = {};
    if (field === "name") patch.name = text;
    else if (field === "phone") patch.phone = text;
    else if (field === "whatsapp") patch.whatsapp = text;
    else if (field === "email") patch.email = text;
    else if (field === "birthDate") patch.birthDate = text || null;
    else if (field === "office") patch.office = text;
    else if (field === "status") patch.status = text as Relationship;
    if (Object.keys(patch).length) patchList(id, patch);
    flash();
    return null;
  }
  function save(field: PersonField, raw: string): Promise<string | null> {
    const run = saveNow(field, raw);
    const drop = () => void pending.current.delete(run);
    pending.current.add(run);
    run.then(drop, drop);
    return run;
  }
  function fieldState(field: PersonField, hasError: boolean) {
    if (hasError) broken.current.add(field);
    else broken.current.delete(field);
  }
  async function finish() {
    (document.activeElement as HTMLElement | null)?.blur?.(); // o campo aberto salva ao perder o foco
    do {
      await new Promise((r) => setTimeout(r, 0));
      await Promise.all([...pending.current]);
    } while (pending.current.size > 0);
    if (broken.current.size === 0) onEditing(false);
  }
  function onEditKey(e: React.KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented || (e.target as HTMLElement).closest('[role="dialog"], [role="menu"]')) return;
    e.preventDefault();
    void finish();
  }

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setPhotoErr("");
    try {
      const blob = await squareJpeg(f, 512);
      const prep = await preparePhotoAction(id);
      if (!prep.success) throw new Error(prep.message);
      const up = await createClient().storage.from(PHOTO_BUCKET).uploadToSignedUrl(prep.data.path, prep.data.token, blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error("Não consegui enviar a foto. Tente de novo.");
      const r = await attachPhotoAction(id, prep.data.path);
      if (!r.success) throw new Error(r.message);
      update(id, (d) => ({ ...d, photoUrl: r.data.url }));
      patchList(id, { photoUrl: r.data.url });
      flash();
    } catch (e) {
      setPhotoErr(e instanceof Error ? e.message : "Não consegui trocar a foto.");
    }
    if (file.current) file.current.value = "";
  }

  async function registerExit(close: () => void) {
    setExitErr("");
    const r = await registerExitAction(id, exitDate, exitReason);
    if (!r.success) return void setExitErr(r.message);
    update(id, (d) => ({ ...d, values: { ...d.values, exitDate, exitReason, status: "inactive" } }));
    patchList(id, { status: "inactive" });
    setExiting(false);
    close();
    flash();
  }
  async function toggleArchive(close: () => void) {
    const next = !detail.archived;
    const r = await setArchivedAction(id, next);
    close();
    if (!r.success) return;
    update(id, (d) => ({ ...d, archived: next }));
    patchList(id, { archived: next });
    flash();
  }
  async function shareAddress() {
    setAddrErr("");
    const r = await shareFamilyAddressAction(id);
    if (!r.success) return void setAddrErr(r.message);
    update(id, (d) => ({ ...d, family: r.data }));
    flash();
  }

  const family = detail.family;
  const sameAddress = Boolean(family && addressLine(v) === addressLine(family));
  const meta = profileMeta({ status: v.status, office: v.office, birthDate: v.birthDate, isLeader: v.isLeader }, detail.archived, now.current);
  const photo = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {detail.photoUrl ? <img src={detail.photoUrl} alt="" /> : initialsOf(v.name)}
    </>
  );
  const hasActions = Boolean(v.whatsapp || v.phone || v.email);
  const done = <button type="button" className={styles.primary} onClick={() => void finish()}>Pronto</button>;

  return (
    <article className={styles.prof} onKeyDown={editing ? onEditKey : undefined}>
      <div className={styles.profBar}>
        <span className={`${styles.saved}${saved ? " " + styles.savedOn : ""}`} aria-live="polite">{saved ? "Salvo" : ""}</span>
        {editing ? done : canEdit ? <button type="button" className="btn ghost sm" onClick={() => onEditing(true)}>Editar</button> : null}
        <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações da pessoa" align="right">
          {(close) =>
            exiting ? (
              <div className={styles.exitForm}>
                <label className={styles.exitLabel}>
                  Data da saída
                  <span className={`field ${styles.dateBox}`}>
                    <DateField value={exitDate} onChange={setExitDate} aria-label="Data da saída" />
                  </span>
                </label>
                <label className={styles.exitLabel}>
                  Motivo
                  <Select value={exitReason} onChange={(e) => setExitReason(e.target.value)} aria-label="Motivo da saída">
                    <option value="">Escolha o motivo</option>
                    {EXIT_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </Select>
                </label>
                {exitErr ? <p className={styles.fErr} role="alert">{exitErr}</p> : null}
                <div className={styles.exitActions}>
                  <button type="button" className={styles.primary} onClick={() => void registerExit(close)}>Registrar saída</button>
                  <button type="button" className="btn ghost sm" onClick={() => setExiting(false)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => router.push(`/people/${id}/ficha`)}>Imprimir ficha</button>
                {v.baptismDate ? (
                  <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => router.push(`/people/${id}/batismo`)}>Certificado de batismo</button>
                ) : null}
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className={studyStyles.mi}
                      onClick={() => {
                        setExitDate(new Date().toISOString().slice(0, 10));
                        setExitReason("");
                        setExitErr("");
                        setExiting(true);
                      }}
                    >
                      Registrar saída
                    </button>
                    <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void toggleArchive(close)}>
                      {detail.archived ? "Desarquivar" : "Arquivar"}
                    </button>
                  </>
                ) : null}
              </>
            )
          }
        </Popover>
      </div>

      <header className={styles.ph}>
        {editing ? (
          <>
            <button type="button" className={styles.photo} onClick={() => file.current?.click()} aria-label="Trocar a foto">{photo}</button>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </>
        ) : (
          <span className={styles.photo} aria-hidden="true">{photo}</span>
        )}
        <div className={styles.phMain}>
          <h1 className={styles.name}>{v.name}</h1>
          <p className={styles.phMeta}>{meta}</p>
        </div>
      </header>
      {photoErr ? <p className={styles.fErr} role="alert">{photoErr}</p> : null}

      {!editing && hasActions ? (
        <div className={styles.actions}>
          {v.whatsapp ? (
            <a className="btn ghost sm" href={whatsappLink(v.whatsapp)} target="_blank" rel="noreferrer"><UiIcon icon={MessageCircle} />WhatsApp</a>
          ) : null}
          {v.phone ? (
            <a className="btn ghost sm" href={`tel:${onlyDigits(v.phone)}`} title={formatPhone(v.phone)}><UiIcon icon={Phone} />Ligar</a>
          ) : null}
          {v.email ? (
            <a className="btn ghost sm" href={`mailto:${v.email}`} title={v.email}><UiIcon icon={Mail} />E-mail</a>
          ) : null}
        </div>
      ) : null}

      <div key={editing ? "edit" : "read"} className={first.current ? undefined : styles.fade}>
        {editing ? (
          <>
            <PersonEdit
              detail={detail}
              people={people}
              canDocs={canDocs}
              focusName={focusName}
              onSave={save}
              onState={fieldState}
              onFamily={(f) => update(id, (d) => ({ ...d, family: f }))}
              onSaved={flash}
              onShareAddress={() => void shareAddress()}
              addrErr={addrErr}
              sameAddress={sameAddress}
            />
            <div className={styles.doneRow}>{done}</div>
          </>
        ) : (
          <PersonRead detail={detail} canEdit={canEdit} canFinance={canFinance} now={now.current} onOpenPerson={onOpenPerson} onEdit={() => onEditing(true)} hasActions={hasActions} />
        )}
      </div>
    </article>
  );
}
