-- Daily login reward: +10 coins once per LMS day, with +10 bonus on every 7-day streak milestone.

begin;

create table if not exists public.lms_daily_login_rewards (
  user_id uuid not null references public.users(id) on delete cascade,
  reward_date date not null,
  reward_amount integer not null default 10 check (reward_amount >= 0),
  source text not null default 'daily_login',
  created_at timestamptz not null default now(),
  primary key (user_id, reward_date)
);

alter table public.lms_daily_login_rewards
  add column if not exists daily_coins integer not null default 0 check (daily_coins >= 0),
  add column if not exists streak_day integer not null default 0 check (streak_day >= 0),
  add column if not exists streak_bonus integer not null default 0 check (streak_bonus >= 0),
  add column if not exists total_coins_awarded integer not null default 0 check (total_coins_awarded >= 0);

create index if not exists idx_lms_daily_login_rewards_user_date
  on public.lms_daily_login_rewards(user_id, reward_date desc);

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

create or replace function public.lms_claim_daily_login_reward(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  claim public.lms_daily_login_rewards%rowtype;
  previous_claim public.lms_daily_login_rewards%rowtype;
  lms_reward_date date := timezone('Asia/Kolkata', now())::date;
  daily_reward integer := 10;
  streak_bonus_amount integer := 10;
  streak_length integer := 7;
  next_streak integer := 1;
  bonus integer := 0;
  total_reward integer := 0;
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

  select * into claim
  from public.lms_daily_login_rewards
  where user_id = profile.id
    and reward_date = lms_reward_date;

  if found then
    return jsonb_build_object(
      'claimed', false,
      'claimedToday', false,
      'dailyReward', 0,
      'reward_amount', 0,
      'streakBonus', 0,
      'streak_bonus', 0,
      'totalReward', 0,
      'total_coins_awarded', 0,
      'coins', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
      'coin_balance', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
      'streak', greatest(coalesce(profile.streak_count, 0), coalesce(claim.streak_day, 0)),
      'streak_count', greatest(coalesce(profile.streak_count, 0), coalesce(claim.streak_day, 0)),
      'last_login_reward_date', profile.last_login_reward_date,
      'last_active_date', profile.last_active_date,
      'reward_date', lms_reward_date
    );
  end if;

  select * into previous_claim
  from public.lms_daily_login_rewards
  where user_id = profile.id
    and reward_date < lms_reward_date
  order by reward_date desc
  limit 1;

  if found and previous_claim.reward_date = lms_reward_date - 1 then
    next_streak := greatest(coalesce(previous_claim.streak_day, 0), coalesce(profile.streak_count, 0), 0) + 1;
  else
    next_streak := 1;
  end if;

  if next_streak > 0 and mod(next_streak, streak_length) = 0 then
    bonus := streak_bonus_amount;
  end if;
  total_reward := daily_reward + bonus;

  insert into public.lms_daily_login_rewards (
    user_id, reward_date, reward_amount, daily_coins, streak_day, streak_bonus, total_coins_awarded
  )
  values (
    profile.id, lms_reward_date, total_reward, daily_reward, next_streak, bonus, total_reward
  )
  on conflict (user_id, reward_date) do nothing
  returning * into claim;

  if not found then
    select * into claim
    from public.lms_daily_login_rewards
    where user_id = profile.id
      and reward_date = lms_reward_date;

    return jsonb_build_object(
      'claimed', false,
      'claimedToday', false,
      'dailyReward', 0,
      'reward_amount', 0,
      'streakBonus', 0,
      'streak_bonus', 0,
      'totalReward', 0,
      'total_coins_awarded', 0,
      'coins', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
      'coin_balance', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
      'streak', greatest(coalesce(profile.streak_count, 0), coalesce(claim.streak_day, 0)),
      'streak_count', greatest(coalesce(profile.streak_count, 0), coalesce(claim.streak_day, 0)),
      'last_login_reward_date', profile.last_login_reward_date,
      'last_active_date', profile.last_active_date,
      'reward_date', lms_reward_date
    );
  end if;

  next_balance := greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)) + total_reward;

  insert into public.lms_trusted_user_writes (txid, scope)
  values (txid_current(), 'student_rewards')
  on conflict (txid) do update set scope = excluded.scope, created_at = now();

  update public.users
  set coins = next_balance,
      coin_balance = next_balance,
      last_login_reward_date = lms_reward_date,
      last_active_date = lms_reward_date,
      streak_count = next_streak
  where id = profile.id
  returning * into profile;

  return jsonb_build_object(
    'claimed', true,
    'claimedToday', true,
    'dailyReward', daily_reward,
    'reward_amount', daily_reward,
    'streakBonus', bonus,
    'streak_bonus', bonus,
    'totalReward', total_reward,
    'total_coins_awarded', total_reward,
    'coins', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
    'coin_balance', greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)),
    'streak', next_streak,
    'streak_count', next_streak,
    'last_login_reward_date', profile.last_login_reward_date,
    'last_active_date', profile.last_active_date,
    'reward_date', lms_reward_date
  );
end;
$$;

revoke all on function public.lms_claim_daily_login_reward(uuid) from public;
grant execute on function public.lms_claim_daily_login_reward(uuid) to authenticated;

commit;
