import { requireOrg } from "@/lib/auth/session";
import { flagOn } from "@/features/flags/gate";
import { listSermons, listSeries } from "@/features/study/queries";
import { SermonLibrary } from "@/features/study/components/SermonLibrary";
import { StudyTabs } from "@/features/study/components/StudyTabs";
import type { SermonFilter } from "@/features/study/domain";

// Estudo — Sermões (Server Component): biblioteca com filtros vindos da URL
// (?f=preparo|pregados&serie=<id>&livro=<USFM>). `?ver=` antigo cai na lista sem filtro.
// `visibility` é rótulo de app (não RLS) — ver README.
export default async function StudyPage({ searchParams }: { searchParams: Promise<{ f?: string; serie?: string; livro?: string }> }) {
  const ctx = await requireOrg();
  const { supabase, orgId } = ctx;
  const sp = await searchParams;
  const initial: SermonFilter = {
    status: sp.f === "preparo" || sp.f === "pregados" ? sp.f : null,
    seriesId: sp.serie || null,
    book: sp.livro || null,
  };

  const [sermons, series] = await Promise.all([listSermons(supabase, orgId), listSeries(supabase, orgId)]);

  return (
    <>
      <StudyTabs v2={flagOn(ctx, "study.library_v2")} reader={flagOn(ctx, "study.reader")} />
      <SermonLibrary sermons={sermons} series={series} initial={initial} />
    </>
  );
}
