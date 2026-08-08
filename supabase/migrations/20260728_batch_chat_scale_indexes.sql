-- Keep batch chat reads fast as cohorts grow.
create index if not exists idx_lms_chats_batch_created_at
  on public.batch_chats(batch_id, created_at desc);
