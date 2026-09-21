import { readFile } from "node:fs/promises";

const STUDENT_EMAIL = "student1@gmail.com";
const MENTOR_EMAIL = "mentor1@gmail.com";

const env = await loadEnv();
const [users, courses, batches, enrollments] = await Promise.all([
  request("users?select=id,email,username,name,role,status,deleted_at,course_ids"),
  request("courses?select=id,title,mentor_id,status,deleted_at&order=title.asc"),
  request("batches?select=id,course_id,mentor_id,status,deleted_at"),
  request("user_courses?select=id,user_id,student_id,learner_id,course_id,status,deleted_at"),
]);

const activeCourses = courses.filter(isActive);
const student = users.find((user) => isActive(user) && sameEmail(user.email, STUDENT_EMAIL) && String(user.role || "").toLowerCase() === "student");
const mentor = users.find((user) => isActive(user) && sameEmail(user.email, MENTOR_EMAIL) && String(user.role || "").toLowerCase() === "mentor");

if (!student) throw new Error("student1 account not found or not active");
if (!mentor) throw new Error("mentor1 account not found or not active");

const studentCourseIds = new Set(enrollments
  .filter((row) => isActive(row) && [row.user_id, row.student_id, row.learner_id].some((id) => sameId(id, student.id)))
  .map((row) => String(row.course_id)));
const mentorCourseIds = new Set(activeCourses.filter((course) => sameId(course.mentor_id, mentor.id)).map((course) => String(course.id)));
const mentorBatchCourseIds = new Set(batches
  .filter((batch) => isActive(batch) && sameId(batch.mentor_id, mentor.id))
  .map((batch) => String(batch.course_id)));

const missingStudentCourses = activeCourses.filter((course) => !studentCourseIds.has(String(course.id))).map((course) => course.title);
const missingMentorCourses = activeCourses.filter((course) => !mentorCourseIds.has(String(course.id)) && !mentorBatchCourseIds.has(String(course.id))).map((course) => course.title);

console.log(JSON.stringify({
  activeCourses: activeCourses.length,
  student: {
    email: STUDENT_EMAIL,
    role: student.role,
    assignedCourses: activeCourses.length - missingStudentCourses.length,
    missingCourses: missingStudentCourses,
  },
  mentor: {
    email: MENTOR_EMAIL,
    role: mentor.role,
    assignedCourses: activeCourses.length - missingMentorCourses.length,
    missingCourses: missingMentorCourses,
  },
}, null, 2));

if (missingStudentCourses.length || missingMentorCourses.length) process.exitCode = 1;

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

function isActive(row) {
  return !row.deleted_at && !["deleted", "archived", "removed", "cancelled", "inactive"].includes(String(row.status || "active").toLowerCase());
}

function sameId(a, b) {
  return String(a || "") === String(b || "");
}

function sameEmail(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}
