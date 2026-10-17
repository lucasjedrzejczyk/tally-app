import type { ReactNode } from "react";
import { requireOrg } from "@/lib/auth/session";
import { gateFeature } from "@/features/plans/gate";
import { ReaderWorkspace } from "@/features/study/components/reader/ReaderWorkspace";

// A área de trabalho da leitura mora aqui para sobreviver à troca de capítulo (a página
// do capítulo remonta a cada navegação; o layout, não). Palavra original e comentários
// são do plano pago (spec 20): no grátis as abas mostram o Upsell.
export default async function BibleLayout({ children }: { children: ReactNode }): Promise<ReactNode> {
  const ctx = await requireOrg();
  return (
    <ReaderWorkspace original={gateFeature(ctx, "bible_original")} commentary={gateFeature(ctx, "bible_commentary")}>
      {children}
    </ReaderWorkspace>
  );
}
