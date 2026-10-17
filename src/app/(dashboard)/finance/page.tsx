import { requireOrg, can } from "@/lib/auth/session";
import { loadBills, loadFiles, loadLedger } from "@/features/finance/queries";
import { isoDate, today } from "@/lib/utils/date";
import { listDonations, listReceipts } from "@/features/giving/queries";
import { FinanceBoard, type FinanceTab } from "@/features/finance/components/FinanceBoard";
import { gateFeature } from "@/features/plans/gate";

// Finanças (spec 10): o livro de partidas dobradas lido em linguagem de tesoureiro.
// Área sensível: só finance.manage (o RLS m48/m30 é a barreira real). A aba vem da URL
// (?aba=dizimos) para o endereço ser compartilhável e o /giving antigo cair no lugar certo.
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await requireOrg();
  if (!can(ctx, "finance.manage")) {
    return (
      <>
        <h1 className="page">Finanças</h1>
        <div className="empty" style={{ lineHeight: 1.6, marginTop: 24 }}>
          Esta área é do tesoureiro e do dono da conta.
          <br />
          <span className="muted">Peça acesso a quem cuida das finanças da igreja.</span>
        </div>
      </>
    );
  }
  const { aba } = await searchParams;
  const tab: FinanceTab = aba === "dizimos" || aba === "fechamento" || aba === "contas" ? aba : "movimentacoes";
  // Grátis (spec 20): lançar, saldo, dízimos e fechamento. Contas, comprovantes, extrato e recibos são do pago.
  const full = gateFeature(ctx, "finance_full");
  const withBills = full && (tab === "contas" || tab === "movimentacoes");
  const [ledger, donations, receipts, billData, files] = await Promise.all([
    loadLedger(ctx.supabase, ctx.orgId),
    tab === "dizimos" ? listDonations(ctx.supabase, ctx.orgId) : Promise.resolve([]),
    tab === "dizimos" ? listReceipts(ctx.supabase, ctx.orgId) : Promise.resolve([]),
    withBills ? loadBills(ctx.supabase, ctx.orgId, isoDate(today())) : Promise.resolve({ bills: [], series: [] }),
    withBills ? loadFiles(ctx.supabase, ctx.orgId) : Promise.resolve([]),
  ]);
  return <FinanceBoard ledger={ledger} tab={tab} donations={donations} receipts={receipts} bills={billData.bills} series={billData.series} files={files} full={full} />;
}
