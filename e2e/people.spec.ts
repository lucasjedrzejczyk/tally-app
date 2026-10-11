import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Pessoas (spec 13, fase A): criar pessoa, editar telefone, buscar, filtrar Membros e abrir a
// ficha pela URL. A pessoa criada é arquivada no meio do teste e apagada no fim (afterAll), para não poluir a org de teste.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const name = `Teste Pessoa ${Date.now()}`;

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("sticks").delete().eq("org_id", orgId).eq("full_name", name);
});

test("pessoas: criar, editar telefone, buscar, filtrar e abrir por URL", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  // /sticks antigo leva para /people, com a querystring
  await page.goto("/sticks?q=zzz");
  await expect(page).toHaveURL(/\/people\?q=zzz/);

  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible();

  // criar: a ficha abre com o foco no nome
  await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
  await expect(page).toHaveURL(/[?&]p=/);
  const nameInput = page.getByLabel("Nome", { exact: true });
  await expect(nameInput).toBeFocused();
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();

  // editar telefone no lugar
  await page.getByRole("button", { name: "Editar telefone" }).click();
  await page.getByLabel("Telefone", { exact: true }).fill("47999990000");
  await page.getByLabel("Telefone", { exact: true }).press("Enter");
  await expect(page.getByText("(47) 99999-0000").first()).toBeVisible();
  await expect(page.getByText("Salvo")).toBeVisible();

  // telefone inválido: erro no campo, não salva
  await page.getByRole("button", { name: "Editar telefone" }).click();
  await page.getByLabel("Telefone", { exact: true }).fill("abc");
  await page.getByLabel("Telefone", { exact: true }).press("Enter");
  await expect(page.getByText("Telefone inválido.")).toBeVisible();
  await page.getByLabel("Telefone", { exact: true }).press("Escape");
  await expect(page.getByText("(47) 99999-0000").first()).toBeVisible();

  // situação: Membro
  await page.getByRole("button", { name: "Editar situação" }).click();
  await page.getByLabel("Situação", { exact: true }).selectOption("member");
  await expect(page.getByRole("button", { name: "Editar situação" })).toContainText("Membro");

  // buscar pelo telefone e pelo nome
  const search = page.getByLabel("Buscar por nome, telefone ou e-mail");
  await search.fill("99999-0000".replace(/\D/g, ""));
  await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();
  await search.fill(name.toLowerCase());
  await expect(page).toHaveURL(/q=teste/);
  await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();
  await search.fill("nome que nao existe 123");
  await expect(page.getByText("Nenhuma pessoa com esses filtros.")).toBeVisible();
  await search.fill(name);

  // filtrar Membros e Visitantes
  await page.getByRole("button", { name: "Situação" }).click();
  await page.getByRole("menuitemradio", { name: "Membros" }).click();
  await expect(page).toHaveURL(/s=member/);
  await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();
  await page.getByRole("button", { name: "Membros" }).click();
  await page.getByRole("menuitemradio", { name: "Visitantes" }).click();
  await expect(page.getByText("Nenhuma pessoa com esses filtros.")).toBeVisible();

  // abrir a ficha pela URL
  const id = new URL(page.url()).searchParams.get("p");
  expect(id).toBeTruthy();
  await page.goto(`/people/${id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByText("(47) 99999-0000").first()).toBeVisible();

  // arquivar (limpa a lista de teste)
  await page.getByRole("button", { name: "Mais ações da pessoa" }).click();
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await expect(page.getByText(/Arquivado/).first()).toBeVisible();
});
