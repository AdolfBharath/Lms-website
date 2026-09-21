-- Enforce student visibility by actual batch/course assignment.

begin;

create or replace function public.lms_student_has_course(target_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lms_current_role() = 'student'
    and exists (
      select 1
      from public.user_courses uc
      where uc.course_id = target_course_id
        and coalesce(uc.user_id, uc.student_id, uc.learner_id) = public.lms_current_user_id()
        and uc.deleted_at is null
        and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed')
    )
$$;

create or replace function public.lms_student_has_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lms_current_role() = 'student'
    and (
      target_batch_id = (select batch_id from public.lms_current_profile())
      or exists (
        select 1
        from public.user_courses uc
        where uc.batch_id = target_batch_id
          and coalesce(uc.user_id, uc.student_id, uc.learner_id) = public.lms_current_user_id()
          and uc.deleted_at is null
          and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed')
      )
    )
$$;

drop policy if exists courses_students_published_or_enrolled on public.courses;
drop policy if exists courses_students_active_only on public.courses;
create policy courses_students_active_only on public.courses for select
using (
  public.lms_current_role() = 'student'
  and deleted_at is null
  and lower(coalesce(status, '')) = 'active'
);

drop policy if exists batches_student_assigned_read on public.batches;
create policy batches_student_assigned_read on public.batches for select
using (
  public.lms_student_has_batch(id)
  and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed', 'disabled')
);

drop policy if exists users_student_batch_mentor_read on public.users;

drop policy if exists "Strict users read" on public.users;
create policy "Strict users read" on public.users for select
using (
  private.is_lms_admin()
  or id = private.current_lms_user_id()
  or (
    private.is_lms_mentor()
    and (
      batch_id = any(private.mentor_batch_ids())
      or id in (
        select coalesce(uc.user_id, uc.student_id, uc.learner_id)
        from public.user_courses uc
        where uc.course_id = any(private.mentor_course_ids())
      )
    )
  )
);

drop policy if exists batch_tasks_student_batch_read on public.batch_tasks;
create policy batch_tasks_student_batch_read on public.batch_tasks for select
using (public.lms_student_has_batch(batch_id));

drop policy if exists chats_batch_members_all on public.batch_chats;
create policy chats_batch_members_all on public.batch_chats for all
using (
  public.lms_is_mentor_for_batch(batch_id)
  or public.lms_student_has_batch(batch_id)
)
with check (
  user_id = public.lms_current_user_id()
  and (public.lms_is_mentor_for_batch(batch_id) or public.lms_student_has_batch(batch_id))
);

drop policy if exists announcements_role_visible_read on public.announcements;
create policy announcements_role_visible_read on public.announcements for select
using (
  coalesce(lower(status), 'published') in ('published', 'active')
  and (
    lower(coalesce(audience, 'all')) = 'all'
    or lower(coalesce(audience, '')) = public.lms_current_role() || 's'
    or (batch_id is not null and public.lms_student_has_batch(batch_id))
    or (course_id is not null and public.lms_student_has_course(course_id))
  )
);

revoke all on function public.lms_student_has_course(uuid) from public;
revoke all on function public.lms_student_has_batch(uuid) from public;
grant execute on function public.lms_student_has_course(uuid) to authenticated;
grant execute on function public.lms_student_has_batch(uuid) to authenticated;

commit;
