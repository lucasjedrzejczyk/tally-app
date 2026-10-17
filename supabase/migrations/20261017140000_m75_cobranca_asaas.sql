-- m75 — Spec 20, Parte 2: cobrança pelo Asaas.
-- Assinatura, eventos do webhook (idempotência), cortesia com motivo. As colunas de cobrança
-- só mudam por RPC security definer ou pelo webhook (service role): o trigger da m74 passa a
-- cobrir billing_doc e asaas_customer_id também.

alter table public.organizations
  add column if not exists billing_doc text,          -- CPF ou CNPJ, só dígitos
  add column if not exists asaas_customer_id text;

create or replace function public.organizations_guard_plan()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.plan := 'free'; new.plan_status := 'none'; new.pro_until := null; new.grace_until := null;
    new.billing_doc := null; new.asaas_customer_id := null;
  elsif (new.plan, new.plan_status, new.pro_until, new.grace_until, new.billing_doc, new.asaas_customer_id)
        is distinct from (old.plan, old.plan_status, old.pro_until, old.grace_until, old.billing_doc, old.asaas_customer_id) then
    raise exception 'plan_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'asaas',
  provider_subscription_id text not null,
  cycle text not null check (cycle in ('MONTHLY','YEARLY')),
  status text not null,                -- ACTIVE|INACTIVE|EXPIRED
  current_period_end timestamptz,
  invoice_url text,                    -- última fatura (para o aviso de atraso)
  created_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index if not exists subscriptions_org_idx on public.subscriptions (org_id, created_at desc);

create table if not exists public.billing_events (
  id bigserial primary key,
  provider text not null default 'asaas',
  event_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  unique (provider, event_id)
);

create table if not exists public.plan_grants (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  admin_id uuid not null,
  pro_until timestamptz,               -- null = cortesia encerrada
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;   -- sem policy: só service role
alter table public.plan_grants enable row level security;      -- sem policy: só RPC/admin

drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.has_perm(org_id, 'org.manage'));

-- Assinar (server action, sessão de quem tem org.manage). O cliente Asaas é criado uma vez;
-- o documento só é gravado junto com ele. A assinatura nasce INACTIVE: quem liga o pago é o
-- webhook de pagamento, nunca o navegador.
create or replace function public.billing_set_customer(p_org uuid, p_doc text, p_customer text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'org.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_doc !~ '^(\d{11}|\d{14})$' then raise exception 'invalid_doc' using errcode = '22023'; end if;
  update public.organizations set billing_doc = p_doc, asaas_customer_id = p_customer where id = p_org;
end;
$$;

create or replace function public.billing_add_subscription(p_org uuid, p_sub text, p_cycle text, p_invoice text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_perm(p_org, 'org.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.subscriptions (org_id, provider_subscription_id, cycle, status, invoice_url)
  values (p_org, p_sub, p_cycle, 'INACTIVE', p_invoice);
end;
$$;

-- Admin: cortesia até uma data, com motivo (null = encerra a cortesia; assinatura paga não
-- é tocada). Substitui admin_set_org_plan (m50/m74).
drop function if exists public.admin_set_org_plan(uuid, text);
create or replace function public.admin_grant_courtesy(p_org uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = '22023'; end if;
  update public.organizations set pro_until = p_until where id = p_org;
  insert into public.plan_grants (org_id, admin_id, pro_until, reason) values (p_org, auth.uid(), p_until, trim(p_reason));
end;
$$;

-- Painel: plano que vale + o estado bruto para o rótulo (grátis, cortesia, ativa, atrasada...).
drop function if exists public.admin_list_orgs();
create function public.admin_list_orgs()
returns table (
  org_id uuid, name text, country text, currency text, status text, plan text,
  plan_status text, pro_until timestamptz, grace_until timestamptz,
  created_at timestamptz, members bigint, sticks bigint, groups bigint
) language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select o.id, o.name, o.country, o.currency, o.status,
           case when (o.plan = 'pro' and o.plan_status = 'active')
                  or (o.plan_status = 'past_due' and o.grace_until > now())
                  or (o.pro_until > now())
                then 'pro' else 'free' end,
           o.plan_status, o.pro_until, o.grace_until,
           o.created_at,
           (select count(*) from public.memberships m where m.org_id = o.id),
           (select count(*) from public.sticks s where s.org_id = o.id),
           (select count(*) from public.groups g where g.org_id = o.id)
    from public.organizations o
    order by o.created_at;
end;
$$;
