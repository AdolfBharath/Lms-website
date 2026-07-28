-- Jenovate LMS security hardening and missing backend primitives.
-- Apply after 20260714_lms_rbac_rls.sql.

begin;

-- A user may edit presentation fields, but never authorization, ownership,
-- account-state, or reward fields. This trigger is a second line of defence
-- behind the narrower UPDATE policy below.
create or replace function public.lms_protect_user_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists lms_protect_user_security_fields on public.users;
create trigger lms_protect_user_security_fields
before update on public.users
for each row execute function public.lms_protect_user_security_fields();

drop policy if exists users_self_read_update on public.users;
drop policy if exists users_self_read on public.users;
drop policy if exists users_self_profile_update on public.users;
drop policy if exists users_student_batch_mentor_read on public.users;

create policy users_self_read on public.users for select
using (id = public.lms_current_user_id());

create policy users_self_profile_update on public.users for update
using (id = public.lms_current_user_id())
with check (id = public.lms_current_user_id());

-- Students receive only directory-safe fields. Email, phone, coins, referral,
-- account status, and other profile fields never leave this function.
create or replace function public.lms_student_directory()
returns table (
  id uuid,
  name text,
  username text,
  role text,
  batch_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.name, u.username, lower(coalesce(u.role, 'student')), u.batch_id
  from public.users u
  where auth.uid() is not null
    and public.lms_current_role() = 'student'
    and u.deleted_at is null
    and coalesce(lower(u.status), 'active') not in ('archived', 'disabled', 'blocked', 'suspended')
    and (
      u.id = public.lms_current_user_id()
      or u.batch_id = (select batch_id from public.lms_current_profile())
      or u.id in (
        select b.mentor_id
        from public.batches b
        where b.id = (select batch_id from public.lms_current_profile())
      )
    )
$$;

-- Daily rewards use the LMS timezone and reset the streak every Monday.
create or replace function public.lms_claim_daily_login_reward(target_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.users%rowtype;
  reward_date date := timezone('Asia/Kolkata', now())::date;
  reward_amount integer := 10;
  did_claim boolean := false;
begin
  select * into profile
  from public.users
  where id = public.lms_current_user_id()
  for update;

  if profile.id is null or (target_user_id is not null and target_user_id <> profile.id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if profile.last_login_reward_date is distinct from reward_date then
    update public.users
    set coins = coalesce(coins, 0) + reward_amount,
        last_login_reward_date = reward_date,
        last_active_date = reward_date,
        streak_count = case
          when last_active_date = reward_date - 1
            and date_trunc('week', last_active_date::timestamp) = date_trunc('week', reward_date::timestamp)
            then least(coalesce(streak_count, 0) + 1, 7)
          when last_active_date = reward_date then coalesce(streak_count, 1)
          else 1
        end
    where id = profile.id
    returning * into profile;
    did_claim := true;
  end if;

  if profile.last_active_date = reward_date
    and coalesce(profile.streak_count, 0) > extract(isodow from reward_date)::integer then
    update public.users
    set streak_count = extract(isodow from reward_date)::integer
    where id = profile.id
    returning * into profile;
  end if;

  return jsonb_build_object(
    'claimed', did_claim,
    'reward_amount', case when did_claim then reward_amount else 0 end,
    'coins', coalesce(profile.coins, 0),
    'last_login_reward_date', profile.last_login_reward_date,
    'streak_count', coalesce(profile.streak_count, 0),
    'last_active_date', profile.last_active_date
  );
end;
$$;

-- A shop purchase and coin debit commit together under a row lock.
create or replace function public.lms_purchase_shop_item(target_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.users%rowtype;
  item public.shop_items%rowtype;
  purchase_id uuid;
begin
  select * into profile from public.users
  where id = public.lms_current_user_id()
    and public.lms_current_role() = 'student'
  for update;

  select * into item from public.shop_items where id = target_item_id;
  if profile.id is null or item.id is null then
    raise exception 'Student or shop item not found';
  end if;
  if coalesce(profile.coins, 0) < coalesce(item.price, 0) then
    raise exception 'Insufficient coins' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shop_purchases p where p.user_id = profile.id and p.item_id = item.id) then
    raise exception 'Reward already owned' using errcode = '23505';
  end if;

  insert into public.shop_purchases (user_id, item_id, purchased_at)
  values (profile.id, item.id, now())
  returning id into purchase_id;

  update public.users
  set coins = coalesce(coins, 0) - coalesce(item.price, 0)
  where id = profile.id
  returning * into profile;

  return jsonb_build_object('purchase_id', purchase_id, 'item_id', item.id, 'coins', profile.coins);
end;
$$;

-- Submissions may be repeated, but the reward is granted only for the first
-- submission of a task. The write and reward share one transaction.
create or replace function public.lms_submit_task_once(
  target_task_id uuid,
  target_student_id uuid,
  submission_drive_link text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.users%rowtype;
  task public.batch_tasks%rowtype;
  submission_id uuid;
  first_submission boolean;
  reward_amount integer := 10;
begin
  select * into profile from public.users
  where id = public.lms_current_user_id()
  for update;
  if profile.id is null or profile.id <> target_student_id or public.lms_current_role() <> 'student' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into task from public.batch_tasks where id = target_task_id;
  if task.id is null or task.batch_id is distinct from profile.batch_id then
    raise exception 'Task is not assigned to this student' using errcode = '42501';
  end if;

  select not exists (
    select 1 from public.task_submissions s
    where s.task_id = task.id and coalesce(s.student_id, s.user_id) = profile.id
  ) into first_submission;

  insert into public.task_submissions (
    task_id, student_id, user_id, batch_id, drive_link, file_url,
    status, submitted_at, created_at
  ) values (
    task.id, profile.id, profile.id, task.batch_id, submission_drive_link,
    submission_drive_link, case when first_submission then 'submitted' else 'resubmitted' end,
    now(), now()
  ) returning id into submission_id;

  if first_submission then
    update public.users set coins = coalesce(coins, 0) + reward_amount where id = profile.id;
  else
    reward_amount := 0;
  end if;

  return jsonb_build_object(
    'submission_id', submission_id,
    'first_submission', first_submission,
    'reward_amount', reward_amount
  );
end;
$$;

-- Public form storage. Direct anonymous table access is denied; all writes go
-- through lms_submit_public_form, which validates a honeypot and rate-limits
-- repeated submissions by normalized email address.
create table if not exists public.form_train_deploy_enquiries (
  id bigint generated by default as identity primary key,
  full_name text not null, email text not null, phone text not null,
  designation text, college text, placement_challenges text,
  collaboration_timeline text, students_count integer,
  preferred_program text, message text, source text default 'form-engine',
  files jsonb default '[]'::jsonb, submitted_at timestamptz default now()
);
create table if not exists public.form_student_registrations (
  id bigint generated by default as identity primary key,
  full_name text not null, email text not null, phone text not null,
  gender text, college text, course_interest text, goal text, reference_id text,
  source text default 'form-engine', files jsonb default '[]'::jsonb,
  submitted_at timestamptz default now()
);
create table if not exists public.form_mentor_registrations (
  id bigint generated by default as identity primary key,
  full_name text not null, email text not null, phone text not null,
  expertise text, experience_years numeric, availability text,
  source text default 'form-engine', files jsonb default '[]'::jsonb,
  submitted_at timestamptz default now()
);
create table if not exists public.form_launchpad_purchases (
  id bigint generated by default as identity primary key,
  student_name text not null, email text not null, phone text not null,
  plan text, payment_mode text, source text default 'form-engine',
  files jsonb default '[]'::jsonb, submitted_at timestamptz default now()
);
create table if not exists public.form_hiring_applications (
  id bigint generated by default as identity primary key,
  company_name text not null, contact_name text not null, email text not null,
  phone text not null, hiring_type text, skills text, openings integer,
  start_date date, job_summary text, source text default 'form-engine',
  files jsonb default '[]'::jsonb, submitted_at timestamptz default now()
);
create table if not exists public.form_event_registrations (
  id bigint generated by default as identity primary key,
  full_name text not null, email text not null, phone text not null,
  event text, attendance_mode text, city text, source text default 'form-engine',
  files jsonb default '[]'::jsonb, submitted_at timestamptz default now()
);
create table if not exists public.form_campus_ambassadors (
  id bigint generated by default as identity primary key,
  full_name text not null, email text not null, phone text not null,
  college text, city text, year_of_study text, social_profile text,
  campus_reach integer, why_join text, reference_id text,
  source text default 'form-engine', files jsonb default '[]'::jsonb,
  submitted_at timestamptz default now()
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'form_train_deploy_enquiries', 'form_student_registrations',
    'form_mentor_registrations', 'form_launchpad_purchases',
    'form_hiring_applications', 'form_event_registrations',
    'form_campus_ambassadors'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_read', table_name);
    execute format(
      'create policy %I on public.%I for select using (public.lms_is_admin())',
      table_name || '_admin_read', table_name
    );
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
  end loop;
end $$;

create or replace function public.lms_submit_public_form(
  form_category text,
  form_payload jsonb,
  website text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(form_payload->>'email'));
  submission_id bigint;
  recent_count integer := 0;
begin
  if coalesce(trim(website), '') <> '' then
    raise exception 'Submission rejected' using errcode = '22023';
  end if;
  if length(form_payload::text) > 50000 then
    raise exception 'Submission is too large' using errcode = '22023';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'A valid email is required' using errcode = '22023';
  end if;

  case form_category
    when 'train_deploy_enquiry' then
      select count(*) into recent_count from public.form_train_deploy_enquiries where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_train_deploy_enquiries (full_name,email,phone,designation,college,placement_challenges,collaboration_timeline,students_count,preferred_program,message,source,files)
      values (form_payload->>'full_name',normalized_email,form_payload->>'phone',form_payload->>'designation',form_payload->>'college',form_payload->>'placement_challenges',form_payload->>'collaboration_timeline',nullif(form_payload->>'students_count','')::integer,form_payload->>'preferred_program',form_payload->>'message',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    when 'student_registration' then
      select count(*) into recent_count from public.form_student_registrations where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_student_registrations (full_name,email,phone,gender,college,course_interest,goal,reference_id,source,files)
      values (form_payload->>'full_name',normalized_email,form_payload->>'phone',form_payload->>'gender',form_payload->>'college',form_payload->>'course_interest',form_payload->>'goal',form_payload->>'reference_id',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    when 'mentor_registration' then
      select count(*) into recent_count from public.form_mentor_registrations where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_mentor_registrations (full_name,email,phone,expertise,experience_years,availability,source,files)
      values (form_payload->>'full_name',normalized_email,form_payload->>'phone',form_payload->>'expertise',nullif(form_payload->>'experience_years','')::numeric,form_payload->>'availability',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    when 'launchpad_purchase' then
      select count(*) into recent_count from public.form_launchpad_purchases where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_launchpad_purchases (student_name,email,phone,plan,payment_mode,source,files)
      values (form_payload->>'student_name',normalized_email,form_payload->>'phone',form_payload->>'plan',form_payload->>'payment_mode',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    when 'hiring_application' then
      select count(*) into recent_count from public.form_hiring_applications where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_hiring_applications (company_name,contact_name,email,phone,hiring_type,skills,openings,start_date,job_summary,source,files)
      values (form_payload->>'company_name',form_payload->>'contact_name',normalized_email,form_payload->>'phone',form_payload->>'hiring_type',form_payload->>'skills',nullif(form_payload->>'openings','')::integer,nullif(form_payload->>'start_date','')::date,form_payload->>'job_summary',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    when 'event_registration' then
      select count(*) into recent_count from public.form_event_registrations where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_event_registrations (full_name,email,phone,event,attendance_mode,city,source,files)
      values (form_payload->>'full_name',normalized_email,form_payload->>'phone',form_payload->>'event',form_payload->>'attendance_mode',form_payload->>'city',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    when 'campus_ambassador' then
      select count(*) into recent_count from public.form_campus_ambassadors where lower(email) = normalized_email and submitted_at > now() - interval '1 hour';
      if recent_count >= 3 then raise exception 'Too many submissions. Please try again later' using errcode = 'P0001'; end if;
      insert into public.form_campus_ambassadors (full_name,email,phone,college,city,year_of_study,social_profile,campus_reach,why_join,reference_id,source,files)
      values (form_payload->>'full_name',normalized_email,form_payload->>'phone',form_payload->>'college',form_payload->>'city',form_payload->>'year_of_study',form_payload->>'social_profile',nullif(form_payload->>'campus_reach','')::integer,form_payload->>'why_join',form_payload->>'reference_id',coalesce(form_payload->>'source','form-engine'),coalesce(form_payload->'files','[]'::jsonb)) returning id into submission_id;
    else
      raise exception 'Unsupported form category' using errcode = '22023';
  end case;

  return jsonb_build_object('ok', true, 'id', submission_id);
end;
$$;

-- Private storage buckets. Object paths must start with the current LMS user id.
insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false),
       ('assignment-submissions', 'assignment-submissions', false),
       ('study-materials', 'study-materials', false)
on conflict (id) do update set public = false;

drop policy if exists lms_storage_read on storage.objects;
drop policy if exists lms_storage_insert on storage.objects;
create policy lms_storage_read on storage.objects for select to authenticated
using (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (
    public.lms_is_admin()
    or (storage.foldername(name))[1] = public.lms_current_user_id()::text
    or (
      bucket_id = 'assignment-submissions'
      and public.lms_is_assigned_student(
        case
          when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then (storage.foldername(name))[1]::uuid
          else null
        end
      )
    )
    or bucket_id = 'study-materials'
  )
);
create policy lms_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (
    public.lms_is_admin()
    or (storage.foldername(name))[1] = public.lms_current_user_id()::text
  )
);

revoke all on function public.lms_student_directory() from public;
revoke all on function public.lms_claim_daily_login_reward(uuid) from public;
revoke all on function public.lms_purchase_shop_item(uuid) from public;
revoke all on function public.lms_submit_task_once(uuid, uuid, text) from public;
revoke all on function public.lms_submit_public_form(text, jsonb, text) from public;
grant execute on function public.lms_student_directory() to authenticated;
grant execute on function public.lms_claim_daily_login_reward(uuid) to authenticated;
grant execute on function public.lms_purchase_shop_item(uuid) to authenticated;
grant execute on function public.lms_submit_task_once(uuid, uuid, text) to authenticated;
grant execute on function public.lms_submit_public_form(text, jsonb, text) to anon, authenticated;

commit;
