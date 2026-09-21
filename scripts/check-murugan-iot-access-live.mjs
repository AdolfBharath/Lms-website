import { readFile } from "node:fs/promises";

const env = await loadEnv();
const email = "murugankishore498@gmail.com";

const users = await request(`users?email=eq.${encodeURIComponent(email)}&select=id,email,role,name`);
if (!users.length) {
  console.log(JSON.stringify({ userExists: false }, null, 2));
  process.exit(0);
}

const courses = await request("courses?title=ilike.*Internet*Things*&deleted_at=is.null&select=id,title,price");
const enrollments = courses[0]
  ? await request(`user_courses?user_id=eq.${encodeURIComponent(users[0].id)}&course_id=eq.${encodeURIComponent(courses[0].id)}&select=id,status`)
  : [];

console.log(JSON.stringify({
  userExists: true,
  role: users[0].role,
  iotPrice: Number(courses[0]?.price || 0),
  iotEnrollmentCount: enrollments.length,
}, null, 2));

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
