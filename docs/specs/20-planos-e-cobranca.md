# Spec 20: Planos de verdade e cobrança pelo Asaas

Substitui a spec 05 (cobrança). Aprovada pelo dono em 2026-10-17.

## Por que agora

Há beta testers e igrejas querendo assinar. Hoje:

- As 7 igrejas estão em `plan='pro'` (m50 subiu todas). Ninguém vê trava.
- Conta nova nasce `plan='free'` (default da coluna) e o Estudo inteiro é travado
  (`study/layout.tsx` = `makeGatedLayout("study")`). **Igreja nova não abre nem a Bíblia.**
- Não há caminho de dinheiro: plano só muda pelo `/admin`.

## Parte 1: grátis × pago

### O que cada plano libera

**Grátis ("Comunidade")**
- Bíblia: leitura, destaques, notas, busca.
- Sermões (editor, séries, notas, mapa).
- Pessoas e Células.
- Finanças básica: lançar entrada/saída, saldo por conta, dízimos por pessoa, fechamento do mês.

**Pago ("Igreja")**: tudo do grátis, mais:
- Bíblia: palavra original (`WordTab`) e comentários (`CommentaryTab`).
- Finanças completa: contas a pagar (aba `contas`), comprovantes, importar extrato,
  recibos e declaração anual, área do contador (`/finance/contador`).
- Ministérios, Encontros, Cuidado, Crianças, Formulários, Lembretes.
- Os módulos antigos já travados continuam no pago (comunicação, espaços, DM, membros, times).

### Catálogo (`features/plans/catalog.ts`)

`FeatureKey` passa a ser:

```
bible_original | bible_commentary | finance_full | accounting |
ministries | encontros | care | kids | forms | reminders |
giving | communication | teams | events | members
```

- Sai `study` e `finance` como trava de módulo inteiro: `/study` e `/finance` abrem para todos.
- `study/layout.tsx` perde o `makeGatedLayout`. `finance/layout.tsx` também (mantém `requireStaff`).
- Travas novas por layout: `ministries`, `encontros`, `care`, `kids`, `forms`, `lembretes`,
  `finance/contador` (`accounting`).
- Travas dentro da tela (não há rota própria): no leitor, as abas Palavra e Comentário mostram o
  `Upsell` no lugar do conteúdo; em Finanças, a aba Contas, o botão de importar extrato,
  anexos, recibo e declaração mostram cadeado e abrem o `Upsell`.
- `catalog.test.ts`: o grátis libera nenhuma chave; o pago libera todas; nenhuma chave órfã.

### Plano efetivo

Uma função pura em `features/plans/effective.ts`:

```
effectivePlan(org, now) =
  'pro'  se org.plan = 'pro' e org.plan_status = 'active'
  'pro'  se org.plan_status = 'past_due' e now < org.grace_until
  'pro'  se org.pro_until não nulo e now < org.pro_until      (cortesia / beta / pós-tour)
  'free' em qualquer outro caso
```

`requireOrg()` passa a preencher `ctx.plan` com `effectivePlan`. Todo o resto (Sidebar,
`gateFeature`, `Upsell`) continua lendo `ctx.plan` sem mudar. Testes cobrem cada linha.

Atenção: `plan='pro'` sozinho (sem `plan_status='active'`) deixa de liberar. Por isso o
`/admin` passa a dar o pago só como cortesia (`pro_until`), nunca trocando `plan` direto.

**Nenhum dado é apagado** ao cair para o grátis. O que é do pago fica guardado e volta ao assinar.

### Sem teste grátis automático: "Agendar um tour"

- Igreja nova nasce no grátis, sem trial.
- O `Upsell` e a página `/plans` ganham o botão **Agendar um tour**, que abre o link de
  agendamento do dono (Google Agenda ou Calendly) em nova aba. O link vive em
  `src/config/site.ts` (`SITE.tourUrl`). Enquanto vazio, o botão não aparece.
- Depois da call, o dono dá cortesia pelo `/admin`: `pro_until` = data escolhida.

### Beta testers

Migration põe `pro_until` = data que o dono escolher (padrão: hoje + 60 dias) nas 4 igrejas
ativas, e `plan='free'`, `plan_status='none'`. Ou seja: continuam com tudo até a data.
**Só aplicar depois do código no ar** (lição da tarefa 0 do AGENTS.md).

## Parte 2: cobrança pelo Asaas

### Banco (`m74_billing`)

```sql
alter table public.organizations
  add column plan_status text not null default 'none',   -- none|active|past_due|canceled
  add column pro_until timestamptz,                       -- cortesia (beta, tour, parceiro)
  add column grace_until timestamptz,                     -- fim da tolerância de atraso
  add column billing_doc text,                            -- CPF ou CNPJ, só dígitos
  add column asaas_customer_id text;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'asaas',
  provider_subscription_id text not null,
  cycle text not null,                 -- MONTHLY|YEARLY
  status text not null,                -- ACTIVE|INACTIVE|EXPIRED
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create table public.billing_events (
  id bigserial primary key,
  provider text not null default 'asaas',
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  unique (provider, event_id)
);
```

- RLS ligada nas duas tabelas. `subscriptions`: leitura para quem tem `org.manage` na org.
  `billing_events`: nenhuma policy (só service role).
- Colunas de cobrança em `organizations` só mudam por RPC `security definer` ou pelo webhook.
  `admin_set_org_plan` (m50) ganha `p_pro_until timestamptz` e grava quem concedeu e por quê
  (`plan_grants`: org, admin, pro_until, motivo, data).

### Assinar

1. Só quem tem `org.manage` vê **Assinar** em `/plans` (mensal ou anual).
2. Se a igreja não tem `billing_doc`, pede CPF ou CNPJ (valida dígito) antes de seguir.
3. Server action: cria o cliente no Asaas se não existe (`asaas_customer_id`), cria a assinatura
   com `billingType: UNDEFINED` (a pessoa escolhe Pix, boleto ou cartão), `cycle`,
   `value` e `externalReference = org_id`. Grava `subscriptions`. Redireciona para a
   `invoiceUrl` da primeira cobrança.
4. Preço: `src/config/billing.ts` (`PRICE_MONTHLY`, `PRICE_YEARLY` em reais). Enquanto zero,
   o botão Assinar não aparece e `/plans` mostra "Fale com a gente" + Agendar um tour.
5. Asaas fora do ar ou erro: mensagem simples, nada muda no banco além do cliente criado.

Cliente Asaas: `features/billing/asaas.ts`, `fetch` puro (sem SDK), base URL por
`ASAAS_ENV` (`sandbox` | `production`), chave em `ASAAS_API_KEY`. Só roda no servidor.

### Webhook `POST /api/billing/asaas`

As três regras que evitam prejuízo:

1. **Verifica o token**: header `asaas-access-token` igual a `ASAAS_WEBHOOK_TOKEN`
   (comparação em tempo constante). Diferente: 401, nada gravado.
2. **Idempotência**: insere em `billing_events` por `event_id`; se já existe, responde 200 e para.
3. **Service role só aqui** (`SUPABASE_SERVICE_ROLE_KEY`, nunca no client).

Mapeamento (função pura `features/billing/events.ts`, testada):

| Evento Asaas | Efeito |
|---|---|
| `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | `plan='pro'`, `plan_status='active'`, `grace_until=null`, `current_period_end` = vencimento + ciclo |
| `PAYMENT_OVERDUE` | `plan_status='past_due'`, `grace_until` = agora + 7 dias |
| `SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED` | `plan_status='canceled'`, `pro_until` = `current_period_end` (usa até o fim do que pagou) |
| outros | grava o evento, não muda nada |

A org vem de `externalReference` (ou da assinatura). Sem org: grava e ignora.

### Avisos no app

- `past_due`: faixa discreta para quem tem `org.manage`: "O pagamento não caiu. Seu plano
  continua até dd/mm." com link para a fatura.
- Faltando 7 dias para `pro_until` de cortesia: aviso no mesmo lugar, com Assinar e Agendar um tour.

### Admin (`/admin`)

Coluna de status por igreja (grátis, cortesia até dd/mm, ativa, atrasada, cancelada) e
"Dar cortesia até..." com motivo. Usa o RPC estendido.

### O que o dono faz (o Claude guia, não toca em chave)

1. Asaas sandbox: gerar chave de API; criar webhook apontando para
   `https://<domínio>/api/billing/asaas` com um token escolhido por ele.
2. Vercel: `ASAAS_ENV`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Testar uma assinatura no sandbox. Depois repetir com a chave de produção.
4. Mandar o link de agendamento e, quando a pesquisa sair, os preços.

## Fora desta spec

Pesquisa de preço (sessão própria), cupons, nota fiscal, cobrança em dólar (EUA/Stripe),
troca de plano ou ciclo no meio do período, teste grátis automático.

## Ordem de entrega

1. Parte 1 (catálogo, plano efetivo, travas novas, tour) + migration de colunas. Publicar.
   Só então a migration dos beta testers.
2. Parte 2 (cliente Asaas, assinar, webhook, avisos, admin). Testar no sandbox. Publicar.

## Pronto quando

- [ ] igreja nova no grátis abre Bíblia, Sermões, Pessoas, Células e Finanças básica
- [ ] palavra original, comentários e as partes pagas de Finanças mostram o Upsell no grátis
- [ ] Ministérios, Encontros, Cuidado, Crianças, Formulários e Lembretes travados no grátis
- [ ] beta testers com tudo até a data; depois caem para o grátis sem perder dado
- [ ] assinatura no sandbox leva do grátis ao pago sem mão humana
- [ ] webhook recusa token errado e ignora evento repetido (teste)
- [ ] atraso dá 7 dias e depois cai; cancelamento usa até o fim do período
- [ ] `/admin` mostra status e dá cortesia com motivo
- [ ] `npm run verify` verde
