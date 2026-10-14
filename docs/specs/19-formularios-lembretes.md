# Spec 19. Formulários e Lembretes

Pedido do dono em 2026-10-14, depois da comparação com o Tribus: as duas peças de gestão do dia a dia
que faltavam. "Planeja e executa, nem pergunta."

Regras de sempre (specs 13 a 18): PT-BR sem travessão longo nem emoji; Lucide via `UiIcon`; sem
`style={{}}` inline (só custom props); hover só em `@media (hover:hover) and (pointer:fine)`; nada
nativo do Windows; `Avatar` compartilhado; linhas e fio, sem caixas cinza; ler separado de editar.

## Banco (m73, `supabase/migrations/20261014130000_m73_formularios.sql`)

- `forms`: `id`, `org_id`, `title` (1 a 120), `intro` (até 600), `fields jsonb` (lista de perguntas),
  `token text unique` (32 hex, o segredo do link), `open boolean default true`, `created_by`, datas.
- Pergunta = `{ id, label, type, required, options }`, `type` em `short | long | choice | multi | date`.
  Nome e telefone vêm sempre, fora da lista (formulário de igreja é sempre de alguém).
- `form_responses`: `id`, `form_id`, `org_id`, `name` (1 a 80), `phone` (até 30), `answers jsonb`
  (`{ [id]: texto | texto[] }`), `stick_id` (pessoa ligada, `on delete set null`), `seen boolean`, `created_at`.
- RLS das duas: `has_perm(org, 'forms.manage')`. Permissão nova no catálogo de Cargos (grupo Formulários).
- RPC `form_public(p_token)` (anon): devolve `{ church, title, intro, fields }` só se o formulário está aberto.
- RPC `submit_form(p_token, p_name, p_phone, p_answers)` (anon, security definer): valida aberto, tamanhos,
  obrigatórias, escolhas dentro das opções, data ISO; recusa acima de 200 respostas por hora no formulário.

## Fase A. Formulários (`/forms`, item "Formulários", ícone `ClipboardList`)

A1. Lista 360px + ficha (molde de Pessoas). Linha: título, "12 respostas" e, à direita, "3 novas" em
`--blue` quando há não vistas; formulário fechado mostra "Fechado". `+` abre "Novo formulário" com quatro
pontos de partida: **Em branco**, **Ficha de visitante**, **Inscrição**, **Pedido de batismo**.
A2. Ficha: título; linha do link (**Copiar link**, Abrir) e o interruptor **Recebendo respostas**.
Abas segmentadas **Respostas (N)** | **Perguntas**.
A3. Respostas: mais nova em cima; linha com rosto (iniciais), nome, data curta e a primeira resposta.
Toque expande todas as respostas. Ações da resposta: **WhatsApp** (se tem telefone), **Adicionar em Pessoas**
(cria visitante com nome e telefone, origem "Formulário: título") ou **Ver em Pessoas** quando já ligada
(se já existe alguém com o mesmo telefone, liga a essa pessoa em vez de duplicar), `···` Excluir.
Abrir a ficha marca as respostas como vistas. **Baixar planilha** (CSV, separador `;`, BOM para o Excel).
A4. Perguntas (editar separado de ler): título, texto de abertura, perguntas em linhas (rótulo, tipo,
obrigatória, opções uma por linha para escolha), subir/descer, remover, **Adicionar pergunta**. Salvar
explícito; "Salvo" some em 2 s. Excluir formulário no `···` do topo.
A5. Página pública `/f/[token]` (molde de `/pedido/[token]`): "Nome da igreja", título, abertura, Nome,
Telefone (opcional, "Usado só para a igreja falar com você"), perguntas. Enviar → obrigado com o `Check`
desenhando. Fechado ou link errado: "Este formulário não está recebendo respostas."

## Fase B. Lembretes (`/lembretes`, item "Lembretes", ícone `Bell`)

O app monta sozinho a lista do que precisa ser lembrado; mandar é um toque no WhatsApp com a mensagem
pronta (sem custo de API). Envio sem toque (API do WhatsApp, e-mail) fica para depois.

B1. Coluna única (42rem). Grupos **Hoje**, **Amanhã**, **Próximos dias** (até 7 dias). Só aparece o que tem.
B2. Fontes:
  - **Escala**: cada pessoa escalada nos próximos 2 dias, sem recusa: "Ana Souza · Louvor, vocal" /
    "Domingo 19/10 · 19h". Mensagem: a de `ministries/whatsappText`.
  - **Aniversário**: nos próximos 7 dias: "Marcos Lima faz 34 anos" / "Quinta 16/10". Mensagem de parabéns.
  - **Próximo passo do Cuidado** (meus casos, data até amanhã): "Visitar na quinta · Marcos" → abre o caso.
  - **Formulário**: respostas novas: "3 respostas novas · Ficha de visitante" → abre o formulário.
B3. Linha: rosto 32px, título, subtítulo, e à direita **WhatsApp** (ou **Abrir** para Cuidado/Formulário).
Tocar em WhatsApp abre a conversa e marca a linha como **Lembrado** (fio + `Check`, "Desfazer" por 5 s);
lembrados descem para "Lembrados hoje (N)" recolhido. Sem telefone: "Sem telefone" com link para a ficha.
B4. Marca de lembrado em `signal_overrides` (`rem:<tipo>:<id>:<data>`), sem tabela nova; a chave tem a data,
então amanhã a escala de domingo volta se ainda faltar.

## Revisão de design (emil-design-eng)

| Antes | Depois | Por quê |
| --- | --- | --- |
| Copiar link sem resposta visível | O texto troca para "Copiado" com o ícone `Check` (blur 2px + opacity 150ms) e volta em 2 s | Confirma sem toast; troca de conteúdo com blur parece um objeto só |
| Interruptor de "Recebendo respostas" seco | Bolinha desliza com transform 200ms `cubic-bezier(.23,1,.32,1)` | Mostra a mudança de estado; é ocasional, pode animar |
| Resposta expandindo com height | `grid-template-rows: 0fr → 1fr` + opacity 200ms ease-out | Abre sem medir altura e sem pulo |
| Lista de respostas toda animando ao abrir | Nada anima ao abrir; só a resposta que entra ou sai | Abrir a ficha é frequente |
| Lembrete some ao tocar | Vira "Lembrado" no lugar por 5 s com Desfazer, depois recolhe (0fr + opacity 200ms) | Item que some sem transição parece erro; WhatsApp abre por cima e a pessoa volta sem saber o que houve |
| Abas Respostas/Perguntas animando | Troca instantânea | Troca frequente |
| Botões sem resposta ao toque | `scale(.97)` no `:active` em todo botão e linha (fica `none` com reduced motion) | O toque precisa ser ouvido |
| Obrigado da página pública só texto | `Check` desenhando (stroke 400ms), uma vez | Uso raro, de quem não conhece o app: vale o cuidado |

Fora por ora: lógica condicional nas perguntas, upload de arquivo, pagamento na inscrição, envio
automático sem toque, lembrete de evento por inscrito.
