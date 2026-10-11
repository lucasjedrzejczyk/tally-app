# Spec 14. Células (módulo 2a do roadmap)

Aprovada pelo dono em 2026-10-11. Modelo B: célula com líder, co-líder, anfitrião e supervisor opcional. O encontro registra SÓ presença. O líder e o supervisor entram no app e veem só as células deles.

Regras de sempre (iguais à spec 13): PT-BR sem travessão longo nem emoji; régua 4d; botão de texto em pílula; Lucide via `UiIcon`; sem `style={{}}` inline; hover só em `@media (hover:hover) and (pointer:fine)`; nada nativo do Windows (`Select`, `DateField`). Lição de Pessoas: **só o essencial à mostra, ler separado de editar, nada de campo vazio na leitura**. Trocar de célula/filtro sem animação.

## Banco (JÁ APLICADO: `supabase/migrations/20261011120000_m67_celulas.sql`, leia antes)

- `groups` ganhou `supervisor_stick_id` e `location` (texto livre, ex. "Casa da família Oliveira, Rua das Flores 120").
- `attendance_sessions.cancelled` (encontro que não aconteceu) e índice único (context_id, session_date) para `context_type='group'`: um encontro por célula por dia. Gravar presença = upsert do encontro do dia + troca dos records.
- Presença = `attendance_records` com `status='present'` só de quem veio. Ausência é deduzida (membro ativo na data, encontro não cancelado, sem record presente).
- `leads_group(group_id)`: líder/co-líder ativo ou supervisor, pela ficha ligada ao login (`sticks.user_id`). `can_manage_groups(org)` = `groups.manage_all` (dono tem tudo).
- RLS: equipe (`is_org_staff`) vê tudo; líder vê a célula dele, os membros (ficha sem documentos) e grava encontros/presença dela. Mudar membros, líderes, supervisor, nome etc. = só `can_manage_groups`.
- Também: tudo que antes era "qualquer membro da org" virou "equipe" (sermões, finanças antigas, oração, linha do tempo...). Membro sem permissão só lê organização, campus, cargos, memberships, DMs, espaços e as próprias notas/destaques de Bíblia.
- Atualizar `src/lib/database.types.ts` à mão.

Papéis em `group_members.role`: leader (Líder), co_leader (Co-líder), host (Anfitrião), member (Membro). Uma célula ativa por pessoa: entrar em outra célula fecha a anterior (`left_at = hoje`), mantendo histórico.

## Fase A. Tela da equipe (pastor/secretaria)

A1. **Menu e rotas.** Item "Células" (`Users2` ou `UsersRound`, Lucide) em `STUDY_ITEMS` depois de Pessoas, `/groups` em `STUDY_ONLY_KEEPS`. Reescrever `src/features/groups/` no padrão de Pessoas (lista à esquerda 360px, ficha à direita >= 900px; celular: lista e ficha em tela cheia com o mesmo gesto de voltar, reaproveitar `src/features/sticks/swipe.ts`). Seleção em `?g=<id>` (replaceState); `/groups/[id]` abre direto. Apagar o painel antigo (donut de saúde, cards, `NewGroupModal`, `GroupTools`) e o que ficar sem uso.

A2. **Lógica pura** em `groups/domain.ts` com testes: `defaultMeetingDate(meetingDay, today)` (hoje se for o dia; senão o último dia da semana do encontro <= hoje; sem dia definido = hoje), `absenceStreak(memberId, sessions, joinedAt)` (encontros seguidos não cancelados sem presença desde o mais recente, só contando encontros depois da entrada), `missingFlag(streak)` = streak >= 3, `staleGroup(lastSessionDate, today)` = sem encontro registrado há 14+ dias (ou nunca), rótulo "Quintas, 20h".

A3. **Lista.** Cabeçalho "Células" + contagem + `Plus` (só `can_manage_groups`). Busca em pílula; chips-popover **Supervisor ▾** e **Dia ▾** (padrão de Pessoas). Linha: nome `--t-15`/500; embaixo `--t-13 --text-2` "Quintas, 20h · Líder: Paulo Oliveira · 12 pessoas". À direita, só quando há algo, texto `--t-13 --text-2` (sem cor de alerta, sem número de "saúde"): "Sem registro há 3 semanas" (staleGroup) ou "2 sumidos" (membros com missingFlag). Ordem: alfabética.

A4. **Ficha (leitura).** Cabeçalho: nome `--t-22`/600; linha "Quintas, 20h · Casa da família Oliveira". Botão primário **Marcar presença**; à direita "Editar" + `MoreHorizontal` (Dar acesso ao líder, Arquivar célula).
- **Liderança**: uma linha "Líder Paulo Oliveira · Co-líder Ana · Anfitrião Carlos · Supervisor João" (só os que existem; nomes clicáveis para `/people?p=<id>` se o usuário é equipe).
- **Membros** (contagem no título): quem tem missingFlag primeiro, com "Não vem há N encontros" `--text-2`; depois os outros com "Veio dia 12/10" ou "Ainda sem presença". Linha simples, sem fio pesado.
- **Encontros**: os 8 últimos, "Qui 09/10 · 12 de 15" (cancelado: "Qui 02/10 · Não teve encontro"); tocar abre o Marcar presença daquele dia.
- Sem membros: "Nenhum membro ainda." + "Adicionar membros" (entra no Editar).

A5. **Marcar presença** (folha/painel por cima da ficha; no celular, tela cheia; é a tela que o líder mais usa, então tem que ser rápida com um dedo):
- Topo: "Presença" + data (padrão `defaultMeetingDate`; tocar abre `DateField`). Se já existe encontro nesse dia, carrega as marcações dele.
- Lista dos membros ativos em ordem alfabética, cada linha 48px de altura inteira tocável, com caixa de marcar à direita (marcado = `--blue`). Sem animação além de `:active scale(.98)`.
- Rodapé fixo: "9 de 15" + botão primário **Salvar**. Link discreto "Não teve encontro neste dia" (grava `cancelled=true`, sem records).
- Salvar: um Server Action por vez (upsert do encontro + apaga e regrava records). Sucesso: fecha e a ficha atualiza. Erro de rede: mantém as marcações num rascunho em `localStorage` por célula+data (try/catch), mostra "Sem conexão. As marcações ficam guardadas aqui; tente salvar de novo." e reaproveita o rascunho ao reabrir. Ao salvar com sucesso, apaga o rascunho.
- Desfazer não precisa: reabrir o dia e mudar.

A6. **Editar** (só `can_manage_groups`): Nome, Dia (Select: Domingo..Sábado), Horário, Local, Supervisor (busca de pessoa), e a lista de membros com papel (`Select`) e "Tirar da célula"; "Adicionar membros" abre busca em Pessoas com múltipla seleção; quem já está em outra célula mostra "Sai da Célula X" antes de confirmar. Salva campo a campo como em Pessoas, "Pronto" volta. Nova célula: cria e abre direto no Editar com foco no Nome.

A7. **Pessoas**: na leitura da ficha da pessoa, em "Na igreja", linha "Célula Oliveira (desde mar/2024)" (link para a célula); o filtro "Célula ▾" / "Sem célula" de Pessoas continua funcionando com `left_at is null`.

## Fase B. Acesso do líder e do supervisor

B1. **Contexto**: em `src/lib/auth/session.ts` (ou onde o contexto da org é montado) acrescentar `isStaff` (mesma regra de `is_org_staff`: dono ou alguma permissão) e `ledGroupIds` (células onde `leads_group` é verdade; consulta a group_members/groups pela ficha ligada ao usuário).

B2. **Menu e rotas para quem não é equipe**: o menu mostra só **Bíblia** e **Células** (se `ledGroupIds` não vazio). Pessoas, Finanças, Sermões e Notas somem do menu e, se acessadas pela URL, redirecionam para `/groups` (ou `/study/bible` se não lidera nada). Com UMA célula, `/groups` abre direto a ficha dela (sem lista). A ficha do líder não mostra Editar nem o menu "···"; nomes de membros não são links.

B3. **Dar acesso ao líder**: no menu "···" da ficha (só `members.manage`), abre a escolha entre líder, co-líder e supervisor da célula que ainda não têm login e usa o fluxo de convite que já existe (`src/features/invites/**`, e-mail da ficha da pessoa). Pessoa sem e-mail: "Cadastre o e-mail de <nome> em Pessoas para enviar o convite." com link. Ao aceitar, o convite já cria membership sem permissões; o acesso à célula vem de ser líder (nenhum cargo novo).

B4. **Verificação**: `npm run verify` sem servidor no ar. E2E `e2e/groups.spec.ts`: criar célula, adicionar 3 membros, marcar presença de 2, reabrir o dia e ver 2 marcados, "Não teve encontro" em outro dia. E2E de acesso: se houver como criar um segundo usuário de teste em `.env.test`, testar que o líder vê só a célula dele e não abre `/people`; se não houver, teste de integração (vitest) com o client do usuário de teste verificando as funções de domínio e a montagem do menu para `isStaff=false`. `npx playwright test` inteiro. Prévias `docs/previews/14-*.png`: lista 1280 claro, ficha 1280 claro e escuro, marcar presença 390 claro, ficha do líder 390 claro (pode ser renderização com `isStaff=false` simulado se não houver usuário líder de teste).

## Entrega
Commits na branch, `feat(groups): ...`. NÃO publicar na main: prévias para o dono aprovar.
