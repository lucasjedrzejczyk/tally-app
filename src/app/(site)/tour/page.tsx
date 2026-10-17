import type { Metadata } from "next";
import { SiteNav, SiteFooter, SITE } from "../Landing";
import s from "../site.module.css";

export const metadata: Metadata = { title: "Agende um tour · Mercy" };

// O seletor de horários é o do Google Agenda (vê a agenda do dono, cria o Meet e o convite).
export default function TourPage() {
  return (
    <div className={s.page}>
      <SiteNav lang="pt" />
      <div className={s.wrap}>
        <article className={s.doc}>
          <h1>Conheça o Mercy por dentro</h1>
          <p className={s.meta}>30 minutos por vídeo, com quem faz o Mercy.</p>
          <p>Mostramos a Bíblia, os sermões, as pessoas, as células e as finanças, e respondemos o que você quiser saber sobre usar o Mercy na sua igreja. Escolha um horário abaixo.</p>
        </article>
        <iframe className={s.tourFrame} src={`${SITE.tourUrl}?gv=true&hl=pt-BR`} title="Escolha um horário para o tour" loading="lazy" />
        <SiteFooter lang="pt" />
      </div>
    </div>
  );
}
