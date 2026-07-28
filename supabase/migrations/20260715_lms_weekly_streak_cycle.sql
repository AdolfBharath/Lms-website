begin;

-- Keep login rewards and the Mon-Sun streak calendar on the same LMS date.
create or replace function public.lms_claim_daily_login_reward(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.users%rowtype;
  reward_date date := timezone('Asia/Kolkata', now())::date;
  reward_amount integer := 10;
  did_claim boolean := false;
begin
  select * into profile
  from public.users
  where id = public.lms_current_user_id()
  for update;

  if profile.id is null or (target_user_id is not null and target_user_id <> profile.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if profile.last_login_reward_date is distinct from reward_date then
    update public.users
    set coins = coalesce(coins, 0) + reward_amount,
        last_login_reward_date = reward_date,
        last_active_date = reward_date,
        streak_count = case
          when last_active_date = reward_date - 1
            and date_trunc('week', last_active_date::timestamp) = date_trunc('week', reward_date::timestamp)
            then least(coalesce(streak_count, 0) + 1, 7)
          when last_active_date = reward_date then coalesce(streak_count, 1)
          else 1
        end
    where id = profile.id
    returning * into profile;
    did_claim := true;
  end if;

  -- Normalize counts created by the previous cross-week implementation immediately.
  if profile.last_active_date = reward_date
    and coalesce(profile.streak_count, 0) > extract(isodow from reward_date)::integer then
    update public.users
    set streak_count = extract(isodow from reward_date)::integer
    where id = profile.id
    returning * into profile;
  end if;

  return jsonb_build_object(
    'claimed', did_claim,
    'reward_amount', case when did_claim then reward_amount else 0 end,
    'coins', coalesce(profile.coins, 0),
    'last_login_reward_date', profile.last_login_reward_date,
    'streak_count', coalesce(profile.streak_count, 0),
    'last_active_date', profile.last_active_date
  );
end;
$$;

revoke all on function public.lms_claim_daily_login_reward(uuid) from public;
grant execute on function public.lms_claim_daily_login_reward(uuid) to authenticated;

commit;
