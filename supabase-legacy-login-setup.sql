-- Legacy users-table login setup for the static LMS web app.
-- Run this in Supabase SQL Editor after backing up the users table.
--
-- Important: because this app is a static frontend and the user requested
-- not to use Supabase Auth, all browser table calls run as the anon role.
-- These grants make the current web app work, but they are not as secure as
-- Supabase Auth + role-based RLS. Do not expose a production LMS this way
-- without moving privileged writes behind Edge Functions or a backend.

begin;

create schema if not exists private;

alter table public.users add column if not exists password text;
alter table public.users enable row level security;

-- Stop exposing the password column through select=* with the anon key.
revoke select on public.users from anon, authenticated;
revoke update on public.users from anon, authenticated;

grant usage on schema public to anon, authenticated;

do $$
declare
  select_cols text;
  update_cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into select_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name <> 'password';

  if select_cols is not null then
    execute format('grant select (%s) on public.users to anon, authenticated', select_cols);
  end if;

  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into update_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name not in ('id', 'email', 'password', 'created_at');

  if update_cols is not null then
    execute format('grant update (%s) on public.users to anon, authenticated', update_cols);
  end if;
end $$;

drop policy if exists "Legacy anon read LMS users" on public.users;
drop policy if exists "Legacy anon update LMS users" on public.users;

create policy "Legacy anon read LMS users"
on public.users for select
to anon, authenticated
using (true);

create policy "Legacy anon update LMS users"
on public.users for update
to anon, authenticated
using (true)
with check (true);

create or replace function private.lms_password_login(login_email text, login_password text)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  username text,
  phone text,
  batch_id uuid,
  course_ids jsonb,
  expertise jsonb,
  coins integer,
  streak_count integer,
  last_active_date text,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    u.id,
    u.name::text,
    u.email::text,
    lower(coalesce(u.role::text, 'student')) as role,
    u.username::text,
    u.phone::text,
    u.batch_id,
    coalesce(to_jsonb(u.course_ids), '[]'::jsonb) as course_ids,
    coalesce(to_jsonb(u.expertise), '[]'::jsonb) as expertise,
    coalesce(u.coins, 0)::integer as coins,
    coalesce(u.streak_count, 0)::integer as streak_count,
    u.last_active_date::text as last_active_date,
    u.created_at
  from public.users u
  where lower(u.email) = lower(trim(login_email))
    and u.password is not null
    and u.password = login_password
  limit 1;
$$;

create or replace function public.lms_password_login(login_email text, login_password text)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  username text,
  phone text,
  batch_id uuid,
  course_ids jsonb,
  expertise jsonb,
  coins integer,
  streak_count integer,
  last_active_date text,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.lms_password_login(login_email, login_password);
$$;

create or replace function private.lms_change_legacy_password(
  login_email text,
  current_password text,
  new_password text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(coalesce(new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  update public.users
  set password = new_password
  where lower(email) = lower(trim(login_email))
    and password = current_password;

  return found;
end;
$$;

create or replace function public.lms_change_legacy_password(
  login_email text,
  current_password text,
  new_password text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.lms_change_legacy_password(login_email, current_password, new_password);
$$;

revoke all on function private.lms_password_login(text, text) from public;
revoke all on function public.lms_password_login(text, text) from public;
revoke all on function private.lms_change_legacy_password(text, text, text) from public;
revoke all on function public.lms_change_legacy_password(text, text, text) from public;

grant usage on schema private to anon, authenticated;
grant execute on function private.lms_password_login(text, text) to anon, authenticated;
grant execute on function public.lms_password_login(text, text) to anon, authenticated;
grant execute on function private.lms_change_legacy_password(text, text, text) to anon, authenticated;
grant execute on function public.lms_change_legacy_password(text, text, text) to anon, authenticated;

-- Tables currently blocked for the browser after removing Supabase Auth.
grant select, insert, update, delete on public.user_courses to anon, authenticated;
alter table public.user_courses enable row level security;
drop policy if exists "Legacy anon app access user courses" on public.user_courses;
create policy "Legacy anon app access user courses"
on public.user_courses for all
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.announcements to anon, authenticated;
alter table public.announcements enable row level security;
drop policy if exists "Legacy anon app access announcements" on public.announcements;
create policy "Legacy anon app access announcements"
on public.announcements for all
to anon, authenticated
using (true)
with check (true);

do $$
begin
  if to_regclass('public.shop_purchases') is not null then
    execute 'grant select, insert, update, delete on public.shop_purchases to anon, authenticated';
    execute 'alter table public.shop_purchases enable row level security';
    execute 'drop policy if exists "Legacy anon app access shop purchases" on public.shop_purchases';
    execute 'create policy "Legacy anon app access shop purchases"
      on public.shop_purchases for all
      to anon, authenticated
      using (true)
      with check (true)';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
