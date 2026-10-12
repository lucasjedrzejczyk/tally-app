import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Cuidado (spec 17): sugestão de visitante vira acompanhamento, registrar contato, mudar status,
// pedido pelo link público chega pendente, aprovar e "Orei" soma.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const stamp = Date.now();
const visitor = `Visitante Cuidado ${stamp}`;
const asker = `Pedinte ${stamp}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("sticks").delete().eq("org_id", orgId).eq("full_name", visitor);
  await supabase.from("prayer_requests").delete().eq("org_id", orgId).eq("author_name", asker);
});

test("cuidado: sugestão vira acompanhamento, contato, status, pedido pelo link", async ({ page, context, browser }) => {
  test.setTimeout(180000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { supabase, orgId } = await signInTestUser();
  const { error } = await supabase
    .from("sticks")
    .insert({ org_id: orgId, full_name: visitor, relationship_status: "visitor_first", first_visit_date: iso(new Date(Date.now() - 9 * 864e5)) });
  if (error) throw new Error(error.message);

  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  await page.goto("/care");
  await expect(page.getByRole("heading", { name: "Cuidado", level: 1 })).toBeVisible();

  // sugestão do visitante: tocar acompanha e abre a ficha
  const sugg = page.getByRole("button", { name: new RegExp(`Acompanhar ${visitor}: Visitante desde`) });
  await sugg.scrollIntoViewIfNeeded();
  await expect(sugg).toBeVisible();
  await sugg.click();
  await expect(page).toHaveURL(/\/care\?c=/);
  await expect(page.getByRole("heading", { name: visitor, level: 1 })).toBeVisible();
  await expect(sugg).toHaveCount(0);

  // registrar contato: vira "Último contato hoje" na lista e entra na linha do tempo
  await page.getByRole("radio", { name: "Ligação" }).first().click();
  await page.getByLabel("Como foi o contato").first().fill("Conversamos sobre a célula");
  await page.getByRole("button", { name: "Registrar", exact: true }).first().click();
  await expect(page.getByText("Conversamos sobre a célula")).toBeVisible();
  const row = page.locator("button[data-id]").filter({ hasText: visitor });
  await expect(row).toContainText("Último contato hoje");

  // status: Aguardando, depois Concluído com Desfazer
  await page.getByRole("radio", { name: "Aguardando" }).click();
  await expect(page.getByRole("radio", { name: "Aguardando" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Concluído" }).click();
  await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("c")!;
  await expect.poll(async () => (await supabase.from("care_items").select("status").eq("id", id).single()).data?.status).toBe("resolved");

  // link público de pedidos
  await page.getByRole("tab", { name: /Orações/ }).click();
  await expect(page).toHaveURL(/tab=oracoes/);
  await page.getByRole("button", { name: "Link de pedidos" }).click();
  await expect(page.getByRole("button", { name: "Link copiado" })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/pedido\/[a-z0-9]{20}$/);

  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(link.replace(/^https?:\/\/[^/]+/, "http://localhost:3000"));
  await expect(pub.getByText("Pedido de oração", { exact: true })).toBeVisible();
  await pub.getByLabel("Seu nome").fill(asker);
  await pub.getByLabel("Pedido").fill("Pela saúde da minha mãe");
  await pub.getByLabel("Telefone (opcional)").fill("11 99999-0000");
  await pub.getByRole("button", { name: "Enviar" }).click();
  await expect(pub.getByText("Recebemos seu pedido")).toBeVisible();
  await anon.close();

  // chega pendente, aprovar, Orei soma 1
  await page.reload();
  await expect(page.getByRole("heading", { name: /Chegaram pelo link/ })).toBeVisible();
  const pending = page.locator("li").filter({ hasText: asker });
  await pending.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.locator("li").filter({ hasText: asker }).getByRole("button", { name: /^Orei/ })).toBeVisible();
  const orei = page.locator("li").filter({ hasText: asker }).getByRole("button", { name: /^Orei/ });
  await expect(orei).toHaveAccessibleName(/Orei\. 0 pessoas/);
  await orei.click();
  await expect(orei).toHaveAccessibleName(/Orei\. 1 pessoa orou/);
  await expect.poll(async () => (await supabase.from("prayer_requests").select("praying_count, status").eq("org_id", orgId).eq("author_name", asker).single()).data).toEqual({ praying_count: 1, status: "approved" });

  await supabase.from("care_items").delete().eq("id", id);
});
