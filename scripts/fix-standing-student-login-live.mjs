import { chromium } from "playwright";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const adminEmail = process.env.QA_ADMIN_EMAIL || "admin@jenovate.in";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "Temp@12345";
const studentEmail = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const studentPassword = process.env.QA_STUDENT_PASSWORD || "12345678";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function waitForApp(target = page) {
  await target.waitForFunction(() => window.JenovateAuth && window.getSupabaseClient, null, { timeout: 20_000 });
}

async function loginAdmin() {
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await waitForApp();
  await page.fill("#email", adminEmail);
  await page.fill("#password", adminPassword);
  await page.locator(".submit-btn").click();
  await page.waitForFunction(() => location.href.includes("admin.html") || sessionStorage.getItem("jenovateCurrentUser"), null, { timeout: 30_000 });
  if (!page.url().includes("admin.html")) await page.goto(`${baseURL}/admin.html`, { waitUntil: "load" });
  await page.waitForSelector("#refreshBtn", { timeout: 20_000 });
  await page.waitForTimeout(8_000);
}

async function selectUsers() {
  const active = await page.evaluate(() => document.querySelector("#usersView")?.classList.contains("active"));
  if (active) return;
  await page.locator('button[data-view="users"]').evaluateAll((buttons) => {
    const visible = buttons.find((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    if (!visible) throw new Error("Users navigation button was not visible");
    visible.click();
  });
  await page.waitForFunction(() => document.querySelector("#usersView")?.classList.contains("active"), null, { timeout: 10_000 });
}

async function resetStudentPassword() {
  await selectUsers();
  const existing = await page.evaluate(async (email) => {
    const { data, error } = await window.getSupabaseClient()
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    return { data, error: error ? { code: error.code, message: error.message } : null };
  }, studentEmail);
  if (!existing.data) {
    await page.locator("#addUserBtn").scrollIntoViewIfNeeded();
    await page.locator("#addUserBtn").click();
    await page.fill("#createUserName", "Student One");
    await page.fill("#createUserEmail", studentEmail);
    await page.fill("#createUserPassword", studentPassword);
    await page.selectOption("#createUserRole", "student");
    await page.fill("#createUserUsername", "student1");
    await page.locator("#createUserForm button[type='submit']").click();
    await page.waitForTimeout(10_000);
    return;
  }
  await page.fill("#userSearch", studentEmail);
  await page.waitForTimeout(2_000);
  const rowText = await page.locator("#usersTable").innerText().catch(() => "");
  if (!rowText.toLowerCase().includes(studentEmail.toLowerCase())) {
    throw new Error(`Student profile not found in admin Users table: ${studentEmail}`);
  }
  await page.locator("[data-edit-user]").first().click();
  await page.waitForSelector("#userForm", { timeout: 10_000 });
  const name = await page.locator("#userName").inputValue();
  if (!name.trim()) await page.fill("#userName", "Student One");
  await page.fill("#userPassword", studentPassword);
  await page.locator("#userForm button[type='submit']").click();
  await page.waitForTimeout(10_000);
}

async function verifyStudentLogin() {
  const check = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await check.goto(`${baseURL}/login.html`, { waitUntil: "load" });
    await waitForApp(check);
    const result = await check.evaluate(async ({ email, password }) => {
      try {
        const profile = await window.JenovateAuth.signInWithPassword(email, password);
        return { ok: Boolean(profile), role: profile?.role || "", id: profile?.id || "", status: profile?.status || "" };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, { email: studentEmail, password: studentPassword });
    if (result.ok) {
      await check.evaluate((profile) => {
        sessionStorage.setItem("jenovateCurrentUser", JSON.stringify(profile));
      }, { role: result.role, email: studentEmail, id: result.id });
      await check.goto(`${baseURL}/student.html`, { waitUntil: "load" });
      await check.waitForTimeout(5_000);
      result.portalUrl = check.url();
      result.title = await check.title();
    }
    return result;
  } finally {
    await check.close();
  }
}

try {
  await loginAdmin();
  await resetStudentPassword();
  const result = await verifyStudentLogin();
  console.log(JSON.stringify({ studentEmail, result }, null, 2));
  if (!result.ok || result.role !== "student") process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ error: error.message, stack: String(error.stack || "").slice(0, 1200) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
