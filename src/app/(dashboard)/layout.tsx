import { requireOrg } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/features/admin/queries";
import { resolveActiveCampus } from "@/lib/campus";
import { Sidebar, type NavCounts } from "@/components/shared/Sidebar";
import { signals } from "@/features/signals/domain";
import { buildSignalsInput, loadOverrides } from "@/features/inbox/queries";
import { visibleSignals } from "@/features/inbox/domain";
import { pendingPrayerCount } from "@/features/prayer/queries";

// Casca protegida. Toda rota deste grupo passa por requireOrg no servidor:
// sem sessão → /login; sem org → /onboarding. Nada aqui confia no navegador.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();
  const { supabase, user, orgId, plan, isStaff, ledGroupIds, ledMinistryIds } = ctx;

  const [orgRes, campusRes, peopleRes, isAdmin, prayer] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.from("campuses").select("name").eq("org_id", orgId).eq("active", true).order("name"),
    supabase.from("sticks").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("archived", false),
    isPlatformAdmin(supabase),
    isStaff ? pendingPrayerCount(supabase, orgId) : Promise.resolve(0),
  ]);

  const orgName = orgRes.data?.name ?? "Minha igreja";
  // Uma igreja = um local: o seletor de campus saiu da UI, mas o motor de Signals
  // ainda resolve o campus ativo internamente (default = o "Sede" do cadastro).
  const campuses = (campusRes.data ?? []).map((c) => c.name);
  const activeCampus = await resolveActiveCampus(campuses);
  const userLabel = user.email?.split("@")[0] ?? "Você";

  // Badge do Inbox = nº de sinais VISÍVEIS (mesma fonte da tela /inbox: engine ao
  // vivo + signal_overrides). Custa o assembler de Signals a cada navegação (tabelas
  // pequenas no porte atual); defensivo — qualquer falha → 0, nunca derruba a casca.
  let inbox = 0;
  try {
    const [input, overrides] = await Promise.all([
      buildSignalsInput(supabase, orgId, activeCampus),
      loadOverrides(supabase, orgId),
    ]);
    inbox = visibleSignals(signals(input, new Date()), overrides).length;
  } catch {
    inbox = 0;
  }

  // tasks: feature de tarefas ainda sem contador dedicado → 0 (badge oculto).
  const counts: NavCounts = { inbox, people: peopleRes.count ?? 0, tasks: 0, prayer };

  return (
    <div className="app">
      <Sidebar userLabel={userLabel} orgName={orgName} counts={counts} isPlatformAdmin={isAdmin} plan={plan} isStaff={isStaff} hasCells={ledGroupIds.length > 0} hasMinistries={ledMinistryIds.length > 0} />
      <div className="main">
        <div className="content view-in">{children}</div>
      </div>
    </div>
  );
}
