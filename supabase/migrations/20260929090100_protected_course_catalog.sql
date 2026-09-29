begin;
create or replace function public.lms_course_catalog()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select case when public.lms_student_has_course(c.id) or public.lms_is_admin() then to_jsonb(c)
    else jsonb_build_object(
      'id', c.id, 'title', c.title, 'description', c.description, 'category', c.category,
      'duration', c.duration, 'difficulty', c.difficulty, 'instructor_name', c.instructor_name,
      'thumbnail_url', c.thumbnail_url, 'price', c.price, 'status', c.status,
      'created_at', c.created_at, 'is_featured', c.is_featured,
      'modules', coalesce((select jsonb_agg(jsonb_build_object('title', m->>'title', 'description', m->>'description'))
        from jsonb_array_elements(case when jsonb_typeof(to_jsonb(c.modules)) = 'array' then to_jsonb(c.modules) else '[]'::jsonb end) m), '[]'::jsonb)
    ) end
  from public.courses c where c.deleted_at is null and lower(c.status) = 'active'
  order by c.title;
$$;
revoke all on function public.lms_course_catalog() from public;
grant execute on function public.lms_course_catalog() to anon, authenticated, service_role;
drop policy if exists "Public can read published courses" on public.courses;
drop policy if exists courses_students_active_only on public.courses;
create policy courses_students_active_only on public.courses for select to authenticated
using (public.lms_current_role() = 'student' and deleted_at is null
  and lower(coalesce(status, '')) = 'active' and public.lms_student_has_course(id));
commit;
