import { chromium } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";

const profile = {
  id: "student-user",
  auth_user_id: "student-auth",
  name: "Student User",
  email: "student@example.test",
  role: "student",
  batch_id: "ghost-batch",
  course_ids: ["course-1", "course-2", "course-3", "course-4", "course-5"],
  coins: 25,
  status: "active"
};

const courses = [
  { id: "course-1", title: "Old Course", description: "Older activity", status: "published", modules: [] },
  { id: "course-2", title: "Recent Progress Course", description: "Latest saved progress", status: "published", modules: [] },
  { id: "course-3", title: "Last Opened Course", description: "Latest local access", status: "published", modules: [] },
  { id: "course-4", title: "Recent Quiz Course", description: "Recent quiz activity", status: "published", modules: [] },
  {
    id: "course-5",
    title: "PYTHON",
    description: "Completed archived course",
    status: "archived",
    modules: [{ id: "module-1", title: "Python Basics", lessons: [{ id: "lesson-1", title: "Intro", duration: "1m" }] }]
  },
  { id: "course-6", title: "Software Designing", description: "Not assigned to this student", status: "archived", modules: [] }
];

const tableRows = {
  announcements: [],
  batch_chats: [],
  batches: [
    {
      id: "ghost-batch",
      name: "software",
      course_id: "ghost-course",
      mentor_id: "mentor-user",
      status: "active"
    },
    ...courses.map((course, index) => ({
    id: `batch-${index + 1}`,
    name: `Batch ${index + 1}`,
    course_id: course.id,
    mentor_id: "mentor-user",
    status: "active"
    }))
  ],
  courses,
  projects: [],
  shop_items: [],
  shop_purchases: [],
  student_academic_activity: [],
  student_course_progress: [
    { student_id: "student-user", course_id: "course-1", updated_at: "2026-07-20T08:00:00.000Z" },
    { student_id: "student-user", course_id: "course-2", updated_at: "2026-07-24T08:00:00.000Z" },
    {
      student_id: "student-user",
      course_id: "course-5",
      completed_lessons: ["course-5:0:0:lesson-1"],
      completed_modules: ["course-5:module:module-1"],
      module_quiz_state: {
        video_progress: {
          "course-5:0:0:lesson-1": {
            watched_seconds: 60,
            duration_seconds: 60,
            percent: 100,
            completed: true,
            updated_at: "2026-07-22T08:00:00.000Z"
          }
        }
      },
      updated_at: "2026-07-22T08:00:00.000Z"
    },
    { student_id: "student-user", course_id: "course-6", updated_at: "2026-07-26T08:00:00.000Z" }
  ],
  student_extra_marks: [],
  student_quiz_attempts: [
    { id: "quiz-1", student_id: "student-user", course_id: "course-4", submitted_at: "2026-07-23T08:00:00.000Z" }
  ],
  student_shop_purchases: [],
  support_messages: [],
  support_notifications: [],
  support_tickets: [],
  batch_tasks: [
    {
      id: "task-1",
      batch_id: "ghost-batch",
      course_id: "ghost-course",
      title: "welcome",
      description: "xcvbh",
      drive_link: "https://drive.google.com/file/d/resource-preview/view",
      status: "published",
      total_marks: 100,
      created_at: "2026-06-04T08:00:00.000Z"
    }
  ],
  task_submissions: [
    {
      id: "submission-1",
      task_id: "task-1",
      student_id: "student-user",
      batch_id: "ghost-batch",
      course_id: "ghost-course",
      status: "submitted",
      drive_link: "https://drive.google.com/file/d/submission-preview/view",
      submitted_at: "2026-06-04T10:00:00.000Z",
      created_at: "2026-06-04T10:00:00.000Z"
    }
  ],
  user_courses: courses.filter((course) => course.id !== "course-6").map((course, index) => ({
    id: `enrollment-${index + 1}`,
    user_id: "student-user",
    course_id: course.id,
    batch_id: `batch-${index + 1}`,
    status: "active",
    created_at: `2026-07-${10 + index}T08:00:00.000Z`
  })),
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

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const issues = [];

page.on("console", (message) => {
  if (message.type() === "error") issues.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => {
  issues.push(`pageerror: ${error.message}`);
});

try {
  await page.route("**/assets/vendor/supabase-2.49.4.js", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.supabase={createClient:function(){return window.__mockSupabaseClient;}};"
    });
  });

  await page.addInitScript(({ sessionProfile, accessKey }) => {
    sessionStorage.setItem("jenovateCurrentUser", JSON.stringify(sessionProfile));
    sessionStorage.setItem("jenovateStudentSession", JSON.stringify(sessionProfile));
    localStorage.setItem(accessKey, JSON.stringify({
      "ghost-course": Date.parse("2026-07-26T08:00:00.000Z"),
      "course-3": Date.parse("2026-07-25T08:00:00.000Z")
    }));
  }, {
    sessionProfile: profile,
    accessKey: "jenovate:student:course-access:student-user"
  });

  await page.addInitScript(({ rows, sessionProfile }) => {
    window.__mockSupabaseClient = {
      auth: {
        getSession: async () => ({ data: { session: { access_token: "mock-token" } }, error: null }),
        getUser: async () => ({
          data: { user: { id: "student-auth", email: sessionProfile.email, user_metadata: { name: sessionProfile.name } } },
          error: null
        }),
        refreshSession: async () => ({ data: { session: { access_token: "mock-token" } }, error: null }),
        signOut: async () => ({ error: null })
      },
      channel: () => ({ on: () => ({ subscribe: () => undefined }), subscribe: () => undefined }),
      from: (table) => {
        const tableRows = rows[table] || [];
        const api = {
          delete: () => api,
          eq: () => api,
          ilike: () => api,
          in: () => api,
          insert: () => api,
          limit: () => api,
          maybeSingle: async () => ({ data: sessionProfile, error: null }),
          neq: () => api,
          or: () => api,
          order: () => api,
          range: async () => ({ data: tableRows, error: null }),
          select: () => api,
          single: async () => ({ data: tableRows[0] || null, error: null }),
          update: () => api,
          upsert: () => api
        };
        return api;
      },
      functions: { invoke: async () => ({ data: null, error: null }) },
      removeChannel: async () => undefined,
      rpc: async (name) => {
        if (name === "lms_student_directory") return { data: [sessionProfile], error: null };
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
  }, { rows: tableRows, sessionProfile: profile });

  await page.goto(`${baseURL}/student.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".student-shell", { timeout: 10_000 });
  await page.waitForFunction(() => document.querySelectorAll("#dashboardCourseOverview .dashboard-reference-course").length === 2);

  const titles = await page.locator("#dashboardCourseOverview .dashboard-reference-course h3").allTextContents();
  if (titles.length !== 2) issues.push(`expected 2 dashboard courses, found ${titles.length}`);
  if (titles[0] !== "Last Opened Course") issues.push(`expected latest opened course first, found "${titles[0] || ""}"`);
  if (titles[1] !== "Recent Progress Course") issues.push(`expected latest progress course second, found "${titles[1] || ""}"`);
  if (titles.some((title) => title.toLowerCase() === "software")) issues.push("dashboard rendered a batch fallback course instead of real admin course data");

  await page.locator('[data-view="courses"]').click();
  await page.waitForSelector("#coursesGrid .my-course-card", { timeout: 10_000 });
  const ongoingTitles = await page.locator("#coursesGrid .my-course-card h3").allTextContents();
  const coursesLayout = await page.locator("#coursesGrid").evaluate((grid) => {
    const style = window.getComputedStyle(grid);
    const firstCard = grid.querySelector(".my-course-card");
    const rect = firstCard?.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      cardHeight: rect ? Math.round(rect.height) : 0,
      background: window.getComputedStyle(document.getElementById("coursesView")).backgroundColor
    };
  });
  if (coursesLayout.columns !== 4) issues.push(`expected My Courses desktop grid to have 4 columns, found ${coursesLayout.columns}`);
  if (coursesLayout.cardHeight < 330 || coursesLayout.cardHeight > 355) issues.push(`expected My Courses card height near 342px, found ${coursesLayout.cardHeight}`);
  if (coursesLayout.background !== "rgb(255, 255, 255)") issues.push(`expected My Courses page background to be white, found ${coursesLayout.background}`);
  if (ongoingTitles.includes("PYTHON")) issues.push("completed archived PYTHON appeared in Ongoing courses");
  if (ongoingTitles.includes("Software Designing")) issues.push("unassigned Software Designing appeared in My Courses");

  await page.locator('[data-course-filter="completed"]').click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#coursesGrid .my-course-card h3")).some((node) => node.textContent === "PYTHON"));
  const completedTitles = await page.locator("#coursesGrid .my-course-card h3").allTextContents();
  if (!completedTitles.includes("PYTHON")) issues.push("completed assigned PYTHON did not appear in Completed courses");
  if (completedTitles.includes("Software Designing")) issues.push("unassigned Software Designing appeared in Completed courses");

  await page.locator('[data-view="tasks"]').click();
  await page.waitForSelector("#tasksView.active #taskMain .task-detail-title", { timeout: 10_000 });
  const tasksLayout = await page.locator("#tasksView .tasks-shell").evaluate((shell) => {
    const style = window.getComputedStyle(shell);
    const sidebar = shell.querySelector(".tasks-sidebar")?.getBoundingClientRect();
    const main = shell.querySelector(".tasks-main")?.getBoundingClientRect();
    const card = shell.querySelector(".task-card")?.getBoundingClientRect();
    const overview = shell.querySelector(".task-detail-section")?.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns,
      sidebarWidth: sidebar ? Math.round(sidebar.width) : 0,
      mainWidth: main ? Math.round(main.width) : 0,
      cardHeight: card ? Math.round(card.height) : 0,
      overviewWidth: overview ? Math.round(overview.width) : 0,
      background: window.getComputedStyle(document.getElementById("tasksView")).backgroundColor
    };
  });
  const taskTitle = await page.locator("#tasksView .task-detail-title").textContent();
  const taskSections = await page.locator("#tasksView .task-detail-section h3").allTextContents();
  if (!tasksLayout.columns.includes("300px")) issues.push(`expected Tasks sidebar column to be 300px, found ${tasksLayout.columns}`);
  if (tasksLayout.sidebarWidth < 290 || tasksLayout.sidebarWidth > 310) issues.push(`expected Tasks sidebar width near 300px, found ${tasksLayout.sidebarWidth}`);
  if (tasksLayout.mainWidth < 600) issues.push(`expected Tasks detail pane to stay wide, found ${tasksLayout.mainWidth}`);
  if (tasksLayout.cardHeight < 100) issues.push(`expected task card height to remain stable, found ${tasksLayout.cardHeight}`);
  if (tasksLayout.overviewWidth < 500) issues.push(`expected assignment overview card to stay readable, found ${tasksLayout.overviewWidth}`);
  if (tasksLayout.background !== "rgb(255, 255, 255)") issues.push(`expected Tasks page background to be white, found ${tasksLayout.background}`);
  if (taskTitle?.trim() !== "welcome") issues.push(`expected selected task title welcome, found "${taskTitle?.trim() || ""}"`);
  for (const expected of ["Assignment Overview", "Submission Requirements", "Downloadable Resources"]) {
    if (!taskSections.includes(expected)) issues.push(`missing Tasks section "${expected}"`);
  }

  console.log(JSON.stringify({ baseURL, count: titles.length, titles, coursesLayout, ongoingTitles, completedTitles, tasksLayout, taskTitle, taskSections, issues }, null, 2));
} finally {
  await browser.close();
}

if (issues.length) {
  process.exitCode = 1;
}
