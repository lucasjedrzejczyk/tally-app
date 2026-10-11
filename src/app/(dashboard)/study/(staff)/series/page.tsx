import { requireOrg } from "@/lib/auth/session";
import { listSermons, listSeries } from "@/features/study/queries";
import { SeriesList } from "@/features/study/components/SeriesList";

// Séries (spec 9): a antiga visão "Por série" de Sermões virou página própria.
export default async function StudySeriesPage() {
  const { supabase, orgId } = await requireOrg();
  const [sermons, series] = await Promise.all([listSermons(supabase, orgId), listSeries(supabase, orgId)]);
  const count: Record<string, number> = {};
  for (const s of sermons) if (s.series_id) count[s.series_id] = (count[s.series_id] ?? 0) + 1;
  return <SeriesList series={series} count={count} />;
}
