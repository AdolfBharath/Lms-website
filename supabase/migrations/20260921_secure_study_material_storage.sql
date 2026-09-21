-- Study materials are protected by the course enrollment that references them.
-- New mentor uploads retain the existing <mentor-profile-id>/<file> path shape.
begin;

drop policy if exists lms_storage_read on storage.objects;
drop policy if exists lms_storage_insert on storage.objects;
drop policy if exists lms_storage_update on storage.objects;
drop policy if exists lms_storage_delete on storage.objects;

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
    or (
      bucket_id = 'study-materials'
      and exists (
        select 1
        from public.courses c
        where c.deleted_at is null
          and public.lms_current_role() = 'student'
          and exists (
            select 1
            from public.user_courses uc
            where uc.course_id = c.id
              and coalesce(uc.user_id, uc.student_id, uc.learner_id) = public.lms_current_user_id()
              and uc.deleted_at is null
              and coalesce(lower(uc.status), 'active') not in ('archived', 'deleted', 'inactive', 'cancelled', 'removed')
          )
          and c.modules::text like '%' || storage.objects.name || '%'
      )
    )
  )
);

create policy lms_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (
    public.lms_is_admin()
    or (storage.foldername(name))[1] = public.lms_current_user_id()::text
  )
  and lower(coalesce(metadata->>'mimetype', '')) in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  )
);

create policy lms_storage_update on storage.objects for update to authenticated
using (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (public.lms_is_admin() or (storage.foldername(name))[1] = public.lms_current_user_id()::text)
)
with check (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (public.lms_is_admin() or (storage.foldername(name))[1] = public.lms_current_user_id()::text)
);

create policy lms_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (public.lms_is_admin() or (storage.foldername(name))[1] = public.lms_current_user_id()::text)
);

commit;
