create extension if not exists pgcrypto;

create table if not exists public.housekeeper_users (
  id uuid primary key default extensions.gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.housekeeper_sessions (
  token_hash text primary key,
  user_id uuid not null references public.housekeeper_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.housekeeper_states (
  user_id uuid,
  household_id text,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.housekeeper_states
add column if not exists household_id text;

-- This app is for one household. All member accounts share this single state row.
update public.housekeeper_states
set household_id = 'default-home'
where household_id is null;

with latest_state as (
  select ctid
  from public.housekeeper_states
  order by updated_at desc
  limit 1
)
delete from public.housekeeper_states
where ctid not in (select ctid from latest_state);

-- Earlier email-auth versions pointed this foreign key at auth.users.
-- Recreate it so custom HouseKeeper accounts can save state.
alter table public.housekeeper_states
drop constraint if exists housekeeper_states_user_id_fkey;

alter table public.housekeeper_states
drop constraint if exists housekeeper_states_pkey;

alter table public.housekeeper_states
alter column user_id drop not null;

update public.housekeeper_states
set user_id = null,
    household_id = 'default-home';

alter table public.housekeeper_states
alter column household_id set not null;

alter table public.housekeeper_states
add primary key (household_id);

alter table public.housekeeper_states
add constraint housekeeper_states_user_id_fkey
foreign key (user_id)
references public.housekeeper_users(id)
on delete cascade;

alter table public.housekeeper_users enable row level security;
alter table public.housekeeper_sessions enable row level security;
alter table public.housekeeper_states enable row level security;

create or replace function public.hk_session_user_id(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.housekeeper_sessions
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and expires_at > now();

  if v_user_id is null then
    raise exception '登录已失效，请重新登录';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.hk_register(
  p_username text,
  p_password text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user public.housekeeper_users%rowtype;
  v_token text;
begin
  p_username := lower(trim(p_username));

  if length(p_username) < 3 then
    raise exception '账号至少需要 3 个字符';
  end if;

  if length(p_password) < 6 then
    raise exception '密码至少需要 6 位';
  end if;

  insert into public.housekeeper_users (username, password_hash, display_name)
  values (
    p_username,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    coalesce(nullif(trim(p_display_name), ''), p_username)
  )
  returning * into v_user;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.housekeeper_sessions (token_hash, user_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user.id, now() + interval '90 days');

  return jsonb_build_object(
    'token', v_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'display_name', v_user.display_name
    )
  );
exception
  when unique_violation then
    raise exception '这个账号已存在，请直接登录';
end;
$$;

create or replace function public.hk_login(p_username text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user public.housekeeper_users%rowtype;
  v_token text;
begin
  p_username := lower(trim(p_username));

  select * into v_user
  from public.housekeeper_users
  where username = p_username;

  if v_user.id is null or v_user.password_hash <> extensions.crypt(p_password, v_user.password_hash) then
    raise exception '账号或密码不正确';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.housekeeper_sessions (token_hash, user_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user.id, now() + interval '90 days');

  return jsonb_build_object(
    'token', v_token,
    'user', jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'display_name', v_user.display_name
    )
  );
end;
$$;

create or replace function public.hk_get_state(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_data jsonb;
begin
  perform public.hk_session_user_id(p_token);

  select data into v_data
  from public.housekeeper_states
  where household_id = 'default-home';

  return v_data;
end;
$$;

create or replace function public.hk_save_state(p_token text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.hk_session_user_id(p_token);

  insert into public.housekeeper_states (household_id, data, updated_at)
  values ('default-home', p_data, now())
  on conflict (household_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.hk_list_accounts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_accounts jsonb;
begin
  perform public.hk_session_user_id(p_token);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'username', username,
        'display_name', display_name,
        'created_at', created_at
      )
      order by created_at asc
    ),
    '[]'::jsonb
  )
  into v_accounts
  from public.housekeeper_users;

  return v_accounts;
end;
$$;

create or replace function public.hk_delete_account(p_token text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public.hk_session_user_id(p_token);

  delete from public.housekeeper_users
  where id = p_user_id;
end;
$$;

revoke all on public.housekeeper_users from anon, authenticated;
revoke all on public.housekeeper_sessions from anon, authenticated;
revoke all on public.housekeeper_states from anon, authenticated;

grant execute on function public.hk_register(text, text, text) to anon, authenticated;
grant execute on function public.hk_login(text, text) to anon, authenticated;
grant execute on function public.hk_get_state(text) to anon, authenticated;
grant execute on function public.hk_save_state(text, jsonb) to anon, authenticated;
grant execute on function public.hk_list_accounts(text) to anon, authenticated;
grant execute on function public.hk_delete_account(text, uuid) to anon, authenticated;
