import { test, expect, type Page } from "@playwright/test";

// Busca por palavra na Bíblia: a caixa do menu manda palavra para /study/busca (e
// referência para o capítulo), sem acento acha com acento, filtro por testamento, e o
// resultado abre a leitura já no versículo (?v=). PREVIEWS=1 grava as prévias.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";
const shot = async (page: Page, name: string) => {
  if (process.env.PREVIEWS) await page.screenshot({ path: `docs/previews/${name}.png` });
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });
}

test("busca por palavra no computador", async ({ page }) => {
  test.setTimeout(120000);
  await login(page);
  const box = page.getByRole("search").getByLabel("Buscar na Bíblia ou ir para uma passagem");
  await box.fill("graca");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/study\/busca\?q=graca/);
  await expect(page.getByTestId("search-count")).toContainText("versículos");
  expect(await page.locator("mark").count()).toBeGreaterThan(5);
  await page.mouse.move(1200, 10);
  await shot(page, "11-busca-1280-claro");

  await page.getByRole("navigation", { name: "Testamento" }).getByRole("link", { name: "Novo" }).click();
  await expect(page).toHaveURL(/t=nt/);
  await expect(page.getByRole("heading", { name: "Mateus" }).or(page.getByRole("heading", { name: "Lucas" })).first()).toBeVisible();
  await page.locator('a[href*="/study/bible/"]').first().click();
  await expect(page).toHaveURL(/\/study\/bible\/[A-Z0-9]+\/\d+\?v=\d+/);
  await expect(page.locator('[data-testid="reader-text"] [data-target="true"]')).toHaveCount(1, { timeout: 20000 });

  // referência continua indo direto ao capítulo
  await box.fill("Romanos 8:28");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/study\/bible\/ROM\/8$/);
});

test.describe("celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("aba Buscar e frase entre aspas", async ({ page }) => {
    test.setTimeout(120000);
    await login(page);
    await page.getByRole("button", { name: "Mais" }).click(); // com 8 itens, Buscar fica em "Mais"
    await page.getByRole("menuitem", { name: "Buscar" }).click();
    await expect(page).toHaveURL(/\/study\/busca$/);
    await page.getByRole("searchbox", { name: "Buscar na Bíblia" }).fill('"pão da vida"');
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByTestId("search-count")).toContainText("2 versículos");
    await page.waitForTimeout(500);
    await shot(page, "11-busca-390-claro");
  });
});
