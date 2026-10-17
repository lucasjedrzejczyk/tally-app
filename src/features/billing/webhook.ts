// Webhook do Asaas (spec 20), sem I/O próprio: o route.ts injeta o banco (service role).
// As três regras: token conferido em tempo constante, evento repetido ignorado, e só o
// servidor grava. Evento gravado mas que falhou no meio continua "não processado", então o
// reenvio do Asaas tenta de novo.
import { createHash, timingSafeEqual } from "node:crypto";
import { effectOf, type BillingContext, type Effect } from "./events";

export interface WebhookDeps {
  // Grava o evento. true = ainda não processado (novo ou falhou antes).
  record(eventId: string, payload: unknown): Promise<boolean>;
  // Igreja + assinatura do evento: pela externalReference ou pelo id da assinatura.
  load(orgRef: string | null, subId: string | null): Promise<{ orgId: string; subId: string | null; ctx: BillingContext } | null>;
  apply(orgId: string, subId: string | null, effect: Effect): Promise<void>;
  done(eventId: string): Promise<void>;
}

interface AsaasBody {
  id?: string;
  event?: string;
  payment?: { id?: string; subscription?: string | null; externalReference?: string | null; dueDate?: string | null; invoiceUrl?: string | null };
  subscription?: { id?: string; externalReference?: string | null };
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export function tokenOk(got: string | null, expected: string | undefined): boolean {
  if (!expected || !got) return false;
  return timingSafeEqual(digest(got), digest(expected));
}

export async function handleAsaasWebhook(
  token: string | null,
  expected: string | undefined,
  body: unknown,
  deps: WebhookDeps,
  now: Date = new Date(),
): Promise<number> {
  if (!tokenOk(token, expected)) return 401;
  const b = (body ?? {}) as AsaasBody;
  if (!b.event) return 400;

  const subId = b.payment?.subscription ?? b.subscription?.id ?? null;
  const eventId = b.id ?? `${b.event}:${b.payment?.id ?? subId ?? ""}`;
  if (!(await deps.record(eventId, body))) return 200;

  const orgRef = b.payment?.externalReference ?? b.subscription?.externalReference ?? null;
  const target = await deps.load(orgRef, subId);
  const effect = target ? effectOf(b.event, b.payment ?? null, target.ctx, now) : null;
  if (target && effect) await deps.apply(target.orgId, target.subId, effect);
  await deps.done(eventId);
  return 200;
}
