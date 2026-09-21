import { readFile } from "node:fs/promises";

const now = new Date().toISOString();
const env = await loadEnv();

const report = {
  before: {
    userCourses: await count("user_courses?select=id"),
    activeUserCourses: await count("user_courses?deleted_at=is.null&status=not.in.(archived,removed,cancelled)&select=id"),
  },
  attempts: [],
  after: {},
};

const payloads = [
  { status: "removed", deleted_at: now },
  { status: "cancelled", deleted_at: now },
  { deleted_at: now },
  { status: "removed" },
  { status: "cancelled" },
];

for (const payload of payloads) {
  const result = await patch("user_courses?course_id=not.is.null", payload);
  report.attempts.push({ payload: Object.keys(payload), ok: result.ok, error: result.ok ? null : result.error });
  if (result.ok) break;
}

report.after.userCourses = await count("user_courses?select=id");
report.after.activeUserCourses = await count("user_courses?deleted_at=is.null&status=not.in.(archived,removed,cancelled)&select=id");

console.log(JSON.stringify(report, null, 2));

async function patch(path, payload) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (response.ok) return { ok: true };
  return { ok: false, error: await response.text() };
}

async function count(path) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    method: "HEAD",
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      Prefer: "count=exact",
    },
  });
  if (!response.ok) return null;
  return Number(response.headers.get("content-range")?.split("/")?.[1] || 0);
}

async function loadEnv() {
  const source = await readFile(".env.local", "utf8");
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase URL or service-role key in .env.local");
  return { url: url.replace(/\/$/, ""), serviceKey };
}
