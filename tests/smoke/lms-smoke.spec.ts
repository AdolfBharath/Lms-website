import { expect, test, type Page } from "@playwright/test";

type Role = "admin" | "mentor" | "student";
type MockOptions = {
  chats?: unknown[];
};

declare global {
  interface Window {
    __mockSupabaseClient: unknown;
    getLmsPlatformClient?: () => unknown;
    getSupabaseClient?: () => unknown;
  }
}

async function mockSupabase(page: Page, role: Role = "student", options: MockOptions = {}) {
  await page.route(/.*\/assets\/vendor\/(?:supabase-2\.49\.4|lms-platform-sdk)\.js$/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.supabase={createClient:function(){return window.__mockSupabaseClient;}};"
    });
  });

  await page.addInitScript(({ activeRole, mockChats }) => {
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
      batch_chats: mockChats,
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
  }, { activeRole: role, mockChats: options.chats || [] });
}

async function waitForLegacyScripts(page: Page) {
  await page.waitForFunction(() => Boolean(window.getLmsPlatformClient || window.getSupabaseClient));
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

test("admin dashboard reference UI renders without horizontal overflow", async ({ page }) => {
  await mockSupabase(page, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin.html");
  await expect(page.locator("#dashboardView.active .admin-reference-dashboard")).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/admin-context-collapsed/);
  await page.locator("#homeBtn").click();
  await expect(page.locator("body")).not.toHaveClass(/admin-context-collapsed/);
  await page.waitForTimeout(220);
  await expect(page.locator(".admin-context-panel")).toBeVisible();
  await expect(page.locator("#adminTopbarTitle")).toHaveText("Dashboard");
  await expect(page.locator("#adminTopbarMenu")).toBeHidden();
  await expect(page.locator("#adminRefKpis .admin-ref-kpi")).toHaveCount(4);
  await expect(page.locator("#adminRefGrowthChart svg")).toBeVisible();
  await expect(page.locator('#dashboardView [data-admin-ref-range="weekly"]')).toHaveClass(/active/);
  await page.locator('#dashboardView [data-admin-ref-range="monthly"]').click();
  await expect(page.locator('#dashboardView [data-admin-ref-range="monthly"]')).toHaveClass(/active/);
  await expect(page.locator("#adminRefGrowthChart .admin-ref-chart-point")).toHaveCount(12);
  await page.locator('#dashboardView [data-admin-ref-range="yearly"]').click();
  await expect(page.locator('#dashboardView [data-admin-ref-range="yearly"]')).toHaveClass(/active/);
  await expect(page.locator("#adminRefGrowthChart .admin-ref-chart-point")).toHaveCount(5);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector(".admin-main") as HTMLElement | null;
    const dashboard = document.querySelector("#dashboardView .admin-reference-dashboard") as HTMLElement | null;
    const grid = document.querySelector("#dashboardView .admin-ref-grid") as HTMLElement | null;
    const shell = document.querySelector(".admin-shell") as HTMLElement | null;
    const iconRail = document.querySelector(".admin-sidebar") as HTMLElement | null;
    const contextPanel = document.querySelector(".admin-context-panel") as HTMLElement | null;
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      dashboardOverflow: dashboard ? dashboard.scrollWidth - dashboard.clientWidth : 0,
      gridOverflow: grid ? grid.scrollWidth - grid.clientWidth : 0,
      shellHeight: shell?.getBoundingClientRect().height || 0,
      iconRailWidth: iconRail?.getBoundingClientRect().width || 0,
      contextPanelWidth: contextPanel?.getBoundingClientRect().width || 0,
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
  expect(metrics.mainOverflow).toBeLessThanOrEqual(2);
  expect(metrics.dashboardOverflow).toBeLessThanOrEqual(2);
  expect(metrics.gridOverflow).toBeLessThanOrEqual(2);
  expect(metrics.shellHeight).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.iconRailWidth).toBeGreaterThanOrEqual(70);
  expect(metrics.iconRailWidth).toBeLessThanOrEqual(86);
  expect(metrics.contextPanelWidth).toBeGreaterThanOrEqual(190);
  expect(metrics.contextPanelWidth).toBeLessThanOrEqual(230);
});

test("admin reviews page keeps toolbar and review lists contained", async ({ page }) => {
  await mockSupabase(page, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin.html");
  await page.locator('[data-view="reviews"]').first().click();
  await expect(page.locator("#reviewsView.active")).toBeVisible();
  await expect(page.locator("#adminTopbarTitle")).toHaveText("Reviews");
  await expect(page.locator("#reviewsView .section-toolbar")).toBeVisible();
  await expect(page.locator("#reviewsView .review-grid")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const toolbar = document.querySelector("#reviewsView .section-toolbar") as HTMLElement | null;
    const grid = document.querySelector("#reviewsView .review-grid") as HTMLElement | null;
    const panels = Array.from(document.querySelectorAll("#reviewsView .panel")) as HTMLElement[];
    const lists = Array.from(document.querySelectorAll("#reviewsView .compact-list")) as HTMLElement[];
    const toolbarRect = toolbar?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridOverflow: grid ? grid.scrollWidth - grid.clientWidth : 0,
      toolbarAboveGrid: toolbarRect && gridRect ? toolbarRect.bottom <= gridRect.top + 2 : false,
      panelCount: panels.length,
      listCount: lists.length,
      tallestPanel: Math.max(0, ...panels.map((panel) => panel.getBoundingClientRect().height)),
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
  expect(metrics.gridOverflow).toBeLessThanOrEqual(2);
  expect(metrics.toolbarAboveGrid).toBeTruthy();
  expect(metrics.panelCount).toBeGreaterThanOrEqual(2);
  expect(metrics.listCount).toBeGreaterThanOrEqual(2);
  expect(metrics.tallestPanel).toBeLessThan(metrics.viewportHeight);
});

test("admin navigation pages switch without client errors or loading overlay", async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await mockSupabase(page, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin.html");

  const views = await page.locator(".admin-sidebar .nav-item").evaluateAll((items) =>
    items.map((item) => (item as HTMLElement).dataset.view).filter(Boolean)
  );

  for (const view of views) {
    await page.locator(`.admin-sidebar .nav-item[data-view="${view}"]`).click();
    await expect(page.locator(`#${view}View.active`)).toBeVisible();
    await expect(page.locator("#loadingPanel")).not.toHaveClass(/show/);
    await expect(page.locator("#adminTopbarTitle")).not.toHaveText("");
  }

  const railMetrics = await page.evaluate(() => {
    const rail = document.querySelector(".admin-sidebar") as HTMLElement | null;
    const items = Array.from(document.querySelectorAll(".admin-sidebar .nav-item, .sidebar-action-btn")) as HTMLElement[];
    const railRect = rail?.getBoundingClientRect();
    const railCenter = railRect ? railRect.left + railRect.width / 2 : 0;
    const maxCenterOffset = Math.max(0, ...items.map((item) => {
      const rect = item.getBoundingClientRect();
      return Math.abs((rect.left + rect.width / 2) - railCenter);
    }));
    return {
      railWidth: railRect?.width || 0,
      maxCenterOffset
    };
  });

  expect(railMetrics.railWidth).toBeGreaterThanOrEqual(70);
  expect(railMetrics.railWidth).toBeLessThanOrEqual(74);
  expect(railMetrics.maxCenterOffset).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("admin dashboard remains usable at normal zoom on shorter screens", async ({ page }) => {
  await mockSupabase(page, "admin");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/admin.html");
  await expect(page.locator("#dashboardView.active .admin-reference-dashboard")).toBeVisible();
  await page.locator("#homeBtn").click();
  await expect(page.locator("body")).not.toHaveClass(/admin-context-collapsed/);
  await page.waitForTimeout(220);

  const beforeHover = await page.evaluate(() => {
    const railItems = Array.from(document.querySelectorAll(".admin-sidebar .nav-item, .sidebar-action-btn")) as HTMLElement[];
    const topCourses = document.querySelector("#adminRefTopCourses") as HTMLElement | null;
    const courseRows = Array.from(document.querySelectorAll("#adminRefTopCourses .admin-ref-course-row")) as HTMLElement[];
    const topbar = document.querySelector(".admin-topbar") as HTMLElement | null;
    const actionItems = Array.from(document.querySelectorAll(".topbar-actions > *")) as HTMLElement[];
    const contextPanel = document.querySelector(".admin-context-panel") as HTMLElement | null;
    const overlaps = railItems.some((item, index) => {
      const current = item.getBoundingClientRect();
      return railItems.slice(index + 1).some((nextItem) => {
        const next = nextItem.getBoundingClientRect();
        const horizontalOverlap = current.left < next.right && current.right > next.left;
        const verticalOverlap = current.top < next.bottom && current.bottom > next.top;
        return horizontalOverlap && verticalOverlap;
      });
    });
    const actionTops = actionItems
      .filter((item) => getComputedStyle(item).display !== "none")
      .map((item) => Math.round(item.getBoundingClientRect().top));
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      topCoursesOverflow: topCourses ? topCourses.scrollWidth - topCourses.clientWidth : 0,
      widestCourseOverflow: Math.max(0, ...courseRows.map((row) => row.scrollWidth - row.clientWidth)),
      navOverlaps: overlaps,
      topbarHeight: topbar?.getBoundingClientRect().height || 0,
      actionRows: new Set(actionTops).size,
      contextPanelHeight: contextPanel?.getBoundingClientRect().height || 0,
      contextPanelScrollable: contextPanel ? contextPanel.scrollHeight >= contextPanel.clientHeight : false,
      contextPanelOverflowX: contextPanel ? contextPanel.scrollWidth - contextPanel.clientWidth : 0,
      contextPanelOverflowY: contextPanel ? getComputedStyle(contextPanel).overflowY : "",
      rowCount: courseRows.length
    };
  });

  expect(beforeHover.bodyOverflow).toBeLessThanOrEqual(2);
  expect(beforeHover.topCoursesOverflow).toBeLessThanOrEqual(2);
  expect(beforeHover.widestCourseOverflow).toBeLessThanOrEqual(2);
  expect(beforeHover.navOverlaps).toBeFalsy();
  expect(beforeHover.topbarHeight).toBeLessThanOrEqual(76);
  expect(beforeHover.actionRows).toBe(1);
  expect(beforeHover.contextPanelHeight).toBeLessThanOrEqual(768);
  expect(beforeHover.contextPanelScrollable).toBeTruthy();
  expect(beforeHover.contextPanelOverflowX).toBeLessThanOrEqual(2);
  expect(beforeHover.contextPanelOverflowY).toBe("scroll");
  expect(beforeHover.rowCount).toBeGreaterThan(0);

  await page.locator("#adminRefGrowthChart .admin-ref-chart-point circle").first().hover();
  await expect(page.locator("#adminRefGrowthChart .admin-ref-chart-tip").first()).toHaveCSS("opacity", "1");
});

test("student batch chat handles active-room message volume without layout overflow", async ({ page }) => {
  const longToken = "ACTIVECHATLONGTOKEN".repeat(28);
  const chats = Array.from({ length: 40 }, (_, index) => ({
    id: `chat-${index + 1}`,
    batch_id: "batch-1",
    user_id: index % 3 === 0 ? "student-user" : "mentor-user",
    message: index === 18
      ? `This message intentionally contains a long unbroken value ${longToken} and should wrap inside the bubble.`
      : `Smoke chat message ${index + 1} from an active batch room.`,
    parent_id: index === 22 ? "chat-18" : null,
    created_at: `2026-07-01T10:${String(index).padStart(2, "0")}:00Z`
  }));

  await mockSupabase(page, "student", { chats });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/student.html");
  await page.locator('[data-view="batch"]').first().click();
  await expect(page.locator("#batchView.active .batch-chat-panel")).toBeVisible();
  await expect(page.locator("#chatList .chat-message-row")).toHaveCount(40);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector(".student-main") as HTMLElement | null;
    const layout = document.querySelector("#batchView .batch-layout") as HTMLElement | null;
    const panel = document.querySelector("#batchView .batch-chat-panel") as HTMLElement | null;
    const list = document.querySelector("#chatList") as HTMLElement | null;
    const composer = document.querySelector("#chatComposer") as HTMLElement | null;
    const bubbles = Array.from(document.querySelectorAll("#chatList .chat-message-bubble")) as HTMLElement[];
    const widestBubble = Math.max(0, ...bubbles.map((bubble) => bubble.getBoundingClientRect().width));
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      layoutOverflow: layout ? layout.scrollWidth - layout.clientWidth : 0,
      panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 0,
      listOverflow: list ? list.scrollWidth - list.clientWidth : 0,
      composerBottom: composer?.getBoundingClientRect().bottom || 0,
      composerHeight: composer?.getBoundingClientRect().height || 0,
      listWidth: list?.getBoundingClientRect().width || 0,
      widestBubble,
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.bodyOverflow).toBeLessThanOrEqual(2);
  expect(metrics.mainOverflow).toBeLessThanOrEqual(2);
  expect(metrics.layoutOverflow).toBeLessThanOrEqual(2);
  expect(metrics.panelOverflow).toBeLessThanOrEqual(2);
  expect(metrics.listOverflow).toBeLessThanOrEqual(2);
  expect(metrics.composerHeight).toBeGreaterThan(30);
  expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.widestBubble).toBeLessThan(metrics.listWidth * 0.86);
});
