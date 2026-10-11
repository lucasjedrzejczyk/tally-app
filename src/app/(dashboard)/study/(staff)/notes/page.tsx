import { requireOrg } from "@/lib/auth/session";
import { flagOn } from "@/features/flags/gate";
import { listAllTextNotes, listNotes } from "@/features/study/queries";
import { mergeNotes } from "@/features/study/domain";
import { NotesLibrary } from "@/features/study/components/NotesLibrary";
import { StudyTabs } from "@/features/study/components/StudyTabs";

// Notas (Server Component, spec 9): as do texto bíblico (study_text_notes, do próprio
// autor) e as soltas (study_notes) numa lista só; ?n=<key> abre direto uma nota.
export default async function StudyNotesPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const ctx = await requireOrg();
  const { supabase, orgId } = ctx;
  const [{ n }, loose, textNotes] = await Promise.all([searchParams, listNotes(supabase, orgId), listAllTextNotes(supabase, orgId)]);
  return (
    <>
      <StudyTabs v2={flagOn(ctx, "study.library_v2")} reader={flagOn(ctx, "study.reader")} />
      <NotesLibrary items={mergeNotes(textNotes, loose)} initialKey={n ?? null} />
    </>
  );
}
