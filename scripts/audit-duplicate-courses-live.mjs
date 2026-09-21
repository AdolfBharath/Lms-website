import { readFile } from "node:fs/promises";

const env = await loadEnv();
const courses = await request("courses?select=id,title,price,status,deleted_at,created_at&order=title.asc");
const active = courses.filter((row) => !row.deleted_at && String(row.status || "").toLowerCase() === "active");
const duplicateGroups = groupDuplicates(active, (row) => slugify(row.title));
const report = [];

for (const [slug, rows] of duplicateGroups) {
  const enriched = [];
  for (const row of rows) {
    const [enrollments, orders, batches] = await Promise.all([
      count(`user_courses?course_id=eq.${encodeURIComponent(row.id)}&select=id`),
      count(`lms_course_orders?course_id=eq.${encodeURIComponent(row.id)}&select=id`),
      count(`batches?course_id=eq.${encodeURIComponent(row.id)}&select=id`),
    ]);
    enriched.push({
      id: row.id,
      title: row.title,
      price: row.price,
      status: row.status,
      enrollments,
      orders,
      batches,
      created_at: row.created_at,
      updated_at: row.updated_at || "",
    });
  }
  report.push({ slug, rows: enriched });
}

console.log(JSON.stringify(report, null, 2));

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
  const response = await fetch(`${env.url}/rest/v1/${path}`, { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function groupDuplicates(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    map.set(key, [...(map.get(key) || []), row]);
  });
  return Array.from(map.entries()).filter(([, value]) => value.length > 1);
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\(iot\)/g, "iot").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
