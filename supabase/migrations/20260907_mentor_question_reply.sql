begin;

create or replace function public.lms_mentor_reply_student_question(
  actor_user_id uuid,
  target_question_id uuid,
  reply_text text,
  reply_status text default 'answered'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  question public.projects%rowtype;
begin
  if actor_user_id <> public.lms_current_user_id() or public.lms_current_role() <> 'mentor' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if length(trim(coalesce(reply_text, ''))) < 2 or length(trim(coalesce(reply_text, ''))) > 5000 then
    raise exception 'Invalid reply' using errcode = '22023';
  end if;
  select * into question
  from public.projects p
  where p.id = target_question_id
    and coalesce(lower(p.type), 'question') = 'question'
    and (
      public.lms_is_assigned_student(coalesce(p.student_id, p.user_id))
      or public.lms_is_mentor_for_batch(p.batch_id)
      or exists (
        select 1 from public.user_courses uc
        where coalesce(uc.user_id, uc.student_id, uc.learner_id) = actor_user_id
          and uc.course_id = p.course_id
          and uc.deleted_at is null
          and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed', 'disabled')
      )
    )
  limit 1;
  if question.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.projects
  set status = case when lower(coalesce(reply_status, 'answered')) in ('pending', 'answered') then lower(reply_status) else 'answered' end,
      review_notes = trim(reply_text),
      feedback = trim(reply_text),
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      updated_at = now()
  where id = target_question_id
  returning * into question;

  return to_jsonb(question);
end;
$$;

revoke all on function public.lms_mentor_reply_student_question(uuid, uuid, text, text) from public;
grant execute on function public.lms_mentor_reply_student_question(uuid, uuid, text, text) to authenticated;

commit;
