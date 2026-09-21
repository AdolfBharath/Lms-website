begin;

create extension if not exists pgcrypto;

create table if not exists public.lms_course_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  amount integer not null check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'pending' check (status in ('pending', 'processing', 'success', 'failed', 'cancelled', 'refunded')),
  provider text not null default 'cashfree',
  provider_order_id text unique,
  provider_payment_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_course_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.lms_course_orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete restrict,
  amount integer not null check (amount >= 0),
  currency text not null default 'INR',
  provider text not null default 'cashfree',
  provider_payment_id text,
  provider_order_id text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'success', 'failed', 'cancelled', 'refunded')),
  verified_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  unique (order_id, provider_payment_id)
);

create index if not exists lms_course_orders_user_idx on public.lms_course_orders(user_id, created_at desc);
create index if not exists lms_course_orders_course_idx on public.lms_course_orders(course_id);
create index if not exists lms_course_orders_provider_order_idx on public.lms_course_orders(provider_order_id);
create index if not exists lms_course_payments_user_idx on public.lms_course_payments(user_id, created_at desc);
create index if not exists lms_course_payments_order_idx on public.lms_course_payments(order_id);

with duplicate_enrollments as (
  select
    id,
    row_number() over (
      partition by coalesce(user_id, student_id, learner_id), course_id
      order by created_at desc nulls last, id desc
    ) as duplicate_rank
  from public.user_courses
  where coalesce(status, 'active') not in ('archived', 'removed', 'cancelled')
    and deleted_at is null
    and coalesce(user_id, student_id, learner_id) is not null
    and course_id is not null
)
update public.user_courses uc
set status = 'archived'
from duplicate_enrollments d
where uc.id = d.id
  and d.duplicate_rank > 1;

create unique index if not exists user_courses_user_course_active_unique_idx
on public.user_courses (coalesce(user_id, student_id, learner_id), course_id)
where coalesce(status, 'active') not in ('archived', 'removed', 'cancelled')
  and deleted_at is null;

alter table public.lms_course_orders enable row level security;
alter table public.lms_course_payments enable row level security;

drop policy if exists lms_course_orders_select_own on public.lms_course_orders;
create policy lms_course_orders_select_own on public.lms_course_orders for select
to authenticated
using (user_id = public.lms_current_user_id() or public.lms_is_admin());

drop policy if exists lms_course_payments_select_own on public.lms_course_payments;
create policy lms_course_payments_select_own on public.lms_course_payments for select
to authenticated
using (user_id = public.lms_current_user_id() or public.lms_is_admin());

revoke all on public.lms_course_orders from anon, authenticated;
revoke all on public.lms_course_payments from anon, authenticated;
grant select on public.lms_course_orders to authenticated;
grant select on public.lms_course_payments to authenticated;

commit;
