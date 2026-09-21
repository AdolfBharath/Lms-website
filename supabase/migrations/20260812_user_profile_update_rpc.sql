begin;

drop policy if exists users_self_read_update on public.users;
drop policy if exists users_self_profile_update on public.users;
drop policy if exists users_self_read on public.users;

create policy users_self_read on public.users for select
using (id = public.lms_current_user_id());

create or replace function public.lms_update_own_profile(
  profile_name text,
  profile_username text,
  profile_phone text
)
returns table (
  id uuid,
  name text,
  username text,
  phone text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_id uuid := public.lms_current_user_id();
begin
  if current_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.users
  set
    name = nullif(trim(coalesce(profile_name, '')), ''),
    username = nullif(trim(coalesce(profile_username, '')), ''),
    phone = nullif(trim(coalesce(profile_phone, '')), '')
  where id = current_id
    and deleted_at is null
    and coalesce(lower(status), 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
  returning users.id, users.name, users.username, users.phone
  into id, name, username, phone;

  if id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return next;
end;
$$;

revoke all on function public.lms_update_own_profile(text, text, text) from public;
revoke all on function public.lms_update_own_profile(text, text, text) from anon;
grant execute on function public.lms_update_own_profile(text, text, text) to authenticated;

commit;
