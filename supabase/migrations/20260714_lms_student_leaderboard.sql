-- Safe, aggregate-only student leaderboard.
-- Students can rank learners in their own batch only for courses they are enrolled in.

create or replace function public.lms_student_leaderboard()
returns table (
  user_id uuid,
  learner_name text,
  username text,
  batch_id uuid,
  course_id uuid,
  course_title text,
  progress_percent integer,
  tasks_completed integer,
  quizzes_completed integer,
  quiz_average integer,
  achievements integer,
  total_score bigint,
  course_rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select u.id, u.batch_id
    from public.users u
    where u.id = public.lms_current_user_id()
      and lower(coalesce(u.role, 'student')) = 'student'
  ),
  allowed_courses as (
    select distinct uc.course_id
    from public.user_courses uc
    join me on coalesce(uc.user_id, uc.student_id, uc.learner_id) = me.id
    where uc.course_id is not null
      and coalesce(lower(uc.status), 'active') not in ('archived', 'cancelled', 'deleted')
    union
    select b.course_id
    from public.batches b
    join me on b.id = me.batch_id
    where b.course_id is not null
  ),
  learners as (
    select u.id, u.name, u.username, u.batch_id
    from public.users u
    join me on u.batch_id = me.batch_id
    where lower(coalesce(u.role, 'student')) = 'student'
      and u.deleted_at is null
      and coalesce(lower(u.status), 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
  ),
  learner_courses as (
    select distinct l.id as user_id, l.name, l.username, l.batch_id, ac.course_id
    from learners l
    cross join allowed_courses ac
    where exists (
      select 1
      from public.user_courses uc
      where coalesce(uc.user_id, uc.student_id, uc.learner_id) = l.id
        and uc.course_id = ac.course_id
        and coalesce(lower(uc.status), 'active') not in ('archived', 'cancelled', 'deleted')
    )
    or exists (
      select 1
      from public.batches b
      where b.id = l.batch_id and b.course_id = ac.course_id
    )
  ),
  progress_values as (
    select
      p.student_id as user_id,
      p.course_id,
      greatest(0, least(100,
        case
          when jsonb_typeof(to_jsonb(c.modules)) = 'array'
            and jsonb_array_length(to_jsonb(c.modules)) > 0
          then round(
            100.0 * jsonb_array_length(
              case when jsonb_typeof(to_jsonb(p.completed_modules)) = 'array'
                then to_jsonb(p.completed_modules) else '[]'::jsonb end
            ) / jsonb_array_length(to_jsonb(c.modules))
          )::integer
          else 0
        end
      ))::integer as progress_percent,
      jsonb_array_length(
        case when jsonb_typeof(to_jsonb(p.completed_modules)) = 'array'
          then to_jsonb(p.completed_modules) else '[]'::jsonb end
      )::integer as completed_modules
    from public.student_course_progress p
    join public.courses c on c.id = p.course_id
  ),
  task_values as (
    select
      coalesce(s.student_id, s.user_id) as user_id,
      s.course_id,
      count(distinct s.task_id)::integer as tasks_completed
    from public.task_submissions s
    where s.course_id is not null
      and coalesce(lower(s.status), 'submitted') not in ('draft', 'rejected', 'cancelled')
    group by coalesce(s.student_id, s.user_id), s.course_id
  ),
  quiz_values as (
    select
      q.student_id as user_id,
      q.course_id,
      count(distinct coalesce(q.quiz_id::text, q.module_id::text, q.module_order::text))::integer as quizzes_completed,
      round(avg(case when coalesce(q.total, q.max_score, 0) > 0
        then 100.0 * q.score / coalesce(q.total, q.max_score)
        else 0 end))::integer as quiz_average,
      count(distinct case when q.passed then coalesce(q.quiz_id::text, q.module_id::text, q.module_order::text) end)::integer as passed_quizzes
    from public.student_quiz_attempts q
    where q.course_id is not null
    group by q.student_id, q.course_id
  ),
  scored as (
    select
      lc.user_id,
      coalesce(nullif(lc.name, ''), nullif(lc.username, ''), 'Student') as learner_name,
      lc.username,
      lc.batch_id,
      lc.course_id,
      coalesce(c.title, 'Course') as course_title,
      coalesce(pv.progress_percent, 0)::integer as progress_percent,
      coalesce(tv.tasks_completed, 0)::integer as tasks_completed,
      coalesce(qv.quizzes_completed, 0)::integer as quizzes_completed,
      coalesce(qv.quiz_average, 0)::integer as quiz_average,
      (coalesce(pv.completed_modules, 0) + coalesce(tv.tasks_completed, 0) + coalesce(qv.passed_quizzes, 0))::integer as achievements,
      (
        coalesce(pv.progress_percent, 0) * 10
        + coalesce(tv.tasks_completed, 0) * 100
        + coalesce(qv.quiz_average, 0) * 5
        + (coalesce(pv.completed_modules, 0) + coalesce(qv.passed_quizzes, 0)) * 25
      )::bigint as total_score
    from learner_courses lc
    join public.courses c on c.id = lc.course_id
    left join progress_values pv on pv.user_id = lc.user_id and pv.course_id = lc.course_id
    left join task_values tv on tv.user_id = lc.user_id and tv.course_id = lc.course_id
    left join quiz_values qv on qv.user_id = lc.user_id and qv.course_id = lc.course_id
  )
  select
    s.*,
    dense_rank() over (
      partition by s.course_id
      order by s.total_score desc, s.progress_percent desc, lower(s.learner_name), s.user_id
    )::bigint as course_rank
  from scored s
  order by s.course_title, course_rank, lower(s.learner_name)
$$;

revoke all on function public.lms_student_leaderboard() from public;
grant execute on function public.lms_student_leaderboard() to authenticated;
