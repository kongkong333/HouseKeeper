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
  user_id uuid primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Earlier email-auth versions pointed this foreign key at auth.users.
-- Recreate it so custom HouseKeeper accounts can save state.
alter table public.housekeeper_states
drop constraint if exists housekeeper_states_user_id_fkey;

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
  v_user_id uuid;
  v_data jsonb;
begin
  v_user_id := public.hk_session_user_id(p_token);

  select data into v_data
  from public.housekeeper_states
  where user_id = v_user_id;

  return v_data;
end;
$$;

create or replace function public.hk_save_state(p_token text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.hk_session_user_id(p_token);

  insert into public.housekeeper_states (user_id, data, updated_at)
  values (v_user_id, p_data, now())
  on conflict (user_id)
  do update set data = excluded.data, updated_at = now();
end;
$$;

revoke all on public.housekeeper_users from anon, authenticated;
revoke all on public.housekeeper_sessions from anon, authenticated;
revoke all on public.housekeeper_states from anon, authenticated;

grant execute on function public.hk_register(text, text, text) to anon, authenticated;
grant execute on function public.hk_login(text, text) to anon, authenticated;
grant execute on function public.hk_get_state(text) to anon, authenticated;
grant execute on function public.hk_save_state(text, jsonb) to anon, authenticated;
