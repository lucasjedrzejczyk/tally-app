import { test, expect } from "@playwright/test";

// E2e leve dos fluxos críticos de auth SSR (login → página protegida com dados
// reais semeados → logout), contra a org de teste. Credenciais vêm de .env.test.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

test.describe("auth SSR + render autenticado", () => {
  test("senha visível, troca de modo e recuperação sem sessão", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByPlaceholder("Senha", { exact: true });
    await password.fill("exemplo123");
    await page.getByRole("button", { name: "Mostrar senha", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ocultar senha", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Cadastre-se" }).click();
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Esqueci a senha" })).toHaveCount(0);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole("link", { name: "Esqueci a senha" }).click();
    await expect(page.getByRole("heading", { name: "Redefinir senha" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar link" })).toBeVisible();
    await page.goto("/redefinir-senha");
    await expect(page.getByText("Link expirado. Peça um novo.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Pedir novo link" })).toHaveAttribute("href", "/esqueci-senha");
    await page.goto("/auth/callback?next=/redefinir-senha");
    await expect(page).toHaveURL(/\/redefinir-senha\?expired=1$/);
  });

  test("não-autenticado em /sticks é redirecionado para /login", async ({ page }) => {
    await page.goto("/sticks");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByPlaceholder("E-mail")).toBeVisible();
  });

  test("login mostra dados semeados e logout volta ao login", async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, "fixture ausente (.env.test)");

    // Login
    await page.goto("/login");
    await page.getByPlaceholder("E-mail").fill(EMAIL);
    await page.getByPlaceholder("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    // Chega no app (Home protegida)
    await expect(page).toHaveURL(/\/$|\/study(\/bible.*)?$|\/onboarding$/);

    // Modo só Estudo (src/config/nav.ts): Escalas (/teams) desligado redireciona para a Bíblia.
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/study\/bible\/[A-Z0-9]+\/\d+$/); // /study/bible pula para o capítulo

    // Logout pelo menu do perfil → volta pro login (sessão invalidada no servidor).
    // dispatchEvent: o indicador de dev do Next fica por cima do canto do menu.
    await page.getByTestId("profile-menu").dispatchEvent("click");
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
