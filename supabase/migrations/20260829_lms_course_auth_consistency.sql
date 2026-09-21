-- Normalize LMS course lifecycle and enforce active-only student visibility.

alter table if exists public.courses
  add column if not exists status text not null default 'active',
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.courses
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

create or replace function public.lms_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists courses_touch_updated_at on public.courses;
create trigger courses_touch_updated_at
before update on public.courses
for each row execute function public.lms_touch_updated_at();

update public.courses
set status = case
  when deleted_at is not null or lower(coalesce(status, '')) in ('deleted', 'archived', 'removed') then 'deleted'
  when lower(coalesce(status, '')) in ('active', 'published', 'live') then 'active'
  else 'draft'
end;

create index if not exists idx_courses_active_catalog
  on public.courses (created_at desc)
  where deleted_at is null and lower(status) = 'active';

create index if not exists idx_courses_lifecycle_admin
  on public.courses (lower(status), deleted_at, created_at desc);

create unique index if not exists users_email_unique_active_lower_idx
  on public.users (lower(trim(email)))
  where email is not null
    and trim(email) <> ''
    and deleted_at is null
    and lower(coalesce(status, 'active')) not in ('deleted', 'archived', 'removed');

create unique index if not exists users_auth_user_unique_idx
  on public.users (auth_user_id)
  where auth_user_id is not null;

drop policy if exists courses_students_published_or_enrolled on public.courses;
drop policy if exists courses_students_active_only on public.courses;
create policy courses_students_active_only on public.courses for select
using (
  public.lms_current_role() = 'student'
  and deleted_at is null
  and lower(coalesce(status, '')) = 'active'
);

create or replace function public.lms_admin_move_course_to_draft(actor_user_id uuid, target_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer := 0;
begin
  if actor_user_id <> public.lms_current_user_id() or not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.courses set status = 'draft', deleted_at = null where id = target_course_id;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'course_id', target_course_id, 'status', 'draft');
end;
$$;

create or replace function public.lms_admin_delete_course(actor_user_id uuid, target_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare updated_count integer := 0;
begin
  if actor_user_id <> public.lms_current_user_id() or not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.courses set status = 'deleted', deleted_at = now() where id = target_course_id;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  update public.batches set status = 'deleted' where course_id = target_course_id;
  update public.batch_tasks set status = 'deleted', deleted_at = now() where course_id = target_course_id;
  update public.announcements set status = 'deleted' where course_id = target_course_id;
  return jsonb_build_object('ok', true, 'course_id', target_course_id, 'status', 'deleted');
end;
$$;

revoke all on function public.lms_admin_move_course_to_draft(uuid, uuid) from public;
revoke all on function public.lms_admin_delete_course(uuid, uuid) from public;
grant execute on function public.lms_admin_move_course_to_draft(uuid, uuid) to authenticated;
grant execute on function public.lms_admin_delete_course(uuid, uuid) to authenticated;
