"use server";

// Server Actions do painel super-admin. Suspender/reativar uma igreja passa pela RPC
// SECURITY DEFINER admin_set_org_status, que valida o status e exige is_platform_admin()
// por dentro (a barreira real). Aqui a gente confere o formato, re-checa o admin no
// servidor (defesa em profundidade — nunca confiar no cliente) e revalida a lista.
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { type ActionResult, done, fail, toMessage } from "@/lib/errors";
import { isFlagKey, parseRollout } from "@/features/flags/catalog";
import { isPlatformAdmin } from "./queries";
import { isUuid, parseOrgStatus } from "./schema";

const DENIED = "Acesso restrito à Mercy.";

// Aplica um novo status ('active' | 'suspended') a uma igreja.
export async function setOrgStatusAction(orgId: string, status: string): Promise<ActionResult> {
  if (!isUuid(orgId)) return fail("Igreja inválida.");
  const target = parseOrgStatus(status);
  if (!target) return fail("Status inválido.");

  const { supabase } = await requireUser();
  if (!(await isPlatformAdmin(supabase))) return fail(DENIED);

  try {
    const { error } = await supabase.rpc("admin_set_org_status", { p_org: orgId, p_status: target });
    if (error) return fail(toMessage(error, "Não consegui atualizar o status da igreja."));
    revalidatePath("/admin");
    return done();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// Cortesia do pago até uma data (YYYY-MM-DD), com motivo; data vazia encerra a cortesia
// (assinatura paga não é tocada). A RPC admin_grant_courtesy (m75) exige is_platform_admin()
// por dentro e grava quem deu e por quê em plan_grants.
export async function grantCourtesyAction(orgId: string, until: string, reason: string): Promise<ActionResult> {
  if (!isUuid(orgId)) return fail("Igreja inválida.");
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return fail("Data inválida.");
  if (!reason.trim()) return fail("Diga o motivo.");

  const { supabase } = await requireUser();
  if (!(await isPlatformAdmin(supabase))) return fail(DENIED);

  try {
    const { error } = await supabase.rpc("admin_grant_courtesy", {
      p_org: orgId,
      p_until: until ? `${until}T23:59:59-03:00` : null,
      p_reason: reason.trim(),
    });
    if (error) return fail(toMessage(error, "Não consegui salvar a cortesia."));
    revalidatePath("/admin");
    return done();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// Alcance global de uma feature flag. `enabled` acompanha o alcance: só 'all' vale para
// todas as igrejas — 'orgs' depende de override e 'off' não vale para ninguém. A RPC
// admin_set_flag exige is_platform_admin() por dentro (barreira real).
export async function setFlagAction(key: string, rollout: string): Promise<ActionResult> {
  if (!isFlagKey(key)) return fail("Flag desconhecida.");
  const target = parseRollout(rollout);
  if (!target) return fail("Alcance inválido.");

  const { supabase } = await requireUser();
  if (!(await isPlatformAdmin(supabase))) return fail(DENIED);

  try {
    const { error } = await supabase.rpc("admin_set_flag", {
      p_key: key,
      p_enabled: target === "all",
      p_rollout: target,
    });
    if (error) return fail(toMessage(error, "Não consegui atualizar a flag."));
    revalidatePath("/admin/flags");
    return done();
  } catch (e) {
    return fail(toMessage(e));
  }
}

// Override da flag para UMA igreja (o caminho normal: ligar na igreja de teste, validar,
// só então levar o alcance global para 'all').
export async function setFlagOrgAction(key: string, orgId: string, enabled: boolean): Promise<ActionResult> {
  if (!isFlagKey(key)) return fail("Flag desconhecida.");
  if (!isUuid(orgId)) return fail("Igreja inválida.");

  const { supabase } = await requireUser();
  if (!(await isPlatformAdmin(supabase))) return fail(DENIED);

  try {
    const { error } = await supabase.rpc("admin_set_flag_org", {
      p_key: key,
      p_org: orgId,
      p_enabled: enabled,
    });
    if (error) return fail(toMessage(error, "Não consegui atualizar a flag nesta igreja."));
    revalidatePath("/admin/flags");
    return done();
  } catch (e) {
    return fail(toMessage(e));
  }
}
