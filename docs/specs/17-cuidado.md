# Spec 17. Cuidado (módulo 4 do roadmap)

Decisões do dono em 2026-10-12:

1. **Um item no menu, "Cuidado"** (ícone `HeartHandshake`), com duas abas: **Acompanhamentos** e **Orações**.
2. **Sigilo por caso**: caso normal a equipe com `care.view` vê; caso **sigiloso** só o responsável, quem abriu e quem tem `care.manage`. Garantido no banco (RLS), não só na tela.
3. **Sugestões**: lista "Pode precisar de atenção" com o porquê; um toque vira acompanhamento ou some.
4. **Pedidos de oração pela equipe e por um link público** (sem login) que a equipe manda no grupo do WhatsApp; o pedido chega para a equipe aprovar.

Regras de sempre (specs 13 a 16): PT-BR sem travessão longo nem emoji; régua 4d; Lucide via `UiIcon`; sem `style={{}}` inline (só custom props); hover só em `@media (hover:hover) and (pointer:fine)`; nada nativo do Windows; `Avatar` compartilhado; linhas alinhadas e fio, sem caixas cinza (lição da spec 16); ler separado de editar; voz calma, sem "score" (CLAUDE.md: contexto e padrão, nunca porcentagem de risco).

## Banco (m71, `supabase/migrations/20261013140000_m71_cuidado.sql`)

- `care_items` ganha `confidential boolean not null default false` e `last_contact_on date` (atualizado ao registrar contato, para ordenar e mostrar "há 9 dias" sem juntar tabelas).
- RLS de `care_items` select/update: `has_perm(org,'care.view') and (not confidential or assigned_to = auth.uid() or created_by = auth.uid() or has_perm(org,'care.manage'))`. Notas e contatos já herdam (exists no item).
- Status simplificado na tela (o enum fica): **Em andamento** (`new`, `assigned`, `in_progress`), **Aguardando** (`waiting`), **Concluído** (`resolved`, `closed`). Gravamos só `in_progress`, `waiting`, `resolved`.
- `prayer_requests` ganha `status text not null default 'approved'` (`pending` | `approved`) e `contact text` (telefone opcional de quem pediu pelo link).
- `organizations` ganha `prayer_token text unique` (gerado na primeira vez que a equipe pede o link; "Gerar novo link" troca e o antigo para de funcionar).
- RPC `submit_prayer(p_token, p_name, p_request, p_private, p_contact)` security definer, liberada para `anon`: acha a org pelo token, valida tamanho (nome até 80, pedido até 1000), recusa se a org já tem 60 pendentes na última hora, grava `status='pending'`, `privacy` = `church` ou `leader` (quando a pessoa marca "Só a equipe pastoral"). RPC `prayer_link_org(p_token)` devolve só o nome da igreja para a página pública.
- Atualizar `database.types.ts` à mão.

## Fase A. Acompanhamentos

A1. **Menu e rotas.** "Cuidado" em `STUDY_ITEMS` depois de Encontros; `/care` em `STUDY_ONLY_KEEPS`; aba Orações em `/care?tab=oracoes`. `/prayer` redireciona. Reescrever `features/care` no molde das telas novas (lista 360px + ficha; celular tela cheia com gesto de voltar); apagar os componentes antigos (modais) e `features/prayer/components`.
A2. **Lógica pura** `care/domain.ts` com testes: `statusGroup`, `sinceLabel(lastContact, today)` ("Sem contato ainda", "Último contato há 9 dias"), `stale(item, today)` (14 dias sem contato), `careSuggestions(input, today)` e `suggestionKey`.
A3. **Lista.** Topo "Cuidado" + abas segmentadas (Acompanhamentos | Orações) + `Plus` (Novo acompanhamento: busca de Pessoas, abre a ficha no Editar).
  - **Pode precisar de atenção** (até 5, "Ver mais"): linha com rosto 32px, nome, motivo `--t-13 --text-2` e dois botões ícone: `Plus` "Acompanhar" e `X` "Dispensar" (some com fade 150ms e "Desfazer" por 5 s).
  - **Em andamento**: linha com rosto, nome, motivo em uma linha, e à direita o rosto 24px do responsável; embaixo "Último contato há 9 dias" (em `--blue` quando passou de 14 dias). Sigiloso mostra `Lock` 14px ao lado do nome. Ordem: parados primeiro, depois mais recentes.
  - **Aguardando** e **Concluídos (N)** recolhidos.
A4. **Sugestões** (`careSuggestions`), sem quem já tem caso aberto, cada uma com chave para dispensar (`signal_overrides`, status `dismissed`) que muda quando o fato muda:
  - "Faltou aos 3 últimos encontros da célula Esperança" (chave com a data do último encontro).
  - "Visitante desde 03/10, ninguém acompanhando" (primeira visita há 3 a 45 dias).
  - "Não pôde nas 2 últimas escalas do Louvor" (duas recusas seguidas).

## Fase B. Ficha do acompanhamento

B1. Título = nome da pessoa (link para Pessoas), ações na mesma linha: **WhatsApp** (link pronto, sem texto), Editar, `···` (Excluir, só `care.manage`). Embaixo, motivo `--t-15` e chips: status, responsável (rosto + nome), `Lock` "Sigiloso".
B2. **Próximo passo**: uma linha ("Visitar na quinta") com data opcional; vazio mostra "Definir próximo passo".
B3. **Registrar contato**: botões de tipo em chips (Visita, Ligação, WhatsApp, Conversa) + campo de nota + Registrar. Grava o contato, atualiza `last_contact_on`, e o novo item entra no topo da linha do tempo (opacity + translateY 4px, 150ms).
B4. **Linha do tempo**: contatos e notas internas juntos, mais novo em cima; contato com ícone do tipo, nota com `StickyNote`. "Nota interna" é um campo próprio abaixo de Registrar contato (só texto).
B5. Status por toque (segmentado: Em andamento | Aguardando | Concluído). Concluir mostra "Concluído" e o caso desce para Concluídos na lista (sem sumir da ficha aberta).
B6. **Editar** (separado): motivo, responsável (`Select` com a equipe), sigiloso (chip `aria-pressed`), próximo passo e data. "Pronto" volta.
B7. Pessoas: na ficha da pessoa, se houver caso aberto visível para quem olha, linha "Acompanhada por Marcos" com link para o caso.

## Fase C. Orações

C1. Coluna única (sem ficha à direita; >= 900px a coluna fica com 42rem). Topo da aba: "Novo pedido" (ghost) e **Link de pedidos** (copia o link; `···` com "Gerar novo link").
C2. **Chegaram pelo link (N)**: cada pedido com nome, texto, telefone se houver, e "Aprovar" / "Recusar" (recusar apaga, com "Desfazer" 5 s).
C3. **Mural**: linhas com nome, data curta, texto (3 linhas, toque expande), etiqueta "Só a equipe pastoral" quando privado, e à direita "Orei" (contador; toque soma 1 com o número trocando em 150ms e vibração curta; uma vez por pedido por sessão). `···`: Respondida, Excluir (`prayer.manage`). Respondidas descem para "Respondidas (N)" recolhido e somem depois de 30 dias (regra de hoje).
C4. **Novo pedido** (equipe): nome (ou pessoa da igreja pela busca), pedido, "Só a equipe pastoral".
C5. **Página pública `/pedido/[token]`** (sem login, fora do menu, padrão visual da página de convite): "Pedido de oração para Igreja X", campos nome, pedido, telefone opcional, "Só a equipe pastoral", Enviar. Depois: "Recebemos seu pedido. A equipe vai orar por você." Token inválido: "Este link não funciona mais. Peça um novo para a igreja."

## Verificação e entrega

`npm run verify` sem servidor no ar. E2E `e2e/cuidado.spec.ts`: sugestão de visitante aparece e vira acompanhamento; registrar contato (vira "Último contato há 0 dias" = "Último contato hoje"); mudar status; caso sigiloso não aparece para outro usuário (teste de RLS no banco com rollback, como na spec 15); pedido pelo link público chega pendente, aprovar, "Orei" soma. Prévias `docs/previews/17-*.png`: lista + ficha 1280 claro e escuro, ficha 390, orações 1280, página pública 390. Publicar só depois do dono aprovar as prévias.

## Revisão de design (2026-10-12)

| Antes | Depois | Por quê |
| --- | --- | --- |
| Sugestão com dois botões ícone (+ e x) | Tocar na linha = Acompanhar; só o x pequeno para dispensar | Uma ação principal por linha; dois ícones lado a lado viram adivinhação |
| Status em três botões que trocam seco | Segmentado com a pílula deslizando (transform 200ms `cubic-bezier(.23,1,.32,1)`) | Mostra para onde o estado foi; mudança ocasional, pode animar |
| Concluir sem volta | "Concluído" + "Desfazer" por 5 s | Concluir por engano tira o caso da lista |
| Registrar contato começa sem tipo | Começa no último tipo usado (lembrado no aparelho) | Quem usa WhatsApp sempre não toca no chip toda vez |
| No celular, Registrar contato lá no meio da ficha | Botão "Registrar contato" fixo no rodapé, abre a folha de baixo com tipo e nota | É a ação mais repetida; tem de estar no polegar |
| Novo item da linha do tempo com keyframe | Entrada com opacity + translateY(4px) 150ms só para o item novo; nada anima ao abrir | Abrir a ficha é frequente; só a novidade merece movimento |
| Pedido aprovado/recusado some seco | Linha recolhe (grid-template-rows 1fr para 0fr + opacity, 200ms) | Item que some sem transição parece erro |
| "Orei" trocando o número seco | Número troca com blur 2px + opacity 150ms; lembrado no aparelho para não somar duas vezes | Confirma o toque sem toast |
| Sigiloso só como chip | Chip com a frase embaixo: "Só você, quem abriu e a pastoral veem este caso" | Sigilo precisa dizer quem vê, não só um cadeado |
| Página pública só troca de texto ao enviar | Botão vira "Enviando…" (sem duplo envio) e o cartão troca para o obrigado com o `Check` desenhando (stroke 400ms) | Uso raro e de quem está fragilizado: um cuidado a mais vale |
| Abas Acompanhamentos/Orações animando | Troca instantânea | Troca frequente, animação só atrasaria |

## Orientações Apple (2026-10-12)

1. **Sigilo na tela também**: caso sigiloso mostra "Caso sigiloso" no lugar do motivo na lista (tela de igreja é vista por cima do ombro); o motivo só dentro da ficha.
2. **Menos passos**: acompanhar uma sugestão já cria o caso com o motivo da sugestão e você como responsável; abre a ficha pronta para registrar o primeiro contato.
3. **Onde estou e o que falta**: abas com número só quando pede ação ("Orações 3" = pedidos do link esperando aprovação); ponto no item Cuidado do menu quando há pedidos esperando.
4. **Parado não só por cor**: "Sem contato há 15 dias" ganha o ícone `Clock` além do `--blue` (quem não distingue cor também vê).
5. **Rodapé fixo do celular como material**: fundo translúcido com `backdrop-filter: blur(20px) saturate(180%)`, conteúdo passa por baixo; com `prefers-reduced-transparency` vira sólido.
6. **Vibração só no que importa**: "Orei" e "Concluído". Registrar contato e mudar status não vibram.
7. **Página pública responsável**: abaixo do telefone, "Usado só para a equipe falar com você"; nada além de nome, pedido e telefone opcional.

Fora por ora: lembrete automático do próximo passo, relatório de cuidado, pedido pelo app do membro, oração por grupo/célula (privacy `group`).
