begin;

create or replace function public.lms_mentor_delete_batch_chat(
  actor_user_id uuid,
  target_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid;
  deleted_count integer := 0;
begin
  if actor_user_id <> public.lms_current_user_id() or public.lms_current_role() <> 'mentor' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select batch_id into target_batch_id
  from public.batch_chats
  where id = target_message_id;

  if target_batch_id is null then
    raise exception 'Chat message not found.' using errcode = 'P0002';
  end if;

  if not public.lms_is_mentor_for_batch(target_batch_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from public.batch_chats
  where id = target_message_id
     or parent_id = target_message_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.lms_mentor_delete_batch_chat(uuid, uuid) from public;
revoke all on function public.lms_mentor_delete_batch_chat(uuid, uuid) from anon;
grant execute on function public.lms_mentor_delete_batch_chat(uuid, uuid) to authenticated;

commit;
