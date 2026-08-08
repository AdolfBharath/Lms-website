import { chromium } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const roles = ["student", "mentor", "admin"];

function profileFor(role) {
  return {
    id: `${role}-user`,
    auth_user_id: `${role}-auth`,
    name: `${role[0].toUpperCase()}${role.slice(1)} User`,
    email: `${role}@example.test`,
    role,
    batch_id: "batch-1",
    course_ids: ["course-1"],
    expertise: ["Design"],
    coins: 25,
    status: "active"
  };
}

async function installSupabaseMock(page, role) {
  await page.route(/\/assets\/vendor\/(?:supabase-2\.49\.4|lms-platform-sdk)\.js$/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.supabase={createClient:function(){return window.__mockSupabaseClient;}};"
    });
  });

  await page.addInitScript(({ activeRole }) => {
    const profile = {
      id: `${activeRole}-user`,
      auth_user_id: `${activeRole}-auth`,
      name: `${activeRole[0].toUpperCase()}${activeRole.slice(1)} User`,
      email: `${activeRole}@example.test`,
      role: activeRole,
      batch_id: "batch-1",
      course_ids: ["course-1"],
      expertise: ["Design"],
      coins: 25,
      status: "active"
    };

    const tableRows = {
      announcements: [],
      batch_chats: [],
      batch_tasks: [],
      batches: [{ id: "batch-1", name: "Batch One", course_id: "course-1", mentor_id: "mentor-user", status: "active" }],
      courses: [{ id: "course-1", title: "Smoke Course", mentor_id: "mentor-user", status: "published", modules: [] }],
      projects: [],
      shop_items: [],
      shop_purchases: [],
      student_academic_activity: [],
      student_course_progress: [],
      student_extra_marks: [],
      student_quiz_attempts: [],
      student_shop_purchases: [],
      support_messages: [],
      support_notifications: [],
      support_tickets: [],
      task_submissions: [],
      user_courses: [{ id: "enrollment-1", user_id: "student-user", course_id: "course-1", batch_id: "batch-1", status: "active" }],
      users: [profile]
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
        maybeSingle: async () => ({ data: profile, error: null }),
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
        getSession: async () => ({ data: { session: { access_token: "mock-token" } }, error: null }),
        getUser: async () => ({
          data: { user: { id: `${activeRole}-auth`, email: profile.email, user_metadata: { name: profile.name } } },
          error: null
        }),
        refreshSession: async () => ({ data: { session: { access_token: "mock-token" } }, error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        signInWithPassword: async () => ({
          data: { user: { id: `${activeRole}-auth`, email: profile.email, user_metadata: { name: profile.name } } },
          error: null
        }),
        signOut: async () => ({ error: null })
      },
      channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
      from: (table) => chain(table),
      functions: { invoke: async () => ({ data: null, error: { message: "Mock function unavailable" } }) },
      removeChannel: async () => undefined,
      rpc: async (name) => {
        if (name === "lms_student_directory") return { data: [profile], error: null };
        if (name === "lms_claim_daily_login_reward") return { data: { coins: 25, streak_count: 1, claimed: false }, error: null };
        if (name === "lms_student_leaderboard") return { data: [], error: null };
        return { data: null, error: null };
      },
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
          upload: async () => ({ error: null })
        })
      }
    };
  }, { activeRole: role });

  await page.addInitScript(({ sessionProfile }) => {
    sessionStorage.setItem("jenovateCurrentUser", JSON.stringify(sessionProfile));
    sessionStorage.setItem(`jenovate${sessionProfile.role[0].toUpperCase()}${sessionProfile.role.slice(1)}Session`, JSON.stringify(sessionProfile));
  }, { sessionProfile: profileFor(role) });
}

async function checkRole(browser, role) {
  const page = await browser.newPage();
  const issues = [];
  page.on("console", (message) => {
    if (message.type() === "error") issues.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  await installSupabaseMock(page, role);
  await page.goto(`${baseURL}/${role}.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`.${role}-shell`, { timeout: 10_000 });
  await page.waitForTimeout(500);

  const title = await page.locator("title").evaluate((node) => node.textContent || "").catch(() => "");
  await page.close();
  return { role, title: title.trim(), issues };
}

const browser = await chromium.launch();
const results = [];
try {
  for (const role of roles) {
    results.push(await checkRole(browser, role));
  }
} finally {
  await browser.close();
}

const failed = results.filter((result) => result.issues.length);
console.log(JSON.stringify({ baseURL, results }, null, 2));
if (failed.length) {
  process.exitCode = 1;
}
