begin;

create extension if not exists pgcrypto;

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
  created_by_role text,
  status text not null default 'published'
    check (status in ('draft', 'published', 'archived')),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
alter table public.announcements enable row level security;

drop policy if exists "Admins manage announcements" on public.announcements;
drop policy if exists "Mentors read relevant announcements" on public.announcements;
drop policy if exists "Mentors manage own announcements" on public.announcements;
drop policy if exists "Students read relevant announcements" on public.announcements;

create policy "Admins manage announcements"
on public.announcements for all to authenticated
using (
  exists (
    select 1
    from public.users u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and lower(u.role) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and lower(u.role) = 'admin'
  )
);

create policy "Mentors read relevant announcements"
on public.announcements for select to authenticated
using (
  announcements.status = 'published'
  and (announcements.expires_at is null or announcements.expires_at >= now())
  and exists (
    select 1
    from public.users mentor
    where lower(mentor.email) = lower(auth.jwt() ->> 'email')
      and lower(mentor.role) = 'mentor'
  )
  and (
    announcements.audience in ('all', 'mentors')
    or announcements.created_by = (select id from public.users where lower(email) = lower(auth.jwt()->>'email') limit 1)
    or exists (
      select 1
      from public.batches b
      where b.id = announcements.batch_id
        and b.mentor_id = (select id from public.users where lower(email) = lower(auth.jwt()->>'email') limit 1)
    )
    or exists (
      select 1
      from public.batches b
      where b.course_id = announcements.course_id
        and b.mentor_id = (select id from public.users where lower(email) = lower(auth.jwt()->>'email') limit 1)
    )
    or exists (
      select 1
      from public.courses c
      join public.users mentor on lower(mentor.email) = lower(auth.jwt() ->> 'email')
      where c.id = announcements.course_id
        and (c.mentor_id = mentor.id or lower(c.instructor_name) = lower(coalesce(mentor.name, mentor.username, mentor.email)))
    )
  )
);

create policy "Mentors manage own announcements"
on public.announcements for all to authenticated
using (
  announcements.created_by = (select id from public.users where lower(email) = lower(auth.jwt()->>'email') and lower(role) = 'mentor' limit 1)
)
with check (
  announcements.created_by = (select id from public.users where lower(email) = lower(auth.jwt()->>'email') and lower(role) = 'mentor' limit 1)
  and announcements.created_by_role = 'mentor'
  and (
    (
      announcements.audience = 'batch'
      and announcements.batch_id is not null
      and announcements.course_id is null
      and exists (
        select 1
        from public.batches b
        where b.id = announcements.batch_id
          and b.mentor_id = announcements.created_by
      )
    )
    or (
      announcements.audience = 'course'
      and announcements.course_id is not null
      and announcements.batch_id is null
      and (
        exists (
          select 1
          from public.batches b
          where b.course_id = announcements.course_id
            and b.mentor_id = announcements.created_by
        )
        or exists (
          select 1
          from public.courses c
          join public.users mentor on mentor.id = announcements.created_by
          where c.id = announcements.course_id
            and (c.mentor_id = mentor.id or lower(c.instructor_name) = lower(coalesce(mentor.name, mentor.username, mentor.email)))
        )
      )
    )
  )
);

create policy "Students read relevant announcements"
on public.announcements for select to authenticated
using (
  announcements.status = 'published'
  and (announcements.expires_at is null or announcements.expires_at >= now())
  and exists (
    select 1
    from public.users student
    where lower(student.email) = lower(auth.jwt() ->> 'email')
      and lower(student.role) = 'student'
  )
  and (
    announcements.audience in ('all', 'students')
    or announcements.batch_id = (select batch_id from public.users where lower(email) = lower(auth.jwt()->>'email') limit 1)
    or exists (
      select 1
      from public.user_courses uc
      join public.users student on student.id = uc.user_id
      where lower(student.email) = lower(auth.jwt()->>'email')
        and uc.course_id = announcements.course_id
    )
    or exists (
      select 1
      from public.batches b
      join public.users student on student.batch_id = b.id
      where lower(student.email) = lower(auth.jwt()->>'email')
        and b.course_id = announcements.course_id
    )
  )
);

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

commit;
