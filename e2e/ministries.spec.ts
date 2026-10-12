import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Ministérios e escalas (spec 15): criar o ministério com Vocal (2 vagas) e Som, adicionar 3 pessoas
// com as funções, montar a escala do próximo domingo tocando nas vagas, conflito com outro ministério
// no mesmo horário (pede 2º toque), link do WhatsApp com a mensagem pronta e "1 vaga" ao tirar alguém.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const stamp = Date.now();
const name = `Teste Louvor ${stamp}`;
const other = `Teste Recepção ${stamp}`;
const [ana, bia, caio] = ["Ana", "Bia", "Caio"].map((l) => `${l} Teste ${stamp}`) as [string, string, string];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sunday = (() => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
})();

test.beforeAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  const { data: sticks, error } = await supabase
    .from("sticks")
    .insert([ana, bia, caio].map((full_name, i) => ({ org_id: orgId, full_name, relationship_status: "member" as const, phone: i === 0 ? "11988887777" : null })))
    .select("id, full_name");
  if (error) throw new Error(error.message);
  // Caio já está na Recepção no mesmo culto (conflito).
  const caioId = sticks!.find((s) => s.full_name === caio)!.id;
  const { data: m, error: mErr } = await supabase.from("ministries").insert({ org_id: orgId, name: other, roles: ["Porta"] }).select("id").single();
  if (mErr) throw new Error(mErr.message);
  await supabase.from("ministry_members").insert({ org_id: orgId, ministry_id: m!.id, stick_id: caioId, roles: ["Porta"] });
  const { error: aErr } = await supabase.from("schedule_assignments").insert({ org_id: orgId, ministry_id: m!.id, assignment_date: iso(sunday), service_time: "19:00", role: "Porta", stick_id: caioId });
  if (aErr) throw new Error(aErr.message);
});

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("ministries").delete().eq("org_id", orgId).in("name", [name, other, "Novo ministério"]);
  await supabase.from("sticks").delete().eq("org_id", orgId).in("full_name", [ana, bia, caio]);
});

test("ministérios: funções, quem serve, escala por toque, conflito, WhatsApp e vaga aberta", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  await page.goto("/ministries");
  await expect(page.getByRole("heading", { name: "Ministérios", level: 1 })).toBeVisible();

  // criar: abre no Editar com foco no nome
  await page.getByRole("button", { name: "Novo ministério", exact: true }).click();
  await expect(page).toHaveURL(/edit=1/);
  const nameInput = page.getByLabel("Nome", { exact: true });
  await expect(nameInput).toBeFocused();
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.locator("select[aria-label='Dia do culto']").selectOption("Domingo");
  const time = page.getByLabel("Horário", { exact: true });
  await time.fill("19h");
  await time.press("Enter");

  // funções: Vocal com 2 vagas e Som
  const fn = page.getByLabel("Nova função");
  await fn.fill("vocal");
  await fn.press("Enter");
  await expect(page.getByText("Vocal", { exact: true })).toBeVisible();
  await fn.fill("Som");
  await fn.press("Enter");
  await page.getByRole("button", { name: "Mais uma vaga de Vocal" }).click();
  await expect(page.getByText("2 vagas")).toBeVisible();

  // quem serve
  await page.getByRole("button", { name: "Adicionar pessoas" }).click();
  await page.getByLabel("Buscar pessoa", { exact: true }).fill(`Teste ${stamp}`);
  for (const n of [ana, bia, caio]) await page.getByRole("checkbox", { name: n }).click();
  await page.getByRole("button", { name: "Adicionar 3" }).click();
  await expect(page.getByRole("heading", { name: "Quem serve (3)" })).toBeVisible();
  await page.getByRole("group", { name: `Funções de ${ana}` }).getByRole("button", { name: "Vocal" }).click();
  await expect(page.getByRole("group", { name: `Funções de ${ana}` }).getByRole("button", { name: "Vocal" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: `Funções de ${caio}` }).getByRole("button", { name: "Som" }).click();
  await expect(page.getByRole("group", { name: `Funções de ${caio}` }).getByRole("button", { name: "Som" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await expect(page).not.toHaveURL(/edit=1/);
  await expect(page.getByText("3 vagas").first()).toBeVisible();

  // montar a escala do próximo domingo
  await page.getByRole("button", { name: "Montar escala" }).click();
  const sheet = page.getByRole("dialog", { name: "Escala" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Escalar Vocal" }).first().click();
  const sugg = page.getByRole("dialog", { name: "Escalar Vocal" });
  await expect(sugg.getByRole("button").first()).toContainText(ana); // faz a função, vem primeiro
  await sugg.getByRole("button", { name: new RegExp(ana) }).click();
  await expect(sheet.getByRole("button", { name: `${ana}, Vocal` })).toBeVisible();
  await sheet.getByRole("button", { name: "Escalar Vocal" }).click();
  await page.getByRole("dialog", { name: "Escalar Vocal" }).getByRole("button", { name: new RegExp(bia) }).click();

  // conflito: Caio já está na Recepção no mesmo horário; o 1º toque só avisa
  await sheet.getByRole("button", { name: "Escalar Som" }).click();
  const som = page.getByRole("dialog", { name: "Escalar Som" });
  await expect(som.getByText(`Já está em ${other} (Porta) neste horário`)).toBeVisible();
  await som.getByRole("button", { name: new RegExp(caio) }).click();
  await expect(som.getByText("Toque de novo para escalar mesmo assim")).toBeVisible();
  await som.getByRole("button", { name: new RegExp(caio) }).click();
  await expect(sheet.getByText("3 de 3")).toBeVisible();

  // WhatsApp com a mensagem pronta
  await sheet.getByRole("button", { name: `${ana}, Vocal` }).click();
  const wa = page.getByRole("dialog", { name: ana }).getByRole("link", { name: "Avisar no WhatsApp" });
  await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/5511988887777\?text=Oi%20Ana!%20Escala%20de%20Teste%20Louvor/);
  await page.keyboard.press("Escape");

  // tirar a Bia reabre a vaga; ao fechar, a ficha mostra "1 vaga" no culto
  await sheet.getByRole("button", { name: `${bia}, Vocal` }).click();
  await page.getByRole("dialog", { name: bia }).getByRole("button", { name: "Tirar" }).click();
  await expect(sheet.getByText("2 de 3")).toBeVisible();
  await expect(sheet.getByText("Salvando…")).toHaveCount(0); // a fila de gravações esvaziou
  await sheet.getByRole("button", { name: "Fechar" }).click();
  await expect(page.getByText("1 vaga").first()).toBeVisible();

  // gravou de verdade: recarregar mantém
  await page.reload();
  await expect(page.getByText("1 vaga").first()).toBeVisible();
});
