import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const adminEmail = process.env.QA_ADMIN_EMAIL || "admin@jenovate.in";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "Temp@12345";
const outDir = join("test-results", "cleanup");
mkdirSync(outDir, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  baseURL,
  matchedUsers: [],
  deleted: [],
  errors: [],
  verification: {}
};

async function waitForApp(page) {
  await page.waitForFunction(() => window.JenovateAuth && window.getSupabaseClient, null, { timeout: 25_000 });
}

async function login(page) {
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await waitForApp(page);
  await page.fill("#email", adminEmail);
  await page.fill("#password", adminPassword);
  await page.locator(".submit-btn").click();
  await page.waitForFunction(() => location.href.includes("admin.html") || Boolean(sessionStorage.getItem("jenovateCurrentUser")), null, { timeout: 35_000 });
  if (!page.url().includes("admin.html")) {
    await page.goto(`${baseURL}/admin.html`, { waitUntil: "load" }).catch((error) => {
      if (!/interrupted by another navigation/i.test(error.message || "")) throw error;
    });
  }
  await page.waitForTimeout(5_000);
}

async function db(page, fn, arg = {}) {
  return page.evaluate(async ({ source, arg }) => {
    const client = window.getSupabaseClient();
    const run = new Function("client", "arg", `return (${source})(client, arg);`);
    return run(client, arg);
  }, { source: fn.toString(), arg });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await login(page);
  const cleanup = await db(page, async (client) => {
    const output = { matchedUsers: [], deleted: [], errors: [], verification: {} };
    const patterns = [
      { column: "email", pattern: "final-qa-%" },
      { column: "email", pattern: "qa-%@example.com" },
      { column: "email", pattern: "%test%@example.com" },
      { column: "name", pattern: "FINAL-QA-%" },
      { column: "name", pattern: "QA-%" }
    ];

    const users = new Map();
    for (const { column, pattern } of patterns) {
      const { data, error } = await client.from("users").select("id,email,name,role,status,deleted_at").ilike(column, pattern);
      if (error) output.errors.push({ step: `select users ${column} ${pattern}`, code: error.code || null, message: error.message });
      for (const row of data || []) users.set(row.id, row);
    }
    output.matchedUsers = [...users.values()];
    const ids = [...users.keys()];

    const deleteByUserId = [
      ["support_notifications", "recipient_user_id"],
      ["support_messages", "sender_id"],
      ["support_tickets", "user_id"],
      ["batch_chats", "user_id"],
      ["task_submissions", "student_id"],
      ["task_submissions", "user_id"],
      ["student_quiz_attempts", "student_id"],
      ["student_course_progress", "student_id"],
      ["user_courses", "user_id"],
      ["user_courses", "student_id"],
      ["user_courses", "learner_id"],
      ["projects", "student_id"]
    ];

    for (const [table, column] of deleteByUserId) {
      if (!ids.length) continue;
      const { error } = await client.from(table).delete().in(column, ids);
      if (error) {
        output.errors.push({ step: `delete ${table}.${column}`, code: error.code || null, message: error.message });
      } else {
        output.deleted.push({ table, column, count: ids.length });
      }
    }

    if (ids.length) {
      const { error } = await client.from("users").delete().in("id", ids);
      if (error) {
        output.errors.push({ step: "hard delete users", code: error.code || null, message: error.message });
      } else {
        output.deleted.push({ table: "users", column: "id", count: ids.length });
      }
    }

    const remaining = [];
    for (const { column, pattern } of patterns) {
      const { data, error } = await client.from("users").select("id,email,name,role,status,deleted_at").ilike(column, pattern);
      if (error) output.errors.push({ step: `verify users ${column} ${pattern}`, code: error.code || null, message: error.message });
      remaining.push(...(data || []));
    }
    output.verification = {
      matchedBefore: output.matchedUsers.length,
      remainingProfileRows: new Map(remaining.map((row) => [row.id, row])).size,
      remainingProfiles: [...new Map(remaining.map((row) => [row.id, row])).values()]
    };
    return output;
  });

  Object.assign(report, cleanup);
} catch (error) {
  report.errors.push({ step: "runner", message: error.message, stack: String(error.stack || "").slice(0, 2000) });
} finally {
  report.finishedAt = new Date().toISOString();
  const out = join(outDir, `hard-delete-qa-users-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, report }, null, 2));
  await browser.close();
  if (report.errors.length || report.verification.remainingProfileRows) process.exitCode = 1;
}
