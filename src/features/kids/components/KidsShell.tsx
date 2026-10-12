// Casca do tema mercy kids: troca os tokens (cores, fonte, cantos) só dentro do módulo, sem fade.
import type { ReactNode } from "react";
import { kidsFonts } from "../fonts";
import { Lamb } from "./Brand";
import k from "../kids.module.css";

/** Classe do tema para usar também em portais (folhas vão para o <body>). */
export const KIDS_THEME = `${k.theme} ${kidsFonts}`;

export function KidsShell({ children, bare }: { children: ReactNode; bare?: boolean }) {
  return <div className={`${KIDS_THEME} ${bare ? k.bare : k.page}`}>{children}</div>;
}

export function NoAccess() {
  return (
    <div className={k.empty}>
      <Lamb size={96} />
      <h1>Crianças</h1>
      <p>Você ainda não tem acesso a esta área. Peça para a liderança liberar &quot;Fazer entrada e saída das crianças&quot; no seu cargo.</p>
    </div>
  );
}
