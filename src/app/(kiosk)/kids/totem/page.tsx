import { redirect } from "next/navigation";
import { requireStaff, can } from "@/lib/auth/session";
import { currentService, nowInChurch } from "@/features/kids/domain";
import { listRooms, listServiceOptions } from "@/features/kids/queries";
import { KidsShell } from "@/features/kids/components/KidsShell";
import { TotemView } from "@/features/kids/components/TotemView";

// Totem de Crianças (spec 18, fase C): tela cheia sem menu, num aparelho da igreja logado pela equipe.
export default async function TotemPage() {
  const ctx = await requireStaff();
  if (!can(ctx, "kids.view") && !can(ctx, "kids.manage")) redirect("/kids");
  const now = nowInChurch();
  const [rooms, services] = await Promise.all([listRooms(ctx.supabase, ctx.orgId), listServiceOptions(ctx.supabase, ctx.orgId)]);
  return (
    <KidsShell bare>
      <TotemView rooms={rooms.filter((r) => r.active)} serviceId={currentService(services, now.date, now.time)?.id ?? null} today={now.date} />
    </KidsShell>
  );
}
