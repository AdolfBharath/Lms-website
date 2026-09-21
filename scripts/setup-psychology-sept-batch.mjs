#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const BATCH_NAME = "Psychology & Mental Health Sept";
const COURSE_TITLE = "Psychology";
const INITIAL_PASSWORD = process.env.PSYCH_INITIAL_PASSWORD || "";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const STUDENTS = [
  ["Nithyta", "nityaagaekwad806@gmail.com"],
  ["Nethinti Pavani", "pavaninethintii@gmail.com"],
  ["Arpitha K", "arpithakadli@gmail.com"],
  ["Rajamandrapu Monisha", "rajamandrapumonisha@gmail.com"],
  ["Soha Rehman", "soha.rehman2706@gmail.com"],
  ["Riya Mann", "mannriya16@gmail.com"],
  ["Hannah Sachdeva", "hannah.alleyoop@gmail.com"],
  ["Syeda Amrin Mahmood", "syedaamrin332@gmail.com"],
  ["Sagar M", "sagarm8122005@gmail.com"],
  ["Brundha R", "brundhar81@gmail.com"],
  ["Bhargava Puneeth Reddy Pabbathi", "25jgls-pbprpabbathi@jgu.edu.in"],
  ["Diya Dilip", "diya.padmalaya@psyh.christuniversity.in"],
  ["Nishtha Verma", "nishtha.verma@psyh.christuniversity.in"],
  ["K S Mahaasree", "ksmahaasree@gmail.com"],
  ["Chakravarthy T M", "chakravarthy.t@psyh.christuniversity.in"],
  ["Dharanya C", "saraswathichokkappan@gmail.com"],
  ["DATHERIN MARY", "datherinmary26bsy057@skasc.ac.in"],
  ["M.Harinipriya", "harinimvs9@gmail.com"],
  ["Devanshi gupta", "devanshi.gupta@psyh.christuniversity.in"],
  ["kiruthiga", "kiruthigasubramani217@gmail.com"],
  ["annie elizabeth james", "annieelizabethjames43@gmail.com"],
  ["Snigdha", "snigdhapjo@gmail.com"],
  ["FATHIMA GANI S", "drfathimambbs2030@gmail.com"],
  ["alina", "alinhyd@gmail.com"],
  ["Ayesha Israr", "ayeshaisrar0651@gmail.com"],
  ["Ishi Bhargava", "ishi.bhargava11@gmail.com"],
  ["Khushi Tyagi", "tyagi.sara008@gmail.com"],
  ["Vignetha Budolla", "vignethabuddolla@gmail.com"],
  ["T.Anirudh Reddy", "anirudhrdy0101@gmail.com"],
  ["Mahi Chaturvedi", "mahi.chaturvedi987@gmail.com"],
  ["Gaurisha Yadav", "gaurishayadav23@gmail.com"],
  ["Adwita gupta", "guptaadwita9@gmail.com"],
  ["Harigopal H Panicker", "harigopalh2007@gmail.com"],
  ["Ashmita Gupta A", "ashmitaguptaa64@gmail.com"],
  ["Mahammad Rahimunnisa", "mohammadrahi1820@gmail.com"],
  ["Ananya Singh", "ananya150406@gmail.com"],
  ["MOUNISHA. M", "mounishamohan36@gmail.com"],
  ["mehabarathi.", "megabharathi16sambath@gmail.com"],
  ["Kanagha Rakshini S", "etolijunevarsh@gmail.com"],
  ["Praptha Yogini P V", "prapthu2k7@gmail.com"],
  ["RIKKI", "rikkidinu.premu@gmail.com"],
  ["Muhammed Safiq Niyamathullah J", "muhammedsafiqniyamathullah@gmail.com"],
  ["sanjana santosh", "sanjanasanthosh1701@gmail.com"],
  ["Jemimah Grace Ajo", "jemimahgrace1140@gmail.com"],
  ["Shubha", "shubhashetty307@gmail.com"],
  ["Bhavya shah", "shahbhavya497@gmail.com"],
  ["S.Neha", "nehaskr2808@gmail.com"],
  ["Adhini.k", "adhinileo@gmail.com"],
].map(([name, email]) => ({ name: String(name).trim(), email: String(email).trim().toLowerCase() }));

function envFile() {
  const file = path.join(ROOT, ".env.local");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const env = envFile();
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY are required.");
if (INITIAL_PASSWORD.length < 8) throw new Error("PSYCH_INITIAL_PASSWORD must be at least 8 characters.");

const report = {
  processed: 0,
  createdAccounts: 0,
  reusedAccounts: 0,
  batchAssignmentsCreated: 0,
  courseEnrollmentsCreated: 0,
  failed: [],
  verification: {},
  assignmentRpcUnavailable: false,
};

function restHeaders(key = SERVICE_KEY) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function rest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: { ...restHeaders(options.key), ...(options.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} failed: ${body?.message || body?.error || response.status}`);
  }
  return body;
}

async function listTable(table, select = "*") {
  return rest(`/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=10000`);
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; page < 20; page += 1) {
    const body = await rest(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const pageUsers = Array.isArray(body?.users) ? body.users : [];
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }
  return users;
}

async function createAuthUser(student) {
  const body = await rest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: student.email,
      password: INITIAL_PASSWORD,
      email_confirm: true,
      user_metadata: { name: student.name, role: "student" },
      app_metadata: { role: "student" },
    }),
  });
  return body?.user || body;
}

async function updateAuthUser(authId, student) {
  const body = await rest(`/auth/v1/admin/users/${authId}`, {
    method: "PUT",
    body: JSON.stringify({
      email: student.email,
      password: INITIAL_PASSWORD,
      user_metadata: { name: student.name, role: "student" },
      app_metadata: { role: "student" },
    }),
  });
  return body?.user || body;
}

async function upsertPublicUser(existing, authUser, student, batchId, courseId) {
  const currentCourseIds = Array.isArray(existing?.course_ids) ? existing.course_ids.map(String) : [];
  const course_ids = Array.from(new Set([...currentCourseIds, String(courseId)]));
  const payload = {
    name: student.name || existing?.name || student.email,
    email: student.email,
    role: "student",
    auth_user_id: authUser.id,
    batch_id: batchId,
    course_ids,
  };
  if (existing?.id) {
    const [updated] = await rest(`/rest/v1/users?id=eq.${existing.id}&select=*`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return updated;
  }
  const [inserted] = await rest("/rest/v1/users?select=*", {
    method: "POST",
    body: JSON.stringify({ ...payload, coins: 0, status: "active" }),
  });
  return inserted;
}

async function ensureBatch(course) {
  const batches = await listTable("batches", "id,name,course_id,status,capacity,created_at");
  const existing = batches.find((batch) => String(batch.name || "").trim() === BATCH_NAME);
  if (existing) {
    if (String(existing.course_id || "") !== String(course.id) || String(existing.status || "").toLowerCase() !== "active") {
      const [updated] = await rest(`/rest/v1/batches?id=eq.${existing.id}&select=*`, {
        method: "PATCH",
        body: JSON.stringify({ course_id: course.id, status: "active", capacity: Math.max(Number(existing.capacity || 0), STUDENTS.length) }),
      });
      return { batch: updated, created: false };
    }
    return { batch: existing, created: false };
  }
  const [created] = await rest("/rest/v1/batches?select=*", {
    method: "POST",
    body: JSON.stringify({
      name: BATCH_NAME,
      course_id: course.id,
      capacity: STUDENTS.length,
      status: "active",
      progress: 0,
    }),
  });
  return { batch: created, created: true };
}

async function ensureEnrollment(user, courseId, batchId) {
  const existing = await rest(`/rest/v1/user_courses?select=*&user_id=eq.${user.id}&course_id=eq.${courseId}&limit=1`);
  const payload = {
    user_id: user.id,
    student_id: user.id,
    learner_id: user.id,
    course_id: courseId,
    batch_id: batchId,
    status: "active",
    deleted_at: null,
  };
  if (existing.length) {
    await rest(`/rest/v1/user_courses?id=eq.${existing[0].id}&select=*`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return { created: false };
  }
  await rest("/rest/v1/user_courses?select=*", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { created: true };
}

async function persistAssignment(userId, batchId, courseId) {
  try {
    await rest("/rest/v1/rpc/lms_admin_update_user_assignment", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: userId,
        target_batch_id: batchId,
        target_course_ids: [courseId],
      }),
    });
  } catch (error) {
    if (!/Could not find the function public\.lms_admin_update_user_assignment/i.test(String(error.message || ""))) throw error;
    report.assignmentRpcUnavailable = true;
  }
}

async function loginStudent(email) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: INITIAL_PASSWORD }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Student login failed: ${body.error_description || body.msg || body.error || response.status}`);
  return body.access_token;
}

async function studentRest(pathname, accessToken) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Student query failed ${pathname}: ${body?.message || body?.error || response.status}`);
  return body;
}

function byEmail(rows) {
  const map = new Map();
  for (const row of rows) map.set(String(row.email || "").toLowerCase(), row);
  return map;
}

async function main() {
  const uniqueEmails = new Set(STUDENTS.map((student) => student.email));
  if (uniqueEmails.size !== STUDENTS.length) throw new Error("Duplicate email found in prepared student list.");

  const courses = await listTable("courses", "id,title,status,deleted_at,price");
  const courseMatches = courses.filter((course) => String(course.title || "").trim().toLowerCase() === COURSE_TITLE.toLowerCase());
  if (!courseMatches.length) throw new Error(`Missing course: ${COURSE_TITLE}`);
  if (courseMatches.length > 1) throw new Error(`Duplicate course title found: ${COURSE_TITLE}`);
  const course = courseMatches[0];
  if (course.deleted_at || String(course.status || "").toLowerCase() !== "active") throw new Error(`Course is not active: ${COURSE_TITLE}`);

  const { batch } = await ensureBatch(course);
  let authByEmail = byEmail(await listAuthUsers());
  let publicByEmail = byEmail(await listTable("users", "id,email,name,role,auth_user_id,batch_id,course_ids,status,deleted_at"));

  for (const student of STUDENTS) {
    report.processed += 1;
    try {
      let authUser = authByEmail.get(student.email);
      if (authUser?.id) {
        authUser = await updateAuthUser(authUser.id, student);
        report.reusedAccounts += 1;
      } else {
        authUser = await createAuthUser(student);
        report.createdAccounts += 1;
        authByEmail.set(student.email, authUser);
      }

      const existingProfile = publicByEmail.get(student.email);
      const beforeBatch = existingProfile?.batch_id;
      const user = await upsertPublicUser(existingProfile, authUser, student, batch.id, course.id);
      publicByEmail.set(student.email, user);
      if (String(beforeBatch || "") !== String(batch.id)) report.batchAssignmentsCreated += 1;

      const enrollment = await ensureEnrollment(user, course.id, batch.id);
      if (enrollment.created) report.courseEnrollmentsCreated += 1;
      await persistAssignment(user.id, batch.id, course.id);
    } catch (error) {
      report.failed.push({ email: student.email, reason: error.message || String(error) });
    }
  }

  const finalUsers = await listTable("users", "id,email,name,role,auth_user_id,batch_id,course_ids,status,deleted_at");
  const finalByEmail = byEmail(finalUsers);
  const importedUsers = STUDENTS.map((student) => finalByEmail.get(student.email)).filter(Boolean);
  if (!importedUsers.length) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("No imported users were found after setup. See failed row reasons above.");
  }
  const enrollments = await rest(`/rest/v1/user_courses?select=id,user_id,student_id,learner_id,course_id,batch_id,status,deleted_at&course_id=eq.${course.id}&batch_id=eq.${batch.id}&limit=10000`);

  report.verification.batchExists = Boolean(batch?.id && batch.name === BATCH_NAME);
  report.verification.courseExists = Boolean(course?.id && course.title === COURSE_TITLE);
  report.verification.allStudentsPresent = importedUsers.length === STUDENTS.length;
  report.verification.noDuplicateSourceEmails = uniqueEmails.size === STUDENTS.length;
  report.verification.normalizedGmailAddressesPresent = ["kiruthigasubramani217@gmail.com", "annieelizabethjames43@gmail.com"].every((email) => finalByEmail.has(email));
  report.verification.allStudentRoles = importedUsers.every((user) => String(user.role || "").toLowerCase() === "student");
  report.verification.allAssignedToBatch = importedUsers.every((user) => String(user.batch_id || "") === String(batch.id));
  report.verification.allEnrolledInCourse = importedUsers.every((user) => enrollments.some((enrollment) => (
    String(enrollment.course_id) === String(course.id)
    && String(enrollment.batch_id) === String(batch.id)
    && [enrollment.user_id, enrollment.student_id, enrollment.learner_id].some((id) => String(id || "") === String(user.id))
    && !enrollment.deleted_at
    && !["archived", "deleted", "inactive", "cancelled", "removed"].includes(String(enrollment.status || "active").toLowerCase())
  )));

  const firstStudent = importedUsers[0];
  const accessToken = await loginStudent(firstStudent.email);
  const firstStudentEnrollments = await rest(`/rest/v1/user_courses?select=course_id,batch_id,status,deleted_at&or=(user_id.eq.${firstStudent.id},student_id.eq.${firstStudent.id},learner_id.eq.${firstStudent.id})&limit=10000`);
  const assignedCourseIds = new Set(firstStudentEnrollments
    .filter((row) => !row.deleted_at && !["archived", "deleted", "inactive", "cancelled", "removed"].includes(String(row.status || "active").toLowerCase()))
    .map((row) => String(row.course_id || ""))
    .filter(Boolean));
  const assignedBatchIds = new Set(firstStudentEnrollments
    .filter((row) => !row.deleted_at && !["archived", "deleted", "inactive", "cancelled", "removed"].includes(String(row.status || "active").toLowerCase()))
    .map((row) => String(row.batch_id || ""))
    .filter(Boolean));
  if (firstStudent.batch_id) assignedBatchIds.add(String(firstStudent.batch_id));
  const otherBatch = (await listTable("batches", "id,name,course_id,status")).find((row) => !assignedBatchIds.has(String(row.id)));
  const otherCourse = courses.find((row) => !assignedCourseIds.has(String(row.id)) && !row.deleted_at && String(row.status || "").toLowerCase() === "active");
  const otherStudent = importedUsers.find((user) => String(user.id) !== String(firstStudent.id));

  const visibleBatch = await studentRest(`/rest/v1/batches?select=id,name&id=eq.${batch.id}`, accessToken);
  const blockedBatch = otherBatch ? await studentRest(`/rest/v1/batches?select=id,name&id=eq.${otherBatch.id}`, accessToken) : [];
  const visibleCourse = await studentRest(`/rest/v1/courses?select=id,title&id=eq.${course.id}`, accessToken);
  const blockedCourse = otherCourse ? await studentRest(`/rest/v1/courses?select=id,title&id=eq.${otherCourse.id}`, accessToken) : [];
  const ownUser = await studentRest(`/rest/v1/users?select=id,email&id=eq.${firstStudent.id}`, accessToken);
  const blockedUser = otherStudent ? await studentRest(`/rest/v1/users?select=id,email&id=eq.${otherStudent.id}`, accessToken) : [];

  report.verification.studentCanSeeAssignedBatch = visibleBatch.length === 1;
  report.verification.studentCannotSeeOtherBatch = blockedBatch.length === 0;
  report.verification.studentCanSeeAssignedCourse = visibleCourse.length === 1;
  report.verification.studentCannotSeeOtherCourse = blockedCourse.length === 0;
  report.verification.studentCanSeeOwnProfile = ownUser.length === 1;
  report.verification.studentCannotSeeOtherStudentProfile = blockedUser.length === 0;
  report.batch = { id: batch.id, name: batch.name };
  report.course = { id: course.id, title: course.title };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message || String(error) }, null, 2));
  process.exit(1);
});
