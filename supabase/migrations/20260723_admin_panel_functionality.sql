-- Admin panel functionality support for course images and shop lifecycle.

alter table if exists public.courses
  add column if not exists image_url text;

alter table if exists public.shop_items
  add column if not exists stock integer not null default 0,
  add column if not exists status text not null default 'active',
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shop_items_stock_nonnegative'
      and conrelid = 'public.shop_items'::regclass
  ) then
    alter table public.shop_items
      add constraint shop_items_stock_nonnegative check (stock >= 0) not valid;
  end if;

  begin
    alter table public.shop_items validate constraint shop_items_stock_nonnegative;
  exception when others then
    null;
  end;
end $$;

create index if not exists idx_shop_items_status_deleted_created
  on public.shop_items (status, deleted_at, created_at desc);

create index if not exists idx_courses_mentor_id
  on public.courses (mentor_id);

create index if not exists idx_user_courses_user_course_batch
  on public.user_courses (user_id, course_id, batch_id);

-- Keep purchase behavior consistent with admin-managed stock and disabled items.
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

  select * into item from public.shop_items where id = target_item_id for update;
  if profile.id is null or item.id is null then
    raise exception 'Student or shop item not found';
  end if;
  if coalesce(lower(item.status), 'active') <> 'active' or item.deleted_at is not null then
    raise exception 'Reward item is not available' using errcode = 'P0001';
  end if;
  if coalesce(item.stock, 0) <= 0 then
    raise exception 'Reward item is out of stock' using errcode = 'P0001';
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

  update public.shop_items
  set stock = greatest(coalesce(stock, 0) - 1, 0)
  where id = item.id;

  update public.users
  set coins = coalesce(coins, 0) - coalesce(item.price, 0)
  where id = profile.id
  returning * into profile;

  return jsonb_build_object('purchase_id', purchase_id, 'item_id', item.id, 'coins', profile.coins);
end;
$$;
