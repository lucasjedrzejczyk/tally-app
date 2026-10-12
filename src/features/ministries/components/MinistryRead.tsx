"use client";

// Ficha do ministério em leitura (spec 15, A4): liderança em avatares 44px, quem serve numa grade de
// rostos 56px com as funções embaixo, e os próximos cultos como cartões com os rostos escalados
// ("1 vaga" quando falta gente); tocar num cartão abre a Montar escala daquele culto.
import Link from "next/link";
import { Avatar } from "@/components/shared/Avatar";
import { firstName } from "@/features/groups/domain";
import { assignmentsOf, ministryRoleLabel, openLabel, openSlots, serviceShort, upcomingServices } from "../domain";
import type { MinistryDetail } from "../types";
import people from "@/features/sticks/people.module.css";
import g from "@/features/groups/groups.module.css";
import m from "../ministries.module.css";

export function MinistryRead({
  detail,
  today,
  canManage,
  linkNames,
  onOpen,
  onEdit,
}: {
  detail: MinistryDetail;
  today: string;
  canManage: boolean;
  linkNames: boolean;
  onOpen: (s: { date: string; time: string }) => void;
  onEdit: () => void;
}) {
  const lead = detail.members.filter((x) => x.role === "leader" || x.role === "co_leader").sort((a, b) => (a.role === b.role ? 0 : a.role === "leader" ? -1 : 1));
  const nameOf = new Map(detail.members.map((x) => [x.stickId, x]));
  const services = detail.roles.length && detail.members.length ? upcomingServices(detail, today) : [];

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
                  <span className={g.faceRole}>{ministryRoleLabel(p.role)}</span>
                </>
              );
              return (
                <li key={p.stickId}>
                  {linkNames ? <Link className={`${g.leader} ${g.nameLink}`} href={`/people?p=${p.stickId}`} aria-label={`${p.name}, ${ministryRoleLabel(p.role)}`}>{inner}</Link> : <div className={g.leader}>{inner}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {services.length ? (
        <section className={people.sec} aria-labelledby="sec-next">
          <h2 id="sec-next" className={people.secTitle}>Próximas escalas</h2>
          <ul className={m.services}>
            {services.map((s) => {
              const here = assignmentsOf(detail.assignments, s.date, s.time);
              const open = openSlots(detail, s.date, s.time);
              return (
                <li key={`${s.date}|${s.time}`}>
                  <button type="button" className={m.service} onClick={() => onOpen(s)}>
                    <span className={m.serviceTop}>
                      <span className={m.serviceDate}>{serviceShort(s.date, s.time)}</span>
                      {open ? <span className={`${g.pill} ${m.servicePill}`}>{openLabel(open)}</span> : null}
                    </span>
                    {here.length ? (
                      <span className={m.serviceFaces} role="img" aria-label={here.map((a) => `${nameOf.get(a.stickId)?.name ?? ""}, ${a.role}`).join("; ")}>
                        {here.map((a) => (
                          <Avatar key={a.id} name={nameOf.get(a.stickId)?.name ?? "?"} photoUrl={nameOf.get(a.stickId)?.photoUrl} size={32} className={m.serviceFace} />
                        ))}
                      </span>
                    ) : (
                      <span className={m.serviceEmpty}>Ninguém escalado ainda</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className={people.sec} aria-labelledby="sec-serve">
        <h2 id="sec-serve" className={people.secTitle}>Quem serve ({detail.members.length})</h2>
        {detail.members.length === 0 ? (
          <div className={g.blank}>
            <p>Ninguém servindo ainda.</p>
            {canManage ? <button type="button" className="btn ghost sm" onClick={onEdit}>Adicionar pessoas</button> : null}
          </div>
        ) : (
          <ul className={g.faces}>
            {detail.members.map((p) => {
              const inner = (
                <>
                  <Avatar name={p.name} photoUrl={p.photoUrl} size={56} />
                  <span className={g.faceName}>{firstName(p.name)}</span>
                  {p.roles.length ? <span className={m.functions}>{p.roles.join(", ")}</span> : null}
                </>
              );
              return (
                <li key={p.stickId}>
                  {linkNames ? <Link className={`${m.person} ${g.nameLink}`} href={`/people?p=${p.stickId}`} aria-label={p.roles.length ? `${p.name}: ${p.roles.join(", ")}` : p.name}>{inner}</Link> : <div className={m.person}>{inner}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
