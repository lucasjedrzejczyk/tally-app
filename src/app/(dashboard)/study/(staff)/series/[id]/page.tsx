import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/auth/session";
import { listSermons, listSeries } from "@/features/study/queries";
import { SERIES_BAND, SERIES_LBL, STATUS_BAND, STATUS_LBL, sortSermonsByDate } from "@/features/study/domain";
import { AddSermonToSeries, EditSeriesButton } from "@/features/study/components/SeriesControls";
import { setSermonSeriesAction } from "@/features/study/actions";
import { brDate } from "@/lib/utils/date";
import { UiIcon } from "@/components/shared/UiIcon";
import { ChevronLeft } from "lucide-react";
import styles from "@/features/study/study.module.css";

// Workspace da série: visão/tema, escrituras-chave (das passagens reais dos sermões),
// período e cronograma. Vincular/desvincular sermões.
export default async function SeriesWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId } = await requireOrg();

  const [series, sermons] = await Promise.all([listSeries(supabase, orgId), listSermons(supabase, orgId)]);
  const se = series.find((s) => s.id === id);
  if (!se) notFound();

  const mine = sortSermonsByDate(sermons.filter((s) => s.series_id === id), "asc");
  const addable = sermons.filter((s) => s.series_id !== id).map((s) => ({ id: s.id, title: s.title }));

  // Escrituras-chave: passagens principais distintas dos sermões da série.
  const keyScr: string[] = [];
  const seen = new Set<string>();
  for (const s of mine) {
    const p = (s.main_passage || "").trim();
    if (p && !seen.has(p)) {
      seen.add(p);
      keyScr.push(p);
    }
  }
  const period = se.start_date || se.end_date ? (brDate(se.start_date) || "…") + " — " + (brDate(se.end_date) || "…") : "sem período definido";

  return (
    <div className={styles.lib}>
      <Link href="/study" className={styles.back}><UiIcon icon={ChevronLeft} />Sermões</Link>
      <div className={styles.serHead}>
        <div>
          <h1 className="page">{se.title || "(sem título)"}</h1>
          <p className={`sub ${styles.serTheme}`}>{se.theme || "Série de ensino"}</p>
        </div>
        <EditSeriesButton series={se} />
      </div>

      <div className={styles.serSecHead}>
        <h2 className={styles.libSec}>Visão</h2>
        <span className={`hb ${SERIES_BAND[se.status] || "attention"}`}>{SERIES_LBL[se.status] || se.status}</span>
      </div>
      {se.description ? <p className={styles.serDesc}>{se.description}</p> : <p className={`muted ${styles.serDesc}`}>Sem descrição da visão ainda.</p>}
      <div className={styles.serFact}>
        <span className={styles.serFactLbl}>Período</span>
        <span>{period}</span>
      </div>
      <div className={styles.serFact}>
        <span className={styles.serFactLbl}>Escrituras-chave</span>
        {keyScr.length ? (
          <div className={styles.serChips}>
            {keyScr.map((p) => <span key={p} className={`chip ${styles.serChip}`}>{p}</span>)}
          </div>
        ) : (
          <span className="muted">As escrituras-chave aparecem conforme você define a passagem de cada sermão.</span>
        )}
      </div>

      <div className={styles.serSecHead}>
        <h2 className={styles.libSec}>Cronograma</h2>
        <span className={styles.serCount}>{mine.length} {mine.length === 1 ? "sermão" : "sermões"}</span>
      </div>
      {mine.length === 0 ? (
        <div className={styles.libEmpty}>
          <p>Nenhum sermão nesta série ainda.</p>
          <Link href="/study/sermon/new" className={styles.primary}>Novo sermão</Link>
        </div>
      ) : (
        mine.map((s) => (
          <div className={styles.serRow} key={s.id}>
            <span className={styles.srmDate}>{s.sermon_date ? brDate(s.sermon_date).slice(0, 5) : "sem data"}</span>
            <div className={styles.serRowMain}>
              <Link href={`/study/sermon/${s.id}`} className={styles.serRowTitle}>{s.title || "(sem título)"}</Link>
              {s.main_passage ? <div className={styles.serRowRef}>{s.main_passage}</div> : null}
            </div>
            <div className={styles.serRowEnd}>
              <span className={`hb ${STATUS_BAND[s.status] || "attention"}`}>{STATUS_LBL[s.status] || s.status}</span>
              <form action={setSermonSeriesAction} className={styles.inlineForm}>
                <input type="hidden" name="sermonId" value={s.id} />
                <input type="hidden" name="seriesId" value="" />
                <input type="hidden" name="backTo" value={`/study/series/${id}`} />
                <button className={styles.linkQuiet} type="submit">remover</button>
              </form>
            </div>
          </div>
        ))
      )}
      {mine.length === 0 && addable.length === 0 ? null : <AddSermonToSeries seriesId={id} options={addable} />}
    </div>
  );
}
