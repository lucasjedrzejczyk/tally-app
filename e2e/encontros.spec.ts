import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Encontros (spec 16): cadastrar culto, ver na semana, ministério ligado com o rosto escalado,
// contagem que fica, ordem do culto (e a de sempre), cancelar e reabrir, evento com inscrição e check-in.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const stamp = Date.now();
const culto = `Culto Teste ${stamp}`;
const evento = `Retiro Teste ${stamp}`;
const ministry = `Teste Louvor E ${stamp}`;
const [ana, bia] = ["Ana", "Bia"].map((l) => `${l} Encontro ${stamp}`) as [string, string];

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  await supabase.from("ministries").delete().eq("org_id", orgId).eq("name", ministry);
  await supabase.from("services").delete().eq("org_id", orgId).eq("name", culto);
  await supabase.from("events").delete().eq("org_id", orgId).in("name", [evento, `${evento} (cópia)`]);
  await supabase.from("sticks").delete().eq("org_id", orgId).in("full_name", [ana, bia]);
});

test("encontros: culto na semana, quem serve, contagem, ordem, cancelar, evento com check-in", async ({ page, context }) => {
  test.setTimeout(180000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { supabase, orgId } = await signInTestUser();
  const { data: sticks, error } = await supabase
    .from("sticks")
    .insert([ana, bia].map((full_name) => ({ org_id: orgId, full_name, relationship_status: "member" as const })))
    .select("id, full_name");
  if (error) throw new Error(error.message);
  const anaId = sticks!.find((s) => s.full_name === ana)!.id;

  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  await page.goto("/encontros");
  await expect(page.getByRole("heading", { name: "Encontros", level: 1 })).toBeVisible();

  // culto novo: painel nasce do Plus, abre no Editar com foco no nome
  await page.getByRole("button", { name: "Novo encontro" }).click();
  await page.getByRole("dialog", { name: "Novo encontro" }).getByRole("button", { name: /Culto que repete/ }).click();
  await expect(page).toHaveURL(/edit=1/);
  const nameInput = page.getByLabel("Nome", { exact: true });
  await expect(nameInput).toBeFocused();
  await nameInput.fill(culto);
  await nameInput.press("Enter");
  const local = page.getByLabel("Local", { exact: true });
  await local.fill("Rua X, 100");
  await local.press("Enter");
  await expect(page.getByRole("heading", { name: culto })).toBeVisible();
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await expect(page).not.toHaveURL(/edit=1/);

  // aparece na semana
  const card = page.locator("[data-key^='s:']").filter({ hasText: culto });
  await expect(card).toBeVisible();
  const key = decodeURIComponent(new URL(page.url()).searchParams.get("o") ?? "");
  const [, serviceId, date] = key.split(":") as [string, string, string];

  // ministério ligado ao culto, com a Ana escalada
  const { data: m, error: mErr } = await supabase.from("ministries").insert({ org_id: orgId, name: ministry, roles: ["Vocal"], service_id: serviceId }).select("id").single();
  if (mErr) throw new Error(mErr.message);
  await supabase.from("ministry_members").insert({ org_id: orgId, ministry_id: m!.id, stick_id: anaId, roles: ["Vocal"] });
  const { error: aErr } = await supabase.from("schedule_assignments").insert({ org_id: orgId, ministry_id: m!.id, assignment_date: date, service_time: "19:00", role: "Vocal", stick_id: anaId, status: "assigned" });
  if (aErr) throw new Error(aErr.message);
  await page.reload();
  await expect(page.getByRole("button", { name: `Escala de ${ministry}` })).toBeVisible();
  await page.getByRole("button", { name: `Escala de ${ministry}` }).click();
  await expect(page.getByRole("dialog", { name: "Escala" }).getByRole("button", { name: `${ana}, Vocal` })).toBeVisible();
  await page.getByRole("dialog", { name: "Escala" }).getByRole("button", { name: "Fechar" }).click();

  // convite pronto
  await page.getByRole("button", { name: "Copiar convite" }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`${culto}. Rua X, 100. Te esperamos!`);

  // culto que já passou sem contagem aparece como "Faltou contar" na semana
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const past = date < iso(new Date());
  if (past) await expect(card).toContainText("Faltou contar");

  // contagem grava e fica
  await page.getByRole("button", { name: "Pessoas: sem contagem" }).click();
  await page.getByLabel("Pessoas", { exact: true }).fill("120");
  await page.getByLabel("Pessoas", { exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: "Pessoas: 120" })).toBeVisible();
  await expect(card).not.toContainText("Faltou contar");

  // ordem do culto, e a de sempre
  await page.getByRole("button", { name: "Montar a ordem do culto" }).click();
  await page.getByLabel("Item", { exact: true }).first().fill("Louvor");
  await page.getByLabel("Item", { exact: true }).first().press("Enter");
  await page.getByLabel("Item", { exact: true }).nth(1).fill("Palavra");
  await page.getByRole("button", { name: "Salvar como ordem de sempre" }).click();
  await expect(page.getByText("Esta é a ordem de sempre agora.")).toBeVisible();
  await page.getByRole("button", { name: "Pronto" }).click();
  await expect(page.locator("ol").getByText("Palavra")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Pessoas: 120" })).toBeVisible();
  await expect(page.locator("ol").getByText("Louvor")).toBeVisible();

  // cancelar o dia: riscado na semana; reabrir
  await page.getByRole("button", { name: "Mais ações do culto" }).click();
  await page.getByRole("menuitem", { name: "Cancelar este dia" }).click();
  await expect(page.getByText("Culto cancelado neste dia.")).toBeVisible();
  await expect(card).toContainText("Cancelado");
  await page.getByRole("button", { name: "Reabrir" }).click();
  await expect(card).not.toContainText("Cancelado");

  // evento com inscrição e check-in
  await page.getByRole("button", { name: "Novo encontro" }).click();
  await page.getByRole("dialog", { name: "Novo encontro" }).getByRole("button", { name: /Evento/ }).click();
  const evName = page.getByLabel("Nome", { exact: true });
  await expect(evName).toBeFocused();
  await evName.fill(evento);
  await evName.press("Enter");
  await expect(page.getByRole("heading", { name: evento })).toBeVisible();
  await page.getByRole("button", { name: "Com inscrição" }).click();
  await expect(page.getByRole("button", { name: "Com inscrição" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await page.getByRole("button", { name: "Inscrever pessoas da igreja" }).click();
  await page.getByLabel("Buscar pessoa", { exact: true }).fill(`Encontro ${stamp}`);
  for (const n of [ana, bia]) await page.getByRole("checkbox", { name: n }).click();
  await page.getByRole("button", { name: "Adicionar 2" }).click();
  await expect(page.getByRole("heading", { name: /^Inscritos \(2\)$/ })).toBeVisible();
  await page.getByLabel("Nome de quem não é da igreja").fill("Visitante Teste");
  await page.getByLabel("Nome de quem não é da igreja").press("Enter");
  await expect(page.getByRole("heading", { name: /^Inscritos \(3\)$/ })).toBeVisible();
  await page.getByRole("button", { name: ana, exact: true }).click();
  await expect(page.getByRole("button", { name: `${ana}, chegou` })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 de 3 chegaram")).toBeVisible();
  await expect(page.locator("[data-key^='e:']").filter({ hasText: evento })).toContainText("3 inscritos");

  await page.reload();
  await expect(page.getByText("1 de 3 chegaram")).toBeVisible();

  // duplicar o evento abre a cópia no Editar
  await page.getByRole("button", { name: "Mais ações do evento" }).click();
  await page.getByRole("menuitem", { name: "Duplicar evento" }).click();
  await expect(page.getByRole("heading", { name: `${evento} (cópia)` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Com inscrição" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await expect(page.getByRole("heading", { name: /^Inscritos \(0\)$/ })).toBeVisible();

  // culto mensal: 1º domingo do mês
  await page.goto(`/encontros?o=${key}&edit=1`);
  await page.locator("select[aria-label='Como o culto repete']").selectOption({ label: "1º domingo do mês" });
  // o domingo aberto não é o 1º do mês: a ficha pula para o próximo 1º domingo
  if (Number(date.slice(8)) > 7) await expect.poll(() => decodeURIComponent(page.url())).not.toContain(date);
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await expect(page.getByText("1º domingo do mês")).toBeVisible();
  const day = Number(decodeURIComponent(new URL(page.url()).searchParams.get("o") ?? "").slice(-2));
  expect(day).toBeLessThanOrEqual(7);
});
