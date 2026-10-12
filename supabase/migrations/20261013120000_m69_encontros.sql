-- m69 Encontros (spec 16): o culto num dia (contagem, sermão, cancelado), ordem do culto por dia,
-- ministério ligado a um culto, horário do evento em texto e permissão services.manage.

-- 1. O culto num dia ------------------------------------------------------------------------------
create table if not exists public.service_dates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  date date not null,
  headcount int check (headcount is null or headcount >= 0),
  visitors int check (visitors is null or visitors >= 0),
  kids int check (kids is null or kids >= 0),
  sermon_id uuid references public.sermons(id) on delete set null,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (service_id, date)
);
create index if not exists service_dates_org_date on public.service_dates (org_id, date);
alter table public.service_dates enable row level security;

-- 2. Ordem do culto por dia, ministério ligado ao culto, horário do evento ----------------------
alter table public.service_plan_items add column if not exists date_id uuid references public.service_dates(id) on delete cascade;
create index if not exists service_plan_items_date on public.service_plan_items (date_id);
alter table public.ministries add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.events add column if not exists time text;
update public.events set time = to_char(starts_at at time zone 'America/Sao_Paulo', 'HH24:MI') where time is null and starts_at is not null;

-- 3. Quem gerencia --------------------------------------------------------------------------------
create or replace function public.can_manage_services(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(p_org, 'services.manage');
$$;
revoke execute on function public.can_manage_services(uuid) from public, anon;
grant execute on function public.can_manage_services(uuid) to authenticated;

-- 4. RLS ------------------------------------------------------------------------------------------
drop policy if exists org_all on public.services;
drop policy if exists services_read on public.services;
drop policy if exists services_write on public.services;
create policy services_read on public.services for select using (is_org_member(org_id));
create policy services_write on public.services for all using (can_manage_services(org_id)) with check (can_manage_services(org_id));

drop policy if exists service_dates_read on public.service_dates;
drop policy if exists service_dates_write on public.service_dates;
create policy service_dates_read on public.service_dates for select using (is_org_staff(org_id));
create policy service_dates_write on public.service_dates for all using (can_manage_services(org_id)) with check (can_manage_services(org_id));

drop policy if exists service_plan_items_rw on public.service_plan_items;
drop policy if exists spi_read on public.service_plan_items;
drop policy if exists spi_write on public.service_plan_items;
create policy spi_read on public.service_plan_items for select using (is_org_staff(org_id));
create policy spi_write on public.service_plan_items for all using (can_manage_services(org_id)) with check (can_manage_services(org_id));

drop policy if exists org_all on public.events;
drop policy if exists events_read on public.events;
drop policy if exists events_write on public.events;
create policy events_read on public.events for select using (is_org_staff(org_id));
create policy events_write on public.events for all using (can_manage_services(org_id)) with check (can_manage_services(org_id));

drop policy if exists event_registrations_rw on public.event_registrations;
drop policy if exists er_read on public.event_registrations;
drop policy if exists er_write on public.event_registrations;
create policy er_read on public.event_registrations for select using (is_org_staff(org_id));
create policy er_write on public.event_registrations for all using (can_manage_services(org_id)) with check (can_manage_services(org_id));
