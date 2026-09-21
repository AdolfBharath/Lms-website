import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const evidenceDir = join("evidence", "14-cleanup");
mkdirSync(evidenceDir, { recursive: true });

const adminCreds = {
  email: process.env.QA_ADMIN_EMAIL || "admin@jenovate.in",
  password: process.env.QA_ADMIN_PASSWORD || "Temp@12345"
};
const mentorCreds = {
  email: process.env.QA_MENTOR_EMAIL || "mentor1@gmail.com",
  password: process.env.QA_MENTOR_PASSWORD || "12345678"
};
const studentCreds = {
  email: process.env.QA_STUDENT_EMAIL || "student1@gmail.com",
  password: process.env.QA_STUDENT_PASSWORD || "12345678"
};

const knownRealEmails = new Set([adminCreds.email, mentorCreds.email, studentCreds.email].map((email) => email.toLowerCase()));
const knownPrefixes = [
  "FINAL-PROD-QA-",
  "SEC-QA-",
  "FINAL-QA-"
];
const qaEmailPatterns = [
  "final-prod-qa-%",
  "final-qa-%"
];

const report = {
  startedAt: new Date().toISOString(),
  baseURL,
  candidates: {},
  deleted: {},
  errors: [],
  preserved: {},
  logins: {},
  storageDeleted: [],
  evidenceIds: {}
};

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function increment(category, count = 1) {
  report.deleted[category] = (report.deleted[category] || 0) + count;
}

function remember(category, rows) {
  report.candidates[category] = rows || [];
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

function evidenceFiles(dir) {
  if (!existsSync(dir)) return [];
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...evidenceFiles(path));
    else if (entry.name === "evidence.json") output.push(path);
  }
  return output;
}

function collectEvidenceIds() {
  const ids = {
    users: [],
    courses: [],
    batches: [],
    announcements: [],
    tasks: [],
    submissions: [],
    quizAttempts: [],
    progress: [],
    chats: [],
    projects: [],
    supportTickets: [],
    storage: []
  };
  for (const file of [
    ...evidenceFiles(join("test-results", "final-production-qa")),
    ...evidenceFiles(join("test-results", "security-qa"))
  ]) {
    const json = readJson(file);
    if (!json) continue;
    const created = json.created || {};
    for (const key of Object.keys(ids)) {
      const rows = created[key];
      if (!rows) continue;
      if (key === "users") ids.users.push(...rows.map((row) => row.id || row));
      else if (key === "progress") ids.progress.push(...rows);
      else if (key === "storage") ids.storage.push(...rows);
      else ids[key].push(...rows);
    }
    const cleanup = json.cleanup || {};
    ids.chats.push(...(cleanup.chats || []));
    ids.courses.push(...(cleanup.courses || []));
    ids.batches.push(...(cleanup.batches || []));
    ids.storage.push(...(cleanup.storage || []));
  }
  for (const key of Object.keys(ids)) {
    if (key === "progress" || key === "storage") continue;
    ids[key] = unique(ids[key]);
  }
  report.evidenceIds = ids;
  return ids;
}

async function waitForApp(page) {
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.getSupabaseClient && window.supabase?.createClient, null, { timeout: 25_000 });
}

async function clientEval(page, fn, arg = {}) {
  return page.evaluate(async ({ source, arg }) => {
    const client = window.getSupabaseClient();
    const run = new Function("client", "arg", `return (${source})(client, arg);`);
    return run(client, arg);
  }, { source: fn.toString(), arg });
}

async function login(page, creds, role) {
  await waitForApp(page);
  const result = await clientEval(page, async (client, arg) => {
    const signIn = await client.auth.signInWithPassword({ email: arg.email, password: arg.password });
    if (signIn.error) return { ok: false, error: signIn.error.message };
    const { data: profile, error } = await client.from("users").select("id,email,role,status,deleted_at").eq("email", arg.email).maybeSingle();
    return { ok: Boolean(profile?.id && profile.role === arg.role), profile, error: error?.message || null };
  }, { ...creds, role });
  return result;
}

async function snapshot(page, ids) {
  return clientEval(page, async (client, arg) => {
    const out = {};
    const safeIn = async (table, column, values, select = "*") => {
      if (!values?.length) return [];
      const { data, error } = await client.from(table).select(select).in(column, [...new Set(values)]);
      out[`${table}_${column}_error`] = error ? { code: error.code, message: error.message } : null;
      return data || [];
    };
    const ilikeAny = async (table, column, patterns, select = "*") => {
      const all = [];
      for (const pattern of patterns) {
        const { data, error } = await client.from(table).select(select).ilike(column, pattern);
        if (error) out[`${table}_${column}_${pattern}_error`] = { code: error.code, message: error.message };
        all.push(...(data || []));
      }
      return [...new Map(all.map((row) => [row.id || row.email || JSON.stringify(row), row])).values()];
    };
    out.usersByEvidence = await safeIn("users", "id", arg.ids.users, "id,email,name,role,status,deleted_at");
    out.usersByEmail = await ilikeAny("users", "email", arg.qaEmailPatterns, "id,email,name,role,status,deleted_at");
    out.coursesByEvidence = await safeIn("courses", "id", arg.ids.courses, "id,title,status,deleted_at");
    out.coursesByTitle = await ilikeAny("courses", "title", arg.titlePatterns, "id,title,status,deleted_at");
    out.batchesByEvidence = await safeIn("batches", "id", arg.ids.batches, "id,name,status,deleted_at,course_id");
    out.batchesByName = await ilikeAny("batches", "name", arg.titlePatterns, "id,name,status,deleted_at,course_id");
    out.announcementsByEvidence = await safeIn("announcements", "id", arg.ids.announcements, "id,title,status,deleted_at,batch_id,course_id");
    out.announcementsByTitle = await ilikeAny("announcements", "title", arg.titlePatterns, "id,title,status,deleted_at,batch_id,course_id");
    out.tasksByEvidence = await safeIn("batch_tasks", "id", arg.ids.tasks, "id,title,status,deleted_at,batch_id,course_id");
    out.tasksByTitle = await ilikeAny("batch_tasks", "title", arg.titlePatterns, "id,title,status,deleted_at,batch_id,course_id");
    out.chatsByEvidence = await safeIn("batch_chats", "id", arg.ids.chats, "id,batch_id,user_id,message,status,deleted_at");
    out.chatsByMessage = await ilikeAny("batch_chats", "message", arg.titlePatterns, "id,batch_id,user_id,message,status,deleted_at");
    out.projectsByEvidence = await safeIn("projects", "id", arg.ids.projects, "id,title,status,type,student_id,course_id,deleted_at");
    out.projectsByTitle = await ilikeAny("projects", "title", arg.titlePatterns, "id,title,status,type,student_id,course_id,deleted_at");
    out.submissionsByEvidence = await safeIn("task_submissions", "id", arg.ids.submissions, "id,task_id,student_id,user_id,batch_id,course_id,status,deleted_at");
    out.quizAttemptsByEvidence = await safeIn("student_quiz_attempts", "id", arg.ids.quizAttempts, "id,student_id,course_id,deleted_at");
    out.supportTicketsByEvidence = await safeIn("support_tickets", "id", arg.ids.supportTickets, "id,ticket_id,user_id,subject,status");
    out.supportTicketsBySubject = await ilikeAny("support_tickets", "subject", arg.titlePatterns, "id,ticket_id,user_id,subject,status");
    out.realAccounts = await safeIn("users", "email", arg.realEmails, "id,email,role,status,deleted_at");
    return out;
  }, {
    ids,
    qaEmailPatterns,
    titlePatterns: knownPrefixes.map((prefix) => `${prefix}%`),
    realEmails: [...knownRealEmails]
  });
}

function mergeCandidates(before) {
  const users = [...(before.usersByEvidence || []), ...(before.usersByEmail || [])]
    .filter((row) => !knownRealEmails.has(String(row.email || "").toLowerCase()));
  const courses = [...(before.coursesByEvidence || []), ...(before.coursesByTitle || [])];
  const batches = [...(before.batchesByEvidence || []), ...(before.batchesByName || [])];
  const announcements = [...(before.announcementsByEvidence || []), ...(before.announcementsByTitle || [])];
  const tasks = [...(before.tasksByEvidence || []), ...(before.tasksByTitle || [])];
  const chats = [...(before.chatsByEvidence || []), ...(before.chatsByMessage || [])];
  const projects = [...(before.projectsByEvidence || []), ...(before.projectsByTitle || [])];
  const supportTickets = [...(before.supportTicketsByEvidence || []), ...(before.supportTicketsBySubject || [])];
  const map = (rows) => [...new Map(rows.map((row) => [row.id, row])).values()].filter((row) => row.id);
  return {
    users: map(users),
    courses: map(courses),
    batches: map(batches),
    announcements: map(announcements),
    tasks: map(tasks),
    chats: map(chats),
    projects: map(projects),
    supportTickets: map(supportTickets),
    submissions: map(before.submissionsByEvidence || []),
    quizAttempts: map(before.quizAttemptsByEvidence || [])
  };
}

async function deleteQaUser(page, user) {
  return clientEval(page, async (client, arg) => {
    const { data, error } = await client.functions.invoke("admin-delete-qa-user", {
      body: { target_user_id: arg.id, target_email: arg.email }
    });
    return { data, error };
  }, user);
}

async function cleanup(page, candidates, ids) {
  const deletion = await clientEval(page, async (client, arg) => {
    const out = { deleted: {}, storageDeleted: [], errors: [] };
    const del = async (category, table, column, values) => {
      const uniqueValues = [...new Set((values || []).filter(Boolean))];
      if (!uniqueValues.length) return;
      const { error } = await client.from(table).delete().in(column, uniqueValues);
      if (error) out.errors.push({ category, table, column, code: error.code, message: error.message });
      else out.deleted[category] = (out.deleted[category] || 0) + uniqueValues.length;
    };
    const userIds = arg.candidates.users.map((row) => row.id);
    const courseIds = arg.candidates.courses.map((row) => row.id);
    const batchIds = arg.candidates.batches.map((row) => row.id);
    const taskIds = arg.candidates.tasks.map((row) => row.id);
    const ticketIds = arg.candidates.supportTickets.map((row) => row.id);
    await del("chat", "batch_chats", "id", arg.candidates.chats.map((row) => row.id));
    await del("chat", "batch_chats", "batch_id", batchIds);
    await del("questions", "projects", "id", arg.candidates.projects.map((row) => row.id));
    await del("questions", "projects", "course_id", courseIds);
    await del("notifications", "support_notifications", "ticket_id", ticketIds);
    await del("questions", "support_messages", "ticket_id", ticketIds);
    await del("questions", "support_tickets", "id", ticketIds);
    await del("assignments", "task_submissions", "id", arg.candidates.submissions.map((row) => row.id));
    await del("assignments", "task_submissions", "task_id", taskIds);
    await del("assignments", "batch_tasks", "id", taskIds);
    await del("quizzes", "student_quiz_attempts", "id", arg.candidates.quizAttempts.map((row) => row.id));
    await del("quizzes", "student_quiz_attempts", "course_id", courseIds);
    await del("progress", "student_course_progress", "course_id", courseIds);
    await del("batches", "user_courses", "course_id", courseIds);
    await del("announcements", "announcements", "id", arg.candidates.announcements.map((row) => row.id));
    await del("announcements", "announcements", "course_id", courseIds);
    await del("batches", "batches", "id", batchIds);
    await del("courses", "courses", "id", courseIds);
    for (const item of arg.ids.storage || []) {
      if (!item?.bucket || !item?.path) continue;
      const { error } = await client.storage.from(item.bucket).remove([item.path]);
      if (error) out.errors.push({ category: "files", bucket: item.bucket, path: item.path, message: error.message });
      else out.storageDeleted.push(item);
    }
    const buckets = ["assignment-submissions", "study-materials", "support-attachments"];
    const prefixes = ["security-audit", "final-production-qa", "FINAL-PROD-QA", "SEC-QA"];
    for (const bucket of buckets) {
      for (const prefix of prefixes) {
        const { data } = await client.storage.from(bucket).list(prefix, { limit: 100 });
        for (const file of data || []) {
          const path = `${prefix}/${file.name}`;
          const { error } = await client.storage.from(bucket).remove([path]);
          if (error) out.errors.push({ category: "files", bucket, path, message: error.message });
          else out.storageDeleted.push({ bucket, path });
        }
      }
    }
    out.userDependents = userIds.length;
    return out;
  }, { candidates, ids });
  Object.assign(report.deleted, deletion.deleted || {});
  report.storageDeleted.push(...(deletion.storageDeleted || []));
  report.errors.push(...(deletion.errors || []));
  for (const user of candidates.users) {
    const result = await deleteQaUser(page, user);
    if (result.error || result.data?.error) report.errors.push({ category: "users", user, result });
    else increment("users", 1);
  }
}

async function main() {
  const ids = collectEvidenceIds();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    const adminLogin = await login(page, adminCreds, "admin");
    if (!adminLogin.ok) throw new Error(`Admin login failed before cleanup: ${JSON.stringify(adminLogin)}`);
    const before = await snapshot(page, ids);
    writeFileSync(join(evidenceDir, "cleanup-before.json"), JSON.stringify(before, null, 2));
    report.preserved.before = before.realAccounts || [];
    const candidates = mergeCandidates(before);
    for (const [category, rows] of Object.entries(candidates)) remember(category, rows);
    await cleanup(page, candidates, ids);
    const after = await snapshot(page, ids);
    writeFileSync(join(evidenceDir, "cleanup-after.json"), JSON.stringify(after, null, 2));
    report.preserved.after = after.realAccounts || [];
    report.logins.admin = adminLogin.ok ? "PASS" : "FAIL";
    report.logins.mentor = (await login(page, mentorCreds, "mentor")).ok ? "PASS" : "FAIL";
    report.logins.student = (await login(page, studentCreds, "student")).ok ? "PASS" : "FAIL";
    const afterCandidates = mergeCandidates(after);
    report.remaining = Object.fromEntries(Object.entries(afterCandidates).map(([key, rows]) => [key, rows.length]));
    report.finishedAt = new Date().toISOString();
    const preservedOk = [...knownRealEmails].every((email) => (report.preserved.after || []).some((row) => String(row.email || "").toLowerCase() === email && !row.deleted_at));
    report.legitimateDataPreserved = preservedOk ? "YES" : "NO";
    report.finalStatus = !report.errors.length
      && Object.values(report.remaining).every((count) => count === 0)
      && Object.values(report.logins).every((status) => status === "PASS")
      && preservedOk ? "PASS" : "FAIL";
    const md = [
      "# Cleanup Report",
      "",
      `Started: ${report.startedAt}`,
      `Finished: ${report.finishedAt}`,
      "",
      "## QA Records Found",
      ...Object.entries(report.candidates).map(([key, rows]) => `- ${key}: ${rows.length} (${rows.map((row) => row.id || row.email).join(", ") || "none"})`),
      "",
      "## Records Removed",
      ...Object.entries(report.deleted).map(([key, count]) => `- ${key}: ${count}`),
      `- files: ${report.storageDeleted.length}`,
      "",
      "## Production Records Preserved",
      ...((report.preserved.after || []).map((row) => `- ${row.email} (${row.role}) status=${row.status || ""}`)),
      "",
      "## Login Verification",
      `- Admin: ${report.logins.admin}`,
      `- Mentor: ${report.logins.mentor}`,
      `- Student: ${report.logins.student}`,
      "",
      "## Remaining QA Candidates",
      ...Object.entries(report.remaining).map(([key, count]) => `- ${key}: ${count}`),
      "",
      `Final cleanup status: ${report.finalStatus}`,
      "",
      "## Errors",
      report.errors.length ? JSON.stringify(report.errors, null, 2) : "None"
    ].join("\n");
    writeFileSync(join(evidenceDir, "cleanup-report.md"), md);
    writeFileSync(join(evidenceDir, "cleanup-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      qaUsersRemoved: report.deleted.users || 0,
      qaCoursesRemoved: report.deleted.courses || 0,
      qaBatchesRemoved: report.deleted.batches || 0,
      qaAnnouncementsRemoved: report.deleted.announcements || 0,
      qaQuizzesRemoved: report.deleted.quizzes || 0,
      qaAssignmentsRemoved: report.deleted.assignments || 0,
      qaChatRecordsRemoved: report.deleted.chat || 0,
      qaQuestionsRemoved: report.deleted.questions || 0,
      qaNotificationsRemoved: report.deleted.notifications || 0,
      qaProgressRecordsRemoved: report.deleted.progress || 0,
      qaFilesRemoved: report.storageDeleted.length,
      qaCoinTestRecordsRemoved: report.deleted.coins || 0,
      legitimateDataPreserved: report.legitimateDataPreserved,
      adminLoginAfterCleanup: report.logins.admin,
      mentorLoginAfterCleanup: report.logins.mentor,
      studentLoginAfterCleanup: report.logins.student,
      finalCleanupStatus: report.finalStatus,
      evidenceDir
    }, null, 2));
    if (report.finalStatus !== "PASS") process.exitCode = 1;
  } catch (error) {
    report.errors.push({ category: "runner", message: error.message, stack: String(error.stack || "").slice(0, 2000) });
    report.finalStatus = "FAIL";
    writeFileSync(join(evidenceDir, "cleanup-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ error: error.message, evidenceDir }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
