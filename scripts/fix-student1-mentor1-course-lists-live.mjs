import { readFile } from "node:fs/promises";

const env = await loadEnv();
const users = await request("users?select=id,email,username,role,course_ids,batch_id&email=in.(student1%40gmail.com,mentor1%40gmail.com)");
const courses = (await request("courses?select=id,title,status,deleted_at&order=title.asc")).filter(isActive);
const courseIds = courses.map((course) => String(course.id));

const student = users.find((user) => String(user.email || "").toLowerCase() === "student1@gmail.com");
const mentor = users.find((user) => String(user.email || "").toLowerCase() === "mentor1@gmail.com");

if (!student) throw new Error("student1@gmail.com profile not found.");
if (!mentor) throw new Error("mentor1@gmail.com profile not found.");

const enrollmentRows = await request(`user_courses?select=id,user_id,student_id,learner_id,course_id,status,deleted_at&course_id=in.(${courseIds.map(encodeURIComponent).join(",")})`);
const studentCourseIds = enrollmentRows
  .filter((row) => !row.deleted_at && isActive(row) && [row.user_id, row.student_id, row.learner_id].some((id) => same(id, student.id)))
  .map((row) => String(row.course_id));

await updateCourseIds(student.id, courseIds);
await updateCourseIds(mentor.id, courseIds);

const after = await request("users?select=id,email,username,role,course_ids,batch_id&email=in.(student1%40gmail.com,mentor1%40gmail.com)");

console.log(JSON.stringify({
  activeCourses: courseIds.length,
  studentEnrollments: new Set(studentCourseIds).size,
  profiles: after.map((user) => ({
    email: user.email,
    role: user.role,
    courseIdsCount: parseIdList(user.course_ids).length,
    batchIdPresent: Boolean(user.batch_id),
  })),
}, null, 2));

async function updateCourseIds(userId, ids) {
  const response = await fetch(`${env.url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=id,email,course_ids`, {
    method: "PATCH",
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ course_ids: ids }),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Unable to update profile course_ids: ${response.status} ${details}`);
  }
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

function parseIdList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function isActive(row) {
  return !row.deleted_at && !["deleted", "archived", "removed", "cancelled"].includes(String(row.status || "active").toLowerCase());
}

function same(a, b) {
  return String(a || "") === String(b || "");
}
