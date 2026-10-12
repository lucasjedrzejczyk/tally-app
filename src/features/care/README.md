# Feature: Cuidado (/care) — spec 17

Um item no menu, duas abas: **Acompanhamentos** (lista + ficha, `?c=<id>`, Editar em `?edit=1`) e
**Orações** (`?tab=oracoes`, a aba vem de `features/prayer`). `/prayer` redireciona.

## Arquivos-chave
- `domain.ts` (+ testes): grupos de status (Em andamento / Aguardando / Concluído), "último contato",
  parado (14 dias), ordem da lista, sugestões ("Pode precisar de atenção") e a chave de dispensar.
- `queries.ts`: `listCare`, `getCare` (com a linha do tempo), `listStaff`, `listSuggestions`
  (faltas na célula, visitantes de 3 a 45 dias, 2 recusas seguidas na escala), `openCareFor` (Pessoas).
- `actions.ts`: criar, editar campo, status, registrar contato (atualiza `last_contact_on`), nota,
  excluir (`care.manage`), dispensar sugestão (`signal_overrides`, status `dismissed`).
- `components/`: `CareScreen` (servidor), `CareView`, `CareList`, `CareProfile`, `Parts`, `PickPerson`.

## Sigilo
Caso sigiloso (`care_items.confidential`, m71) só chega para o responsável, quem abriu e quem tem
`care.manage`: a RLS de `care_items` decide, e notas/contatos herdam pelo `exists` no item.
