import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const runId = `SAFE-SEC-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const outDir = join("test-results", "safe-security-audit", runId);
await mkdir(outDir, { recursive: true });

const env = await loadEnv();
const results = [];
const notes = [];

const accounts = {
  admin: { email: process.env.QA_ADMIN_EMAIL || "admin@jenovate.in", password: process.env.QA_ADMIN_PASSWORD || "Temp@12345" },
  mentor: { email: process.env.QA_MENTOR_EMAIL || "mentor1@gmail.com", password: process.env.QA_MENTOR_PASSWORD || "12345678" },
  student: { email: process.env.QA_STUDENT_EMAIL || "student1@gmail.com", password: process.env.QA_STUDENT_PASSWORD || "12345678" },
};

const add = (area, test, expected, actual, status, severity = "INFO", evidence = "") => {
  results.push({ area, test, expected, actual, status, severity, evidence });
};
const pass = (area, test, expected, actual, evidence = "") => add(area, test, expected, actual, "PASS", "INFO", evidence);
const fail = (area, test, expected, actual, severity, evidence = "") => add(area, test, expected, actual, "FAIL", severity, evidence);
const nt = (area, test, reason) => add(area, test, "Tested safely", `NOT TESTED - ${reason}`, "NOT TESTED", "INFO", reason);

const browser = await chromium.launch({ headless: true });
try {
  await routeSmoke();
  await authTests();
  await directApiTests();
  await paymentSafeTests();
  await codeSecurityChecks();
  await backendContentChecks();
  await securityHeaders();
} finally {
  await browser.close();
}

const critical = results.filter((item) => item.status === "FAIL" && item.severity === "CRITICAL").length;
const high = results.filter((item) => item.status === "FAIL" && item.severity === "HIGH").length;
const medium = results.filter((item) => item.status === "FAIL" && item.severity === "MEDIUM").length;
const launchVerdict = critical || high ? "NO-GO" : medium ? "GO WITH FIXES" : "GO";

const report = {
  generated_at: new Date().toISOString(),
  base_url: baseURL,
  run_id: runId,
  launch_verdict: launchVerdict,
  summary: {
    total: results.length,
    pass: results.filter((item) => item.status === "PASS").length,
    fail: results.filter((item) => item.status === "FAIL").length,
    not_tested: results.filter((item) => item.status === "NOT TESTED").length,
    critical,
    high,
    medium,
    low: results.filter((item) => item.status === "FAIL" && item.severity === "LOW").length,
  },
  notes,
  results,
};

await writeFile(join(outDir, "safe-security-audit.json"), JSON.stringify(report, null, 2));
await writeFile(join(outDir, "safe-security-audit.md"), markdownReport(report));
console.log(JSON.stringify({
  runId,
  reportDir: outDir,
  launchVerdict,
  summary: report.summary,
  failures: results.filter((item) => item.status === "FAIL").map(({ area, test, severity, actual }) => ({ area, test, severity, actual })),
  notTested: results.filter((item) => item.status === "NOT TESTED").map(({ area, test, actual }) => ({ area, test, actual })),
}, null, 2));
if (critical || high) process.exitCode = 2;

async function routeSmoke() {
  const routes = [
    "index.html",
    "about-us.html",
    "aboutus.html",
    "campus-ambassador.html",
    "course-detail.html?course=psychology",
    "course-detail.html?course=medical-coding",
    "course-detail.html?course=iot-and-robotics",
    "join-form.html",
    "login.html",
    "reset-password.html",
    "student.html",
    "mentor.html",
    "admin.html",
    "unauthorized.html",
    "privacy-policy.html",
    "terms-of-service.html",
    "refund-policy.html",
    "launchpad.html",
    "launchpad-detail.html",
    "form-engine/index.html",
  ];
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  for (const route of routes) {
    const response = await page.goto(`${baseURL}/${route}`, { waitUntil: "domcontentloaded" }).catch((error) => ({ error }));
    await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(500);
    const status = typeof response?.status === "function" ? response.status() : 0;
    const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    if (body.trim().length > 20 && (!status || (status >= 200 && status < 400))) pass("Functional QA", `Route renders: ${route}`, "HTTP 2xx/3xx and visible content", `HTTP ${status || "client-rendered"}`);
    else fail("Functional QA", `Route renders: ${route}`, "HTTP 2xx/3xx and visible content", `HTTP ${status || "error"}`, "MEDIUM", body.slice(0, 160));
  }
  await page.close();
}

async function authTests() {
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login.html`, { waitUntil: "domcontentloaded" });
  await waitForClient(page);
  const invalid = await page.evaluate(async () => {
    const client = window.getSupabaseClient();
    const { error } = await client.auth.signInWithPassword({ email: "student1@gmail.com", password: "WrongPassword123!" });
    return { status: error?.status || null, message: error?.message || "" };
  });
  if (invalid.status >= 400 && /invalid|credential|login/i.test(invalid.message)) pass("Authentication", "Invalid password rejected", "Reject invalid login", `Rejected ${invalid.status}`);
  else fail("Authentication", "Invalid password rejected", "Reject invalid login", JSON.stringify(invalid), "HIGH");

  const roles = {};
  for (const role of ["student", "mentor", "admin"]) {
    roles[role] = await loginViaClient(page, accounts[role].email, accounts[role].password);
    if (roles[role]?.profile?.role === role) pass("Authentication", `${role} login`, "Valid user gets matching role", `${role} authenticated`);
    else fail("Authentication", `${role} login`, "Valid user gets matching role", JSON.stringify(roles[role]), "HIGH");
    await page.evaluate(() => window.getSupabaseClient().auth.signOut());
  }
  await page.close();
}

async function directApiTests() {
  const anonUsers = await rest("users?select=id,email,phone,role&limit=10", env.anonKey);
  if (!anonUsers.ok) pass("Information Disclosure", "Anon cannot read users", "Reject public user table read", `Rejected ${anonUsers.status}`);
  else fail("Information Disclosure", "Anon cannot read users", "Reject public user table read", `Returned ${anonUsers.data?.length || 0} user rows`, "CRITICAL");

  const anonOrders = await rest("lms_course_orders?select=id,user_id,amount,status&limit=10", env.anonKey);
  if (!anonOrders.ok) pass("Payment Security", "Anon cannot read orders", "Reject public order read", `Rejected ${anonOrders.status}`);
  else fail("Payment Security", "Anon cannot read orders", "Reject public order read", `Returned ${anonOrders.data?.length || 0} order rows`, "CRITICAL");

  const anonCoursesModules = await rest("courses?select=title,modules&limit=1", env.anonKey);
  if (!anonCoursesModules.ok) pass("Course Access", "Anon cannot read raw course modules", "Reject public module/video metadata read", `Rejected ${anonCoursesModules.status}`);
  else {
    const leaked = JSON.stringify(anonCoursesModules.data || []).includes("drive.google.com");
    if (leaked) fail("Video Security", "Anon raw course SELECT exposes Drive lesson links", "No public paid video URLs", "Drive URL visible in anon course response", "HIGH");
    else pass("Course Access", "Anon raw course SELECT does not expose Drive links", "No public paid video URLs", "No Drive URL in sampled response");
  }

  const student = await authSession(accounts.student.email, accounts.student.password);
  const studentUsers = await rest("users?select=id,email,phone,role&limit=25", student.access_token);
  if (!studentUsers.ok) pass("IDOR/BOLA", "Student broad users SELECT rejected", "Reject or constrain direct user read", `Rejected ${studentUsers.status}`);
  else {
    const others = (studentUsers.data || []).filter((row) => String(row.email || "").toLowerCase() !== accounts.student.email);
    if (others.length > 5) fail("IDOR/BOLA", "Student broad users SELECT constrained", "Only self/approved directory", `Student saw ${others.length} other user rows`, "HIGH");
    else pass("IDOR/BOLA", "Student broad users SELECT constrained", "Only self/approved directory", `Student saw ${others.length} other rows`);
  }

  const studentOrders = await rest("lms_course_orders?select=id,user_id,course_id,status,amount&limit=25", student.access_token);
  if (!studentOrders.ok) pass("Payment Security", "Student direct order read constrained/rejected", "No broad payment history", `Rejected ${studentOrders.status}`);
  else {
    const foreign = (studentOrders.data || []).filter((row) => row.user_id && row.user_id !== student.profile?.id);
    if (foreign.length) fail("Payment Security", "Student cannot read other orders", "Own orders only", `Saw ${foreign.length} foreign orders`, "HIGH");
    else pass("Payment Security", "Student cannot read other orders", "Own orders only", `Returned ${studentOrders.data?.length || 0} own-visible rows`);
  }

  const studentAdminRpc = await rpc("lms_admin_move_course_to_draft", student.access_token, { actor_user_id: student.profile?.id, target_course_id: "00000000-0000-0000-0000-000000000000" });
  if (!studentAdminRpc.ok) pass("Privilege Escalation", "Student cannot call admin course RPC", "Reject student admin RPC", `Rejected ${studentAdminRpc.status}`);
  else fail("Privilege Escalation", "Student cannot call admin course RPC", "Reject student admin RPC", "RPC returned success", "CRITICAL");

  const mentor = await authSession(accounts.mentor.email, accounts.mentor.password);
  const mentorAdminRpc = await rpc("lms_admin_move_course_to_draft", mentor.access_token, { actor_user_id: mentor.profile?.id, target_course_id: "00000000-0000-0000-0000-000000000000" });
  if (!mentorAdminRpc.ok) pass("Privilege Escalation", "Mentor cannot call admin course RPC", "Reject mentor admin RPC", `Rejected ${mentorAdminRpc.status}`);
  else fail("Privilege Escalation", "Mentor cannot call admin course RPC", "Reject mentor admin RPC", "RPC returned success", "CRITICAL");

  nt("Registration Security", "Duplicate registration and role-tampering signup", "would create/rate-limit real Supabase Auth users; covered by static tests and previous signup work, not executed in this safe run");
  nt("Destructive Admin QA", "Delete/disable/restore users and courses", "would modify production data; not executed in this safe run");
}

async function paymentSafeTests() {
  const courseLookup = await functionCall("course-purchase", env.anonKey, { action: "course", course_slug: "psychology" });
  if (courseLookup.ok && courseLookup.data?.course?.title === "Psychology" && Number(courseLookup.data?.course?.amount) === 5999) {
    pass("Payment Security", "Safe course lookup resolves trusted backend price", "Psychology INR 5,999 from backend", "PASS");
  } else {
    fail("Payment Security", "Safe course lookup resolves trusted backend price", "Psychology INR 5,999 from backend", JSON.stringify(courseLookup), "HIGH");
  }
  for (const action of ["create_order", "verify_payment", "mark_cancelled"]) {
    const response = await functionCall("course-purchase", env.anonKey, { action, course_slug: "psychology", order_id: "00000000-0000-0000-0000-000000000000", amount: 1, payment_status: "success", user_id: "00000000-0000-0000-0000-000000000000" });
    if (!response.ok) pass("Payment Security", `Anon ${action} rejected`, "Auth required", `Rejected ${response.status}`);
    else fail("Payment Security", `Anon ${action} rejected`, "Auth required", "Function returned success", "CRITICAL");
  }
  nt("Payment Security", "Logged-in create_order/payment session tampering", "could create a real production Cashfree order/session; intentionally not executed");
  nt("Payment Security", "Webhook replay/fake success against live function", "could mutate real order/payment state; reviewed statically and covered by tests, not executed live");
}

async function codeSecurityChecks() {
  const checks = [
    ["course-purchase.js", /from\("user_courses"\)\.insert/, false, "Frontend must not insert enrollments"],
    ["course-purchase.js", /payment_status.*success[\s\S]{0,160}user_courses/, false, "Frontend must not grant enrollment from payment status"],
    ["supabase/functions/course-purchase/index.ts", /body\.amount/, false, "Payment function must not trust client amount"],
    ["supabase/functions/course-purchase/index.ts", /courseAmount\(course\)/, true, "Payment function uses backend course price"],
    ["supabase/functions/course-purchase/index.ts", /verifyCashfreeWebhook/, true, "Webhook signature verification exists"],
    ["supabase/functions/course-purchase/index.ts", /Webhook amount or currency mismatch/, true, "Webhook checks amount/currency"],
    ["supabase/functions/admin-save-user/index.ts", /Admin access required/, true, "Admin user function checks admin role"],
    ["auth-session.js", /const profile = await profileFromCurrentAuth\(\);/, true, "Route auth requires live Supabase user"],
  ];
  for (const [file, pattern, shouldMatch, label] of checks) {
    const source = await readFile(file, "utf8");
    const ok = pattern.test(source) === shouldMatch;
    if (ok) pass("Static Security", label, shouldMatch ? "Pattern present" : "Pattern absent", file);
    else fail("Static Security", label, shouldMatch ? "Pattern present" : "Pattern absent", file, "HIGH");
  }
}

async function backendContentChecks() {
  const activeCourses = await rest("courses?select=id,title,price,status,deleted_at,modules&deleted_at=is.null&status=ilike.active&limit=500", env.serviceKey);
  if (!activeCourses.ok) return fail("Backend Data", "Active courses readable by service audit", "Read active courses", `HTTP ${activeCourses.status}`, "MEDIUM");
  const rows = activeCourses.data || [];
  const badPrice = rows.filter((course) => Number(course.price) !== 5999);
  const driveFolderLinks = rows.filter((course) => lessonVideoFields(course.modules).some((value) => /drive\.google\.com\/drive\/folders\//i.test(value)));
  if (rows.length === 29 && !badPrice.length) pass("Backend Data", "Course count and pricing", "29 active courses, all INR 5,999", `${rows.length} active courses`);
  else fail("Backend Data", "Course count and pricing", "29 active courses, all INR 5,999", `${rows.length} courses, ${badPrice.length} bad prices`, "HIGH");
  if (!driveFolderLinks.length) pass("Video Security", "Lessons use file-level Drive links", "No folder links in lesson video fields", "No folder links found");
  else fail("Video Security", "Lessons use file-level Drive links", "No folder links in lesson video fields", `${driveFolderLinks.length} courses contain folder links`, "MEDIUM");
}

async function securityHeaders() {
  const response = await fetch(`${baseURL}/login.html`);
  const headers = response.headers;
  const required = ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];
  const missing = required.filter((header) => !headers.get(header));
  if (!missing.length) pass("Web Security", "Security headers present", "CSP, nosniff, frame, referrer, permissions", "All present");
  else fail("Web Security", "Security headers present", "CSP, nosniff, frame, referrer, permissions", `Missing ${missing.join(", ")}`, "MEDIUM");
}

async function waitForClient(page) {
  await page.waitForFunction(() => window.getSupabaseClient && window.supabase?.createClient, null, { timeout: 25000 });
}

async function loginViaClient(page, email, password) {
  return page.evaluate(async ({ email, password }) => {
    const client = window.getSupabaseClient();
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) return { error: { status: signIn.error.status, message: signIn.error.message } };
    const user = signIn.data?.user;
    const profile = await client.from("users").select("id,email,role,status,batch_id").eq("email", email).maybeSingle();
    return { authEmail: user?.email || "", profile: profile.data, profileError: profile.error ? { code: profile.error.code, message: profile.error.message } : null };
  }, { email, password });
}

async function authSession(email, password) {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status}`);
  const profile = await rest(`users?select=id,email,role,status,batch_id&email=ilike.${encodeURIComponent(email)}`, data.access_token);
  return { access_token: data.access_token, profile: profile.data?.[0] || null };
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

async function rpc(name, token, body) {
  const response = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
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

async function functionCall(name, token, body) {
  const response = await fetch(`${env.url}/functions/v1/${name}`, {
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

async function loadEnv() {
  const source = existsSync(".env.local") ? await readFile(".env.local", "utf8") : "";
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = values.SUPABASE_ANON_KEY || values.NEXT_PUBLIC_SUPABASE_ANON_KEY || values.SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase URL, publishable key, or service-role key in .env.local");
  return { url: url.replace(/\/$/, ""), anonKey, serviceKey };
}

function markdownReport(report) {
  const lines = [
    "# Jenovate LMS Safe Security Audit",
    "",
    `Generated: ${report.generated_at}`,
    `Base URL: ${report.base_url}`,
    `Run ID: ${report.run_id}`,
    `Launch verdict: ${report.launch_verdict}`,
    "",
    "## Summary",
    "",
    `Total checks: ${report.summary.total}`,
    `Passed: ${report.summary.pass}`,
    `Failed: ${report.summary.fail}`,
    `Not tested: ${report.summary.not_tested}`,
    `Critical: ${report.summary.critical}`,
    `High: ${report.summary.high}`,
    `Medium: ${report.summary.medium}`,
    "",
    "## Matrix",
    "",
    "| Area | Test | Expected | Actual | Status | Severity |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const item of report.results) {
    lines.push(`| ${cell(item.area)} | ${cell(item.test)} | ${cell(item.expected)} | ${cell(item.actual)} | ${cell(item.status)} | ${cell(item.severity)} |`);
  }
  return lines.join("\n");
}

function lessonVideoFields(modules) {
  return (Array.isArray(modules) ? modules : []).flatMap((module) => {
    const lessons = Array.isArray(module?.lessons) ? module.lessons : [];
    return lessons.flatMap((lesson) => [
      lesson?.video_url,
      lesson?.videoUrl,
      lesson?.video_drive_link,
      lesson?.videoDriveLink,
      lesson?.video,
      lesson?.embed_url,
      lesson?.embedUrl,
    ].filter(Boolean).map(String));
  });
}

function cell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 280);
}
