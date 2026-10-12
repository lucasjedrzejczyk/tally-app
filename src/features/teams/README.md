# Feature: Times (legado)

A tela de Times foi substituída por **Ministérios** (`src/features/ministries`, spec 15): ministério
com funções, sem o nível "Time". `/teams` redireciona para `/ministries`.

O que sobrou aqui (`queries.ts`, `domain.ts`, `types.ts`) só alimenta telas escondidas pelo modo
só Estudo (Inbox, Agenda e Signals) que ainda leem `teams`/`team_members`. Quando essas telas
voltarem, devem ler `ministry_members` e `schedule_assignments.ministry_id` e esta pasta pode sair.
