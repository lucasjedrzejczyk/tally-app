# Feature: Células (Groups)

Spec: `docs/specs/14-celulas.md`. Lista à esquerda, ficha à direita (celular: tela cheia, com o
gesto de voltar de Pessoas). Reaproveita o casco de `sticks/people.module.css` e `sticks/swipe.ts`.

## Arquivos-chave
- `domain.ts` — lógica pura de células (dia padrão do encontro, sequência de faltas, "sem registro",
  rótulos, filtros) e, no fim do histórico, `groupsHealth`/`Group` que Home/Inbox/Signals ainda importam.
- `queries.ts` — `listCells`, `getCell`, `getDaySession` (células) e `listGroups` (legado, usado pelo Inbox).
- `actions.ts` — criar/editar célula, supervisor, membros e papéis (`groups.manage_all`); `saveAttendanceAction`
  (upsert do encontro do dia + troca das presenças; o RLS também libera quem lidera a célula).
- `components/` — `GroupsScreen` (servidor), `GroupsView`, `CellList`, `CellProfile`, `CellRead`, `CellEdit`,
  `PresenceSheet`, `AddMembers`.
- Rotas: `/groups` (`?g=<id>`, `?edit=1`), `/groups/[id]`, `GET /api/groups/[id]`, `GET /api/groups/[id]/session?date=`.

## Regras
- Presença = `attendance_records.status='present'` só de quem veio; ausência é deduzida.
- Um encontro por célula por dia (índice único); "Não teve encontro" = `cancelled=true`, sem presenças.
- Uma célula ativa por pessoa: entrar em outra fecha a anterior (`left_at = hoje`, `status='left'`).
