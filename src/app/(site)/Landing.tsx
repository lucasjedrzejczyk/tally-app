import Link from "next/link";
import { BookOpen, Users, CalendarCheck, HandCoins, Landmark, MessagesSquare, HeartHandshake } from "lucide-react";
import { LogoMark } from "@/components/shared/LogoMark";
import { UiIcon } from "@/components/shared/UiIcon";
import { BibleDemo } from "./BibleDemo";
import s from "./site.module.css";

// Página pública do produto, em EN ("/") e PT ("/pt"). Um componente, dois textos.
import { SITE } from "@/config/site";
export { SITE };

type Lang = "pt" | "en";

const T = {
  pt: {
    login: "Entrar",
    lang: "English",
    langHref: "/",
    eyebrow: "Church OS",
    h1: "Estude a Palavra. Cuide das pessoas.",
    h2: "Um sistema só para a sua igreja, do estudo da Palavra ao cuidado com as pessoas.",
    lead: "Um gerente vê os 99%. Um pastor vê o um. A Mercy reúne estudo bíblico, pessoas, grupos, presença, doações e comunicação num lugar só, para que ninguém passe despercebido.",
    cta: "Entrar na Mercy",
    contact: "Falar com a gente",
    demoCaption: "A Mercy de verdade: João 1.1 com cada palavra ligada ao grego.",
    features: [
      { icon: BookOpen, title: "Estudo", text: "Bíblia em português com cada palavra ligada ao grego e ao hebraico, dicionários UBS, comentários e editor de sermão." },
      { icon: Users, title: "Pessoas", text: "Uma ficha por pessoa, com família, jornada, marcos e a memória de tudo o que aconteceu." },
      { icon: CalendarCheck, title: "Grupos e presença", text: "Grupos pequenos, cultos, eventos e chamada, com os padrões de ausência à vista." },
      { icon: HandCoins, title: "Doações", text: "Dízimos e ofertas com recibo, por fundo e por campanha, no padrão do Brasil e dos EUA." },
      { icon: Landmark, title: "Contabilidade", text: "Partidas dobradas, balancete e DRE, feitos para tesoureiro de igreja, não para contador." },
      { icon: MessagesSquare, title: "Comunicação", text: "Espaços por ministério, mensagens diretas e chat ao vivo, sem depender de grupo de WhatsApp." },
      { icon: HeartHandshake, title: "Cuidado pastoral", text: "Sinais em linguagem humana, nunca uma nota de risco: quem sumiu, quem precisa de visita, o que mudou.", soon: "em breve" },
    ],
    bandTitle: "Feito para o pastor na segunda de manhã",
    bandText: "Sem painel de empresa, sem planilha. Cada tela faz uma coisa clara e esconde o resto até ser preciso. Em português, inglês e espanhol, para igrejas no Brasil, nos Estados Unidos e na América Latina.",
    verse: "Lâmpada para os meus pés é a tua palavra e luz para o meu caminho.",
    verseRef: "Salmos 119.105",
    terms: "Termos de uso",
    privacy: "Privacidade",
    foundedLabel: "fundado em",
  },
  en: {
    login: "Sign in",
    lang: "Português",
    langHref: "/pt",
    eyebrow: "Church OS",
    h1: "Study the Word. Care for people.",
    h2: "One system for your church, from Bible study to caring for people.",
    lead: "A manager sees the 99%. A pastor sees the one. Mercy brings Bible study, people, groups, attendance, giving and communication into one place, so nobody goes unnoticed.",
    cta: "Sign in to Mercy",
    contact: "Talk to us",
    demoCaption: "The real Mercy: John 1:1 with every word linked to the Greek.",
    features: [
      { icon: BookOpen, title: "Study", text: "The Bible with every word linked to the original Greek and Hebrew, UBS dictionaries, commentaries and a sermon editor." },
      { icon: Users, title: "People", text: "One record per person, with household, journey, milestones and a timeline of everything that happened." },
      { icon: CalendarCheck, title: "Groups and attendance", text: "Small groups, services, events and check-in, with absence patterns in plain sight." },
      { icon: HandCoins, title: "Giving", text: "Tithes and offerings with receipts, by fund and campaign, following Brazilian and US rules." },
      { icon: Landmark, title: "Accounting", text: "Double-entry books, trial balance and income statement, built for a church treasurer, not an accountant." },
      { icon: MessagesSquare, title: "Communication", text: "Spaces per ministry, direct messages and live chat, without depending on WhatsApp groups." },
      { icon: HeartHandshake, title: "Pastoral care", text: "Signals in human language, never a risk score: who stopped coming, who needs a visit, what changed.", soon: "coming soon" },
    ],
    bandTitle: "Built for the pastor on Monday morning",
    bandText: "No corporate dashboard, no spreadsheet. Each screen does one clear thing and hides the rest until it is needed. In Portuguese, English and Spanish, for churches in Brazil, the United States and Latin America.",
    verse: "Your word is a lamp to my feet and a light to my path.",
    verseRef: "Psalm 119:105",
    terms: "Terms of use",
    privacy: "Privacy",
    foundedLabel: "founded",
  },
} as const;

export function SiteNav({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <header className={s.navBar}>
      <nav className={s.nav}>
        <Link href={lang === "pt" ? "/pt" : "/"} className={s.brand}>
          <LogoMark size={24} />
          <span className="wordmark">mercy</span>
        </Link>
        <div className={s.navLinks}>
          <Link href={t.langHref} className={s.navLink}>{t.lang}</Link>
          <Link href="/login" className={s.cta}>{t.login}</Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <footer className={s.foot}>
      <span>{SITE.company} · {SITE.city} · {t.foundedLabel} {SITE.founded}</span>
      <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
      <Link href="/termos">{t.terms}</Link>
      <Link href="/privacidade">{t.privacy}</Link>
    </footer>
  );
}

export function Landing({ lang }: { lang: Lang }) {
  const t = T[lang];
  return (
    <div className={s.page}>
      <SiteNav lang={lang} />
      <main className={s.wrap}>
        <section className={s.hero}>
          <p className={s.eyebrow}>{t.eyebrow}</p>
          <h1 className={s.h1}>{t.h1}</h1>
          <p className={s.lead}>{t.lead}</p>
          <div className={s.heroActions}>
            <Link href="/login" className={`${s.cta} ${s.ctaLg}`}>{t.cta}</Link>
            <a href={`mailto:${SITE.email}`} className={`${s.ghost} ${s.ctaLg}`}>{t.contact}</a>
          </div>
        </section>
        <figure className={s.demoFig}>
          <BibleDemo lang={lang} />
          <figcaption className={s.caption}>{t.demoCaption}</figcaption>
        </figure>
        <section className={s.section}>
          <h2 className={s.h2}>{t.h2}</h2>
          <div className={s.grid}>
            {t.features.map((f) => (
              <div key={f.title} className={s.feat}>
                <span className={s.featIcon}><UiIcon icon={f.icon} /></span>
                <h3>
                  {f.title}
                  {"soon" in f && f.soon ? <span className={s.soon}>{f.soon}</span> : null}
                </h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className={`${s.section} ${s.band}`}>
          <h2 className={s.h2}>{t.bandTitle}</h2>
          <p className={s.bandText}>{t.bandText}</p>
          <blockquote className={s.verse}>
            {t.verse}
            <cite>{t.verseRef}</cite>
          </blockquote>
        </section>
        <SiteFooter lang={lang} />
      </main>
    </div>
  );
}
