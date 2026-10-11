import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { resolveActiveCampus } from "@/lib/campus";
import { listSermons, listSeries } from "@/features/study/queries";
import { SermonEditor } from "@/features/study/components/SermonEditor";

// Editor de sermão. `[id]` = "new" (novo) ou o uuid de um sermão existente.
export default async function SermonEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ campus?: string }>;
}) {
  const { id } = await params;
  const { supabase, orgId } = await requireOrg();
  const sp = await searchParams;

  const [sermons, series, campusRes] = await Promise.all([
    listSermons(supabase, orgId),
    listSeries(supabase, orgId),
    supabase.from("campuses").select("name").eq("org_id", orgId).eq("active", true).order("name"),
  ]);

  const isNew = id === "new";
  const sermon = isNew ? null : sermons.find((s) => s.id === id) ?? null;
  if (!isNew && !sermon) notFound();

  const campuses = (campusRes.data ?? []).map((c) => c.name);
  const activeCampus = await resolveActiveCampus(campuses, sp.campus);

  return <SermonEditor sermon={sermon} series={series} activeCampus={activeCampus} />;
}
