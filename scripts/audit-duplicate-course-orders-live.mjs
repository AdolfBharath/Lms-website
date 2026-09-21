import { readFile } from "node:fs/promises";

const courseIds = process.argv.slice(2);
if (!courseIds.length) throw new Error("Pass one or more course ids to audit.");

const env = await loadEnv();
const result = [];

for (const id of courseIds) {
  const [orders, enrollments, batches] = await Promise.all([
    request(`lms_course_orders?course_id=eq.${encodeURIComponent(id)}&select=id,status,amount,currency,created_at,updated_at`),
    count(`user_courses?course_id=eq.${encodeURIComponent(id)}&select=id`),
    count(`batches?course_id=eq.${encodeURIComponent(id)}&select=id`),
  ]);
  result.push({ course_id: id, orders, enrollments, batches });
}

console.log(JSON.stringify(result, null, 2));

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

async function request(path) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  return response.json();
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
  if (!response.ok) throw new Error(`Supabase count failed: ${response.status} ${await response.text()}`);
  return Number(response.headers.get("content-range")?.split("/")?.[1] || 0);
}
