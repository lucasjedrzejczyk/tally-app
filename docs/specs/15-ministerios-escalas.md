# Spec 15. Ministérios e escalas (módulo 2b do roadmap)

Decisões do dono em 2026-10-12: **ministério com funções** (some o nível "Time"); a escala é montada pela **equipe e pelo líder do ministério** (que entra no app e vê só o ministério dele, como o líder de célula); aviso ao escalado por **botão de WhatsApp com a mensagem pronta** (sem app do membro por enquanto).

Regras de sempre (specs 13 e 14): PT-BR sem travessão longo nem emoji; régua 4d; Lucide via `UiIcon`; sem `style={{}}` inline; hover só em `@media (hover:hover) and (pointer:fine)`; nada nativo do Windows; `Avatar` compartilhado; rostos e toque, não planilha (lição da spec 14 C). Só o essencial à mostra, ler separado de editar.

## Banco (m68, `supabase/migrations/20261012120000_m68_ministerios.sql`)

- `ministries` ganha `roles jsonb not null default '[]'` (funções, ex. `["Vocal","Violão","Bateria","Som"]`) e `slots jsonb not null default '{}'` (quantas pessoas por função num culto, ex. `{"Vocal":2}`; ausente = 1).
- Nova `ministry_members` (id, org_id, ministry_id → ministries cascade, stick_id → sticks cascade, `roles text[]` = funções que a pessoa faz, `role text` leader | co_leader | member, `joined_at date`, `left_at date`, unique parcial (ministry_id, stick_id) where left_at is null). A pessoa pode servir em vários ministérios.
- `schedule_assignments` ganha `ministry_id` (→ ministries cascade) e `service_time time` (horário do culto; nulo = dia inteiro). Um culto da escala = (ministry_id, assignment_date, service_time). `role` = função; `status` usa só `assigned | confirmed | declined` (confirmado/recusado marcado pelo líder depois do retorno no WhatsApp).
- Carga: cada `team_members` ativo vira `ministry_members` do ministério do time (função = `team_members.role`); `serving_roles` dos times se juntam em `ministries.roles`; escalas antigas ganham `ministry_id` do time. As tabelas `teams`/`team_members` ficam (sem uso) até a limpeza depois de publicado.
- `leads_ministry(p_ministry)`: líder/co-líder ativo pela ficha ligada ao login. Permissão nova no catálogo: `ministries.manage_all` ("Gerenciar ministérios e escalas", grupo "Ministérios"). `can_manage_ministries(org)` = essa permissão (dono tem tudo).
- RLS: equipe lê tudo; líder lê o ministério dele, os membros (ficha sem documentos, igual m67) e lê/grava as escalas dele. Criar ministério, mudar funções, membros e líder = `can_manage_ministries`.
- Atualizar `database.types.ts` à mão.

## Fase A. Ministérios (equipe)

A1. **Menu e rotas.** Item "Ministérios" (`HandHeart`, Lucide) em `STUDY_ITEMS` depois de Células; `/ministries` em `STUDY_ONLY_KEEPS`. Feature nova `src/features/ministries/` no padrão de Células (lista 360px à esquerda, ficha à direita >= 900px; celular em tela cheia com o gesto de voltar de `sticks/swipe.ts`; seleção `?m=<id>`). Apagar `src/features/teams/` e `app/(dashboard)/teams/**` (redirect `/teams` para `/ministries`) e tirar "Escalas" do nav antigo.

A2. **Lógica pura** em `ministries/domain.ts` com testes: `upcomingServiceDates(ministry, fromDate, n)` (próximos cultos a partir das escalas existentes e do dia/horário padrão do ministério), `slotsFor(ministry, role)`, `openSlots(ministry, assignments, date, time)` (funções ainda sem gente), `conflicts(stickId, date, time, allAssignments)` (mesma pessoa em outro ministério no mesmo dia e horário), `suggestPeople(role, members, recentAssignments)` (quem faz a função, ordenado por menos escalas nas últimas 8 semanas e depois por nome), `whatsappText(name, ministry, date, time, role)` = "Oi Ana, você está escalada no Louvor domingo 19/10 às 19h, Vocal. Pode confirmar?" (sem gênero: "você está na escala do Louvor..."), `waLink(phone, text)` (`https://wa.me/55...`, telefone só dígitos, assume 55 se vier sem DDI).

A3. **Lista.** "Ministérios" + contagem + `Plus` (só gestor). Cartões como Células C1: nome `--t-15`/600, pilha de avatares dos membros, linha `--t-13 --text-2` "Próximo: dom 19/10" e etiqueta em pílula só quando falta gente na próxima escala ("2 vagas").

A4. **Ficha (leitura).** Nome `--t-22`/600; chips das funções. Botão primário **Montar escala**. **Liderança** em avatares 44px. **Quem serve**: grade de avatares 56px com primeiro nome e, embaixo `--t-11 --text-2`, as funções ("Vocal, Violão"). **Próximas escalas**: até 4 cartões de culto (data + horário) com a fileira de rostos escalados e "1 vaga" quando faltar. Equipe vê "Editar" + "···" (Dar acesso ao líder, Arquivar).

A5. **Editar** (só gestor): nome, dia e horário padrão do culto (Select de dia + horário), funções (chips; adicionar com Enter, tirar no x; número de vagas por função com - e +), membros com funções (multi-chip) e papel, "Adicionar pessoas" pela busca de Pessoas. Salva campo a campo; "Pronto" volta. Novo ministério abre direto no Editar com foco no Nome.

## Fase B. Montar escala (a tela que o líder mais usa)

B1. Folha por cima da ficha (celular: tela cheia). Topo: "Escala" + chip da data e chip do horário (padrão do ministério). Setas para o culto anterior/próximo.
B2. Uma seção por função, com as vagas como **círculos 56px**: vaga vazia = círculo tracejado `--border` com `Plus`; preenchida = avatar com primeiro nome. Tocar numa vaga vazia abre a lista de sugestões (`suggestPeople`): avatar, nome, "Serviu 2x no mês" `--t-11 --text-2`; quem tem conflito aparece por último com "Já está no Som neste horário" e precisa de um toque de confirmação. Tocar num escalado abre popover: **Avisar no WhatsApp** (abre `waLink` em nova aba; sem telefone: "Sem telefone na ficha"), Confirmou, Não pode (marca declined e reabre a vaga), Tirar.
B3. Status no avatar: confirmado = selo `Check` sobre `--blue`; recusado não aparece (a vaga volta a ficar vazia, a recusa fica gravada); avisado e sem resposta = nada.
B4. Gravação imediata a cada toque (Server Action por toque, otimista, volta se falhar com "Não deu para salvar. Tente de novo."). Sem botão Salvar.
B5. "Repetir a escala anterior" (ghost, só quando o culto está vazio): copia as pessoas do culto anterior do mesmo horário, pulando quem tiver conflito.

## Fase C. Acesso do líder

C1. Contexto ganha `ledMinistryIds` (como `ledGroupIds`). Menu para quem não é equipe: Bíblia + Células (se lidera) + Ministérios (se lidera). Com um só ministério, `/ministries` abre direto a ficha. Líder não vê Editar nem "···"; nomes não são links.
C2. **Dar acesso ao líder**: mesmo fluxo de convite da Células B3 (reaproveitar o componente).
C3. Pessoas: na ficha da pessoa, em "Na igreja", linha "Serve no Louvor (Vocal)" com link.

## Verificação e entrega

`npm run verify` sem servidor no ar. E2E `e2e/ministries.spec.ts`: criar ministério com funções Vocal (2 vagas) e Som, adicionar 3 pessoas, montar escala de domingo preenchendo as vagas, ver "1 vaga" na ficha ao tirar alguém, conflito ao escalar a mesma pessoa em outro ministério no mesmo horário, link do WhatsApp com o texto certo. Teste de integração do líder (menu e RLS) como na spec 14. `npx playwright test` inteiro. Prévias `docs/previews/15-*.png`: lista 1280 claro, ficha 1280 claro e escuro, montar escala 390 claro, sugestões 390 claro. Commits `feat(ministries): ...` na branch; publicar só depois do dono aprovar as prévias.

Fora por ora: o voluntário confirmar sozinho e bloquear datas (vem com o app do membro), ligação com Encontros/cultos (módulo 3), troca de escala entre voluntários.
