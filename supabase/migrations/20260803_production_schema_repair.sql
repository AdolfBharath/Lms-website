begin;

alter table if exists public.users
  add column if not exists coin_balance integer default 0;

update public.users
set coin_balance = coalesce(coin_balance, coins, 0)
where coin_balance is null;

alter table if exists public.batch_tasks
  add column if not exists total_marks numeric(10,2),
  add column if not exists max_marks numeric(10,2),
  add column if not exists published_at timestamptz;

alter table if exists public.task_submissions
  add column if not exists score numeric(10,2),
  add column if not exists marks_obtained numeric(10,2),
  add column if not exists total_marks numeric(10,2),
  add column if not exists max_marks numeric(10,2),
  add column if not exists is_on_time boolean,
  add column if not exists graded_at timestamptz;

alter table if exists public.student_quiz_attempts
  add column if not exists deleted_at timestamptz,
  add column if not exists time_taken_seconds integer,
  add column if not exists duration_seconds integer,
  add column if not exists question_count integer,
  add column if not exists selected_question_ids jsonb;

create table if not exists public.student_shop_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.shop_items(id) on delete cascade,
  purchased_at timestamptz not null default now(),
  unique (user_id, item_id)
);

insert into public.student_shop_purchases (id, user_id, item_id, purchased_at)
select id, user_id, item_id, coalesce(purchased_at, now())
from public.shop_purchases
where user_id is not null and item_id is not null
on conflict (user_id, item_id) do nothing;

create index if not exists idx_student_shop_purchases_user
  on public.student_shop_purchases(user_id, purchased_at desc);

commit;
