import { readFile } from "node:fs/promises";

const COURSE_PRICE = 5999;

const frontendCourses = [
  "Programming in Python",
  "Programming in Java",
  "DSA with Python",
  "Front-End Web Development",
  "Full-Stack Web Development",
  "Senior SDE Interview Prep",
  "Full Stack Developer Portfolio",
  "Android Development",
  "Artificial Intelligence",
  "AI (Agentic & Generative)",
  "Machine Learning",
  "Data Science",
  "Data Engineering with SQL & Cloud",
  "Data Analytics with Power BI",
  "Data Analysis",
  "Cyber Security & Ethical Hacking",
  "Cloud Computing",
  "DevOps",
  "Internet of Things (IoT)",
  "Embedded Systems",
  "VLSI",
  "Robotics",
  "Hybrid Electric Vehicle",
  "Nanotechnology",
  "Digital Marketing",
  "Human Resource Management",
  "Finance",
  "Startup & Entrepreneurship",
  "Business Analysis",
  "Operation & Supply Chain Management",
  "E-Commerce Operations Management",
  "Product & Project Management",
  "Stock Marketing",
  "UI/UX",
  "Graphic Designing",
  "AutoCAD",
  "Car Design",
  "Medical Coding",
  "Clinical Trials & Research",
  "Psychology",
  "Counselling Psychology Practice",
  "Clinical Psychology Basics",
  "Rehabilitation Psychology",
];

const titleBySlug = new Map(frontendCourses.map((title) => [slugify(title), title]));
titleBySlug.set("iot", "Internet of Things (IoT)");
titleBySlug.set("internet-of-things", "Internet of Things (IoT)");
titleBySlug.set("iot-and-robotics", "Robotics");
titleBySlug.set("stock-marketing-1", "Stock Marketing");
titleBySlug.set("ui-and-ux", "UI/UX");
titleBySlug.set("ui-ux", "UI/UX");
titleBySlug.set("autocad", "AutoCAD");
titleBySlug.set("artificial-intelligence-and-machine-learning", "Artificial Intelligence");
titleBySlug.set("cyber-security", "Cyber Security & Ethical Hacking");
titleBySlug.set("data-structures-and-algorithms", "DSA with Python");
titleBySlug.set("embedded-system", "Embedded Systems");
titleBySlug.set("generative-ai", "AI (Agentic & Generative)");

const env = await loadEnv();
const courses = await request("courses?select=*&order=title.asc");
const report = { scanned: courses.length, updated: 0, unchanged: 0, missingFrontendMatch: [] };

for (const course of courses) {
  if (course.deleted_at) continue;
  const currentSlug = slugify(course.slug || course.course_slug || course.handle || course.title || "");
  const canonicalTitle = titleBySlug.get(currentSlug) || titleBySlug.get(slugify(course.title || ""));
  const patch = { price: COURSE_PRICE };
  if (canonicalTitle && course.title !== canonicalTitle) patch.title = canonicalTitle;
  if (!canonicalTitle) report.missingFrontendMatch.push(String(course.title || course.id || "Untitled course"));
  if (String(course.price ?? "") === String(COURSE_PRICE) && !patch.title) {
    report.unchanged += 1;
    continue;
  }
  await request(`courses?id=eq.${encodeURIComponent(course.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  report.updated += 1;
}

console.log(JSON.stringify(report, null, 2));

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
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\(iot\)/g, "iot")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
