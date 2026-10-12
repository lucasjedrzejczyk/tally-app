import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/shared/LogoMark";
import { PublicPrayerForm } from "@/features/prayer/components/PublicPrayerForm";

export const metadata: Metadata = { title: "Pedido de oração", robots: { index: false } };

// Página PÚBLICA de pedido de oração (sem login, fora do menu). O token é o segredo do link;
// o nome da igreja vem do RPC prayer_link_org, e o pedido entra pendente pelo submit_prayer (m71).
export default async function PrayerLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: church } = await supabase.rpc("prayer_link_org", { p_token: token });

  return (
    <div className="gate">
      <div className="gcard">
        <LogoMark />
        {church ? (
          <PublicPrayerForm token={token} church={church} />
        ) : (
          <>
            <div className="gtitle">Pedido de oração</div>
            <div className="gsub">Este link não funciona mais. Peça um novo para a igreja.</div>
          </>
        )}
      </div>
    </div>
  );
}
