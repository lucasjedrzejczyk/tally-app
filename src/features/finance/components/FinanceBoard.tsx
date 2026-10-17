"use client";

// Finanças (spec 10) — casca do módulo: cabeçalho com UMA ação primária, abas, o mês à
// vista ("‹ Outubro de 2026 ›"), os painéis e o aviso com Desfazer. Salvar nunca pede
// confirmação: mostra "Desfazer" por alguns segundos.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inPeriod } from "@/lib/utils/period";
import type { Donation, ReceiptListItem } from "@/features/giving/types";
import { voidEntriesAction } from "../actions";
import { accountBalances, isGivingCategory, leafAccounts, type TxKind } from "../domain";
import type { FinanceLedger } from "../queries";
import { Panel } from "./Panel";
import { TransactionForm } from "./TransactionForm";
import { MovementDetail } from "./MovementDetail";
import { MovementsTab } from "./MovementsTab";
import { AccountsManager } from "./AccountsManager";
import { ImportPanel } from "./ImportPanel";
import { ClassifyPanel } from "./ClassifyPanel";
import { TithesTab } from "./TithesTab";
import { FinanceTabs, ReportsTabs } from "./FinanceTabs";
import { CultoForm } from "./CultoForm";
import { MonthNav, monthLabel, monthRange, shiftMonth, thisMonth } from "./MonthNav";
import { BillsTab } from "./BillsTab";
import { BillForm } from "./BillForm";
import { BillDetail } from "./BillDetail";
import { WeekStrip } from "./WeekStrip";
import { ResolvePanel } from "./ResolvePanel";
import type { Bill, BillKind, BillSeries } from "../bills";
import type { FinanceFile } from "../files";
import { ClosingTab } from "./ClosingTab";
import { Upsell } from "@/features/plans/components/Upsell";
import styles from "../finance.module.css";

const TOAST_MS = 6000;
const SHORT_TOAST_MS = 2500;

export type FinanceTab = "movimentacoes" | "contas" | "dizimos" | "fechamento";

type PanelState = { mode: "new"; kind?: TxKind; counterId?: string } | { mode: "view"; id: string } | { mode: "accounts"; pickBankFor?: string } | { mode: "culto" } | { mode: "import" } | { mode: "classify" } | { mode: "bill-new" } | { mode: "bill"; id: string } | { mode: "bill-edit"; id: string } | { mode: "resolve"; kind: BillKind } | null;
interface ToastState {
  message: string;
  undoEntryIds?: string[];
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function FinanceBoard({
  ledger,
  tab,
  donations,
  receipts,
  bills,
  series,
  files,
  full,
}: {
  ledger: FinanceLedger;
  tab: FinanceTab;
  donations: Donation[];
  receipts: ReceiptListItem[];
  bills: Bill[];
  series: BillSeries[];
  files: FinanceFile[];
  full: boolean; // plano libera Finanças completa (contas, comprovantes, extrato, recibos)
}) {
  const router = useRouter();
  const { accounts, entries, lines, movements, currency } = ledger;
  const [month, setMonth] = useState(thisMonth);
  const range = useMemo(() => monthRange(month), [month]);
  // "outubro" no ano corrente; "outubro de 2025" nos outros.
  const monthName = month.slice(0, 4) === thisMonth().slice(0, 4) ? monthLabel(month).replace(/ de \d{4}$/, "") : monthLabel(month);
  const [panel, setPanelState] = useState<PanelState>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  // Fechamento abre no mês passado: é o que o tesoureiro fecha no começo do mês.
  const [closingMonth, setClosingMonth] = useState(() => shiftMonth(thisMonth(), -1));
  const toastTimer = useRef<number | undefined>(undefined);

  // Abrir um painel tira o aviso da frente (no celular ele cobriria o botão Salvar).
  const setPanel = useCallback((next: PanelState) => {
    if (next) {
      window.clearTimeout(toastTimer.current);
      setToast(null);
    }
    setPanelState(next);
  }, []);

  const balances = useMemo(() => accountBalances(accounts, entries, lines), [accounts, entries, lines]);
  const nameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const nameOf = useCallback((id: string | null) => (id && nameById.get(id)) || "", [nameById]);
  const clipIds = useMemo(() => new Set(files.flatMap((f) => [f.billId, f.entryId]).filter((id): id is string => !!id)), [files]);
  const revenue = useMemo(() => leafAccounts(accounts, "revenue"), [accounts]);
  const titheCategoryId = revenue.find((a) => /d[ií]zimo/i.test(a.name))?.id ?? revenue.find((a) => isGivingCategory(a.name))?.id;
  const offeringCategoryId = revenue.find((a) => /oferta/i.test(a.name))?.id ?? null;
  // Conta que abre nos formulários: a padrão; sem padrão, a que mais tem lançamentos (o banco).
  const preferredAccountId = useMemo(() => {
    const assets = leafAccounts(accounts, "asset");
    const marked = assets.find((a) => a.isDefault)?.id;
    if (marked) return marked;
    const uses = new Map<string, number>();
    for (const m of movements) if (m.status === "posted" && m.accountId) uses.set(m.accountId, (uses.get(m.accountId) ?? 0) + 1);
    return [...assets].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0))[0]?.id ?? "";
  }, [accounts, movements]);
  const givingTotal = useMemo(() => {
    const giving = new Set(revenue.filter((a) => isGivingCategory(a.name)).map((a) => a.id));
    return movements
      .filter((m) => m.status === "posted" && m.kind === "in" && m.counterId && giving.has(m.counterId) && inPeriod(m.date, range))
      .reduce((s, m) => s + m.amount, 0);
  }, [movements, revenue, range]);

  const openNew = useCallback(
    () => setPanel(tab === "contas" ? { mode: "bill-new" } : tab === "dizimos" && titheCategoryId ? { mode: "culto" } : { mode: "new" }),
    [setPanel, tab, titheCategoryId],
  );

  const showToast = useCallback((t: ToastState, ms: number) => {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Atalho N: abre na hora, sem animação de espera (ação repetida).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (panel || (tab === "contas" && !full) || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openNew();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panel, openNew, tab, full]);

  const onSaved = (entryId: string, close: () => void): void => {
    close();
    setFreshId(entryId);
    router.refresh();
    showToast({ message: "Lançamento salvo", undoEntryIds: [entryId] }, TOAST_MS);
  };

  const undo = async (entryIds: string[]): Promise<void> => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
    const res = await voidEntriesAction(entryIds);
    router.refresh();
    showToast({ message: res.success ? "Lançamento desfeito" : res.message }, SHORT_TOAST_MS);
  };

  const viewing = panel?.mode === "view" ? movements.find((m) => m.id === panel.id) : undefined;
  const billOpen = panel?.mode === "bill" || panel?.mode === "bill-edit" ? bills.find((b) => b.id === panel.id) : undefined;
  const onBillDone = (message: string, close: () => void): void => {
    close();
    router.refresh();
    showToast({ message }, SHORT_TOAST_MS);
  };

  return (
    <>
      <div className={styles.head}>
        <h1 className="page">Finanças</h1>
        {tab === "fechamento" ? (
          <button type="button" className={`btn ${styles.press}`} onClick={() => window.print()}>
            Imprimir / PDF
          </button>
        ) : tab === "contas" && !full ? null : (
          <button type="button" className={`btn ${styles.press}`} onClick={openNew} title="Atalho: N">
            {tab === "contas" ? "Nova conta" : tab === "dizimos" ? "Lançar culto" : "Novo lançamento"}
          </button>
        )}
      </div>

      {tab === "fechamento" ? <ReportsTabs active="fechamento" /> : <FinanceTabs active={tab} />}
      {tab === "movimentacoes" || tab === "dizimos" ? <MonthNav month={month} onMonth={setMonth} /> : null}

      {tab === "fechamento" ? (
        <ClosingTab
          month={closingMonth}
          onMonth={setClosingMonth}
          orgName={ledger.orgName}
          accounts={accounts}
          entries={entries}
          lines={lines}
          movements={movements}
          currency={currency}
          nameOf={nameOf}
        />
      ) : tab === "contas" && !full ? (
        <Upsell feature="finance_full" />
      ) : tab === "contas" ? (
        <BillsTab bills={bills} series={series} currency={currency} nameOf={nameOf} onOpen={(id) => setPanel({ mode: "bill", id })} onNew={openNew} clipIds={clipIds} />
      ) : tab === "dizimos" ? (
        <TithesTab donations={donations} receipts={receipts} range={range} monthName={monthName} givingTotal={givingTotal} currency={currency} onRegister={openNew} full={full} />
      ) : (
        <MovementsTab
          movements={movements}
          pending={ledger.pending}
          balances={balances}
          accounts={accounts}
          range={range}
          monthName={monthName}
          currency={currency}
          nameOf={nameOf}
          freshId={freshId}
          weekStrip={bills.length > 0 ? <WeekStrip bills={bills} currency={currency} onResolve={(kind) => setPanel({ mode: "resolve", kind })} /> : null}
          onOpen={(id) => setPanel({ mode: "view", id })}
          onNew={openNew}
          onManageAccounts={() => setPanel({ mode: "accounts" })}
          onPickBank={(id) => setPanel({ mode: "accounts", pickBankFor: id })}
          onImport={() => setPanel({ mode: "import" })}
          onClassify={() => setPanel({ mode: "classify" })}
          clipIds={clipIds}
        />
      )}

      {panel?.mode === "resolve" ? (
        <Panel title={panel.kind === "in" ? "A receber esta semana" : "A pagar esta semana"} onClose={() => setPanel(null)}>
          {() => (
            <ResolvePanel
              bills={bills}
              kind={panel.kind}
              accounts={accounts}
              currency={currency}
              nameOf={nameOf}
              onChanged={() => router.refresh()}
              onOpenBill={(id) => setPanelState({ mode: "bill", id })}
              clipIds={clipIds}
            />
          )}
        </Panel>
      ) : null}

      {panel?.mode === "new" ? (
        <Panel title={panel.counterId ? "Registrar dízimo" : "Novo lançamento"} onClose={() => setPanel(null)}>
          {(close) => (
            <TransactionForm
              accounts={accounts}
              balances={balances}
              people={ledger.people}
              funds={ledger.funds}
              currency={currency}
              initialKind={panel.kind}
              initialCounterId={panel.counterId}
              preferredAccountId={preferredAccountId}
              onSaved={(id) => onSaved(id, close)}
              onCancel={close}
            />
          )}
        </Panel>
      ) : null}

      {panel?.mode === "accounts" ? (
        <Panel title="Bancos e caixa" onClose={() => setPanel(null)}>
          {(close) => <AccountsManager accounts={accounts} balances={balances} movements={movements} currency={currency} pickBankFor={panel.pickBankFor} onClose={close} />}
        </Panel>
      ) : null}

      {panel?.mode === "culto" && titheCategoryId ? (
        <Panel title="Lançar culto" onClose={() => setPanel(null)}>
          {(close) => (
            <CultoForm
              accounts={accounts}
              people={ledger.people}
              preferredAccountId={preferredAccountId}
              titheCategoryId={titheCategoryId}
              offeringCategoryId={offeringCategoryId}
              currency={currency}
              onSaved={(ids, message) => {
                close();
                router.refresh();
                showToast({ message, undoEntryIds: ids }, TOAST_MS);
              }}
              onCancel={close}
            />
          )}
        </Panel>
      ) : null}

      {panel?.mode === "import" ? (
        <Panel title="Importar extrato" onClose={() => setPanel(null)}>
          {(close) => !full ? <Upsell feature="finance_full" /> : <ImportPanel accounts={accounts} currency={currency} onClose={close} onClassify={() => setPanelState({ mode: "classify" })} />}
        </Panel>
      ) : null}

      {panel?.mode === "classify" ? (
        <Panel title="Classificar extrato" onClose={() => setPanel(null)}>
          {(close) => !full ? <Upsell feature="finance_full" /> : <ClassifyPanel accounts={accounts} movements={movements} bills={bills} people={ledger.people} currency={currency} onClose={close} />}
        </Panel>
      ) : null}

      {panel?.mode === "bill-new" || (panel?.mode === "bill-edit" && billOpen) ? (
        <Panel title={billOpen ? "Editar conta" : "Nova conta"} onClose={() => setPanel(null)}>
          {(close) => (
            <BillForm
              bill={billOpen}
              bills={bills}
              accounts={accounts}
              currency={currency}
              onSaved={(_id, message) => onBillDone(message, close)}
              onCancel={close}
            />
          )}
        </Panel>
      ) : null}

      {panel?.mode === "bill" && billOpen ? (
        <Panel title={billOpen.kind === "in" ? "A receber" : "A pagar"} onClose={() => setPanel(null)}>
          {(close) => (
            <BillDetail
              bill={billOpen}
              bills={bills}
              series={series}
              accounts={accounts}
              currency={currency}
              nameOf={nameOf}
              files={files.filter((f) => f.billId === billOpen.id)}
              onFilesChanged={() => router.refresh()}
              onEdit={() => setPanelState({ mode: "bill-edit", id: billOpen.id })}
              onDone={(message) => onBillDone(message, close)}
            />
          )}
        </Panel>
      ) : null}

      {viewing ? (
        <Panel title="Lançamento" onClose={() => setPanel(null)}>
          {(close) => (
            <MovementDetail
              movement={viewing}
              files={files.filter((f) => f.entryId === viewing.id)}
              full={full}
              onFilesChanged={() => router.refresh()}
              nameOf={nameOf}
              currency={currency}
              onClose={close}
              onVoided={() => {
                close();
                router.refresh();
                showToast({ message: "Lançamento anulado" }, SHORT_TOAST_MS);
              }}
            />
          )}
        </Panel>
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status">
          <span>{toast.message}</span>
          {toast.undoEntryIds?.length ? (
            <button type="button" onClick={() => void undo(toast.undoEntryIds ?? [])}>
              Desfazer
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
