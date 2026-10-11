// Ficha da célula em leitura (spec 14, A4): só o que existe. Liderança numa linha, membros (quem
// some primeiro), os 8 últimos encontros (tocar abre o Marcar presença daquele dia).
import Link from "next/link";
import { dayMonth, leadershipParts, orderMembers, missingFlag, shortDate } from "../domain";
import type { CellDetail } from "../types";
import people from "@/features/sticks/people.module.css";
import g from "../groups.module.css";

function Name({ id, name, link }: { id: string; name: string; link: boolean }) {
  return link ? <Link className="link" href={`/people?p=${id}`}>{name}</Link> : <>{name}</>;
}

export function CellRead({
  detail,
  canManage,
  linkNames,
  onPresence,
  onEdit,
}: {
  detail: CellDetail;
  canManage: boolean;
  linkNames: boolean;
  onPresence: (date: string) => void;
  onEdit: () => void;
}) {
  const lead = leadershipParts(detail);
  const members = orderMembers(detail.members);

  return (
    <>
      {lead.length ? (
        <section className={people.sec} aria-labelledby="sec-lead">
          <h2 id="sec-lead" className={people.secTitle}>Liderança</h2>
          <p className={people.line}>
            {lead.map((part, i) => (
              <span key={part.label}>
                {i > 0 ? <span className={people.dim}> · </span> : null}
                <span className={people.dim}>{part.label} </span>
                {part.people.map((p, j) => (
                  <span key={p.id}>
                    {j > 0 ? ", " : ""}
                    <Name id={p.id} name={p.name} link={linkNames} />
                  </span>
                ))}
              </span>
            ))}
          </p>
        </section>
      ) : null}

      <section className={people.sec} aria-labelledby="sec-members">
        <h2 id="sec-members" className={people.secTitle}>Membros ({members.length})</h2>
        {members.length === 0 ? (
          <div className={g.blank}>
            <p>Nenhum membro ainda.</p>
            {canManage ? <button type="button" className="btn ghost sm" onClick={onEdit}>Adicionar membros</button> : null}
          </div>
        ) : (
          <ul className={g.list}>
            {members.map((m) => (
              <li key={m.stickId} className={g.mRow}>
                <span className={g.mName}><Name id={m.stickId} name={m.name} link={linkNames} /></span>
                <span className={g.mNote}>
                  {missingFlag(m.streak) ? `Não vem há ${m.streak} encontros` : m.lastPresent ? `Veio dia ${dayMonth(m.lastPresent)}` : "Ainda sem presença"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.sessions.length ? (
        <section className={people.sec} aria-labelledby="sec-sessions">
          <h2 id="sec-sessions" className={people.secTitle}>Encontros</h2>
          <ul className={g.list}>
            {detail.sessions.map((s) => (
              <li key={s.date}>
                <button type="button" className={g.sessRow} onClick={() => onPresence(s.date)}>
                  {shortDate(s.date)} · {s.cancelled ? "Não teve encontro" : `${s.present} de ${s.of}`}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
