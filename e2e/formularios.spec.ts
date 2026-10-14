import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Formulários e Lembretes (spec 19): criar do modelo, responder pelo link público sem login, a resposta
// chega como nova, vira Pessoa; Lembretes mostra o aniversário com WhatsApp e marca como lembrado.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";
const SHOTS = process.env.PREVIEWS === "1";

const stamp = Date.now();
const respondent = `Resposta Form ${stamp}`;
const bday = `Aniversário ${stamp}`;
const formTitle = `Ficha teste ${stamp}`;

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("forms").delete().eq("org_id", orgId).eq("title", formTitle);
  await supabase.from("sticks").delete().eq("org_id", orgId).in("full_name", [respondent, bday]);
});

test("formulários: modelo, link público, resposta vira pessoa; lembretes", async ({ page, browser }) => {
  test.setTimeout(240000);
  const { supabase, orgId } = await signInTestUser();
  const today = new Date();
  const born = `1990-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { error } = await supabase.from("sticks").insert({ org_id: orgId, full_name: bday, relationship_status: "member", birth_date: born, phone: "11977776666" });
  if (error) throw new Error(error.message);

  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  // novo formulário a partir da Ficha de visitante; abre já em Perguntas
  await page.goto("/forms");
  await expect(page.getByRole("heading", { name: "Formulários", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Novo formulário" }).first().click();
  await page.getByRole("dialog", { name: "Novo formulário" }).getByRole("button", { name: /Ficha de visitante/ }).click();
  await expect(page).toHaveURL(/\/forms\?f=/);
  const title = page.getByLabel("Título");
  await expect(title).toHaveValue("Ficha de visitante");
  await title.fill(formTitle);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salvo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: formTitle, level: 2 })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: "docs/previews/19-perguntas-1280.png" });

  const formId = new URL(page.url()).searchParams.get("f")!;
  const { data: f } = await supabase.from("forms").select("token").eq("id", formId).single();
  const token = f!.token;

  // página pública, sem login
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.setViewportSize({ width: 390, height: 844 });
  await pub.goto(`/formulario/${token}`);
  await expect(pub.getByText(formTitle)).toBeVisible();
  if (SHOTS) await pub.screenshot({ path: "docs/previews/19-publico-390.png", fullPage: true });
  await pub.getByRole("button", { name: "Enviar" }).click();
  await expect(pub.getByText("Escreva o seu nome.")).toBeVisible();
  await pub.getByLabel(/Seu nome/).fill(respondent);
  await pub.getByLabel(/Telefone/).fill("(11) 95555-4444");
  await pub.getByRole("button", { name: "Redes sociais" }).click();
  await pub.getByLabel("Bairro").fill("Centro");
  await pub.getByRole("button", { name: "Enviar" }).click();
  await expect(pub.getByText("Recebemos sua resposta")).toBeVisible();
  await anon.close();

  // a resposta chega como nova na lista
  await page.goto("/lembretes");
  await expect(page.getByText(new RegExp(`1 resposta nova · ${formTitle}`))).toBeVisible();
  await page.goto("/forms?f=" + formId);
  await expect(page.getByRole("button", { name: new RegExp(respondent) })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(respondent) }).click();
  await expect(page.getByText("Centro")).toBeVisible();
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: "docs/previews/19-respostas-1280.png" });
  await page.getByRole("button", { name: "Adicionar em Pessoas" }).click();
  await expect(page.getByRole("link", { name: "Ver em Pessoas" })).toBeVisible();
  const { data: person } = await supabase.from("sticks").select("phone, source").eq("org_id", orgId).eq("full_name", respondent).single();
  expect(person?.source).toBe(`Formulário: ${formTitle}`);

  // fechar o formulário: o link público para de aceitar
  await page.getByRole("switch", { name: "Recebendo respostas" }).click();
  await expect(page.getByRole("switch", { name: "Recebendo respostas" })).toHaveAttribute("aria-checked", "false");
  await expect.poll(async () => (await supabase.rpc("form_public", { p_token: token })).data).toBeNull();

  // lembretes: o aniversário de hoje com WhatsApp; tocar marca como lembrado
  await page.goto("/lembretes");
  const line = page.locator("li").filter({ hasText: `${bday} faz 36 anos` });
  await expect(line).toBeVisible();
  if (SHOTS) {
    await page.screenshot({ path: "docs/previews/19-lembretes-1280.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "docs/previews/19-lembretes-390.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  const wa = line.getByRole("link", { name: "WhatsApp" });
  await expect(wa).toHaveAttribute("href", /wa\.me\/5511977776666\?text=Feliz/);
  await page.context().route("https://wa.me/**", (r) => r.abort());
  await wa.click();
  await expect(line.getByText("Lembrado")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lembrados/ })).toBeVisible({ timeout: 8000 });
  const key = `rem:niver:`;
  const { data: marks } = await supabase.from("signal_overrides").select("signal_key").eq("org_id", orgId).like("signal_key", `${key}%`);
  expect((marks ?? []).length).toBeGreaterThan(0);
});
