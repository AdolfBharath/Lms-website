begin;

create or replace function public.lms_enroll_student(target_user_id uuid, target_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment public.user_courses%rowtype;
  course public.courses%rowtype;
begin
  if target_user_id is null or target_course_id is null then
    raise exception 'Student and course are required' using errcode = '22023';
  end if;

  if target_user_id <> public.lms_current_user_id() and not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into course from public.courses where id = target_course_id;
  if course.id is null or (not public.lms_is_admin() and lower(coalesce(course.status, '')) not in ('published', 'active')) then
    raise exception 'Course is not available' using errcode = '42501';
  end if;

  select * into enrollment
  from public.user_courses
  where coalesce(user_id, student_id, learner_id) = target_user_id
    and course_id = target_course_id
  order by case when coalesce(status, '') in ('archived', 'removed') then 1 else 0 end, created_at desc nulls last
  limit 1;

  if enrollment.id is not null then
    update public.user_courses
       set status = 'active',
           deleted_at = null
     where id = enrollment.id
     returning * into enrollment;
    return to_jsonb(enrollment);
  end if;

  begin
    insert into public.user_courses (user_id, student_id, learner_id, course_id, status, created_at)
    values (target_user_id, target_user_id, target_user_id, target_course_id, 'active', now())
    returning * into enrollment;
  exception
    when unique_violation then
      select * into enrollment
      from public.user_courses
      where coalesce(user_id, student_id, learner_id) = target_user_id
        and course_id = target_course_id
      limit 1;

      if enrollment.id is not null then
        update public.user_courses
           set status = 'active',
               deleted_at = null
         where id = enrollment.id
         returning * into enrollment;
      else
        raise;
      end if;
  end;

  return to_jsonb(enrollment);
end;
$$;

grant execute on function public.lms_enroll_student(uuid, uuid) to authenticated;

commit;
