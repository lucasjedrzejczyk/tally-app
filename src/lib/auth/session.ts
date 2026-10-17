// Guarda de sessão e de organização no SERVIDOR. Toda página protegida e toda
// Server Action passa por aqui: a autorização nunca vem do navegador.
//
//  - requireUser(): garante usuário autenticado (senão → /login).
//  - requireOrg():  garante que o usuário pertence a uma org (senão → /onboarding),
//                   devolvendo o org_id, o papel e as permissões — TODOS derivados
//                   no servidor a partir de `memberships`, nunca aceitos do cliente.
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { PlanCode } from "@/features/plans/catalog";
import { effectivePlan, type PlanState } from "@/features/plans/effective";
import { nonStaffRedirect } from "@/config/nav";
import { isFlagKey, type FlagKey } from "@/features/flags/catalog";

// O tipo do cliente é derivado do próprio createClient (evita divergência de
// parâmetros genéricos do SupabaseClient entre versões).
export type DB = Awaited<ReturnType<typeof createClient>>;

export interface UserContext {
  supabase: DB;
  user: User;
}

export interface OrgContext extends UserContext {
  orgId: string;
  isOwner: boolean;
  role: string;
  roleId: string | null; // cargo atual (roles.id); null = sem cargo atribuído
  roleName: string | null; // nome do cargo (ex.: "Pastor"), para exibir na UI
  permissions: string[]; // UNIÃO: permissões do próprio membership + as do cargo
  isStaff: boolean; // equipe = dono ou alguma permissão (espelha is_org_staff do banco, m66)
  ledMinistryIds: string[]; // ministérios que o usuário lidera; idem, só para quem NÃO é equipe
  ledGroupIds: string[]; // células que o usuário lidera/supervisiona; só para quem NÃO é equipe (equipe vê todas)
  plan: PlanCode; // plano que vale agora (effectivePlan: assinatura, tolerância ou cortesia) — trava comercial
  planState: PlanState | null; // estado bruto da cobrança, para os avisos (atraso, fim de cortesia)
  flags: FlagKey[]; // feature flags LIGADAS para esta org — trava de maturidade (ver features/flags)
}

export async function requireUser(): Promise<UserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireOrg(): Promise<OrgContext> {
  const { supabase, user } = await requireUser();
  // O cargo vem embutido (FK memberships.role_id → roles). As permissões efetivas
  // são a UNIÃO das do membership com as do cargo — é assim que o has_perm do banco
  // decide (m26). Ler só `memberships.permissions` faria a UI esconder telas que o
  // RLS libera (ex.: quem é Pastor pelo cargo, sem permissão avulsa).
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, is_owner, role, permissions, role_id, roles(name, permissions), organizations(status, plan, plan_status, pro_until, grace_until)")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) redirect("/onboarding");

  // Bloqueio de igreja suspensa: se a org do usuário está 'suspended', não entra no app
  // normal — vai para /suspensa (que roda só com requireUser, sem passar por aqui, então
  // sem loop). Como este é o ÚNICO ponto por onde toda página/action protegida passa, um
  // único edit barra o app inteiro. O painel /admin usa requireUser e NÃO é afetado.
  if (data.organizations?.status === "suspended") redirect("/suspensa");

  // Feature flags da org: UMA chamada por request (org_flags devolve todas as ligadas de
  // uma vez, com a precedência resolvida no banco), nunca uma por flag. Depende do org_id,
  // então só pode vir depois da query acima. Falhou? Lista vazia — fechar é o seguro: o
  // pior caso é um módulo em obra não aparecer, nunca um módulo em obra aparecer.
  const { data: flagRows } = await supabase.rpc("org_flags", { p_org: data.org_id });

  const roleRow = data.roles;
  const permissions = [...new Set([...(data.permissions ?? []), ...(roleRow?.permissions ?? [])])];
  const isStaff = data.is_owner || permissions.length > 0;

  // Quem não é equipe só enxerga, por RLS (groups_read), as células que lidera: então a lista de
  // células visíveis É a lista das que ele lidera. A decisão nunca vem do navegador.
  let ledGroupIds: string[] = [];
  let ledMinistryIds: string[] = [];
  if (!isStaff) {
    const [led, ledM] = await Promise.all([
      supabase.from("groups").select("id").eq("org_id", data.org_id).eq("archived", false),
      supabase.from("ministries").select("id").eq("org_id", data.org_id).neq("status", "archived"),
    ]);
    ledGroupIds = (led.data ?? []).map((g) => g.id);
    ledMinistryIds = (ledM.data ?? []).map((g) => g.id);
  }

  return {
    supabase,
    user,
    orgId: data.org_id,
    isOwner: data.is_owner,
    role: data.role,
    roleId: data.role_id,
    roleName: roleRow?.name ?? null,
    permissions,
    isStaff,
    ledGroupIds,
    ledMinistryIds,
    plan: effectivePlan(data.organizations),
    planState: data.organizations,
    flags: (flagRows ?? []).filter(isFlagKey),
  };
}

// Telas só da equipe (Pessoas, Finanças, Sermões, Notas): quem não é equipe (líder de célula)
// volta para as células dele, ou para a Bíblia se não lidera nada. O RLS continua sendo a barreira.
export async function requireStaff(): Promise<OrgContext> {
  const ctx = await requireOrg();
  const to = nonStaffRedirect(ctx.isStaff, ctx.ledGroupIds.length > 0, ctx.ledMinistryIds.length > 0);
  if (to) redirect(to);
  return ctx;
}

// Autorização por capability (espelha has_perm no banco; o RLS continua sendo a
// barreira real). Owner tem tudo. Use em Actions antes de mutar dados sensíveis.
export function can(ctx: OrgContext, permission: string): boolean {
  return ctx.isOwner || ctx.permissions.includes(permission);
}
