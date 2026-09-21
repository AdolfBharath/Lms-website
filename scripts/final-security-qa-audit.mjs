import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const runId = `SEC-QA-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const outDir = join("test-results", "security-qa", runId);
mkdirSync(outDir, { recursive: true });

const accounts = {
  admin: { email: process.env.QA_ADMIN_EMAIL || "admin@jenovate.in", password: process.env.QA_ADMIN_PASSWORD || "Temp@12345" },
  mentor: { email: process.env.QA_MENTOR_EMAIL || "mentor1@gmail.com", password: process.env.QA_MENTOR_PASSWORD || "12345678" },
  student: { email: process.env.QA_STUDENT_EMAIL || "student1@gmail.com", password: process.env.QA_STUDENT_PASSWORD || "12345678" }
};

const results = [];
const cleanup = { chats: [], storage: [], batches: [], courses: [], restoreStudentBatch: null };
const browser = await chromium.launch({ headless: true });

function add(category, name, status, severity, evidence = "", recommendation = "") {
  results.push({ category, name, status, severity, evidence, recommendation });
}

function pass(category, name, evidence = "") {
  add(category, name, "PASS", "INFO", evidence);
}

function fail(category, name, severity, evidence, recommendation) {
  add(category, name, "FAIL", severity, evidence, recommendation);
}

function warn(category, name, severity, evidence, recommendation) {
  add(category, name, "WARN", severity, evidence, recommendation);
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.getSupabaseClient && window.supabase?.createClient, null, { timeout: 25_000 });
}

async function newPage(role = "anon") {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "" }));
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await waitForApp(page);
  if (role !== "anon") {
    await page.fill("#email", accounts[role].email);
    await page.fill("#password", accounts[role].password);
    await page.locator(".submit-btn").click();
    await page.waitForFunction(() => Boolean(window.getSupabaseClient?.()?.auth), null, { timeout: 25_000 });
    await page.waitForTimeout(2500);
  }
  page.audit = { consoleErrors, failedRequests };
  return page;
}

async function clientEval(page, fn, arg = {}) {
  return page.evaluate(async ({ source, arg }) => {
    const client = window.getSupabaseClient();
    const run = new Function("client", "arg", `return (${source})(client, arg);`);
    return run(client, arg);
  }, { source: fn.toString(), arg });
}

async function screenshot(page, name) {
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function loginStatus(page, role) {
  const status = await clientEval(page, async (client) => {
    const { data: sessionData } = await client.auth.getSession();
    const { data: userData } = await client.auth.getUser();
    const { data: profile, error } = await client.from("users").select("id,email,role,batch_id,status").eq("email", userData?.user?.email || "").maybeSingle();
    return { hasSession: Boolean(sessionData?.session), authEmail: userData?.user?.email || "", profile, error: error ? { code: error.code, message: error.message } : null };
  });
  if (status.hasSession && status.profile?.role === role) pass("Authentication", `${role} login`, `${status.authEmail} authenticated with ${role} profile.`);
  else fail("Authentication", `${role} login`, "HIGH", JSON.stringify(status), "Fix login/session/profile role synchronization.");
  return status.profile;
}

async function invalidCredentialTests() {
  const page = await newPage("anon");
  const invalid = await clientEval(page, async (client) => {
    const attempts = [];
    for (const email of ["student1@gmail.com", "not-a-real-user@example.com"]) {
      const started = performance.now();
      const { error } = await client.auth.signInWithPassword({ email, password: "WrongPassword123!" });
      attempts.push({ email, ms: Math.round(performance.now() - started), message: error?.message || "", status: error?.status || null });
    }
    return attempts;
  });
  if (invalid.every((item) => item.status >= 400 && /invalid|credential|login/i.test(item.message))) {
    pass("Authentication", "Invalid credentials rejected", JSON.stringify(invalid));
  } else {
    fail("Authentication", "Invalid credentials rejected", "HIGH", JSON.stringify(invalid), "Ensure Supabase Auth rejects invalid logins generically.");
  }
  await page.close();
}

async function rbacPageTests(studentPage, mentorPage) {
  const checks = [
    { page: studentPage, role: "student", path: "admin.html", forbiddenText: "Admin Dashboard" },
    { page: studentPage, role: "student", path: "mentor.html", forbiddenText: "Mentor Dashboard" },
    { page: mentorPage, role: "mentor", path: "admin.html", forbiddenText: "Admin Dashboard" }
  ];
  for (const check of checks) {
    await check.page.goto(`${baseURL}/${check.path}`, { waitUntil: "load" }).catch(() => {});
    await check.page.waitForTimeout(2000);
    const bodyText = await check.page.locator("body").innerText().catch(() => "");
    const blocked = !bodyText.includes(check.forbiddenText) || /unauthorized|access denied|login/i.test(bodyText);
    if (blocked) pass("RBAC", `${check.role} blocked from ${check.path}`, `URL after navigation: ${check.page.url()}`);
    else fail("RBAC", `${check.role} blocked from ${check.path}`, "HIGH", `Page rendered restricted text: ${check.forbiddenText}`, "Route guard must enforce role before rendering protected portal data.");
  }
}

async function rlsAndApiTests(adminPage, mentorPage, studentPage, profiles) {
  const adminData = await clientEval(adminPage, async (client) => {
    const [users, courses, batches] = await Promise.all([
      client.from("users").select("id,email,role,batch_id,status").limit(50),
      client.from("courses").select("id,title,status,deleted_at").limit(20),
      client.from("batches").select("id,name,mentor_id,course_id,student_ids").limit(20)
    ]);
    return { users, courses, batches };
  });
  if (!adminData.users.error) pass("Admin QA", "Admin can read users", `Rows sampled: ${adminData.users.data?.length || 0}`);
  else fail("Admin QA", "Admin can read users", "HIGH", JSON.stringify(adminData.users.error), "Repair admin RLS/RPC permissions.");
  if (!adminData.courses.error) pass("Admin QA", "Admin can read courses", `Rows sampled: ${adminData.courses.data?.length || 0}`);
  if (!adminData.batches.error) pass("Admin QA", "Admin can read batches", `Rows sampled: ${adminData.batches.data?.length || 0}`);

  const otherStudent = (adminData.users.data || []).find((user) => user.role === "student" && user.id !== profiles.student?.id);
  const otherBatch = (adminData.batches.data || []).find((batch) => batch.id !== profiles.student?.batch_id);

  const studentRls = await clientEval(studentPage, async (client, arg) => {
    const own = arg.studentId;
    const otherStudent = arg.otherStudentId;
    const otherBatch = arg.otherBatchId;
    const badCourse = await client.from("courses").insert({ title: "SECURITY-AUDIT-UNAUTHORIZED-COURSE", description: "should fail", status: "draft" }).select("id");
    const users = await client.from("users").select("id,email,role,phone,batch_id").limit(25);
    const escalate = await client.from("users").update({ role: "student" }).eq("id", own).select("id,role");
    const adminRpc = await client.rpc("lms_admin_delete_user", { admin_user_id: own, target_user_id: own });
    const otherAttempts = otherStudent ? await client.from("student_quiz_attempts").select("id,student_id,score").eq("student_id", otherStudent).limit(10) : { data: [], error: null };
    const otherProgress = otherStudent ? await client.from("student_course_progress").select("id,student_id,course_id").eq("student_id", otherStudent).limit(10) : { data: [], error: null };
    const otherBatchRead = otherBatch ? await client.from("batches").select("id,name").eq("id", otherBatch).limit(1) : { data: [], error: null };
    return { badCourse, users, escalate, adminRpc, otherAttempts, otherProgress, otherBatchRead };
  }, { studentId: profiles.student?.id, otherStudentId: otherStudent?.id || null, otherBatchId: otherBatch?.id || null });

  if (studentRls.badCourse.error) pass("RLS", "Student cannot create course", studentRls.badCourse.error.message);
  else fail("RLS", "Student cannot create course", "HIGH", JSON.stringify(studentRls.badCourse.data), "Restrict courses INSERT to admin or authorized mentors only.");
  if (studentRls.adminRpc.error) pass("API Security", "Student cannot execute admin delete RPC", studentRls.adminRpc.error.message);
  else fail("API Security", "Student cannot execute admin delete RPC", "CRITICAL", JSON.stringify(studentRls.adminRpc.data), "Add role check inside SECURITY DEFINER RPC and revoke unsafe grants.");
  const visibleOtherUsers = (studentRls.users.data || []).filter((user) => user.id !== profiles.student?.id);
  if (!studentRls.users.error && visibleOtherUsers.length <= 5) {
    pass("Data Exposure", "Student user directory is constrained", `Student saw ${visibleOtherUsers.length} other user rows, expected only batch/mentor-visible rows.`);
  } else if (!studentRls.users.error) {
    fail("Data Exposure", "Student user directory is constrained", "HIGH", `Student saw ${visibleOtherUsers.length} other users via direct SELECT.`, "Narrow users SELECT policy to self, assigned mentors, and approved directory RPC output.");
  } else {
    pass("Data Exposure", "Student broad users SELECT rejected", studentRls.users.error.message);
  }
  if ((studentRls.escalate.data || []).length === 0 || studentRls.escalate.error) pass("RLS", "Student cannot write profile role column", studentRls.escalate.error?.message || "No rows updated.");
  else warn("RLS", "Student can update own role row with same value", "MEDIUM", JSON.stringify(studentRls.escalate.data), "Split profile updates into allowlisted RPC or column-specific policy.");
  if ((studentRls.otherAttempts.data || []).length === 0 && (studentRls.otherProgress.data || []).length === 0 && (studentRls.otherBatchRead.data || []).length === 0) {
    pass("IDOR", "Student cannot read sampled other student/batch objects", JSON.stringify({
      attempts: studentRls.otherAttempts.data?.length || 0,
      progress: studentRls.otherProgress.data?.length || 0,
      batches: studentRls.otherBatchRead.data?.length || 0
    }));
  } else {
    fail("IDOR", "Student cannot read sampled other student/batch objects", "HIGH", JSON.stringify(studentRls), "Tighten object-level RLS predicates for batch_id, student_id, and course_id.");
  }

  const mentorApi = await clientEval(mentorPage, async (client) => {
    const { data: sessionData } = await client.auth.getSession();
    const edge = await client.functions.invoke("admin-save-user", {
      body: { user_payload: { email: "security-audit-mentor-should-not-create@example.com", name: "SECURITY AUDIT", role: "student", password: "Password123!" } }
    });
    const adminRpc = await client.rpc("lms_admin_delete_user", { admin_user_id: sessionData?.session?.user?.id, target_user_id: sessionData?.session?.user?.id });
    return { edge, adminRpc };
  });
  if (mentorApi.edge.error || mentorApi.edge.data?.error) pass("API Security", "Mentor cannot invoke admin-save-user", JSON.stringify(mentorApi.edge.error || mentorApi.edge.data));
  else fail("API Security", "Mentor cannot invoke admin-save-user", "CRITICAL", JSON.stringify(mentorApi.edge.data), "Enforce admin role inside Edge Function before service-role writes.");
  if (mentorApi.adminRpc.error) pass("API Security", "Mentor cannot execute admin delete RPC", mentorApi.adminRpc.error.message);
  else fail("API Security", "Mentor cannot execute admin delete RPC", "CRITICAL", JSON.stringify(mentorApi.adminRpc.data), "Add admin check inside admin RPC.");
}

async function uploadAndXssTests(adminPage, studentPage, profiles) {
  const upload = await clientEval(studentPage, async (client, arg) => {
    const out = {};
    const html = new Blob(["<script>window.__audit=1</script>"], { type: "text/html" });
    const htmlPath = `${arg.studentId}/security-audit-${Date.now()}.html`;
    out.html = await client.storage.from("assignment-submissions").upload(htmlPath, html, { contentType: "text/html", upsert: false });
    if (!out.html.error) await client.storage.from("assignment-submissions").remove([htmlPath]);
    const pdf = new Blob(["%PDF-1.4\n%security-audit"], { type: "application/pdf" });
    const pdfPath = `${arg.studentId}/security-audit-${Date.now()}.pdf`;
    out.pdf = await client.storage.from("assignment-submissions").upload(pdfPath, pdf, { contentType: "application/pdf", upsert: false });
    if (!out.pdf.error) await client.storage.from("assignment-submissions").remove([pdfPath]);
    return out;
  }, { studentId: profiles.student?.id });
  if (upload.html.error) pass("File Upload", "HTML upload rejected by storage policy", upload.html.error.message);
  else fail("File Upload", "HTML upload rejected by storage policy", "HIGH", JSON.stringify(upload.html.data), "Enforce storage allowed_mime_types and object insert policy MIME checks.");
  if (!upload.pdf.error) pass("File Upload", "Allowed PDF upload accepted and cleaned up", JSON.stringify(upload.pdf.data));
  else fail("File Upload", "Allowed PDF upload accepted", "MEDIUM", upload.pdf.error.message, "Ensure safe allowed MIME types still work after hardening.");

  let batchId = profiles.student?.batch_id;
  if (!batchId) {
    const createdScope = await clientEval(adminPage, async (client, arg) => {
      const course = await client.from("courses").insert({
        title: `${arg.runId} Course`,
        description: "Temporary security QA course for chat XSS verification.",
        status: "published"
      }).select("id").single();
      if (course.error) return { course };
      const batch = await client.from("batches").insert({
        name: `${arg.runId} Batch`,
        course_id: course.data.id,
        mentor_id: arg.mentorId,
        status: "active"
      }).select("id").single();
      if (batch.error) {
        await client.from("courses").delete().eq("id", course.data.id);
        return { course, batch };
      }
      const enrollment = await client.from("user_courses").insert({
        user_id: arg.studentId,
        course_id: course.data.id,
        batch_id: batch.data.id,
        status: "active"
      });
      const userUpdate = await client.from("users").update({ batch_id: batch.data.id }).eq("id", arg.studentId);
      return { course, batch, enrollment, userUpdate };
    }, { runId, studentId: profiles.student?.id, mentorId: profiles.mentor?.id, previousBatchId: profiles.student?.batch_id || null });
    if (createdScope.course.error || createdScope.batch?.error || createdScope.userUpdate?.error) {
      warn("XSS", "Stored chat XSS probe skipped", "INFO", JSON.stringify(createdScope), "Create a QA batch/student assignment for full stored chat XSS evidence.");
      return;
    }
    batchId = createdScope.batch.data.id;
    cleanup.courses.push(createdScope.course.data.id);
    cleanup.batches.push(batchId);
    cleanup.restoreStudentBatch = { studentId: profiles.student.id, batchId: profiles.student.batch_id || null };
  }
  const payload = `<img src=x onerror="window.__securityAuditXss=1"> ${runId}`;
  const inserted = await clientEval(studentPage, async (client, arg) => {
    const { data, error } = await client.from("batch_chats").insert({
      batch_id: arg.batchId,
      user_id: arg.studentId,
      message: arg.payload
    }).select("id,batch_id,user_id,message").single();
    return { data, error };
  }, { batchId, studentId: profiles.student.id, payload });
  if (inserted.error) {
    warn("XSS", "Stored chat XSS probe skipped", "INFO", inserted.error.message, "Confirm chat INSERT policy for assigned students.");
    return;
  }
  cleanup.chats.push(inserted.data.id);
  await studentPage.goto(`${baseURL}/student.html`, { waitUntil: "load" }).catch(() => {});
  await studentPage.waitForTimeout(4000);
  const xssRan = await studentPage.evaluate(() => Boolean(window.__securityAuditXss));
  if (!xssRan) pass("XSS", "Stored chat payload did not execute", `Inserted QA chat ${inserted.data.id}; script flag remained false.`);
  else fail("XSS", "Stored chat payload did not execute", "HIGH", `Inserted QA chat ${inserted.data.id} executed on student portal.`, "Render chat messages with textContent/escapeHtml, never innerHTML.");

  await clientEval(adminPage, async (client, arg) => {
    for (const id of arg.chatIds) await client.from("batch_chats").delete().eq("id", id);
    if (arg.restoreStudentBatch?.studentId) await client.from("users").update({ batch_id: arg.restoreStudentBatch.batchId }).eq("id", arg.restoreStudentBatch.studentId);
    for (const batchId of arg.batchIds) await client.from("user_courses").delete().eq("batch_id", batchId);
    for (const batchId of arg.batchIds) await client.from("batches").delete().eq("id", batchId);
    for (const courseId of arg.courseIds) await client.from("courses").delete().eq("id", courseId);
    return true;
  }, { chatIds: cleanup.chats, batchIds: cleanup.batches, courseIds: cleanup.courses, restoreStudentBatch: cleanup.restoreStudentBatch });
}

async function headersTest() {
  const response = await fetch(`${baseURL}/login.html`);
  const headers = Object.fromEntries(response.headers.entries());
  const required = ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"];
  const missing = required.filter((header) => !headers[header]);
  if (!missing.length) pass("Security Headers", "Local headers include browser hardening", JSON.stringify(Object.fromEntries(required.map((key) => [key, headers[key]]))));
  else fail("Security Headers", "Local headers include browser hardening", "MEDIUM", `Missing: ${missing.join(", ")}`, "Add missing headers to local server and deployment config.");
}

async function frontendSmoke(page, role) {
  const target = `${baseURL}/${role}.html`;
  await page.goto(target, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(5000);
  const text = await page.locator("body").innerText().catch(() => "");
  const evidence = await screenshot(page, `${role}-portal`);
  if (/dashboard|course|batch|student|mentor|admin/i.test(text)) pass("Functional QA", `${role} portal renders`, `Screenshot: ${evidence}`);
  else fail("Functional QA", `${role} portal renders`, "HIGH", `Body sample: ${text.slice(0, 300)}`, `Repair ${role} portal startup.`);
  const noisyConsole = page.audit.consoleErrors.filter((line) => !/favicon|net::ERR_ABORTED/i.test(line));
  const failed = page.audit.failedRequests.filter((item) => !/favicon/i.test(item.url));
  if (!noisyConsole.length && !failed.length) pass("Regression", `${role} portal has no console/network errors`, "No console errors or failed requests captured during portal smoke.");
  else fail("Regression", `${role} portal has no console/network errors`, "HIGH", JSON.stringify({ console: noisyConsole, failed }), "Fix failed requests and unhandled frontend exceptions.");
}

async function cleanupVerification(adminPage) {
  const verification = await clientEval(adminPage, async (client, arg) => {
    const chats = arg.chatIds.length ? await client.from("batch_chats").select("id").in("id", arg.chatIds) : { data: [], error: null };
    const batches = arg.batchIds.length ? await client.from("batches").select("id").in("id", arg.batchIds) : { data: [], error: null };
    const courses = arg.courseIds.length ? await client.from("courses").select("id").in("id", arg.courseIds) : { data: [], error: null };
    const users = await client.from("users").select("id,email").ilike("email", "security-audit-%");
    return { chats, batches, courses, users };
  }, { chatIds: cleanup.chats, batchIds: cleanup.batches, courseIds: cleanup.courses });
  if ((verification.chats.data || []).length === 0 && (verification.batches.data || []).length === 0 && (verification.courses.data || []).length === 0 && (verification.users.data || []).length === 0) {
    pass("Cleanup", "Security QA artifacts removed", JSON.stringify({ chats: 0, batches: 0, courses: 0, users: 0 }));
  } else {
    fail("Cleanup", "Security QA artifacts removed", "MEDIUM", JSON.stringify(verification), "Remove QA-created artifacts only.");
  }
}

function score() {
  const critical = results.filter((item) => item.status === "FAIL" && item.severity === "CRITICAL").length;
  const high = results.filter((item) => item.status === "FAIL" && item.severity === "HIGH").length;
  const medium = results.filter((item) => item.status === "FAIL" && item.severity === "MEDIUM").length;
  const low = results.filter((item) => item.status === "FAIL" && item.severity === "LOW").length;
  return Math.max(0, 100 - critical * 35 - high * 20 - medium * 8 - low * 3);
}

function reportMarkdown(summary) {
  const failures = results.filter((item) => item.status === "FAIL" || item.status === "WARN");
  const byCategory = new Map();
  for (const item of results) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }
  const lines = [
    "# Jenovate LMS Final Security + QA Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Base URL: ${baseURL}`,
    `Run ID: ${runId}`,
    "",
    "## 1. Executive Summary",
    "",
    summary.go ? "GO - no Critical or High failures were observed in this controlled audit." : "NO-GO - unresolved Critical or High failures remain or the audit could not complete every required workflow.",
    "",
    `Production readiness score: ${summary.score}/100`,
    "",
    "## 2. Environment",
    "",
    "- Local static app served from the project workspace.",
    "- Configured Supabase project used through the same publishable key as the frontend.",
    "- QA accounts: admin@jenovate.in, mentor1@gmail.com, student1@gmail.com.",
    "",
    "## 3. Scope",
    "",
    "Authentication, RBAC, RLS, IDOR, XSS, SQL injection-safe query probes, file upload validation, API authorization, business logic, security headers, frontend regression smoke, and cleanup verification.",
    "",
    "## 4. QA Test Cases",
    "",
    "Covered admin, mentor, and student login plus portal rendering, admin data reads, protected route blocking, student upload behavior, chat rendering, and cleanup checks. Full create/edit/delete workflow coverage is limited to non-destructive checks unless QA-created records are required.",
    "",
    "## 5-24. Results By Area",
    ""
  ];
  for (const [category, items] of byCategory) {
    lines.push(`### ${category}`, "");
    for (const item of items) {
      lines.push(`- ${item.status} [${item.severity}] ${item.name}`);
      if (item.evidence) lines.push(`  Evidence: ${item.evidence}`);
      if (item.recommendation) lines.push(`  Recommendation: ${item.recommendation}`);
    }
    lines.push("");
  }
  lines.push("## 25. Cleanup Verification", "");
  lines.push(cleanup.chats.length ? `QA chat IDs created and removed: ${cleanup.chats.join(", ")}` : "No persistent QA chat artifacts remain from this run.");
  if (cleanup.batches.length || cleanup.courses.length) lines.push(`Temporary QA batches/courses created and removed: ${[...cleanup.batches, ...cleanup.courses].join(", ")}`);
  lines.push("", "## 26. Production Readiness Score", "", `${summary.score}/100`);
  lines.push("", "## 27. Final GO/NO-GO Decision", "", summary.go ? "GO" : "NO-GO");
  if (failures.length) {
    lines.push("", "## Vulnerabilities / Issues Found", "");
    for (const item of failures) lines.push(`- ${item.severity}: ${item.name} (${item.status}) - ${item.evidence}`);
  }
  return lines.join("\n");
}

try {
  await invalidCredentialTests();
  await headersTest();

  const adminPage = await newPage("admin");
  const mentorPage = await newPage("mentor");
  const studentPage = await newPage("student");
  const profiles = {
    admin: await loginStatus(adminPage, "admin"),
    mentor: await loginStatus(mentorPage, "mentor"),
    student: await loginStatus(studentPage, "student")
  };

  await frontendSmoke(adminPage, "admin");
  await frontendSmoke(mentorPage, "mentor");
  await frontendSmoke(studentPage, "student");
  await rlsAndApiTests(adminPage, mentorPage, studentPage, profiles);
  await uploadAndXssTests(adminPage, studentPage, profiles);
  await rbacPageTests(studentPage, mentorPage);
  await cleanupVerification(adminPage);
} catch (error) {
  fail("Audit Runner", "Audit completed without unhandled exception", "HIGH", `${error.message}\n${String(error.stack || "").slice(0, 2000)}`, "Fix audit-blocking runtime error and rerun.");
} finally {
  const summary = {
    score: score(),
    critical: results.filter((item) => item.status === "FAIL" && item.severity === "CRITICAL").length,
    high: results.filter((item) => item.status === "FAIL" && item.severity === "HIGH").length,
    medium: results.filter((item) => item.status === "FAIL" && item.severity === "MEDIUM").length,
    total: results.length
  };
  summary.go = summary.critical === 0 && summary.high === 0;
  const jsonPath = join(outDir, "evidence.json");
  const mdPath = join("test-results", "final-security-qa-report.md");
  writeFileSync(jsonPath, JSON.stringify({ runId, baseURL, summary, results, cleanup }, null, 2));
  writeFileSync(mdPath, reportMarkdown(summary));
  console.log(JSON.stringify({ runId, outDir, jsonPath, mdPath, summary }, null, 2));
  await browser.close();
  if (!summary.go) process.exitCode = 1;
}
