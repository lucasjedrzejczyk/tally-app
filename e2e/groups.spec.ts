import { test, expect } from "@playwright/test";
import { signInTestUser } from "../src/test-support/supabase";

// Células (spec 14, fases A e C): criar a célula, adicionar 3 membros, marcar presença de 2 (tocando nos
// rostos), reabrir o dia pelo gráfico e ver 2 marcados, "Não teve encontro" em outro dia. As pessoas e a célula criadas são apagadas no fim.
const EMAIL = process.env.TALLY_TEST_EMAIL ?? "";
const PASSWORD = process.env.TALLY_TEST_PASSWORD ?? "";

const stamp = Date.now();
const cellName = `Teste Célula ${stamp}`;
const people = ["A", "B", "C"].map((l) => `Teste Membro ${l} ${stamp}`);

const br = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

test.beforeAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  const { error } = await supabase.from("sticks").insert(people.map((full_name) => ({ org_id: orgId, full_name, relationship_status: "member" as const })));
  if (error) throw new Error(error.message);
});

test.afterAll(async () => {
  const { supabase, orgId } = await signInTestUser();
  const { data: groups } = await supabase.from("groups").select("id").eq("org_id", orgId).in("name", [cellName, "Nova célula"]);
  for (const g of groups ?? []) {
    await supabase.from("attendance_sessions").delete().eq("org_id", orgId).eq("context_type", "group").eq("context_id", g.id);
    await supabase.from("groups").delete().eq("id", g.id);
  }
  await supabase.from("sticks").delete().eq("org_id", orgId).in("full_name", people);
});

test("células: criar, adicionar membros, marcar presença, reabrir o dia e registrar dia sem encontro", async ({ page }) => {
  test.setTimeout(150000);
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });

  await page.goto("/groups");
  await expect(page.getByRole("heading", { name: "Células", level: 1 })).toBeVisible();

  // criar: a ficha abre direto no Editar, com o foco no nome
  await page.getByRole("button", { name: "Nova célula", exact: true }).click();
  await expect(page).toHaveURL(/[?&]g=.*edit=1|edit=1.*[?&]g=/);
  const id = new URL(page.url()).searchParams.get("g");
  expect(id).toBeTruthy();
  const nameInput = page.getByLabel("Nome", { exact: true });
  await expect(nameInput).toBeFocused();
  await nameInput.fill(cellName);
  await nameInput.press("Enter");
  await expect(page.getByRole("heading", { name: cellName })).toBeVisible();

  // dia e horário
  await page.locator("select[aria-label='Dia']").selectOption("Quinta");
  const time = page.getByLabel("Horário", { exact: true });
  await time.fill("25:00");
  await time.press("Enter");
  await expect(page.getByText("Horário inválido.")).toBeVisible();
  await time.fill("20h");
  await time.press("Enter");
  await expect(page.getByText("Salvo")).toBeVisible();

  // adicionar os 3 membros
  await page.getByRole("button", { name: "Adicionar membros" }).click();
  await page.getByLabel("Buscar pessoa", { exact: true }).fill(`Teste Membro`);
  for (const n of people) await page.getByRole("checkbox", { name: n }).click();
  await page.getByRole("button", { name: "Adicionar 3" }).click();
  await expect(page.getByRole("heading", { name: "Membros (3)" })).toBeVisible();

  // Pronto volta para a leitura
  await page.getByRole("button", { name: "Pronto" }).first().click();
  await expect(page).not.toHaveURL(/edit=1/);
  await expect(page.getByRole("article").getByText("Quintas, 20h", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Membros (3)" })).toBeVisible();
  for (const n of people) await expect(page.getByRole("button", { name: n })).toBeVisible(); // um rosto por membro

  // (o dia padrão é anterior à entrada do terceiro, que não veio: o encontro conta 2 de 2, sem mexer na entrada)
  // marcar presença de 2 no dia padrão (último dia da semana da célula)
  await page.getByRole("button", { name: "Marcar presença" }).click();
  const dialog = page.getByRole("dialog", { name: "Presença" });
  await expect(dialog.getByRole("button", { name: /^Marcar Teste Membro/ })).toHaveCount(3);
  await dialog.getByRole("button", { name: `Marcar ${people[0]!}` }).click();
  await dialog.getByRole("button", { name: `Marcar ${people[1]!}` }).click();
  await expect(dialog.getByRole("button", { name: `Desmarcar ${people[0]!}` })).toBeVisible();
  await expect(dialog.getByText("2 de 3")).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /: 2 de 2$/ })).toHaveCount(1);

  // reabrir o dia pela coluna do gráfico: 2 marcados
  await page.getByRole("button", { name: /: 2 de 2$/ }).click();
  await expect(dialog.getByRole("button", { name: /^Desmarcar / })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: `Marcar ${people[2]!}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // outro dia: "Não teve encontro"
  const other = new Date();
  other.setDate(other.getDate() - 20);
  await page.getByRole("button", { name: "Marcar presença" }).click();
  await dialog.getByLabel("Data do encontro").fill(br(other));
  await expect(dialog.getByText("0 de 3")).toBeVisible();
  await dialog.getByRole("button", { name: "Não teve encontro neste dia" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /: sem encontro$/ })).toHaveCount(1);

  // a ficha abre pela URL e a lista mostra a célula
  await page.goto(`/groups/${id}`);
  await expect(page.getByRole("heading", { name: cellName })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(cellName) }).first()).toBeVisible();

  // A7: na ficha da pessoa, "Na igreja" mostra a célula (com link) e desde quando
  const { supabase, orgId } = await signInTestUser();
  const { data: a } = await supabase.from("sticks").select("id").eq("org_id", orgId).eq("full_name", people[0]!).single();
  await page.goto(`/people/${a!.id}`);
  await expect(page.getByRole("link", { name: cellName })).toHaveAttribute("href", `/groups?g=${id}`);
  await expect(page.getByText(/\(desde [a-z]{3}\/\d{4}\)/)).toBeVisible();
});

// Celular (390px): com Pessoas e Células a barra passa de 5 itens, então mostra 4 e o resto vai em "Mais".
test("barra de abas do celular: 4 itens + Mais com o resto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByPlaceholder("E-mail").fill(EMAIL);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/study/, { timeout: 30000 });
  const bar = page.getByRole("navigation", { name: "Menu" }).last();
  await expect(bar.getByRole("link")).toHaveCount(4);
  await bar.getByRole("button", { name: "Mais" }).click();
  await expect(page.getByRole("menuitem", { name: "Ajustes" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sermões" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Ajustes" })).toHaveCount(0);
});
