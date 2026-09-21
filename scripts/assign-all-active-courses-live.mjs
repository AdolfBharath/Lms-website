import { readFile } from "node:fs/promises";

const STUDENT_LOOKUP = process.env.STUDENT_LOOKUP || "student1";
const MENTOR_LOOKUP = process.env.MENTOR_LOOKUP || "mentor1";

const env = await loadEnv();

const [users, courses] = await Promise.all([
  request("users?select=*&order=email.asc"),
  request("courses?select=*&order=title.asc"),
]);

const student = findUser(users, STUDENT_LOOKUP, "student");
const mentor = findUser(users, MENTOR_LOOKUP, "mentor");

if (!student) throw new Error(`Student not found for lookup: ${STUDENT_LOOKUP}`);
if (!mentor) throw new Error(`Mentor not found for lookup: ${MENTOR_LOOKUP}`);

const activeCourses = courses.filter((course) => isActive(course));
if (!activeCourses.length) throw new Error("No active courses found to assign.");

const existingBatches = await request("batches?select=*&order=name.asc").catch(() => []);
const existingEnrollments = await request("user_courses?select=*&order=created_at.asc").catch(() => []);

const assigned = [];
const now = new Date().toISOString();
let primaryBatchId = student.batch_id || null;

for (const course of activeCourses) {
  const batch = await ensureBatch(course, mentor, student, existingBatches);
  primaryBatchId ||= batch?.id || null;
  const enrollment = await ensureStudentEnrollment(student, course, batch, existingEnrollments);
  await patchCourse(course.id, {
    mentor_id: mentor.id,
    instructor_name: mentor.name || mentor.full_name || mentor.display_name || mentor.username || "mentor1",
    updated_at: now,
  });
  assigned.push({
    course: course.title,
    courseId: course.id,
    batchId: batch?.id || null,
    enrollmentId: enrollment?.id || null,
  });
}

await patchUser(student.id, {
  batch_id: primaryBatchId,
  course_ids: mergedIds(student.course_ids, activeCourses.map((course) => course.id)),
});

await patchUser(mentor.id, {
  course_ids: mergedIds(mentor.course_ids, activeCourses.map((course) => course.id)),
});

const verification = await verifyAssignments(student.id, mentor.id, activeCourses.map((course) => course.id));

console.log(JSON.stringify({
  assigned: true,
  student: userSummary(student),
  mentor: userSummary(mentor),
  activeCourses: activeCourses.length,
  assignedRows: assigned.length,
  verification,
  courses: assigned.map((item) => item.course),
}, null, 2));

async function ensureBatch(course, mentor, student, existingBatches) {
  const existing = existingBatches.find((batch) => String(batch.course_id || "") === String(course.id));
  const studentIds = mergedIds(existing?.student_ids, [student.id]);
  const payload = {
    name: existing?.name || `${slugify(course.title)}-batch`,
    course_id: course.id,
    mentor_id: mentor.id,
    capacity: existing?.capacity || 35,
    enroll_limit: existing?.enroll_limit || 35,
    smart_waitlist: existing?.smart_waitlist ?? true,
    status: "active",
    start_date: existing?.start_date || new Date().toISOString().slice(0, 10),
    progress: existing?.progress ?? 0,
    enrolled_count: Math.max(Number(existing?.enrolled_count || 0), 1),
    student_ids: studentIds,
  };
  const batch = existing?.id
    ? await writeWithOptionalColumns("batches", payload, existing.id, ["mentor_id", "enroll_limit", "smart_waitlist", "progress", "enrolled_count", "start_date", "student_ids"])
    : await writeWithOptionalColumns("batches", { ...payload, created_at: new Date().toISOString() }, "", ["mentor_id", "enroll_limit", "smart_waitlist", "progress", "enrolled_count", "start_date", "student_ids", "created_at"]);
  const index = existingBatches.findIndex((item) => String(item.id) === String(batch?.id));
  if (index >= 0) existingBatches[index] = batch;
  else if (batch?.id) existingBatches.push(batch);
  return batch;
}

async function ensureStudentEnrollment(student, course, batch, existingEnrollments) {
  const existing = existingEnrollments.find((row) => (
    same(row.course_id, course.id)
    && [row.user_id, row.student_id, row.learner_id].some((id) => same(id, student.id))
  ));
  const payload = {
    user_id: student.id,
    student_id: student.id,
    learner_id: student.id,
    course_id: course.id,
    batch_id: batch?.id || null,
    status: "active",
    deleted_at: null,
    created_at: existing?.created_at || new Date().toISOString(),
  };
  const enrollment = existing?.id
    ? await writeWithOptionalColumns("user_courses", payload, existing.id, ["student_id", "learner_id", "batch_id", "status", "deleted_at", "created_at"])
    : await writeWithOptionalColumns("user_courses", payload, "", ["student_id", "learner_id", "batch_id", "status", "deleted_at", "created_at"]);
  const index = existingEnrollments.findIndex((item) => String(item.id) === String(enrollment?.id));
  if (index >= 0) existingEnrollments[index] = enrollment;
  else if (enrollment?.id) existingEnrollments.push(enrollment);
  return enrollment;
}

async function verifyAssignments(studentId, mentorId, courseIds) {
  const [courseRows, batchRows, enrollmentRows, userRows] = await Promise.all([
    request(`courses?select=id,title,mentor_id,status,deleted_at&id=in.(${courseIds.map(encodeURIComponent).join(",")})`),
    request(`batches?select=id,course_id,mentor_id,status&course_id=in.(${courseIds.map(encodeURIComponent).join(",")})`),
    request(`user_courses?select=id,user_id,student_id,learner_id,course_id,batch_id,status,deleted_at&course_id=in.(${courseIds.map(encodeURIComponent).join(",")})`),
    request(`users?select=id,email,username,role,batch_id,course_ids&id=in.(${[studentId, mentorId].map(encodeURIComponent).join(",")})`),
  ]);
  const studentEnrollments = enrollmentRows.filter((row) => (
    !row.deleted_at
    && isActive(row)
    && [row.user_id, row.student_id, row.learner_id].some((id) => same(id, studentId))
  ));
  return {
    coursesWithMentor: courseRows.filter((course) => same(course.mentor_id, mentorId)).length,
    batchesWithMentor: batchRows.filter((batch) => same(batch.mentor_id, mentorId) && isActive(batch)).length,
    studentEnrollments: studentEnrollments.length,
    studentCourseIds: parseIdList(userRows.find((row) => same(row.id, studentId))?.course_ids).length,
    mentorCourseIds: parseIdList(userRows.find((row) => same(row.id, mentorId))?.course_ids).length,
  };
}

async function patchCourse(id, payload) {
  return writeWithOptionalColumns("courses", payload, id, ["mentor_id", "instructor_name", "updated_at"]);
}

async function patchUser(id, payload) {
  return writeWithOptionalColumns("users", payload, id, ["batch_id", "course_ids"]);
}

async function writeWithOptionalColumns(table, payload, id = "", optionalKeys = []) {
  let writePayload = compact(payload);
  let lastError = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const path = id
        ? `${table}?id=eq.${encodeURIComponent(id)}&select=*`
        : `${table}?select=*`;
      const data = await request(path, {
        method: id ? "PATCH" : "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(writePayload),
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (error) {
      lastError = error;
      const missing = missingColumn(error);
      const key = missing || optionalKeys.find((item) => Object.hasOwn(writePayload, item));
      if (!key) throw error;
      delete writePayload[key];
    }
  }
  throw lastError || new Error(`Unable to write ${table}.`);
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

async function request(path, init = {}) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const error = new Error(`Supabase request failed: ${response.status}`);
    error.details = await response.text();
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function findUser(rows, lookup, role) {
  const needle = String(lookup || "").trim().toLowerCase();
  const candidates = rows.filter((user) => isActive(user) && String(user.role || "").toLowerCase() === role);
  return candidates.find((user) => [
    user.email,
    user.username,
    user.name,
    user.full_name,
    user.display_name,
  ].some((value) => String(value || "").trim().toLowerCase() === needle || String(value || "").trim().toLowerCase().startsWith(`${needle}@`)))
    || candidates.find((user) => String(user.email || "").toLowerCase().includes(needle) || String(user.username || "").toLowerCase().includes(needle));
}

function userSummary(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username || null,
    role: user.role,
  };
}

function isActive(row) {
  return !row.deleted_at && !["deleted", "archived", "removed", "cancelled"].includes(String(row.status || "active").toLowerCase());
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

function mergedIds(existing, additions) {
  return [...new Set([...parseIdList(existing), ...additions.map(String).filter(Boolean)])];
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function missingColumn(error) {
  const message = String(error?.details || error?.message || "");
  const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1] || quoted[2] || quoted[3] || "";
  return message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\(iot\)/g, "iot").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function same(a, b) {
  return String(a || "") === String(b || "");
}
