import { readFileSync } from "node:fs";

const envText = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, "")];
    })
);

const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const tables = [
  "users",
  "form_train_deploy_enquiries",
  "form_student_registrations",
  "form_mentor_registrations",
  "form_launchpad_purchases",
  "form_hiring_applications",
  "form_event_registrations",
  "form_campus_ambassadors"
];

const out = {};
for (const table of tables) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
    method: "HEAD",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact"
    }
  });
  const range = response.headers.get("content-range") || "*/0";
  out[table] = response.ok ? Number(range.split("/").pop() || 0) : `ERR ${response.status}`;
}

console.log(JSON.stringify(out, null, 2));
