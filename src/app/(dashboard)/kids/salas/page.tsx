import { redirect } from "next/navigation";
import { requireStaff, can } from "@/lib/auth/session";
import { listRooms } from "@/features/kids/queries";
import { KidsShell } from "@/features/kids/components/KidsShell";
import { RoomsAdmin } from "@/features/kids/components/RoomsAdmin";

// Salas de Crianças (spec 18, D1): só quem gerencia Crianças.
export default async function KidsRoomsPage() {
  const ctx = await requireStaff();
  if (!can(ctx, "kids.manage")) redirect("/kids");
  return (
    <KidsShell>
      <RoomsAdmin rooms={await listRooms(ctx.supabase, ctx.orgId)} />
    </KidsShell>
  );
}
