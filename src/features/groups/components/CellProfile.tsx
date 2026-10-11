"use client";

// Ficha da célula (spec 14, A4): cabeçalho com nome e encontro, botão primário Marcar presença,
// e abaixo a leitura enxuta (CellRead). "Editar" e "···" só para quem gerencia células.
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import type { PersonListItem } from "@/features/sticks/types";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { setCellArchivedAction } from "../actions";
import { meetingLabel } from "../domain";
import type { CellDetail, CellListItem } from "../types";
import { CellRead } from "./CellRead";
import styles from "@/features/sticks/people.module.css";

const SAVED_MS = 1500;

export function CellProfile({
  detail,
  canManage,
  editing,
  onEditing,
  onArchived,
}: {
  detail: CellDetail;
  people: PersonListItem[];
  cells: CellListItem[];
  canManage: boolean;
  focusName: boolean;
  editing: boolean;
  onEditing: (on: boolean) => void;
  onDetail: (d: CellDetail) => void;
  onPatch: (id: string, fields: Partial<Pick<CellDetail, "name" | "day" | "time" | "location">>) => void;
  onMoved: (ids: string[]) => void;
  onArchived: (id: string) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  function flash() {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), SAVED_MS);
  }

  async function archive(close: () => void) {
    const r = await setCellArchivedAction(detail.id, true);
    close();
    if (!r.success) return void setErr(r.message);
    flash();
    onArchived(detail.id);
  }

  const meta = [meetingLabel(detail.day, detail.time), detail.location].filter(Boolean).join(" · ");

  return (
    <article className={styles.prof}>
      <div className={styles.profBar}>
        <span className={`${styles.saved}${saved ? " " + styles.savedOn : ""}`} aria-live="polite">{saved ? "Salvo" : ""}</span>
        {canManage ? (
          <>
            <button type="button" className="btn ghost sm" onClick={() => onEditing(!editing)}>{editing ? "Pronto" : "Editar"}</button>
            <Popover trigger={<UiIcon icon={MoreHorizontal} />} triggerClass="iconbtn" label="Mais ações da célula" align="right">
              {(close) => (
                <button type="button" role="menuitem" className={studyStyles.mi} onClick={() => void archive(close)}>Arquivar célula</button>
              )}
            </Popover>
          </>
        ) : null}
      </div>

      <header className={styles.ph}>
        <div className={styles.phMain}>
          <h1 className={styles.name}>{detail.name}</h1>
          {meta ? <p className={styles.phMeta}>{meta}</p> : null}
        </div>
      </header>
      {err ? <p className={styles.fErr} role="alert">{err}</p> : null}

      <CellRead detail={detail} canManage={canManage} linkNames onPresence={() => undefined} onEdit={() => onEditing(true)} />
    </article>
  );
}
