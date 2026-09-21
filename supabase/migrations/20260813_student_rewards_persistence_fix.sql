-- Persist student wallet and streak changes made by trusted LMS reward RPCs.

begin;

create table if not exists public.lms_trusted_user_writes (
  txid bigint primary key,
  scope text not null,
  created_at timestamptz not null default now()
);

alter table public.lms_trusted_user_writes enable row level security;
revoke all on public.lms_trusted_user_writes from public, anon, authenticated;

create or replace function public.lms_protect_user_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.lms_trusted_user_writes marker
    where marker.txid = txid_current()
      and marker.scope = 'student_rewards'
  ) then
    return new;
  end if;

  if not public.lms_is_admin() then
    new.id := old.id;
    new.auth_user_id := old.auth_user_id;
    new.email := old.email;
    new.role := old.role;
    new.status := old.status;
    new.deleted_at := old.deleted_at;
    new.batch_id := old.batch_id;
    new.course_ids := old.course_ids;
    new.coins := old.coins;
    new.coin_balance := old.coin_balance;
    new.streak_count := old.streak_count;
    new.last_active_date := old.last_active_date;
    new.last_login_reward_date := old.last_login_reward_date;
    new.reward_history := old.reward_history;
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
  reward_date date := timezone('Asia/Kolkata', now())::date;
  reward_amount integer := 10;
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

  if profile.last_login_reward_date is distinct from reward_date then
    next_balance := greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)) + reward_amount;

    insert into public.lms_trusted_user_writes (txid, scope)
    values (txid_current(), 'student_rewards')
    on conflict (txid) do update set scope = excluded.scope, created_at = now();

    update public.users
    set coins = next_balance,
        coin_balance = next_balance,
        last_login_reward_date = reward_date,
        last_active_date = reward_date,
        streak_count = case
          when profile.last_active_date = reward_date - 1
            and date_trunc('week', profile.last_active_date::timestamp) = date_trunc('week', reward_date::timestamp)
            then least(coalesce(profile.streak_count, 0) + 1, 7)
          when profile.last_active_date = reward_date then greatest(coalesce(profile.streak_count, 1), 1)
          else 1
        end
    where id = profile.id
    returning * into profile;
    did_claim := true;
  end if;

  if profile.last_active_date = reward_date
    and coalesce(profile.streak_count, 0) > extract(isodow from reward_date)::integer then
    insert into public.lms_trusted_user_writes (txid, scope)
    values (txid_current(), 'student_rewards')
    on conflict (txid) do update set scope = excluded.scope, created_at = now();

    update public.users
    set streak_count = extract(isodow from reward_date)::integer
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
    'last_active_date', profile.last_active_date
  );
end;
$$;

create or replace function public.lms_purchase_shop_item(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  item public.shop_items%rowtype;
  purchase_id uuid;
  next_balance integer;
begin
  select * into profile
  from public.users
  where (auth_user_id = (select auth.uid()) or id = (select auth.uid()))
    and lower(trim(coalesce(role, 'student'))) = 'student'
    and deleted_at is null
    and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
  for update;

  select * into item from public.shop_items where id = target_item_id for update;
  if not found or profile.id is null then
    raise exception 'Student or shop item not found';
  end if;
  if coalesce(lower(item.status), 'active') <> 'active' or item.deleted_at is not null then
    raise exception 'Reward item is not available' using errcode = 'P0001';
  end if;
  if coalesce(item.stock, 0) <= 0 then
    raise exception 'Reward item is out of stock' using errcode = 'P0001';
  end if;

  next_balance := greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0)) - coalesce(item.price, 0);
  if next_balance < 0 then
    raise exception 'Insufficient coins' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shop_purchases p where p.user_id = profile.id and p.item_id = item.id) then
    raise exception 'Reward already owned' using errcode = '23505';
  end if;

  insert into public.shop_purchases (user_id, item_id, purchased_at)
  values (profile.id, item.id, now())
  returning id into purchase_id;

  update public.shop_items
  set stock = greatest(coalesce(stock, 0) - 1, 0)
  where id = item.id;

  insert into public.lms_trusted_user_writes (txid, scope)
  values (txid_current(), 'student_rewards')
  on conflict (txid) do update set scope = excluded.scope, created_at = now();

  update public.users
  set coins = next_balance,
      coin_balance = next_balance
  where id = profile.id
  returning * into profile;

  return jsonb_build_object(
    'purchase_id', purchase_id,
    'item_id', item.id,
    'coins', next_balance,
    'coin_balance', next_balance
  );
end;
$$;

create or replace function public.lms_student_wallet_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  code text;
  referral_total integer := 0;
  wallet_balance integer;
begin
  select * into profile
  from public.users
  where (auth_user_id = (select auth.uid()) or id = (select auth.uid()))
    and lower(trim(coalesce(role, 'student'))) = 'student'
    and deleted_at is null
    and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked', 'suspended');

  if not found then
    raise exception 'Student profile not found.' using errcode = '42501';
  end if;

  wallet_balance := greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0));
  code := upper(coalesce(nullif(trim(profile.referral_key), ''), nullif(trim(profile.referral), ''), 'JNV-' || right(regexp_replace(coalesce(profile.id::text, profile.email, ''), '[^a-zA-Z0-9]', '', 'g'), 8)));

  if to_regclass('public.form_student_registrations') is not null then
    execute 'select count(*)::integer from public.form_student_registrations where upper(coalesce(reference_id, '''')) = $1'
    into referral_total
    using code;
  end if;

  return jsonb_build_object(
    'student_id', profile.id,
    'coins', wallet_balance,
    'coin_balance', wallet_balance,
    'streak_count', coalesce(profile.streak_count, 0),
    'last_active_date', profile.last_active_date,
    'last_login_reward_date', profile.last_login_reward_date,
    'referral_code', code,
    'referral_count', referral_total,
    'successful_referrals', referral_total,
    'referral_coins_earned', referral_total * 50
  );
end;
$$;

drop function if exists public.lms_submit_task_once(uuid, uuid, text);
create or replace function public.lms_submit_task_once(target_task_id uuid, target_student_id uuid, submission_drive_link text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_submission_id uuid;
  task_row public.batch_tasks%rowtype;
  student_row public.users%rowtype;
  first_submission boolean;
  reward_amount integer := 10;
  next_balance integer;
begin
  select * into student_row
  from public.users
  where id = target_student_id
    and (auth_user_id = (select auth.uid()) or id = (select auth.uid()))
    and lower(trim(coalesce(role, 'student'))) = 'student'
    and deleted_at is null
    and coalesce(status, 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
  for update;

  if not found then
    raise exception 'The requested student does not match the logged-in user.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(submission_drive_link, '')), '') is null then
    raise exception 'Submission link or uploaded file is required.';
  end if;

  select * into task_row
  from public.batch_tasks
  where id = target_task_id
    and coalesce(status, 'active') not in ('archived', 'deleted');

  if not found then
    raise exception 'Task not found.';
  end if;
  if not (
    task_row.batch_id is null
    or task_row.batch_id = student_row.batch_id
    or exists (
      select 1
      from public.user_courses uc
      where coalesce(uc.user_id, uc.student_id, uc.learner_id) = student_row.id
        and uc.course_id = task_row.course_id
        and (uc.batch_id is null or uc.batch_id = task_row.batch_id)
        and uc.deleted_at is null
        and coalesce(uc.status, 'active') not in ('archived', 'removed', 'cancelled')
    )
  ) then
    raise exception 'Task is not assigned to this student.' using errcode = '42501';
  end if;

  select not exists (
    select 1
    from public.task_submissions
    where task_id = target_task_id
      and coalesce(student_id, user_id) = target_student_id
      and deleted_at is null
  ) into first_submission;

  insert into public.task_submissions (
    task_id, student_id, user_id, batch_id, course_id, drive_link, file_url,
    status, submitted_at, created_at
  )
  values (
    target_task_id, target_student_id, target_student_id, task_row.batch_id,
    task_row.course_id, submission_drive_link, submission_drive_link,
    case when first_submission then 'submitted' else 'resubmitted' end,
    now(), now()
  )
  returning id into new_submission_id;

  if first_submission then
    next_balance := greatest(coalesce(student_row.coins, 0), coalesce(student_row.coin_balance, 0)) + reward_amount;
    insert into public.lms_trusted_user_writes (txid, scope)
    values (txid_current(), 'student_rewards')
    on conflict (txid) do update set scope = excluded.scope, created_at = now();

    update public.users
    set coins = next_balance,
        coin_balance = next_balance
    where id = target_student_id;
  else
    reward_amount := 0;
    next_balance := greatest(coalesce(student_row.coins, 0), coalesce(student_row.coin_balance, 0));
  end if;

  return jsonb_build_object(
    'submission_id', new_submission_id,
    'first_submission', first_submission,
    'reward_amount', reward_amount,
    'coins', next_balance,
    'coin_balance', next_balance
  );
end;
$$;

revoke all on function public.lms_claim_daily_login_reward(uuid) from public;
revoke all on function public.lms_purchase_shop_item(uuid) from public;
revoke all on function public.lms_student_wallet_summary() from public;
revoke all on function public.lms_submit_task_once(uuid, uuid, text) from public;
grant execute on function public.lms_claim_daily_login_reward(uuid) to authenticated;
grant execute on function public.lms_purchase_shop_item(uuid) to authenticated;
grant execute on function public.lms_student_wallet_summary() to authenticated;
grant execute on function public.lms_submit_task_once(uuid, uuid, text) to authenticated;

commit;
