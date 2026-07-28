# Test Q&A

Generated from the project-level tests in `tests/` on 2026-07-23.

## Overview

**Q: What test suites are present?**

A: The repo has two project-level suites:

- `npm test`: Node's built-in test runner for regression checks in `tests/*.test.js`.
- `npm run test:smoke`: Playwright browser smoke tests in `tests/smoke/lms-smoke.spec.ts`.

**Q: What did the fast regression suite show?**

A: `npm.cmd test` passed with 29 tests, 29 passes, 0 failures.

**Q: What happened when the smoke suite was attempted?**

A: `npm.cmd run test:smoke` started the Playwright run, but all 6 smoke tests failed before reaching the app because the local Playwright Chromium executable is missing at `C:\Users\bhara\AppData\Local\ms-playwright\chromium_headless_shell-1228\chrome-headless-shell-win64\chrome-headless-shell.exe`.

**Q: Why was `npm.cmd test` used instead of `npm test`?**

A: PowerShell blocked `npm.ps1` because script execution is disabled on this machine. Calling `npm.cmd` runs the same npm script through the Windows command shim.

## Academic Metrics

**Q: What does `academic-metrics.test.js` cover?**

A: It checks the shared academic scoring helpers in `academic-metrics.js`.

**Q: How are simple percentages handled?**

A: Valid marks are converted into a 0-100 percentage, while invalid or zero totals return `null`.

**Q: What happens when there are no values to average?**

A: `averagePercent([])` returns `0`.

**Q: How are assignment and quiz performance totals calculated?**

A: The tests confirm pooled scoring: earned marks and maximum marks are summed first, then converted into one percentage.

**Q: What overall academic weights are approved by the tests?**

A: The tests verify a weighted calculation using 40/40/20 component weights.

**Q: How is course progress weighted?**

A: `courseProgress` uses 60% content, 20% assignments, and 20% quizzes. If a component is unavailable, its weight is redistributed across available components.

**Q: How are randomized quiz pass marks handled?**

A: `scaledPassMark` scales the configured pass requirement to the actual attempt size. If no configured pass mark exists, it defaults to a 60% pass threshold.

## Security And Data Integrity

**Q: What does `security-regressions.test.js` mainly protect?**

A: It protects security, authorization, RPC boundaries, admin user creation, schema compatibility, LMS startup behavior, and dashboard data integrity.

**Q: What authentication behavior is locked down?**

A: Role authorization must depend on a live Supabase Auth user, and legacy password login paths must not be present.

**Q: How are student purchases protected?**

A: Purchases must go through the atomic `lms_purchase_shop_item` RPC instead of directly inserting purchase records or mutating coin totals in the browser.

**Q: How are task rewards protected?**

A: Task submission rewards must come from the `lms_submit_task_once` RPC instead of a direct client-side reward function.

**Q: How are public forms protected?**

A: Public forms must use the validated `lms_submit_public_form` RPC, and the browser must not call EmailJS directly.

**Q: What external SDK dependency is controlled?**

A: App pages must use the vendored `assets/vendor/supabase-2.49.4.js` SDK and avoid the jsDelivr Supabase CDN.

**Q: What database security migration behavior is checked?**

A: The tests verify removal of broad student profile access and creation of hardened policies/functions such as self profile update, student directory, and atomic shop purchase RPCs.

**Q: How is the student leaderboard protected?**

A: The leaderboard must use the authorized aggregate `lms_student_leaderboard` RPC, avoid synthetic points, use current-user authorization, and avoid exposing email or phone fields.

**Q: What weekly streak rule is enforced?**

A: Student streaks use a Monday-to-Sunday LMS-local cycle based on the Asia/Kolkata date.

## Admin And Mentor Workflows

**Q: What task marking field is enforced?**

A: Admin and mentor task saves must use `total_marks` and must not write removed `max_marks` fields.

**Q: What course content management behavior is checked?**

A: Admin must expose production course content management with modal handling and Google Drive preview/link validation.

**Q: How is admin user creation protected?**

A: User creation must go through protected admin services, validate duplicates, link existing Auth users when possible, roll back created Auth users on failure, and avoid silently creating profile-only login accounts.

**Q: What service role protections are checked?**

A: The same-origin admin save API and Supabase Edge Function must require service-role configuration and admin authorization before creating or updating Auth users.

**Q: How are profile writes constrained?**

A: Admin save services must persist only allowlisted profile fields, retry without optional schema-drift fields, and avoid spreading arbitrary payload data into profile rows.

**Q: What password policy is enforced by tests?**

A: Admin user forms and CSV import must use an 8-character minimum and the default import password `Temp@12345`, not `123456`.

**Q: What CSV import validation is checked?**

A: CSV imports are limited to 1 MB, 500 rows, valid `.csv` files, and rows with email addresses.

**Q: What support attachment controls are checked?**

A: Attachments are limited to 10 MB and approved document/image/text/spreadsheet types. Optional attachment cleanup must not block ticket resolution.

## Startup And Dashboard Behavior

**Q: What login performance regression is guarded?**

A: Login and student startup must not wait on optional dashboard RPCs, and auth/session verification must have timeouts.

**Q: How do authenticated portals avoid stale data?**

A: Admin, mentor, and student startup paths force fresh data loads and use cache scopes tied to the current user and selected batch.

**Q: What academic dashboard data rule is enforced?**

A: The dashboard must use real task, quiz, and protected academic activity rows instead of placeholder semester text or unprotected data.

**Q: How is the student course library kept scalable?**

A: It fetches a limited catalog, initially renders 8 courses, supports load-more behavior, includes search/sort/layout controls, and uses CSS constraints for grid and list layouts.

## Smoke Tests

**Q: What does the Playwright smoke suite verify?**

A: It mocks Supabase in the browser, then checks the highest-risk page flows:

- Login routes authenticated users to the correct role portal.
- Mismatched sessions redirect to `unauthorized.html`.
- The public join form submits through the validated Supabase RPC.
- Student, mentor, and admin portals render their basic shells.

**Q: Does the smoke suite require a server?**

A: Yes. `playwright.config.ts` starts `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000` and tests against `http://127.0.0.1:3000`.

## Gaps And Risks

**Q: Are these mostly behavioral tests or source-pattern tests?**

A: The Node regression suite is mostly source-pattern testing. It is very useful for preventing known security and data-flow regressions, but it does not fully execute all UI workflows.

**Q: What should be added next?**

A: Add more executable integration coverage around admin user creation, purchase flows, task submission, academic dashboard rendering, CSV import validation, and support attachment upload behavior.

**Q: What is the current confidence level?**

A: Confidence is good for the specific regressions encoded in the fast Node tests. Browser-level confidence is currently blocked by the missing Playwright browser install; after installing Playwright browsers, rerun `npm.cmd run test:smoke`.
