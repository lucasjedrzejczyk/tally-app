# Spec 16. Encontros (módulo 3 do roadmap)

Aprovada pelo dono em 2026-10-12, já com a revisão de design do fim. Decisões:

1. **Um item só no menu: "Encontros"** (ícone `CalendarDays`). Junta cultos (repetem toda semana) e eventos (data única: retiro, conferência, batismo). Saem as três telas antigas (Cultos, Eventos, Agenda).
2. **A tela abre na semana**: a programação da igreja dia a dia, não uma lista de cadastros. Culto é cadastrado uma vez e aparece em todas as semanas.
3. **Cada culto de um dia tem a sua ficha**: quem serve (vem sozinho das escalas dos ministérios no mesmo dia e horário), ordem do culto, contagem de pessoas e o sermão.
4. **Evento com inscrição feita pela equipe** (inscritos e check-in). Página pública de inscrição e pagamento continuam fora.
5. **Lembrete = texto pronto** ("Copiar convite" para o grupo de WhatsApp da igreja). Lembrete automático fica para o app do membro.

Regras de sempre (specs 13 a 15): PT-BR sem travessão longo nem emoji; régua 4d; Lucide via `UiIcon`; sem `style={{}}` inline; hover só em `@media (hover:hover) and (pointer:fine)`; nada nativo do Windows (`Select`, `DateField`); `Avatar` compartilhado; rostos e toque, não planilha; ler separado de editar.

## Banco (m69, `supabase/migrations/20261013120000_m69_encontros.sql`)

- Reaproveita `services` (culto que repete: name, weekday 0=Dom, start_time, location, description, active), `events`, `event_registrations`, `service_plan_items`. Hoje estão quase vazias (2 cultos de teste, 0 eventos).
- Nova `service_dates` (o culto num dia): id, org_id, service_id → services cascade, `date`, `headcount`, `visitors`, `kids` (int), `sermon_id` → sermons set null, `cancelled boolean default false`, unique (service_id, date). Só existe quando alguém mexe naquele dia.
- `service_plan_items` ganha `date_id` → service_dates cascade. Ordem de sempre = `service_id` com `date_id` nulo; ordem do dia = `date_id`. `session_id` deixa de ser usado.
- `ministries` ganha `service_id` → services set null: o culto padrão do ministério passa a ser um culto da igreja (dia e horário vêm dele). `meeting_day/meeting_time` ficam para ministério sem culto (ensaio).
- `events` ganha `time text` ("19:00"); o `starts_at` timestamptz deixa de ser usado (fuso só atrapalha aqui).
- Permissão nova `services.manage` ("Gerenciar cultos e eventos", grupo "Encontros"), `can_manage_services(org)`. RLS: equipe lê tudo; gravar = `can_manage_services`. `services` também pode ser lido por membro da org (o líder de ministério precisa do dia e horário do culto na escala). Líder não ganha o menu Encontros por ora.
- Atualizar `database.types.ts` à mão.

## Fase A. Semana

A1. **Menu e rotas.** "Encontros" em `STUDY_ITEMS` depois de Ministérios, `/encontros` em `STUDY_ONLY_KEEPS`; plano: chave `events` ("Encontros", Pro). Apagar `features/services`, `features/events`, `features/calendar` e as rotas antigas (`/services`, `/events`, `/calendar` redirecionam para `/encontros`). `lib/attendance.ts` fica.
A2. **Lógica pura** `features/encontros/domain.ts` com testes: `weekStart(date)`, `occurrences(services, events, dates, from, to)` (cultos da semana pelo weekday + eventos, com cancelados marcados), `servingAt(ministries, date, time)` (escalados e vagas por ministério), `inviteText(item)` ("Domingo, 18/10 às 19h: Culto da Família. Rua X, 100. Te esperamos!"), `trend(dates)` (últimas 8 contagens e média).
A3. **Tela.** Molde de Pessoas, Células e Ministérios: a semana à esquerda (360px) e a ficha à direita (>= 900px); no celular a ficha entra em tela cheia com o gesto de voltar. Seleção em `?o=s:<culto>:<data>` ou `?o=e:<evento>`. Topo: "Encontros", setas de semana (sem animação: uso repetido) e "Hoje" (só fora da semana atual). Agenda por dia: rótulo "Dom 18/10" (hoje com "Hoje" em `--blue`); dia vazio = linha fina de 28px sem cartão. Cartão: horário `--t-13` 600, nome `--t-15`, pilha de rostos de quem serve e pílula "2 vagas" só quando falta gente. Evento: etiqueta "Evento" e "12 inscritos" quando tiver inscrição. `:active` em `scale(.98)`. Culto cancelado no dia: riscado em `--text-2` com "Cancelado" (não some). Semana sem nada: vazio honesto com "Cadastrar o primeiro culto".
A4. `Plus` no topo (só gestor) abre painel preso ao botão (`Anchored` de Ministérios) com **Culto que repete** e **Evento**. Cada um cria e abre o Editar com foco no nome.

## Fase B. Ficha do culto num dia

B1. Painel da direita (celular: tela cheia com gesto de voltar).
B2. Nome `--t-22`/600, chips "Domingo, 18/10 · 19h" e local. Setas para o mesmo culto na semana anterior/próxima (sem animação), que também mudam a semana da esquerda.
B3. **Quem serve**: um bloco por ministério ligado a esse culto ou com escala nesse dia e horário: nome, rostos (anel de avisado e selo de confirmado iguais aos da escala) e "1 vaga" quando faltar. Tocar abre a Montar escala do ministério já nesse culto (reaproveita `ScheduleSheet`). Ministério sem ninguém escalado mostra "Montar escala".
B4. **Ordem do culto**: lista simples (horário opcional, título, responsável). Leitura só texto; "Editar ordem" troca para campos (Enter cria o próximo, setas sobe/desce, x tira). Sem arrastar. Dia sem ordem própria mostra a ordem de sempre em `--text-2` com "Usar neste dia"; "Salvar como ordem de sempre" grava o modelo.
B5. **Contagem**: três números grandes (Pessoas, Visitantes, Crianças). Tocar vira campo numérico (`inputmode="numeric"`; Enter ou sair grava, Esc desfaz). Embaixo, barras das últimas 8 contagens (CSS, a do dia em `--blue`, sem animação ao abrir) e "Média 132".
B6. **Sermão**: liga um sermão do Estudo (busca por título) ou "Ligar sermão". Mostra título e passagem.
B7. "Editar" (gestor) troca a ficha para o Editar do culto: nome, dia (`Select`), horário, local; "Pronto" volta. "···": Cancelar este dia ("Desfazer" por 5 s; depois "Reabrir este dia" no mesmo menu), Arquivar culto.
B8. **Copiar convite** (ghost): copia `inviteText`; o rótulo troca para "Copiado" com `Check` (blur 2px + opacity em 150ms) e volta em 2 s.

## Fase C. Eventos

C1. Ficha do evento: nome, chips de data/horário e local, descrição. Editar separado (nome, data com `DateField`, horário, local, descrição, inscrição ligada, limite de vagas).
C2. Inscrição ligada: grade de inscritos em rostos 56px (pessoa da igreja pelo `AddMembers`, ou visitante pelo campo "Nome de quem não é da igreja", que não vira ficha); limite opcional ("12 de 40"). Tocar no rosto marca que chegou: selo `Check` entra com opacity + `scale(.9)`→`1` em 150ms e vibração curta; tocar de novo desfaz. "8 de 12 chegaram". Tirar inscrito pelo menu do rosto.
C3. Quem serve no evento: igual à B3 (escalas na data e horário do evento).
C4. Copiar convite igual à B8.

## Fase D. Ligação com Ministérios

D1. No Editar do ministério, "Culto" vira escolha entre os cultos da igreja (`Select`) com "Outro dia e horário" (mostra os campos de hoje). Com culto escolhido, dia e horário do ministério vêm do culto.

## Verificação e entrega

`npm run verify` sem servidor no ar. E2E `e2e/encontros.spec.ts`: cadastrar culto de domingo 19h, ver na semana, abrir o dia, ver o ministério ligado com o rosto escalado, montar a ordem do culto e salvar como ordem de sempre, contar pessoas e recarregar, cancelar um dia e desfazer, criar evento com inscrição, inscrever 2 e fazer check-in. Prévias `docs/previews/16-*.png`: semana 1280 claro e escuro, semana 390, ficha do culto 1280, evento 390. Publicar só depois do dono aprovar as prévias.

Fora por ora: página pública de inscrição e pagamento, lembrete automático, presença nome a nome no culto, ligação com Finanças, menu Encontros para o líder.

## Estado (2026-10-12)

Fases A a D feitas na branch (m69 aplicada no banco). Prévias `docs/previews/16-*.png`. E2E `e2e/encontros.spec.ts` verde; Ministérios e Células seguem verdes.
Diferenças da spec: cancelar o dia não tem "Desfazer" de 5 s; a ficha mostra "Culto cancelado neste dia" com "Reabrir" (sempre à mão, mais simples). Tirar inscrito fica no Editar do evento (um menu em cada rosto poluía a grade). Rostos de semanas com mais de 5 semanas no passado não aparecem nos cartões (a escala carregada começa 35 dias atrás).

## Revisão de design (2026-10-12)

| Antes | Depois | Por quê |
| --- | --- | --- |
| Sete colunas lado a lado no computador | Agenda por dia à esquerda + ficha à direita | Mesmo molde das outras telas; sete colunas a 1280px espremem os cartões |
| Dia vazio com caixa | Linha fina de 28px | Semana com 2 cultos não pode virar 5 caixas vazias |
| Stepper para contar pessoas | Toque vira campo numérico | 150 pessoas não se contam no + |
| Arrastar para reordenar a ordem | Setas no modo editar | Pouco uso; arrastar é muito código para o ganho |
| Escolha "Culto ou Evento" sem origem | Painel nasce do botão `Plus` | Popover sai de quem foi tocado |
| "Copiado" seco | Troca com blur 2px + `Check`, volta em 2 s | Confirma sem toast |
| Dia cancelado some | Fica riscado, "Cancelado" | Dá para ver e desfazer; sumir assusta |
| Barras animando ao abrir | Sem animação ao abrir | Tela vista toda semana |
| Ficha do culto em folha por cima | Painel da direita | Folha é para tarefa curta (escala); ficha é lugar |
| Finanças ligado já | Fica para depois | Fora do essencial |
