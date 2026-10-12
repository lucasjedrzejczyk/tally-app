import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Crianças (spec 18): salas sugeridas, criança nova na recepção, entrada gera código, saída com código
// errado recusa e com o certo entrega (com Desfazer), totem acha a família pelo telefone e não mostra
// alergia. A contagem do culto (trigger) e a RLS foram testadas no banco com rollback.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const stamp = Date.now();
const child = `Theo Kids${stamp}`;
const guardian = `Ana Kids${stamp}`;
const phone = `479${String(stamp).slice(-8)}`;
let roomsBefore: string[] = [];

test.beforeAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  const { data } = await supabase.from("kids_rooms").select("id").eq("org_id", orgId);
  roomsBefore = (data ?? []).map((r) => r.id);
});

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  const { data } = await supabase.from("sticks").select("id").eq("org_id", orgId).in("full_name", [child, guardian]);
  const ids = (data ?? []).map((s) => s.id);
  if (ids.length) {
    const { data: hm } = await supabase.from("household_members").select("household_id").in("stick_id", ids);
    await supabase.from("sticks").delete().in("id", ids);
    const houses = [...new Set((hm ?? []).map((h) => h.household_id))];
    if (houses.length) await supabase.from("households").delete().in("id", houses);
  }
  // pelo id, não pela hora: o relógio do PC pode estar à frente do banco
  const { data: rooms } = await supabase.from("kids_rooms").select("id").eq("org_id", orgId);
  const added = (rooms ?? []).map((r) => r.id).filter((id) => !roomsBefore.includes(id));
  if (added.length) await supabase.from("kids_rooms").delete().in("id", added);
});

test("crianças: entrada com código, saída conferida e totem pelo telefone", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  await page.goto("/kids");
  if (!roomsBefore.length) {
    await page.getByRole("button", { name: "Usar salas sugeridas" }).click();
    await expect(page.getByRole("button", { name: /Maternal/ })).toBeVisible({ timeout: 20000 });
  }

  // criança nova na recepção: cadastra e cai na entrada já marcada
  await page.getByRole("button", { name: "Entrada", exact: true }).click();
  await page.getByRole("button", { name: "Criança nova" }).click();
  await page.getByLabel("Nome da criança").fill(child);
  await page.getByLabel("Nascimento").first().fill("01/03/2022");
  await page.getByLabel("Responsável").fill(guardian);
  await page.getByLabel("Telefone do responsável").fill(phone);
  await page.getByLabel("Alergias").fill("amendoim");
  await page.getByRole("button", { name: "Cadastrar e fazer entrada" }).click();
  await expect(page.getByRole("button", { name: new RegExp(child.split(" ")[0]!) })).toHaveAttribute("aria-pressed", "true", { timeout: 20000 });

  // entrada: código de 4 casas, aviso de alergia antes de a criança ir para a sala
  await page.getByRole("button", { name: "Fazer entrada" }).click();
  const tiles = page.getByRole("img", { name: /^Código [A-Z0-9 ]{7}$/ });
  await expect(tiles).toBeVisible();
  await expect(page.getByText("Salvando")).toHaveCount(0, { timeout: 20000 });
  const code = (await tiles.getAttribute("aria-label"))!.replace("Código ", "").replace(/ /g, "");
  await expect(page.getByText(/tem alergia: amendoim/)).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();

  // a sala mostra o rosto com o selo de alergia
  await page.getByRole("button", { name: /Maternal/ }).click();
  await expect(page.getByRole("button", { name: new RegExp(`${child}.*alergia: amendoim`) })).toBeVisible();
  await page.getByRole("button", { name: "Fechar" }).click();

  // saída: código errado recusa; o certo mostra a criança e entrega com Desfazer
  await page.getByRole("button", { name: "Saída", exact: true }).click();
  const wrong = code === "ZZZZ" ? "YYYY" : "ZZZZ";
  await page.getByLabel("Código de retirada").fill(wrong);
  await expect(page.getByText("Não achamos esse código. Confira com o responsável.")).toBeVisible();
  await page.getByLabel("Código de retirada").fill(code);
  await expect(page.getByRole("heading", { name: "Quem buscou?" })).toBeVisible();
  await page.getByRole("button", { name: "Entregar" }).click();
  await expect(page.getByRole("heading", { name: "Entregue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Fechar" }).click();

  // totem: telefone completo acha a família; mostra primeiro nome + inicial, nunca a alergia
  await page.goto("/kids/totem");
  await expect(page.getByRole("heading", { name: "Olá! Digite seu telefone" })).toBeVisible();
  for (const d of phone) await page.getByRole("button", { name: d, exact: true }).click();
  const kidBtn = page.getByRole("button", { name: new RegExp(`${child.split(" ")[0]} K\\.`) });
  await expect(kidBtn).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/amendoim/)).toHaveCount(0);
  await expect(page.getByText(child)).toHaveCount(0);
  await page.getByRole("button", { name: "Fazer entrada" }).click();
  await expect(page.getByRole("img", { name: /^Código [A-Z0-9 ]{7}$/ })).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Pronto" }).click();
  await expect(page.getByRole("heading", { name: "Olá! Digite seu telefone" })).toBeVisible();
});
