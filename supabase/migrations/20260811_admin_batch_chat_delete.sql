begin;

create or replace function public.lms_admin_delete_batch_chat(
  actor_user_id uuid,
  target_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if actor_user_id <> public.lms_current_user_id() or not public.lms_is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.batch_chats
    where id = target_message_id
  ) then
    raise exception 'Chat message not found.' using errcode = 'P0002';
  end if;

  delete from public.batch_chats
  where id = target_message_id
     or parent_id = target_message_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.lms_admin_delete_batch_chat(uuid, uuid) from public;
revoke all on function public.lms_admin_delete_batch_chat(uuid, uuid) from anon;
grant execute on function public.lms_admin_delete_batch_chat(uuid, uuid) to authenticated;

commit;
