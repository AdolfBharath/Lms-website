import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const adminEmail = process.env.QA_ADMIN_EMAIL || "admin@jenovate.in";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "Temp@12345";
const outDir = join("test-results", "cleanup");
mkdirSync(outDir, { recursive: true });

const result = {
  baseURL,
  startedAt: new Date().toISOString(),
  deleted: [],
  archived: [],
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
  await page.waitForTimeout(6_000);
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
    const output = { deleted: [], archived: [], errors: [], verification: {} };
    const qaTitle = "FINAL-QA-%";
    const qaEmailPatterns = ["final-qa-%", "qa-%@example.com"];

    const captureError = (step, error) => {
      if (error) output.errors.push({ step, code: error.code || null, message: error.message || String(error) });
    };

    const { data: courses, error: coursesError } = await client
      .from("courses")
      .select("id,title")
      .or(`title.ilike.${qaTitle},title.ilike.QA-%`);
    captureError("select courses", coursesError);
    const courseIds = (courses || []).map((row) => row.id).filter(Boolean);

    const { data: batches, error: batchesError } = await client
      .from("batches")
      .select("id,name,course_id")
      .or(`name.ilike.${qaTitle},name.ilike.QA-%`);
    captureError("select batches", batchesError);
    const batchIds = [...new Set([...(batches || []).map((row) => row.id), ...(batches || []).filter((row) => courseIds.includes(row.course_id)).map((row) => row.id)].filter(Boolean))];

    const { data: tasks, error: tasksError } = batchIds.length
      ? await client.from("batch_tasks").select("id,title,batch_id").in("batch_id", batchIds)
      : { data: [], error: null };
    captureError("select tasks", tasksError);
    const taskIds = (tasks || []).map((row) => row.id).filter(Boolean);

    const { data: tickets, error: ticketsError } = await client
      .from("support_tickets")
      .select("id,ticket_id,subject")
      .or(`subject.ilike.${qaTitle},subject.ilike.QA-%`);
    captureError("select tickets", ticketsError);
    const ticketIds = (tickets || []).map((row) => row.id || row.ticket_id).filter(Boolean);

    const deletions = [
      ["support_notifications", "ticket_id", ticketIds],
      ["support_messages", "ticket_id", ticketIds],
      ["support_tickets", "id", ticketIds],
      ["batch_chats", "batch_id", batchIds],
      ["task_submissions", "task_id", taskIds],
      ["student_quiz_attempts", "course_id", courseIds],
      ["student_course_progress", "course_id", courseIds],
      ["batch_tasks", "id", taskIds],
      ["announcements", "course_id", courseIds],
      ["announcements", "batch_id", batchIds],
      ["user_courses", "course_id", courseIds],
      ["batches", "id", batchIds],
      ["courses", "id", courseIds]
    ];

    for (const [table, column, values] of deletions) {
      if (!values.length) continue;
      const { error } = await client.from(table).delete().in(column, [...new Set(values)]);
      if (error) {
        output.errors.push({ step: `delete ${table}`, code: error.code || null, message: error.message });
      } else {
        output.deleted.push({ table, column, count: [...new Set(values)].length });
      }
    }

    const userRows = [];
    for (const pattern of qaEmailPatterns) {
      const { data, error } = await client.from("users").select("id,email,status,deleted_at").ilike("email", pattern);
      captureError(`select users ${pattern}`, error);
      userRows.push(...(data || []));
    }
    const usersById = new Map(userRows.map((row) => [row.id, row]));
    const userIds = [...usersById.keys()].filter(Boolean);
    if (userIds.length) {
      const { error } = await client
        .from("users")
        .update({ status: "archived", deleted_at: new Date().toISOString() })
        .in("id", userIds);
      if (error) {
        output.errors.push({ step: "archive QA users", code: error.code || null, message: error.message });
      } else {
        output.archived.push({ table: "users", count: userIds.length, emails: [...usersById.values()].map((row) => row.email) });
      }
    }

    const verifyCourses = await client.from("courses").select("id,title").or(`title.ilike.${qaTitle},title.ilike.QA-%`);
    const verifyBatches = await client.from("batches").select("id,name").or(`name.ilike.${qaTitle},name.ilike.QA-%`);
    const verifyTickets = await client.from("support_tickets").select("id,subject").or(`subject.ilike.${qaTitle},subject.ilike.QA-%`);
    const verifyUsers = [];
    for (const pattern of qaEmailPatterns) {
      const { data } = await client.from("users").select("id,email,status,deleted_at").ilike("email", pattern);
      verifyUsers.push(...(data || []));
    }
    output.verification = {
      activeQaCourses: verifyCourses.data?.length || 0,
      activeQaBatches: verifyBatches.data?.length || 0,
      activeQaTickets: verifyTickets.data?.length || 0,
      activeQaUsers: verifyUsers.filter((user) => !user.deleted_at && String(user.status || "").toLowerCase() !== "archived").length,
      archivedQaUsers: verifyUsers.filter((user) => user.deleted_at || String(user.status || "").toLowerCase() === "archived").length
    };
    return output;
  });

  Object.assign(result, cleanup);
} catch (error) {
  result.errors.push({ step: "runner", message: error.message, stack: String(error.stack || "").slice(0, 2000) });
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  const out = join(outDir, `qa-temp-cleanup-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}.json`);
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out, result }, null, 2));
  await browser.close();
  if (result.errors.length) process.exitCode = 1;
}
