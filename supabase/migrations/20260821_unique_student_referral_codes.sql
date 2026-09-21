-- Persist unique student referral codes and return them from the wallet summary.

create or replace function public.lms_generated_referral_code(target_user_id uuid, target_email text, target_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'JNV-' || upper(substr(md5(coalesce(target_user_id::text, target_email, target_username, 'student')), 1, 10));
$$;

with duplicate_referrals as (
  select
    id,
    row_number() over (
      partition by upper(trim(referral_key))
      order by created_at nulls last, id
    ) as duplicate_rank
  from public.users
  where nullif(trim(coalesce(referral_key, '')), '') is not null
)
update public.users u
set referral_key = public.lms_generated_referral_code(u.id, u.email, u.username)
from duplicate_referrals d
where u.id = d.id
  and d.duplicate_rank > 1;

update public.users
set referral_key = public.lms_generated_referral_code(id, email, username)
where lower(trim(coalesce(role, 'student'))) = 'student'
  and (
    nullif(trim(coalesce(referral_key, '')), '') is null
    or upper(trim(referral_key)) in ('JNV-0000000', 'JNV-PENDING', 'JNV-ACCOUNT')
  );

create unique index if not exists users_referral_key_unique_idx
on public.users (upper(trim(referral_key)))
where nullif(trim(coalesce(referral_key, '')), '') is not null;

create or replace function public.lms_student_wallet_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.users%rowtype;
  code text;
  candidate_code text;
  code_is_taken boolean := false;
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

  candidate_code := upper(coalesce(nullif(trim(profile.referral_key), ''), nullif(trim(profile.referral), '')));
  code := coalesce(candidate_code, public.lms_generated_referral_code(profile.id, profile.email, profile.username));

  select exists (
    select 1
    from public.users other_user
    where other_user.id <> profile.id
      and upper(trim(coalesce(other_user.referral_key, ''))) = code
  ) into code_is_taken;

  if code in ('JNV-0000000', 'JNV-PENDING', 'JNV-ACCOUNT') or code_is_taken then
    code := public.lms_generated_referral_code(profile.id, profile.email, profile.username);
  end if;

  if nullif(trim(coalesce(profile.referral_key, '')), '') is null
    or upper(trim(profile.referral_key)) in ('JNV-0000000', 'JNV-PENDING', 'JNV-ACCOUNT')
  then
    update public.users
    set referral_key = code
    where id = profile.id;
  end if;

  wallet_balance := greatest(coalesce(profile.coins, 0), coalesce(profile.coin_balance, 0));

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
    'referral_key', code,
    'referral_code', code,
    'referral_count', referral_total,
    'successful_referrals', referral_total,
    'referral_coins_earned', referral_total * 50
  );
end;
$$;

revoke all on function public.lms_generated_referral_code(uuid, text, text) from public;
revoke all on function public.lms_student_wallet_summary() from public;
grant execute on function public.lms_student_wallet_summary() to authenticated;
