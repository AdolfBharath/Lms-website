import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const env = await loadEnv();
const email = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const password = process.env.QA_STUDENT_PASSWORD || "12345678";
const session = await passwordSession(email, password);
const profileRows = await rest(`users?select=id,email&email=eq.${encodeURIComponent(email)}`, session.access_token);
const studentId = profileRows[0]?.id;
if (!studentId) throw new Error("Student profile not found.");

const courses = await rest("courses?select=id,title,price,status,deleted_at&status=ilike.active&deleted_at=is.null&limit=200", session.access_token);
const enrollments = await rest(`user_courses?select=course_id,status,deleted_at&user_id=eq.${studentId}`, session.access_token);
const owned = new Set(enrollments
  .filter((row) => !row.deleted_at && !["archived", "deleted", "inactive", "cancelled", "removed", "disabled"].includes(String(row.status || "active").toLowerCase()))
  .map((row) => row.course_id));

console.log(JSON.stringify({
  activeCourses: courses.length,
  ownedCourses: owned.size,
  unownedCourses: courses.filter((course) => !owned.has(course.id)).slice(0, 12).map((course) => ({
    id: course.id,
    title: course.title,
    price: Number(course.price || 0),
    slug: slugify(course.title),
  })),
}, null, 2));

function slugify(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\(iot\)/g, "iot").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function passwordSession(userEmail, userPassword) {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEmail, password: userPassword }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Login failed with HTTP ${response.status}`);
  return data;
}

async function rest(path, token) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`Read failed with HTTP ${response.status}`);
  return data;
}

async function loadEnv() {
  const source = existsSync(".env.local") ? await readFile(".env.local", "utf8") : "";
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = values.SUPABASE_ANON_KEY || values.NEXT_PUBLIC_SUPABASE_ANON_KEY || values.SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase URL or publishable key in .env.local");
  return { url: url.replace(/\/$/, ""), anonKey };
}
