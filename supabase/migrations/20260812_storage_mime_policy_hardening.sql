begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'support-attachments',
    'support-attachments',
    false,
    10485760,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  ),
  (
    'assignment-submissions',
    'assignment-submissions',
    false,
    26214400,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  ),
  (
    'study-materials',
    'study-materials',
    false,
    52428800,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
  and (
    (bucket_id = 'support-attachments' and lower(coalesce(metadata->>'mimetype', '')) in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'image/png',
      'image/jpeg',
      'image/webp'
    ))
    or (bucket_id = 'assignment-submissions' and lower(coalesce(metadata->>'mimetype', '')) in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'image/png',
      'image/jpeg',
      'image/webp'
    ))
    or (bucket_id = 'study-materials' and lower(coalesce(metadata->>'mimetype', '')) in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/webp'
    ))
  )
);

create policy lms_storage_update on storage.objects for update to authenticated
using (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (
    public.lms_is_admin()
    or (storage.foldername(name))[1] = public.lms_current_user_id()::text
  )
)
with check (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (
    public.lms_is_admin()
    or (storage.foldername(name))[1] = public.lms_current_user_id()::text
  )
);

create policy lms_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('support-attachments', 'assignment-submissions', 'study-materials')
  and (
    public.lms_is_admin()
    or (storage.foldername(name))[1] = public.lms_current_user_id()::text
  )
);

commit;
