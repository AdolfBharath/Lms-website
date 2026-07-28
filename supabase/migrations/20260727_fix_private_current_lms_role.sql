-- Keep private actor role resolution aligned with Auth-backed LMS profiles.
-- Some production RPCs call private.assert_current_actor(), which first
-- resolves the LMS profile id and then checks the role. Resolve the role
-- directly from auth.uid() so profiles linked through users.auth_user_id work
-- reliably inside nested security-definer calls.

create or replace function private.current_lms_role()
returns text
language sql
security definer
set search_path = ''
as $$
  select lower(trim(coalesce(u.role, 'student')))
  from public.users u
  where (u.auth_user_id = (select auth.uid()) or u.id = (select auth.uid()))
    and u.deleted_at is null
    and coalesce(u.status, 'active') not in ('archived', 'disabled', 'blocked')
  limit 1;
$$;

grant execute on function public.lms_submit_task_once(uuid, uuid, text) to authenticated;

create or replace function private.assert_current_actor(actor_user_id uuid, actor_role text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid := private.current_lms_user_id();
  current_role text;
begin
  if current_id is null then
    raise exception 'Login required.' using errcode = '42501';
  end if;

  select lower(coalesce(u.role, 'student'))
    into current_role
  from public.users u
  where u.id = actor_user_id
    and u.deleted_at is null
    and coalesce(u.status, 'active') not in ('archived', 'disabled', 'blocked')
  limit 1;

  if actor_user_id is distinct from current_id then
    raise exception 'The requested user does not match the logged-in user.' using errcode = '42501';
  end if;

  if actor_role is not null and lower(trim(actor_role)) is distinct from current_role then
    raise exception 'The requested role does not match the logged-in user.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.lms_submit_task_once(
  target_task_id uuid,
  target_student_id uuid,
  submission_drive_link text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_submission_id uuid;
  task_row public.batch_tasks%rowtype;
  student_row public.users%rowtype;
  mentor_id uuid;
  admin_id uuid;
  first_submission boolean;
  reward_amount integer := 10;
begin
  select * into student_row
  from public.users
  where id = target_student_id
    and (auth_user_id = (select auth.uid()) or id = (select auth.uid()))
    and lower(trim(coalesce(role, 'student'))) = 'student'
    and deleted_at is null
    and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked');

  if not found then
    raise exception 'The requested student does not match the logged-in user.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(submission_drive_link, '')), '') is null then
    raise exception 'Submission Drive link is required.';
  end if;

  select * into task_row from public.batch_tasks where id = target_task_id;
  if not found then
    raise exception 'Task not found.';
  end if;

  if task_row.batch_id is distinct from student_row.batch_id then
    raise exception 'Task is not assigned to this student.' using errcode = '42501';
  end if;

  select not exists (
    select 1
    from public.task_submissions
    where task_id = target_task_id
      and coalesce(student_id, user_id) = target_student_id
      and deleted_at is null
  ) into first_submission;

  insert into public.task_submissions (
    task_id,
    student_id,
    user_id,
    batch_id,
    course_id,
    drive_link,
    file_url,
    status,
    submitted_at,
    created_at
  )
  values (
    target_task_id,
    target_student_id,
    target_student_id,
    task_row.batch_id,
    task_row.course_id,
    submission_drive_link,
    submission_drive_link,
    case when first_submission then 'submitted' else 'resubmitted' end,
    now(),
    now()
  )
  returning id into new_submission_id;

  if first_submission then
    update public.users
    set coins = coalesce(coins, 0) + reward_amount
    where id = target_student_id;
  else
    reward_amount := 0;
  end if;

  if to_regclass('public.task_submission_notifications') is not null then
    select b.mentor_id into mentor_id
    from public.batches b
    where b.id = task_row.batch_id;

    if mentor_id is not null then
      insert into public.task_submission_notifications (
        submission_id, task_id, student_id, recipient_user_id, recipient_role, title, body
      )
      values (
        new_submission_id, target_task_id, target_student_id, mentor_id, 'mentor',
        'New Task Submission',
        coalesce(student_row.name, student_row.email, 'Student') || ' submitted ' || coalesce(task_row.title, 'a task')
      );
    end if;

    for admin_id in
      select u.id
      from public.users u
      where lower(coalesce(u.role, '')) = 'admin'
        and coalesce(u.status, 'active') <> 'archived'
    loop
      insert into public.task_submission_notifications (
        submission_id, task_id, student_id, recipient_user_id, recipient_role, title, body
      )
      values (
        new_submission_id, target_task_id, target_student_id, admin_id, 'admin',
        'New Task Submission',
        coalesce(student_row.name, student_row.email, 'Student') || ' submitted ' || coalesce(task_row.title, 'a task')
      );
    end loop;
  end if;

  return jsonb_build_object(
    'submission_id', new_submission_id,
    'first_submission', first_submission,
    'reward_amount', reward_amount
  );
end;
$$;

grant execute on function public.lms_submit_task_once(uuid, uuid, text) to authenticated;
