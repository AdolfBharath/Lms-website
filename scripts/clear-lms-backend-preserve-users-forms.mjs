import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
    })
);

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const restUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1`;
const storageUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1`;
const outDir = join("test-results", "backend-clear");
mkdirSync(outDir, { recursive: true });

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`
};

const jsonHeaders = {
  ...headers,
  "Content-Type": "application/json"
};

const lmsTables = [
  "support_notifications",
  "support_messages",
  "support_tickets",
  "task_submission_notifications",
  "task_submissions",
  "student_academic_activity",
  "student_quiz_attempts",
  "student_extra_marks",
  "student_shop_purchases",
  "shop_purchases",
  "shop_items",
  "batch_chats",
  "projects",
  "batch_tasks",
  "announcements",
  "student_course_progress",
  "user_courses",
  "batches",
  "courses",
  "lms_trusted_user_writes"
];

const storageBuckets = [
  "assignment-submissions",
  "study-materials",
  "support-attachments"
];

const deleteFilters = {
  lms_trusted_user_writes: "txid=not.is.null",
  student_course_progress: "student_id=not.is.null"
};

const report = {
  startedAt: new Date().toISOString(),
  preserved: {
    tables: ["users", "form_*"],
    note: "This script does not delete auth users, public.users rows, or form_* tables."
  },
  before: {},
  deleted: {},
  after: {},
  storage: {},
  userReferencesReset: null,
  errors: []
};

async function request(method, path, options = {}) {
  const response = await fetch(`${restUrl}/${path}`, {
    method,
    headers: options.headers || headers,
    body: options.body
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { response, text, json };
}

async function tableExists(table) {
  const { response } = await request("HEAD", `${table}?select=*&limit=1`, {
    headers: { ...headers, Prefer: "count=exact" }
  });
  return response.ok;
}

async function countTable(table) {
  const { response, text, json } = await request("HEAD", `${table}?select=*&limit=1`, {
    headers: { ...headers, Prefer: "count=exact" }
  });
  if (!response.ok) {
    return { exists: false, count: null, error: json?.message || text || response.statusText };
  }
  const range = response.headers.get("content-range") || "*/0";
  const count = Number(range.split("/").pop() || 0);
  return { exists: true, count: Number.isFinite(count) ? count : 0 };
}

async function deleteAllRows(table) {
  const filter = deleteFilters[table] || "id=not.is.null";
  const { response, text, json } = await request("DELETE", `${table}?${filter}`, {
    headers: { ...headers, Prefer: "return=minimal" }
  });
  if (!response.ok) {
    return { ok: false, error: json?.message || text || response.statusText };
  }
  return { ok: true };
}

async function resetUserReferences() {
  const payload = { batch_id: null, course_ids: null };
  const { response, text, json } = await request("PATCH", "users?id=not.is.null", {
    headers: { ...jsonHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    return { ok: false, error: json?.message || text || response.statusText };
  }
  return { ok: true, fields: Object.keys(payload) };
}

async function listStorageObjects(bucket, prefix = "") {
  const response = await fetch(`${storageUrl}/object/list/${bucket}`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } })
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) return { ok: false, error: json?.message || text || response.statusText, rows: [] };
  return { ok: true, rows: Array.isArray(json) ? json : [] };
}

async function removeStorageObjects(bucket, paths) {
  if (!paths.length) return { ok: true, deleted: 0 };
  const response = await fetch(`${storageUrl}/object/${bucket}`, {
    method: "DELETE",
    headers: jsonHeaders,
    body: JSON.stringify({ prefixes: paths })
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) return { ok: false, error: json?.message || text || response.statusText };
  return { ok: true, deleted: paths.length };
}

async function collectStoragePaths(bucket, prefix = "") {
  const listed = await listStorageObjects(bucket, prefix);
  if (!listed.ok) return listed;
  const paths = [];
  for (const row of listed.rows) {
    if (!row?.name) continue;
    const fullPath = prefix ? `${prefix}/${row.name}` : row.name;
    if (row.id === null || row.metadata === null) {
      const nested = await collectStoragePaths(bucket, fullPath);
      if (!nested.ok) return nested;
      paths.push(...nested.paths);
    } else {
      paths.push(fullPath);
    }
  }
  return { ok: true, paths };
}

for (const table of lmsTables) {
  report.before[table] = await countTable(table);
}

report.userReferencesReset = await resetUserReferences();
if (!report.userReferencesReset.ok) {
  report.errors.push({ step: "reset users.batch_id/course_ids", error: report.userReferencesReset.error });
}

for (const table of lmsTables) {
  const exists = await tableExists(table);
  if (!exists) {
    report.deleted[table] = { skipped: true, reason: "table not found" };
    continue;
  }
  const result = await deleteAllRows(table);
  report.deleted[table] = result;
  if (!result.ok) report.errors.push({ step: `delete ${table}`, error: result.error });
}

for (const bucket of storageBuckets) {
  const collected = await collectStoragePaths(bucket);
  if (!collected.ok) {
    report.storage[bucket] = { ok: false, error: collected.error };
    report.errors.push({ step: `list storage ${bucket}`, error: collected.error });
    continue;
  }
  const removed = await removeStorageObjects(bucket, collected.paths);
  report.storage[bucket] = { ...removed, found: collected.paths.length };
  if (!removed.ok) report.errors.push({ step: `delete storage ${bucket}`, error: removed.error });
}

for (const table of lmsTables) {
  report.after[table] = await countTable(table);
}

report.finishedAt = new Date().toISOString();
report.finalStatus = report.errors.length ? "FAILED" : "CLEARED";

const outPath = join(outDir, `backend-clear-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  outPath,
  finalStatus: report.finalStatus,
  preserved: report.preserved,
  before: Object.fromEntries(Object.entries(report.before).map(([table, data]) => [table, data.count])),
  after: Object.fromEntries(Object.entries(report.after).map(([table, data]) => [table, data.count])),
  storage: report.storage,
  errors: report.errors
}, null, 2));

if (report.errors.length) process.exitCode = 1;
