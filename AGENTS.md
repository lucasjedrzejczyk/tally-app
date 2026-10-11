# Tally: instruções para o agente (OpenCode)

Leia este arquivo inteiro antes de agir. Ele substitui o CLAUDE.md, que está desatualizado (fala de Vite; o app hoje é Next.js).

## Contexto em 1 minuto

- Tally é um "Church OS". Hoje SÓ o módulo **Estudo** aparece (`STUDY_ONLY` em `src/config/nav.ts`): leitura da Bíblia estilo Bíblia Raízes, palavra em português ligada ao grego/hebraico, dicionário, sermões e notas.
- Stack: Next.js (App Router) + TypeScript estrito + Supabase (projeto `zzgxeylyrtzsqcdguxql`, plano GRÁTIS, banco em ~330 MB de 500 MB).
- O dono (Gaybiel) é de marketing, não é dev. Explique em português simples, em poucas linhas. Peça aprovação antes de mudança grande (tela nova, apagar coisa, carga grande no banco).
- Texto que o usuário vê ou recebe: sem travessão longo (—), sem emoji, sem cara de texto de IA.

## Onde trabalhar

- Pasta: `tally-app-leitura` (esta). É um worktree git na branch `feature/estudo-dicionario`, igual à `main`.
- Um hook de post-commit faz push da branch sozinho. Publicar no ar = `git push origin HEAD:main` (a Vercel faz o deploy). Só publique depois de verificar.
- Verificação: `npm run verify` (typecheck + lint + teste + build). Leitura: `npx playwright test e2e/reader.spec.ts` (usa `.env.test`, sobe o dev server na porta 3000). Nunca rode o build com o dev server no ar.
- Segredos: `.env.local` tem só a anon key. NÃO existe service_role aqui. Coisa que exige SQL (criar ou apagar função, migration) o dono cola no **SQL Editor do Supabase**. Escreva o SQL pronto para ele colar.
- Pastas `scripts/*/work/` são gitignored (dados grandes, gerados por script).

## Fila de tarefas (nesta ordem)

### 0. FEITO em 2026-10-03 (main f915577; banco 333 -> 202 MB). Lição: o drop da tabela antiga veio ANTES de publicar e o app ficou quebrado no ar; banco só muda depois do código no ar.

O banco está em ~333 MB de 500 MB; `bible_tagged_words` sozinha ocupa 160 MB (1,1 milhão de linhas, uma por trecho, incluindo espaços). Meta: uma linha por VERSÍCULO. Ordem segura (o app nunca fica sem dados):

1. Migration nova `supabase/migrations/<data>_m58_bible_tagged_verses.sql` (o dono cola no SQL Editor, ou o Claude aplica):
   ```sql
   create table if not exists public.bible_tagged_verses (
     translation text not null, book text not null, chapter int not null, verse int not null,
     spans jsonb not null,  -- [["No princípio","G0746"],[" ",null],...] na ordem
     primary key (translation, book, chapter, verse)
   );
   alter table public.bible_tagged_verses enable row level security;
   create policy tagged_verses_read on public.bible_tagged_verses for select using (true);
   insert into public.bible_tagged_verses (translation, book, chapter, verse, spans)
   select translation, book, chapter, verse, jsonb_agg(jsonb_build_array(text, strong) order by position)
   from public.bible_tagged_words group by translation, book, chapter, verse
   on conflict do nothing;
   ```
2. `src/features/study/reader-queries.ts`, `getTaggedChapter`: ler `bible_tagged_verses` (select verse, spans; eq translation/book/chapter; order verse) e devolver o MESMO `TaggedWordRow[]` de hoje (position = índice + 1, text = spans[i][0], strong = spans[i][1]). Nada mais no app muda. Ajustar `reader-queries.integration.test.ts` e `src/lib/database.types.ts` (tipo da tabela nova).
3. `scripts/seed-original-text.mjs` modo `tagged`: continuar lendo o mesmo TSV, mas agrupar por versículo e fazer upsert em `bible_tagged_verses` (onConflict translation,book,chapter,verse). No caminho via token, a função temporária `tmp_tagged_load` precisa gravar na tabela nova.
4. Verificar: `npm run verify` + `npx playwright test e2e/reader.spec.ts` (João 1 e Gênesis 1). Publicar (`git push origin HEAD:main`).
5. Só DEPOIS de publicado e conferido no ar: `drop table public.bible_tagged_words;` (dono/Claude). Conferir o tamanho com `select pg_size_pretty(pg_database_size(current_database()));`.

### 1. AT passo 2: traduzir o léxico hebraico para português (FEITO em 2026-10-02: 8.515 verbetes no banco; pular para a 2)

Hoje a aba Palavra mostra a definição do hebraico em inglês. Os lotes já estão montados:
`scripts/align/work/lex-69.input.json` até `lex-175.input.json` (8.515 verbetes, 80 por lote). Os lotes 1 a 68 são do NT e já estão prontos (não mexer).

Para cada lote:
1. Leia `scripts/align/LEX-PROMPT.md` (regras) e o `lex-NN.input.json`.
2. Escreva `scripts/align/work/lex-NN.pt.json` à mão: `[{ strong, gloss_pt, definition_pt }]`, mesma ordem. Nomes próprios na forma usual brasileira ("Abraão", "Jerusalém"); referências no formato "Gn 1.1".
3. Rode `node scripts/align/validate-lexicon.mjs NN` e corrija até dar `ok`.

PROIBIDO gerar a tradução por script (recortar o inglês, dicionário automático etc.). Já aconteceu de um modelo fazer isso, e o validador foi endurecido para pegar. Se um lote vier cortado no meio, refaça o lote.

Quando os 107 lotes passarem:
1. `node scripts/align/validate-lexicon.mjs all` gera `scripts/align/work/lexpt-nt.tsv` (NT + AT; recarregar o NT não faz mal).
2. Peça ao dono para colar no SQL Editor (troque SENHA por uma senha aleatória longa):
   ```sql
   create or replace function public.tmp_lexpt_load(p_token text, p_rows jsonb) returns int
   language plpgsql security definer set search_path = public as $$
   declare n int;
   begin
     if p_token is distinct from 'SENHA' then raise exception 'token'; end if;
     update strongs_lexicon l set gloss_pt = r->>'gloss_pt', definition_pt = r->>'definition_pt'
     from jsonb_array_elements(p_rows) r where l.strong = r->>'strong';
     get diagnostics n = row_count; return n;
   end $$;
   grant execute on function public.tmp_lexpt_load(text, jsonb) to anon;
   ```
3. Rode `LOAD_TOKEN=SENHA node --env-file=.env.local scripts/seed-original-text.mjs lexpt scripts/align/work/lexpt-nt.tsv`.
4. Peça ao dono para apagar a função: `drop function public.tmp_lexpt_load(text, jsonb);`
5. Confira no app: Gênesis 1, chave Interlinear ligada, toque em "criou": a definição tem que aparecer em português.

### 2. Frente B: sublinhado completo (NT) (FEITO em 2026-10-03: 239 capítulos no Gemini + 21 de João carregados em bible_tagged_verses; pular para a 3)

Concluído em 2026-10-03: 7.957 versículos no banco (239 capítulos gerados pelo Gemini, 21 capítulos do gabarito de João, 92,3% de acordo médio com o estatístico e fallbacks nos 10,7% de falha).


### 3. Frente C: comentários bíblicos em João (FEITO em 2026-10-03: 1.164 comentários de João carregados em bible_commentary e aba Comentário pronta; pular para a 4)

Spec 09. Concluído em 2026-10-03: fontes Jamieson-Fausset-Brown e Tyndale traduzidas integralmente para PT nos 21 capítulos de João (1.164 comentários na tabela bible_commentary). Aba Comentário disponível na área de trabalho e no menu "+ Nova aba", com créditos e badges de licença.

### 4. Refazer a tela de login (FEITA e PUBLICADA, commit 1a93120)

Pedido do dono: "a tela de login de modo geral tá bem ruim". Arquivos: `src/app/(auth)/login/` (page.tsx, LoginForm.tsx). Siga `docs/design-principles.md` e o visual novo do Estudo (menu lateral escuro, Literata no texto). Mostre uma prévia ao dono antes de publicar. O teste `e2e/auth.spec.ts` usa os placeholders "E-mail"/"Senha" e o botão "Entrar": mantenha-os ou ajuste o teste junto.

### 4b. Polir o login + "Esqueci a senha" (FEITA e PUBLICADA, commit 2cbc4b6)

Implementados o polimento do login, o botão de mostrar senha e os fluxos de recuperação e redefinição. Links de recuperação inválidos levam ao aviso de link expirado. Prévias em `docs/previews/`: `login-*.png`, `forgot-desktop-light.png`, `reset-desktop-light.png` e `reset-expired-desktop-light.png`. Não refazer. Publicar somente após o dono aprovar as prévias. O recebimento do e-mail real ainda depende de conferir a URL permitida no Supabase e testar com uma caixa de e-mail.

Spec (texto em PT-BR, sem travessão longo, sem emoji; manter placeholders "E-mail"/"Senha" e botão "Entrar", o e2e depende):

A) CSS `login.module.css`
1. Sem `.brand::after` (brilho) e sem `.tagline`.
2. Custom property `--ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1)` no `.page`.
3. `.btn`/`.google`: `transition: transform 160ms var(--ease-out-strong), background 160ms ease, border-color 160ms ease`; `:active { transform: scale(0.97) }` (google 0.98). Hover só dentro de `@media (hover: hover) and (pointer: fine)`.
4. `.field input`: transition de border-color/box-shadow 120ms var(--ease-out-strong).
5. `.title`: 32px, letter-spacing -0.025em, line-height 1.1. `.verse cite`: letter-spacing .01em.
6. `.err`: opacity 0 + translateY(-2px) por padrão; `[data-on="true"]` opacity 1, translateY(0); 150ms ease-out-strong; min-height 18px.
7. Troca Entrar/Criar conta: título e subtítulo com `.swap` (transition filter/opacity 150ms ease) e `.swapping` (blur 2px, opacity .7); o modo troca após 150ms (setTimeout) e tira o swapping.
8. `.form` entra com `@starting-style { opacity 0; translateY(6px) }`, 240ms ease-out-strong.
9. `@media (prefers-reduced-motion: reduce)`: sem blur nem transform, só opacity.
10. Campo de senha com botão olho (`PasswordInput.tsx`): type="button", aria-label "Mostrar senha"/"Ocultar senha", SVG 18px cor var(--text-2), input com padding-right 44px.
11. Link "Esqueci a senha" (13px, var(--text-2), alinhado à direita, abaixo de Senha, só no modo login) para `/esqueci-senha`.

B) Erro no campo certo (`actions.ts` + LoginForm)
- `AuthState = { error: string | null; field?: "email" | "password" }`.
- signIn: "Invalid login credentials" -> "E-mail ou senha incorretos." (password); "Email not confirmed" -> "Confirme o e-mail pelo link que enviamos." (email); mensagem com "invalid" e "email" -> "E-mail inválido." (email).
- signUp: "already registered" -> "Este e-mail já tem conta. Entre com a senha." (email); "Password should be" -> "A senha precisa ter pelo menos 6 caracteres." (password).
- `.field[data-invalid="true"] input { border-color: var(--coral) }` + `aria-invalid`. Texto do erro só no `.err` (uma vez).

C) Esqueci a senha
- `/esqueci-senha`: mesmo layout (`s.page` + `<BrandPanel />`), título "Redefinir senha", campo E-mail, botão "Enviar link", link "Voltar para entrar". Action chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/auth/callback?next=/redefinir-senha" })` montando origin do mesmo jeito que o callback. Resposta sempre neutra: "Se existir conta com esse e-mail, enviamos um link para redefinir a senha."
- `/redefinir-senha`: "Nova senha" + "Confirmar senha" (iguais, mínimo 6), botão "Salvar senha", action `supabase.auth.updateUser({ password })` e `redirect("/")`. Sem sessão: "Link expirado. Peça um novo." com link para /esqueci-senha.
- Supabase: o dono precisa adicionar a URL de produção + `/auth/callback` em Authentication > URL Configuration se ainda não estiver (já deve estar, por causa do Google).

D) Verificação e entrega
1. `npm run verify`. Se um teste de integração falhar com "JWT issued at future", reexecute só ele: `npx vitest run <arquivo> --no-file-parallelism`. Nunca rode build com dev server no ar.
2. `npx playwright test e2e/tmp-shot.spec.ts e2e/auth.spec.ts` (screenshots em docs/previews/: login claro/escuro/celular, forgot, reset). Depois APAGUE `e2e/tmp-shot.spec.ts`.
3. Commit na branch (o hook faz push da branch). NÃO publique na main: mostre as prévias ao dono e espere "aprovado". Aí `git push origin HEAD:main`.

### 4c. Leitura: comentário corrido, sol/lua, sem Recentes, "Original" (FEITA e PUBLICADA em 2026-10-04)

Texto em PT-BR, sem travessão longo, sem emoji. Sem animação em ação frequente (troca de versículo, troca de tema).

1. **Aba Comentário vira texto corrido do capítulo** (`src/features/study/components/reader/CommentaryTab.tsx`, `src/features/study/commentary.ts`).
   - Nova função pura `chapterCommentary(rows, source, chapter): { blocks: (CmtBlock & { anchor?: { start: number; end: number } })[] }` que devolve TODOS os blocos da fonte escolhida, na ordem do capítulo (JFB: intro primeiro, depois cada linha por verse_start; Tyndale: cada segmento de `tyndaleSegments` na ordem). O primeiro bloco de cada trecho leva `anchor` (versículo inicial/final que ele cobre). `pickCommentary` pode continuar existindo para os testes antigos, mas a tela não usa mais.
   - Render: título fixo "Comentário de João N" + seletor JFB|Tyndale (como hoje). Corpo = todos os blocos. Antes de cada trecho com `anchor`, uma linha de referência pequena ("Jo 1.1-5", classe `.cmtLabel` já existe) com `id="cmt-v{start}"` e `data-start`/`data-end`.
   - Versículo selecionado no texto (`verse`): achar o trecho cujo intervalo cobre o versículo (o último que cobre, se vários); `scrollIntoView({ block: "start" })` SEM smooth, dentro do painel da aba (não a página); marcar o trecho com `data-on="true"` (barra fina à esquerda na cor var(--blue), sem transição). Sem versículo selecionado: nada marcado, texto começa do início. Remover a frase "Toque num versículo para ver o comentário." e o aviso "não comenta o versículo N" (não faz mais sentido; se a fonte não cobre o versículo, só não rola).
   - Crédito da fonte no fim, como hoje. Atualizar `commentary.test.ts` com um teste de `chapterCommentary` (ordem e anchors) e o e2e/smoke que existir para a aba.

2. **Sol/lua na barra da Bíblia** (`ReaderView.tsx`, barra superior onde estão Interlinear, Sermão, Notas): colocar `<ThemeToggle />` (versão ícone, já existe em `src/components/shared/ThemeToggle.tsx`) entre o interruptor Interlinear e o botão Sermão. Botão 32x32, ícone 18px, cor var(--text-2), `:active { transform: scale(0.95) }`, sem outra animação. Manter também a linha no menu do perfil.

3. **Tirar "Recentes" do menu lateral** (`src/components/shared/Sidebar.tsx`, bloco `STUDY_ONLY && recent.length`): apagar o bloco e o que ficar sem uso (prop/estado `recent`, CSS `.sb-recent` se só servir ali). O menu de capítulos (`ChapterPicker.tsx`) continua mostrando os recentes.

4. **Barra de seleção**: em `SelectionBar.tsx` trocar o rótulo "Estudar" por "Original" (abre a aba do versículo no grego/hebraico). Ajustar teste/e2e que procure "Estudar".

5. Verificar: `npm run verify` (teste de integração com "JWT issued at future" = reexecutar só ele com `--no-file-parallelism`), `npx playwright test e2e/reader.spec.ts`. Prévia: screenshot de João 1 com a aba Comentário aberta e o versículo 3 selecionado (claro e escuro) em docs/previews/. Commit na branch; só publicar (`git push origin HEAD:main`) depois do "aprovado" do dono.

### 4d. Harmonia visual: uma decisão só para cada coisa (FEITA e PUBLICADA em 2026-10-04, main b9f2459)

Entrega: quatro etapas verificadas, v2 definitivo, régua de estilos aplicada e ícones Lucide. A 4c entrou no commit `fdaf896` antes da etapa 2. Prévias e evidências em `docs/previews/4d-revisao.md`. Não refazer nem publicar sem aprovação das novas prévias.

Diagnóstico do dono: "o site parece genérico, o Codex e o app do Claude parecem um objeto só". A causa não é cor; é que o Tally toma a MESMA decisão de vários jeitos (7 tamanhos de texto, 8 raios, borda em tudo, ícones de traços diferentes, controles de alturas diferentes). A 4d é uma régua. Leia `docs/design-principles.md` e `docs/design-tokens.md` antes. Não mude fluxo nem funcionalidade; só visual. Trabalhe em ordem, um commit por etapa, `npm run verify` em cada uma.

**Etapa 1. Aposentar o v1 e ligar o v2 de vez** (`src/app/globals.css`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/features/flags/catalog.ts`).
- O conteúdo do bloco `[data-design="v2"]` sobe para o `:root`; o bloco v1 (valores "mentirosos") some; o seletor `[data-design="v2"]` e a flag `ui.design_v2` são removidos (catálogo, teste, layout). Confira que a tela de leitura e o login também recebem a fonte do sistema (o login hoje está fora do layout do dashboard).
- Tirar a Poppins do `app/layout.tsx` e de `globals.css` (`--font-poppins`). A Literata fica (é a fonte de leitura).
- Resultado esperado: UI inteira em `-apple-system, "Segoe UI Variable", system-ui`, 15px/22px no corpo.

**Etapa 2. A régua** (valores finais; qualquer outro número é erro):
- Texto: só `--t-11` (rótulo/legenda), `--t-13` (controles, menu, metadados), `--t-15` (corpo), `--t-17` (título de painel), `--t-22` (título de página). Pesos: 400 texto, 500 rótulo/controle, 600 título. Cor secundária sempre `var(--text-2)`. Nada de 12px, 12.5px, 13.5px, 14px, 24px, 26px.
- Raio: `--r-6` para controles (botão, input, item de menu, chip, aba), `--r-10` para painéis/cards/popovers/menus. `--r-pill` só para avatar e interruptor. Apagar `--r-14` e `--r-20` dos usos (cards usam `--r-10`).
- Altura de controle: 32px (botão, input, select, item de barra). Item do menu lateral: 32px. Padding horizontal 10px. Barra superior da Bíblia: 48px de altura, controles de 32px alinhados ao centro.
- Grade: todo espaçamento em `--s-*` (4, 8, 12, 16, 20, 24, 32). Recuo lateral de conteúdo: 16px no menu lateral, na barra superior e na coluna de leitura (o mesmo valor nos três).
- Bordas: remover `border: 1px solid var(--border)` de cards, painéis, tabelas, inputs em repouso e abas. Separação passa a ser por fundo: superfície = `var(--surface)`, painel ou hover = `var(--surface-2)`. Input em repouso: fundo `var(--surface-2)`, sem borda; no foco: anel de 2px `var(--blue)` por `box-shadow`. Borda só onde a diferença de fundo não existe (linha divisória de lista: 1px `var(--border)` com opacidade .6).
- Sombra: `--e-1` em popover/menu, `--e-2` em modal e sheet. Cards sem sombra.
- Estados: hover = fundo `var(--surface-2)` em 100ms `ease`; ativo (selecionado) = fundo `var(--surface-2)` + texto `var(--text)` peso 500, sem azul e sem borda; pressionado = `transform: scale(.97)` em 120ms `cubic-bezier(.23,1,.32,1)`; foco por teclado = anel `var(--blue)` 2px (`:focus-visible`). Hover só dentro de `@media (hover: hover) and (pointer: fine)`. Cor azul fica reservada para ação primária, link e seleção de texto da Bíblia.
- Aplicar a régua em: `globals.css` (botões, inputs, menu lateral `.sb*`, tabelas, chips, abas, `.iconbtn`), `src/features/study/study.module.css`, `src/features/study/components/reader/reader.module.css`, `src/app/(auth)/login/login.module.css`. Ao final, `grep -rEn "#[0-9a-fA-F]{3,6}|[0-9]+(\.[0-9]+)?px" src/features/**/*.module.css` tem que voltar vazio (fora `0px`, `1px` de linha e `2px` de anel de foco).

**Etapa 3. Um conjunto de ícones só.** Instalar `lucide-react`. Trocar todos os SVGs soltos de ícone (menu lateral, barra da Bíblia, abas da área de trabalho, SelectionBar, ThemeToggle, botão olho do login, Google fica) por Lucide com `size={16}` e `strokeWidth={1.75}`, alinhados ao centro da linha do texto (`display:inline-flex; align-items:center; gap: var(--s-2)`). O LogoMark não muda.

**Etapa 4. Varredura final com olho de régua.** Abrir Bíblia (João 1 com Comentário), Sermões, Notas, Ajustes, login, claro e escuro, 1280px e 390px. Checar: mesmo recuo lateral em menu/barra/conteúdo; nenhuma borda sobrando; todos os controles com 32px; nenhum texto fora dos 5 tamanhos; ícones do mesmo traço. Screenshots em `docs/previews/4d-*.png`.

Entrega: commits na branch, prévia para o dono, publicar só depois do "aprovado". Se a 4c (Antigravity) ainda não tiver sido mesclada, fazer rebase antes da etapa 2 para não conflitar no CommentaryTab/ReaderView.

### 5. AT passo 3: dicionário UBS hebraico (SDBH) (FEITA e PUBLICADA em 2026-10-04: 18.620 sentidos H carregados via MCP, função temporária apagada, banco 219 MB)

PREPARADA em 2026-10-04, carga concluída pelo Claude. Fonte oficial UBS
v0.9.3 já em português: 18.620 linhas, 7.981 Strong, aproximadamente 9,88 MB de JSON.
Scripts, conferências e ordem de carga em `scripts/ubs/README-HEBREW.md`.
SQL com senha preenchida em `scripts/ubs/work/hebrew/load.sql` (local, gitignored).
Prévia com dados UBS simulados: `docs/previews/task5-hebrew-gen1.png`.
Verificação passou: npm run verify (545 testes), 6 testes do importador e 11 e2e.
Carga e publicação concluídas pelo Claude; função temporária apagada.

Mesmo esquema da frente A (NT, já no ar: `scripts/ubs/`). Fonte: github.com/ubsicap/ubs-open-license (dicionário hebraico, CC BY-SA). Só depois da tarefa 1. Cuidado com o limite de 500 MB do banco.

### 6. Completar o sublinhado do Antigo Testamento (FEITA em 2026-10-08: 23.145 versículos carregados em bible_tagged_verses, banco 243 MB)

Concluído em 2026-10-08: todos os 929 capítulos do Antigo Testamento (23.145 versículos)
com sublinhado completo no banco. Cobertura final de 99,64% e 90,49% de acordo com a
base estatística/gabaritos. Todos os 12 gabaritos manuais preservados. Testes de integração
e E2E do leitor validados com sucesso. Banco de dados após carga: 243 MB (limite 500 MB).

### 7. E-mail de recuperação de senha em português (FEITA em 2026-10-07: template em supabase/templates, SMTP próprio pelo Hostinger configurado pelo dono)
- Hoje o Supabase envia o template padrão em inglês. O app já chama `resetPasswordForEmail` com `redirectTo=/auth/callback?next=/redefinir-senha` (`src/app/(auth)/esqueci-senha/actions.ts`).
- Entregar `supabase/templates/recovery.html` (HTML simples, fonte do sistema, botão verde `#2A7E3B`, wordmark "mercy" em minúsculo, texto curto: "Recebemos um pedido para redefinir sua senha. Se não foi você, ignore este e-mail. O link vale por 1 hora.", botão "Redefinir senha" → `{{ .ConfirmationURL }}`, rodapé "Mercy · joinmercy.com"). Assunto: "Redefinir sua senha na Mercy".
- Só o dono tem acesso ao painel: Supabase → Authentication → Email Templates → Reset Password → colar assunto e corpo → Save. Dar o passo a passo em 3 linhas.
- Opcional na mesma leva, se o dono quiser: Confirm signup, Invite, Magic Link no mesmo visual.

### 8. Telas fora da leitura com a régua 4d (FEITA e PUBLICADA em 2026-10-07, commits 7405a61..c12686a)

Decisões do Fable sobre o que a auditoria levantou (NÃO reabrir):
- Tokens `--r-6: 8px`, `--r-10: 14px` e a fonte Figtree vêm do manual da marca Mercy (commit 9ceafde). Ficam como estão.
- O manual pede **botões em pílula**. Regra nova, uma só: TODO botão de texto (`.btn`, `.btn.sm`, `.btn.ghost`, `.btn.danger`, `.primary`, `.secondary`, botões de modal e do toast) usa `border-radius: var(--r-pill)`. Botão só de ícone (`.iconbtn`, 32x32) continua `--r-6`. Input, chip, aba, item de menu, célula continuam `--r-6`. Atualizar `docs/design-tokens.md` (linha "--r-pill: avatar e interruptor" vira "avatar, interruptor e botões de texto").
- Azul (`--blue`, hoje verde Pasto) só em ação primária, link e seleção bíblica. Chip de status, célula de livro e avatar não levam `--blue`.
- Nada de `style={{...}}` inline para espaçamento/layout: vira classe no CSS module da feature.

**Passo 3 (subagente Opus 5.5, esforço médio): aplicar só visual, sem mudar fluxo nem dados. Um commit por bloco abaixo, mensagem `style(<área>): ...`. Sem push.**

Bloco A. `src/app/globals.css` + `docs/design-tokens.md`
- `.btn` já é pílula; garantir `.btn.sm` também (`--r-pill`), e que todos os `.btn*` tenham `height: var(--control-h)`.
- `.link`: acrescentar `text-decoration: none` (e `a.link`, `.link:hover` idem).
- `.hb`, `.av.c`, `.chip.*` (linhas ~181-202): trocar `rgba(...)` cru por `color-mix(in srgb, var(--coral|--warn|--blue|--text-2) 18%, transparent)`; chip `leader` perde o roxo e usa `var(--surface-2)` + `var(--text-2)`.
- `.field input` (linha ~246) e a correção da linha ~442: fundir numa regra só: `height: var(--control-h); padding: 0 var(--control-px); background: var(--surface-2); border: 0; border-radius: var(--r-6)`.

Bloco B. Sermões, Por livro, Por série (`src/features/study/components/{SermonLibrary,ScriptureMap,SeriesModal}.tsx`, `src/features/study/study.module.css`)
- `study.module.css` ~927-941: apagar o bloco morto `.primary, .secondary` com `height: 2.25rem`; a regra que fica usa `height: var(--control-h); padding: 0 var(--control-px); border-radius: var(--r-pill)`.
- `SermonLibrary.tsx` 66-72: quando a lista está vazia, o botão "Novo sermão" do cabeçalho não aparece (fica só o do corpo). Estados vazios da tela (`.empty` global e `.libEmpty`) passam a usar `.libEmpty` (alinhado à esquerda, `--t-15`, `--text-2`).
- `ScriptureMap.tsx` 35-69: tirar todos os `style=` inline. Célula do livro: classe `.smapCell` com `height: var(--control-h); border-radius: var(--r-6)`; intensidade por `data-level="0..4"` em CSS com `background: color-mix(in srgb, var(--text) N%, var(--surface-2))` (N = 0, 8, 16, 28, 40) e `color: var(--text)`; selecionada = `background: var(--surface-2); color: var(--text); font-weight: 500; box-shadow: inset 0 0 0 2px var(--text-2)`, sem azul, sem `outline` inline. Subtítulo com `margin-top: var(--s-3)` acima e `margin-bottom: var(--s-4)`.
- `SeriesModal.tsx` 68-70: botões continuam `.btn` (já pílula); nada mais.

Bloco C. Editor de sermão (`SermonEditor.tsx`, `study.module.css`)
- 305 "‹ Sermões" → `<UiIcon icon={ChevronLeft} />` + "Sermões"; 311 "···" → `UiIcon` `MoreHorizontal`; 339/366/370 "✓" → `UiIcon` `Check`; 397 "+ Esboço" → `UiIcon` `Plus` + "Esboço"; 307 `<span style={{flex:1}}>` → classe `.spacer { flex: 1 }`.
- `.title` (~123-133): tirar `height: 32px`; usar `min-height: 40px; padding: var(--s-1) var(--s-2); border-radius: var(--r-6)` para o texto 22/28 não cortar e o anel de foco ter raio. Sem foco automático no título ao abrir um sermão EXISTENTE (manter autofocus só em `/study/sermon/new`).
- `.addbtn:hover` (~182-185): hover = `background: var(--surface-2)`, sem mudar `border-color` nem pintar de azul.
- `.addedToast button` (~1262): `border-radius: var(--r-pill); height: var(--control-h); padding: 0 var(--control-px)`.

Bloco D. Série aberta (`src/app/(dashboard)/study/series/[id]/page.tsx`, `SeriesControls.tsx`, `study.module.css`)
- A página passa a usar o mesmo contêiner da biblioteca (`.lib`, `max-width: 48rem`) em vez de `.panel/.row2/.field` globais.
- 37 "← Voltar à biblioteca" → `Link` com classe `.back` (`--t-13`, 500, `--text-2`, sem sublinhado) + `UiIcon` `ChevronLeft`; texto "Sermões".
- 69 título do sermão no cronograma: `Link` com classe `.srmTitle`-like, peso 500, sem sublinhado, sem `<b>`.
- 38/55/47-49/62: todo `style=` inline vira classe no módulo com `--s-2`/`--s-3`/`--s-4`/`--s-5`.
- 56 chip de status: `background: var(--surface-2); color: var(--text-2)`, sem azul.
- 67 `.av` com data: trocar por `<span className={styles.srmDate}>` (texto, sem círculo); sem data = "sem data" em `--text-2`, nunca "—".
- 79 "remover": classe `.linkQuiet` (`--t-13`, 500, `--text-2`, sem sublinhado), hover `--text`.
- `SeriesControls.tsx` 16/25/28: sem `style` inline; botão `btn ghost` (pílula); estado vazio: texto "Nenhum sermão nesta série ainda." + `Link` para `/study/sermon/new` com texto "Novo sermão" (classe `.primary`). Apagar a frase "Crie um novo em Estudo".

Bloco E. Notas e Lixeira (`NotesLibrary.tsx`, `src/app/(dashboard)/study/trash/page.tsx`, `study.module.css`)
- `NotesLibrary.tsx` 32-35: estado vazio em `.libEmpty` com a frase "Suas notas ficam aqui. Abra a Bíblia e toque em Notas para criar a primeira." + `Link` "Abrir a Bíblia" (`.primary`) para `/study/bible`.
- `trash/page.tsx` 17: sem `style` inline (classe). `.trashList` (~1267) `max-width: 48rem`, igual a `.lib`.

Bloco F. Ajustes (`src/features/settings/**`, `settings.module.css`)
- `.lbl small` (16-21): `font-size: var(--t-13); color: var(--text-2)`.
- `AccountPanel.tsx` 65 `chip leader`: já resolvido no Bloco A pelo global.
- `CampusManager.tsx` 77/85/90/107 e `FiscalPanel.tsx` 104/108/184: tirar `style` inline (classes em `settings.module.css`); "+ Adicionar" → `UiIcon` `Plus` + "Adicionar".
- `SettingsView.tsx` ~61: barra de abas em uma linha com `overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; white-space: nowrap` (sem quebrar em 390px).
- Conferir no escuro as abas Conta e Jurídico: nenhum `<select>`/input com fundo branco.

Verificação (obrigatória, nesta ordem): `grep -rn "style={{" src/features/study/components src/features/settings "src/app/(dashboard)/study" | grep -v "STATUS_COLOR\|--level"` tem que voltar vazio (exceção: cores vindas de dados como `STATUS_COLOR`, que podem ficar via variável CSS). Depois `npm run verify` COM o dev server desligado. Depois subir `npx next dev -p 3010` e tirar as mesmas 32 prévias do passo 1 (mesmas rotas, 1280/390, claro/escuro, cookie `tally-theme`) em `docs/previews/8-depois-*.png`, com uma spec temporária e um config temporário sem `webServer`, apagando os dois no fim e parando o servidor. Não publicar: prévias vão para o dono aprovar.

### 9. Sermões e Notas repensados (FEITA e PUBLICADA em 2026-10-07, commits e0b84ae..fb793bc)

Norte: skills emil-design-eng e apple-design. Régua 4d e decisões da tarefa 8 continuam valendo (botão de texto em pílula, `--r-6` controles, `--r-10` painéis, sem borda em repouso, 5 tamanhos de texto, Lucide 16/1.75, verde só em ação primária/link/seleção). Não mexer no editor de sermão (`SermonEditor.tsx`), na página da série (`series/[id]`), na leitura (`reader/**`) nem em `scripts/align/**`. Sem migration: só tela e as actions que já existem.

**A. Sermões (`SermonLibrary.tsx`, `ScriptureMap.tsx`, `src/app/(dashboard)/study/page.tsx`, `study.module.css`, `domain.ts`)**
1. Some o segmentado "Por data | Por série | Por livro". Fica: cabeçalho (título "Sermões" + "Novo sermão"), busca em pílula (`--r-pill`, fundo `--surface-2`), e uma linha de chips de filtro logo abaixo: `Todos` · `Em preparo` · `Pregados` · `Série ▾` · `Livro ▾`. Chip = altura 28px, `--r-pill`, `--t-13`/500; ativo = fundo `var(--text)` e texto `var(--bg)`; inativo = `--surface-2` e `--text-2`. Os três primeiros são exclusivos entre si; Série e Livro somam com eles. Com filtro de série/livro ativo o chip mostra o nome ("Série: Eu sou", "Livro: João") e um `X` para limpar.
2. `Série ▾` abre um popover (menu, `--r-10`, `--e-1`, `transform-origin` no chip, entra 150ms `cubic-bezier(.23,1,.32,1)` de `scale(.96)`+opacity 0, sai 100ms) com: as séries (nome + nº de sermões), separador, "Ver séries" (vai para `/study/series`, item 5) e "Nova série" (abre o `SeriesModal` atual). `Livro ▾` abre popover com SÓ os livros que têm sermão, na ordem canônica, com contagem; vazio = "Nenhum sermão com passagem ainda." Esc, clique fora e escolher um item fecham; foco volta ao chip; setas cima/baixo navegam. Reaproveitar o `Popover.tsx` que já existe se servir.
3. Lista: cartão "Continuar" no topo quando há sermão em andamento (como hoje: status, título, passagem, ideia central em Literata itálica, "editado há X · falta Y"), mas o botão interno "Continuar escrevendo" some (o cartão inteiro é o link; hover `--surface-2`). Depois seções "Em preparo" e "Pregados · <ano>" (e "Arquivados" recolhido como hoje). Linha = grade `8px | 1fr | auto`: bolinha de status (`--dot` via variável CSS), título `--t-15`/500 + linha de baixo `--t-13` `--text-2` (passagem · série), e à direita a data `--t-13` `--text-2` com `font-variant-numeric: tabular-nums` ("12 out", "sem data"). Divisória 1px `--border` .6 entre linhas. Com busca ativa: lista única de resultados com contagem; filtros continuam aplicados.
4. Filtros no endereço (`?f=preparo|pregados&serie=<id>&livro=<USFM>`), com `history.replaceState` como hoje; `?ver=serie` e `?ver=livro` antigos abrem a lista sem filtro (não quebrar link velho).
5. "Ver séries": a antiga visão "Por série" vira a página `/study/series` (hoje redireciona para `/study?ver=serie`; passar a renderizar a lista de séries: título "Séries", botão "Nova série", linhas no mesmo padrão das de sermão com nº de sermões e período, voltar "Sermões" com `ChevronLeft`). O `ScriptureMap` (grade de 66 livros) sai da tela; apagar componente e CSS se ninguém mais usar (grep). `/study/map` redireciona para `/study`.
6. Lógica pura nova em `domain.ts` (`filterSermons(sermons, {status, seriesId, book})`, `booksWithSermons(sermons)`), com testes em `domain.test.ts`.

**B. Notas (`NotesLibrary.tsx`, `NoteSheet.tsx`, `src/app/(dashboard)/study/notes/page.tsx`, `study.module.css`, `domain.ts`, actions existentes)**
1. Computador (>= 900px): duas colunas dentro da área de conteúdo. Esquerda 300px: título "Notas" + botão só-ícone "Nova nota" (Lucide `SquarePen`, `.iconbtn`, `aria-label`), busca em pílula, chips `Todas` · `Do texto` · `Soltas` · `Livro ▾` (mesmo componente de chip/popover de Sermões), e a lista agrupada por data (reaproveitar `groupNotesByDate`). Linha: título (`label`) `--t-13`/500, 1ª linha do corpo `--t-13` `--text-2` com reticências, data à direita; selecionada = fundo `--surface-2` (raio `--r-6`), sem verde. Direita: a nota aberta.
2. Painel da nota: linha de meta (`--t-11` `--text-2`: data/hora + "Abrir na Bíblia" como link quando é nota do texto), título, e, se for do texto, o versículo citado em Literata `--t-15` `--text-2`, recuo com fio 2px `--border` à esquerda. Buscar o texto do versículo com o mesmo provedor que a leitura usa (achar em `src/lib/bible/**` ou `reader-queries.ts`); se não houver jeito barato no servidor, carregar no cliente ao abrir a nota e não mostrar nada enquanto carrega (sem esqueleto piscando). Depois o corpo editável (textarea que cresce, sem borda, `--t-15`, fonte da UI), com salvamento automático 800ms após parar de digitar e ao sair do campo, usando `saveTextNoteAction`/`saveLooseNoteAction`; indicador discreto "Salvo" `--t-11` `--text-2` que aparece e some (opacity 150ms). Menu "···" (`MoreHorizontal`) com "Mover para a lixeira" (action de apagar existente) e, para nota do texto, "Abrir na Bíblia".
3. "Nova nota": cria na hora uma nota solta vazia na lista (otimista), seleciona e foca o corpo. A primeira linha vira o título (`splitNote` já faz). Nota solta vazia ao sair = descartada (não salvar vazia). Campo opcional "Passagem" no topo da nota solta (como a folha faz hoje): ao preencher referência válida a nota vira do texto (mesma regra de `NoteSheet`).
4. Nada abre por cima nem navega para fora ao clicar numa nota. Se `NoteSheet` não for mais usado em lugar nenhum (grep), apagar.
5. Celular (< 900px): só a lista; tocar abre a nota em tela cheia entrando da direita (`translateX(100%)` para 0, 260ms `cubic-bezier(.32,.72,0,1)`), com voltar "Notas" (`ChevronLeft`) no topo; voltar sai pela direita em 200ms. Estado no endereço `?n=<key>` com `pushState` ao abrir e `popstate` fechando, para o voltar do aparelho funcionar. `prefers-reduced-motion`: só fade 150ms.
6. No computador a seleção vai para `?n=<key>` (replaceState) para link direto e recarregar na mesma nota. Sem `?n`, abre a mais recente. Lista vazia: a coluna direita mostra o estado vazio atual ("Suas notas ficam aqui..." + "Abrir a Bíblia"); Nova nota continua no topo.
7. Teclado: cima/baixo na lista troca de nota sem animação; Ctrl/Cmd+Alt+N cria nota nova.

**C. Comum**
- Tirar o `TrashLink` do rodapé de Sermões e Notas (Lixeira fica no menu lateral). Apagar a função se ninguém mais usar.
- Movimento: trocar filtro e trocar de nota = sem animação. Botões e linhas `:active { transform: scale(.97) }` 120ms. Hover só em `@media (hover:hover) and (pointer:fine)`, 100ms `ease`, fundo `--surface-2`. Nada de `transition: all`.
- Sem `style={{}}` inline fora de variável CSS (`--dot`, `--level`).

**Verificação.** `npm run verify` com nenhum servidor no ar; e2e existentes de sermão/notas que quebrarem por mudança de tela: ajustar seletores (não apagar teste). Prévias com o usuário de teste (cookie `tally-theme`, config temporário sem `webServer`, porta 3010): `docs/previews/9-<tela>-<largura>-<tema>.png` para `/study`, `/study` com popover de Livro aberto, `/study/series`, `/study/notes` com uma nota aberta (se o usuário de teste não tiver nota, criar 3 pelo próprio app: uma do texto em João 2:6, duas soltas, e deixar), e `/study/notes` no celular com a nota aberta. 1280 e 390, claro e escuro. Apagar spec/config temporários, parar o servidor. Commits na branch, um por bloco; NÃO publicar na main.

### 10. Comentários de Romanos, Mateus e Efésios em português (FEITA em 2026-10-08: 2.061 comentários novos carregados em bible_commentary, 3.225 no total; prévia em docs/previews/10-romanos-1.png)

Concluído em 2026-10-08: todos os 110 lotes de comentários traduzidos e validados (2.061 blocos cobrindo Romanos, Mateus e Efésios). Carga completa realizada na tabela `bible_commentary` via função temporária segura (John 1.164 preservados, Rom 645, Matt 1.138, Eph 278; total 3.225 comentários). Testes unitários (563), integração e e2e do leitor validados com sucesso. Prévia oficial capturada em `docs/previews/10-romanos-1.png`.

### 11. Pessoas (FEITA e PUBLICADA em 2026-10-11, fases A-D da spec `docs/specs/13-pessoas.md`)

Banco já aplicado (m66). Fase A (lista + ficha) e depois Fase B (importar, exportar, listas salvas, impressão). Commits na branch; publicar só depois do "aprovado" do dono.

### 12. Células (módulo 2a do roadmap; spec `docs/specs/14-celulas.md`, aprovada 2026-10-11)

Banco já aplicado (m67, inclui aperto de RLS: "membro" virou "equipe"). Fase A (tela da equipe + marcar presença) e Fase B (acesso do líder/supervisor). Commits na branch; publicar só depois do "aprovado" do dono.

## Já feito (não refazer)

- Frente B: sublinhado completo do NT inteiro carregado em bible_tagged_verses (7.957 versículos, 2026-10-03).
- AT passo 2: definições do hebraico em português no banco (lex-69 a lex-175, carregados em 2026-10-02).
- AT passo 1: palavra em português ligada ao hebraico nos 39 livros. Os dados antigos de `bible_tagged_words` foram migrados para `bible_tagged_verses`: 23.145 versículos. Conferência integral em 2026-10-04: nenhum versículo faltando e nenhuma diferença frente aos TSVs estatístico + gabarito. A carga já está feita; cobertura de palavras portuguesas ligadas = 66,1%, portanto completar o sublinhado é uma melhoria distinta. Evidência: `docs/previews/at-carga-revisao.md`. Como refazer: `docs/backlog/estudo-referencia-raizes.md`, seção "Antigo Testamento".
- NT: ligação, léxico em PT, dicionário UBS completo.
- Lixeira de 30 dias, página Sermões, Notas, editor de sermão (spec 10), menu lateral novo.
- Feito fora da fila e já no ar (2026-10-06 a 2026-10-09): rebrand Mercy (nome, selo do cordeiro, verde Pasto, Figtree; e7bd28a, 9ceafde), landing pública EN/PT com demo tocável (f639111), conforto de leitura (papel, tamanho da letra, sépia), busca por palavra na Bíblia, modo púlpito e impressão do sermão, instalar no celular e ler sem internet (2821cb1), Finanças inteiro (livro contábil, Dízimos, extrato OFX/CSV, contas a pagar/receber, fechamento do mês; specs 10-12 + d318bf8), comentários em português do NT e do AT inteiros (7856e45, 428ded2).
