# Static Architecture Notes

Jenovate now runs as a static HTML/CSS/JavaScript LMS again. The temporary Next.js compatibility layer has been removed.

## Runtime Shape

- Root HTML files are the source of truth for pages.
- CSS, JavaScript, images, PDFs, and videos are served directly by the static host.
- Browser data access uses the vendored Supabase SDK in `assets/vendor/supabase-2.49.4.js`.
- Authentication and role checks use Supabase Auth through `auth-session.js`.
- Admin Auth-user creation and password reset use the `admin-save-user` Supabase Edge Function.

## Local Development

- `npm run dev` starts `scripts/static-server.mjs` at `http://127.0.0.1:4173`.
- `npm run build` verifies the required static files are present and do not reference the removed Next compatibility layer.
- `npm test` runs source-level security and behavior regressions.
- `npm run test:smoke` runs Playwright against the static server.

## Deployment

Static hosts should publish the repository root while respecting `.netlifyignore` or equivalent excludes. Do not publish source-only directories such as `supabase`, `tests`, `docs`, `scripts`, `learnwith`, `qa-*`, `.env*`, or package metadata.
