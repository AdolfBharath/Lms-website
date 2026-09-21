begin;

drop policy if exists "Strict users update" on public.users;

create policy "Strict users update" on public.users for update
using (private.is_lms_admin())
with check (private.is_lms_admin());

commit;
