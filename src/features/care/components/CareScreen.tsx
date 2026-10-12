// Tela do Cuidado no servidor: acompanhamentos (com sugestões e a ficha escolhida) e orações.
// Quem não tem care.view vê só a aba Orações.
import { requireStaff, can } from "@/lib/auth/session";
import { listPeople } from "@/features/sticks/queries";
import { todayIso } from "@/features/groups/domain";
import { listPrayers, prayerToken } from "@/features/prayer/queries";
import { splitCare, statusGroup } from "../domain";
import { getCare, listCare, listStaff, listSuggestions } from "../queries";
import { CareView } from "./CareView";

export async function CareScreen({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ctx = await requireStaff();
  const { supabase, orgId } = ctx;
  const today = todayIso();
  const canView = can(ctx, "care.view");

  const [items, staff, people, prayers, token] = await Promise.all([
    canView ? listCare(supabase, orgId) : Promise.resolve([]),
    canView ? listStaff(supabase, orgId) : Promise.resolve([]),
    listPeople(supabase, orgId).then((r) => r.people),
    listPrayers(supabase, orgId),
    prayerToken(supabase, orgId),
  ]);
  const open = new Set(items.filter((i) => statusGroup(i.status) !== "done" && i.stickId).map((i) => i.stickId!));
  const suggestions = canView ? await listSuggestions(supabase, orgId, today, open) : [];

  const asked = typeof sp.c === "string" ? sp.c : null;
  const found = Boolean(asked && items.some((i) => i.id === asked));
  const split = splitCare(items, today);
  const selected = found ? asked : (split.open[0] ?? split.waiting[0])?.id ?? null;
  const detail = selected ? await getCare(supabase, orgId, selected) : null;

  return (
    <CareView
      initialTab={!canView || sp.tab === "oracoes" ? "prayer" : "care"}
      canView={canView}
      canManage={can(ctx, "care.manage")}
      canManagePrayer={can(ctx, "prayer.manage")}
      me={ctx.user.id}
      items={items}
      suggestions={suggestions}
      staff={staff}
      people={people}
      prayers={prayers}
      token={token}
      initialSelected={selected}
      initialDetail={detail}
      initialMobileOpen={found}
      initialEditing={found && sp.edit === "1"}
      today={today}
    />
  );
}
