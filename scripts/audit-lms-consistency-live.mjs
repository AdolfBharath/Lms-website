import { readFile } from "node:fs/promises";

const env = await loadEnv();
const [courses, users] = await Promise.all([
  request("courses?select=id,title,price,status,deleted_at&order=title.asc"),
  request("users?select=id,email,role,status,deleted_at&order=email.asc"),
]);

const courseStatusCounts = countBy(courses, (row) => lifecycle(row));
const duplicateCourses = duplicates(courses.filter((row) => !row.deleted_at && lifecycle(row) !== "deleted"), (row) => slugify(row.title));
const duplicateEmails = duplicates(users.filter((row) => !row.deleted_at && !["deleted", "archived", "removed"].includes(String(row.status || "active").toLowerCase())), (row) => String(row.email || "").trim().toLowerCase()).filter((row) => row.key);
const non5999 = courses.filter((row) => !row.deleted_at && lifecycle(row) === "active" && Number(String(row.price ?? "").replace(/[^0-9.]/g, "")) !== 5999);
const nonLifecycle = courses.filter((row) => !["active", "draft", "deleted"].includes(String(row.status || "").toLowerCase()));

console.log(JSON.stringify({
  courses_scanned: courses.length,
  course_status_counts: courseStatusCounts,
  active_price_mismatches: non5999.map((row) => row.title),
  non_lifecycle_statuses: nonLifecycle.map((row) => ({ title: row.title, status: row.status })),
  duplicate_active_course_titles: duplicateCourses,
  users_scanned: users.length,
  duplicate_active_emails: duplicateEmails,
}, null, 2));

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

function countBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function duplicates(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    map.set(key, [...(map.get(key) || []), row]);
  });
  return Array.from(map.entries()).filter(([, value]) => value.length > 1).map(([key, value]) => ({ key, count: value.length, titles: value.map((row) => row.title || row.email || row.id) }));
}

function lifecycle(row) {
  const status = String(row.status || "").toLowerCase();
  if (row.deleted_at || ["deleted", "archived", "removed"].includes(status)) return "deleted";
  if (["active", "published", "live"].includes(status)) return "active";
  return "draft";
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\(iot\)/g, "iot").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
