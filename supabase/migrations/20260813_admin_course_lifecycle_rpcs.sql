-- Admin-only course lifecycle RPCs for draft/removal workflows.

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
  update public.courses set status = 'Draft', deleted_at = null where id = target_course_id;
  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'course_id', target_course_id, 'status', 'Draft');
end;
$$;

create or replace function public.lms_admin_delete_course(actor_user_id uuid, target_course_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_ids uuid[] := '{}';
  task_ids uuid[] := '{}';
  deleted_course_count integer := 0;
  course_ids_udt text := '';
begin
  if actor_user_id <> public.lms_current_user_id() or not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(array_agg(id), '{}') into batch_ids from public.batches where course_id = target_course_id;
  select coalesce(array_agg(id), '{}') into task_ids from public.batch_tasks where course_id = target_course_id or batch_id = any(batch_ids);

  delete from public.batch_chats where batch_id = any(batch_ids);
  delete from public.task_submissions where course_id = target_course_id or batch_id = any(batch_ids) or task_id = any(task_ids);
  delete from public.student_quiz_attempts where course_id = target_course_id;
  delete from public.student_course_progress where course_id = target_course_id;
  delete from public.projects where course_id = target_course_id;
  delete from public.announcements where course_id = target_course_id or batch_id = any(batch_ids);
  delete from public.batch_tasks where id = any(task_ids) or course_id = target_course_id or batch_id = any(batch_ids);
  delete from public.user_courses where course_id = target_course_id;
  update public.users set batch_id = null where batch_id = any(batch_ids);
  select coalesce(udt_name, '') into course_ids_udt from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'course_ids';
  if course_ids_udt = '_uuid' then
    execute 'update public.users set course_ids = array_remove(course_ids, $1::uuid) where course_ids is not null' using target_course_id;
  elsif course_ids_udt = '_text' then
    execute 'update public.users set course_ids = array_remove(course_ids, $1::text) where course_ids is not null' using target_course_id::text;
  end if;
  delete from public.batches where id = any(batch_ids);
  delete from public.courses where id = target_course_id;
  get diagnostics deleted_course_count = row_count;
  if deleted_course_count = 0 then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'course_id', target_course_id, 'deleted_batches', cardinality(batch_ids), 'deleted_tasks', cardinality(task_ids));
end;
$$;

revoke all on function public.lms_admin_move_course_to_draft(uuid, uuid) from public;
revoke all on function public.lms_admin_delete_course(uuid, uuid) from public;
grant execute on function public.lms_admin_move_course_to_draft(uuid, uuid) to authenticated;
grant execute on function public.lms_admin_delete_course(uuid, uuid) to authenticated;
