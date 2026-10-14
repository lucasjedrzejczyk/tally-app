"use server";

// Marca (ou desmarca) um lembrete como feito. Guarda em signal_overrides, como as sugestões do Cuidado.
import { requireOrg } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";

export async function markReminderAction(key: string, on: boolean): Promise<ActionResult<null>> {
  if (!/^rem:[a-z]+:[0-9a-f-]{36}:[\d-]{10}(:\d+)?$/.test(key)) return fail("Lembrete inválido.");
  const ctx = await requireOrg();
  if (!ctx.isStaff) return fail("Só a equipe usa os lembretes.");
  const q = on
    ? ctx.supabase.from("signal_overrides").upsert({ org_id: ctx.orgId, signal_key: key, status: "done", updated_at: new Date().toISOString() }, { onConflict: "org_id,signal_key" })
    : ctx.supabase.from("signal_overrides").delete().eq("org_id", ctx.orgId).eq("signal_key", key);
  const { error } = await q;
  return error ? fail(toMessage(error, "Não deu para salvar. Tente de novo.")) : ok(null);
}
