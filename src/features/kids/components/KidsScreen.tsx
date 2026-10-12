// Tela Hoje de Crianças no servidor (spec 18): salas, crianças, entradas abertas, o culto de agora
// e o relatório. Quem não tem kids.view vê só um aviso (no tema kids).
import { requireStaff, can } from "@/lib/auth/session";
import { todayIso } from "@/features/groups/domain";
import { addDays } from "@/features/ministries/domain";
import { currentService, nowInChurch } from "../domain";
import { lastSeen, listKids, listOpen, listRooms, listServiceOptions, recentDays } from "../queries";
import { KidsShell, NoAccess } from "./KidsShell";
import { KidsView } from "./KidsView";

export async function KidsScreen() {
  const ctx = await requireStaff();
  if (!can(ctx, "kids.view") && !can(ctx, "kids.manage")) return <KidsShell><NoAccess /></KidsShell>;
  const { supabase, orgId } = ctx;
  const now = nowInChurch();
  const today = now.date || todayIso();

  const [rooms, kids, open, services, days, seen] = await Promise.all([
    listRooms(supabase, orgId),
    listKids(supabase, orgId, today),
    listOpen(supabase, orgId),
    listServiceOptions(supabase, orgId),
    recentDays(supabase, orgId, today),
    lastSeen(supabase, orgId),
  ]);
  const limit = addDays(today, -28);
  const away = kids
    .filter((kid) => {
      const last = seen.get(kid.id);
      return last !== undefined && last < limit;
    })
    .map((kid) => ({ id: kid.id, last: seen.get(kid.id)! }));

  return (
    <KidsShell>
      <KidsView
        rooms={rooms}
        kids={kids}
        open={open}
        services={services}
        initialService={currentService(services, today, now.time)?.id ?? null}
        days={days}
        away={away}
        today={today}
        canManage={can(ctx, "kids.manage")}
      />
    </KidsShell>
  );
}
