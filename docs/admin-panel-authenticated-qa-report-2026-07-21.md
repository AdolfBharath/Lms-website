# Jenovate LMS Admin Authenticated QA Report

Date: 2026-07-21
Tester: Codex acting as Senior QA, UAT, Security, and Automation Tester
Target requested: `file:///E:/dd/dd/admin.html`
Executed target: `http://localhost:3010/admin.html`, served from the same `E:\dd\dd` folder because the in-app browser blocks direct `file://` navigation.
Credentials used: `admin@jenovate.com`
Session test prefix: `QA-AUTH-2026-07-21T05-29-27-048Z`

## Executive Summary

Authenticated login succeeded and the admin dashboard loaded real QA data. All reachable sidebar admin pages opened, but several core CRUD flows failed during execution. Course creation worked until the UI became unstable after 11 created courses. User creation failed for all tested roles because the Edge Function request failed. Task creation failed because the frontend submits `max_marks`, but the backend schema cache does not contain that column.

Production readiness: **Not ready**
Suggested readiness score: **38 / 100**

## Cleanup Result

Cleanup is verified complete for data created in this authenticated session.

- Created 11 course records with the prefix `QA-AUTH-2026-07-21T05-29-27-048Z`.
- UI cleanup through the Archive button failed due automation/browser click timeouts.
- Backend cleanup was run against the Supabase project configured in `supabase-config.js`.
- Verification result: all 11 prefixed courses now have `status = archived` and `deleted_at` set.
- No users, batches, tasks, announcements, or shop items were successfully created, so no cleanup was required for those entities.

The product uses soft-delete semantics for admin cleanup (`status: archived`, `deleted_at`) rather than physical row deletion.

## Coverage

### Authentication

| Test | Result | Evidence |
| --- | --- | --- |
| Admin login with valid QA credentials | Pass | Redirected to Admin dashboard |
| Admin data sync after login | Pass | Dashboard showed synced admin metrics after load |
| Continue testing after login | Pass | All reachable admin views were exercised |

### Navigation

| Page | Result |
| --- | --- |
| Dashboard | Pass |
| Users | Pass |
| Enrollments | Pass |
| Courses | Pass |
| Batches | Pass |
| Tasks | Pass |
| Batch Chat | Pass |
| Announcements | Pass |
| Support | Pass |
| Reviews | Pass |
| Shop | Pass |
| Profile / Settings | Pass |

### CRUD / UAT

| Area | Result | Notes |
| --- | --- | --- |
| Courses - Create | Partial fail | 11 courses were created; test target of 20 courses was blocked when the course modal/list became unstable. |
| Courses - Validation/security text | Pass | XSS-like text rendered as text in course cards; no script dialog executed. |
| Courses - Archive through UI | Fail | Archive button clicks timed out. Backend cleanup was required. |
| Users - Create Student | Fail | Alert: `Failed to send a request to the Edge Function`. |
| Users - Create Mentor | Fail | Same Edge Function failure. |
| Users - Create Admin | Fail | Same Edge Function failure. |
| Batches - Create | Fail | `#addBatchBtn` click timed out during test execution. |
| Tasks - Create | Fail | Alert: `Could not find the 'max_marks' column of 'batch_tasks' in the schema cache`. |
| Announcements - Create | Fail | `#addAnnouncementBtn` click timed out during test execution. |
| Shop - Create | Fail | Flow remained blocked after task schema alert; no item was created. |
| Modules / lessons / video / PDF / quiz / certificate builder | Blocked | No complete reachable CRUD builder was found in the tested admin UI. |

## Defects

### QA-AUTH-001: User creation fails for all roles

Severity: Critical

Steps:
1. Log in as admin.
2. Open Users.
3. Attempt to add Student, Mentor, and Admin test users.

Actual: Each attempt fails with `Failed to send a request to the Edge Function`.

Expected: Admin can create all supported user roles or receives a field-level validation error.

### QA-AUTH-002: Task creation payload does not match backend schema

Severity: Critical

Steps:
1. Log in as admin.
2. Open Tasks.
3. Submit a new task.

Actual: Save fails with `Could not find the 'max_marks' column of 'batch_tasks' in the schema cache`.

Expected: Task is created successfully, or frontend payload matches the deployed schema.

### QA-AUTH-003: Course creation becomes unstable during repeated admin entry

Severity: High

Actual: Course creation succeeded for 11 prefixed records, then the course modal/list became unreliable and could not continue to the required 20-course data setup.

Expected: Repeated course creation should remain stable and allow bulk admin setup.

### QA-AUTH-004: Course Archive UI cannot be relied on for cleanup

Severity: High

Actual: Archive button clicks on prefixed course cards timed out. Cleanup had to be completed through the configured backend using the same soft-delete fields.

Expected: Archive action should be clickable, confirmable, and complete within a reasonable time.

### QA-AUTH-005: Batch and announcement create actions time out

Severity: High

Actual: `#addBatchBtn` and `#addAnnouncementBtn` interactions timed out during authenticated admin testing.

Expected: Create modals open reliably and allow CRUD validation.

### QA-AUTH-006: Admin content-builder coverage is incomplete or not reachable

Severity: High

Actual: Full modules, lessons, video, PDF, quiz, certificate, and publish/unpublish CRUD workflows were not reachable as complete admin features during this run.

Expected: Admin LMS should expose complete content management workflows or clearly route to the correct builder.

## Security Notes

- XSS-like course description text was rendered visibly as text and did not execute during card display.
- SQLi-like text in course description did not break course rendering.
- Deeper role-access, direct-object-reference, file-upload, and destructive authorization testing could not be completed because key CRUD flows failed before usable test records could be created.

## Recommendation

Fix the critical backend integration issues first:

1. Repair or deploy `admin-save-user` Edge Function access for admin user creation.
2. Align `batch_tasks` frontend payload and Supabase schema for `max_marks` / `total_marks`.
3. Stabilize Course modal and Archive button interactions under repeated use.
4. Re-run full CRUD, upload, enrollment, publishing, and security tests after those fixes.
