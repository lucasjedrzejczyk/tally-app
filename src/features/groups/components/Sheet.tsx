"use client";

// Folha por cima da ficha (Marcar presença, Adicionar membros): painel pela direita no computador,
// tela cheia no celular. Vai para o <body> porque a ficha do celular tem transform (o fixed prenderia).
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import g from "../groups.module.css";

export function Sheet({ title, headExtra, onClose, children, foot }: { title: string; headExtra?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className={g.scrim} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={g.sheet}>
        <div className={g.sheetHead}>
          <h2>{title}</h2>
          {headExtra}
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Fechar" onClick={onClose}>
            <UiIcon icon={X} />
          </button>
        </div>
        <div className={g.sheetBody}>{children}</div>
        {foot ? <div className={g.sheetFoot}>{foot}</div> : null}
      </div>
    </>,
    document.body,
  );
}
