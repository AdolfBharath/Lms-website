# Project Risk Controls

This project is a static Supabase-backed LMS. The highest-risk areas are large role portal files, local environment secrets, browser-exposed Supabase configuration, and the separate `learnwith/` tree.

## Large Portal Files

`admin.js`, `mentor.js`, `student.js`, and the largest CSS files are intentionally protected by line budgets in `scripts/check-project-risks.mjs`. Shared portal utilities now live in `modules/portal-utils.js`, and the former `student.css` tail is split into page-focused `student-*-split.css` stylesheets. These budgets are not a target architecture; they are a ratchet to stop the largest files from quietly growing while future work extracts shared behavior into modules.

When adding portal behavior, prefer these existing shared modules first:

- `modules/portal-data.js` for cached Supabase table reads.
- `modules/dom-utils.js` for HTML and attribute escaping.
- `modules/portal-utils.js` for shared formatting, DOM setters, modal helpers, locked submits, IDs, and file-size/upload helpers.
- `academic-metrics.js` for scoring and progress calculations.

If a change needs to exceed a budget, extract a cohesive helper first, then lower the old file budget.

## Local Environment Files

`.env.local` may exist for local development, but it must never be committed or deployed. `.gitignore`, `.netlifyignore`, `.vercelignore`, and the local static server all exclude `.env*` files. The risk check verifies the deployment ignore files keep those exclusions.

Only publishable Supabase values belong in browser code. Service-role keys belong only in local environment files or Supabase Edge Function settings.

## Supabase Browser Key Boundary

`supabase-config.js` exposes the publishable key because the browser needs it to create an anon Supabase client. That key is not the trust boundary. Authorization must remain in Supabase Auth, RLS policies, and RPC checks.

The risk check scans browser-delivered text files for service-role key references and JWT-shaped tokens. It intentionally allows the `sb_publishable_` key format.

## `learnwith/` Ownership

`learnwith/` is a separate Moodle-style application tree and is not part of the deployed static LMS. It is excluded by deployment ignore files and blocked by the local static server.

Do not import files from `learnwith/` into the static LMS unless ownership and deployment behavior are deliberately changed. If it becomes inactive reference material, move it out of the deploy repository in a separate cleanup change.
