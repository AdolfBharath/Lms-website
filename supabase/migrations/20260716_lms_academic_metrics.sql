begin;

alter table public.batch_tasks
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists total_marks numeric(10,2),
  add column if not exists max_marks numeric(10,2),
  add column if not exists published_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.task_submissions
  add column if not exists score numeric(10,2),
  add column if not exists marks_obtained numeric(10,2),
  add column if not exists total_marks numeric(10,2),
  add column if not exists max_marks numeric(10,2),
  add column if not exists is_on_time boolean,
  add column if not exists graded_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.student_quiz_attempts
  add column if not exists deleted_at timestamptz,
  add column if not exists time_taken_seconds integer,
  add column if not exists duration_seconds integer,
  add column if not exists question_count integer,
  add column if not exists selected_question_ids jsonb;

create table if not exists public.student_academic_activity (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  activity_type text not null check (activity_type in ('attendance','live_session','discussion','assignment_on_time','daily_login')),
  points numeric(10,2) not null default 0 check (points >= 0),
  max_points numeric(10,2) not null default 0 check (max_points >= 0),
  occurred_at timestamptz not null default now(),
  activity_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_academic_activity_student_date
  on public.student_academic_activity(student_id, occurred_at desc);
create index if not exists idx_academic_activity_batch_course
  on public.student_academic_activity(batch_id, course_id);
create index if not exists idx_batch_tasks_course_id on public.batch_tasks(course_id);

alter table public.student_academic_activity enable row level security;

drop policy if exists academic_activity_admin_all on public.student_academic_activity;
create policy academic_activity_admin_all on public.student_academic_activity
for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists academic_activity_student_read on public.student_academic_activity;
create policy academic_activity_student_read on public.student_academic_activity
for select using (student_id = public.lms_current_user_id());

drop policy if exists academic_activity_mentor_assigned_all on public.student_academic_activity;
create policy academic_activity_mentor_assigned_all on public.student_academic_activity
for all using (
  exists (
    select 1 from public.batches b
    where b.id = student_academic_activity.batch_id
      and b.mentor_id = public.lms_current_user_id()
  )
) with check (
  exists (
    select 1 from public.batches b
    where b.id = student_academic_activity.batch_id
      and b.mentor_id = public.lms_current_user_id()
  )
);

create or replace function public.lms_record_daily_login_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_active_date is not null
    and new.last_active_date is distinct from old.last_active_date then
    insert into public.student_academic_activity (
      student_id, batch_id, activity_type, points, max_points, occurred_at, activity_key
    ) values (
      new.id,
      new.batch_id,
      'daily_login',
      1,
      1,
      new.last_active_date::timestamp,
      'daily_login:' || new.id::text || ':' || new.last_active_date::text
    ) on conflict (activity_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists lms_record_daily_login_activity on public.users;
create trigger lms_record_daily_login_activity
after update of last_active_date on public.users
for each row execute function public.lms_record_daily_login_activity();

create or replace function public.lms_record_on_time_submission_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.batch_tasks%rowtype;
  submitted_time timestamptz := coalesce(new.submitted_at, new.created_at, now());
begin
  select * into task_row from public.batch_tasks where id = new.task_id;
  new.is_on_time := task_row.deadline is null or submitted_time <= task_row.deadline;

  if new.is_on_time and lower(coalesce(new.status, 'submitted')) in ('submitted','graded','approved','completed','reviewed') then
    insert into public.student_academic_activity (
      student_id, batch_id, course_id, activity_type, points, max_points, occurred_at, activity_key,
      metadata
    ) values (
      coalesce(new.student_id, new.user_id),
      coalesce(new.batch_id, task_row.batch_id),
      coalesce(new.course_id, task_row.course_id),
      'assignment_on_time',
      1,
      1,
      submitted_time,
      'assignment_on_time:' || coalesce(new.student_id, new.user_id)::text || ':' || new.task_id::text,
      jsonb_build_object('task_id', new.task_id)
    ) on conflict (activity_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists lms_set_submission_on_time on public.task_submissions;
create trigger lms_set_submission_on_time
before insert or update of status, submitted_at on public.task_submissions
for each row execute function public.lms_record_on_time_submission_activity();

commit;
