"use server";

// Server Actions de Pessoas (spec 13). Cada uma: 1) confere a sessão/org e a permissão no
// servidor; 2) valida a entrada; 3) grava no Supabase (RLS é a barreira real); 4) devolve um
// resultado simples para a tela. Nada de user/org vindo do navegador.
import { requireOrg, can, type DB, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { canEditPeople } from "./access";
import { FAMILY_ROLES, FIELD_META, PHOTO_BUCKET, isPersonField, lastNameOf, positionForJourneyCode, type FamilyRole } from "./domain";
import { loadFamily } from "./queries";
import { validateExit, validateField } from "./schema";
import type { TablesUpdate } from "@/lib/database.types";
import type { Family } from "./types";

const DENIED = "Você não tem permissão para editar pessoas.";
const DENIED_DOCS = "Só quem gerencia membros pode mexer em documentos.";

// Id do estágio de jornada para um código (via position na journey default da org).
async function stageIdForCode(supabase: DB, code: string): Promise<string | null> {
  const position = positionForJourneyCode(code);
  const { data } = await supabase.from("journey_stages").select("id").eq("position", position).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function editorOrg(): Promise<{ ctx: OrgContext } | { error: ActionResult<never> }> {
  const ctx = await requireOrg();
  return canEditPeople(ctx) ? { ctx } : { error: fail(DENIED) };
}

// A pessoa existe e é desta org (o RLS já barra, isto devolve uma mensagem clara).
async function stickOf(supabase: DB, orgId: string, id: string): Promise<{ id: string; full_name: string } | null> {
  const { data } = await supabase.from("sticks").select("id, full_name").eq("org_id", orgId).eq("id", id).maybeSingle();
  return data;
}

const today = (): string => new Date().toISOString().slice(0, 10);

// Cria a ficha só com o nome provisório (a tela abre com o foco no nome). Situação padrão: Visitante.
export async function createPersonAction(): Promise<ActionResult<{ id: string }>> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  try {
    const stageId = await stageIdForCode(supabase, "first_visit");
    const { data, error } = await supabase
      .from("sticks")
      .insert({
        org_id: orgId,
        full_name: "Nova pessoa",
        relationship_status: "visitor_first",
        first_visit_date: today(),
        source: "Adicionado manualmente",
        journey_stage_id: stageId,
      })
      .select("id")
      .single();
    if (error || !data) return fail(toMessage(error, "Não consegui criar a pessoa."));
    return ok({ id: data.id });
  } catch (e) {
    return fail(toMessage(e));
  }
}

// Salva UM campo da ficha. Lista fechada de campos (FIELD_META); CPF e RG vão para stick_documents.
// Devolve o texto canônico (ex.: UF em maiúsculas) para a tela mostrar.
export async function updatePersonFieldAction(id: string, field: string, value: string): Promise<ActionResult<{ text: string }>> {
  if (!isPersonField(field)) return fail("Campo inválido.");
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { ctx } = g;
  const { supabase, orgId } = ctx;
  const v = validateField(field, value);
  if (!v.ok) return fail(v.error);
  try {
    if (!(await stickOf(supabase, orgId, id))) return fail("Pessoa não encontrada.");
    const column = FIELD_META[field].column;
    if (column === null) {
      if (!can(ctx, "members.manage")) return fail(DENIED_DOCS);
      const { error } = await supabase
        .from("stick_documents")
        .upsert({ stick_id: id, org_id: orgId, [field]: v.value, updated_at: new Date().toISOString() } as { stick_id: string; org_id: string }, { onConflict: "stick_id" });
      if (error) return fail(toMessage(error, "Não consegui salvar."));
    } else {
      const patch: TablesUpdate<"sticks"> = { updated_at: new Date().toISOString() };
      (patch as Record<string, unknown>)[column] = v.value;
      const { error } = await supabase.from("sticks").update(patch).eq("org_id", orgId).eq("id", id);
      if (error) return fail(toMessage(error, "Não consegui salvar."));
    }
    return ok({ text: v.text });
  } catch (e) {
    return fail(toMessage(e));
  }
}

// Saída da igreja: data, motivo e a pessoa passa a Inativa.
export async function registerExitAction(id: string, date: string, reason: string): Promise<ActionResult> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const v = validateExit(date, reason);
  if (!v.ok) return fail(v.error);
  const { error } = await supabase
    .from("sticks")
    .update({ exit_date: date, exit_reason: reason, relationship_status: "inactive", updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  return error ? fail(toMessage(error, "Não consegui registrar a saída.")) : ok(undefined);
}

// Desfaz a saída: limpa data e motivo e a pessoa volta a Membro.
export async function undoExitAction(id: string): Promise<ActionResult> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const { error } = await supabase
    .from("sticks")
    .update({ exit_date: null, exit_reason: null, relationship_status: "member", updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  return error ? fail(toMessage(error, "Não consegui desfazer a saída.")) : ok(undefined);
}

export async function setArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const { error } = await supabase
    .from("sticks")
    .update({ archived, archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  return error ? fail(toMessage(error, "Não consegui salvar.")) : ok(undefined);
}

// ---- Família -----------------------------------------------------------------------------

// Cria a casa "Família <sobrenome>" já com `head` dentro.
async function createFamily(supabase: DB, orgId: string, stickId: string, name: string): Promise<string | null> {
  const hh = await supabase.from("households").insert({ org_id: orgId, name: `Família ${lastNameOf(name)}`.trim() }).select("id").single();
  if (hh.error || !hh.data) return null;
  const m = await supabase.from("household_members").insert({ household_id: hh.data.id, stick_id: stickId, relationship_type: "head" });
  if (m.error) {
    await supabase.from("households").delete().eq("id", hh.data.id);
    return null;
  }
  return hh.data.id;
}

// Junta a pessoa à família de `withId` (cria a família dela se não tiver) ou, sem `withId`, cria uma família nova.
export async function addToFamilyAction(id: string, withId: string | null): Promise<ActionResult<Family>> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  try {
    const me = await stickOf(supabase, orgId, id);
    if (!me) return fail("Pessoa não encontrada.");
    const mine = await supabase.from("household_members").select("id").eq("stick_id", id).maybeSingle();
    if (mine.data) return fail("Esta pessoa já está em uma família.");

    let householdId: string | null;
    if (withId) {
      const other = await stickOf(supabase, orgId, withId);
      if (!other) return fail("Pessoa não encontrada.");
      const link = await supabase.from("household_members").select("household_id").eq("stick_id", withId).maybeSingle();
      householdId = link.data?.household_id ?? (await createFamily(supabase, orgId, withId, other.full_name));
      if (!householdId) return fail("Não consegui criar a família.");
      const ins = await supabase.from("household_members").insert({ household_id: householdId, stick_id: id, relationship_type: "other" });
      if (ins.error) return fail(toMessage(ins.error, "Não consegui juntar à família."));
    } else {
      householdId = await createFamily(supabase, orgId, id, me.full_name);
      if (!householdId) return fail("Não consegui criar a família.");
    }
    const family = await loadFamily(supabase, householdId);
    return family ? ok(family) : fail("Não consegui abrir a família.");
  } catch (e) {
    return fail(toMessage(e));
  }
}

export async function setFamilyRoleAction(stickId: string, role: string): Promise<ActionResult> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  if (!(FAMILY_ROLES as readonly string[]).includes(role)) return fail("Papel inválido.");
  const { error } = await g.ctx.supabase.from("household_members").update({ relationship_type: role as FamilyRole }).eq("stick_id", stickId);
  return error ? fail(toMessage(error, "Não consegui salvar.")) : ok(undefined);
}

// Tira a pessoa da família; casa que ficar vazia é apagada.
export async function removeFromFamilyAction(id: string): Promise<ActionResult> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase } = g.ctx;
  const link = await supabase.from("household_members").select("household_id").eq("stick_id", id).maybeSingle();
  if (!link.data) return ok(undefined);
  const del = await supabase.from("household_members").delete().eq("stick_id", id);
  if (del.error) return fail(toMessage(del.error, "Não consegui tirar da família."));
  const left = await supabase.from("household_members").select("id", { count: "exact", head: true }).eq("household_id", link.data.household_id);
  if (!left.error && (left.count ?? 0) === 0) await supabase.from("households").delete().eq("id", link.data.household_id);
  return ok(undefined);
}

// Copia o endereço da pessoa para a casa (os outros da família passam a ver "Endereço da família").
export async function shareFamilyAddressAction(id: string): Promise<ActionResult<Family>> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const [link, s] = await Promise.all([
    supabase.from("household_members").select("household_id").eq("stick_id", id).maybeSingle(),
    supabase.from("sticks").select("address_line_1, address_line_2, city, state, postal_code").eq("org_id", orgId).eq("id", id).maybeSingle(),
  ]);
  if (!link.data || !s.data) return fail("Esta pessoa não está em uma família.");
  const up = await supabase
    .from("households")
    .update({ address_line_1: s.data.address_line_1, address_line_2: s.data.address_line_2, city: s.data.city, state: s.data.state, postal_code: s.data.postal_code })
    .eq("id", link.data.household_id);
  if (up.error) return fail(toMessage(up.error, "Não consegui salvar o endereço."));
  const family = await loadFamily(supabase, link.data.household_id);
  return family ? ok(family) : fail("Não consegui abrir a família.");
}

// ---- Foto --------------------------------------------------------------------------------
// O navegador reduz a imagem para 512px (JPEG) e sobe direto ao bucket por uma URL assinada que
// só o servidor emite. Caminho fixo `<org>/<pessoa>.jpg`: trocar a foto sobrescreve a anterior.

export async function preparePhotoAction(id: string): Promise<ActionResult<{ path: string; token: string }>> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  if (!(await stickOf(supabase, orgId, id))) return fail("Pessoa não encontrada.");
  const path = `${orgId}/${id}.jpg`;
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return fail(toMessage(error, "Não consegui preparar o envio."));
  return ok({ path, token: data.token });
}

export async function attachPhotoAction(id: string, path: string): Promise<ActionResult<{ url: string }>> {
  const g = await editorOrg();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  if (path !== `${orgId}/${id}.jpg`) return fail("Caminho inválido.");
  const { error } = await supabase.from("sticks").update({ profile_photo: path, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id);
  if (error) return fail(toMessage(error, "Não consegui guardar a foto."));
  const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600);
  return signed.data ? ok({ url: signed.data.signedUrl }) : fail("Foto enviada, mas não consegui mostrá-la.");
}

