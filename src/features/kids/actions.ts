"use server";

// Ações do módulo Crianças (spec 18). A RLS é a barreira (kids.view para entrada e saída,
// kids.manage para salas, fichas e saída sem código); `can` aqui só troca o erro cru por uma frase.
import { revalidatePath } from "next/cache";
import { requireOrg, can, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { todayIso } from "@/features/groups/domain";
import { asAnimal, asColor, BLOCKED, cleanCode, isCode, matchesBlocked, phoneDigits, SUGGESTED_ROOMS } from "./domain";
import { listKids, listOpen, openByCode } from "./queries";
import type { Checkin, Kid, KidProfile, Room, TotemKid } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_PERM = "Você não tem acesso a Crianças.";
const NO_MANAGE = "Só quem gerencia Crianças pode fazer isso.";
const FAIL = "Não deu para salvar. Tente de novo.";

async function viewer(): Promise<OrgContext | null> {
  const ctx = await requireOrg();
  return can(ctx, "kids.view") || can(ctx, "kids.manage") ? ctx : null;
}
async function manager(): Promise<OrgContext | null> {
  const ctx = await requireOrg();
  return can(ctx, "kids.manage") ? ctx : null;
}

export interface CheckinInput {
  kids: { id: string; roomId: string | null }[];
  guardianId: string | null;
  serviceId: string | null;
  date: string;
  code: string;
  via: "staff" | "totem";
}

/** Entrada dos irmãos juntos com um código só. O aparelho já mostrou `code`; se ele estava em uso,
 *  o banco sorteia outro e devolve o que valeu. */
export async function checkinAction(input: CheckinInput): Promise<ActionResult<{ code: string; checkins: Checkin[] }>> {
  if (!input.kids.length || input.kids.some((k) => !UUID.test(k.id))) return fail("Escolha as crianças.");
  if (input.kids.some((k) => !k.roomId || !UUID.test(k.roomId))) return fail("Escolha a sala de cada criança.");
  if ((input.guardianId && !UUID.test(input.guardianId)) || (input.serviceId && !UUID.test(input.serviceId)) || !DATE.test(input.date)) return fail("Entrada inválida.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { data: code, error } = await ctx.supabase.rpc("kids_checkin", {
    p_org: ctx.orgId,
    p_children: input.kids.map((k) => k.id),
    p_rooms: input.kids.map((k) => k.roomId!),
    p_guardian: input.guardianId,
    p_service: input.serviceId,
    p_date: input.date,
    p_code: cleanCode(input.code),
    p_via: input.via,
  });
  if (error || !code) {
    if (error?.message.includes("kids_checkins_one_open")) return fail("Essa criança já está numa sala.");
    return fail(toMessage(error, FAIL));
  }
  const checkins = await openByCode(ctx.supabase, ctx.orgId, code);
  revalidatePath("/kids");
  return ok({ code, checkins });
}

/** Quem está aberto com esse código (para a Saída conferir no servidor, não na lista da tela). */
export async function lookupCodeAction(raw: string): Promise<ActionResult<Checkin[]>> {
  const code = cleanCode(raw);
  if (!isCode(code)) return fail("Código inválido.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  return ok(await openByCode(ctx.supabase, ctx.orgId, code));
}

/** Entrega. Confere o bloqueio da ficha no servidor; sem código só para quem gerencia. */
export async function checkoutAction(ids: string[], pickedUpBy: string, withoutCode: boolean): Promise<ActionResult<null>> {
  if (!ids.length || ids.some((i) => !UUID.test(i))) return fail("Escolha as crianças.");
  const who = pickedUpBy.trim().slice(0, 120);
  if (!who) return fail("Diga quem buscou.");
  const ctx = withoutCode ? await manager() : await viewer();
  if (!ctx) return fail(withoutCode ? NO_MANAGE : NO_PERM);
  const { data: rows } = await ctx.supabase.from("kids_checkins").select("stick_id").in("id", ids);
  const kidIds = (rows ?? []).map((r) => r.stick_id);
  const { data: prof } = kidIds.length ? await ctx.supabase.from("kids_profiles").select("pickup_blocked").in("stick_id", kidIds) : { data: [] };
  if ((prof ?? []).some((p) => matchesBlocked(who, p.pickup_blocked))) return fail(BLOCKED);
  const { error } = await ctx.supabase
    .from("kids_checkins")
    .update({ checked_out_at: new Date().toISOString(), checked_out_by: ctx.user.id, picked_up_by: who, without_code: withoutCode })
    .in("id", ids)
    .is("checked_out_at", null);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/kids");
  return ok(null);
}

export async function undoCheckoutAction(ids: string[]): Promise<ActionResult<null>> {
  if (!ids.length || ids.some((i) => !UUID.test(i))) return fail("Nada para desfazer.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase
    .from("kids_checkins")
    .update({ checked_out_at: null, checked_out_by: null, picked_up_by: null, without_code: false })
    .in("id", ids);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/kids");
  return ok(null);
}

/** Desfaz uma entrada feita por engano (apaga; a contagem do culto acompanha). */
export async function cancelCheckinAction(ids: string[]): Promise<ActionResult<null>> {
  if (!ids.length || ids.some((i) => !UUID.test(i))) return fail("Nada para desfazer.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { error } = await ctx.supabase.from("kids_checkins").delete().in("id", ids).is("checked_out_at", null);
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/kids");
  return ok(null);
}

/** Lista nova de entradas abertas (a tela da sala atualiza sozinha de tempos em tempos). */
export async function openCheckinsAction(): Promise<ActionResult<Checkin[]>> {
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  return ok(await listOpen(ctx.supabase, ctx.orgId));
}

/** Totem: família pelo telefone completo. Só primeiro nome + inicial e nascimento (para a sala). */
export async function totemLookupAction(phone: string): Promise<ActionResult<TotemKid[]>> {
  const digits = phoneDigits(phone);
  if (digits.length < 10) return fail("Digite o telefone completo.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { data, error } = await ctx.supabase.rpc("kids_totem_lookup", { p_org: ctx.orgId, p_phone: digits });
  if (error) return fail(toMessage(error, FAIL));
  const list = data ?? [];
  if (!list.length) return ok([]);
  const { data: open } = await ctx.supabase.from("kids_checkins").select("stick_id").in("stick_id", list.map((k) => k.stick_id)).is("checked_out_at", null);
  const inside = new Set((open ?? []).map((o) => o.stick_id));
  return ok(list.map((k) => ({ id: k.stick_id, label: k.label, birth: k.birth_date, guardianId: k.guardian_id, open: inside.has(k.stick_id) })));
}

export interface NewChildInput {
  name: string;
  birth: string;
  guardianId: string | null;
  guardianName: string;
  guardianPhone: string;
  allergies: string;
}

/** Criança nova na recepção: cria a pessoa, a família (se precisar) e a ficha numa tacada. */
export async function newChildAction(input: NewChildInput): Promise<ActionResult<Kid>> {
  if (!input.name.trim()) return fail("Escreva o nome da criança.");
  if (!DATE.test(input.birth)) return fail("Escolha a data de nascimento.");
  if (input.guardianId ? !UUID.test(input.guardianId) : !input.guardianName.trim()) return fail("Diga quem é o responsável.");
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { data: id, error } = await ctx.supabase.rpc("kids_new_child", {
    p_org: ctx.orgId,
    p_name: input.name.trim().slice(0, 120),
    p_birth: input.birth,
    p_guardian: input.guardianId,
    p_guardian_name: input.guardianName.trim().slice(0, 120),
    p_guardian_phone: input.guardianPhone.trim().slice(0, 30),
    p_allergies: input.allergies.trim().slice(0, 300),
  });
  if (error || !id) return fail(toMessage(error, FAIL));
  const kid = (await listKids(ctx.supabase, ctx.orgId, todayIso())).find((k) => k.id === id);
  revalidatePath("/kids");
  return kid ? ok(kid) : fail(FAIL);
}

/** Ficha sensível da criança (alergias, cuidados, quem pode e quem não pode buscar). */
export async function saveProfileAction(kidId: string, p: KidProfile): Promise<ActionResult<null>> {
  if (!UUID.test(kidId)) return fail("Criança inválida.");
  const ctx = await manager();
  if (!ctx) return fail(NO_MANAGE);
  const { error } = await ctx.supabase.from("kids_profiles").upsert({
    stick_id: kidId,
    org_id: ctx.orgId,
    allergies: p.allergies.trim().slice(0, 300) || null,
    care_notes: p.careNotes.trim().slice(0, 1000) || null,
    authorized_pickup: p.authorizedPickup.trim().slice(0, 300) || null,
    pickup_blocked: p.pickupBlocked.trim().slice(0, 300) || null,
    photo_ok: p.photoOk,
    updated_at: new Date().toISOString(),
  });
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/kids");
  revalidatePath("/people");
  return ok(null);
}

// Salas ---------------------------------------------------------------------------------------------

export async function suggestedRoomsAction(): Promise<ActionResult<null>> {
  const ctx = await manager();
  if (!ctx) return fail(NO_MANAGE);
  const { error } = await ctx.supabase.from("kids_rooms").insert(
    SUGGESTED_ROOMS.map((r, i) => ({ org_id: ctx.orgId, name: r.name, color: r.color, animal: r.animal, min_months: r.minMonths, max_months: r.maxMonths, position: i })),
  );
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/kids");
  return ok(null);
}

export type RoomInput = Pick<Room, "name" | "color" | "animal" | "minMonths" | "maxMonths" | "capacity" | "active">;

export async function saveRoomAction(id: string | null, r: RoomInput): Promise<ActionResult<null>> {
  if (id && !UUID.test(id)) return fail("Sala inválida.");
  const name = r.name.trim().slice(0, 60);
  if (!name) return fail("Dê um nome à sala.");
  const min = Math.max(0, Math.round(r.minMonths));
  const max = Math.round(r.maxMonths);
  if (!(max >= min)) return fail("A idade final precisa ser maior que a inicial.");
  const capacity = r.capacity && r.capacity > 0 ? Math.round(r.capacity) : null;
  const ctx = await manager();
  if (!ctx) return fail(NO_MANAGE);
  const row = { name, color: asColor(r.color), animal: asAnimal(r.animal), min_months: min, max_months: max, capacity, active: r.active };
  let error;
  if (id) ({ error } = await ctx.supabase.from("kids_rooms").update(row).eq("id", id));
  else {
    const { count } = await ctx.supabase.from("kids_rooms").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId);
    ({ error } = await ctx.supabase.from("kids_rooms").insert({ ...row, org_id: ctx.orgId, position: count ?? 0 }));
  }
  if (error) return fail(toMessage(error, FAIL));
  revalidatePath("/kids");
  return ok(null);
}

/** Sobe ou desce a sala na ordem (troca de posição com a vizinha). */
export async function moveRoomAction(id: string, dir: -1 | 1): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return fail("Sala inválida.");
  const ctx = await manager();
  if (!ctx) return fail(NO_MANAGE);
  const { data } = await ctx.supabase.from("kids_rooms").select("id").eq("org_id", ctx.orgId).order("position").order("created_at");
  const order = (data ?? []).map((r) => r.id);
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return ok(null);
  [order[i], order[j]] = [order[j]!, order[i]!];
  const results = await Promise.all(order.map((rid, pos) => ctx.supabase.from("kids_rooms").update({ position: pos }).eq("id", rid)));
  const err = results.find((r) => r.error)?.error;
  if (err) return fail(toMessage(err, FAIL));
  revalidatePath("/kids");
  return ok(null);
}

/** Busca de pessoas para o responsável de uma criança nova (evita cadastrar quem já é da igreja). */
export async function searchPeopleAction(q: string): Promise<ActionResult<{ id: string; name: string; phone: string }[]>> {
  const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (term.length < 2) return ok([]);
  const ctx = await viewer();
  if (!ctx) return fail(NO_PERM);
  const { data, error } = await ctx.supabase
    .from("sticks")
    .select("id, full_name, phone, whatsapp")
    .eq("org_id", ctx.orgId)
    .eq("archived", false)
    .ilike("full_name", `%${term}%`)
    .order("full_name")
    .limit(8);
  if (error) return fail(toMessage(error, FAIL));
  return ok((data ?? []).map((p) => ({ id: p.id, name: p.full_name, phone: p.whatsapp || p.phone || "" })));
}
