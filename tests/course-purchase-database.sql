-- Run after the migration inside a transaction that is ALWAYS rolled back.
do $$
declare
  learner uuid;
  course uuid;
  first_order public.lms_course_orders%rowtype;
  repeat_order public.lms_course_orders%rowtype;
  result jsonb;
  verified jsonb;
  rejected boolean := false;
  enrollment_count integer;
begin
  select id into learner from public.users where role = 'student' and status = 'active' and deleted_at is null limit 1;
  if learner is null then raise exception 'No active student fixture'; end if;
  insert into public.courses(title, price, status) values('Rollback-only purchase verification', 5999, 'active') returning id into course;
  first_order := public.lms_reserve_course_order(learner, course, 5999, 'cashfree');
  repeat_order := public.lms_reserve_course_order(learner, course, 5999, 'cashfree');
  if first_order.id <> repeat_order.id then raise exception 'Duplicate order reservation'; end if;
  verified := jsonb_build_object('order_id', first_order.provider_order_id, 'order_status', 'PAID', 'order_amount', 5999, 'order_currency', 'INR');
  begin
    perform public.lms_complete_course_order(first_order.id, verified || '{"order_amount":1}'::jsonb);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Tampered amount accepted'; end if;
  if exists(select 1 from public.user_courses where course_id = course) then raise exception 'Unpaid enrollment created'; end if;
  result := public.lms_complete_course_order(first_order.id, verified);
  if result->'enrollment'->>'course_id' <> course::text or result->'enrollment'->>'user_id' <> learner::text then raise exception 'Enrollment relationship mismatch'; end if;
  perform public.lms_complete_course_order(first_order.id, verified);
  select count(*) into enrollment_count from public.user_courses where course_id = course and user_id = learner;
  if enrollment_count <> 1 then raise exception 'Duplicate enrollment'; end if;
  if not exists(select 1 from public.lms_course_payments where order_id = first_order.id and course_id = course and user_id = learner and status = 'success') then raise exception 'Verified payment link missing'; end if;
  if has_function_privilege('authenticated', 'public.lms_complete_course_order(uuid,jsonb)', 'execute') then raise exception 'Client can finalize payments'; end if;
  if has_function_privilege('anon', 'public.lms_reserve_course_order(uuid,uuid,integer,text)', 'execute') then raise exception 'Anonymous order creation allowed'; end if;
end;
$$;
select 'PASS: reservation, tamper rejection, atomic enrollment, duplicate prevention and service-only grants' as result;
