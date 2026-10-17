// POST /api/billing/asaas — webhook do Asaas (spec 20). O único lugar com a service role:
// sem sessão de usuário, quem autentica é o token do webhook (conferido em handleAsaasWebhook).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { handleAsaasWebhook, type WebhookDeps } from "@/features/billing/webhook";

function deps(): WebhookDeps {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente.");
  const db = createClient<Database>(env.SUPABASE_URL, key, { auth: { persistSession: false } });
  const check = <T extends { error: { message: string } | null }>(r: T): T => {
    if (r.error) throw new Error(r.error.message);
    return r;
  };

  return {
    async record(eventId, payload) {
      check(await db.from("billing_events").upsert({ event_id: eventId, payload: payload as never }, { onConflict: "provider,event_id", ignoreDuplicates: true }));
      const { data } = check(await db.from("billing_events").select("processed_at").eq("event_id", eventId).maybeSingle());
      return !data?.processed_at;
    },
    async load(orgRef, subId) {
      const sub = subId
        ? check(await db.from("subscriptions").select("org_id, provider_subscription_id, cycle, current_period_end").eq("provider_subscription_id", subId).maybeSingle()).data
        : null;
      const orgId = sub?.org_id ?? orgRef;
      if (!orgId) return null;
      const { data: org } = check(await db.from("organizations").select("id, plan_status, pro_until").eq("id", orgId).maybeSingle());
      if (!org) return null;
      return {
        orgId: org.id,
        subId: sub?.provider_subscription_id ?? null,
        ctx: { plan_status: org.plan_status, pro_until: org.pro_until, cycle: sub?.cycle ?? null, periodEnd: sub?.current_period_end ?? null },
      };
    },
    async apply(orgId, subId, effect) {
      if (effect.org) check(await db.from("organizations").update(effect.org).eq("id", orgId));
      if (effect.sub && subId) check(await db.from("subscriptions").update(effect.sub).eq("provider_subscription_id", subId));
    },
    async done(eventId) {
      check(await db.from("billing_events").update({ processed_at: new Date().toISOString() }).eq("event_id", eventId));
    },
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const status = await handleAsaasWebhook(req.headers.get("asaas-access-token"), process.env.ASAAS_WEBHOOK_TOKEN, body, deps());
    return NextResponse.json({ ok: status === 200 }, { status });
  } catch (e) {
    console.error("webhook asaas", e);
    return NextResponse.json({ ok: false }, { status: 500 }); // o Asaas reenvia
  }
}
