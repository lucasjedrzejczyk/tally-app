# Feature: Encontros (/encontros, spec 16)

A semana da igreja: cultos que repetem (`services`, pelo dia da semana) e eventos (`events`, data única).
Lista da semana à esquerda, ficha à direita (molde de Pessoas, Células e Ministérios); seleção em
`?o=s:<culto>:<data>` ou `?o=e:<evento>`.

- `domain.ts` (testado): semana, encontros do período, quem serve (`servingAt` cruza as escalas de
  Ministérios por dia e horário + o culto ligado em `ministries.service_id`), convite, contagens.
- `queries.ts` / `actions.ts`: cultos, `service_dates` (o culto num dia: contagem, sermão, cancelado,
  criado só quando alguém mexe), ordem do culto (`service_plan_items`; `date_id` nulo = ordem de sempre),
  eventos e inscrições internas. Gravar exige `services.manage`.
- Leituras pela API (`/api/encontros/week|item|sermons`), fora da fila de Server Actions.
- A escala é a de Ministérios (`ScheduleSheet` reaproveitado). `features/services` e `features/events`
  ficaram só com consultas do Inbox escondido.
