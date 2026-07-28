-- Versioned workflow RPCs used by the LMS clients.

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
  if target_user_id <> public.lms_current_user_id() and not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into course from public.courses where id = target_course_id;
  if course.id is null or (not public.lms_is_admin() and lower(coalesce(course.status, '')) not in ('published', 'active')) then
    raise exception 'Course is not available' using errcode = '42501';
  end if;
  select * into enrollment from public.user_courses
  where coalesce(user_id, student_id, learner_id) = target_user_id and course_id = target_course_id
  limit 1;
  if enrollment.id is null then
    insert into public.user_courses (user_id, student_id, learner_id, course_id, status, created_at)
    values (target_user_id, target_user_id, target_user_id, target_course_id, 'active', now())
    returning * into enrollment;
  end if;
  return to_jsonb(enrollment);
end;
$$;

create or replace function public.lms_support_create_ticket(
  requester_user_id uuid,
  requester_role text,
  ticket_category text,
  ticket_subject text,
  ticket_message text,
  ticket_attachment_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.support_tickets%rowtype;
begin
  if requester_user_id <> public.lms_current_user_id()
     or lower(requester_role) <> public.lms_current_role() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if length(trim(ticket_subject)) not between 3 and 200 or length(trim(ticket_message)) not between 3 and 5000 then
    raise exception 'Invalid support request' using errcode = '22023';
  end if;
  insert into public.support_tickets (
    user_id, user_role, category, subject, message, attachment_url,
    status, priority, created_at, updated_at
  ) values (
    requester_user_id, lower(requester_role), ticket_category, trim(ticket_subject),
    trim(ticket_message), ticket_attachment_url, 'open', 'normal', now(), now()
  ) returning * into ticket;

  insert into public.support_notifications (
    ticket_id, recipient_user_id, recipient_role, title, body, channel, is_read, created_at
  )
  select ticket.id, u.id, 'admin', 'New Support Ticket',
         'A new ' || lower(requester_role) || ' support ticket was submitted.',
         'in_app', false, now()
  from public.users u
  where lower(u.role) = 'admin' and u.deleted_at is null;
  return to_jsonb(ticket);
end;
$$;

create or replace function public.lms_support_reply(
  actor_user_id uuid,
  actor_role text,
  target_ticket_id uuid,
  reply_message text default '',
  reply_attachment_url text default null,
  next_status text default null,
  next_priority text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket public.support_tickets%rowtype;
begin
  if actor_user_id <> public.lms_current_user_id() or lower(actor_role) <> public.lms_current_role() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into ticket from public.support_tickets where id = target_ticket_id for update;
  if ticket.id is null or (not public.lms_is_admin() and ticket.user_id <> actor_user_id) then
    raise exception 'Ticket not found' using errcode = '42501';
  end if;
  if coalesce(trim(reply_message), '') <> '' or reply_attachment_url is not null then
    insert into public.support_messages (
      ticket_id, sender_id, sender_role, message, attachment_url, is_read, created_at
    ) values (
      ticket.id, actor_user_id, lower(actor_role), coalesce(trim(reply_message), ''),
      reply_attachment_url, false, now()
    );
  end if;
  update public.support_tickets
  set status = case when public.lms_is_admin() then coalesce(next_status, status) else status end,
      priority = case when public.lms_is_admin() then coalesce(next_priority, priority) else priority end,
      updated_at = now()
  where id = ticket.id
  returning * into ticket;
  return to_jsonb(ticket);
end;
$$;

create or replace function public.lms_delete_resolved_support_ticket(target_ticket_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.lms_is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.support_tickets where id = target_ticket_id and lower(status) = 'resolved') then
    raise exception 'Only resolved tickets may be deleted' using errcode = '22023';
  end if;
  delete from public.support_notifications where ticket_id::text = target_ticket_id::text;
  delete from public.support_messages where ticket_id::text = target_ticket_id::text;
  delete from public.support_tickets where id = target_ticket_id;
  return true;
end;
$$;

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
begin
  select * into profile from public.lms_current_profile();
  if profile.id is null or profile.id <> target_user_id or public.lms_current_role() <> 'student' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_courses uc
    where coalesce(uc.user_id, uc.student_id, uc.learner_id) = profile.id
      and uc.course_id = target_course_id
      and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive')
  ) then
    raise exception 'Course enrollment is required' using errcode = '42501';
  end if;
  insert into public.projects (
    student_id, user_id, batch_id, course_id, title, description,
    drive_link, file_url, status, type, created_at
  ) values (
    profile.id, profile.id, profile.batch_id, target_course_id,
    trim(question_title), trim(question_description), question_link, question_link,
    'pending', 'question', now()
  ) returning * into question;
  return to_jsonb(question);
end;
$$;

create or replace function public.lms_soft_delete(actor_user_id uuid, target_table text, target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if actor_user_id <> public.lms_current_user_id() or not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if target_table not in ('users', 'courses', 'batches', 'user_courses', 'shop_items', 'announcements') then
    raise exception 'Unsupported table' using errcode = '22023';
  end if;
  execute format('update public.%I set status = $1, deleted_at = now() where id = $2', target_table)
  using 'archived', target_id;
  return found;
end;
$$;

create or replace function public.lms_restore_record(
  actor_user_id uuid,
  target_table text,
  target_id uuid,
  restored_status text default 'active'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if actor_user_id <> public.lms_current_user_id() or not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if target_table not in ('users', 'courses', 'batches', 'user_courses', 'shop_items', 'announcements') then
    raise exception 'Unsupported table' using errcode = '22023';
  end if;
  execute format('update public.%I set status = $1, deleted_at = null where id = $2', target_table)
  using restored_status, target_id;
  return found;
end;
$$;

create or replace function public.lms_admin_delete_user(admin_user_id uuid, target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if admin_user_id <> public.lms_current_user_id() or not public.lms_is_admin() or target_user_id = admin_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.users set status = 'archived', deleted_at = now() where id = target_user_id;
  return found;
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'public.lms_enroll_student(uuid,uuid)',
    'public.lms_support_create_ticket(uuid,text,text,text,text,text)',
    'public.lms_support_reply(uuid,text,uuid,text,text,text,text)',
    'public.lms_delete_resolved_support_ticket(uuid)',
    'public.lms_submit_student_question(uuid,uuid,text,text,text)',
    'public.lms_soft_delete(uuid,text,uuid)',
    'public.lms_restore_record(uuid,text,uuid,text)',
    'public.lms_admin_delete_user(uuid,uuid)'
  ] loop
    execute 'revoke all on function ' || signature || ' from public';
    execute 'grant execute on function ' || signature || ' to authenticated';
  end loop;
end $$;

commit;
