import { readFile } from "node:fs/promises";

const env = await loadEnv();
const rows = await request("courses?select=id,title,status,deleted_at&order=title.asc");
let updated = 0;

for (const row of rows) {
  const status = String(row.status || "").toLowerCase();
  const nextStatus = row.deleted_at || ["archived", "deleted", "removed"].includes(status)
    ? "deleted"
    : ["published", "active", "live"].includes(status)
      ? "active"
      : "draft";
  const patch = { status: nextStatus };
  if (nextStatus !== "deleted") patch.deleted_at = null;
  if (nextStatus === String(row.status || "").toLowerCase() && (nextStatus === "deleted" || !row.deleted_at)) continue;
  await request(`courses?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  updated += 1;
}

console.log(JSON.stringify({ scanned: rows.length, updated }, null, 2));

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
