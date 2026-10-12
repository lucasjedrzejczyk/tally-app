-- m68 — Ministérios e escalas (spec 15). Ministério com funções (sai o nível "Time"); o líder do
-- ministério entra no app e vê/escala só o ministério dele, como o líder de célula (m67).

-- 1. Ministério ganha funções, vagas por função e o culto padrão --------------------------------
alter table public.ministries
  add column if not exists roles jsonb not null default '[]'::jsonb,   -- ["Vocal","Violão","Som"]
  add column if not exists slots jsonb not null default '{}'::jsonb,   -- {"Vocal":2}; ausente = 1
  add column if not exists meeting_day text,                           -- "Domingo"
  add column if not exists meeting_time text;                          -- "19:00"

-- 2. Quem serve: uma linha ativa por pessoa e ministério; a pessoa pode servir em vários ---------
create table if not exists public.ministry_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  stick_id    uuid not null references public.sticks(id) on delete cascade,
  roles       text[] not null default '{}',             -- funções que a pessoa faz
  role        text not null default 'member' check (role in ('leader','co_leader','member')),
  joined_at   date not null default current_date,
  left_at     date,
  created_at  timestamptz not null default now()
);
create unique index if not exists ministry_members_active_uq on public.ministry_members (ministry_id, stick_id) where left_at is null;
create index if not exists ministry_members_stick_idx on public.ministry_members (stick_id);

-- 3. Escala: um culto = (ministério, data, horário) ---------------------------------------------
alter table public.schedule_assignments
  add column if not exists ministry_id  uuid references public.ministries(id) on delete cascade,
  add column if not exists service_time time,
  add column if not exists notified_at  timestamptz;
create index if not exists sched_ministry_date_idx on public.schedule_assignments (ministry_id, assignment_date);

-- 4. Carga dos dados antigos (times viram funções do ministério) --------------------------------
update public.ministries m set roles = coalesce((
  select jsonb_agg(distinct r) from public.teams t, jsonb_array_elements_text(t.serving_roles) r where t.ministry_id = m.id
), '[]'::jsonb)
where m.roles = '[]'::jsonb;

insert into public.ministry_members (org_id, ministry_id, stick_id, roles, role, joined_at)
select distinct on (t.ministry_id, tm.stick_id)
  tm.org_id, t.ministry_id, tm.stick_id,
  case when coalesce(tm.role, '') = '' then '{}'::text[] else array[tm.role] end,
  case when t.leader_id = tm.stick_id then 'leader' else 'member' end,
  coalesce(tm.joined_at, current_date)
from public.team_members tm join public.teams t on t.id = tm.team_id
where t.ministry_id is not null and tm.status = 'active'
on conflict do nothing;

update public.schedule_assignments s set ministry_id = t.ministry_id
from public.teams t where t.id = s.team_id and s.ministry_id is null;

-- 5. Quem lidera e quem gerencia -----------------------------------------------------------------
create or replace function public.leads_ministry(p_ministry uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from ministry_members mm join sticks s on s.id = mm.stick_id
    where mm.ministry_id = p_ministry and mm.left_at is null and mm.role in ('leader','co_leader')
      and s.user_id = auth.uid()
  );
$$;
revoke execute on function public.leads_ministry(uuid) from public, anon;
grant execute on function public.leads_ministry(uuid) to authenticated;

create or replace function public.can_manage_ministries(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(p_org, 'ministries.manage_all');
$$;
revoke execute on function public.can_manage_ministries(uuid) from public, anon;
grant execute on function public.can_manage_ministries(uuid) to authenticated;

-- 6. RLS -----------------------------------------------------------------------------------------
drop policy if exists ministries_rw on public.ministries;
drop policy if exists ministries_read on public.ministries;
drop policy if exists ministries_write on public.ministries;
create policy ministries_read on public.ministries for select using (is_org_staff(org_id) or leads_ministry(id));
create policy ministries_write on public.ministries for all
  using (can_manage_ministries(org_id)) with check (can_manage_ministries(org_id));

alter table public.ministry_members enable row level security;
drop policy if exists mm_read on public.ministry_members;
drop policy if exists mm_write on public.ministry_members;
create policy mm_read on public.ministry_members for select using (is_org_staff(org_id) or leads_ministry(ministry_id));
create policy mm_write on public.ministry_members for all
  using (can_manage_ministries(org_id)) with check (can_manage_ministries(org_id));

drop policy if exists schedule_assignments_rw on public.schedule_assignments;
drop policy if exists sched_read on public.schedule_assignments;
drop policy if exists sched_write on public.schedule_assignments;
create policy sched_read on public.schedule_assignments for select
  using (is_org_staff(org_id) or (ministry_id is not null and leads_ministry(ministry_id)));
create policy sched_write on public.schedule_assignments for all
  using (can_manage_ministries(org_id) or (ministry_id is not null and leads_ministry(ministry_id)))
  with check (can_manage_ministries(org_id) or (ministry_id is not null and leads_ministry(ministry_id)));

-- O líder do ministério lê a ficha (sem documentos) de quem serve com ele.
drop policy if exists sticks_read on public.sticks;
create policy sticks_read on public.sticks for select
  using (is_org_staff(org_id) or user_id = auth.uid()
    or exists (select 1 from group_members gm where gm.stick_id = sticks.id and gm.left_at is null and leads_group(gm.group_id))
    or exists (select 1 from groups g where g.supervisor_stick_id = sticks.id and leads_group(g.id))
    or exists (select 1 from ministry_members mm where mm.stick_id = sticks.id and mm.left_at is null and leads_ministry(mm.ministry_id)));

-- Conflito de horário: o líder precisa saber se a pessoa já está em outro ministério no mesmo culto,
-- sem ler as escalas dos outros. Devolve só o nome do outro ministério e a função.
create or replace function public.schedule_conflicts(p_org uuid, p_date date, p_ministry uuid)
returns table (stick_id uuid, service_time time, ministry_name text, role text)
language sql stable security definer set search_path = public as $$
  select s.stick_id, s.service_time, m.name, s.role
  from schedule_assignments s join ministries m on m.id = s.ministry_id
  where s.org_id = p_org and s.assignment_date = p_date and s.ministry_id <> p_ministry
    and s.status <> 'declined' and s.stick_id is not null
    and (is_org_staff(p_org) or leads_ministry(p_ministry));
$$;
revoke execute on function public.schedule_conflicts(uuid, date, uuid) from public, anon;
grant execute on function public.schedule_conflicts(uuid, date, uuid) to authenticated;
