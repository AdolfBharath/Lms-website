import { readFile } from "node:fs/promises";

const env = await loadEnv();
const report = {
  startedAt: new Date().toISOString(),
  mode: "hard-delete-courses-and-related-lms-data",
  before: {},
  deleted: {},
  blocked: null,
  after: {},
};

const courseIds = (await request("courses?select=id,title&order=title.asc")).map((row) => row.id).filter(Boolean);
const batchIds = (await request("batches?select=id,course_id")).map((row) => row.id).filter(Boolean);

report.before = await snapshot();

await resetUserCoursePointers(batchIds);

const deleteSteps = [
  ["batch_chats", "batch_id", batchIds],
  ["task_submissions", "course_id", courseIds],
  ["task_submissions", "batch_id", batchIds],
  ["student_quiz_attempts", "course_id", courseIds],
  ["student_course_progress", "course_id", courseIds],
  ["projects", "course_id", courseIds],
  ["announcements", "course_id", courseIds],
  ["announcements", "batch_id", batchIds],
  ["batch_tasks", "course_id", courseIds],
  ["batch_tasks", "batch_id", batchIds],
  ["user_courses", "course_id", courseIds],
  ["batches", "id", batchIds],
  ["lms_course_payments", "course_id", courseIds],
  ["lms_course_orders", "course_id", courseIds],
];

for (const [table, column, ids] of deleteSteps) {
  const key = `${table}.${column}`;
  report.deleted[key] = await deleteByIds(table, column, ids);
}

const courseDelete = await deleteByIds("courses", "id", courseIds);
report.deleted["courses.id"] = courseDelete;
if (!courseDelete.ok) {
  report.blocked = {
    table: "courses",
    reason: courseDelete.error,
    note: "Course rows are still referenced by another table after deleting known course-dependent LMS rows.",
  };
}

report.after = await snapshot();
console.log(JSON.stringify(report, null, 2));

async function resetUserCoursePointers(batchIds) {
  await patch("users?id=not.is.null", { course_ids: null });
  if (batchIds.length) await patch("users?batch_id=not.is.null", { batch_id: null });
}

async function snapshot() {
  return {
    courses: await count("courses?select=id"),
    batches: await count("batches?select=id"),
    userCourses: await count("user_courses?select=id"),
    progress: await count("student_course_progress?select=id"),
    quizAttempts: await count("student_quiz_attempts?select=id"),
    batchTasks: await count("batch_tasks?select=id"),
    announcements: await count("announcements?select=id"),
    projects: await count("projects?select=id"),
    orders: await count("lms_course_orders?select=id"),
    payments: await count("lms_course_payments?select=id"),
  };
}

async function deleteByIds(table, column, ids) {
  if (!ids.length) return { ok: true, skipped: true, count: 0 };
  const chunks = [];
  for (let index = 0; index < ids.length; index += 50) chunks.push(ids.slice(index, index + 50));
  let deleted = 0;
  for (const chunk of chunks) {
    const path = `${table}?${encodeURIComponent(column)}=in.(${chunk.map(encodeURIComponent).join(",")})`;
    const response = await fetch(`${env.url}/rest/v1/${path}`, {
      method: "DELETE",
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        Prefer: "return=minimal",
      },
    });
    if (!response.ok) return { ok: false, deleted, error: await response.text() };
    deleted += chunk.length;
  }
  return { ok: true, deleted };
}

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
  if (!response.ok) return { ok: false, error: await response.text() };
  return { ok: true };
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
