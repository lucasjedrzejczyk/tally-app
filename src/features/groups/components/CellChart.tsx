// Gráfico de colunas dos últimos encontros (spec 14, C2), em CSS puro: altura = presentes/membros,
// data curta embaixo, número em cima só em foco/hover. Encontro cancelado = coluna tracejada "sem".
// Tocar numa coluna abre o Marcar presença daquele dia.
import type { CSSProperties } from "react";
import { dayMonth } from "../domain";
import type { CellDetail } from "../types";
import g from "../groups.module.css";

export function CellChart({ sessions, onPick }: { sessions: CellDetail["sessions"]; onPick: (date: string) => void }) {
  return (
    <div className={g.chart} role="group" aria-label="Presença por encontro">
      {sessions.map((s, i) => (
        <button
          key={s.date}
          type="button"
          className={`${g.col}${i === sessions.length - 1 ? " " + g.colLast : ""}`}
          aria-label={s.cancelled ? `${dayMonth(s.date)}: sem encontro` : `${dayMonth(s.date)}: ${s.present} de ${s.of}`}
          onClick={() => onPick(s.date)}
        >
          <span className={g.colArea}>
            {s.cancelled ? (
              <span className={g.colNone}>sem</span>
            ) : (
              <>
                <span className={g.colNum}>{s.present}</span>
                <span className={g.colBar} style={{ "--h": s.ratio } as CSSProperties} />
              </>
            )}
          </span>
          <span className={g.colDate}>{dayMonth(s.date)}</span>
        </button>
      ))}
    </div>
  );
}
