import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const adminEmail = process.env.QA_ADMIN_EMAIL || "admin@jenovate.com";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "Admin123";
const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const prefix = `QA-${stamp}`;
const password = "QaPass123!";

const evidence = [];
const created = {
  studentEmail: `${prefix.toLowerCase()}-student@example.com`,
  mentorEmail: `${prefix.toLowerCase()}-mentor@example.com`,
  studentId: "",
  mentorId: "",
  courseId: "",
  batchId: "",
  announcementIds: [],
  shopId: ""
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const network = [];
page.on("console", (msg) => {
  if (["error", "warning"].includes(msg.type())) {
    network.push({ type: `console:${msg.type()}`, text: msg.text().slice(0, 300) });
  }
});
page.on("requestfailed", (request) => {
  network.push({ type: "requestfailed", method: request.method(), url: request.url(), failure: request.failure()?.errorText });
});
page.on("response", (response) => {
  const url = response.url();
  if (url.includes("supabase.co") || url.includes("/api/")) {
    network.push({ type: "response", method: response.request().method(), status: response.status(), url });
  }
});

function record(step, status, details = {}) {
  evidence.push({ step, ...details, qaStatus: status });
}

async function waitForApp() {
  await page.waitForFunction(() => window.JenovateAuth && window.getSupabaseClient, null, { timeout: 20_000 });
}

async function login(email, pass, expectedPath) {
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await waitForApp();
  await page.fill("#email", email);
  await page.fill("#password", pass);
  await page.locator(".submit-btn").click();
  if (expectedPath) {
    await page.waitForFunction(
      (path) => location.href.includes(path) || Boolean(sessionStorage.getItem("jenovateCurrentUser")),
      expectedPath,
      { timeout: 30_000 }
    );
    if (!page.url().includes(expectedPath)) {
      await page.goto(`${baseURL}/${expectedPath}`, { waitUntil: "load" });
    }
    if (expectedPath === "admin.html") {
      await page.waitForSelector("#refreshBtn", { timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector("#refreshBtn")?.textContent?.trim(), null, { timeout: 30_000 });
      await page.waitForTimeout(12_000);
    }
  } else {
    await page.waitForTimeout(8_000);
  }
}

async function adminSession() {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("jenovateCurrentUser") || "null"));
}

async function selectAdminView(name) {
  const active = await page.evaluate((viewName) => document.querySelector(`#${viewName}View`)?.classList.contains("active"), name);
  if (active) return;
  await page.locator(`button[data-view="${name}"]`).evaluateAll((buttons) => {
    const visible = buttons.find((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
    if (!visible) throw new Error(`No visible nav button for ${name}`);
    visible.click();
  });
  await page.waitForFunction(
    (viewName) => document.querySelector(`#${viewName}View`)?.classList.contains("active"),
    name,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(1_500);
}

async function db(table, filter = "") {
  return page.evaluate(async ({ table, filter }) => {
    const client = window.getSupabaseClient();
    let query = client.from(table).select("*");
    if (filter) {
      const [column, value] = filter.split("=");
      query = query.eq(column, value);
    }
    const { data, error } = await query.limit(20);
    return { data, error: error ? { code: error.code, message: error.message } : null };
  }, { table, filter });
}

async function dbByEmail(email) {
  return page.evaluate(async (email) => {
    const { data, error } = await window.getSupabaseClient()
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    return { data, error: error ? { code: error.code, message: error.message } : null };
  }, email);
}

async function fillAndSubmitUser({ name, email, role, coins = 0 }) {
  await selectAdminView("users");
  await page.locator("#addUserBtn").scrollIntoViewIfNeeded();
  await page.locator("#addUserBtn").click();
  await page.fill("#createUserName", name);
  await page.fill("#createUserEmail", email);
  await page.fill("#createUserPassword", password);
  await page.selectOption("#createUserRole", role);
  await page.fill("#createUserUsername", name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  await page.fill("#createUserCoins", String(coins));
  await page.locator("#createUserForm button[type='submit']").click();
  await page.waitForTimeout(8_000);
  return dbByEmail(email);
}

async function editUser(email, nextName, nextPassword = "") {
  await selectAdminView("users");
  await page.fill("#userSearch", email);
  await page.waitForTimeout(1_500);
  await page.locator("[data-edit-user]").first().click();
  await page.fill("#userName", nextName);
  if (nextPassword) await page.fill("#userPassword", nextPassword);
  await page.locator("#userForm button[type='submit']").click();
  await page.waitForTimeout(8_000);
  return dbByEmail(email);
}

async function deleteUser(email) {
  await selectAdminView("users");
  await page.fill("#userSearch", email);
  await page.waitForTimeout(1_500);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("[data-edit-user]").first().click();
  await page.locator("#deleteUserBtn").click();
  await page.waitForTimeout(7_000);
  return dbByEmail(email);
}

async function signInCheck(email, pass, expectedPath) {
  const check = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await check.goto(`${baseURL}/login.html`, { waitUntil: "load" });
    await check.waitForFunction(() => window.JenovateAuth && window.getSupabaseClient, null, { timeout: 20_000 });
    const result = await check.evaluate(async ({ email, pass }) => {
      try {
        const profile = await window.JenovateAuth.signInWithPassword(email, pass);
        return { ok: Boolean(profile), role: profile?.role || "", id: profile?.id || "", status: profile?.status || "" };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, { email, pass });
    if (expectedPath && result.ok) {
      await check.evaluate((profile) => {
        sessionStorage.setItem("jenovateCurrentUser", JSON.stringify(profile));
      }, { role: result.role, email, id: result.id });
      await check.goto(`${baseURL}/${expectedPath}`, { waitUntil: "load" });
      await check.waitForTimeout(5_000);
      result.portalUrl = check.url();
      result.portalTitle = await check.title();
    }
    return result;
  } finally {
    await check.close();
  }
}

try {
  await login(adminEmail, adminPassword, "admin.html");
  const admin = await adminSession();
  record("Admin login", admin?.role === "admin" ? "PASS" : "FAIL", { url: page.url(), admin });

  const student = await fillAndSubmitUser({ name: `${prefix} Student`, email: created.studentEmail, role: "student", coins: 50 });
  created.studentId = student.data?.id || "";
  record("Create Student", student.data?.role === "student" ? "PASS" : "FAIL", { email: created.studentEmail, user: student });

  const mentor = await fillAndSubmitUser({ name: `${prefix} Mentor`, email: created.mentorEmail, role: "mentor", coins: 0 });
  created.mentorId = mentor.data?.id || "";
  record("Create Mentor", mentor.data?.role === "mentor" ? "PASS" : "FAIL", { email: created.mentorEmail, user: mentor });

  const studentLogin = await signInCheck(created.studentEmail, password, "student.html");
  record("Student login after create", studentLogin.ok && studentLogin.role === "student" ? "PASS" : "FAIL", studentLogin);

  const mentorLogin = await signInCheck(created.mentorEmail, password, "mentor.html");
  record("Mentor login after create", mentorLogin.ok && mentorLogin.role === "mentor" ? "PASS" : "FAIL", mentorLogin);

  const studentEdit = await editUser(created.studentEmail, `${prefix} Student Edited`, "QaPass456!");
  record("Edit Student + Reset Password", studentEdit.data?.name === `${prefix} Student Edited` ? "PASS" : "FAIL", { user: studentEdit });
  const resetLogin = await signInCheck(created.studentEmail, "QaPass456!", "student.html");
  record("Reset Password Login", resetLogin.ok ? "PASS" : "FAIL", resetLogin);

  const mentorEdit = await editUser(created.mentorEmail, `${prefix} Mentor Edited`);
  record("Edit Mentor", mentorEdit.data?.name === `${prefix} Mentor Edited` ? "PASS" : "FAIL", { user: mentorEdit });

  await selectAdminView("users");
  await page.fill("#userSearch", prefix);
  await page.waitForTimeout(1_000);
  const searchText = await page.locator("#usersTable").innerText().catch(() => "");
  record("Search Users", searchText.includes(prefix) ? "PASS" : "FAIL", { visibleText: searchText.slice(0, 500) });

  const schemaChecks = {
    courses: await db("courses"),
    shop_items: await db("shop_items"),
    batches: await db("batches"),
    announcements: await db("announcements"),
    user_courses: await db("user_courses")
  };
  record("Database read access as admin", Object.values(schemaChecks).every((item) => !item.error) ? "PASS" : "FAIL", schemaChecks);

  const deletedStudent = await deleteUser(created.studentEmail);
  record("Delete Student", deletedStudent.data?.deleted_at || deletedStudent.data?.status === "archived" ? "PASS" : "FAIL", { user: deletedStudent });

  const deletedMentor = await deleteUser(created.mentorEmail);
  record("Delete Mentor", deletedMentor.data?.deleted_at || deletedMentor.data?.status === "archived" ? "PASS" : "FAIL", { user: deletedMentor });

  const deletedStudentLogin = await signInCheck(created.studentEmail, "QaPass456!", "student.html");
  record("Deleted student login blocked", !deletedStudentLogin.ok ? "PASS" : "FAIL", deletedStudentLogin);

  await page.locator("#logoutBtn").click();
  await page.waitForTimeout(2_000);
  record("Logout", /login\.html|index\.html/.test(page.url()) ? "PASS" : "FAIL", { url: page.url() });
} catch (error) {
  record("Runner error", "FAIL", { message: error.message, stack: String(error.stack || "").slice(0, 1200) });
} finally {
  const result = { prefix, created, evidence, network: network.slice(-80) };
  mkdirSync("test-results", { recursive: true });
  const out = `test-results/live-admin-qa-${prefix}.json`;
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out, ...result }, null, 2));
  await browser.close();
}
