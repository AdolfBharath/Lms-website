import { readFile } from "node:fs/promises";

const env = await loadEnv();
const rows = await request("courses?select=title,price,status,deleted_at&order=title.asc");
const activeRows = rows
  .filter((row) => !row.deleted_at && !/archived|deleted|removed/i.test(String(row.status || "")))
  .map((row) => ({
    title: String(row.title || "Untitled course"),
    price: formatPrice(row.price),
  }));

console.log(JSON.stringify(activeRows, null, 2));

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

function formatPrice(value) {
  const amount = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? `INR ${Math.round(amount).toLocaleString("en-IN")}` : "Free";
}
