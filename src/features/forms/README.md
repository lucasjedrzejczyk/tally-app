# Feature: Formulários (/forms) — spec 19

Lista + ficha (`?f=<id>`), abas **Respostas** | **Perguntas**. Página pública em `/formulario/[token]`
(sem login, rota pública no middleware). Permissão `forms.manage`.

## Arquivos-chave
- `domain.ts` (+ testes): perguntas (`short | long | choice | multi | date`), modelos (Em branco, Ficha de
  visitante, Inscrição, Pedido de batismo), limpeza antes de gravar, texto das respostas, planilha CSV.
- `queries.ts`: `listForms` (com contagem e "novas"), `getForm` (com respostas e a pessoa ligada).
- `actions.ts`: criar, salvar perguntas, abrir/fechar, excluir, marcar vistas, excluir resposta,
  **Adicionar em Pessoas** (liga a quem tem o mesmo telefone ou cria visitante), envio público.
- `components/`: `FormsScreen` (servidor), `FormsView`, `FormPane`, `FormEditor`, `PublicForm`.
- A ficha troca sem recarregar por `GET /api/forms/[id]` (server action de leitura em paralelo com
  outra que revalida se perdia).

## Banco (m73)
`forms`, `form_responses` (RLS `has_perm(org,'forms.manage')`). RPCs públicas `form_public` (só aberto) e
`submit_form` (valida obrigatórias, opções, data e tamanho; 200 respostas/hora por formulário).
