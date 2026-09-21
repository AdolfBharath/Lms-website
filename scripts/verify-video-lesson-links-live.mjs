import { readFile } from "node:fs/promises";

const env = await loadEnv();
const rows = await request("courses?select=title,modules,status,deleted_at&order=title.asc");
const activeRows = rows.filter((row) => !row.deleted_at && !["deleted", "archived", "removed"].includes(String(row.status || "active").toLowerCase()));

const report = activeRows.map((course) => {
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const lessons = modules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  const videoLessons = lessons.filter((lesson) => /video/i.test(String(lesson.content_type || lesson.type || "")));
  const folderLinks = videoLessons.filter((lesson) => /drive\.google\.com\/drive\/folders\//i.test([
    lesson.video_drive_link,
    lesson.video_url,
    lesson.drive_link,
    lesson.google_drive_link,
  ].join(" ")));
  const fileLinks = videoLessons.filter((lesson) => /drive\.google\.com\/file\/d\//i.test([
    lesson.video_drive_link,
    lesson.video_url,
    lesson.drive_link,
    lesson.google_drive_link,
  ].join(" ")));
  return {
    title: course.title,
    videoLessons: videoLessons.length,
    fileVideoLinks: fileLinks.length,
    folderVideoLinks: folderLinks.length,
  };
});

const fullyMapped = report.filter((course) => course.videoLessons > 0 && course.videoLessons === course.fileVideoLinks && course.folderVideoLinks === 0);
const needsFileMapping = report.filter((course) => course.videoLessons === 0 || course.videoLessons !== course.fileVideoLinks || course.folderVideoLinks > 0);

console.log(JSON.stringify({
  activeCourses: activeRows.length,
  fullyMapped: fullyMapped.map((course) => course.title),
  needsFileMapping,
}, null, 2));
if (needsFileMapping.length) process.exitCode = 1;

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
