-- m74 — Spec 20, Parte 1: estado do plano (assinatura, tolerância, cortesia).
-- O plano que VALE é calculado no app (features/plans/effective.ts) e, para o painel, em
-- admin_list_orgs abaixo. As colunas de cobrança da Parte 2 (billing_doc, asaas_customer_id,
-- subscriptions, billing_events) entram depois.

alter table public.organizations
  add column if not exists plan_status text not null default 'none'
    check (plan_status in ('none','active','past_due','canceled')),
  add column if not exists pro_until timestamptz,     -- cortesia (beta, tour, parceiro)
  add column if not exists grace_until timestamptz;   -- fim da tolerância de atraso

-- Quem já está no pago continua no pago com o código novo (plan='pro' sozinho deixa de
-- liberar). A troca dos beta testers para cortesia é outra migration, depois do deploy.
update public.organizations set plan_status = 'active' where plan = 'pro' and plan_status = 'none';

-- As colunas de plano só mudam por RPC security definer (roda como dono) ou service role.
-- Antes, a equipe da igreja podia se dar o pago com um UPDATE direto (org_update é do staff).
create or replace function public.organizations_guard_plan()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.plan := 'free'; new.plan_status := 'none'; new.pro_until := null; new.grace_until := null;
  elsif (new.plan, new.plan_status, new.pro_until, new.grace_until)
        is distinct from (old.plan, old.plan_status, old.pro_until, old.grace_until) then
    raise exception 'plan_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_plan on public.organizations;
create trigger organizations_guard_plan before insert or update on public.organizations
  for each row execute function public.organizations_guard_plan();

-- Admin dá o pago só como cortesia (pro_until). 'pro' = cortesia sem data (2100); 'free'
-- encerra cortesia e assinatura. A Parte 2 troca por "cortesia até dd/mm com motivo".
create or replace function public.admin_set_org_plan(p_org uuid, p_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_plan not in ('free','pro') then raise exception 'invalid_plan' using errcode='22023'; end if;
  if p_plan = 'pro' then
    update public.organizations set pro_until = '2100-01-01' where id = p_org;
  else
    update public.organizations
      set plan = 'free', plan_status = 'none', pro_until = null, grace_until = null
      where id = p_org;
  end if;
end;
$$;

-- O painel mostra o plano que VALE (mesma regra de effective.ts; mudou lá, muda aqui).
create or replace function public.admin_list_orgs()
returns table (
  org_id uuid, name text, country text, currency text, status text, plan text,
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
           o.created_at,
           (select count(*) from public.memberships m where m.org_id = o.id),
           (select count(*) from public.sticks s where s.org_id = o.id),
           (select count(*) from public.groups g where g.org_id = o.id)
    from public.organizations o
    order by o.created_at;
end;
$$;
