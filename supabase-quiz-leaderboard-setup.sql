-- Quiz attempts and mentor leaderboard support for the static Jenovate LMS.
-- Run this in Supabase Dashboard > SQL Editor, then refresh the app.
-- The module_id column fixes the schema-cache error shown while saving quiz marks.

begin;

create extension if not exists pgcrypto;

create table if not exists public.student_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  module_id text not null default '',
  quiz_id text not null default '',
  score numeric not null default 0,
  max_score numeric not null default 0,
  passed boolean not null default false,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

alter table public.student_quiz_attempts add column if not exists student_id uuid references public.users(id) on delete cascade;
alter table public.student_quiz_attempts add column if not exists course_id uuid references public.courses(id) on delete cascade;
alter table public.student_quiz_attempts add column if not exists module_id text;
alter table public.student_quiz_attempts add column if not exists quiz_id text;
alter table public.student_quiz_attempts add column if not exists score numeric default 0;
alter table public.student_quiz_attempts add column if not exists max_score numeric default 0;
alter table public.student_quiz_attempts add column if not exists passed boolean default false;
alter table public.student_quiz_attempts add column if not exists answers jsonb default '{}'::jsonb;
alter table public.student_quiz_attempts add column if not exists submitted_at timestamptz default now();

create index if not exists student_quiz_attempts_student_course_idx
  on public.student_quiz_attempts (student_id, course_id);

create index if not exists student_quiz_attempts_quiz_idx
  on public.student_quiz_attempts (course_id, module_id, quiz_id);

create table if not exists public.student_extra_marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  mentor_id uuid references public.users(id) on delete set null,
  marks numeric not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.student_extra_marks add column if not exists student_id uuid references public.users(id) on delete cascade;
alter table public.student_extra_marks add column if not exists course_id uuid references public.courses(id) on delete cascade;
alter table public.student_extra_marks add column if not exists mentor_id uuid references public.users(id) on delete set null;
alter table public.student_extra_marks add column if not exists marks numeric default 0;
alter table public.student_extra_marks add column if not exists reason text;
alter table public.student_extra_marks add column if not exists created_at timestamptz default now();
alter table public.student_extra_marks add column if not exists updated_at timestamptz default now();

create unique index if not exists student_extra_marks_unique_mentor_idx
  on public.student_extra_marks (
    student_id,
    course_id,
    coalesce(mentor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

alter table public.student_quiz_attempts enable row level security;
alter table public.student_extra_marks enable row level security;

drop policy if exists "legacy quiz attempts read" on public.student_quiz_attempts;
drop policy if exists "legacy quiz attempts insert" on public.student_quiz_attempts;
drop policy if exists "legacy quiz attempts update" on public.student_quiz_attempts;
drop policy if exists "legacy quiz attempts delete" on public.student_quiz_attempts;

create policy "legacy quiz attempts read"
  on public.student_quiz_attempts for select
  using (true);

create policy "legacy quiz attempts insert"
  on public.student_quiz_attempts for insert
  with check (true);

create policy "legacy quiz attempts update"
  on public.student_quiz_attempts for update
  using (true)
  with check (true);

create policy "legacy quiz attempts delete"
  on public.student_quiz_attempts for delete
  using (true);

drop policy if exists "legacy extra marks read" on public.student_extra_marks;
drop policy if exists "legacy extra marks insert" on public.student_extra_marks;
drop policy if exists "legacy extra marks update" on public.student_extra_marks;
drop policy if exists "legacy extra marks delete" on public.student_extra_marks;

create policy "legacy extra marks read"
  on public.student_extra_marks for select
  using (true);

create policy "legacy extra marks insert"
  on public.student_extra_marks for insert
  with check (true);

create policy "legacy extra marks update"
  on public.student_extra_marks for update
  using (true)
  with check (true);

create policy "legacy extra marks delete"
  on public.student_extra_marks for delete
  using (true);

grant select, insert, update, delete on public.student_quiz_attempts to anon, authenticated;
grant select, insert, update, delete on public.student_extra_marks to anon, authenticated;

notify pgrst, 'reload schema';

commit;
