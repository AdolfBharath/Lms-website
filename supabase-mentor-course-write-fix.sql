-- Fix mentor course create/edit when the static app uses legacy users-table login.
-- Run this entire file in Supabase Dashboard > SQL Editor, from begin; through commit;.
-- Do not run only the function body, or PostgreSQL will report an unterminated dollar quote.

begin;

create schema if not exists private;
grant usage on schema private to anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace function private.lms_mentor_save_course(
  mentor_user_id uuid,
  course_id uuid,
  course_payload jsonb
)
returns setof public.courses
language plpgsql
security definer
set search_path = ''
as $mentor_course_fn$
declare
  mentor_profile public.users%rowtype;
  existing_course public.courses%rowtype;
  saved_course public.courses%rowtype;
  can_edit boolean := false;
begin
  select *
  into mentor_profile
  from public.users
  where id = mentor_user_id
    and lower(role) = 'mentor'
  limit 1;

  if not found then
    raise exception 'Only mentors can save courses.' using errcode = '42501';
  end if;

  if coalesce(trim(course_payload ->> 'title'), '') = '' then
    raise exception 'Course title is required.' using errcode = '22023';
  end if;

  if course_id is not null then
    select *
    into existing_course
    from public.courses
    where id = course_id;

    if not found then
      raise exception 'Course not found.' using errcode = 'P0002';
    end if;

    can_edit :=
      existing_course.mentor_id = mentor_user_id
      or lower(coalesce(existing_course.instructor_name, '')) in (
        lower(coalesce(mentor_profile.name, '')),
        lower(coalesce(mentor_profile.username, '')),
        lower(coalesce(mentor_profile.email, ''))
      )
      or exists (
        select 1
        from public.batches b
        where b.course_id = existing_course.id
          and b.mentor_id = mentor_user_id
      )
      or exists (
        select 1
        from public.user_courses uc
        where uc.course_id = existing_course.id
          and uc.user_id = mentor_user_id
      );

    if not can_edit then
      raise exception 'This mentor cannot edit this course.' using errcode = '42501';
    end if;

    update public.courses
    set
      title = nullif(course_payload ->> 'title', ''),
      duration = nullif(course_payload ->> 'duration', ''),
      category = nullif(course_payload ->> 'category', ''),
      module_type = nullif(course_payload ->> 'module_type', ''),
      status = coalesce(nullif(course_payload ->> 'status', ''), 'Draft'),
      thumbnail_url = nullif(course_payload ->> 'thumbnail_url', ''),
      description = coalesce(course_payload ->> 'description', ''),
      instructor_name = coalesce(nullif(course_payload ->> 'instructor_name', ''), mentor_profile.name, mentor_profile.username, mentor_profile.email),
      mentor_id = mentor_user_id,
      created_by_admin = false,
      is_my_course = true,
      modules = coalesce(course_payload -> 'modules', '[]'::jsonb)
    where id = course_id
    returning * into saved_course;
  else
    insert into public.courses (
      title,
      duration,
      category,
      module_type,
      status,
      thumbnail_url,
      description,
      instructor_name,
      mentor_id,
      created_by_admin,
      is_my_course,
      modules
    )
    values (
      nullif(course_payload ->> 'title', ''),
      nullif(course_payload ->> 'duration', ''),
      nullif(course_payload ->> 'category', ''),
      nullif(course_payload ->> 'module_type', ''),
      coalesce(nullif(course_payload ->> 'status', ''), 'Draft'),
      nullif(course_payload ->> 'thumbnail_url', ''),
      coalesce(course_payload ->> 'description', ''),
      coalesce(nullif(course_payload ->> 'instructor_name', ''), mentor_profile.name, mentor_profile.username, mentor_profile.email),
      mentor_user_id,
      false,
      true,
      coalesce(course_payload -> 'modules', '[]'::jsonb)
    )
    returning * into saved_course;
  end if;

  return next saved_course;
end;
$mentor_course_fn$;

create or replace function public.lms_mentor_save_course(
  mentor_user_id uuid,
  course_id uuid,
  course_payload jsonb
)
returns setof public.courses
language sql
security invoker
set search_path = ''
as $mentor_course_public_fn$
  select *
  from private.lms_mentor_save_course(mentor_user_id, course_id, course_payload);
$mentor_course_public_fn$;

revoke all on function private.lms_mentor_save_course(uuid, uuid, jsonb) from public;
revoke all on function public.lms_mentor_save_course(uuid, uuid, jsonb) from public;
grant execute on function private.lms_mentor_save_course(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.lms_mentor_save_course(uuid, uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
