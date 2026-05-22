-- Admin manual/bulk user import support for the static legacy-login LMS.
-- Run this in Supabase Dashboard > SQL Editor as the project owner.
-- It lets an admin profile in public.users create/update LMS users and
-- optionally assign them to a course/batch without granting broad insert
-- permissions to the browser anon role.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to anon, authenticated;
grant usage on schema public to anon, authenticated;

alter table public.users add column if not exists password text;
alter table public.users add column if not exists course_ids jsonb default '[]'::jsonb;

create or replace function private.lms_admin_save_user(
  admin_user_id uuid,
  target_user_id uuid,
  user_payload jsonb,
  assign_course_id uuid default null,
  assign_batch_id uuid default null
)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  username text,
  phone text,
  batch_id uuid,
  course_ids jsonb,
  coins integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $admin_user_import_fn$
declare
  admin_profile public.users%rowtype;
  existing_user public.users%rowtype;
  saved_user public.users%rowtype;
  clean_email text := lower(nullif(trim(user_payload ->> 'email'), ''));
  clean_role text := lower(coalesce(nullif(trim(user_payload ->> 'role'), ''), 'student'));
  next_course_ids jsonb := '[]'::jsonb;
  has_enrollment_status boolean := false;
begin
  select *
  into admin_profile
  from public.users
  where id = admin_user_id
    and lower(role) = 'admin'
  limit 1;

  if not found then
    raise exception 'Only admins can save users.' using errcode = '42501';
  end if;

  if clean_role not in ('student', 'mentor', 'admin') then
    raise exception 'Role must be student, mentor, or admin.' using errcode = '22023';
  end if;

  if target_user_id is not null then
    select *
    into existing_user
    from public.users
    where id = target_user_id;
  elsif clean_email is not null then
    select *
    into existing_user
    from public.users
    where lower(email) = clean_email
    limit 1;
  end if;

  if existing_user.id is not null then
    next_course_ids := coalesce(existing_user.course_ids, '[]'::jsonb);
  elsif user_payload ? 'course_ids' then
    next_course_ids := coalesce(user_payload -> 'course_ids', '[]'::jsonb);
  end if;

  if assign_course_id is not null and not exists (
    select 1
    from jsonb_array_elements_text(next_course_ids) course_id(value)
    where course_id.value = assign_course_id::text
  ) then
    next_course_ids := next_course_ids || to_jsonb(assign_course_id::text);
  end if;

  if existing_user.id is not null then
    update public.users
    set
      name = coalesce(nullif(trim(user_payload ->> 'name'), ''), existing_user.name),
      email = coalesce(clean_email, existing_user.email),
      password = coalesce(nullif(user_payload ->> 'password', ''), existing_user.password),
      role = clean_role,
      username = coalesce(nullif(trim(user_payload ->> 'username'), ''), existing_user.username),
      phone = coalesce(nullif(trim(user_payload ->> 'phone'), ''), existing_user.phone),
      batch_id = coalesce(assign_batch_id, nullif(user_payload ->> 'batch_id', '')::uuid, existing_user.batch_id),
      coins = coalesce(nullif(user_payload ->> 'coins', '')::integer, existing_user.coins, 0),
      course_ids = next_course_ids
    where id = existing_user.id
    returning * into saved_user;
  else
    if clean_email is null then
      raise exception 'Email is required.' using errcode = '22023';
    end if;

    insert into public.users (
      name,
      email,
      password,
      role,
      username,
      phone,
      batch_id,
      coins,
      course_ids
    )
    values (
      coalesce(nullif(trim(user_payload ->> 'name'), ''), clean_email),
      clean_email,
      coalesce(nullif(user_payload ->> 'password', ''), '123456'),
      clean_role,
      nullif(trim(user_payload ->> 'username'), ''),
      nullif(trim(user_payload ->> 'phone'), ''),
      coalesce(assign_batch_id, nullif(user_payload ->> 'batch_id', '')::uuid),
      coalesce(nullif(user_payload ->> 'coins', '')::integer, 0),
      next_course_ids
    )
    returning * into saved_user;
  end if;

  if assign_course_id is not null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_courses'
        and column_name = 'status'
    )
    into has_enrollment_status;

    if exists (
      select 1
      from public.user_courses
      where user_id = saved_user.id
        and course_id = assign_course_id
    ) then
      if has_enrollment_status then
        update public.user_courses
        set status = 'active'
        where user_id = saved_user.id
          and course_id = assign_course_id;
      end if;
    else
      if has_enrollment_status then
        insert into public.user_courses (user_id, course_id, status)
        values (saved_user.id, assign_course_id, 'active');
      else
        insert into public.user_courses (user_id, course_id)
        values (saved_user.id, assign_course_id);
      end if;
    end if;
  end if;

  return query
  select
    saved_user.id,
    saved_user.name,
    saved_user.email,
    saved_user.role,
    saved_user.username,
    saved_user.phone,
    saved_user.batch_id,
    saved_user.course_ids,
    saved_user.coins,
    saved_user.created_at;
end;
$admin_user_import_fn$;

create or replace function public.lms_admin_save_user(
  admin_user_id uuid,
  target_user_id uuid,
  user_payload jsonb,
  assign_course_id uuid default null,
  assign_batch_id uuid default null
)
returns table (
  id uuid,
  name text,
  email text,
  role text,
  username text,
  phone text,
  batch_id uuid,
  course_ids jsonb,
  coins integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
as $admin_user_import_public_fn$
  select *
  from private.lms_admin_save_user(
    admin_user_id,
    target_user_id,
    user_payload,
    assign_course_id,
    assign_batch_id
  );
$admin_user_import_public_fn$;

revoke all on function private.lms_admin_save_user(uuid, uuid, jsonb, uuid, uuid) from public;
revoke all on function public.lms_admin_save_user(uuid, uuid, jsonb, uuid, uuid) from public;
grant execute on function private.lms_admin_save_user(uuid, uuid, jsonb, uuid, uuid) to anon, authenticated;
grant execute on function public.lms_admin_save_user(uuid, uuid, jsonb, uuid, uuid) to anon, authenticated;

create or replace function private.lms_admin_delete_user(
  admin_user_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $admin_user_delete_fn$
begin
  if admin_user_id is null or target_user_id is null then
    raise exception 'Admin and target user are required.' using errcode = '22023';
  end if;

  if admin_user_id = target_user_id then
    raise exception 'Admins cannot delete their own profile from this panel.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.users
    where id = admin_user_id
      and lower(role) = 'admin'
  ) then
    raise exception 'Only admins can delete users.' using errcode = '42501';
  end if;

  if to_regclass('public.user_courses') is not null then
    execute 'delete from public.user_courses where user_id = $1' using target_user_id;
  end if;

  if to_regclass('public.student_course_progress') is not null then
    execute 'delete from public.student_course_progress where student_id = $1' using target_user_id;
  end if;

  if to_regclass('public.student_quiz_attempts') is not null then
    execute 'delete from public.student_quiz_attempts where student_id = $1' using target_user_id;
  end if;

  if to_regclass('public.student_extra_marks') is not null then
    execute 'delete from public.student_extra_marks where student_id = $1 or mentor_id = $1' using target_user_id;
  end if;

  delete from public.users
  where id = target_user_id;
end;
$admin_user_delete_fn$;

create or replace function public.lms_admin_delete_user(
  admin_user_id uuid,
  target_user_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $admin_user_delete_public_fn$
  select private.lms_admin_delete_user(admin_user_id, target_user_id);
$admin_user_delete_public_fn$;

revoke all on function private.lms_admin_delete_user(uuid, uuid) from public;
revoke all on function public.lms_admin_delete_user(uuid, uuid) from public;
grant execute on function private.lms_admin_delete_user(uuid, uuid) to anon, authenticated;
grant execute on function public.lms_admin_delete_user(uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
