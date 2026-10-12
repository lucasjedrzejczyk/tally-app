"use server";

// Server Actions de Encontros (spec 16). Tudo exige services.manage (o RLS confere de novo).
import { requireOrg, can, type OrgContext } from "@/lib/auth/session";
import { type ActionResult, ok, fail, toMessage } from "@/lib/errors";
import { isIso, parseTime, todayIso, weekdayIndex } from "@/features/groups/domain";
import { getEventDay } from "./queries";
import type { EventDay, PlanItem, SermonRef } from "./types";

const DENIED = "Você não tem permissão para gerenciar cultos e eventos.";

async function manager(): Promise<{ ctx: OrgContext } | { error: ActionResult<never> }> {
  const ctx = await requireOrg();
  return can(ctx, "services.manage") ? { ctx } : { error: fail(DENIED) };
}

const cleanName = (raw: string): string | ActionResult<never> => {
  const t = raw.trim();
  if (!t) return fail("Dê um nome.");
  if (t.length > 80) return fail("Nome grande demais (até 80 letras).");
  return t;
};

// ── Culto ─────────────────────────────────────────────────────────────────────────────────────
export async function createServiceAction(): Promise<ActionResult<{ id: string }>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { data, error } = await g.ctx.supabase.from("services").insert({ org_id: g.ctx.orgId, name: "Novo culto", weekday: 0, start_time: "19:00" }).select("id").single();
  if (error || !data) return fail(toMessage(error, "Não consegui criar o culto."));
  return ok({ id: data.id });
}

export async function updateServiceFieldAction(id: string, field: string, raw: string): Promise<ActionResult<{ text: string }>> {
  const g = await manager();
  if ("error" in g) return g.error;
  let patch: { name?: string; weekday?: number; start_time?: string | null; location?: string | null };
  let text = raw.trim();
  if (field === "name") {
    const n = cleanName(raw);
    if (typeof n !== "string") return n;
    patch = { name: (text = n) };
  } else if (field === "day") {
    const i = weekdayIndex(raw);
    if (i < 0) return fail("Escolha o dia do culto.");
    patch = { weekday: i };
  } else if (field === "time") {
    const t = parseTime(raw);
    if (t === null) return fail("Horário inválido. Ex.: 19:00");
    patch = { start_time: (text = t) || null };
  } else if (field === "location") {
    if (text.length > 160) return fail("Endereço grande demais.");
    patch = { location: text || null };
  } else return fail("Campo inválido.");
  const { data, error } = await g.ctx.supabase.from("services").update(patch).eq("org_id", g.ctx.orgId).eq("id", id).select("id").maybeSingle();
  if (error) return fail(toMessage(error));
  if (!data) return fail("Culto não encontrado.");
  return ok({ text });
}

export async function archiveServiceAction(id: string): Promise<ActionResult<null>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("services").update({ active: false }).eq("org_id", g.ctx.orgId).eq("id", id);
  return error ? fail(toMessage(error)) : ok(null);
}

// O culto num dia: cria a linha na primeira vez que alguém mexe.
async function dateId(ctx: OrgContext, serviceId: string, date: string): Promise<string | ActionResult<never>> {
  if (!isIso(date)) return fail("Data inválida.");
  const { data, error } = await ctx.supabase
    .from("service_dates")
    .upsert({ org_id: ctx.orgId, service_id: serviceId, date }, { onConflict: "service_id,date", ignoreDuplicates: false })
    .select("id")
    .single();
  if (error || !data) return fail(toMessage(error, "Culto não encontrado."));
  return data.id;
}

const COUNTS = ["headcount", "visitors", "kids"] as const;
export async function setCountAction(serviceId: string, date: string, field: string, value: number | null): Promise<ActionResult<null>> {
  if (!(COUNTS as readonly string[]).includes(field)) return fail("Campo inválido.");
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > 999999)) return fail("Número inválido.");
  const g = await manager();
  if ("error" in g) return g.error;
  const id = await dateId(g.ctx, serviceId, date);
  if (typeof id !== "string") return id;
  const patch = field === "headcount" ? { headcount: value } : field === "visitors" ? { visitors: value } : { kids: value };
  const { error } = await g.ctx.supabase.from("service_dates").update(patch).eq("id", id);
  return error ? fail(toMessage(error)) : ok(null);
}

export async function setCancelledAction(serviceId: string, date: string, cancelled: boolean): Promise<ActionResult<null>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const id = await dateId(g.ctx, serviceId, date);
  if (typeof id !== "string") return id;
  const { error } = await g.ctx.supabase.from("service_dates").update({ cancelled }).eq("id", id);
  return error ? fail(toMessage(error)) : ok(null);
}

export async function setSermonAction(serviceId: string, date: string, sermonId: string | null): Promise<ActionResult<SermonRef | null>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  let ref: SermonRef | null = null;
  if (sermonId) {
    const { data } = await supabase.from("sermons").select("id, title, main_passage").eq("org_id", orgId).eq("id", sermonId).maybeSingle();
    if (!data) return fail("Sermão não encontrado.");
    ref = { id: data.id, title: data.title, passage: data.main_passage ?? "" };
  }
  const id = await dateId(g.ctx, serviceId, date);
  if (typeof id !== "string") return id;
  const { error } = await supabase.from("service_dates").update({ sermon_id: sermonId }).eq("id", id);
  return error ? fail(toMessage(error)) : ok(ref);
}

/** Troca a ordem inteira (do dia, ou a de sempre quando `date` é null). */
export async function savePlanAction(serviceId: string, date: string | null, items: { time: string; title: string; responsible: string }[]): Promise<ActionResult<PlanItem[]>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const clean = items
    .map((i) => ({ time: i.time.trim().slice(0, 12), title: i.title.trim().slice(0, 120), responsible: i.responsible.trim().slice(0, 80) }))
    .filter((i) => i.title)
    .slice(0, 60);
  let did: string | null = null;
  if (date) {
    const id = await dateId(g.ctx, serviceId, date);
    if (typeof id !== "string") return id;
    did = id;
  } else {
    const { data } = await supabase.from("services").select("id").eq("org_id", orgId).eq("id", serviceId).maybeSingle();
    if (!data) return fail("Culto não encontrado.");
  }
  const del = did ? supabase.from("service_plan_items").delete().eq("date_id", did) : supabase.from("service_plan_items").delete().eq("service_id", serviceId).is("date_id", null);
  const { error: dErr } = await del;
  if (dErr) return fail(toMessage(dErr));
  if (!clean.length) return ok([]);
  const { data, error } = await supabase
    .from("service_plan_items")
    .insert(clean.map((i, n) => ({ org_id: orgId, service_id: serviceId, date_id: did, position: n, time_label: i.time || null, title: i.title, responsible: i.responsible || null })))
    .select("id, time_label, title, responsible, position");
  if (error) return fail(toMessage(error));
  return ok((data ?? []).sort((a, b) => a.position - b.position).map((r) => ({ id: r.id, time: r.time_label ?? "", title: r.title, responsible: r.responsible ?? "" })));
}

// ── Evento ────────────────────────────────────────────────────────────────────────────────────
export async function createEventAction(date: string): Promise<ActionResult<{ id: string }>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const day = isIso(date) ? date : todayIso();
  const { data, error } = await g.ctx.supabase.from("events").insert({ org_id: g.ctx.orgId, name: "Novo evento", event_date: day, time: "19:00", status: "active" }).select("id").single();
  if (error || !data) return fail(toMessage(error, "Não consegui criar o evento."));
  return ok({ id: data.id });
}

async function freshEvent(ctx: OrgContext, id: string): Promise<ActionResult<EventDay>> {
  const d = await getEventDay(ctx.supabase, ctx.orgId, id);
  return d ? ok(d) : fail("Evento não encontrado.");
}

export async function updateEventFieldAction(id: string, field: string, raw: string): Promise<ActionResult<EventDay>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const text = raw.trim();
  let patch: { name?: string; event_date?: string; time?: string | null; location?: string | null; description?: string | null; capacity?: number | null; registration_required?: boolean };
  if (field === "name") {
    const n = cleanName(raw);
    if (typeof n !== "string") return n;
    patch = { name: n };
  } else if (field === "date") {
    if (!isIso(text)) return fail("Data inválida.");
    patch = { event_date: text };
  } else if (field === "time") {
    const t = parseTime(raw);
    if (t === null) return fail("Horário inválido. Ex.: 19:00");
    patch = { time: t || null };
  } else if (field === "location") {
    if (text.length > 160) return fail("Endereço grande demais.");
    patch = { location: text || null };
  } else if (field === "description") {
    if (text.length > 2000) return fail("Descrição grande demais.");
    patch = { description: text || null };
  } else if (field === "capacity") {
    if (text && !/^\d{1,5}$/.test(text)) return fail("Use só números.");
    patch = { capacity: text ? Number(text) || null : null };
  } else if (field === "registration") {
    patch = { registration_required: text === "1" };
  } else return fail("Campo inválido.");
  const { data, error } = await g.ctx.supabase.from("events").update(patch).eq("org_id", g.ctx.orgId).eq("id", id).select("id").maybeSingle();
  if (error) return fail(toMessage(error));
  if (!data) return fail("Evento não encontrado.");
  return freshEvent(g.ctx, id);
}

export async function archiveEventAction(id: string): Promise<ActionResult<null>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("events").update({ status: "cancelled" }).eq("org_id", g.ctx.orgId).eq("id", id);
  return error ? fail(toMessage(error)) : ok(null);
}

export async function addRegistrationsAction(eventId: string, stickIds: string[]): Promise<ActionResult<EventDay>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { supabase, orgId } = g.ctx;
  const ids = [...new Set(stickIds)].filter(Boolean);
  if (ids.length) {
    const [{ data: valid }, { data: here }] = await Promise.all([
      supabase.from("sticks").select("id, full_name").eq("org_id", orgId).in("id", ids),
      supabase.from("event_registrations").select("stick_id").eq("event_id", eventId),
    ]);
    const already = new Set((here ?? []).map((r) => r.stick_id));
    const rows = (valid ?? []).filter((s) => !already.has(s.id)).map((s) => ({ org_id: orgId, event_id: eventId, stick_id: s.id, name: s.full_name }));
    if (rows.length) {
      const { error } = await supabase.from("event_registrations").insert(rows);
      if (error) return fail(toMessage(error));
    }
  }
  return freshEvent(g.ctx, eventId);
}

export async function addGuestAction(eventId: string, name: string): Promise<ActionResult<EventDay>> {
  const n = cleanName(name);
  if (typeof n !== "string") return n;
  const g = await manager();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("event_registrations").insert({ org_id: g.ctx.orgId, event_id: eventId, name: n });
  if (error) return fail(toMessage(error));
  return freshEvent(g.ctx, eventId);
}

export async function removeRegistrationAction(eventId: string, regId: string): Promise<ActionResult<EventDay>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase.from("event_registrations").delete().eq("event_id", eventId).eq("id", regId);
  if (error) return fail(toMessage(error));
  return freshEvent(g.ctx, eventId);
}

export async function setCheckInAction(regId: string, on: boolean): Promise<ActionResult<null>> {
  const g = await manager();
  if ("error" in g) return g.error;
  const { error } = await g.ctx.supabase
    .from("event_registrations")
    .update({ checked_in: on, checked_in_at: on ? new Date().toISOString() : null })
    .eq("org_id", g.ctx.orgId)
    .eq("id", regId);
  return error ? fail(toMessage(error)) : ok(null);
}
