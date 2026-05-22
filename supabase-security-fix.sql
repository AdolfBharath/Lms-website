-- Jenovate LMS Supabase security fix
-- Run this in Supabase Dashboard > SQL Editor with the project owner account.
-- It removes the legacy password column from public reads and protects LMS tables
-- so only real Supabase Auth users can access role-appropriate LMS data.

begin;

create extension if not exists pgcrypto;

-- The web app now uses Supabase Auth. Do not store login passwords in public tables.
alter table public.users drop column if exists password;

-- Private helper used by RLS policies. It reads the admin role from public.users
-- using the authenticated user's email claim.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_lms_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users
    where lower(email) = lower(auth.jwt() ->> 'email')
      and lower(role) = 'admin'
  );
$$;

revoke all on function private.is_lms_admin() from public;
grant execute on function private.is_lms_admin() to authenticated;

create or replace function private.current_lms_user_id()
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id
  from public.users
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

create or replace function private.is_lms_mentor()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users
    where lower(email) = lower(auth.jwt() ->> 'email')
      and lower(role) = 'mentor'
  );
$$;

create or replace function private.is_lms_student()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users
    where lower(email) = lower(auth.jwt() ->> 'email')
      and lower(role) = 'student'
  );
$$;

create or replace function private.mentor_course_ids()
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct course_id), '{}'::uuid[])
  from (
    select c.id as course_id
    from public.courses c
    where c.mentor_id = private.current_lms_user_id()
    union
    select b.course_id
    from public.batches b
    where b.mentor_id = private.current_lms_user_id()
      and b.course_id is not null
    union
    select uc.course_id
    from public.user_courses uc
    where uc.user_id = private.current_lms_user_id()
  ) scoped_courses;
$$;

create or replace function private.mentor_batch_ids()
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from public.batches
  where mentor_id = private.current_lms_user_id()
     or course_id = any(private.mentor_course_ids());
$$;

create or replace function private.mentor_student_ids()
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct student_id), '{}'::uuid[])
  from (
    select u.id as student_id
    from public.users u
    where lower(u.role) = 'student'
      and u.batch_id = any(private.mentor_batch_ids())
    union
    select uc.user_id as student_id
    from public.user_courses uc
    join public.users u on u.id = uc.user_id
    where lower(u.role) = 'student'
      and uc.course_id = any(private.mentor_course_ids())
  ) scoped_students;
$$;

create or replace function private.uuid_from_json(row_data jsonb, key text)
returns uuid
language plpgsql
immutable
as $$
declare
  value text;
begin
  value := nullif(row_data ->> key, '');
  if value is null then
    return null;
  end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.mentor_owns_lms_record(row_data jsonb)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.is_lms_mentor()
    and (
      private.uuid_from_json(row_data, 'id') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'id') = any(private.mentor_course_ids())
      or private.uuid_from_json(row_data, 'id') = any(private.mentor_batch_ids())
      or private.uuid_from_json(row_data, 'id') = any(private.mentor_student_ids())
      or private.uuid_from_json(row_data, 'mentor_id') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'created_by') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'batch_id') = any(private.mentor_batch_ids())
      or private.uuid_from_json(row_data, 'course_id') = any(private.mentor_course_ids())
      or private.uuid_from_json(row_data, 'student_id') = any(private.mentor_student_ids())
      or private.uuid_from_json(row_data, 'user_id') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'user_id') = any(private.mentor_student_ids())
      or private.uuid_from_json(row_data, 'task_id') in (
        select id
        from public.batch_tasks
        where batch_id = any(private.mentor_batch_ids())
      )
    );
$$;

create or replace function private.student_course_ids()
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct course_id), '{}'::uuid[])
  from (
    select uc.course_id
    from public.user_courses uc
    where uc.user_id = private.current_lms_user_id()
    union
    select scp.course_id
    from public.student_course_progress scp
    where scp.student_id = private.current_lms_user_id()
    union
    select b.course_id
    from public.batches b
    join public.users u on u.batch_id = b.id
    where u.id = private.current_lms_user_id()
      and b.course_id is not null
  ) scoped_courses;
$$;

create or replace function private.student_batch_ids()
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from public.batches
  where id = (
    select batch_id
    from public.users
    where id = private.current_lms_user_id()
  )
     or course_id = any(private.student_course_ids());
$$;

create or replace function private.student_visible_user_ids()
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct visible_id), '{}'::uuid[])
  from (
    select private.current_lms_user_id() as visible_id
    union
    select u.id
    from public.users u
    where u.batch_id = any(private.student_batch_ids())
    union
    select b.mentor_id
    from public.batches b
    where b.id = any(private.student_batch_ids())
      and b.mentor_id is not null
    union
    select c.mentor_id
    from public.courses c
    where c.id = any(private.student_course_ids())
      and c.mentor_id is not null
    union
    select u.id
    from public.users u
    where lower(u.role) = 'admin'
  ) visible_users;
$$;

create or replace function private.student_owns_lms_record(row_data jsonb)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.is_lms_student()
    and (
      private.uuid_from_json(row_data, 'id') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'id') = any(private.student_course_ids())
      or private.uuid_from_json(row_data, 'id') = any(private.student_batch_ids())
      or private.uuid_from_json(row_data, 'id') = any(private.student_visible_user_ids())
      or private.uuid_from_json(row_data, 'user_id') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'student_id') = private.current_lms_user_id()
      or private.uuid_from_json(row_data, 'course_id') = any(private.student_course_ids())
      or private.uuid_from_json(row_data, 'batch_id') = any(private.student_batch_ids())
      or private.uuid_from_json(row_data, 'task_id') in (
        select id
        from public.batch_tasks
        where batch_id = any(private.student_batch_ids())
      )
    );
$$;

revoke all on function private.current_lms_user_id() from public;
revoke all on function private.is_lms_mentor() from public;
revoke all on function private.is_lms_student() from public;
revoke all on function private.mentor_course_ids() from public;
revoke all on function private.mentor_batch_ids() from public;
revoke all on function private.mentor_student_ids() from public;
revoke all on function private.uuid_from_json(jsonb, text) from public;
revoke all on function private.mentor_owns_lms_record(jsonb) from public;
revoke all on function private.student_course_ids() from public;
revoke all on function private.student_batch_ids() from public;
revoke all on function private.student_visible_user_ids() from public;
revoke all on function private.student_owns_lms_record(jsonb) from public;

grant execute on function private.current_lms_user_id() to authenticated;
grant execute on function private.is_lms_mentor() to authenticated;
grant execute on function private.is_lms_student() to authenticated;
grant execute on function private.mentor_course_ids() to authenticated;
grant execute on function private.mentor_batch_ids() to authenticated;
grant execute on function private.mentor_student_ids() to authenticated;
grant execute on function private.uuid_from_json(jsonb, text) to authenticated;
grant execute on function private.mentor_owns_lms_record(jsonb) to authenticated;
grant execute on function private.student_course_ids() to authenticated;
grant execute on function private.student_batch_ids() to authenticated;
grant execute on function private.student_visible_user_ids() to authenticated;
grant execute on function private.student_owns_lms_record(jsonb) to authenticated;

-- Protect users first. Admins can manage all users; non-admin users can read/update
-- their own profile row. The dropped password column cannot be returned anymore.
alter table public.users enable row level security;

drop policy if exists "Admins can read all users" on public.users;
drop policy if exists "Users can read own profile" on public.users;
drop policy if exists "Admins can update all users" on public.users;
drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Students can update own profile" on public.users;
drop policy if exists "Admins can insert users" on public.users;
drop policy if exists "Admins can delete users" on public.users;
drop policy if exists "Mentors can read assigned users" on public.users;
drop policy if exists "Mentors can update own profile" on public.users;
drop policy if exists "Students can read visible users" on public.users;

create policy "Admins can read all users"
on public.users
for select
to authenticated
using (private.is_lms_admin());

create policy "Users can read own profile"
on public.users
for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "Mentors can read assigned users"
on public.users
for select
to authenticated
using (private.mentor_owns_lms_record(to_jsonb(users)));

create policy "Students can read visible users"
on public.users
for select
to authenticated
using (private.student_owns_lms_record(to_jsonb(users)));

create policy "Admins can update all users"
on public.users
for update
to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Students can update own profile"
on public.users
for update
to authenticated
using (private.is_lms_student() and id = private.current_lms_user_id())
with check (
  id = private.current_lms_user_id()
  and lower(email) = lower(auth.jwt() ->> 'email')
  and lower(role) = 'student'
);

create policy "Mentors can update own profile"
on public.users
for update
to authenticated
using (private.is_lms_mentor() and id = private.current_lms_user_id())
with check (
  id = private.current_lms_user_id()
  and lower(email) = lower(auth.jwt() ->> 'email')
  and lower(role) = 'mentor'
);

create policy "Admins can insert users"
on public.users
for insert
to authenticated
with check (private.is_lms_admin());

create policy "Admins can delete users"
on public.users
for delete
to authenticated
using (private.is_lms_admin());

-- Admin-side LMS tables. This keeps the admin dashboard dynamic while blocking
-- anonymous public reads through the publishable key.
alter table public.courses enable row level security;
alter table public.batches enable row level security;
alter table public.user_courses enable row level security;
alter table public.student_course_progress enable row level security;
alter table public.shop_items enable row level security;
alter table public.projects enable row level security;
alter table public.batch_tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.batch_chats enable row level security;

alter table public.user_courses
  add column if not exists status text not null default 'active';

alter table public.user_courses
  drop constraint if exists user_courses_status_check;

alter table public.user_courses
  add constraint user_courses_status_check
  check (status in ('active', 'completed', 'paused', 'cancelled'));

revoke all on public.courses from public;
revoke all on public.courses from anon;
revoke all on public.courses from authenticated;
grant select on public.courses to anon;
grant select, insert, update, delete on public.courses to authenticated;

revoke all on public.user_courses from public;
revoke all on public.user_courses from anon;
revoke all on public.user_courses from authenticated;
grant select, insert, update, delete on public.user_courses to authenticated;

create table if not exists public.student_shop_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.shop_items(id) on delete cascade,
  price integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

grant select, insert, update, delete on public.student_shop_purchases to authenticated;
alter table public.student_shop_purchases enable row level security;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text,
  message text not null,
  audience text not null default 'all'
    check (audience in ('all', 'students', 'mentors', 'batch', 'course')),
  priority text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),
  batch_id uuid references public.batches(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_by_role text not null default 'admin'
    check (created_by_role in ('admin', 'mentor')),
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_batch_target_required check (audience <> 'batch' or batch_id is not null),
  constraint announcements_course_target_required check (audience <> 'course' or course_id is not null)
);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon;
revoke all on public.announcements from public;
revoke all on public.announcements from authenticated;
grant select, insert, update, delete on public.announcements to authenticated;

drop policy if exists "Admins manage courses" on public.courses;
drop policy if exists "Admins manage batches" on public.batches;
drop policy if exists "Admins manage user courses" on public.user_courses;
drop policy if exists "Admins manage progress" on public.student_course_progress;
drop policy if exists "Admins manage shop items" on public.shop_items;
drop policy if exists "Admins manage projects" on public.projects;
drop policy if exists "Admins manage batch tasks" on public.batch_tasks;
drop policy if exists "Admins manage task submissions" on public.task_submissions;
drop policy if exists "Admins manage batch chats" on public.batch_chats;
drop policy if exists "Admins manage student shop purchases" on public.student_shop_purchases;
drop policy if exists "Admins manage announcements" on public.announcements;
drop policy if exists allow_all_courses on public.courses;
drop policy if exists allow_all_user_courses on public.user_courses;
drop policy if exists "Mentors read assigned courses" on public.courses;
drop policy if exists "Mentors create own courses" on public.courses;
drop policy if exists "Mentors update assigned courses" on public.courses;
drop policy if exists "Mentors read assigned batches" on public.batches;
drop policy if exists "Mentors update assigned batches" on public.batches;
drop policy if exists "Mentors read assigned user courses" on public.user_courses;
drop policy if exists "Mentors assign user courses" on public.user_courses;
drop policy if exists "Mentors update assigned user courses" on public.user_courses;
drop policy if exists "Mentors read assigned progress" on public.student_course_progress;
drop policy if exists "Mentors read assigned projects" on public.projects;
drop policy if exists "Mentors update assigned projects" on public.projects;
drop policy if exists "Mentors manage assigned batch tasks" on public.batch_tasks;
drop policy if exists "Mentors read assigned task submissions" on public.task_submissions;
drop policy if exists "Mentors update assigned task submissions" on public.task_submissions;
drop policy if exists "Mentors read assigned batch chats" on public.batch_chats;
drop policy if exists "Mentors insert assigned batch chats" on public.batch_chats;
drop policy if exists "Mentors read relevant announcements" on public.announcements;
drop policy if exists "Mentors manage own announcements" on public.announcements;
drop policy if exists "Students read enrolled courses" on public.courses;
drop policy if exists "Students read assigned batches" on public.batches;
drop policy if exists "Students read own user courses" on public.user_courses;
drop policy if exists "Students read own progress" on public.student_course_progress;
drop policy if exists "Students manage own progress" on public.student_course_progress;
drop policy if exists "Students read shop items" on public.shop_items;
drop policy if exists "Students read own projects" on public.projects;
drop policy if exists "Students manage own projects" on public.projects;
drop policy if exists "Students read assigned batch tasks" on public.batch_tasks;
drop policy if exists "Students read own task submissions" on public.task_submissions;
drop policy if exists "Students manage own task submissions" on public.task_submissions;
drop policy if exists "Students read assigned batch chats" on public.batch_chats;
drop policy if exists "Students insert assigned batch chats" on public.batch_chats;
drop policy if exists "Students read own purchases" on public.student_shop_purchases;
drop policy if exists "Students insert own purchases" on public.student_shop_purchases;
drop policy if exists "Students read relevant announcements" on public.announcements;

create policy "Admins manage courses"
on public.courses for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage batches"
on public.batches for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage user courses"
on public.user_courses for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage progress"
on public.student_course_progress for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage shop items"
on public.shop_items for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage projects"
on public.projects for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage batch tasks"
on public.batch_tasks for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage task submissions"
on public.task_submissions for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage batch chats"
on public.batch_chats for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage student shop purchases"
on public.student_shop_purchases for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Admins manage announcements"
on public.announcements for all to authenticated
using (private.is_lms_admin())
with check (private.is_lms_admin());

create policy "Mentors read assigned courses"
on public.courses for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(courses)));

create policy "Mentors create own courses"
on public.courses for insert to authenticated
with check (
  private.is_lms_mentor()
  and mentor_id = private.current_lms_user_id()
);

create policy "Mentors update assigned courses"
on public.courses for update to authenticated
using (private.mentor_owns_lms_record(to_jsonb(courses)))
with check (
  private.is_lms_mentor()
  and mentor_id = private.current_lms_user_id()
);

create policy "Mentors read assigned batches"
on public.batches for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(batches)));

create policy "Mentors update assigned batches"
on public.batches for update to authenticated
using (private.mentor_owns_lms_record(to_jsonb(batches)))
with check (private.mentor_owns_lms_record(to_jsonb(batches)));

create policy "Mentors read assigned user courses"
on public.user_courses for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(user_courses)));

create policy "Mentors assign user courses"
on public.user_courses for insert to authenticated
with check (
  private.is_lms_mentor()
  and course_id = any(private.mentor_course_ids())
  and exists (
    select 1
    from public.users u
    where u.id = user_id
      and lower(u.role) = 'student'
  )
);

create policy "Mentors update assigned user courses"
on public.user_courses for update to authenticated
using (
  private.is_lms_mentor()
  and course_id = any(private.mentor_course_ids())
)
with check (
  private.is_lms_mentor()
  and course_id = any(private.mentor_course_ids())
);

create policy "Mentors read assigned progress"
on public.student_course_progress for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(student_course_progress)));

create policy "Mentors read assigned projects"
on public.projects for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(projects)));

create policy "Mentors update assigned projects"
on public.projects for update to authenticated
using (private.mentor_owns_lms_record(to_jsonb(projects)))
with check (private.mentor_owns_lms_record(to_jsonb(projects)));

create policy "Mentors manage assigned batch tasks"
on public.batch_tasks for all to authenticated
using (private.mentor_owns_lms_record(to_jsonb(batch_tasks)))
with check (private.mentor_owns_lms_record(to_jsonb(batch_tasks)));

create policy "Mentors read assigned task submissions"
on public.task_submissions for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(task_submissions)));

create policy "Mentors update assigned task submissions"
on public.task_submissions for update to authenticated
using (private.mentor_owns_lms_record(to_jsonb(task_submissions)))
with check (private.mentor_owns_lms_record(to_jsonb(task_submissions)));

create policy "Mentors read assigned batch chats"
on public.batch_chats for select to authenticated
using (private.mentor_owns_lms_record(to_jsonb(batch_chats)));

create policy "Mentors insert assigned batch chats"
on public.batch_chats for insert to authenticated
with check (private.mentor_owns_lms_record(to_jsonb(batch_chats)));

create policy "Mentors read relevant announcements"
on public.announcements for select to authenticated
using (
  private.is_lms_mentor()
  and status = 'published'
  and (expires_at is null or expires_at >= now())
  and (
    audience in ('all', 'mentors')
    or private.mentor_owns_lms_record(to_jsonb(announcements))
  )
);

create policy "Mentors manage own announcements"
on public.announcements for all to authenticated
using (
  private.is_lms_mentor()
  and created_by = private.current_lms_user_id()
)
with check (
  private.is_lms_mentor()
  and created_by = private.current_lms_user_id()
  and audience in ('students', 'batch', 'course')
  and (batch_id is null or batch_id = any(private.mentor_batch_ids()))
  and (course_id is null or course_id = any(private.mentor_course_ids()))
);

create policy "Students read enrolled courses"
on public.courses for select to authenticated
using (private.student_owns_lms_record(to_jsonb(courses)));

create policy "Students read assigned batches"
on public.batches for select to authenticated
using (private.student_owns_lms_record(to_jsonb(batches)));

create policy "Students read own user courses"
on public.user_courses for select to authenticated
using (private.student_owns_lms_record(to_jsonb(user_courses)));

create policy "Students read own progress"
on public.student_course_progress for select to authenticated
using (private.student_owns_lms_record(to_jsonb(student_course_progress)));

create policy "Students manage own progress"
on public.student_course_progress for all to authenticated
using (private.student_owns_lms_record(to_jsonb(student_course_progress)))
with check (private.student_owns_lms_record(to_jsonb(student_course_progress)));

create policy "Students read shop items"
on public.shop_items for select to authenticated
using (private.is_lms_student());

create policy "Students read own projects"
on public.projects for select to authenticated
using (private.student_owns_lms_record(to_jsonb(projects)));

create policy "Students manage own projects"
on public.projects for all to authenticated
using (private.student_owns_lms_record(to_jsonb(projects)))
with check (private.student_owns_lms_record(to_jsonb(projects)));

create policy "Students read assigned batch tasks"
on public.batch_tasks for select to authenticated
using (private.student_owns_lms_record(to_jsonb(batch_tasks)));

create policy "Students read own task submissions"
on public.task_submissions for select to authenticated
using (private.student_owns_lms_record(to_jsonb(task_submissions)));

create policy "Students manage own task submissions"
on public.task_submissions for all to authenticated
using (private.student_owns_lms_record(to_jsonb(task_submissions)))
with check (private.student_owns_lms_record(to_jsonb(task_submissions)));

create policy "Students read assigned batch chats"
on public.batch_chats for select to authenticated
using (private.student_owns_lms_record(to_jsonb(batch_chats)));

create policy "Students insert assigned batch chats"
on public.batch_chats for insert to authenticated
with check (private.student_owns_lms_record(to_jsonb(batch_chats)));

create policy "Students read own purchases"
on public.student_shop_purchases for select to authenticated
using (user_id = private.current_lms_user_id());

create policy "Students insert own purchases"
on public.student_shop_purchases for insert to authenticated
with check (user_id = private.current_lms_user_id());

create policy "Students read relevant announcements"
on public.announcements for select to authenticated
using (
  private.is_lms_student()
  and status = 'published'
  and (expires_at is null or expires_at >= now())
  and (
    audience in ('all', 'students')
    or batch_id = any(private.student_batch_ids())
    or course_id = any(private.student_course_ids())
  )
);

-- Compatibility for the legacy/mobile notifications path used by the app.
-- The web dashboard writes to public.announcements, but older clients may still
-- insert notifications without type/target_group.
do $$
begin
  if to_regclass('public.notifications') is not null then
    execute 'alter table public.notifications
      alter column type set default ''announcement'',
      alter column target_group set default ''both'',
      alter column title drop not null';

    execute 'alter table public.notifications enable row level security';
    execute 'revoke all on public.notifications from anon';
    execute 'revoke all on public.notifications from public';
    execute 'revoke all on public.notifications from authenticated';
    execute 'grant select, insert, update, delete on public.notifications to authenticated';

    execute 'drop policy if exists allow_all_notifications on public.notifications';
    execute 'drop policy if exists "Admins manage notifications" on public.notifications';
    execute 'drop policy if exists "Mentors create notifications" on public.notifications';
    execute 'drop policy if exists "Authenticated read relevant notifications" on public.notifications';

    execute 'create policy "Admins manage notifications"
      on public.notifications for all to authenticated
      using (private.is_lms_admin())
      with check (private.is_lms_admin())';

    execute 'create policy "Mentors create notifications"
      on public.notifications for insert to authenticated
      with check (
        private.is_lms_mentor()
        and lower(coalesce(type, ''announcement'')) in (''announcement'', ''notification'', ''message'', ''task'', ''review'', ''general'')
        and lower(coalesce(target_group, ''both'')) in (''both'', ''all'', ''students'', ''student'')
      )';

    execute 'create policy "Authenticated read relevant notifications"
      on public.notifications for select to authenticated
      using (
        private.current_lms_user_id() is not null
        and (
          private.is_lms_admin()
          or lower(coalesce(target_group, ''both'')) in (''both'', ''all'')
          or (private.is_lms_mentor() and lower(coalesce(target_group, '''')) in (''mentor'', ''mentors''))
          or (private.is_lms_student() and lower(coalesce(target_group, '''')) in (''student'', ''students''))
          or sender_id = private.current_lms_user_id()
        )
      )';
  end if;
end $$;

commit;
