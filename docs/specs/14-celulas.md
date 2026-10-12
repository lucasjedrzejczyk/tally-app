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

## Fase C. Redesenho: menos planilha, mais gente (pedido do dono em 2026-10-11: "parece Excel")

Norte (skills emil-design-eng e apple-design): a célula é um grupo de PESSOAS, então a tela mostra rostos, não linhas. Uma ação principal por tela. Texto só onde o visual não diz sozinho. Nenhuma função some; só muda a forma. Régua 4d e tokens continuam valendo (cores, raios, tamanhos de texto). Hover só em `@media (hover:hover) and (pointer:fine)`. `prefers-reduced-motion`: sem transform, só opacity.

Componente base novo `Avatar` em `src/components/shared/Avatar.tsx` (+ css module): foto (signed URL quando houver) ou iniciais sobre `--surface-2`, tamanhos 24/32/44/56, `--r-pill`. Usar também em Pessoas no lugar do avatar local se for o mesmo desenho (sem mudar o visual de Pessoas). Líder não lê o bucket de fotos (RLS só equipe): para ele, sempre iniciais.

C1. **Lista vira cartões** (coluna da esquerda continua 360px; no celular, a lista inteira):
- Cartão por célula (`--surface-2` no hover/selecionado, `--r-10`, padding `--s-4`, sem borda, `:active scale(.98)` 120ms `cubic-bezier(.23,1,.32,1)`): nome `--t-15`/600; abaixo "Qui, 20h" `--t-13 --text-2`; à direita do nome, **pilha de avatares** 24px dos membros (até 4 sobrepostos com -6px e anel 2px `--bg`, depois "+8" `--t-11`).
- Embaixo, a **faixa de presença**: os últimos 8 encontros como barrinhas verticais de 4px de largura e até 20px de altura, altura = presentes/membros, cor `--text-2` com 40% de opacidade e a última em `--text`; encontro cancelado = barrinha de 2px "fantasma" (`--border`). Sem eixo, sem número. Célula sem encontros: a faixa não aparece.
- Aviso (só quando existe) vira uma etiqueta pequena em pílula `--surface-2` `--t-11`: "2 sumidos" ou "Sem registro há 3 semanas". Some o texto "Líder: ... · 12 pessoas" (a pilha de rostos já diz).

C2. **Ficha da célula** (leitura):
- Topo: nome `--t-22`/600; abaixo, chips de informação (não texto corrido): `CalendarDays` "Quintas, 20h", `MapPin` local (link para o mapa como em Pessoas). Ações à direita como hoje (Editar, "···").
- **Marcar presença** continua o botão primário, logo abaixo, com o texto do próximo/último encontro ao lado em `--text-2`: "Último: qui 09/10, 12 de 15".
- **Liderança**: fileira de avatares 44px com nome curto embaixo `--t-13` e o papel `--t-11 --text-2` ("Líder", "Co-líder", "Anfitrião", "Supervisor"). Some a linha de texto "Líder X · Co-líder Y".
- **Membros**: grade de avatares 56px (auto-fill, min 72px por coluna) com o primeiro nome embaixo `--t-13`. Quem tem `missingFlag` vem primeiro, com o avatar em opacidade .45 e um selo pequeno no canto (pílula `--surface` com o número de encontros, `--t-11`, ex. "3"); `title`/aria-label "Não vem há 3 encontros". Tocar abre um popover leve (padrão `Popover.tsx`, origem no avatar, 150ms) com nome completo, "Veio dia 08/10" ou "Não vem há 3 encontros", e para equipe o link "Abrir ficha"; para o líder, se houver telefone, botões WhatsApp/Ligar (o líder liga para quem sumiu, que é o uso real). Some a lista textual de membros.
- **Encontros**: gráfico de colunas simples (sem biblioteca): uma coluna por encontro dos últimos 12, altura proporcional a presentes/membros, rótulo da data curta embaixo `--t-11 --text-2` ("09/10"), número em cima só na coluna em foco/hover ou na selecionada; cancelado = coluna tracejada baixa com "sem" embaixo. Tocar numa coluna abre o Marcar presença daquele dia. Some a lista "Qui 08/10 · 4 de 5".
- Seção vazia não aparece; célula sem membros: ilustração nenhuma, só "Nenhum membro ainda." + "Adicionar membros".

C3. **Marcar presença vira grade de rostos** (a tela mais usada pelo líder; tem que ser gostosa de tocar):
- Mesma grade de avatares 56px com primeiro nome. Tocar alterna presente: presente = anel 2px `--blue` + selo de check (`Check` 12px branco sobre `--blue`, canto inferior direito) + nome em `--text`; ausente = avatar normal, nome `--text-2`. Feedback no pointer-down: `scale(.94)` imediato; ao soltar, volta com transição de transform 160ms `cubic-bezier(.23,1,.32,1)`; o selo entra com opacity + `scale(.6)`→`1` em 150ms (nunca de 0). Sem animação ao trocar de data.
- Topo: "Presença" + chip da data (abre `DateField`). Atalho "Todos vieram" (ghost, pequeno) que marca todos; vira "Limpar" quando todos estão marcados.
- Rodapé fixo translúcido (`backdrop-filter: blur(16px)` + `color-mix(in srgb, var(--bg) 80%, transparent)`, fallback sólido em `prefers-reduced-transparency`): contador "9 de 15" `--t-15`/600 com `font-variant-numeric: tabular-nums` + botão **Salvar**; "Não teve encontro neste dia" como link discreto acima do rodapé.
- Salvar com sucesso: o botão vira "Salvo" com `Check` por 900ms e a folha fecha. Rascunho offline continua como na Fase A.
- Celular: folha de baixo para cima (translateY(100%)→0, 260ms `cubic-bezier(.32,.72,0,1)`), fecha arrastando para baixo (mesma lógica de velocidade do swipe de Pessoas: fecha se passar de 30% ou velocidade > 0,11 px/ms). Computador: painel por cima da ficha, entra com opacity + `scale(.98)` 180ms.

C4. **Verificação**: lógica nova pura (faixa de presença: série dos últimos N com razão e cancelado; ordenação da grade) em `domain.ts` com testes. `npm run verify` sem servidor no ar; ajustar `e2e/groups.spec.ts` aos seletores novos (marcar presença = tocar avatar por aria-label "Marcar <nome>"/"Desmarcar <nome>"); `npx playwright test` inteiro. Prévias `docs/previews/14c-*.png`: lista 1280 claro, ficha 1280 claro e escuro, presença 390 claro (com metade marcados), ficha do líder 390 claro (simulada como na Fase B). Use a "Célula Oliveira" / "Célula Vila Nova" da org de teste; se precisar de mais rostos, crie pessoas pelo app e deixe.
