// Cliente do Asaas (spec 20): fetch puro, só no servidor. Base por ASAAS_ENV, chave em
// ASAAS_API_KEY (sem NEXT_PUBLIC_, nunca chega ao navegador). Qualquer resposta não-2xx vira erro com a mensagem do Asaas.

const BASE = { sandbox: "https://api-sandbox.asaas.com/v3", production: "https://api.asaas.com/v3" };

async function asaas<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY ausente.");
  const base = process.env.ASAAS_ENV === "production" ? BASE.production : BASE.sandbox;
  const res = await fetch(base + path, {
    method: init?.method ?? "GET",
    headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "Mercy" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { errors?: { description?: string }[] }).errors?.[0]?.description;
    throw new Error(msg ?? `Asaas ${res.status}`);
  }
  return data as T;
}

export const createCustomer = (name: string, cpfCnpj: string, orgId: string) =>
  asaas<{ id: string }>("/customers", { method: "POST", body: { name, cpfCnpj, externalReference: orgId } });

export const createSubscription = (p: { customer: string; value: number; cycle: "MONTHLY" | "YEARLY"; orgId: string; nextDueDate: string }) =>
  asaas<{ id: string }>("/subscriptions", {
    method: "POST",
    body: {
      customer: p.customer,
      billingType: "UNDEFINED", // a pessoa escolhe Pix, boleto ou cartão na fatura
      value: p.value,
      cycle: p.cycle,
      nextDueDate: p.nextDueDate,
      description: "Mercy, plano pago",
      externalReference: p.orgId,
    },
  });

export async function firstInvoiceUrl(subscriptionId: string): Promise<string | null> {
  const r = await asaas<{ data: { invoiceUrl?: string }[] }>(`/subscriptions/${subscriptionId}/payments`);
  return r.data[0]?.invoiceUrl ?? null;
}
