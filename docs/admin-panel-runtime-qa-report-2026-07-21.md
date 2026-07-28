# LMS Admin Panel Runtime QA, UAT, Security, and Automation Report

## Executive Summary

This pass tested the running LMS application in the browser, not only the source code. I started the Next dev server, attempted to use `/admin.html`, identified a runtime script-execution failure in the Next legacy wrapper, patched the local legacy script runner, built the app, tested the production server, and then served the legacy static app directly so the original HTML scripts could execute.

Authenticated Admin Panel CRUD could not be completed because no QA admin email/password was provided and the app correctly requires live Supabase Auth before allowing admin access. I did not bypass authentication or spoof an admin session. I continued with all safe runtime tests that were reachable without credentials.

No test data was created. No uploads were performed. Cleanup was therefore verification-only.

**Production Readiness Score:** 48 / 100

## Environment

| Item | Value |
|---|---|
| Date | 2026-07-21 |
| Tester | Codex, Senior QA/UAT/Security/Automation Tester |
| Workspace | `E:\dd\dd` |
| Next dev URL | `http://localhost:3000` |
| Next production URL | `http://localhost:3001` |
| Static legacy URL | `http://localhost:3002` |
| Backend | Supabase project configured in `supabase-config.js` |
| Browser | Codex in-app browser automation |
| Upload usage | 0 bytes / 1 GB |

## Features Tested

| Feature | Action | Expected Result | Actual Result | Status | Bug ID |
|---|---|---|---|---|---|
| Admin route, Next dev | Open `http://localhost:3000/admin.html` | Admin scripts load and navigation works | Static HTML rendered, but legacy scripts did not execute; nav/buttons inert | FAIL | BUG-RUN-001 |
| Admin route, Next production | Open `http://localhost:3001/admin.html` | Admin scripts load and navigation works | Static HTML rendered, but legacy scripts still did not execute | FAIL | BUG-RUN-001 |
| Static admin route | Open `http://localhost:3002/admin.html` without session | Redirect to login | Redirected to `login.html?next=admin` | PASS |  |
| Login validation | Submit empty login form | Stay on login / prevent submit | Stayed on login | PASS |  |
| Login validation | Submit invalid QA credentials | Error message and re-enabled login button | Invalid email/password message shown | PASS |  |
| Login security | Enter XSS and SQLi-style payloads in login fields | No script execution, no auth bypass | No dialog opened; remained on login | PASS |  |
| Responsive desktop | Load login at 1440x900 | Login form usable | Email input visible | PASS |  |
| Responsive tablet | Load login at 768x1024 | Login form usable | Email input visible | PASS |  |
| Responsive mobile | Load login at 390x844 | Login form usable | Email input visible | PASS |  |
| Admin CRUD | Create/read/update/delete admin records | Records created and cleaned up | Blocked by missing QA admin credentials | BLOCKED | BLK-RUN-001 |

## Features Not Tested

The following were blocked because authenticated admin access requires valid Supabase Auth credentials and none were provided:

- Dashboard authenticated data loading
- Courses create/read/update/delete
- 20-course creation requirement
- Course publish/unpublish
- Course duplicate/archive/delete
- Module create/edit/delete/duplicate/reorder/collapse/expand
- Lessons: text, video, PDF, assignment, quiz, external link
- Video link matrix and playback validation
- PDF upload/preview/download/replace/delete
- Quiz create/edit/delete/publish/preview/attempt/score
- Assignment create/edit/delete/submit/grade
- Student/mentor/admin create/edit/deactivate/delete
- User import/export with real database persistence
- Search/filter across authenticated pages
- Batch chat posting
- Announcements CRUD
- Support replies and attachments
- Shop item CRUD and image upload
- Database persistence verification
- Cleanup of created test records

## Test Totals

| Metric | Count |
|---|---:|
| Total runtime test cases executed | 10 |
| Passed | 7 |
| Failed | 2 |
| Blocked | 1 grouped blocker covering authenticated admin CRUD |
| Skipped | 0 |
| Pass rate for executed non-blocked tests | 77.8% |

## Bug List

### BUG-RUN-001: Next-served legacy Admin Panel renders inert HTML because legacy scripts do not execute

**Module:** Next legacy HTML rendering / Admin runtime
**Severity:** Critical
**Priority:** P0
**Environment:** `http://localhost:3000/admin.html`, `http://localhost:3001/admin.html`
**Steps to Reproduce:**

1. Start the app with `npm.cmd run dev` or `npm.cmd run start -- -p 3001`.
2. Open `/admin.html`.
3. Click sidebar navigation such as Courses.
4. Inspect runtime globals.

**Expected Result:** Admin JavaScript initializes, Supabase/auth globals are available, navigation changes views, buttons open modals.
**Actual Result:** HTML is visible, but `window.getSupabaseClient`, `window.JenovateAuth`, and Supabase are unavailable in the rendered page; navigation clicks do not change active view; buttons are inert.
**Root Cause:** The Next legacy wrapper injects legacy HTML and script tags in a way that does not execute the required legacy scripts in the running Next page.
**Suggested Fix:** Serve legacy pages as real static documents, or use a client-side script runner that reliably mounts and appends the original scripts after hydration. Also add an E2E smoke test that clicks admin navigation and asserts the active view changes.
**Screenshot Reference:** Browser state observed; no screenshot file saved.

### BLK-RUN-001: Authenticated Admin UAT blocked by missing QA credentials

**Module:** Authentication / Test Environment
**Severity:** High
**Priority:** P0
**Environment:** `http://localhost:3002/login.html?next=admin`
**Steps to Reproduce:**

1. Open static-served admin page.
2. App redirects to login.
3. Submit invalid credentials.

**Expected Result:** Tester has a valid QA admin account for authorized CRUD testing.
**Actual Result:** Invalid credentials are rejected; no valid QA admin credentials were supplied.
**Root Cause:** Test request authorized QA operations but did not provide login credentials or a pre-authenticated browser session.
**Suggested Fix:** Provide a disposable QA admin login, or seed a local/sandbox Supabase Auth user before running the full CRUD pass.
**Screenshot Reference:** Not saved.

## Performance Results

| Scenario | Result |
|---|---:|
| Unauthenticated admin redirect to login | 5,928 ms |
| Invalid login error response | 14,333 ms |
| Next production build | Passed |
| Authenticated dashboard load | Blocked |
| Course save/search/filter/publish/delete timing | Blocked |

The invalid login response is functional but slow for a negative-path auth request. Target should be under 5 seconds for good UAT experience.

## Security Results

| Test | Result |
|---|---|
| Unauthorized admin URL access | PASS, redirected to login |
| Invalid credentials | PASS, rejected |
| XSS payload in login email | PASS, no alert/dialog execution |
| SQLi-style password payload | PASS, no bypass |
| Broken access control after auth | BLOCKED, credentials required |
| Privilege escalation | BLOCKED, credentials required |
| IDOR/JWT manipulation | BLOCKED, credentials required |
| Rate limiting | BLOCKED, needs authenticated endpoint and safe test window |
| Session timeout | BLOCKED, credentials required |

## UI Findings

- Static login UI renders at desktop, tablet, and mobile viewport sizes.
- Login email input remains visible across tested viewports.
- Next-served admin shell visually renders, but is not interactive due script execution failure.
- Static-served admin correctly redirects unauthenticated users to login.

## Cleanup Summary

| Cleanup Item | Result |
|---|---|
| Test courses removed | Not applicable, none created |
| Test modules removed | Not applicable, none created |
| Test lessons removed | Not applicable, none created |
| Test quizzes removed | Not applicable, none created |
| Test assignments removed | Not applicable, none created |
| Test uploads removed | Not applicable, none uploaded |
| Orphaned records | None created by this session |
| Database restored | Database was not modified |

## Remaining Issues

1. Fix the Next-served admin runtime so scripts execute and buttons work.
2. Provide valid QA admin credentials or a pre-authenticated QA browser session.
3. Rerun full authenticated CRUD/UAT using only prefixed test data.
4. Add browser automation to CI for `/admin.html` navigation, modal opening, create/save validation, and auth redirects.
5. Complete cleanup verification after the authenticated test run creates records.

## Recommendations

- Treat BUG-RUN-001 as a release blocker because it makes the Admin Panel unusable through the Next-served application.
- Provide a seeded QA admin account before requesting full CRUD testing.
- Add a smoke test that fails if `window.getSupabaseClient` and `window.JenovateAuth` are unavailable or if sidebar navigation does not change views.
- Track generated QA records with a prefix such as `QA-AUTO-YYYYMMDD-HHMMSS` and clean up by that prefix after tests.

## Final Recommendation

Do not approve production readiness yet. The admin panel must be interactive through the actual deployed serving path, and a complete authenticated CRUD pass must be executed in the QA environment.
