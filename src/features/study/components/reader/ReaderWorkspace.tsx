"use client";

// Área de trabalho da leitura (spec 07), montada pelo layout de /study/bible: sobrevive à
// troca de capítulo (a página do capítulo remonta a cada navegação). Guarda as abas, o
// bloco a caminho do sermão, o versículo da nota e o último retrato de cada sermão
// gravado; o ReaderView de cada capítulo publica aqui o capítulo atual, o léxico e os
// dados do editor.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { bookName } from "@/lib/bible/books";
import { DEFAULT_SECTION, buildKeywordBlock, type SectionKey } from "../../domain";
import type { Sermon, Series } from "../../types";
import { EMPTY_WS, chapterLabel, closeTab, glossOf, openTab, tabKey, type ChapterRef, type LexShort, type Workspace, type WsTab } from "../../reader";
import { BibleCompare } from "../BibleCompare";
import { CommentaryTab } from "./CommentaryTab";
import { NotesTab } from "./NotesTab";
import { SermonTab } from "./SermonTab";
import { WordTab } from "./WordTab";
import { Upsell } from "@/features/plans/components/Upsell";
import { WorkspacePane, type PaneView } from "./WorkspacePane";
import styles from "./reader.module.css";

export interface EditorData {
  sermons: Sermon[];
  series: Series[];
  activeCampus: string;
  locale: string;
}
export type Incoming = { block: string; section: SectionKey; seq: number };
type VerseAt = { book: string; chapter: number; verse: number };

interface WorkspaceApi {
  sermonOpen: boolean;
  wordKey: string | null; // trecho do texto cuja palavra está aberta (realce)
  wordStrong: string | null;
  jump: Jump | null; // pedido da aba Ocorrências: o capítulo-alvo seleciona a 1ª ocorrência
  open: (t: WsTab) => void;
  closeAll: () => void;
  clearJump: () => void;
  setHits: (keys: string[]) => void;
  openNotes: (at: VerseAt | null) => void;
  openCommentary: (verse: number | null) => void;
  setCommentaryVerse: (verse: number | null) => void;
  commentaryTargetVerse: number | null;
  sendBlock: (block: string, section: SectionKey) => void;
  publish: (refNow: ChapterRef, lex: Record<string, LexShort>, editor: EditorData) => void;
}

// O capítulo de origem continua montado até a rota trocar: o pedido diz o alvo para só
// o capítulo certo atendê-lo.
export type Jump = ChapterRef & { strong: string };

const Ctx = createContext<WorkspaceApi | null>(null);

export function useWorkspace(): WorkspaceApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useWorkspace fora do ReaderWorkspace");
  return api;
}

const CLOSE_MS = 200;
const PANE_KEY = "tally.reader.paneWidth";
const PANE_MIN = 320;
const TEXT_MIN = 360;
const TEXT_SELECTOR = '[data-testid="reader-text"], [data-testid="reader-original"]';

// Seleciona um trecho do texto pela chave (o clique do próprio botão abre a palavra) e
// rola até ele. Usado pelas setas, pelo contador da aba Ocorrências e pelo salto.
export function selectHit(key: string, block: ScrollLogicalPosition = "nearest"): void {
  const b = document.querySelector<HTMLButtonElement>(`[data-wkey="${CSS.escape(key)}"]`);
  if (!b) return;
  b.click();
  b.focus({ preventScroll: true });
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  b.scrollIntoView({ block, behavior: smooth && block === "center" ? "smooth" : "auto" });
}

function focusLater(get: () => HTMLElement | null): void {
  window.requestAnimationFrame(() => get()?.focus({ preventScroll: true }));
}

export function ReaderWorkspace({ children, original = true, commentary = true }: { children: ReactNode; original?: boolean; commentary?: boolean }) {
  const router = useRouter();
  const [ws, setWs] = useState<Workspace>(EMPTY_WS);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<PaneView>("split");
  const [noteAt, setNoteAt] = useState<VerseAt | null>(null);
  const [commentaryVerse, setCommentaryVerse] = useState<number | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [saved, setSaved] = useState<Record<string, Sermon>>({});
  const [refNow, setRefNow] = useState<ChapterRef | null>(null);
  const [editor, setEditor] = useState<EditorData | null>(null);
  const [lex, setLex] = useState<Record<string, LexShort>>({});
  const [hits, setHits] = useState<string[]>([]); // ocorrências da palavra aberta neste capítulo, em ordem
  const [jump, setJump] = useState<Jump | null>(null);
  const clearJump = useCallback((): void => setJump(null), []);
  const closeTimer = useRef<number | null>(null);
  const seq = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const clearCloseTimer = useCallback((): void => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const open = useCallback((t: WsTab): void => {
    clearCloseTimer();
    setClosing(false);
    setView("split"); // abrir algo traz a área de volta (recolhida ou em tela cheia)
    setWs((w) => openTab(w, t));
  }, [clearCloseTimer]);

  // Fechar tudo anima a saída e só então desmonta; o foco volta ao texto.
  const closeAll = useCallback((): void => {
    clearCloseTimer();
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      setWs(EMPTY_WS);
      setView("split");
      setClosing(false);
    }, CLOSE_MS);
    focusLater(() => document.querySelector<HTMLElement>(TEXT_SELECTOR));
  }, [clearCloseTimer]);

  function closeOne(key: string): void {
    const nextWs = closeTab(ws, key);
    if (nextWs.tabs.length === 0) return closeAll();
    setWs(nextWs);
    const active = nextWs.active;
    if (active) focusLater(() => document.getElementById(`ws-tab-${active}`));
  }

  const openNotes = useCallback((at: VerseAt | null): void => {
    setNoteAt(at);
    open({ kind: "notes" });
  }, [open]);

  const openCommentary = useCallback((v: number | null): void => {
    setCommentaryVerse(v);
    open({ kind: "commentary", verse: v });
  }, [open]);

  const sendBlock = useCallback((block: string, section: SectionKey): void => {
    seq.current += 1;
    setIncoming({ block, section, seq: seq.current });
  }, []);
  // Entregue a um editor, o bloco sai da fila: outro sermão aberto depois não o recebe.
  const onIncomingDone = useCallback((n: number): void => setIncoming((p) => (p?.seq === n ? null : p)), []);

  const publish = useCallback((r: ChapterRef, l: Record<string, LexShort>, e: EditorData): void => {
    setRefNow(r);
    setEditor(e);
    setLex((prev) => ({ ...prev, ...l }));
  }, []);

  const onSaved = useCallback((s: Sermon): void => setSaved((m) => ({ ...m, [s.id]: s })), []);

  const go = useCallback((r: ChapterRef): void => router.push(`/study/bible/${r.book}/${r.chapter}`), [router]);
  // Da aba Ocorrências: vai ao capítulo e pede para selecionar a 1ª ocorrência lá.
  const goTo = useCallback((r: ChapterRef, strong: string): void => {
    setJump({ ...r, strong });
    go(r);
  }, [go]);

  const sermonOpen = ws.tabs.some((t) => t.kind === "sermon");
  const activeTab = ws.tabs.find((t) => tabKey(t) === ws.active);
  const word = !closing && activeTab?.kind === "word" ? activeTab : null;
  const wordKey = word?.key ?? null;
  const wordStrong = word?.strong ?? null;
  const commentaryTargetVerse = !closing && activeTab?.kind === "commentary" ? commentaryVerse : null;
  const api = useMemo<WorkspaceApi>(
    () => ({ sermonOpen, wordKey, wordStrong, jump, open, closeAll, clearJump, setHits, openNotes, openCommentary, setCommentaryVerse, commentaryTargetVerse, sendBlock, publish }),
    [sermonOpen, wordKey, wordStrong, jump, open, closeAll, clearJump, openNotes, openCommentary, setCommentaryVerse, commentaryTargetVerse, sendBlock, publish],
  );

  // Divisor entre texto e área de trabalho: arrasta 1:1, duplo clique volta ao padrão,
  // setas ajustam pelo teclado. A largura fica no aparelho. Durante o arrasto escreve
  // direto no estilo (sem render a cada pixel); o estado só grava ao soltar.
  const [paneW, setPaneW] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(PANE_KEY));
      if (v >= PANE_MIN) setPaneW(v);
    } catch {
      /* sem armazenamento: largura padrão */
    }
  }, []);
  function clampPane(w: number): number {
    const total = gridRef.current?.getBoundingClientRect().width ?? 0;
    return Math.round(Math.min(Math.max(w, PANE_MIN), Math.max(PANE_MIN, total - TEXT_MIN)));
  }
  function savePane(w: number | null): void {
    setPaneW(w);
    try {
      if (w == null) localStorage.removeItem(PANE_KEY);
      else localStorage.setItem(PANE_KEY, String(w));
    } catch {
      /* preferência só nesta visita */
    }
  }
  const dragW = useRef<number | null>(null);
  function onSplitDown(e: ReactPointerEvent<HTMLDivElement>): void {
    if (dragW.current != null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragW.current = paneW ?? 0;
    document.body.style.cursor = "col-resize";
  }
  function onSplitMove(e: ReactPointerEvent<HTMLDivElement>): void {
    const el = gridRef.current;
    if (dragW.current == null || !el) return;
    dragW.current = clampPane(el.getBoundingClientRect().right - e.clientX);
    el.style.setProperty("--pane-w", `${dragW.current}px`);
  }
  function onSplitUp(): void {
    if (dragW.current == null) return;
    const w = dragW.current;
    dragW.current = null;
    document.body.style.cursor = "";
    if (w > 0) savePane(w);
  }
  function onSplitKey(e: ReactKeyboardEvent<HTMLDivElement>): void {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const now = paneW ?? document.querySelector<HTMLElement>('[data-testid="workspace"]')?.getBoundingClientRect().width ?? PANE_MIN;
    savePane(clampPane(now + (e.key === "ArrowLeft" ? 32 : -32)));
  }

  // Altura da tela = janela − o que fica acima (topo do app) − o padding de baixo do
  // `.content`. Medido, porque o topo muda de altura (quebra de linha, celular).
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const parent = el.parentElement;
    function measure(): void {
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const pad = parent ? parseFloat(getComputedStyle(parent).paddingBottom) || 0 : 0;
      el.style.setProperty("--reader-top", `${Math.round(top + pad)}px`);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    if (parent) ro.observe(parent);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const addable: { kind: "notes" | "sermon" | "commentary"; label: string }[] = [];
  if (!ws.tabs.some((t) => t.kind === "notes")) addable.push({ kind: "notes", label: "Notas" });
  if (!ws.tabs.some((t) => t.kind === "commentary")) addable.push({ kind: "commentary", label: "Comentário" });
  if (!sermonOpen) addable.push({ kind: "sermon", label: "Sermão" });

  function renderTab(t: WsTab): ReactNode {
    if (!refNow || !editor) return null;
    if (t.kind === "word") {
      if (!original) return <Upsell feature="bible_original" />;
      const l = lex[t.strong];
      const at = { book: t.book, chapter: t.chapter, verse: t.verse };
      const toSermon = (): void => {
        sendBlock(`${chapterLabel(t)}:${t.verse} · ` + buildKeywordBlock({ lemma: l?.lemma || t.strong, strong: t.strong, meaning: glossOf(l), occurrences: null }), DEFAULT_SECTION);
        open({ kind: "sermon" });
      };
      return <WordTab pick={t} lex={lex} hits={hits} refNow={refNow} activeKey={wordKey} onGo={(r) => goTo(r, t.strong)} onNote={() => openNotes(at)} onSermon={sermonOpen ? toSermon : undefined} />;
    }
    if (t.kind === "verse") {
      const r = { book: t.book, chapter: t.chapter, verse_start: t.verse, verse_end: null, reference: `${bookName(t.book)} ${t.chapter}:${t.verse}` };
      return <BibleCompare embedded initialRef={r} locale={editor.locale} onAddToSermon={sermonOpen ? sendBlock : undefined} onClose={() => closeOne(tabKey(t))} />;
    }
    if (t.kind === "notes") {
      const verse = noteAt && noteAt.book === refNow.book && noteAt.chapter === refNow.chapter ? noteAt.verse : null;
      return <NotesTab refNow={refNow} verse={verse} />;
    }
    if (t.kind === "commentary") {
      if (!commentary) return <Upsell feature="bible_commentary" />;
      const verse = commentaryVerse;
      return <CommentaryTab refNow={refNow} verse={verse} />;
    }
    return <SermonTab editor={editor} incoming={incoming} saved={saved} onSaved={onSaved} onIncomingDone={onIncomingDone} />;
  }

  const paneOn = ws.tabs.length > 0 && refNow != null && editor != null;
  return (
    <Ctx.Provider value={api}>
      <div
        ref={gridRef}
        className={`${styles.reader} ${paneOn ? styles.withPane : ""} ${paneOn && view === "full" ? styles.paneFull : ""} ${paneOn && view === "rail" ? styles.paneRail : ""}`}
        style={paneW ? ({ "--pane-w": `${paneW}px` } as CSSProperties) : undefined}
      >
        <div className={styles.col}>{children}</div>
        {paneOn ? (
          <div
            className={styles.split}
            role="separator"
            aria-orientation="vertical"
            aria-label="Largura da área de trabalho"
            aria-valuenow={paneW ?? undefined}
            tabIndex={0}
            onPointerDown={onSplitDown}
            onPointerMove={onSplitMove}
            onPointerUp={onSplitUp}
            onPointerCancel={onSplitUp}
            onDoubleClick={() => { gridRef.current?.style.removeProperty("--pane-w"); savePane(null); }}
            onKeyDown={onSplitKey}
          />
        ) : null}
        {paneOn ? (
          <WorkspacePane
            ws={ws}
            lex={lex}
            closing={closing}
            onActivate={(key) => setWs((w) => ({ ...w, active: key }))}
            onCloseTab={closeOne}
            onCloseAll={closeAll}
            renderTab={renderTab}
            addable={addable}
            onAdd={(k) => {
              if (k === "notes") openNotes(null);
              else if (k === "commentary") openCommentary(commentaryVerse);
              else open({ kind: "sermon" });
            }}
            view={view}
            onView={setView}
          />
        ) : null}
      </div>
    </Ctx.Provider>
  );
}
