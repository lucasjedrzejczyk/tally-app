# Feature: Oração — spec 17 (aba Orações do Cuidado)

- `domain.ts` (+ testes): `PrayerRequest`, `splitPrayers` (link / mural / respondidas), prune de 30 dias,
  token do link.
- `queries.ts`: `listPrayers` (também usada na Home), `pendingPrayerCount` (ponto no menu), `prayerToken`.
- `actions.ts`: criar, aprovar, apagar (recusar/excluir, `prayer.manage`), Orei, respondida, link
  (`organizations.prayer_token`) e o envio público pelo RPC `submit_prayer`.
- `components/PrayerTab.tsx`, `NewPrayer.tsx`, `PublicPrayerForm.tsx` (página pública `/pedido/[token]`).

Pedido do link entra `status = 'pending'` e só vai para o mural quando a equipe aprova.
"Só a equipe pastoral" = `privacy = 'leader'` (lido só com `prayer.view_private`).
