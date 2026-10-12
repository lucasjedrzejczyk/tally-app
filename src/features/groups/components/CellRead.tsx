"use client";

// Ficha da célula em leitura (spec 14, C2): rostos em vez de linhas. Liderança com avatares 44px
// e o papel embaixo; membros numa grade de avatares 56px (quem some vem primeiro, esmaecido e com
// o número de faltas); tocar abre um balão com o recado e o que fazer (abrir a ficha, ou ligar).
// Embaixo, o gráfico dos últimos encontros.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/shared/Avatar";
import { onlyDigits, whatsappLink } from "@/features/sticks/domain";
import { Popover } from "@/features/study/components/Popover";
import studyStyles from "@/features/study/study.module.css";
import { firstName, leadershipParts, memberNote, missingFlag, orderMembers } from "../domain";
import type { CellDetail, CellMember } from "../types";
import { CellChart } from "./CellChart";
import people from "@/features/sticks/people.module.css";
import g from "../groups.module.css";

// Quantas colunas a grade tem agora (o balão abre para a esquerda nas colunas da direita, para não sair da tela).
function useColumns(ref: React.RefObject<HTMLUListElement | null>, deps: unknown[]): number {
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const read = () => {
      const el = ref.current;
      if (el) setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(" ").length));
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return cols;
}

function Face({ m, index, cols, linkNames }: { m: CellMember; index: number; cols: number; linkNames: boolean }) {
  const missing = missingFlag(m.streak);
  return (
    <Popover
      trigger={
        <>
          <span className={g.faceAvatar}>
            <Avatar name={m.name} photoUrl={m.photoUrl} size={56} className={missing ? g.faint : undefined} />
            {missing ? <span className={g.badge}>{m.streak}</span> : null}
          </span>
          <span className={g.faceName}>{firstName(m.name)}</span>
        </>
      }
      triggerClass={g.face}
      label={missing ? `${m.name}, não vem há ${m.streak} encontros` : m.name}
      haspopup="dialog"
      align={index % cols >= cols / 2 ? "right" : "left"}
    >
      {() => (
        <div className={g.who}>
          <p className={g.whoName}>{m.name}</p>
          <p className={g.whoNote}>{memberNote(m)}</p>
          {linkNames ? (
            <Link className={studyStyles.mi} href={`/people?p=${m.stickId}`}>Abrir ficha</Link>
          ) : m.phone ? (
            <>
              <a className={studyStyles.mi} href={whatsappLink(m.phone)} target="_blank" rel="noreferrer">WhatsApp</a>
              <a className={studyStyles.mi} href={`tel:${onlyDigits(m.phone)}`}>Ligar</a>
            </>
          ) : null}
        </div>
      )}
    </Popover>
  );
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
  const lead = leadershipParts(detail).flatMap((part) => part.people.map((p) => ({ ...p, role: part.label })));
  const members = orderMembers(detail.members);
  const grid = useRef<HTMLUListElement>(null);
  const cols = useColumns(grid, [members.length]);

  return (
    <>
      {lead.length ? (
        <section className={people.sec} aria-labelledby="sec-lead">
          <h2 id="sec-lead" className={people.secTitle}>Liderança</h2>
          <ul className={g.leaders}>
            {lead.map((p) => {
              const inner = (
                <>
                  <Avatar name={p.name} photoUrl={p.photoUrl} size={44} />
                  <span className={g.faceName}>{firstName(p.name)}</span>
                  <span className={g.faceRole}>{p.role}</span>
                </>
              );
              return (
                <li key={`${p.role}-${p.id}`}>
                  {linkNames ? <Link className={`${g.leader} ${g.nameLink}`} href={`/people?p=${p.id}`} aria-label={`${p.name}, ${p.role}`}>{inner}</Link> : <div className={g.leader}>{inner}</div>}
                </li>
              );
            })}
          </ul>
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
          <ul ref={grid} className={g.faces}>
            {members.map((m, i) => (
              <li key={m.stickId}>
                <Face m={m} index={i} cols={cols} linkNames={linkNames} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.sessions.length ? (
        <section className={people.sec} aria-labelledby="sec-sessions">
          <h2 id="sec-sessions" className={people.secTitle}>Encontros</h2>
          <CellChart sessions={detail.sessions} onPick={onPresence} />
        </section>
      ) : null}
    </>
  );
}
