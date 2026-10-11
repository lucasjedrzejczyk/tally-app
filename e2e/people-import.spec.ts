import { test, expect, type Page } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Pessoas (spec 13, fase B): importar um CSV pequeno (e/fixtures/pessoas.csv), ver os já
// existentes na segunda tentativa, salvar uma lista, exportar e abrir as páginas de impressão.
// Tudo que o teste cria (pessoas "Importacao Teste ..." e a lista) é apagado antes e depois.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";
const LIST = "Lista Importada Teste";

async function cleanup() {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("sticks").delete().eq("org_id", orgId).like("full_name", "Importacao Teste%");
  await supabase.from("people_lists").delete().eq("org_id", orgId).eq("name", LIST);
}
test.beforeAll(cleanup);
test.afterAll(cleanup);

async function openImport(page: Page) {
  await page.getByRole("button", { name: "Mais ações da lista" }).click();
  await page.getByRole("menuitem", { name: "Importar planilha" }).click();
  await page.getByLabel("Arquivo da planilha").setInputFiles("e2e/fixtures/pessoas.csv");
  await expect(page.locator("#col-0")).toHaveValue("name");
  await page.getByRole("button", { name: "Continuar" }).click();
}

test("pessoas: importar planilha, listas salvas, exportar e imprimir", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  // 1) importar: 3 novas, 1 repetida na própria planilha, 1 com e-mail inválido
  await page.goto("/people");
  await openImport(page);
  await expect(page.getByTestId("import-counts")).toHaveText("3 novas, 1 já existe, 1 com erro");
  await page.getByRole("button", { name: "Importar 3 pessoas" }).click();
  await expect(page.getByText("Importação concluída")).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("3 pessoas novas, 1 pulada (já existia), 1 linha com erro.")).toBeVisible();
  await expect(page.getByText("Linha 6: E-mail: E-mail inválido.")).toBeVisible();
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Fechar", exact: true }).last().click()]); // recarrega a lista

  // 2) a lista recarrega com as 3 pessoas; datas e telefones foram lidos
  const search = page.getByLabel("Buscar por nome, telefone ou e-mail");
  await search.fill("Importacao Teste");
  const alfa = page.getByRole("button", { name: /Importacao Teste Alfa/ });
  await expect(alfa).toContainText("Diácono(isa)");
  await expect(page.getByRole("button", { name: /Importacao Teste (Beta|Gama)/ })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Importacao Teste Erro/ })).toHaveCount(0);

  // 3) importar de novo: ninguém é novo
  await openImport(page);
  await expect(page.getByTestId("import-counts")).toHaveText("0 novas, 4 já existem, 1 com erro");
  await expect(page.getByRole("button", { name: "Nada para importar" })).toBeDisabled();
  await page.getByRole("button", { name: "Fechar", exact: true }).last().click();

  // 4) exportar a lista filtrada (CSV com BOM e ;)
  await page.getByRole("button", { name: "Mais ações da lista" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Exportar lista" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^pessoas-\d{4}-\d{2}-\d{2}\.csv$/);
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv.startsWith("﻿Nome;Situação;")).toBe(true);
  expect(csv).toContain("Importacao Teste Alfa;Membro;Diácono(isa);(47) 98888-0001;;alfa@teste.com;05/03/1985;Feminino");
  expect(csv).toContain("Importacao Teste Beta;Membro;;(47) 98888-0002;;;12/11/1990;Masculino");

  // 5) salvar a lista, recarregar e usar o atalho
  await page.getByRole("button", { name: "Listas", exact: true }).click();
  await page.getByRole("menuitem", { name: "Salvar lista atual" }).click();
  await page.getByLabel("Nome da lista").fill(LIST);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("button", { name: `Remover ${LIST}` })).toBeVisible();
  await page.goto("/people");
  await page.getByRole("button", { name: "Listas", exact: true }).click();
  await page.getByRole("menuitemradio", { name: LIST, exact: true }).click();
  await expect(page).toHaveURL(/q=Importacao/);
  await expect(page.getByRole("button", { name: /Importacao Teste Alfa/ })).toBeVisible();

  // 6) impressão: ficha e certificado (Alfa foi batizada em 10/06/2010)
  await page.getByRole("button", { name: /Importacao Teste Alfa/ }).click();
  await expect(page).toHaveURL(/[?&]p=/);
  const id = new URL(page.url()).searchParams.get("p");
  await page.getByRole("button", { name: "Mais ações da pessoa" }).click();
  await page.getByRole("menuitem", { name: "Imprimir ficha" }).click();
  await expect(page.getByRole("heading", { name: "Ficha cadastral" })).toBeVisible();
  await expect(page.getByText("Importacao Teste Alfa").first()).toBeVisible();
  await expect(page.getByText("05/03/1985")).toBeVisible();
  await page.goto(`/people/${id}`);
  await page.getByRole("button", { name: "Mais ações da pessoa" }).click();
  await page.getByRole("menuitem", { name: "Certificado de batismo" }).click();
  await expect(page.getByRole("heading", { name: "Certificado de batismo" })).toBeVisible();
  await expect(page.getByText(/foi batizada nas águas em 10 de junho de 2010/)).toBeVisible();

  // 7) apagar a lista pelo menu
  await page.goto("/people");
  await page.getByRole("button", { name: "Listas", exact: true }).click();
  await page.getByRole("button", { name: `Mais ações da lista ${LIST}` }).click();
  await page.getByRole("menuitem", { name: "Apagar" }).click();
  await page.getByRole("button", { name: "Listas", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: LIST, exact: true })).toHaveCount(0);
});
