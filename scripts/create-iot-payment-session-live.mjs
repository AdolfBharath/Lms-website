import { readFile, writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";

const TEST_STUDENT = {
  name: "Murugan Kishore",
  email: "murugankishore498@gmail.com",
  phone: "9999999999",
  password: "123456789",
};
const COURSE_SLUG = "internet-of-things-iot";
const OUTPUT_PATH = "test-results/iot-payment-session.json";

const env = await loadEnv();
const auth = await signupOrLogin(TEST_STUDENT);
await invokePurchase(auth.access_token, "create_student_profile", {
  profile: {
    name: TEST_STUDENT.name,
    email: TEST_STUDENT.email,
    phone: TEST_STUDENT.phone,
    role: "student",
  },
});
const orderResponse = await invokePurchase(auth.access_token, "create_order", { course_slug: COURSE_SLUG });

mkdirSync("test-results", { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify({
  course: orderResponse.course?.title || "Internet of Things (IoT)",
  amount: Number(orderResponse.course?.final_amount ?? orderResponse.order?.amount ?? 0),
  mode: orderResponse.provider?.mode || "unknown",
  already_owned: Boolean(orderResponse.already_owned),
  has_payment_session: Boolean(orderResponse.provider?.payment_session_id),
  payment_session_id: orderResponse.provider?.payment_session_id || "",
  order_id: orderResponse.order?.provider_order_id || orderResponse.order?.id || "",
}, null, 2));

console.log(JSON.stringify({
  account: auth.created ? "created" : "existing-login",
  course: orderResponse.course?.title || "Internet of Things (IoT)",
  amount: Number(orderResponse.course?.final_amount ?? orderResponse.order?.amount ?? 0),
  mode: orderResponse.provider?.mode || "unknown",
  already_owned: Boolean(orderResponse.already_owned),
  has_payment_session: Boolean(orderResponse.provider?.payment_session_id),
  saved: OUTPUT_PATH,
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
  const anonKey = values.SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || values.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase URL or publishable key in .env.local");
  return { url: url.replace(/\/$/, ""), anonKey };
}

async function signupOrLogin(student) {
  const signup = await authRequest("/signup", {
    email: student.email,
    password: student.password,
    data: {
      name: student.name,
      phone: student.phone,
      role: "student",
    },
  });
  if (signup.access_token) return { ...signup, created: true };
  if (isExistingAccount(signup)) {
    const login = await authRequest("/token?grant_type=password", {
      email: student.email,
      password: student.password,
    });
    if (!login.access_token) throw new Error(login.error_description || login.msg || "Existing account login failed.");
    return { ...login, created: false };
  }
  throw new Error(signup.error_description || signup.msg || signup.message || "Signup failed.");
}

async function authRequest(path, body) {
  const response = await fetch(`${env.url}/auth/v1${path}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) return data;
  return data;
}

async function invokePurchase(accessToken, action, payload) {
  const response = await fetch(`${env.url}/functions/v1/course-purchase`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || data.message || `Purchase function failed: ${response.status}`);
  return data;
}

function isExistingAccount(response) {
  return /\b(already registered|already exists|user exists|email exists|duplicate)\b/i.test(
    String(response?.msg || response?.message || response?.error_description || response?.error || ""),
  );
}
