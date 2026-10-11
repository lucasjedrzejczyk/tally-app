-- m67 — Células (spec 14). Líder e supervisor entram no app vendo SÓ as células deles.
--
-- Antes: qualquer membro da org (inclusive quem entrou por convite sem permissão) lia e
-- gravava quase tudo (sermões, finanças antigas, oração, linha do tempo...). Como líderes de
-- célula vão ganhar login, tudo que era "membro da org" passa a ser "equipe" (is_org_staff, m66).
-- Ficam abertas a qualquer membro só as tabelas que o próprio membro precisa: organizations
-- (ler), memberships, roles (ler), campuses (ler), DMs, espaços e notas/destaques do autor.

-- 1. Equipe no lugar de "membro" ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd from pg_policies
    where schemaname = 'public'
      and tablename in ('app_state','coordination_posts','coordination_tasks','event_registrations','events',
        'finance_categories','finance_entries','funds','journey_stages','journeys','milestone_types','milestones',
        'ministries','resources','schedule_assignments','series','sermon_scriptures','sermons','service_plan_items',
        'services','signal_overrides','signals','stick_journey_records','study_notes','team_members','teams',
        'timeline_events','track_enrollments','track_steps','tracks','campus_fiscal_profiles','org_fiscal_profiles')
      and (qual like '%is_org_member(org_id)%' or with_check like '%is_org_member(org_id)%')
  loop
    if r.cmd = 'SELECT' then
      execute format('alter policy %I on public.%I using (is_org_staff(org_id))', r.policyname, r.tablename);
    elsif r.cmd = 'INSERT' then
      execute format('alter policy %I on public.%I with check (is_org_staff(org_id))', r.policyname, r.tablename);
    else
      execute format('alter policy %I on public.%I using (is_org_staff(org_id)) with check (is_org_staff(org_id))', r.policyname, r.tablename);
    end if;
  end loop;
end $$;

alter policy org_update on public.organizations using (is_org_staff(id)) with check (is_org_staff(id));
alter policy pray_select on public.prayer_requests
  using (is_org_staff(org_id) and ((privacy = 'church'::prayer_privacy) or has_perm(org_id, 'prayer.view_private')));
alter policy pray_update on public.prayer_requests using (is_org_staff(org_id)) with check (is_org_staff(org_id));
alter policy pray_insert on public.prayer_requests with check (is_org_staff(org_id));

-- campuses: qualquer membro lê (layout), só equipe grava
drop policy if exists org_all on public.campuses;
drop policy if exists campuses_read on public.campuses;
drop policy if exists campuses_write on public.campuses;
create policy campuses_read on public.campuses for select using (is_org_member(org_id));
create policy campuses_write on public.campuses for all using (is_org_staff(org_id)) with check (is_org_staff(org_id));

-- 2. Célula: supervisor e local; encontro cancelado ------------------------------------------
alter table public.groups
  add column if not exists supervisor_stick_id uuid references public.sticks(id) on delete set null,
  add column if not exists location text;
alter table public.attendance_sessions
  add column if not exists cancelled boolean not null default false;   -- "não teve encontro"
-- um encontro por célula por dia (reabrir o mesmo dia edita o mesmo encontro)
create unique index if not exists uq_group_session_day on public.attendance_sessions(context_id, session_date)
  where context_type = 'group';

-- 3. Quem lidera/supervisiona -----------------------------------------------------------------
-- Líder/co-líder ativo da célula, ou supervisor dela, pela ficha ligada ao login (sticks.user_id).
create or replace function public.leads_group(p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from group_members gm join sticks s on s.id = gm.stick_id
    where gm.group_id = p_group and gm.left_at is null and gm.role in ('leader','co_leader')
      and s.user_id = auth.uid()
  ) or exists(
    select 1 from groups g join sticks s on s.id = g.supervisor_stick_id
    where g.id = p_group and s.user_id = auth.uid()
  );
$$;
revoke execute on function public.leads_group(uuid) from public, anon;
grant execute on function public.leads_group(uuid) to authenticated;

create or replace function public.can_manage_groups(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(p_org, 'groups.manage_all');
$$;
revoke execute on function public.can_manage_groups(uuid) from public, anon;
grant execute on function public.can_manage_groups(uuid) to authenticated;

-- 4. RLS das células ------------------------------------------------------------------------
drop policy if exists org_all on public.groups;
drop policy if exists groups_read on public.groups;
drop policy if exists groups_write on public.groups;
create policy groups_read on public.groups for select using (is_org_staff(org_id) or leads_group(id));
create policy groups_write on public.groups for all
  using (can_manage_groups(org_id)) with check (can_manage_groups(org_id));

drop policy if exists gm_all on public.group_members;
drop policy if exists gm_read on public.group_members;
drop policy if exists gm_write on public.group_members;
create policy gm_read on public.group_members for select
  using (exists (select 1 from groups g where g.id = group_id and (is_org_staff(g.org_id) or leads_group(g.id))));
create policy gm_write on public.group_members for all
  using (exists (select 1 from groups g where g.id = group_id and can_manage_groups(g.org_id)))
  with check (exists (select 1 from groups g where g.id = group_id and can_manage_groups(g.org_id)));

-- encontros: equipe vê tudo; líder vê e grava os da célula dele
drop policy if exists org_all on public.attendance_sessions;
drop policy if exists att_sessions_read on public.attendance_sessions;
drop policy if exists att_sessions_write on public.attendance_sessions;
create policy att_sessions_read on public.attendance_sessions for select
  using (is_org_staff(org_id) or (context_type = 'group' and leads_group(context_id)));
create policy att_sessions_write on public.attendance_sessions for all
  using (can_manage_groups(org_id) or (context_type = 'group' and leads_group(context_id)))
  with check (can_manage_groups(org_id) or (context_type = 'group' and leads_group(context_id)));

drop policy if exists attrec_all on public.attendance_records;
drop policy if exists attrec_read on public.attendance_records;
drop policy if exists attrec_write on public.attendance_records;
create policy attrec_read on public.attendance_records for select
  using (exists (select 1 from attendance_sessions s where s.id = session_id
    and (is_org_staff(s.org_id) or (s.context_type = 'group' and leads_group(s.context_id)))));
create policy attrec_write on public.attendance_records for all
  using (exists (select 1 from attendance_sessions s where s.id = session_id
    and (can_manage_groups(s.org_id) or (s.context_type = 'group' and leads_group(s.context_id)))))
  with check (exists (select 1 from attendance_sessions s where s.id = session_id
    and (can_manage_groups(s.org_id) or (s.context_type = 'group' and leads_group(s.context_id)))));

-- 5. Líder enxerga a ficha (sem documentos, que seguem só members.manage) dos membros das células dele
drop policy if exists sticks_read on public.sticks;
create policy sticks_read on public.sticks for select
  using (is_org_staff(org_id) or user_id = auth.uid()
    or exists (select 1 from group_members gm where gm.stick_id = sticks.id and gm.left_at is null and leads_group(gm.group_id))
    or exists (select 1 from groups g where g.supervisor_stick_id = sticks.id and leads_group(g.id)));
