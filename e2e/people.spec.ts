import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Pessoas (spec 13, fases A e C): criar pessoa, editar telefone (Editar, campo, Pronto), buscar, filtrar Membros e abrir a
// ficha pela URL. A pessoa criada é arquivada no meio do teste e apagada no fim (afterAll), para não poluir a org de teste.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const name = `Teste Pessoa ${Date.now()}`;

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("sticks").delete().eq("org_id", orgId).in("full_name", [name, "Nova pessoa"]); // "Nova pessoa" = sobra de uma execução que falhou antes de dar nome
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

  // criar: a ficha abre direto no Editar, com o foco no nome
  await page.getByRole("button", { name: "Nova pessoa", exact: true }).click();
  await expect(page).toHaveURL(/[?&]p=.*edit=1|edit=1.*[?&]p=/);
  const id = new URL(page.url()).searchParams.get("p");
  expect(id).toBeTruthy();
  const nameInput = page.getByLabel("Nome", { exact: true });
  await expect(nameInput).toBeFocused();
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(name) }).first()).toBeVisible();

  // telefone: salva ao dar Enter; inválido mostra o erro e Esc não sai do Editar
  const phone = page.getByLabel("Telefone", { exact: true });
  await phone.fill("abc");
  await phone.press("Enter");
  await expect(page.getByText("Telefone inválido.")).toBeVisible();
  await phone.press("Escape");
  await expect(page.getByRole("button", { name: "Pronto" }).first()).toBeVisible();
  await phone.fill("47999990000");
  await phone.press("Enter");
  await expect(page.getByText("Salvo")).toBeVisible();

  // situação: Membro (select da ficha, não o chip da lista)
  await page.locator("select[aria-label='Situação']").selectOption("member");

  // Pronto volta para a leitura: telefone vira o botão Ligar
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await expect(page).not.toHaveURL(/edit=1/);
  await expect(page.getByRole("link", { name: "Ligar" })).toHaveAttribute("href", "tel:47999990000");
  await expect(page.getByText("Ainda sem dados.")).toHaveCount(0);

  // Esc no Editar salva o que está no campo e volta para a leitura
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page).toHaveURL(/edit=1/);
  const prof = page.getByLabel("Profissão", { exact: true });
  await prof.fill("Professora");
  await prof.press("Escape");
  await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeVisible();
  await expect(page.getByText("Professora")).toBeVisible();

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
  await expect(page.getByText("Nenhuma pessoa para mostrar.")).toBeVisible(); // a ficha aberta saiu do filtro

  // abrir a ficha pela URL
  await page.goto(`/people/${id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ligar" })).toBeVisible();

  // arquivar (limpa a lista de teste)
  await page.getByRole("button", { name: "Mais ações da pessoa" }).click();
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await expect(page.getByText(/Arquivado/).first()).toBeVisible();
});
