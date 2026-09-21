import { readFile } from "node:fs/promises";

const SUPABASE_URL = "https://agrzjwnsapbanbvgbwkh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jrJRXGYEYpixwOAUS6kIWA_ccT4jZs6";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@jenovate.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MENTOR_EMAIL = process.env.MENTOR_EMAIL || "mentor1@gmail.com";
const STUDENT_EMAIL = process.env.STUDENT_EMAIL || "student1@gmail.com";
const COURSE_ID = process.env.COURSE_ID || "7b4afff2-a01f-487b-8e58-219f474ddb49";
const CONTENT_PATH = "course/5. Business, Finance & Marketing/human-resource-management-course-modules.json";

if (!ADMIN_PASSWORD) {
  throw new Error("Set ADMIN_PASSWORD before running this script.");
}

function authHeaders(token = "") {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };
}

async function fetchSupabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || response.statusText);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function login(email, password) {
  const data = await fetchSupabase("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });
  return data.access_token;
}

function filterEq(column, value) {
  return `${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;
}

async function selectRows(token, table, query = "", select = "*") {
  const suffix = query ? `&${query}` : "";
  return fetchSupabase(`/rest/v1/${table}?select=${encodeURIComponent(select)}${suffix}`, {
    headers: authHeaders(token)
  });
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function missingColumn(error) {
  const message = String(error?.message || "");
  const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1] || quoted[2] || quoted[3] || "";
  return message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
}

async function writeFirstWorking(token, table, payload, id = "", select = "*", optionalKeys = []) {
  let writePayload = compact(payload);
  let keys = [...optionalKeys];
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const path = id
        ? `/rest/v1/${table}?${filterEq("id", id)}&select=${encodeURIComponent(select)}`
        : `/rest/v1/${table}?select=${encodeURIComponent(select)}`;
      const data = await fetchSupabase(path, {
        method: id ? "PATCH" : "POST",
        headers: { ...authHeaders(token), Prefer: "return=representation" },
        body: JSON.stringify(writePayload)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (error) {
      lastError = error;
      const missing = missingColumn(error);
      const key = missing || keys.find((item) => Object.hasOwn(writePayload, item));
      if (!key) throw error;
      delete writePayload[key];
      keys = keys.filter((item) => item !== key);
    }
  }
  throw lastError || new Error(`Unable to write ${table}.`);
}

async function main() {
  const content = JSON.parse(await readFile(CONTENT_PATH, "utf8")).course;
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const [mentor] = await selectRows(adminToken, "users", filterEq("email", MENTOR_EMAIL), "*").catch(() => []);
  const [student] = await selectRows(adminToken, "users", filterEq("email", STUDENT_EMAIL), "*").catch(() => []);
  const existingById = COURSE_ID ? await selectRows(adminToken, "courses", filterEq("id", COURSE_ID), "*").catch(() => []) : [];
  const existingByTitle = existingById.length ? [] : await selectRows(adminToken, "courses", filterEq("title", content.title), "*").catch(() => []);
  const existing = existingById[0] || existingByTitle[0] || null;
  const course = await writeFirstWorking(
    adminToken,
    "courses",
    {
      title: content.title,
      description: content.description,
      category: content.category,
      duration: content.duration,
      module_type: content.module_type,
      instructor_name: mentor?.name || content.instructor_name,
      thumbnail_url: content.thumbnail_url,
      image_url: content.thumbnail_url,
      rating: content.rating,
      price: 5999,
      difficulty: content.difficulty,
      modules: content.modules,
      status: "Published",
      is_featured: true,
      is_my_course: false,
      created_by_admin: true,
      quiz_pass_score: content.quiz_pass_score,
      mentor_id: mentor?.id,
      updated_at: new Date().toISOString()
    },
    existing?.id || "",
    "*",
    ["thumbnail_url", "image_url", "mentor_id", "created_by_admin", "updated_at", "difficulty", "module_type", "is_featured", "is_my_course", "quiz_pass_score", "rating", "price"]
  );

  const existingBatches = await selectRows(adminToken, "batches", filterEq("course_id", course.id), "*").catch(() => []);
  const batch = await writeFirstWorking(adminToken, "batches", {
    name: "human-resource-management",
    course_id: course.id,
    mentor_id: mentor?.id,
    capacity: 35,
    enroll_limit: 35,
    smart_waitlist: true,
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
    progress: 0,
    enrolled_count: student?.id ? 1 : 0
  }, existingBatches[0]?.id || "", "*", ["mentor_id", "enroll_limit", "smart_waitlist", "progress", "enrolled_count", "start_date"]);

  async function enroll(user) {
    if (!user?.id) return null;
    const rows = await selectRows(adminToken, "user_courses", `${filterEq("user_id", user.id)}&${filterEq("course_id", course.id)}`, "*").catch(() => []);
    const enrollment = await writeFirstWorking(adminToken, "user_courses", {
      user_id: user.id,
      student_id: user.id,
      learner_id: user.id,
      course_id: course.id,
      batch_id: batch?.id,
      status: "active",
      created_at: new Date().toISOString()
    }, rows[0]?.id || "", "*", ["student_id", "learner_id", "batch_id", "status", "created_at"]);
    const courseIds = Array.isArray(user.course_ids) ? user.course_ids : [];
    await writeFirstWorking(adminToken, "users", {
      batch_id: user.role === "student" ? batch?.id || user.batch_id || null : user.batch_id || null,
      course_ids: [...new Set([...courseIds.map(String), String(course.id)])]
    }, user.id, "*", ["batch_id", "course_ids"]);
    return enrollment;
  }

  await enroll(student);
  await enroll(mentor);

  console.log(JSON.stringify({
    updated: true,
    course: { id: course.id, title: course.title },
    batch: batch?.id ? { id: batch.id, name: batch.name } : null,
    assigned: { student: student?.email || null, mentor: mentor?.email || null },
    modules: content.modules.length,
    lessons: content.modules.reduce((sum, module) => sum + module.lessons.length, 0),
    lessonDurations: content.modules.flatMap((module) => module.lessons.map((lesson) => lesson.duration)),
    quizQuestionsPerModule: content.modules.map((module) => module.quiz.questions.length)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.details || error);
  process.exitCode = 1;
});
