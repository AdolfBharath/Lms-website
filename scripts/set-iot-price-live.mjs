import { readFile } from "node:fs/promises";

const env = await loadEnv();
const courses = await request("courses?title=ilike.*Internet*Things*&deleted_at=is.null&select=id,title,price");
if (!courses.length) throw new Error("Internet of Things course not found.");

for (const course of courses) {
  await request(`courses?id=eq.${encodeURIComponent(course.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ price: 5999 }),
  });
}

const updated = await request("courses?title=ilike.*Internet*Things*&deleted_at=is.null&select=title,price&order=title.asc");
console.log(JSON.stringify({
  updated: updated.length,
  courses: updated.map((course) => ({
    title: course.title,
    price: Number(course.price),
  })),
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
