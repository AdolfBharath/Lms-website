begin;

create or replace function public.lms_submit_student_question(
  target_user_id uuid,
  target_course_id uuid,
  question_title text,
  question_description text,
  question_link text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  question public.projects%rowtype;
  profile public.users%rowtype;
  valid_batch_id uuid;
begin
  select * into profile from public.lms_current_profile();
  if profile.id is null or profile.id <> target_user_id or public.lms_current_role() <> 'student' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if length(trim(coalesce(question_title, ''))) < 3
    or length(trim(coalesce(question_title, ''))) > 200
    or length(trim(coalesce(question_description, ''))) < 3
    or length(trim(coalesce(question_description, ''))) > 5000 then
    raise exception 'Invalid question details' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.user_courses uc
    where coalesce(uc.user_id, uc.student_id, uc.learner_id) = profile.id
      and uc.course_id = target_course_id
      and uc.deleted_at is null
      and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed', 'disabled')
  ) then
    raise exception 'Course enrollment is required' using errcode = '42501';
  end if;

  select b.id into valid_batch_id
  from public.batches b
  where b.id = profile.batch_id
    and b.course_id = target_course_id
    and b.deleted_at is null
    and coalesce(lower(b.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed', 'disabled')
  limit 1;

  if valid_batch_id is null then
    select b.id into valid_batch_id
    from public.user_courses uc
    join public.batches b on b.id = uc.batch_id
    where coalesce(uc.user_id, uc.student_id, uc.learner_id) = profile.id
      and uc.course_id = target_course_id
      and uc.deleted_at is null
      and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed', 'disabled')
      and b.deleted_at is null
      and coalesce(lower(b.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed', 'disabled')
    limit 1;
  end if;

  insert into public.projects (
    student_id, user_id, batch_id, course_id, title, description,
    drive_link, file_url, status, type, created_at
  ) values (
    profile.id, profile.id, valid_batch_id, target_course_id,
    trim(question_title), trim(question_description), nullif(trim(coalesce(question_link, '')), ''), nullif(trim(coalesce(question_link, '')), ''),
    'pending', 'question', now()
  ) returning * into question;

  return to_jsonb(question);
end;
$$;

revoke all on function public.lms_submit_student_question(uuid, uuid, text, text, text) from public;
grant execute on function public.lms_submit_student_question(uuid, uuid, text, text, text) to authenticated;

commit;
