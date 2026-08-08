begin;

drop function if exists public.lms_claim_daily_login_reward(uuid);
drop function if exists public.lms_enroll_student(uuid, uuid);
drop function if exists public.lms_submit_task_once(uuid, uuid, text);
drop function if exists public.lms_submit_student_question(uuid, uuid, text, text, text);
drop function if exists public.lms_support_create_ticket(uuid, text, text, text, text, text);
drop function if exists public.lms_support_reply(uuid, text, uuid, text, text, text, text);
drop function if exists public.lms_admin_delete_user(uuid, uuid);

commit;
