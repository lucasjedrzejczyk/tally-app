"use client";

// Folha por cima da ficha (Marcar presença, Adicionar membros). Computador: painel no centro que
// entra com fade e escala leve. Celular: folha de baixo para cima, fecha arrastando o topo para baixo
// (30% da altura ou um peteleco). Vai para o <body> porque a ficha do celular tem transform (o fixed prenderia).
// O rodapé fica grudado no fim da área rolável, translúcido, com o conteúdo passando por baixo.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { sheetCloses } from "../domain";
import g from "../groups.module.css";

export function Sheet({ title, headExtra, onClose, children, foot, tall }: { title: string; headExtra?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; tall?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y0: number; dy: number; hist: { y: number; t: number }[] } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer.current);
    };
  }, [onClose]);

  const canDrag = () => window.matchMedia("(max-width: 40rem)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function down(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch" || drag.current || !canDrag() || (e.target as HTMLElement).closest("button, input, a")) return;
    drag.current = { id: e.pointerId, y0: e.clientY, dy: 0, hist: [{ y: e.clientY, t: e.timeStamp }] };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !sheetRef.current) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    d.hist.push({ y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 5) d.hist.shift();
  }
  function up(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = sheetRef.current;
    if (!d || e.pointerId !== d.id || !el) return;
    drag.current = null;
    const a = d.hist[0];
    const b = d.hist[d.hist.length - 1];
    const v = a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;
    if (e.type !== "pointercancel" && sheetCloses(d.dy, v, el.clientHeight)) {
      el.style.transition = "transform 200ms cubic-bezier(.32, .72, 0, 1)";
      el.style.transform = "translateY(100%)";
      timer.current = window.setTimeout(onClose, 200);
    } else {
      el.style.transition = "transform 260ms cubic-bezier(.32, .72, 0, 1)";
      el.style.transform = "";
      timer.current = window.setTimeout(() => (el.style.transition = ""), 260);
    }
  }

  return createPortal(
    <>
      <div className={g.scrim} onClick={onClose} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={title} className={`${g.sheet}${tall ? " " + g.sheetTall : ""}`}>
        <div className={g.sheetTop} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className={g.grab} aria-hidden="true" />
          <div className={g.sheetHead}>
            <h2>{title}</h2>
            {headExtra}
            <button ref={closeRef} type="button" className="iconbtn" aria-label="Fechar" onClick={onClose}>
              <UiIcon icon={X} />
            </button>
          </div>
        </div>
        <div className={g.sheetBody}>
          <div className={g.sheetPad}>{children}</div>
          {foot ? <div className={g.sheetFoot}>{foot}</div> : null}
        </div>
      </div>
    </>,
    document.body,
  );
}
