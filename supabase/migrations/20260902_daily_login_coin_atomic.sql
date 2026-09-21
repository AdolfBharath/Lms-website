-- Make daily-login coins atomic, authenticated, and once per LMS calendar day.

begin;

create table if not exists public.lms_daily_login_rewards (
  user_id uuid not null references public.users(id) on delete cascade,
  reward_date date not null,
  reward_amount integer not null default 1 check (reward_amount >= 0),
  source text not null default 'daily_login',
  created_at timestamptz not null default now(),
  primary key (user_id, reward_date)
);

create index if not exists idx_lms_daily_login_rewards_user_created
  on public.lms_daily_login_rewards(user_id, created_at desc);

alter table public.lms_daily_login_rewards enable row level security;

revoke all on public.lms_daily_login_rewards from public, anon, authenticated;

drop policy if exists lms_daily_login_rewards_student_read on public.lms_daily_login_rewards;
create policy lms_daily_login_rewards_student_read
on public.lms_daily_login_rewards
for select
using (user_id = public.lms_current_user_id() or public.lms_is_admin());

create or replace function public.lms_record_daily_login_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  valid_batch_id uuid;
begin
  if new.last_active_date is not null
    and new.last_active_date is distinct from old.last_active_date then
    select b.id into valid_batch_id
    from public.batches b
    where b.id = new.batch_id
    limit 1;

    insert into public.student_academic_activity (
      student_id, batch_id, activity_type, points, max_points, occurred_at, activity_key
    ) values (
      new.id,
      valid_batch_id,
      'daily_login',
      1,
      1,
      new.last_active_date::timestamp,
      'daily_login:' || new.id::text || ':' || new.last_active_date::text
    ) on conflict (activity_key) do nothing;
  end if;
  return new;
end;
$$;

insert into public.lms_daily_login_rewards (user_id, reward_date, reward_amount, source)
select id, last_login_reward_date, 0, 'legacy_last_login_reward_date'
from public.users
where last_login_reward_date is not null
  and lower(trim(coalesce(role, 'student'))) = 'student'
on conflict (user_id, reward_date) do nothing;

create or replace function public.lms_claim_daily_login_reward(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  lms_reward_date date := timezone('Asia/Kolkata', now())::date;
  reward_amount integer := 1;
  did_claim boolean := false;
  next_balance integer;
begin
  select * into profile
  from public.users
  where (auth_user_id = (select auth.uid()) or id = (select auth.uid()))
    and lower(trim(coalesce(role, 'student'))) = 'student'
    and deleted_at is null
    and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
  for update;

  if not found or (target_user_id is not null and target_user_id <> profile.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  insert into public.lms_daily_login_rewards (user_id, reward_date, reward_amount)
  values (profile.id, lms_reward_date, reward_amount)
  on conflict (user_id, reward_date) do nothing;

  get diagnostics did_claim = row_count;

  if did_claim then
    next_balance := greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)) + reward_amount;

    insert into public.lms_trusted_user_writes (txid, scope)
    values (txid_current(), 'student_rewards')
    on conflict (txid) do update set scope = excluded.scope, created_at = now();

    update public.users
    set coins = next_balance,
        coin_balance = next_balance,
        last_login_reward_date = lms_reward_date,
        last_active_date = lms_reward_date,
        streak_count = case
          when profile.last_active_date = lms_reward_date - 1
            and date_trunc('week', profile.last_active_date::timestamp) = date_trunc('week', lms_reward_date::timestamp)
            then least(coalesce(profile.streak_count, 0) + 1, 7)
          when profile.last_active_date = lms_reward_date then greatest(coalesce(profile.streak_count, 1), 1)
          else 1
        end
    where id = profile.id
    returning * into profile;
  end if;

  if profile.last_active_date = lms_reward_date
    and coalesce(profile.streak_count, 0) > extract(isodow from lms_reward_date)::integer then
    insert into public.lms_trusted_user_writes (txid, scope)
    values (txid_current(), 'student_rewards')
    on conflict (txid) do update set scope = excluded.scope, created_at = now();

    update public.users
    set streak_count = extract(isodow from lms_reward_date)::integer
    where id = profile.id
    returning * into profile;
  end if;

  return jsonb_build_object(
    'claimed', did_claim,
    'reward_amount', case when did_claim then reward_amount else 0 end,
    'coins', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
    'coin_balance', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
    'last_login_reward_date', profile.last_login_reward_date,
    'streak_count', coalesce(profile.streak_count, 0),
    'last_active_date', profile.last_active_date,
    'reward_date', lms_reward_date
  );
end;
$$;

revoke all on function public.lms_claim_daily_login_reward(uuid) from public;
grant execute on function public.lms_claim_daily_login_reward(uuid) to authenticated;

commit;
