import { requireOrg } from "@/lib/auth/session";
import { listTrash } from "@/features/study/queries";
import { restoreFromTrashAction } from "@/features/study/actions";
import { TRASH_DAYS, TRASH_KIND_LBL, trashDaysLeft } from "@/features/study/domain";
import styles from "@/features/study/study.module.css";

// Lixeira (m57): sermões e notas excluídos ficam aqui por 30 dias e podem voltar.
// Restaurar é um form simples (funciona antes de o JS carregar).
export default async function StudyTrashPage() {
  const { supabase, orgId } = await requireOrg();
  const items = await listTrash(supabase, orgId);
  return (
    <>
      <div className={styles.headerRow}>
        <div>
          <h1 className="page">Lixeira</h1>
          <p className={`sub ${styles.subTight}`}>Sermões e notas excluídos ficam aqui por {TRASH_DAYS} dias. Depois disso somem de vez.</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty">A lixeira está vazia.</div>
      ) : (
        <ul className={styles.trashList} data-testid="trash-list">
          {items.map((it) => {
            const left = trashDaysLeft(it.deleted_at);
            return (
              <li key={it.kind + it.id} className={styles.trashRow}>
                <div className={styles.trashText}>
                  <span className={styles.trashTitle}>{it.title}</span>
                  <span className="muted">
                    {TRASH_KIND_LBL[it.kind]} · {left === 0 ? "some hoje" : left === 1 ? "some amanhã" : `some em ${left} dias`}
                  </span>
                </div>
                <form action={restoreFromTrashAction}>
                  <input type="hidden" name="kind" value={it.kind} />
                  <input type="hidden" name="id" value={it.id} />
                  <button className="btn ghost sm">Restaurar</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
