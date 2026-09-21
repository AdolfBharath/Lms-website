import { readFile } from "node:fs/promises";

const now = new Date().toISOString();
const env = await loadEnv();

const report = {
  startedAt: now,
  mode: "soft-delete/archive",
  preserved: ["users", "Supabase Auth users", "lms_course_orders/payment history"],
  before: {},
  actions: {},
  after: {},
};

const courseIds = (await request("courses?select=id,title,status,deleted_at&order=title.asc"))
  .map((course) => course.id)
  .filter(Boolean);

report.before.courses = await count("courses?select=id");
report.before.activeCourses = await count("courses?deleted_at=is.null&status=ilike.active&select=id");
report.before.batches = await count("batches?select=id");
report.before.activeBatches = await count("batches?status=ilike.active&select=id");
report.before.userCourses = await count("user_courses?select=id");
report.before.activeUserCourses = await count("user_courses?deleted_at=is.null&status=ilike.active&select=id");
report.before.paymentOrders = await count("lms_course_orders?select=id");

if (!courseIds.length) {
  report.actions.note = "No course rows found.";
} else {
  report.actions.courses = await patchWithFallback(
    "courses?id=not.is.null",
    { status: "deleted", deleted_at: now, updated_at: now },
    ["updated_at", "deleted_at", "status"],
  );
  report.actions.batches = await patchWithFallback(
    "batches?id=not.is.null",
    { status: "deleted", deleted_at: now },
    ["deleted_at", "status"],
  );
  report.actions.userCourses = await patchWithFallback(
    "user_courses?course_id=not.is.null",
    { status: "archived", deleted_at: now },
    ["deleted_at", "status"],
  );
  report.actions.users = await patchWithFallback(
    "users?id=not.is.null",
    { batch_id: null, course_ids: null },
    ["course_ids", "batch_id"],
  );
}

report.after.courses = await count("courses?select=id");
report.after.activeCourses = await count("courses?deleted_at=is.null&status=ilike.active&select=id");
report.after.batches = await count("batches?select=id");
report.after.activeBatches = await count("batches?status=ilike.active&select=id");
report.after.userCourses = await count("user_courses?select=id");
report.after.activeUserCourses = await count("user_courses?deleted_at=is.null&status=ilike.active&select=id");
report.after.paymentOrders = await count("lms_course_orders?select=id");

console.log(JSON.stringify(report, null, 2));

async function patchWithFallback(path, payload, optionalKeys) {
  let body = { ...payload };
  const removed = [];
  for (let attempt = 0; attempt < optionalKeys.length + 2; attempt += 1) {
    const response = await fetch(`${env.url}/rest/v1/${path}`, {
      method: "PATCH",
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true, removedOptionalFields: removed };
    const text = await response.text();
    const missing = missingColumn(text) || optionalKeys.find((key) => Object.hasOwn(body, key));
    if (!missing) return { ok: false, error: text };
    delete body[missing];
    removed.push(missing);
  }
  return { ok: false, error: "Unable to patch after fallback attempts." };
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

function missingColumn(text) {
  const message = String(text || "");
  const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
  return quoted?.[1] || quoted?.[2] || quoted?.[3] || message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
}
