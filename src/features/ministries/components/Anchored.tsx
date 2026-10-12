"use client";

// Painel pequeno preso ao elemento tocado (spec 15, B3b): no computador nasce da vaga/rosto tocado
// (transform-origin no ponto de toque), abaixo dele ou acima se não couber. No celular vira a folha
// de baixo das Células (fecha com puxão rápido). Esc e toque fora fecham.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "@/features/groups/components/Sheet";
import m from "../ministries.module.css";

const GAP = 8;
const EDGE = 16;
const WIDTH = 280;

export function Anchored({ anchor, title, onClose, children }: { anchor: HTMLElement; title: string; onClose: () => void; children: ReactNode }) {
  const [mobile] = useState(() => window.matchMedia("(max-width: 40rem)").matches);
  const panel = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    if (mobile) return;
    const r = anchor.getBoundingClientRect();
    const h = panel.current?.offsetHeight ?? 280;
    const left = Math.min(Math.max(EDGE, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - EDGE);
    const above = r.bottom + GAP + h > window.innerHeight - EDGE && r.top - GAP - h > EDGE;
    const x = `${Math.round(r.left + r.width / 2 - left)}px`;
    const el = panel.current;
    if (!el) return;
    el.style.left = `${left}px`;
    el.style.top = above ? "" : `${r.bottom + GAP}px`;
    el.style.bottom = above ? `${window.innerHeight - r.top + GAP}px` : "";
    el.style.transformOrigin = `${x} ${above ? "100%" : "0"}`;
    setPlaced(true);
  }, [anchor, mobile]);

  useEffect(() => {
    if (mobile) return;
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
      anchor.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, mobile, onClose]);

  if (mobile) return <Sheet title={title} onClose={onClose}>{children}</Sheet>;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={title}
      className={`${m.anchored}${placed ? " " + m.anchoredOn : ""}`}
    >
      {children}
    </div>,
    document.body,
  );
}
