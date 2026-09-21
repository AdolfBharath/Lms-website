import { readFile } from "node:fs/promises";

const ids = process.argv.slice(2).filter(Boolean);
if (!ids.length) throw new Error("Pass one or more course ids.");

const env = await loadEnv();
const clauses = ids.map((id) => `course_id.eq.${encodeURIComponent(id)}`).join(",");
const rows = await request(`lms_course_orders?select=id,course_id,user_id,status,amount,currency,provider_order_id,created_at&or=(${clauses})&order=created_at.desc`);
console.log(JSON.stringify(rows.map((row) => ({
  id: row.id,
  course_id: row.course_id,
  user_id: row.user_id,
  status: row.status,
  amount: row.amount,
  currency: row.currency,
  provider_order_id_present: Boolean(row.provider_order_id),
  created_at: row.created_at,
})), null, 2));

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
  const response = await fetch(`${env.url}/rest/v1/${path}`, { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
