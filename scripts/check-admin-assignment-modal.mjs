import { chromium } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";

async function installSupabaseMock(page) {
  await page.route("**/assets/vendor/supabase-2.49.4.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.supabase={createClient:function(){return window.__mockSupabaseClient;}};"
    });
  });

  await page.addInitScript(() => {
    const admin = {
      id: "admin-user",
      auth_user_id: "admin-auth",
      name: "Admin User",
      email: "admin@example.test",
      role: "admin",
      status: "active"
    };
    const users = [
      admin,
      { id: "student-1", name: "Xavier Student", email: "xavier@example.test", role: "student", batch_id: "batch-1", status: "active" },
      { id: "student-2", name: "Chitra Learner", email: "chitra@example.test", role: "student", batch_id: "batch-1", status: "active" },
      { id: "student-3", name: "Vikram Learner", email: "vikram@example.test", role: "student", batch_id: "batch-1", status: "active" },
      { id: "mentor-1", name: "Mentor One", email: "mentor@example.test", role: "mentor", status: "active" }
    ];
    const tableRows = {
      announcements: [],
      batch_chats: [],
      batch_tasks: [],
      batches: [{ id: "batch-1", name: "Batch One", course_id: "course-1", mentor_id: "mentor-1", status: "active" }],
      courses: [{ id: "course-1", title: "Software Designing", category: "Development", price: 500, status: "archived", mentor_id: "mentor-1", modules: [] }],
      projects: [],
      shop_items: [],
      student_course_progress: [],
      support_messages: [],
      support_notifications: [],
      support_tickets: [],
      task_submissions: [],
      user_courses: [{ id: "enroll-1", user_id: "student-1", course_id: "course-1", batch_id: "batch-1", status: "active" }],
      users
    };

    function chain(table) {
      const rows = tableRows[table] || [];
      const api = {
        delete: () => api,
        eq: () => api,
        ilike: () => api,
        in: () => api,
        insert: () => api,
        limit: () => api,
        maybeSingle: async () => ({ data: admin, error: null }),
        neq: () => api,
        or: () => api,
        order: () => api,
        range: async () => ({ data: rows, error: null }),
        select: () => api,
        single: async () => ({ data: rows[0] || null, error: null }),
        update: () => api,
        upsert: () => api
      };
      return api;
    }

    window.__mockSupabaseClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: "admin-auth", email: admin.email, user_metadata: { name: admin.name } } }, error: null }),
        signOut: async () => ({ error: null })
      },
      channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
      from: (table) => chain(table),
      removeChannel: async () => undefined,
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }) }) }
    };

    sessionStorage.setItem("jenovateCurrentUser", JSON.stringify(admin));
    sessionStorage.setItem("jenovateAdminSession", JSON.stringify(admin));
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 820 } });
const issues = [];
page.on("console", (message) => {
  if (message.type() === "error") issues.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));

try {
  await installSupabaseMock(page);
  await page.goto(`${baseURL}/admin.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".admin-shell", { timeout: 10_000 });
  await page.locator('[data-view="courses"]').first().click();
  await page.waitForSelector("[data-assign-course]", { timeout: 10_000 });
  await page.locator("[data-assign-course]").first().click();
  await page.waitForSelector(".assignment-form-pro .assignment-option", { timeout: 10_000 });

  const layout = await page.locator(".assignment-form-pro .assignment-option").first().evaluate((node) => {
    const row = node.getBoundingClientRect();
    const text = node.querySelector("span")?.getBoundingClientRect();
    const checkbox = node.querySelector("input")?.getBoundingClientRect();
    const strongStyle = getComputedStyle(node.querySelector("strong"));
    return {
      rowWidth: row.width,
      rowHeight: row.height,
      textWidth: text?.width || 0,
      checkboxWidth: checkbox?.width || 0,
      strongWhiteSpace: strongStyle.whiteSpace,
      strongWritingMode: strongStyle.writingMode
    };
  });

  if (layout.rowWidth < 500) issues.push(`assignment row too narrow: ${layout.rowWidth}`);
  if (layout.rowHeight < 52 || layout.rowHeight > 100) issues.push(`assignment row height looks wrong: ${layout.rowHeight}`);
  if (layout.textWidth < 300) issues.push(`assignment text block too narrow: ${layout.textWidth}`);
  if (layout.checkboxWidth < 16) issues.push(`assignment checkbox too small: ${layout.checkboxWidth}`);
  if (layout.strongWhiteSpace !== "nowrap") issues.push(`assignment text is not constrained: ${layout.strongWhiteSpace}`);
  if (layout.strongWritingMode !== "horizontal-tb") issues.push(`assignment text writing mode is wrong: ${layout.strongWritingMode}`);

  console.log(JSON.stringify({ baseURL, layout, issues }, null, 2));
} finally {
  await browser.close();
}

if (issues.length) process.exitCode = 1;
