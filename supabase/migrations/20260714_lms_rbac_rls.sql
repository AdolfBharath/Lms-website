-- Jenovate LMS role-based access control and row-level security.
-- Apply this in Supabase SQL editor after confirming these app tables exist.
-- The policies are additive and preserve the current schema used by the portal.

begin;

create or replace function public.lms_current_profile()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select u
  from public.users u
  where (u.auth_user_id = auth.uid() or u.id = auth.uid())
    and coalesce(lower(u.status), 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
    and u.deleted_at is null
  limit 1
$$;

create or replace function public.lms_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.lms_current_profile()
$$;

create or replace function public.lms_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(role, 'student')) from public.lms_current_profile()
$$;

create or replace function public.lms_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lms_current_role() = 'admin'
$$;

create or replace function public.lms_is_mentor_for_batch(target_batch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.batches b
    where b.id = target_batch_id
      and b.mentor_id = public.lms_current_user_id()
  )
$$;

create or replace function public.lms_is_assigned_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users s
    where s.id = target_student_id
      and lower(coalesce(s.role, 'student')) = 'student'
      and (
        s.batch_id in (select id from public.batches where mentor_id = public.lms_current_user_id())
        or exists (
          select 1
          from public.user_courses uc
          join public.courses c on c.id = uc.course_id
          where coalesce(uc.user_id, uc.student_id, uc.learner_id) = s.id
            and c.mentor_id = public.lms_current_user_id()
            and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive')
        )
      )
  )
$$;

create index if not exists idx_lms_users_auth_user_id on public.users(auth_user_id);
create index if not exists idx_lms_users_role_status on public.users(role, status) where deleted_at is null;
create index if not exists idx_lms_users_batch_id on public.users(batch_id);
create index if not exists idx_lms_courses_mentor_status on public.courses(mentor_id, status);
create index if not exists idx_lms_batches_mentor_id on public.batches(mentor_id);
create index if not exists idx_lms_user_courses_user_id on public.user_courses(user_id);
create index if not exists idx_lms_user_courses_student_id on public.user_courses(student_id);
create index if not exists idx_lms_user_courses_course_id on public.user_courses(course_id);
create index if not exists idx_lms_progress_student_course on public.student_course_progress(student_id, course_id);
create index if not exists idx_lms_tasks_batch_id on public.batch_tasks(batch_id);
create index if not exists idx_lms_submissions_student_id on public.task_submissions(student_id);
create index if not exists idx_lms_submissions_task_id on public.task_submissions(task_id);
create index if not exists idx_lms_chats_batch_id on public.batch_chats(batch_id);
create index if not exists idx_lms_support_tickets_user_id on public.support_tickets(user_id);
create index if not exists idx_lms_support_messages_ticket_id on public.support_messages(ticket_id);
create index if not exists idx_lms_support_notifications_recipient on public.support_notifications(recipient_user_id, recipient_role);

alter table public.users enable row level security;
alter table public.courses enable row level security;
alter table public.batches enable row level security;
alter table public.user_courses enable row level security;
alter table public.student_course_progress enable row level security;
alter table public.batch_tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.projects enable row level security;
alter table public.batch_chats enable row level security;
alter table public.announcements enable row level security;
alter table public.shop_items enable row level security;
alter table public.shop_purchases enable row level security;
alter table public.student_shop_purchases enable row level security;
alter table public.student_quiz_attempts enable row level security;
alter table public.student_extra_marks enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_notifications enable row level security;

drop policy if exists users_admin_all on public.users;
create policy users_admin_all on public.users for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists users_self_read_update on public.users;
create policy users_self_read_update on public.users for all
using (id = public.lms_current_user_id())
with check (id = public.lms_current_user_id());

drop policy if exists users_mentor_assigned_read on public.users;
create policy users_mentor_assigned_read on public.users for select
using (
  public.lms_current_role() = 'mentor'
  and (id = public.lms_current_user_id() or public.lms_is_assigned_student(id))
);

drop policy if exists users_student_batch_mentor_read on public.users;
create policy users_student_batch_mentor_read on public.users for select
using (
  public.lms_current_role() = 'student'
  and (
    id = public.lms_current_user_id()
    or lower(coalesce(role, '')) = 'mentor'
    or batch_id = (select batch_id from public.lms_current_profile())
  )
);

drop policy if exists courses_admin_all on public.courses;
create policy courses_admin_all on public.courses for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists courses_mentor_assigned_all on public.courses;
create policy courses_mentor_assigned_all on public.courses for all
using (public.lms_current_role() = 'mentor' and mentor_id = public.lms_current_user_id())
with check (public.lms_current_role() = 'mentor' and mentor_id = public.lms_current_user_id());

drop policy if exists courses_students_published_or_enrolled on public.courses;
create policy courses_students_published_or_enrolled on public.courses for select
using (
  lower(coalesce(status, 'published')) in ('published', 'active')
  or exists (
    select 1 from public.user_courses uc
    where uc.course_id = courses.id
      and coalesce(uc.user_id, uc.student_id, uc.learner_id) = public.lms_current_user_id()
      and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive')
  )
);

drop policy if exists batches_admin_all on public.batches;
create policy batches_admin_all on public.batches for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists batches_mentor_assigned_all on public.batches;
create policy batches_mentor_assigned_all on public.batches for all
using (public.lms_current_role() = 'mentor' and mentor_id = public.lms_current_user_id())
with check (public.lms_current_role() = 'mentor' and mentor_id = public.lms_current_user_id());

drop policy if exists batches_student_assigned_read on public.batches;
create policy batches_student_assigned_read on public.batches for select
using (
  id = (select batch_id from public.lms_current_profile())
  or exists (
    select 1 from public.user_courses uc
    where uc.batch_id = batches.id
      and coalesce(uc.user_id, uc.student_id, uc.learner_id) = public.lms_current_user_id()
  )
);

drop policy if exists user_courses_admin_all on public.user_courses;
create policy user_courses_admin_all on public.user_courses for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists user_courses_self_or_mentor_read on public.user_courses;
create policy user_courses_self_or_mentor_read on public.user_courses for select
using (
  coalesce(user_id, student_id, learner_id) = public.lms_current_user_id()
  or public.lms_is_assigned_student(coalesce(user_id, student_id, learner_id))
);

drop policy if exists user_courses_mentor_assign on public.user_courses;
create policy user_courses_mentor_assign on public.user_courses for insert
with check (
  public.lms_current_role() = 'mentor'
  and public.lms_is_assigned_student(coalesce(user_id, student_id, learner_id))
);

drop policy if exists progress_admin_all on public.student_course_progress;
create policy progress_admin_all on public.student_course_progress for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists progress_student_own_all on public.student_course_progress;
create policy progress_student_own_all on public.student_course_progress for all
using (student_id = public.lms_current_user_id())
with check (student_id = public.lms_current_user_id());

drop policy if exists progress_mentor_assigned_read on public.student_course_progress;
create policy progress_mentor_assigned_read on public.student_course_progress for select
using (public.lms_is_assigned_student(student_id));

drop policy if exists batch_tasks_admin_all on public.batch_tasks;
create policy batch_tasks_admin_all on public.batch_tasks for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists batch_tasks_mentor_batch_all on public.batch_tasks;
create policy batch_tasks_mentor_batch_all on public.batch_tasks for all
using (public.lms_is_mentor_for_batch(batch_id))
with check (public.lms_is_mentor_for_batch(batch_id));

drop policy if exists batch_tasks_student_batch_read on public.batch_tasks;
create policy batch_tasks_student_batch_read on public.batch_tasks for select
using (batch_id = (select batch_id from public.lms_current_profile()));

drop policy if exists submissions_admin_all on public.task_submissions;
create policy submissions_admin_all on public.task_submissions for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists submissions_student_own_all on public.task_submissions;
create policy submissions_student_own_all on public.task_submissions for all
using (coalesce(student_id, user_id) = public.lms_current_user_id())
with check (coalesce(student_id, user_id) = public.lms_current_user_id());

drop policy if exists submissions_mentor_assigned_all on public.task_submissions;
create policy submissions_mentor_assigned_all on public.task_submissions for all
using (public.lms_is_assigned_student(coalesce(student_id, user_id)) or public.lms_is_mentor_for_batch(batch_id))
with check (public.lms_is_assigned_student(coalesce(student_id, user_id)) or public.lms_is_mentor_for_batch(batch_id));

drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists projects_student_own_all on public.projects;
create policy projects_student_own_all on public.projects for all
using (coalesce(student_id, user_id) = public.lms_current_user_id())
with check (coalesce(student_id, user_id) = public.lms_current_user_id());

drop policy if exists projects_mentor_assigned_all on public.projects;
create policy projects_mentor_assigned_all on public.projects for all
using (public.lms_is_assigned_student(coalesce(student_id, user_id)) or public.lms_is_mentor_for_batch(batch_id))
with check (public.lms_is_assigned_student(coalesce(student_id, user_id)) or public.lms_is_mentor_for_batch(batch_id));

drop policy if exists chats_admin_all on public.batch_chats;
create policy chats_admin_all on public.batch_chats for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists chats_batch_members_all on public.batch_chats;
create policy chats_batch_members_all on public.batch_chats for all
using (
  public.lms_is_mentor_for_batch(batch_id)
  or batch_id = (select batch_id from public.lms_current_profile())
)
with check (
  user_id = public.lms_current_user_id()
  and (public.lms_is_mentor_for_batch(batch_id) or batch_id = (select batch_id from public.lms_current_profile()))
);

drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all on public.announcements for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists announcements_mentor_own_all on public.announcements;
create policy announcements_mentor_own_all on public.announcements for all
using (public.lms_current_role() = 'mentor' and created_by = public.lms_current_user_id())
with check (public.lms_current_role() = 'mentor' and created_by = public.lms_current_user_id());

drop policy if exists announcements_role_visible_read on public.announcements;
create policy announcements_role_visible_read on public.announcements for select
using (
  coalesce(lower(status), 'published') in ('published', 'active')
  and (
    lower(coalesce(audience, 'all')) = 'all'
    or lower(coalesce(audience, '')) = public.lms_current_role() || 's'
    or batch_id = (select batch_id from public.lms_current_profile())
    or exists (
      select 1 from public.user_courses uc
      where uc.course_id = announcements.course_id
        and coalesce(uc.user_id, uc.student_id, uc.learner_id) = public.lms_current_user_id()
    )
  )
);

drop policy if exists shop_items_admin_all on public.shop_items;
create policy shop_items_admin_all on public.shop_items for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists shop_items_authenticated_read on public.shop_items;
create policy shop_items_authenticated_read on public.shop_items for select using (auth.uid() is not null);

drop policy if exists shop_purchases_admin_all on public.shop_purchases;
create policy shop_purchases_admin_all on public.shop_purchases for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists shop_purchases_student_own_all on public.shop_purchases;
create policy shop_purchases_student_own_all on public.shop_purchases for all
using (user_id = public.lms_current_user_id())
with check (user_id = public.lms_current_user_id());

drop policy if exists student_shop_purchases_admin_all on public.student_shop_purchases;
create policy student_shop_purchases_admin_all on public.student_shop_purchases for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists student_shop_purchases_student_own_all on public.student_shop_purchases;
create policy student_shop_purchases_student_own_all on public.student_shop_purchases for all
using (user_id = public.lms_current_user_id())
with check (user_id = public.lms_current_user_id());

drop policy if exists quiz_attempts_admin_all on public.student_quiz_attempts;
create policy quiz_attempts_admin_all on public.student_quiz_attempts for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists quiz_attempts_student_own_all on public.student_quiz_attempts;
create policy quiz_attempts_student_own_all on public.student_quiz_attempts for all
using (student_id = public.lms_current_user_id())
with check (student_id = public.lms_current_user_id());

drop policy if exists quiz_attempts_mentor_assigned_read on public.student_quiz_attempts;
create policy quiz_attempts_mentor_assigned_read on public.student_quiz_attempts for select
using (public.lms_is_assigned_student(student_id));

drop policy if exists extra_marks_admin_all on public.student_extra_marks;
create policy extra_marks_admin_all on public.student_extra_marks for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists extra_marks_mentor_own_all on public.student_extra_marks;
create policy extra_marks_mentor_own_all on public.student_extra_marks for all
using (mentor_id = public.lms_current_user_id())
with check (mentor_id = public.lms_current_user_id() and public.lms_is_assigned_student(student_id));

drop policy if exists extra_marks_student_own_read on public.student_extra_marks;
create policy extra_marks_student_own_read on public.student_extra_marks for select
using (student_id = public.lms_current_user_id());

drop policy if exists support_tickets_admin_all on public.support_tickets;
create policy support_tickets_admin_all on public.support_tickets for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists support_tickets_owner_all on public.support_tickets;
create policy support_tickets_owner_all on public.support_tickets for all
using (user_id = public.lms_current_user_id())
with check (user_id = public.lms_current_user_id());

drop policy if exists support_messages_admin_all on public.support_messages;
create policy support_messages_admin_all on public.support_messages for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists support_messages_ticket_owner_all on public.support_messages;
create policy support_messages_ticket_owner_all on public.support_messages for all
using (
  exists (
    select 1 from public.support_tickets t
    where (t.id::text = support_messages.ticket_id::text or t.ticket_id::text = support_messages.ticket_id::text)
      and t.user_id = public.lms_current_user_id()
  )
)
with check (
  sender_id = public.lms_current_user_id()
  and exists (
    select 1 from public.support_tickets t
    where (t.id::text = support_messages.ticket_id::text or t.ticket_id::text = support_messages.ticket_id::text)
      and t.user_id = public.lms_current_user_id()
  )
);

drop policy if exists support_notifications_admin_all on public.support_notifications;
create policy support_notifications_admin_all on public.support_notifications for all using (public.lms_is_admin()) with check (public.lms_is_admin());

drop policy if exists support_notifications_recipient_all on public.support_notifications;
create policy support_notifications_recipient_all on public.support_notifications for all
using (recipient_user_id = public.lms_current_user_id() or recipient_role = public.lms_current_role())
with check (recipient_user_id = public.lms_current_user_id() or recipient_role = public.lms_current_role());

commit;
