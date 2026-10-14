-- m73 Formulários (spec 19): formulários da igreja com link público, respostas que viram Pessoas.
-- Permissão forms.manage. Nome e telefone vêm sempre fora da lista de perguntas.
-- Reverter: drop function submit_form, form_public; drop table form_responses, forms.

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  intro text not null default '' check (length(intro) <= 600),
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  open boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists forms_org_idx on public.forms (org_id);

create table if not exists public.form_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  phone text check (length(phone) <= 30),
  answers jsonb not null default '{}'::jsonb,
  stick_id uuid references public.sticks(id) on delete set null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists form_responses_form_idx on public.form_responses (form_id, created_at desc);
create index if not exists form_responses_org_idx on public.form_responses (org_id);

alter table public.forms enable row level security;
alter table public.form_responses enable row level security;

create policy forms_all on public.forms for all to authenticated
  using (has_perm(org_id, 'forms.manage')) with check (has_perm(org_id, 'forms.manage'));
create policy form_responses_all on public.form_responses for all to authenticated
  using (has_perm(org_id, 'forms.manage')) with check (has_perm(org_id, 'forms.manage'));

-- Página pública: só o necessário, e só com o formulário aberto.
create or replace function public.form_public(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('church', o.name, 'title', f.title, 'intro', f.intro, 'fields', f.fields)
  from forms f join organizations o on o.id = f.org_id
  where coalesce(length(p_token), 0) >= 16 and f.token = p_token and f.open;
$$;

-- Envio público: valida tudo no banco (a tela é só conveniência).
create or replace function public.submit_form(p_token text, p_name text, p_phone text, p_answers jsonb)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_form forms%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_in jsonb := coalesce(p_answers, '{}'::jsonb);
  v_out jsonb := '{}'::jsonb;
  f jsonb;
  v jsonb;
  t text;
  opts jsonb;
  item jsonb;
begin
  if coalesce(length(p_token), 0) < 16 then return false; end if;
  select * into v_form from forms where token = p_token and open;
  if not found then return false; end if;
  if v_name = '' or length(v_name) > 80 or length(coalesce(v_phone, '')) > 30 or jsonb_typeof(v_in) <> 'object' then
    raise exception 'resposta inválida';
  end if;
  if (select count(*) from form_responses where form_id = v_form.id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'muitas respostas agora';
  end if;

  for f in select * from jsonb_array_elements(v_form.fields) loop
    v := v_in -> (f ->> 'id');
    t := f ->> 'type';
    opts := coalesce(f -> 'options', '[]'::jsonb);
    if t = 'multi' then
      if v is null or jsonb_typeof(v) <> 'array' then v := '[]'::jsonb; end if;
      for item in select * from jsonb_array_elements(v) loop
        if not opts @> jsonb_build_array(item) then raise exception 'opção inválida'; end if;
      end loop;
      if jsonb_array_length(v) = 0 then v := null; end if;
    else
      if v is not null and jsonb_typeof(v) <> 'string' then raise exception 'resposta inválida'; end if;
      if v is not null and btrim(v #>> '{}') = '' then v := null; end if;
      if v is not null then
        if length(v #>> '{}') > 2000 then raise exception 'resposta longa demais'; end if;
        if t = 'choice' and not opts @> jsonb_build_array(v) then raise exception 'opção inválida'; end if;
        if t = 'date' and (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data inválida'; end if;
        v := to_jsonb(btrim(v #>> '{}'));
      end if;
    end if;
    if v is null then
      if coalesce((f ->> 'required')::boolean, false) then raise exception 'falta responder'; end if;
    else
      v_out := v_out || jsonb_build_object(f ->> 'id', v);
    end if;
  end loop;

  insert into form_responses (form_id, org_id, name, phone, answers)
  values (v_form.id, v_form.org_id, v_name, v_phone, v_out);
  return true;
end;
$$;

revoke execute on function public.form_public(text) from public;
revoke execute on function public.submit_form(text, text, text, jsonb) from public;
grant execute on function public.form_public(text) to anon, authenticated;
grant execute on function public.submit_form(text, text, text, jsonb) to anon, authenticated;
