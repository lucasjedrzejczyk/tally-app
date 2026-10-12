import { test, expect, type Locator, type Page } from "@playwright/test";

// E2e da área "Equipe e cargos" (Configurações): os 6 cargos padrão aparecem, um cargo
// personalizado nasce/edita/morre, e o RLS é respeitado na UI (cargo de sistema não
// oferece "Excluir"). Roda contra a org de teste; o usuário da fixture é DONO, então
// cobre o caminho de quem TEM members.manage. O caminho negativo (membro sem a
// permissão) segue pendente: falta um usuário de teste não-owner (ver README).
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const ROLE = "Recepção (e2e)";
const RENAMED = "Recepção — sábado (e2e)";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$|\/study(\/bible.*)?$|\/onboarding$/);
}

// Devolve a lista de cargos já aberta na aba (escopo: há duas listas na tela).
async function openTeamTab(page: Page): Promise<Locator> {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Cargos e permissões" }).click();
  const roles = page.getByRole("list", { name: "Cargos da igreja" });
  await expect(roles).toBeVisible();
  return roles;
}

test.describe("Configurações → Equipe e cargos", () => {
  test.skip(!EMAIL || !PASSWORD, "fixture ausente (.env.test)");

  test("cargos padrão aparecem e só os personalizados podem ser excluídos", async ({ page }) => {
    const roles = await openTeamTab(page);

    // Os 6 cargos de sistema semeados por seed_default_system_roles (m26/m27).
    for (const name of ["Dono", "Pastor", "Tesoureiro", "Equipe de Cuidado", "Líder de Grupo", "Membro"]) {
      const row = roles.locator("li").filter({ hasText: name }).first();
      await expect(row).toBeVisible();
      await expect(row).toContainText("padrão");
    }
    // O Dono não é "sem permissão": é acesso total via memberships.is_owner.
    await expect(roles).toContainText("Acesso total à igreja");
    // Cargo de sistema não oferece excluir (o RLS recusaria).
    await expect(page.getByRole("button", { name: "Excluir Pastor" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Excluir Membro" })).toHaveCount(0);
  });

  test("criar, editar e excluir um cargo personalizado", async ({ page }) => {
    const roles = await openTeamTab(page);

    // Criar com duas permissões marcadas.
    await page.getByRole("button", { name: "+ Novo cargo" }).click();
    await page.getByLabel("Nome do cargo").fill(ROLE);
    await page.getByRole("checkbox", { name: /Editar pessoas/ }).check();
    await page.getByRole("checkbox", { name: /Ver acompanhamentos/ }).check();
    await page.getByRole("button", { name: "Criar cargo" }).click();

    const row = roles.locator("li").filter({ hasText: ROLE }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Editar pessoas");
    await expect(row).toContainText("Ver acompanhamentos");
    await expect(row).toContainText("0 pessoas");
    await expect(row).not.toContainText("padrão"); // personalizado, não de sistema

    // Editar: renomear e tirar uma permissão.
    await row.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome do cargo").fill(RENAMED);
    await page.getByRole("checkbox", { name: /Ver acompanhamentos/ }).uncheck();
    await page.getByRole("button", { name: "Salvar" }).click();

    const renamed = roles.locator("li").filter({ hasText: RENAMED }).first();
    await expect(renamed).toBeVisible();
    await expect(renamed).not.toContainText("Ver acompanhamentos");

    // Excluir (é personalizado → o botão existe e o RLS permite).
    await renamed.getByRole("button", { name: `Excluir ${RENAMED}` }).click();
    await expect(roles.locator("li").filter({ hasText: RENAMED })).toHaveCount(0);
  });

  test("nome duplicado é barrado antes de ir ao banco", async ({ page }) => {
    await openTeamTab(page);

    await page.getByRole("button", { name: "+ Novo cargo" }).click();
    await page.getByLabel("Nome do cargo").fill("Pastor");
    await page.getByLabel("Nome do cargo").blur();
    await expect(page.getByText("Já existe um cargo com esse nome.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar cargo" })).toBeDisabled();
  });

  test("cada pessoa da equipe tem um cargo atribuível", async ({ page }) => {
    await openTeamTab(page);
    const people = page.getByRole("list", { name: "Pessoas com acesso" });
    await expect(people).toBeVisible();
    // O dono aparece sem seletor: quem manda nele é is_owner, não o cargo.
    await expect(people).toContainText("Dono — acesso total");
    await expect(people.locator("li").filter({ hasText: "você" })).toHaveCount(1);
  });
});

// Login uma vez por arquivo (a sessão vive no contexto do worker).
test.beforeEach(async ({ page }) => {
  if (!EMAIL || !PASSWORD) return;
  await login(page);
});
