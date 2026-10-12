"use client";

// Menu lateral (redesign 2026-10-01, estilo "source list" do macOS). No desktop: marca,
// "Buscar ou ir para" (Ctrl+K: referência abre o capítulo, palavra abre a busca), destinos, capítulos recentes e, embaixo, Ajustes e o
// perfil (tema, sair). Recolhe para só ícones (Ctrl+\), lembrado neste aparelho. No
// celular o menu some e vira barra de abas embaixo, ao alcance do polegar.
// Modo só Estudo (STUDY_ONLY): destinos = Bíblia, Sermões, Notas. Fora dele, os grupos
// do app viram seções (cabeçalho quieto + itens).
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { UiIcon } from "@/components/shared/UiIcon";
import { BookOpen, Mic, FileText, HandHeart, Users, UsersRound, Wallet, Trash2, Settings, Shield, Circle, PanelLeft, Search, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/shared/LogoMark";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NAV_GROUPS, TOP_ITEMS, PLANS_ITEM, SETTINGS_ITEM, ADMIN_ITEM, STUDY_ONLY, splitTabs, studyNavFor } from "@/config/nav";
import { planAllows, type PlanCode, type FeatureKey } from "@/features/plans/catalog";
import { logoutAction } from "@/app/(dashboard)/actions";
import { parseRefs } from "@/lib/bible/parse";

export interface NavCounts {
  inbox: number;
  people: number;
  tasks: number;
}

type IconName = "book" | "sermon" | "notes" | "people" | "groups" | "ministries" | "finance" | "trash" | "settings" | "admin" | "dot" | "panel" | "search" | "logout" | "more";
const ICONS = { book: BookOpen, sermon: Mic, notes: FileText, people: Users, groups: UsersRound, ministries: HandHeart, finance: Wallet, trash: Trash2,
  settings: Settings, admin: Shield, dot: Circle, panel: PanelLeft, search: Search, logout: LogOut, more: Menu };
function Icon({ name }: { name: IconName }) {
  return <UiIcon icon={ICONS[name]} className="sb-ico" />;
}

interface Dest {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  match: string[];
  count?: number;
  feature?: FeatureKey;
}
const isOn = (path: string, d: Dest): boolean =>
  d.match.some((m) => (m === "/" || m === "/study" ? path === m : path === m || path.startsWith(m + "/")));
const plain = (href: string): string[] => [href];

const MINI_KEY = "tally.nav.mini";

export function Sidebar({
  userLabel,
  orgName,
  counts,
  isPlatformAdmin = false,
  plan = "free",
  isStaff = true,
  hasCells = false,
  hasMinistries = false,
}: {
  userLabel: string;
  orgName: string;
  counts: NavCounts;
  isPlatformAdmin?: boolean;
  plan?: PlanCode;
  isStaff?: boolean; // false = líder/supervisor de célula: só Bíblia e Células
  hasCells?: boolean;
  hasMinistries?: boolean; // líder de ministério (não equipe): mostra Ministérios
}) {
  const path = usePathname();
  const router = useRouter();
  const [mini, setMini] = useState(false);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Preferência vem do aparelho, depois de montar (sem divergir da hidratação).
  useEffect(() => {
    try {
      setMini(localStorage.getItem(MINI_KEY) === "1");
    } catch {
      /* armazenamento bloqueado: menu aberto */
    }
  }, []);

  const toggleMini = useCallback((): void => {
    setMini((m) => {
      try {
        localStorage.setItem(MINI_KEY, m ? "0" : "1");
      } catch {
        /* só nesta visita */
      }
      return !m;
    });
  }, []);

  // Atalhos: Ctrl/Cmd+K vai para a busca de passagem; Ctrl/Cmd+\ recolhe o menu.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (mini) toggleMini();
        requestAnimationFrame(() => searchRef.current?.focus());
      } else if (e.key === "\\") {
        e.preventDefault();
        toggleMini();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mini, toggleMini]);

  // Menu do perfil: fecha com Esc e com clique fora.
  useEffect(() => {
    if (!menu) return;
    function onDown(e: PointerEvent): void {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setMenu(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setMenu(false);
    }
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  useEffect(() => {
    setMenu(false);
    setMore(false);
  }, [path]);

  // "Mais" da barra de abas: fecha com Esc e com toque fora.
  useEffect(() => {
    if (!more) return;
    function onDown(e: PointerEvent): void {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMore(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setMore(false);
    }
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [more]);

  // Referência vai direto ao capítulo; qualquer outro texto vira busca por palavra.
  function goToPassage(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const input = searchRef.current;
    const text = (input?.value ?? "").trim();
    if (!text) return;
    const ref = parseRefs(text)[0];
    if (input) {
      input.value = "";
      input.blur();
    }
    router.push(ref ? `/study/bible/${ref.book}/${ref.chapter}` : `/study/busca?q=${encodeURIComponent(text)}`);
  }

  const countOf = (c?: "inbox" | "people" | "tasks"): number | undefined => (c ? counts[c] || undefined : undefined);
  const navItems = studyNavFor(isStaff, hasCells, hasMinistries);
  const dests: Dest[] = STUDY_ONLY ? navItems : [];
  // ponytail: fora do modo só Estudo os itens usam um ícone genérico; desenhar um por módulo quando eles voltarem.
  const groups = STUDY_ONLY
    ? []
    : [
        { key: "top", label: "", items: TOP_ITEMS },
        ...NAV_GROUPS,
      ].map((g) => ({
        key: g.key,
        label: g.label,
        items: g.items.map<Dest>((i) => ({ key: i.key, label: i.label, href: i.href, icon: "dot", match: plain(i.href), count: countOf(i.count), feature: i.feature })),
      }));
  const footer: Dest[] = [
    ...(STUDY_ONLY && isStaff ? [{ key: "trash", label: "Lixeira", href: "/study/trash", icon: "trash" as const, match: plain("/study/trash") }] : []),
    ...(STUDY_ONLY ? [] : [{ key: PLANS_ITEM.key, label: PLANS_ITEM.label, href: PLANS_ITEM.href, icon: "dot" as const, match: plain(PLANS_ITEM.href) }]),
    { key: SETTINGS_ITEM.key, label: "Ajustes", href: SETTINGS_ITEM.href, icon: "settings", match: plain(SETTINGS_ITEM.href) },
    ...(isPlatformAdmin ? [{ key: ADMIN_ITEM.key, label: ADMIN_ITEM.label, href: ADMIN_ITEM.href, icon: "admin" as const, match: plain(ADMIN_ITEM.href) }] : []),
  ];
  const locked = (d: Dest): boolean => !STUDY_ONLY && Boolean(d.feature) && !planAllows(plan, d.feature as FeatureKey);

  const item = (d: Dest): React.ReactElement => {
    const on = isOn(path, d);
    return (
      <Link key={d.key} href={d.href} className={`sb-item${on ? " on" : ""}`} aria-current={on ? "page" : undefined} title={mini ? d.label : undefined}>
        <Icon name={d.icon} />
        <span className="sb-label">{d.label}</span>
        {d.count ? <span className="sb-count">{d.count}</span> : null}
        {locked(d) ? <span className="sb-count" title="Recurso do plano Igreja">Igreja</span> : null}
      </Link>
    );
  };

  const initial = (userLabel.trim()[0] ?? "?").toUpperCase();
  // Barra de abas do celular. Líder (não equipe): só Bíblia e Células. Equipe: cabem 5; o resto vai para "Mais".
  const tabItems: Dest[] = STUDY_ONLY
    ? [...navItems, ...(isStaff ? [{ key: "search", label: "Buscar", href: "/study/busca", icon: "search" as const, match: plain("/study/busca") }, { key: "settings", label: "Ajustes", href: SETTINGS_ITEM.href, icon: "settings" as const, match: plain(SETTINGS_ITEM.href) }] : [])]
    : [];
  const { shown: tabs, more: moreTabs } = splitTabs(tabItems);
  return (
    <>
      <aside className={`side sb${mini ? " mini" : ""}`} aria-label="Menu">
        <div className="sb-head">
          <Link href={STUDY_ONLY ? "/study/bible" : "/"} className="sb-brand" aria-label="Mercy, início">
            <LogoMark size={26} />
            <span className="sb-label wordmark">mercy</span>
          </Link>
          <button type="button" className="sb-iconbtn" onClick={toggleMini} aria-label={mini ? "Expandir menu" : "Recolher menu"} title={`${mini ? "Expandir" : "Recolher"} menu (Ctrl+\\)`}>
            <Icon name="panel" />
          </button>
        </div>

        {mini ? (
          <button type="button" className="sb-item" onClick={() => { toggleMini(); requestAnimationFrame(() => searchRef.current?.focus()); }} title="Buscar ou ir para passagem (Ctrl+K)" aria-label="Buscar ou ir para passagem">
            <Icon name="search" />
          </button>
        ) : (
          <form className="sb-search" onSubmit={goToPassage} role="search">
            <Icon name="search" />
            <input ref={searchRef} placeholder="Buscar ou ir para…" aria-label="Buscar na Bíblia ou ir para uma passagem" />
            <kbd>Ctrl K</kbd>
          </form>
        )}

        <nav className="sb-nav">
          {dests.map(item)}
          {groups.map((g) => (
            <div key={g.key} className="sb-section">
              {g.label && !mini ? <p className="sb-sectionhd">{g.label}</p> : null}
              {g.items.map(item)}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          {footer.map(item)}
          <div className="sb-profile" ref={profileRef}>
            <button type="button" className="sb-item sb-me" data-testid="profile-menu" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} title={mini ? userLabel : undefined}>
              <span className="sb-avatar" aria-hidden>{initial}</span>
              <span className="sb-label sb-who">
                <b>{userLabel}</b>
                <span>{orgName}</span>
              </span>
            </button>
            {menu ? (
              <div className="sb-menu" role="menu">
                <ThemeToggle row />
                <form action={logoutAction}>
                  <button type="submit" role="menuitem" className="sb-menuitem"><Icon name="logout" />Sair</button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      {tabs.length ? (
        <nav className="sb-tabbar" aria-label="Menu">
          {tabs.map((d) => {
            const on = isOn(path, d);
            return (
              <Link key={d.key} href={d.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
                <Icon name={d.icon} />
                <span>{d.label}</span>
              </Link>
            );
          })}
          {moreTabs.length ? (
            <div className="sb-moreWrap" ref={moreRef}>
              <button type="button" className={moreTabs.some((d) => isOn(path, d)) ? "on" : undefined} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                <Icon name="more" />
                <span>Mais</span>
              </button>
              {more ? (
                <div className="sb-more" role="menu">
                  {moreTabs.map((d) => (
                    <Link key={d.key} href={d.href} role="menuitem" className="sb-menuitem" aria-current={isOn(path, d) ? "page" : undefined}>
                      <Icon name={d.icon} />
                      {d.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
