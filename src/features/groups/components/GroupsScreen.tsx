// Tela de Células no servidor: a lista da org, a ficha já escolhida (a da URL, ou a primeira da
// lista), as pessoas (para supervisor e membros) e as permissões. `/groups` e `/groups/[id]` usam esta.
import { notFound } from "next/navigation";
import { requireOrg, can } from "@/lib/auth/session";
import { listPeople } from "@/features/sticks/queries";
import { todayIso } from "../domain";
import { getCell, listCells } from "../queries";
import { GroupsView } from "./GroupsView";

export async function GroupsScreen({ sp, forcedId }: { sp: Record<string, string | string[] | undefined>; forcedId?: string }) {
  const ctx = await requireOrg();
  const { isStaff } = ctx;
  // Líder/supervisor (não equipe): o RLS já entrega só as células dele, e a lista de Pessoas não é dele.
  const [cells, people] = await Promise.all([
    listCells(ctx.supabase, ctx.orgId),
    isStaff ? listPeople(ctx.supabase, ctx.orgId).then((r) => r.people) : Promise.resolve([]),
  ]);
  const asked = forcedId ?? (typeof sp.g === "string" ? sp.g : null);
  const found = Boolean(asked && cells.some((c) => c.id === asked));
  if (forcedId && !found) notFound();
  const selected = found ? asked : cells[0]?.id ?? null;
  const detail = selected ? await getCell(ctx.supabase, ctx.orgId, selected) : null;
  const canManage = isStaff && can(ctx, "groups.manage_all");
  const canInvite = isStaff && can(ctx, "members.manage");

  return (
    <GroupsView
      cells={cells}
      people={people}
      initialSelected={selected}
      initialDetail={detail}
      initialMobileOpen={found}
      initialEditing={found && sp.edit === "1" && canManage}
      canManage={canManage}
      canInvite={canInvite}
      isStaff={isStaff}
      today={todayIso()}
    />
  );
}
