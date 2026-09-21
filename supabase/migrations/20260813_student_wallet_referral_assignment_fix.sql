-- Student wallet/referral summary and multi-enrollment task submission repair.

create or replace function public.lms_student_wallet_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  code text;
  referral_total integer := 0;
begin
  select * into profile
  from public.users
  where (auth_user_id = (select auth.uid()) or id = (select auth.uid()))
    and lower(trim(coalesce(role, 'student'))) = 'student'
    and deleted_at is null
    and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked');
  if not found then
    raise exception 'Student profile not found.' using errcode = '42501';
  end if;
  code := upper(coalesce(nullif(trim(profile.referral_key), ''), nullif(trim(profile.referral), ''), 'JNV-' || right(regexp_replace(coalesce(profile.id::text, profile.email, ''), '[^a-zA-Z0-9]', '', 'g'), 8)));
  if to_regclass('public.form_student_registrations') is not null then
    execute 'select count(*)::integer from public.form_student_registrations where upper(coalesce(reference_id, '''')) = $1' into referral_total using code;
  end if;
  return jsonb_build_object('student_id', profile.id, 'coins', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)), 'referral_key', code, 'referral_code', code, 'referral_count', referral_total, 'successful_referrals', referral_total, 'referral_coins_earned', referral_total * 50);
end;
$$;

drop function if exists public.lms_submit_task_once(uuid, uuid, text);
create or replace function public.lms_submit_task_once(target_task_id uuid, target_student_id uuid, submission_drive_link text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_submission_id uuid;
  task_row public.batch_tasks%rowtype;
  student_row public.users%rowtype;
  first_submission boolean;
  reward_amount integer := 10;
begin
  select * into student_row from public.users where id = target_student_id and (auth_user_id = (select auth.uid()) or id = (select auth.uid())) and lower(trim(coalesce(role, 'student'))) = 'student' and deleted_at is null and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked');
  if not found then raise exception 'The requested student does not match the logged-in user.' using errcode = '42501'; end if;
  if nullif(trim(coalesce(submission_drive_link, '')), '') is null then raise exception 'Submission link or uploaded file is required.'; end if;
  select * into task_row from public.batch_tasks where id = target_task_id and coalesce(status, 'active') not in ('archived', 'deleted');
  if not found then raise exception 'Task not found.'; end if;
  if not (
    task_row.batch_id is null
    or task_row.batch_id = student_row.batch_id
    or exists (select 1 from public.user_courses uc where coalesce(uc.user_id, uc.student_id, uc.learner_id) = student_row.id and uc.course_id = task_row.course_id and (uc.batch_id is null or uc.batch_id = task_row.batch_id) and uc.deleted_at is null and coalesce(uc.status, 'active') not in ('archived', 'removed', 'cancelled'))
  ) then raise exception 'Task is not assigned to this student.' using errcode = '42501'; end if;
  select not exists (select 1 from public.task_submissions where task_id = target_task_id and coalesce(student_id, user_id) = target_student_id and deleted_at is null) into first_submission;
  insert into public.task_submissions (task_id, student_id, user_id, batch_id, course_id, drive_link, file_url, status, submitted_at, created_at)
  values (target_task_id, target_student_id, target_student_id, task_row.batch_id, task_row.course_id, submission_drive_link, submission_drive_link, case when first_submission then 'submitted' else 'resubmitted' end, now(), now())
  returning id into new_submission_id;
  if first_submission then update public.users set coins = coalesce(coins, 0) + reward_amount where id = target_student_id; else reward_amount := 0; end if;
  return jsonb_build_object('submission_id', new_submission_id, 'first_submission', first_submission, 'reward_amount', reward_amount);
end;
$$;

revoke all on function public.lms_student_wallet_summary() from public;
revoke all on function public.lms_submit_task_once(uuid, uuid, text) from public;
grant execute on function public.lms_student_wallet_summary() to authenticated;
grant execute on function public.lms_submit_task_once(uuid, uuid, text) to authenticated;
