-- Admin CRUD stability fixes for task marks, soft delete, and repeated dashboard loading.

alter table if exists public.batch_tasks
  add column if not exists total_marks numeric;

alter table if exists public.task_submissions
  add column if not exists total_marks numeric;

create index if not exists idx_batch_tasks_status_deleted_created
  on public.batch_tasks (status, deleted_at, created_at desc);

create index if not exists idx_task_submissions_task_deleted_created
  on public.task_submissions (task_id, deleted_at, created_at desc);

create index if not exists idx_courses_status_deleted_created
  on public.courses (status, deleted_at, created_at desc);

create index if not exists idx_batches_status_deleted_created
  on public.batches (status, deleted_at, created_at desc);

create index if not exists idx_announcements_status_published
  on public.announcements (status, published_at desc);

create index if not exists idx_shop_items_created
  on public.shop_items (created_at desc);
