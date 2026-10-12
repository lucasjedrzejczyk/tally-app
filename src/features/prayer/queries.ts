// Consultas de Oração. RLS: a equipe lê; pedido "só a equipe pastoral" exige prayer.view_private.
// Respondidas há +30 dias saem da lista (somem do mural sem apagar).
import type { DB } from "@/lib/auth/session";
import { type PrayerRequest, type Privacy, isPrunable } from "./domain";

const PRIV: Privacy[] = ["church", "group", "leader", "private"];
const asPrivacy = (v: string): Privacy => ((PRIV as string[]).includes(v) ? (v as Privacy) : "church");

export const PRAYER_COLS = "id, author_name, request, privacy, praying_count, answered, answered_on, created_at, status, contact";
type Row = { id: string; author_name: string | null; request: string; privacy: string; praying_count: number; answered: boolean; answered_on: string | null; created_at: string; status: string; contact: string | null };

export const toPrayer = (r: Row): PrayerRequest => ({
  id: r.id,
  author: r.author_name || "Anônimo",
  request: r.request,
  privacy: asPrivacy(r.privacy),
  praying: r.praying_count,
  answered: r.answered,
  answeredDate: r.answered_on,
  date: r.created_at.slice(0, 10),
  pending: r.status === "pending",
  contact: r.contact ?? "",
});

export async function listPrayers(supabase: DB, orgId: string): Promise<PrayerRequest[]> {
  const { data, error } = await supabase.from("prayer_requests").select(PRAYER_COLS).eq("org_id", orgId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPrayer).filter((p) => !isPrunable(p));
}

/** Pedidos do link esperando aprovação (o ponto no menu e o número na aba). */
export async function pendingPrayerCount(supabase: DB, orgId: string): Promise<number> {
  const { count } = await supabase.from("prayer_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending");
  return count ?? 0;
}

export async function prayerToken(supabase: DB, orgId: string): Promise<string | null> {
  const { data } = await supabase.from("organizations").select("prayer_token").eq("id", orgId).maybeSingle();
  return data?.prayer_token ?? null;
}
