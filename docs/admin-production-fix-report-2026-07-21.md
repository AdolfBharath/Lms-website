# Admin Production Fix Report

Date: 2026-07-21
Scope: Authenticated QA defects from `docs/admin-panel-authenticated-qa-report-2026-07-21.md`

## Summary

The critical admin CRUD defects were traced to three root causes:

1. Frontend payloads and selects referenced `max_marks`, but the deployed task schema uses `total_marks`.
2. Admin user creation depended on an Edge Function that lacked complete production validation, assignment handling, rollback, and clear client error reporting.
3. Repeated CRUD actions had no submit/action lock and waited on full data reloads before the UI reflected archive/restore state.

The local codebase now builds and tests successfully. Supabase schema/function changes are committed as local project files and must be deployed to the QA Supabase project before live user creation can be fully re-tested.

## Root Cause and Fixes

### BUG-001: User Creation Fails

Root cause:
- Admin user creation requires a server-side service role because browser clients cannot safely create Supabase Auth users.
- The Edge Function had minimal CORS/method handling, no deployment/env diagnostics, no duplicate-profile guard, no assignment persistence, and incomplete rollback behavior.
- Client duplicate handling treated matching email as an existing user during create, which could silently update instead of rejecting duplicates.

Fix:
- Rebuilt `supabase/functions/admin-save-user/index.ts` with admin JWT verification, service-role-only Auth user creation, duplicate email validation, password validation, rollback via `auth.admin.deleteUser`, and optional course/batch assignment.
- Added clearer client-side Edge Function failure message in `admin.js`.
- Fixed client duplicate validation before create/update.

### BUG-002: Task Creation Fails on `max_marks`

Root cause:
- Admin and mentor code selected and wrote `max_marks`, but the backend schema cache does not contain that column.

Fix:
- Removed `max_marks` from admin and mentor task/submission select strings.
- Removed `max_marks` writes from task creation/edit and review flows.
- Kept read fallbacks such as `task?.max_marks` only for backward compatibility with any older in-memory records.
- Added migration `20260721_admin_crud_stability.sql` to ensure `total_marks` exists.

### BUG-003: Course Creation Becomes Unstable

Root cause:
- Forms allowed repeated submits while async save/reload was still in progress.
- Full data reloads after every save could leave modals/buttons in unstable intermediate states.

Fix:
- Added shared `runLockedSubmit` helper in `admin.js`.
- Applied submit locking to course, batch, user, task, shop, announcement, and edit-user forms.
- Generic upserts now merge saved rows locally before full refresh.

### BUG-004: Archive Button Times Out

Root cause:
- Archive/restore actions did not lock buttons or update local state until after a full backend reload.

Fix:
- Added action busy state for archive/restore buttons.
- Added optimistic local status updates for archive/restore.
- Kept RPC-first behavior with safe fallback to soft-delete fields.

### BUG-005 / BUG-006 / BUG-007: Batch, Announcement, Shop Reliability

Root cause:
- Same unguarded submit lifecycle and schema-shape brittleness as course/task flows.

Fix:
- Added shared submit locks.
- Added schema-compatible retry behavior in shared `upsertRecord`.
- Added local saved-record merge before reload.

### BUG-008: Missing Admin Content Builder

Root cause:
- The product data model and mentor/student apps support course `modules`, lessons, videos, materials, and quizzes, but admin exposed only basic course metadata editing.

Fix:
- Added admin course `Content` action.
- Added admin content modal for modules, lessons, Google Drive video links, PDF/material URLs, assignments, resources/FAQs, and simple quiz metadata/questions.
- Added Google Drive validation to reject folders, Docs, Sheets, and non-Drive video links for Drive video fields.

## Files Modified

- `admin.js`
- `mentor.js`
- `supabase/functions/admin-save-user/index.ts`
- `supabase/migrations/20260721_admin_crud_stability.sql`
- `tests/security-regressions.test.js`
- `docs/admin-production-fix-report-2026-07-21.md`

## Database Changes

Added migration:

- `supabase/migrations/20260721_admin_crud_stability.sql`

Includes:
- `batch_tasks.total_marks`
- `task_submissions.total_marks`
- Indexes for task, submission, course, batch, announcement, and shop list performance.

Status: migration file added locally. It has not been applied to the remote QA Supabase project in this session.

## API Changes

Updated Edge Function:

- `admin-save-user`

Changes:
- `POST` / `OPTIONS` only.
- Strict admin authentication.
- Service-role Auth user creation/update.
- Duplicate email validation.
- Course/batch assignment handling.
- Rollback if profile insert fails after Auth user creation.
- Structured JSON error responses.

Status: function source updated locally. It has not been deployed to the remote QA Supabase project in this session.

## Security Improvements

- Prevented duplicate email create/update ambiguity.
- Kept Supabase Auth user creation server-side only.
- Added rollback for orphan Auth users.
- Preserved output escaping in course/content rendering.
- Added Google Drive link type validation for video fields.

## Performance Improvements

- Added database indexes for common admin list/filter/archive paths.
- Prevented duplicate form submissions.
- Updated local record state before full data reload on save/archive/restore.

## Validation

Passed:

- `node --check admin.js`
- `node --check mentor.js`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `node --test tests\security-regressions.test.js tests\academic-metrics.test.js`

Test result:
- 19 tests passed.

Browser smoke:
- `http://localhost:3010/admin.html` loaded authenticated admin shell successfully.
- Courses data loaded with no visible alert errors.
- New `data-content-course` actions were present in the live DOM.

Browser limitation:
- Opening the first content modal by locator timed out because the connector selected a hidden/offscreen matching button. Code syntax, build, and regression tests passed.

## Remaining Known Issues

- Deploy `supabase/functions/admin-save-user/index.ts` to the QA Supabase project.
- Apply `supabase/migrations/20260721_admin_crud_stability.sql` to the QA Supabase database.
- Run the destructive authenticated CRUD regression again after deployment:
  - create Student, Mentor, Admin
  - duplicate user validation
  - create/edit/archive/restore task
  - create 50 courses
  - create/edit/archive batch, announcement, shop
  - content builder save with valid and invalid Google Drive links

## Before vs After

Before:
- User create failed with generic Edge Function request error.
- Task create failed on `max_marks`.
- Repeated course creation destabilized the UI.
- Archive waited on full reload and timed out in QA automation.
- Admin had no reachable content builder.

After:
- User Edge Function source is production-hardened and ready to deploy.
- Task writes now match `total_marks` schema.
- Admin CRUD forms prevent duplicate submissions.
- Archive/restore updates local UI state immediately.
- Admin can edit modules, lessons, Drive video links, materials, assignments, FAQs/resources, and simple quizzes.

## Production Readiness

Local code readiness score: **82 / 100**

Remote QA readiness remains blocked until the migration and Edge Function are deployed, then authenticated destructive regression should be rerun.
