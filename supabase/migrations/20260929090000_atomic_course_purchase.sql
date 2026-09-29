begin;

-- Only the payment function's service identity can reserve or finalize orders.
create or replace function public.lms_reserve_course_order(
  target_user_id uuid, target_course_id uuid, expected_amount integer, target_provider text
) returns public.lms_course_orders
language plpgsql security definer set search_path = public as $$
declare
  saved public.lms_course_orders%rowtype;
  actual_price numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_course_id::text, 0));
  if not exists (select 1 from public.users where id = target_user_id and role = 'student' and deleted_at is null and lower(coalesce(status, 'active')) = 'active') then
    raise exception 'Active student required';
  end if;
  select price::numeric into actual_price from public.courses
    where id = target_course_id and deleted_at is null and lower(status) = 'active';
  if actual_price is null or actual_price < 0 or actual_price <> expected_amount then
    raise exception 'Course price or availability changed';
  end if;
  select * into saved from public.lms_course_orders
    where user_id = target_user_id and course_id = target_course_id
      and (status in ('pending', 'processing') or (status = 'success' and exists (
        select 1 from public.user_courses where user_id = target_user_id and course_id = target_course_id
          and deleted_at is null and status = 'active')))
    order by created_at desc limit 1;
  if found then return saved; end if;
  insert into public.lms_course_orders(user_id, course_id, amount, currency, status, provider, provider_order_id)
    values(target_user_id, target_course_id, expected_amount, 'INR', 'pending', target_provider, 'jnv_' || replace(gen_random_uuid()::text, '-', ''))
    returning * into saved;
  return saved;
end;
$$;

create or replace function public.lms_complete_course_order(target_order_id uuid, verified_provider jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  paid_order public.lms_course_orders%rowtype;
  enrollment public.user_courses%rowtype;
  student public.users%rowtype;
  ids jsonb;
begin
  select * into paid_order from public.lms_course_orders where id = target_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if paid_order.status = 'refunded' then raise exception 'Order refunded'; end if;
  if not exists(select 1 from public.courses where id = paid_order.course_id and deleted_at is null and lower(status) = 'active') then
    raise exception 'Course is no longer available';
  end if;
  if paid_order.amount > 0 then
    if verified_provider->>'order_status' is distinct from 'PAID'
      or verified_provider->>'order_id' is distinct from paid_order.provider_order_id
      or (verified_provider->>'order_amount')::numeric is distinct from paid_order.amount::numeric
      or verified_provider->>'order_currency' is distinct from paid_order.currency then
      raise exception 'Verified payment does not match order';
    end if;
  elsif verified_provider->>'free_course' is distinct from 'true' then
    raise exception 'Invalid free course verification';
  end if;
  -- Serialize projection updates across different courses purchased by one user.
  select * into student from public.users where id = paid_order.user_id for update;
  if not found or student.deleted_at is not null or student.role <> 'student' or lower(coalesce(student.status, 'active')) <> 'active' then
    raise exception 'Active student required';
  end if;
  select * into enrollment from public.user_courses
    where course_id = paid_order.course_id
      and (user_id = paid_order.user_id or student_id = paid_order.user_id or learner_id = paid_order.user_id)
    order by (deleted_at is null and coalesce(status, 'active') = 'active') desc, created_at desc
    limit 1 for update;
  if found then
    update public.user_courses set user_id = paid_order.user_id, student_id = paid_order.user_id,
      learner_id = paid_order.user_id, status = 'active', deleted_at = null
      where id = enrollment.id returning * into enrollment;
  else
    insert into public.user_courses(user_id, student_id, learner_id, course_id, status)
      values(paid_order.user_id, paid_order.user_id, paid_order.user_id, paid_order.course_id, 'active')
      returning * into enrollment;
  end if;
  insert into public.lms_course_payments(order_id, user_id, course_id, amount, currency, provider,
      provider_payment_id, provider_order_id, status, verified_at, raw_payload)
    values(paid_order.id, paid_order.user_id, paid_order.course_id, paid_order.amount, paid_order.currency,
      paid_order.provider, paid_order.provider_order_id, paid_order.provider_order_id, 'success', now(), verified_provider)
    on conflict(provider, provider_payment_id) do update set verified_at = now(), raw_payload = excluded.raw_payload;
  ids := coalesce(to_jsonb(student.course_ids), '[]'::jsonb);
  if jsonb_typeof(ids) = 'string' then ids := (ids #>> '{}')::jsonb; end if;
  if jsonb_typeof(ids) <> 'array' then ids := '[]'::jsonb; end if;
  if not ids @> jsonb_build_array(paid_order.course_id::text) then
    perform public.lms_admin_update_user_assignment(student.id, null, ids || jsonb_build_array(paid_order.course_id::text));
  end if;
  update public.lms_course_orders set status = 'success', updated_at = now(),
    metadata = metadata || jsonb_build_object('enrollment_id', enrollment.id)
    where id = paid_order.id returning * into paid_order;
  return jsonb_build_object('order', to_jsonb(paid_order), 'enrollment', to_jsonb(enrollment), 'payment_status', 'success');
end;
$$;

revoke all on function public.lms_reserve_course_order(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.lms_complete_course_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lms_reserve_course_order(uuid, uuid, integer, text) to service_role;
grant execute on function public.lms_complete_course_order(uuid, jsonb) to service_role;
commit;
