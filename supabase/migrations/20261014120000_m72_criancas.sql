-- m72 Crianças (spec 18): salas com cor e bicho, ficha sensível da criança (alergias, cuidados,
-- quem pode e quem NÃO pode buscar), entradas com código de retirada, permissões kids.view e
-- kids.manage, e a contagem de crianças do culto (service_dates.kids) preenchida pelas entradas.

-- 1. Permissões -----------------------------------------------------------------------------------
create or replace function public.can_kids(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(p_org, 'kids.view') or has_perm(p_org, 'kids.manage');
$$;
create or replace function public.can_manage_kids(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select has_perm(p_org, 'kids.manage');
$$;
revoke execute on function public.can_kids(uuid) from public, anon;
revoke execute on function public.can_manage_kids(uuid) from public, anon;
grant execute on function public.can_kids(uuid) to authenticated;
grant execute on function public.can_manage_kids(uuid) to authenticated;

-- 2. Salas ----------------------------------------------------------------------------------------
create table if not exists public.kids_rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text not null default 'sol' check (color in ('sol', 'coral', 'ceu', 'folha')),
  animal text not null default 'rabbit' check (animal in ('rabbit', 'bird', 'fish', 'turtle', 'squirrel', 'snail', 'cat', 'dog')),
  min_months int not null default 0 check (min_months >= 0),
  max_months int not null default 143 check (max_months >= min_months),
  capacity int check (capacity is null or capacity > 0),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists kids_rooms_org on public.kids_rooms (org_id, position);
alter table public.kids_rooms enable row level security;
drop policy if exists kids_rooms_read on public.kids_rooms;
drop policy if exists kids_rooms_write on public.kids_rooms;
create policy kids_rooms_read on public.kids_rooms for select using (can_kids(org_id));
create policy kids_rooms_write on public.kids_rooms for all using (can_manage_kids(org_id)) with check (can_manage_kids(org_id));

-- 3. Ficha sensível da criança (fora de sticks: só quem cuida das crianças lê) ----------------------
create table if not exists public.kids_profiles (
  stick_id uuid primary key references public.sticks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  allergies text check (length(allergies) <= 300),
  care_notes text check (length(care_notes) <= 1000),
  authorized_pickup text check (length(authorized_pickup) <= 300),
  pickup_blocked text check (length(pickup_blocked) <= 300),
  photo_ok boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.kids_profiles enable row level security;
drop policy if exists kids_profiles_read on public.kids_profiles;
drop policy if exists kids_profiles_write on public.kids_profiles;
create policy kids_profiles_read on public.kids_profiles for select using (can_kids(org_id));
create policy kids_profiles_write on public.kids_profiles for all using (can_manage_kids(org_id)) with check (can_manage_kids(org_id));

-- 4. Entradas e saídas ------------------------------------------------------------------------------
create table if not exists public.kids_checkins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  stick_id uuid not null references public.sticks(id) on delete cascade,
  room_id uuid references public.kids_rooms(id) on delete set null,
  guardian_id uuid references public.sticks(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  date date not null,
  code text not null check (code ~ '^[A-HJKMNP-Z2-9]{4}$'),
  via text not null default 'staff' check (via in ('staff', 'totem')),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid default auth.uid(),
  checked_out_at timestamptz,
  checked_out_by uuid,
  picked_up_by text check (length(picked_up_by) <= 120),
  without_code boolean not null default false
);
create unique index if not exists kids_checkins_one_open on public.kids_checkins (stick_id) where checked_out_at is null;
create index if not exists kids_checkins_org_date on public.kids_checkins (org_id, date);
create index if not exists kids_checkins_code on public.kids_checkins (org_id, date, code) where checked_out_at is null;
alter table public.kids_checkins enable row level security;
drop policy if exists kids_checkins_read on public.kids_checkins;
drop policy if exists kids_checkins_insert on public.kids_checkins;
drop policy if exists kids_checkins_update on public.kids_checkins;
drop policy if exists kids_checkins_delete on public.kids_checkins;
create policy kids_checkins_read on public.kids_checkins for select using (can_kids(org_id));
create policy kids_checkins_insert on public.kids_checkins for insert with check (can_kids(org_id));
-- Saída sem código só para quem gerencia (a action confere de novo).
create policy kids_checkins_update on public.kids_checkins for update
  using (can_kids(org_id)) with check (can_kids(org_id) and (not without_code or can_manage_kids(org_id)));
create policy kids_checkins_delete on public.kids_checkins for delete using (can_kids(org_id));

-- 5. Entrada em lote com o código (o mesmo para os irmãos) ----------------------------------------
-- O aparelho já sorteou um código (mostra na hora); se ele já está em uso hoje, o banco sorteia outro
-- e devolve o que valeu.
create or replace function public.kids_checkin(
  p_org uuid, p_children uuid[], p_rooms uuid[], p_guardian uuid, p_service uuid, p_date date, p_code text, p_via text
) returns text
language plpgsql security invoker set search_path = public as $$
declare
  v_code text := upper(coalesce(p_code, ''));
  v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_tries int := 0;
  i int;
begin
  if not can_kids(p_org) then raise exception 'sem acesso'; end if;
  if coalesce(array_length(p_children, 1), 0) = 0 or array_length(p_children, 1) <> coalesce(array_length(p_rooms, 1), 0) then
    raise exception 'escolha as crianças';
  end if;
  while v_code !~ '^[A-HJKMNP-Z2-9]{4}$'
     or exists (select 1 from kids_checkins where org_id = p_org and date = p_date and code = v_code and checked_out_at is null) loop
    v_tries := v_tries + 1;
    if v_tries > 50 then raise exception 'sem código livre'; end if;
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1); end loop;
  end loop;
  for i in 1..array_length(p_children, 1) loop
    insert into kids_checkins (org_id, stick_id, room_id, guardian_id, service_id, date, code, via)
    values (p_org, p_children[i], p_rooms[i], p_guardian, p_service, p_date, v_code, case when p_via = 'totem' then 'totem' else 'staff' end);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.kids_checkin(uuid, uuid[], uuid[], uuid, uuid, date, text, text) from public, anon;
grant execute on function public.kids_checkin(uuid, uuid[], uuid[], uuid, uuid, date, text, text) to authenticated;

-- 6. Totem: família pelo telefone completo de um responsável ---------------------------------------
-- Devolve só o que o totem mostra (primeiro nome + inicial e nascimento para a sala). Nunca alergias.
create or replace function public.kids_totem_lookup(p_org uuid, p_phone text)
returns table (stick_id uuid, label text, birth_date date, guardian_id uuid)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if not can_kids(p_org) or length(v_digits) < 10 then return; end if;
  return query
  with g as (
    select s.id, hm.household_id
      from sticks s
      join household_members hm on hm.stick_id = s.id and hm.relationship_type in ('head', 'spouse')
     where s.org_id = p_org and not s.archived
       and right(regexp_replace(coalesce(nullif(s.whatsapp, ''), s.phone, ''), '\D', '', 'g'), length(v_digits)) = v_digits
     limit 1
  )
  select c.id,
         split_part(coalesce(nullif(c.preferred_name, ''), c.full_name), ' ', 1)
           || coalesce(' ' || nullif(left(split_part(c.full_name, ' ', 2), 1), '') || '.', ''),
         c.birth_date,
         g.id
    from g
    join household_members hm on hm.household_id = g.household_id and hm.relationship_type = 'child'
    join sticks c on c.id = hm.stick_id and not c.archived
   where c.birth_date is null or c.birth_date > current_date - interval '12 years'
   order by c.birth_date desc nulls last;
end;
$$;
revoke execute on function public.kids_totem_lookup(uuid, text) from public, anon;
grant execute on function public.kids_totem_lookup(uuid, text) to authenticated;

-- 7. Criança nova na recepção (quem faz entrada pode cadastrar sem poder editar Pessoas) -------------
create or replace function public.kids_new_child(
  p_org uuid, p_name text, p_birth date, p_guardian uuid, p_guardian_name text, p_guardian_phone text, p_allergies text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_gname text := btrim(coalesce(p_guardian_name, ''));
  v_guardian uuid := p_guardian;
  v_house uuid;
  v_child uuid;
begin
  if not can_kids(p_org) then raise exception 'sem acesso'; end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'nome inválido'; end if;
  if p_birth is null or p_birth > current_date or p_birth < current_date - interval '13 years' then raise exception 'nascimento inválido'; end if;
  if v_guardian is not null then
    if not exists (select 1 from sticks where id = v_guardian and org_id = p_org) then raise exception 'responsável inválido'; end if;
  else
    if v_gname = '' or length(v_gname) > 120 then raise exception 'nome do responsável inválido'; end if;
    insert into sticks (org_id, full_name, phone, whatsapp, first_visit_date, source)
    values (p_org, v_gname, nullif(btrim(coalesce(p_guardian_phone, '')), ''), nullif(btrim(coalesce(p_guardian_phone, '')), ''), current_date, 'kids')
    returning id into v_guardian;
  end if;

  select household_id into v_house from household_members where stick_id = v_guardian;
  if v_house is null then
    insert into households (org_id, name) values (p_org, 'Família ' || split_part((select full_name from sticks where id = v_guardian), ' ', -1))
    returning id into v_house;
    insert into household_members (household_id, stick_id, relationship_type) values (v_house, v_guardian, 'head');
  end if;

  insert into sticks (org_id, full_name, birth_date, first_visit_date, source)
  values (p_org, v_name, p_birth, current_date, 'kids') returning id into v_child;
  insert into household_members (household_id, stick_id, relationship_type) values (v_house, v_child, 'child');
  insert into kids_profiles (stick_id, org_id, allergies) values (v_child, p_org, nullif(btrim(coalesce(p_allergies, '')), ''));
  return v_child;
end;
$$;
revoke execute on function public.kids_new_child(uuid, text, date, uuid, text, text, text) from public, anon;
grant execute on function public.kids_new_child(uuid, text, date, uuid, text, text, text) to authenticated;

-- 8. Contagem de crianças do culto vem das entradas ---------------------------------------------------
create or replace function public.kids_sync_service_count()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_n int;
begin
  for r in select distinct org_id, service_id, date from (
    select new.org_id, new.service_id, new.date where tg_op <> 'DELETE'
    union all select old.org_id, old.service_id, old.date where tg_op <> 'INSERT'
  ) x where service_id is not null loop
    select count(distinct stick_id) into v_n from kids_checkins where service_id = r.service_id and date = r.date;
    if v_n > 0 then
      insert into service_dates (org_id, service_id, date, kids) values (r.org_id, r.service_id, r.date, v_n)
      on conflict (service_id, date) do update set kids = excluded.kids;
    end if;
  end loop;
  return null;
end;
$$;
drop trigger if exists kids_checkins_count on public.kids_checkins;
create trigger kids_checkins_count after insert or delete on public.kids_checkins
  for each row execute function public.kids_sync_service_count();
