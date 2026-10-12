// Tela de Encontros no servidor: os cultos, a semana pedida (a do encontro da URL ou a de hoje), as
// escalas de todos os ministérios, a ficha escolhida e as pessoas (para inscrever em evento).
import { requireStaff, can } from "@/lib/auth/session";
import { listPeople } from "@/features/sticks/queries";
import { todayIso } from "@/features/groups/domain";
import { addDays } from "@/features/ministries/domain";
import { listMinistryDetails } from "@/features/ministries/queries";
import { occurrences, parseKey, weekStart } from "../domain";
import { getEventDay, getServiceDay, listServices, weekData } from "../queries";
import type { EventDay, ServiceDay } from "../types";
import { EncontrosView } from "./EncontrosView";

export async function EncontrosScreen({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ctx = await requireStaff();
  const { supabase, orgId } = ctx;
  const today = todayIso();
  const asked = parseKey(typeof sp.o === "string" ? sp.o : null);

  const [services, ministries, people, askedDay] = await Promise.all([
    listServices(supabase, orgId),
    listMinistryDetails(supabase, orgId, today),
    listPeople(supabase, orgId).then((r) => r.people),
    asked ? (asked.kind === "service" ? getServiceDay(supabase, orgId, asked.id, asked.date) : getEventDay(supabase, orgId, asked.id)) : Promise.resolve(null),
  ]);
  const found: ServiceDay | EventDay | null = askedDay;
  const anchor = found ? (found.kind === "service" ? found.date : found.event.date) : today;
  const start = weekStart(anchor || today);
  const week = await weekData(supabase, orgId, start);

  let selected = found && asked ? (asked.kind === "service" ? `s:${asked.id}:${asked.date}` : `e:${asked.id}`) : null;
  let detail = found;
  if (!selected) {
    const list = occurrences(services, week.events, week.dates, start, addDays(start, 6));
    const pick = list.find((o) => !o.cancelled && o.date >= today) ?? list[0];
    if (pick) {
      selected = pick.key;
      detail = pick.kind === "service" ? await getServiceDay(supabase, orgId, pick.id, pick.date) : await getEventDay(supabase, orgId, pick.id);
    }
  }
  const canManage = can(ctx, "services.manage");

  return (
    <EncontrosView
      services={services}
      ministries={ministries}
      people={people}
      initialStart={start}
      initialWeek={week}
      initialSelected={selected}
      initialDetail={detail}
      initialMobileOpen={Boolean(found)}
      initialEditing={Boolean(found) && sp.edit === "1" && canManage}
      canManage={canManage}
      today={today}
    />
  );
}
