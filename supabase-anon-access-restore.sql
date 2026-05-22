-- ============================================================
-- Jenovate LMS — Legacy Anon Access Restore
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor
-- Purpose: Restores anon/authenticated access to all LMS tables
--   after supabase-security-fix.sql locked them to Supabase Auth only.
-- This matches the legacy login system (sessionStorage + lms_password_login RPC).
-- ============================================================

begin;

-- ============================================================
-- 1. USERS TABLE
-- ============================================================
-- Drop restrictive RLS policies added by security-fix
drop policy if exists "Admins can read all users"            on public.users;
drop policy if exists "Users can read own profile"           on public.users;
drop policy if exists "Admins can update all users"          on public.users;
drop policy if exists "Students can update own profile"      on public.users;
drop policy if exists "Mentors can update own profile"       on public.users;
drop policy if exists "Admins can insert users"              on public.users;
drop policy if exists "Admins can delete users"              on public.users;
drop policy if exists "Mentors can read assigned users"      on public.users;
drop policy if exists "Students can read visible users"      on public.users;
-- Also drop any legacy policies to avoid duplicates
drop policy if exists "Legacy anon read LMS users"          on public.users;
drop policy if exists "Legacy anon update LMS users"        on public.users;

alter table public.users enable row level security;

-- Grant column-level access excluding password
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

create policy "Legacy anon read LMS users"
  on public.users for select
  to anon, authenticated
  using (true);

create policy "Legacy anon update LMS users"
  on public.users for update
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 2. COURSES TABLE
-- ============================================================
drop policy if exists "Admins manage courses"              on public.courses;
drop policy if exists "Mentors read assigned courses"      on public.courses;
drop policy if exists "Mentors create own courses"         on public.courses;
drop policy if exists "Mentors update assigned courses"    on public.courses;
drop policy if exists "Students read enrolled courses"     on public.courses;
drop policy if exists "allow_all_courses"                  on public.courses;
drop policy if exists "Legacy anon app access courses"     on public.courses;

alter table public.courses enable row level security;
grant select, insert, update, delete on public.courses to anon, authenticated;

create policy "Legacy anon app access courses"
  on public.courses for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 3. BATCHES TABLE
-- ============================================================
drop policy if exists "Admins manage batches"             on public.batches;
drop policy if exists "Mentors read assigned batches"     on public.batches;
drop policy if exists "Mentors update assigned batches"   on public.batches;
drop policy if exists "Students read assigned batches"    on public.batches;
drop policy if exists "Legacy anon app access batches"    on public.batches;

alter table public.batches enable row level security;
grant select, insert, update, delete on public.batches to anon, authenticated;

create policy "Legacy anon app access batches"
  on public.batches for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 4. USER_COURSES TABLE
-- ============================================================
drop policy if exists "Admins manage user courses"             on public.user_courses;
drop policy if exists "Mentors read assigned user courses"     on public.user_courses;
drop policy if exists "Mentors assign user courses"            on public.user_courses;
drop policy if exists "Mentors update assigned user courses"   on public.user_courses;
drop policy if exists "Students read own user courses"         on public.user_courses;
drop policy if exists "allow_all_user_courses"                 on public.user_courses;
drop policy if exists "Legacy anon app access user courses"    on public.user_courses;

alter table public.user_courses enable row level security;
grant select, insert, update, delete on public.user_courses to anon, authenticated;

create policy "Legacy anon app access user courses"
  on public.user_courses for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 5. STUDENT_COURSE_PROGRESS TABLE
-- ============================================================
drop policy if exists "Admins manage progress"              on public.student_course_progress;
drop policy if exists "Mentors read assigned progress"      on public.student_course_progress;
drop policy if exists "Students read own progress"          on public.student_course_progress;
drop policy if exists "Students manage own progress"        on public.student_course_progress;
drop policy if exists "Legacy anon app access progress"     on public.student_course_progress;

alter table public.student_course_progress enable row level security;
grant select, insert, update, delete on public.student_course_progress to anon, authenticated;

create policy "Legacy anon app access progress"
  on public.student_course_progress for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 6. SHOP_ITEMS TABLE
-- ============================================================
drop policy if exists "Admins manage shop items"      on public.shop_items;
drop policy if exists "Students read shop items"      on public.shop_items;
drop policy if exists "Legacy anon app access shop items" on public.shop_items;

alter table public.shop_items enable row level security;
grant select, insert, update, delete on public.shop_items to anon, authenticated;

create policy "Legacy anon app access shop items"
  on public.shop_items for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 7. SHOP_PURCHASES TABLE (legacy, may not exist)
-- ============================================================
do $$
begin
  if to_regclass('public.shop_purchases') is not null then
    execute 'drop policy if exists "Legacy anon app access shop purchases" on public.shop_purchases';
    execute 'alter table public.shop_purchases enable row level security';
    execute 'grant select, insert, update, delete on public.shop_purchases to anon, authenticated';
    execute 'create policy "Legacy anon app access shop purchases"
      on public.shop_purchases for all
      to anon, authenticated
      using (true)
      with check (true)';
  end if;
end $$;


-- ============================================================
-- 8. STUDENT_SHOP_PURCHASES TABLE
-- ============================================================
drop policy if exists "Admins manage student shop purchases"  on public.student_shop_purchases;
drop policy if exists "Students read own purchases"           on public.student_shop_purchases;
drop policy if exists "Students insert own purchases"         on public.student_shop_purchases;
drop policy if exists "Legacy anon app access student purchases" on public.student_shop_purchases;

alter table public.student_shop_purchases enable row level security;
grant select, insert, update, delete on public.student_shop_purchases to anon, authenticated;

create policy "Legacy anon app access student purchases"
  on public.student_shop_purchases for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 9. PROJECTS TABLE
-- ============================================================
drop policy if exists "Admins manage projects"        on public.projects;
drop policy if exists "Mentors read assigned projects"  on public.projects;
drop policy if exists "Mentors update assigned projects" on public.projects;
drop policy if exists "Students read own projects"    on public.projects;
drop policy if exists "Students manage own projects"  on public.projects;
drop policy if exists "Legacy anon app access projects" on public.projects;

alter table public.projects enable row level security;
grant select, insert, update, delete on public.projects to anon, authenticated;

create policy "Legacy anon app access projects"
  on public.projects for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 10. BATCH_TASKS TABLE
-- ============================================================
drop policy if exists "Admins manage batch tasks"              on public.batch_tasks;
drop policy if exists "Mentors manage assigned batch tasks"    on public.batch_tasks;
drop policy if exists "Students read assigned batch tasks"     on public.batch_tasks;
drop policy if exists "Legacy anon app access batch tasks"     on public.batch_tasks;

alter table public.batch_tasks enable row level security;
grant select, insert, update, delete on public.batch_tasks to anon, authenticated;

create policy "Legacy anon app access batch tasks"
  on public.batch_tasks for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 11. TASK_SUBMISSIONS TABLE
-- ============================================================
drop policy if exists "Admins manage task submissions"          on public.task_submissions;
drop policy if exists "Mentors read assigned task submissions"  on public.task_submissions;
drop policy if exists "Mentors update assigned task submissions" on public.task_submissions;
drop policy if exists "Students read own task submissions"      on public.task_submissions;
drop policy if exists "Students manage own task submissions"    on public.task_submissions;
drop policy if exists "Legacy anon app access task submissions" on public.task_submissions;

alter table public.task_submissions enable row level security;
grant select, insert, update, delete on public.task_submissions to anon, authenticated;

create policy "Legacy anon app access task submissions"
  on public.task_submissions for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 12. BATCH_CHATS TABLE
-- ============================================================
drop policy if exists "Admins manage batch chats"           on public.batch_chats;
drop policy if exists "Mentors read assigned batch chats"   on public.batch_chats;
drop policy if exists "Mentors insert assigned batch chats" on public.batch_chats;
drop policy if exists "Students read assigned batch chats"  on public.batch_chats;
drop policy if exists "Students insert assigned batch chats" on public.batch_chats;
drop policy if exists "Legacy anon app access batch chats"  on public.batch_chats;

alter table public.batch_chats enable row level security;
grant select, insert, update, delete on public.batch_chats to anon, authenticated;

create policy "Legacy anon app access batch chats"
  on public.batch_chats for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 13. ANNOUNCEMENTS TABLE
-- ============================================================
drop policy if exists "Admins manage announcements"            on public.announcements;
drop policy if exists "Mentors read relevant announcements"    on public.announcements;
drop policy if exists "Mentors manage own announcements"       on public.announcements;
drop policy if exists "Students read relevant announcements"   on public.announcements;
drop policy if exists "Legacy anon app access announcements"   on public.announcements;

alter table public.announcements enable row level security;
grant select, insert, update, delete on public.announcements to anon, authenticated;

create policy "Legacy anon app access announcements"
  on public.announcements for all
  to anon, authenticated
  using (true)
  with check (true);


-- ============================================================
-- 14. STUDENT_QUIZ_ATTEMPTS TABLE (if exists)
-- ============================================================
do $$
begin
  if to_regclass('public.student_quiz_attempts') is not null then
    execute 'grant select, insert, update, delete on public.student_quiz_attempts to anon, authenticated';
    -- Policies already set to using(true) by supabase-quiz-leaderboard-setup.sql
    -- but we re-apply them to be safe
    execute 'drop policy if exists "legacy quiz attempts read"   on public.student_quiz_attempts';
    execute 'drop policy if exists "legacy quiz attempts insert" on public.student_quiz_attempts';
    execute 'drop policy if exists "legacy quiz attempts update" on public.student_quiz_attempts';
    execute 'drop policy if exists "legacy quiz attempts delete" on public.student_quiz_attempts';
    execute 'create policy "legacy quiz attempts read"
      on public.student_quiz_attempts for select
      to anon, authenticated using (true)';
    execute 'create policy "legacy quiz attempts insert"
      on public.student_quiz_attempts for insert
      to anon, authenticated with check (true)';
    execute 'create policy "legacy quiz attempts update"
      on public.student_quiz_attempts for update
      to anon, authenticated using (true) with check (true)';
    execute 'create policy "legacy quiz attempts delete"
      on public.student_quiz_attempts for delete
      to anon, authenticated using (true)';
  end if;
end $$;


-- ============================================================
-- 15. NOTIFICATIONS TABLE (legacy, if exists)
-- ============================================================
do $$
begin
  if to_regclass('public.notifications') is not null then
    execute 'grant select, insert, update, delete on public.notifications to anon, authenticated';
    execute 'drop policy if exists "Admins manage notifications"                 on public.notifications';
    execute 'drop policy if exists "Mentors create notifications"                on public.notifications';
    execute 'drop policy if exists "Authenticated read relevant notifications"   on public.notifications';
    execute 'drop policy if exists "Legacy anon app access notifications"        on public.notifications';
    execute 'create policy "Legacy anon app access notifications"
      on public.notifications for all
      to anon, authenticated
      using (true)
      with check (true)';
  end if;
end $$;


-- ============================================================
-- 16. Ensure schema + RPC grants are correct for legacy login
-- ============================================================
grant usage on schema public to anon, authenticated;

-- lms_password_login must remain callable by anon
grant execute on function public.lms_password_login(text, text) to anon, authenticated;

-- lms_change_legacy_password must remain callable too
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'lms_change_legacy_password'
  ) then
    execute 'grant execute on function public.lms_change_legacy_password(text, text, text) to anon, authenticated';
  end if;
end $$;

-- Reload PostgREST schema cache so all changes take effect immediately
notify pgrst, 'reload schema';

commit;
