import { expect, test, type Page } from "@playwright/test";

type Role = "admin" | "mentor" | "student";

declare global {
  interface Window {
    __mockSupabaseClient: unknown;
    getSupabaseClient?: () => unknown;
  }
}

async function mockSupabase(page: Page, role: Role = "student") {
  await page.route("**/assets/vendor/supabase-2.49.4.js", async (route) => {
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
      coins: 25,
      status: "active"
    };

    const tableRows: Record<string, unknown[]> = {
      announcements: [],
      batch_chats: [],
      batch_tasks: [{
        id: "task-1",
        batch_id: "batch-1",
        course_id: "course-1",
        title: "Responsive layout prototype",
        description: "Create a high-fidelity prototype of the required layout and submit a shareable walkthrough link.",
        drive_link: "https://drive.google.com/example",
        status: "published",
        total_marks: 100,
        created_at: "2026-07-01T00:00:00Z",
        published_at: "2026-07-01T00:00:00Z"
      }],
      batches: [{ id: "batch-1", name: "Batch One", course_id: "course-1", mentor_id: "mentor-user", status: "active" }],
      courses: [{ id: "course-1", title: "Smoke Course", mentor_id: "mentor-user", status: "published", modules: [] }],
      projects: [],
      shop_items: [],
      shop_purchases: [],
      student_academic_activity: [],
      student_course_progress: [],
      student_quiz_attempts: [],
      student_shop_purchases: [],
      support_messages: [],
      support_notifications: [],
      support_tickets: [],
      task_submissions: [],
      user_courses: [{ id: "enrollment-1", user_id: "student-user", course_id: "course-1", batch_id: "batch-1", status: "active" }],
      users: [profile]
    };

    function chain(table: string) {
      const rows = tableRows[table] || [];
      const api: Record<string, unknown> = {
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
        getUser: async () => ({ data: { user: { id: `${activeRole}-auth`, email: profile.email, user_metadata: { name: profile.name } } }, error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        signInWithPassword: async () => ({ data: { user: { id: `${activeRole}-auth`, email: profile.email, user_metadata: { name: profile.name } } }, error: null }),
        signOut: async () => ({ error: null })
      },
      channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
      from: (table: string) => chain(table),
      removeChannel: async () => undefined,
      rpc: async (name: string) => {
        if (name === "lms_student_directory") return { data: [profile], error: null };
        if (name === "lms_claim_daily_login_reward") return { data: { coins: 25, streak_count: 1, claimed: false }, error: null };
        if (name === "lms_submit_public_form") return { data: { ok: true }, error: null };
        if (name === "lms_student_leaderboard") return { data: [], error: null };
        return { data: null, error: null };
      },
      storage: {
        from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }), upload: async () => ({ error: null }) })
      }
    };
  }, { activeRole: role });
}

async function waitForLegacyScripts(page: Page) {
  await page.waitForFunction(() => Boolean(window.getSupabaseClient));
}

test("login routes authenticated users to their role portal", async ({ page }) => {
  await mockSupabase(page, "mentor");
  await page.goto("/login.html");
  await waitForLegacyScripts(page);
  await page.getByLabel("EMAIL").fill("mentor@example.test");
  await page.locator("#password").fill("password123");
  await page.getByRole("button", { name: "LOGIN" }).click();
  await expect(page).toHaveURL(/mentor\.html$/);
});

test("role portals redirect mismatched sessions to unauthorized", async ({ page }) => {
  await mockSupabase(page, "student");
  await page.addInitScript(() => {
    const profile = {
      id: "student-user",
      email: "student@example.test",
      name: "Student User",
      role: "student"
    };
    sessionStorage.setItem("jenovateCurrentUser", JSON.stringify(profile));
    sessionStorage.setItem("jenovateStudentSession", JSON.stringify(profile));
  });
  await page.goto("/admin.html");
  await expect(page).toHaveURL(/unauthorized\.html\?expected=admin&role=student/);
});

test("public join form submits through the validated Supabase RPC", async ({ page }) => {
  await mockSupabase(page, "student");
  await page.goto("/join-form.html");
  await waitForLegacyScripts(page);
  await page.locator("[name=fullName]").fill("Smoke Tester");
  await page.locator("[name=gender][value=Woman]").check();
  await page.locator("[name=email]").fill("smoke@example.test");
  await page.locator("[name=phone]").fill("9876543210");
  await page.locator("[name=college]").fill("Jenovate Test College");
  await page.locator("[name=course]").fill("Smoke Course");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.locator("#formStatus")).toContainText(/submitted/i);
});

for (const role of ["student", "mentor", "admin"] as const) {
  test(`${role} portal renders its basic shell with mocked data`, async ({ page }) => {
    await mockSupabase(page, role);
    await page.goto(`/${role}.html`);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator(`.${role}-shell`)).toBeVisible();
  });
}

test("student task page fits the viewport without horizontal overflow", async ({ page }) => {
  await mockSupabase(page, "student");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/student.html");
  await page.locator('[data-view="tasks"]').first().click();
  await expect(page.locator("#tasksView.active .tasks-shell")).toBeVisible();
  await expect(page.locator("#taskMain .task-detail-title")).toContainText("Responsive layout prototype");

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector("#tasksView .tasks-shell") as HTMLElement | null;
    const main = document.querySelector(".student-main") as HTMLElement | null;
    const detail = document.querySelector("#tasksView .tasks-main") as HTMLElement | null;
    const documentCard = document.querySelector("#tasksView .task-detail-document") as HTMLElement | null;
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      shellOverflow: shell ? shell.scrollWidth - shell.clientWidth : 0,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      detailOverflow: detail ? detail.scrollWidth - detail.clientWidth : 0,
      shellWidth: shell?.getBoundingClientRect().width || 0,
      mainWidth: main?.getBoundingClientRect().width || 0,
      detailHeight: detail?.getBoundingClientRect().height || 0,
      documentHeight: documentCard?.getBoundingClientRect().height || 0,
      shellHeight: shell?.getBoundingClientRect().height || 0,
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
  expect(metrics.shellOverflow).toBeLessThanOrEqual(2);
  expect(metrics.mainOverflow).toBeLessThanOrEqual(2);
  expect(metrics.detailOverflow).toBeLessThanOrEqual(2);
  expect(metrics.shellWidth).toBeGreaterThan(metrics.mainWidth * 0.94);
  expect(metrics.documentHeight).toBeGreaterThan(metrics.detailHeight * 0.92);
  expect(metrics.shellHeight).toBeLessThanOrEqual(metrics.viewportHeight);
});
