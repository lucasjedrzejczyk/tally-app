// Tela de Ministérios no servidor: a lista, a ficha escolhida (a da URL ou a primeira), as pessoas
// (para adicionar quem serve) e as permissões. `/ministries` e `/ministries/[id]` usam esta.
import { notFound } from "next/navigation";
import { requireOrg, can } from "@/lib/auth/session";
import { listPeople } from "@/features/sticks/queries";
import { todayIso } from "@/features/groups/domain";
import { getMinistry, listMinistries } from "../queries";
import { MinistriesView } from "./MinistriesView";

export async function MinistriesScreen({ sp, forcedId }: { sp: Record<string, string | string[] | undefined>; forcedId?: string }) {
  const ctx = await requireOrg();
  const { isStaff } = ctx;
  const today = todayIso();
  // Líder (não equipe): o RLS já entrega só o ministério dele, e a lista de Pessoas não é dele.
  const [items, people] = await Promise.all([
    listMinistries(ctx.supabase, ctx.orgId, today),
    isStaff ? listPeople(ctx.supabase, ctx.orgId).then((r) => r.people) : Promise.resolve([]),
  ]);
  const asked = forcedId ?? (typeof sp.m === "string" ? sp.m : null);
  const found = Boolean(asked && items.some((c) => c.id === asked));
  if (forcedId && !found) notFound();
  const selected = found ? asked : items[0]?.id ?? null;
  const detail = selected ? await getMinistry(ctx.supabase, ctx.orgId, selected, today) : null;
  const canManage = isStaff && can(ctx, "ministries.manage_all");

  return (
    <MinistriesView
      items={items}
      people={people}
      initialSelected={selected}
      initialDetail={detail}
      initialMobileOpen={found}
      initialEditing={found && sp.edit === "1" && canManage}
      canManage={canManage}
      canInvite={isStaff && can(ctx, "members.manage")}
      isStaff={isStaff}
      today={today}
    />
  );
}
