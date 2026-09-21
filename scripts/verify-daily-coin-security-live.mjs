import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const env = await loadEnv();
const studentEmail = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const studentPassword = process.env.QA_STUDENT_PASSWORD || "12345678";

const noAuth = await rpc(env.anonKey, {});
const session = await passwordSession(studentEmail, studentPassword);
const profile = await rest(
  `users?select=id,email,role,coins,coin_balance,last_login_reward_date&email=eq.${encodeURIComponent(studentEmail)}`,
  session.access_token
);
const student = profile.data?.[0];
if (!student?.id) throw new Error("QA student profile was not readable by the signed-in QA student.");

const wrongUser = await rpc(session.access_token, {
  target_user_id: "00000000-0000-0000-0000-000000000000",
});
const manipulated = await rpc(session.access_token, {
  target_user_id: student.id,
  reward_amount: 999,
  reward_date: "2099-01-01",
  user_id: "00000000-0000-0000-0000-000000000000",
});

const summary = {
  unauthenticatedRejected: !noAuth.ok,
  wrongUserRejected: !wrongUser.ok,
  clientManipulationRejected: !manipulated.ok,
  studentRole: student.role,
  liveBalanceVisible: Number(student.coin_balance ?? student.coins ?? 0),
};

console.log(JSON.stringify(summary, null, 2));

if (!summary.unauthenticatedRejected || !summary.wrongUserRejected || !summary.clientManipulationRejected) {
  process.exitCode = 1;
}

async function rpc(token, body) {
  const response = await fetch(`${env.url}/rest/v1/rpc/lms_claim_daily_login_reward`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

async function rest(path, token) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

async function passwordSession(email, password) {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Student login failed with HTTP ${response.status}`);
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
