# Feature: Lembretes (/lembretes) — spec 19, fase B

Lista montada sozinha, por dia (Hoje, Amanhã, Próximos dias): escalas de hoje e amanhã, aniversários da
semana, próximos passos do Cuidado (meus casos) e respostas novas de formulário. WhatsApp abre com a
mensagem pronta e marca como "Lembrado" (Desfazer por 5 s). Marca em `signal_overrides` com chave
`rem:<tipo>:<id>:<data>`, sem tabela nova. Envio sem toque (API do WhatsApp, e-mail) fica para depois.

- `domain.ts` (+ testes): `buildReminders`, `nextBirthday`, textos das mensagens.
- `queries.ts`: `listReminders` (cada fonte respeita a própria RLS).
- `actions.ts`: `markReminderAction`.
