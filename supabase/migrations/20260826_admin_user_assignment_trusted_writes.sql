-- Allow admin Edge Functions to persist assignment fields protected by the users trigger.

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
      and marker.scope in ('student_rewards', 'admin_user_write')
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

create or replace function public.lms_admin_update_user_assignment(
  target_user_id uuid,
  target_batch_id uuid default null,
  target_course_ids jsonb default null
)
returns public.users
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.users%rowtype;
  course_ids_udt text := '';
begin
  insert into public.lms_trusted_user_writes (txid, scope)
  values (txid_current(), 'admin_user_write')
  on conflict (txid) do update set scope = excluded.scope, created_at = now();

  update public.users
  set batch_id = coalesce(target_batch_id, batch_id)
  where id = target_user_id
  returning * into saved;

  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  if target_course_ids is not null then
    select coalesce(udt_name, '') into course_ids_udt
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'course_ids';

    if course_ids_udt = '_uuid' then
      update public.users
      set course_ids = (
        select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
        from jsonb_array_elements_text(target_course_ids) as ids(value)
        where nullif(trim(value), '') is not null
      )
      where id = target_user_id
      returning * into saved;
    elsif course_ids_udt = '_text' then
      update public.users
      set course_ids = (
        select coalesce(array_agg(distinct value::text), '{}'::text[])
        from jsonb_array_elements_text(target_course_ids) as ids(value)
        where nullif(trim(value), '') is not null
      )
      where id = target_user_id
      returning * into saved;
    end if;
  end if;

  return saved;
end;
$$;

revoke all on function public.lms_admin_update_user_assignment(uuid, uuid, jsonb) from public;
grant execute on function public.lms_admin_update_user_assignment(uuid, uuid, jsonb) to service_role;

commit;
