-- m71 Cuidado (spec 17): caso sigiloso (RLS), data do último contato, pedidos de oração pelo link
-- público (pendentes até a equipe aprovar) e o token do link na igreja.

-- 1. Acompanhamentos --------------------------------------------------------------------------------
alter table public.care_items add column if not exists confidential boolean not null default false;
alter table public.care_items add column if not exists last_contact_on date;
update public.care_items i set last_contact_on = c.last
  from (select care_item_id, max(contacted_on) as last from public.care_contacts group by care_item_id) c
  where c.care_item_id = i.id and i.last_contact_on is null;

-- Sigiloso: só o responsável, quem abriu e quem tem care.manage. Notas e contatos herdam (exists no item).
alter policy care_select on public.care_items
  using (has_perm(org_id, 'care.view') and (not confidential or assigned_to = auth.uid() or created_by = auth.uid() or has_perm(org_id, 'care.manage')));
alter policy care_update on public.care_items
  using (has_perm(org_id, 'care.view') and (not confidential or assigned_to = auth.uid() or created_by = auth.uid() or has_perm(org_id, 'care.manage')))
  with check (has_perm(org_id, 'care.view') and (not confidential or assigned_to = auth.uid() or created_by = auth.uid() or has_perm(org_id, 'care.manage')));

-- 2. Pedidos de oração ------------------------------------------------------------------------------
alter table public.prayer_requests add column if not exists status text not null default 'approved';
alter table public.prayer_requests drop constraint if exists prayer_requests_status_check;
alter table public.prayer_requests add constraint prayer_requests_status_check check (status in ('pending', 'approved'));
alter table public.prayer_requests add column if not exists contact text;
create index if not exists prayer_requests_pending on public.prayer_requests (org_id, created_at) where status = 'pending';

alter table public.organizations add column if not exists prayer_token text unique;

-- 3. Link público -----------------------------------------------------------------------------------
create or replace function public.prayer_link_org(p_token text)
returns text
language sql stable security definer set search_path = public as $$
  select name from organizations where prayer_token = p_token and coalesce(length(p_token), 0) >= 16;
$$;

create or replace function public.submit_prayer(p_token text, p_name text, p_request text, p_private boolean, p_contact text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_req text := btrim(coalesce(p_request, ''));
  v_contact text := nullif(btrim(coalesce(p_contact, '')), '');
begin
  if coalesce(length(p_token), 0) < 16 then return false; end if;
  select id into v_org from organizations where prayer_token = p_token;
  if v_org is null then return false; end if;
  if v_req = '' or length(v_req) > 1000 or length(coalesce(v_name, '')) > 80 or length(coalesce(v_contact, '')) > 30 then
    raise exception 'pedido inválido';
  end if;
  if (select count(*) from prayer_requests where org_id = v_org and status = 'pending' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'muitos pedidos agora';
  end if;
  insert into prayer_requests (org_id, author_name, request, privacy, status, contact)
  values (v_org, coalesce(v_name, 'Anônimo'), v_req, case when p_private then 'leader'::prayer_privacy else 'church'::prayer_privacy end, 'pending', v_contact);
  return true;
end;
$$;

revoke execute on function public.prayer_link_org(text) from public;
revoke execute on function public.submit_prayer(text, text, text, boolean, text) from public;
grant execute on function public.prayer_link_org(text) to anon, authenticated;
grant execute on function public.submit_prayer(text, text, text, boolean, text) to anon, authenticated;
