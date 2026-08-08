begin;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'lms_%'
  loop
    execute 'revoke all on function ' || fn.signature || ' from public';
    execute 'revoke all on function ' || fn.signature || ' from anon';
    execute 'revoke all on function ' || fn.signature || ' from authenticated';
  end loop;
end $$;

grant execute on function public.lms_claim_daily_login_reward(uuid) to authenticated;
grant execute on function public.lms_current_profile() to authenticated;
grant execute on function public.lms_current_user_id() to authenticated;
grant execute on function public.lms_current_role() to authenticated;
grant execute on function public.lms_is_admin() to authenticated;
grant execute on function public.lms_is_mentor_for_batch(uuid) to authenticated;
grant execute on function public.lms_is_assigned_student(uuid) to authenticated;
grant execute on function public.lms_purchase_shop_item(uuid) to authenticated;
grant execute on function public.lms_submit_task_once(uuid, uuid, text) to authenticated;
grant execute on function public.lms_student_directory() to authenticated;
grant execute on function public.lms_student_leaderboard() to authenticated;
grant execute on function public.lms_enroll_student(uuid, uuid) to authenticated;
grant execute on function public.lms_support_create_ticket(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.lms_support_reply(uuid, text, uuid, text, text, text, text) to authenticated;
grant execute on function public.lms_delete_resolved_support_ticket(uuid) to authenticated;
grant execute on function public.lms_submit_student_question(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.lms_soft_delete(uuid, text, uuid) to authenticated;
grant execute on function public.lms_restore_record(uuid, text, uuid, text) to authenticated;
grant execute on function public.lms_admin_delete_user(uuid, uuid) to authenticated;
grant execute on function public.lms_submit_public_form(text, jsonb, text) to anon, authenticated;

commit;
