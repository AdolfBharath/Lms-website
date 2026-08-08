import { chromium } from "playwright";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:4173";
const adminEmail = process.env.QA_ADMIN_EMAIL || "admin@jenovate.in";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "Temp@12345";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.JenovateAuth && window.getSupabaseClient, null, { timeout: 25_000 });
  await page.fill("#email", adminEmail);
  await page.fill("#password", adminPassword);
  await page.locator(".submit-btn").click();
  await page.waitForFunction(() => location.href.includes("admin.html") || Boolean(sessionStorage.getItem("jenovateCurrentUser")), null, { timeout: 35_000 });
  if (!page.url().includes("admin.html")) await page.goto(`${baseURL}/admin.html`, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(5_000);

  const result = await page.evaluate(async () => {
    const client = window.getSupabaseClient();
    const { data: rows, error: selectError } = await client
      .from("user_courses")
      .select("id,user_id,student_id,learner_id,course_id,status,deleted_at")
      .not("course_id", "is", null)
      .limit(50);
    if (selectError) return { ok: false, step: "select", error: selectError };
    const row = (rows || []).find((item) => item.course_id && (item.user_id || item.student_id || item.learner_id));
    if (!row) return { ok: false, step: "select", error: "No existing enrollment row available for non-destructive verification." };
    const target_user_id = row.user_id || row.student_id || row.learner_id;
    const target_course_id = row.course_id;
    const first = await client.rpc("lms_enroll_student", { target_user_id, target_course_id });
    const second = await client.rpc("lms_enroll_student", { target_user_id, target_course_id });
    const { data: after, error: countError } = await client
      .from("user_courses")
      .select("id,user_id,student_id,learner_id,course_id,status,deleted_at")
      .eq("course_id", target_course_id)
      .or(`user_id.eq.${target_user_id},student_id.eq.${target_user_id},learner_id.eq.${target_user_id}`);
    return {
      ok: !first.error && !second.error && !countError && (after || []).length >= 1,
      target_user_id,
      target_course_id,
      firstError: first.error || null,
      secondError: second.error || null,
      countError: countError || null,
      matchingRowsAfter: after?.length || 0
    };
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
}
