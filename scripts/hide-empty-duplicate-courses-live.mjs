import { readFile } from "node:fs/promises";

const env = await loadEnv();
const courses = await request("courses?select=id,title,status,deleted_at,created_at&status=ilike.active&deleted_at=is.null&order=title.asc");
const duplicateGroups = groupDuplicates(courses, (row) => slugify(row.title));
const hidden = [];
const skipped = [];

for (const [slug, rows] of duplicateGroups) {
  const enriched = [];
  for (const row of rows) {
    const refs = await relatedCount(row.id);
    enriched.push({ ...row, refs });
  }
  enriched.sort((a, b) => b.refs - a.refs || new Date(a.created_at || 0) - new Date(b.created_at || 0));
  const [, ...duplicates] = enriched;
  for (const row of duplicates) {
    if (row.refs > 0) {
      skipped.push({ slug, id: row.id, title: row.title, refs: row.refs });
      continue;
    }
    await request(`courses?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "deleted", deleted_at: new Date().toISOString() }),
    });
    hidden.push({ slug, id: row.id, title: row.title });
  }
}

console.log(JSON.stringify({ hidden, skipped }, null, 2));

async function relatedCount(courseId) {
  const [enrollments, orders, batches] = await Promise.all([
    count(`user_courses?course_id=eq.${encodeURIComponent(courseId)}&select=id`),
    count(`lms_course_orders?course_id=eq.${encodeURIComponent(courseId)}&select=id`),
    count(`batches?course_id=eq.${encodeURIComponent(courseId)}&select=id`),
  ]);
  return enrollments + orders + batches;
}

async function count(path) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, { method: "HEAD", headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, Prefer: "count=exact" } });
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

async function request(path, options = {}) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, { ...options, headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
