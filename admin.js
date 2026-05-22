(function () {
  const SESSION_KEY = "jenovateAdminSession";
  const LEGACY_SESSION_KEY = "jenovateCurrentUser";
  const getClient = () => window.getSupabaseClient?.();
  const TABLE_SPECS = [
    {
      key: "users",
      table: "users",
      select: "id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,courseNames,created_at",
      limit: 500
    },
    { key: "courses", table: "courses", select: "*", limit: 200 },
    { key: "batches", table: "batches", select: "*", limit: 200 },
    { key: "userCourses", table: "user_courses", select: "*", limit: 1000 },
    { key: "progress", table: "student_course_progress", select: "*", limit: 1000 },
    { key: "shopItems", table: "shop_items", select: "*", limit: 100 },
    { key: "projects", table: "projects", select: "*", limit: 500 },
    { key: "batchTasks", table: "batch_tasks", select: "*", limit: 500 },
    { key: "taskSubmissions", table: "task_submissions", select: "*", limit: 500 },
    { key: "chats", table: "batch_chats", select: "*", limit: 200 },
    { key: "announcements", table: "announcements", select: "*", limit: 100 }
  ];

  const state = {
    admin: null,
    activeView: "dashboard",
    dashboardRole: "student",
    userRole: "all",
    analyticsRange: "daily",   // daily | weekly | monthly
    globalQuery: "",
    selectedBatchId: null,
    realtimeChannel: null,
    refreshTimer: null,
    tableErrors: {},
    data: {
      users: [],
      courses: [],
      batches: [],
      userCourses: [],
      progress: [],
      shopItems: [],
      projects: [],
      batchTasks: [],
      taskSubmissions: [],
      chats: [],
      announcements: []
    }
  };

  const views = {
    dashboard: document.getElementById("dashboardView"),
    users: document.getElementById("usersView"),
    courses: document.getElementById("coursesView"),
    batches: document.getElementById("batchesView"),
    enrollments: document.getElementById("enrollmentsView"),
    tasks: document.getElementById("tasksView"),
    chat: document.getElementById("chatView"),
    shop: document.getElementById("shopView"),
    reviews: document.getElementById("reviewsView"),
    announcements: document.getElementById("announcementsView"),
    profile: document.getElementById("profileView")
  };

  const viewTitle = document.getElementById("viewTitle");
  const loadingPanel = document.getElementById("loadingPanel");
  const alertBox = document.getElementById("adminAlert");
  const syncStatus = document.getElementById("syncStatus");
  const modal = document.getElementById("adminModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  document.addEventListener("DOMContentLoaded", init);
  // NOTE: Do NOT re-run verifyCurrentAdmin on pageshow/persisted —
  // doing so causes a redirect loop when user presses the Back button.

  async function init() {
    wireNavigation();
    wireActions();

    if (!getClient()) {
      showAlert("Supabase library did not load. Check your internet connection and refresh.", true);
      return;
    }

    const admin = await resolveAdminSession();
    if (!admin) {
      if (redirectToActiveSession("admin")) return;
      clearStoredSessions();
      window.location.replace("login.html?next=admin");
      return;
    }

    state.admin = admin;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
    sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(admin));
    window.addEventListener("pageshow", enforceLiveSession);
    // NOTE: pagehide/beforeunload session clear removed — it caused session loss
    // on normal in-tab navigation. Session is cleared only on explicit logout.
    
    renderAdminIdentity();
    await loadAllData();
    setupRealtime();
  }

  async function verifyCurrentAdmin() {
    if (!getClient()) return;
    setLoading(true);
    try {
      const admin = await resolveAdminSession();
      if (!admin) {
        if (redirectToActiveSession("admin")) return;
        clearStoredSessions();
        window.location.replace("login.html?next=admin");
        return;
      }
      state.admin = admin;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(admin));
      sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(admin));
      renderAdminIdentity();
    } catch (error) {
      if (redirectToActiveSession("admin")) return;
      clearStoredSessions();
      window.location.replace("login.html?next=admin");
      return;
    } finally {
      setLoading(false);
    }
  }

  function wireNavigation() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    document.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.jump));
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
  }

  function wireActions() {
    document.getElementById("refreshBtn").addEventListener("click", loadAllData);
    document.getElementById("refreshReviewsBtn").addEventListener("click", loadAllData);
    document.getElementById("reloadChatBtn").addEventListener("click", loadChats);
    document.getElementById("homeBtn")?.addEventListener("click", () => {
      closeModal();
      setView("dashboard");
      document.querySelector(".admin-main")?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("profileQuickBtn")?.addEventListener("click", () => setView("profile"));
    document.getElementById("sidebarProfileBtn")?.addEventListener("click", () => setView("profile"));
    document.getElementById("adminAvatar")?.addEventListener("click", () => setView("profile"));
    document.getElementById("adminProfileForm")?.addEventListener("submit", saveAdminProfile);
    document.getElementById("resetProfileFormBtn")?.addEventListener("click", renderProfile);
    document.getElementById("addCourseBtn").addEventListener("click", () => openCourseModal());
    document.getElementById("addBatchBtn").addEventListener("click", () => openBatchModal());
    document.getElementById("addUserBtn")?.addEventListener("click", () => openUserCreateModal());
    document.getElementById("importUsersBtn")?.addEventListener("click", () => openUserImportModal());
    document.getElementById("addEnrollmentBtn")?.addEventListener("click", () => openEnrollmentModal());
    document.getElementById("addTaskBtn")?.addEventListener("click", () => openTaskModal());
    document.getElementById("addShopBtn").addEventListener("click", () => openShopModal());
    document.getElementById("addAnnouncementBtn")?.addEventListener("click", () => openAnnouncementModal());
    document.getElementById("globalSearch")?.addEventListener("input", (event) => {
      state.globalQuery = event.target.value.trim().toLowerCase();
      renderActiveView();
    });
    document.getElementById("dashboardUserSearch").addEventListener("input", renderDashboardUsers);
    document.getElementById("userSearch").addEventListener("input", renderUsers);
    document.getElementById("chatComposer").addEventListener("submit", postChatMessage);

    document.querySelectorAll("#dashboardUserTabs button").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveButton("#dashboardUserTabs button", button);
        state.dashboardRole = button.dataset.role;
        renderDashboardUsers();
      });
    });

    document.querySelectorAll("#userRoleTabs button").forEach((button) => {
      button.addEventListener("click", () => {
        setActiveButton("#userRoleTabs button", button);
        state.userRole = button.dataset.role;
        renderUsers();
      });
    });

    // Wire analytics tab buttons (Daily / Weekly / Monthly)
    document.querySelectorAll(".analytics-panel .mini-tabs button").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".analytics-panel .mini-tabs button").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        state.analyticsRange = button.textContent.trim().toLowerCase();
        renderAnalyticsChart();
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  async function resolveAdminSession() {
    return readStoredRoleSession("admin");
  }

  function readStoredRoleSession(expectedRole) {
    for (const key of [SESSION_KEY, LEGACY_SESSION_KEY]) {
      try {
        const profile = JSON.parse(sessionStorage.getItem(key) || "null");
        const role = String(profile?.role || "").toLowerCase();
        if (profile?.email && role === expectedRole) {
          return normalizeUser({ ...profile, role });
        }
      } catch (error) {
        sessionStorage.removeItem(key);
      }
    }
    return null;
  }

  function enforceLiveSession() {
    if (!readStoredRoleSession("admin")) {
      if (redirectToActiveSession("admin")) return;
      window.location.replace("login.html?next=admin");
    }
  }

  function redirectToActiveSession(expectedRole) {
    const profile = window.JenovateSessionRouter?.activeSession?.();
    const target = window.JenovateSessionRouter?.routeFor?.(profile);
    if (!profile?.role || profile.role === expectedRole || !target) return false;
    window.location.replace(target);
    return true;
  }

  function clearStoredSessions() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    sessionStorage.removeItem("jenovateMentorSession");
    sessionStorage.removeItem("jenovateStudentSession");
  }

  async function loadAllData(options = {}) {
    const silent = options?.silent === true;
    setSyncStatus("Connecting to Supabase...");
    setLoading(!silent);
    try {
      const results = await Promise.all(TABLE_SPECS.map(fetchTableSafe));
      const rows = Object.fromEntries(results.map((result) => [result.key, result.rows]));
      const failed = results.filter((result) => result.error);

      state.tableErrors = Object.fromEntries(failed.map((result) => [result.table, result.error.message || "Unable to fetch"]));
      state.data.users = rows.users.map(normalizeUser);
      state.data.courses = rows.courses;
      state.data.batches = rows.batches;
      state.data.userCourses = rows.userCourses.map(normalizeEnrollment);
      state.data.progress = rows.progress;
      state.data.shopItems = rows.shopItems;
      state.data.projects = rows.projects;
      state.data.batchTasks = rows.batchTasks;
      state.data.taskSubmissions = rows.taskSubmissions;
      state.data.chats = rows.chats;
      state.data.announcements = rows.announcements;

      if (!state.selectedBatchId && state.data.batches[0]) {
        state.selectedBatchId = state.data.batches[0].id;
      }

      renderAll();
      const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (failed.length) {
        setSyncStatus(`Synced with ${failed.length} table warning${failed.length === 1 ? "" : "s"} at ${stamp}`);
        if (!silent) showAlert(`Some Supabase tables need attention: ${failed.map((item) => item.table).join(", ")}`, true);
      } else {
        setSyncStatus(`Live Supabase data synced ${stamp}`);
        if (!silent) showAlert("Admin data synced from Supabase.");
      }
    } catch (error) {
      showAlert(error.message || "Unable to load admin data.", true);
      setSyncStatus("Sync needs attention");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTableSafe(spec) {
    try {
      const rows = await fetchTable(spec.table, spec.select, spec.limit);
      return { ...spec, rows, error: null };
    } catch (error) {
      console.error(`Supabase fetch failed for ${spec.table}`, error);
      return { ...spec, rows: [], error };
    }
  }

  async function fetchTable(table, select, limit = 500) {
    const supabaseClient = getClient();
    const { data, error } = await supabaseClient.from(table).select(select).limit(limit);
    if (error) throw error;
    return data || [];
  }

  async function loadChats() {
    try {
      state.data.chats = await fetchTable("batch_chats", "*");
      renderChat();
      showAlert("Chat refreshed.");
    } catch (error) {
      showAlert(error.message || "Unable to refresh chat.", true);
    }
  }

  function setupRealtime() {
    const supabaseClient = getClient();
    if (!supabaseClient?.channel || state.realtimeChannel) return;

    const liveTables = [
      "users",
      "courses",
      "batches",
      "user_courses",
      "student_course_progress",
      "shop_items",
      "projects",
      "batch_tasks",
      "task_submissions",
      "batch_chats",
      "announcements"
    ];

    const channel = supabaseClient.channel("admin-lms-realtime");
    liveTables.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => queueRealtimeRefresh(payload.table || table)
      );
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSyncStatus("Realtime connected");
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        setSyncStatus("Realtime reconnecting");
      }
    });

    state.realtimeChannel = channel;
  }

  function queueRealtimeRefresh(table) {
    setSyncStatus(`Live update from ${formatTableName(table)}`);
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      loadAllData({ silent: true });
    }, 450);
  }

  function renderAll() {
    renderDashboard();
    renderLiveBatches();
    renderUsers();
    renderCourses();
    renderBatches();
    renderEnrollments();
    renderTasks();
    renderChatBatches();
    renderChat();
    renderShop();
    renderReviews();
    renderAnnouncements();
    renderProfile();
  }

  function renderAdminIdentity() {
    const name = state.admin?.name || state.admin?.username || "Admin";
    const email = state.admin?.email || "";
    document.getElementById("sidebarAdminName").textContent = name;
    document.getElementById("sidebarAdminEmail").textContent = email;
    document.getElementById("adminAvatar").textContent = initials(name);
    document.getElementById("sidebarAdminAvatar").textContent = initials(name);
    setText("footerAdminAvatar", initials(name));
    renderProfile();
  }

  function renderProfile() {
    if (!views.profile || !state.admin) return;
    const adminRecord = findById(state.data.users, state.admin.id) || state.admin;
    const admin = normalizeUser({ ...state.admin, ...adminRecord });
    const students = state.data.users.filter((user) => user.role === "student" && String(user.email).toLowerCase() !== "adolf@gmail.com" && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")).length;
    const mentors = state.data.users.filter((user) => user.role === "mentor" || String(user.email).toLowerCase() === "adolf@gmail.com" || sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")).length;
    const syncText = syncStatus?.textContent || "Live workspace";

    setText("profilePageAvatar", initials(admin.name));
    setText("profilePageName", admin.name || "Admin");
    setText("profilePageEmail", admin.email || "No email set");
    setText("profileTotalUsers", state.data.users.length);
    setText("profileTotalCourses", state.data.courses.length);
    setText("profileRole", admin.role || "admin");
    setText("profileMentorCount", mentors);
    setText("profileStudentCount", students);
    setText("profileSyncText", syncText);

    setValue("adminProfileName", admin.name || "");
    setValue("adminProfileUsername", admin.username || "");
    setValue("adminProfileEmail", admin.email || "");
    setValue("adminProfilePhone", admin.phone || "");
  }

  function renderDashboard() {
    const users = state.data.users;
    const students = users.filter((user) => user.role === "student" && String(user.email).toLowerCase() !== "adolf@gmail.com" && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")).length;
    const mentors = users.filter((user) => user.role === "mentor").length;
    const publishedCourses = state.data.courses.filter((course) => ["published", "active", "live"].includes(String(course.status || "").toLowerCase())).length;
    const draftCourses = Math.max(0, state.data.courses.length - publishedCourses);
    const activeBatches = state.data.batches.filter((batch) => ["active", "published", "live"].includes(String(batch.status || "").toLowerCase())).length;
    const pendingReviews = [
      ...state.data.projects,
      ...state.data.taskSubmissions
    ].filter((item) => ["", "pending", "submitted", "review_pending"].includes(String(item.status || "").toLowerCase())).length;
    const reviewedItems = [
      ...state.data.projects,
      ...state.data.taskSubmissions
    ].filter((item) => ["approved", "reviewed", "completed", "rejected", "changes_requested"].includes(String(item.status || "").toLowerCase())).length;

    setText("reviewPendingCount", pendingReviews);
    setText("reviewedCount", reviewedItems);
    setText("libraryCourseCount", state.data.courses.length);
    setText("liveCourseCount", `${publishedCourses} live`);
    setText("draftCourseCount", `${draftCourses} draft`);
    setText("activeBatchCount", activeBatches);
    document.getElementById("metricUsers").textContent = users.length;
    document.getElementById("metricUsersMeta").textContent = `${students} students, ${mentors} mentors`;
    document.getElementById("metricCourses").textContent = state.data.courses.length;
    document.getElementById("metricBatches").textContent = state.data.batches.length;
    document.getElementById("metricShop").textContent = state.data.shopItems.length;
    document.getElementById("metricTasks").textContent = state.data.batchTasks.length;
    document.getElementById("metricEnrollments").textContent = state.data.userCourses.length;
    document.getElementById("metricTasksMeta").textContent = `${state.data.taskSubmissions.length} submitted reviews`;
    document.getElementById("metricEnrollmentsMeta").textContent = `${state.data.progress.length} progress records`;

    renderDashboardUsers();
    renderCourseProgress();
    renderDashboardReviews();
    renderDashboardShop();
    renderDashboardTasks();
    renderAnalyticsChart();
  }

  // ─── REAL ANALYTICS CHART ────────────────────────────────────────────────
  function renderAnalyticsChart() {
    const range = state.analyticsRange || "daily";
    const now = new Date();

    let labels = [];
    let buckets = [];

    if (range === "daily") {
      // Last 30 days (today = index 29)
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        labels.push(
          i % 5 === 0 || i === 0
            ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
            : ""
        );
        buckets.push({
          start: startOfDay(d),
          end: endOfDay(d),
          label: d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" })
        });
      }
    } else if (range === "weekly") {
      // Last 12 weeks
      for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        labels.push("W" + getWeekNumber(weekStart));
        buckets.push({
          start: startOfDay(weekStart),
          end: endOfDay(weekEnd),
          label:
            weekStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) +
            " – " +
            weekEnd.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
        });
      }
    } else {
      // Monthly – last 12 months (full month)
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        labels.push(d.toLocaleDateString("en-IN", { month: "short" }));
        buckets.push({
          start: startOfDay(d),
          end: endOfDay(end),
          label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
        });
      }
    }

    // ── All tracked events (tagged by category) ───────────────────────────
    function eventsFrom(records, dateFields, tag) {
      return records
        .map((r) => {
          const raw = dateFields.reduce((v, f) => v || r[f], null);
          return raw ? { ts: new Date(raw), tag } : null;
        })
        .filter((e) => e && !isNaN(e.ts.getTime()));
    }

    const allEvents = [
      ...eventsFrom(state.data.users,           ["created_at"],                               "User signup"),
      ...eventsFrom(state.data.userCourses,      ["created_at", "enrolled_at"],               "Enrollment"),
      ...eventsFrom(state.data.taskSubmissions,  ["submitted_at", "created_at"],              "Task submission"),
      ...eventsFrom(state.data.projects,         ["submitted_at", "created_at"],              "Project upload"),
      ...eventsFrom(state.data.courses,          ["created_at"],                               "Course created"),
      ...eventsFrom(state.data.batches,          ["created_at"],                               "Batch created"),
      ...eventsFrom(state.data.announcements,    ["published_at", "created_at"],              "Announcement"),
      ...eventsFrom(state.data.chats,            ["created_at"],                               "Chat message")
    ];

    // ── Count per bucket ──────────────────────────────────────────────────
    const bucketData = buckets.map(({ start, end, label }) => {
      const events = allEvents.filter((e) => e.ts >= start && e.ts <= end);
      const byTag = events.reduce((acc, e) => {
        acc[e.tag] = (acc[e.tag] || 0) + 1;
        return acc;
      }, {});
      return { count: events.length, byTag, label };
    });

    const counts = bucketData.map((b) => b.count);
    const maxCount = Math.max(...counts, 1);

    // ── Y-axis ────────────────────────────────────────────────────────────
    const yMax = Math.ceil(maxCount / 5) * 5 || 5;
    const yMid = Math.round(yMax / 2);
    const axisEl = document.querySelector(".chart-axis");
    if (axisEl) {
      axisEl.innerHTML = [
        `<span>${yMax}</span>`,
        `<span>${yMid}</span>`,
        `<span>0</span>`
      ].join("");
    }

    // ── Bars ──────────────────────────────────────────────────────────────
    const barsEl = document.querySelector(".chart-bars");
    if (!barsEl) return;

    const barCount = buckets.length;
    barsEl.style.setProperty("--bar-count", barCount);

    barsEl.innerHTML = bucketData.map(({ count, byTag, label }, i) => {
      const pct   = Math.max(Math.round((count / maxCount) * 100), count > 0 ? 4 : 1);
      const isNow = range === "daily" && i === barCount - 1;

      // Build tooltip breakdown
      const breakdown = Object.entries(byTag)
        .map(([tag, n]) => `${tag}: ${n}`)
        .join(" | ");
      const tip = `${label}: ${count} event${count !== 1 ? "s" : ""}${breakdown ? " \u2014 " + breakdown : ""}`;

      return [
        `<span class="chart-bar-wrap" style="--bar-pct:${pct}%">`,
        `  <em class="chart-bar-count">${count}</em>`,
        `  <span class="chart-bar ${isNow ? "active" : count === 0 ? "zero" : ""}"`,
        `    style="--bar:${pct}%"`,
        `    title="${escapeAttr(tip)}"`,
        `    aria-label="${escapeAttr(tip)}">`,
        `  </span>`,
        `  <small>${escapeHtml(labels[i])}</small>`,
        `</span>`
      ].join("");
    }).join("");

    // ── Legend ────────────────────────────────────────────────────────────
    const legendEl = document.querySelector(".chart-legend");
    if (legendEl) {
      const tags = [
        "User signup", "Enrollment", "Task submission", "Project upload",
        "Course created", "Batch created", "Announcement", "Chat message"
      ];
      legendEl.innerHTML = tags.map((tag) => {
        const total = allEvents.filter((e) => e.tag === tag).length;
        return `<span class="legend-item"><b></b>${escapeHtml(tag)} <em>${total}</em></span>`;
      }).join("");
    }
  }

  function startOfDay(d) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  function endOfDay(d) {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r;
  }

  function getWeekNumber(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  }
  // ─────────────────────────────────────────────────────────────────────────

  function renderLiveBatches() {
    const list = document.getElementById("liveBatchList");
    if (!list) return;

    const rows = state.data.batches
      .filter((batch) => ["active", "published", "live"].includes(String(batch.status || "").toLowerCase()))
      .slice(0, 4);

    list.innerHTML = rows.length
      ? rows.map((batch) => {
        const course = findById(state.data.courses, batch.course_id);
        const mentor = findById(state.data.users, batch.mentor_id);
        const progress = Math.min(100, Math.max(0, Number(batch.progress || 0)));
        return `
          <div class="class-row">
            <span>${escapeHtml(initials(batch.name || course?.title || "BA"))}</span>
            <div>
              <strong>${escapeHtml(batch.name || "Untitled batch")}</strong>
              <small>${escapeHtml(course?.title || "No course")} · ${escapeHtml(mentor?.name || "Unassigned mentor")}</small>
            </div>
            <b>${progress}%</b>
          </div>
        `;
      }).join("")
      : emptyState("No active batches yet.");
  }

  function renderDashboardUsers() {
    const query = searchQuery("dashboardUserSearch");
    const rows = state.data.users
      .filter((user) => user.role === state.dashboardRole)
      .filter((user) => matchesUser(user, query))
      .slice(0, 6);

    document.getElementById("dashboardUsersList").innerHTML = rows.length
      ? rows.map((user) => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(user.name || "Unnamed")}</strong>
            <small>${escapeHtml(user.email || "")}</small>
          </div>
          <span class="badge ${roleColor(user.role)}">${escapeHtml(user.role || "user")}</span>
        </div>
      `).join("")
      : emptyState(`No ${state.dashboardRole}s match your query.`);
  }

  function renderCourseProgress() {
    const rows = state.data.courses.map((course) => {
      const enrolled = state.data.userCourses.filter((row) => row.course_id === course.id).length;
      const progressRows = state.data.progress.filter((row) => row.course_id === course.id);
      const avg = progressRows.length
        ? Math.round(progressRows.reduce((sum, row) => sum + estimateProgress(row), 0) / progressRows.length)
        : 0;
      return { course, enrolled, avg };
    });

    document.getElementById("courseProgressList").innerHTML = rows.length
      ? rows.map(({ course, enrolled, avg }) => `
        <div class="bar-row">
          <strong>${escapeHtml(course.title || "Untitled course")}</strong>
          <small>${enrolled} enrolled · Avg progress ${avg}%</small>
          <div class="bar-track"><div class="bar-fill" style="width:${avg}%"></div></div>
        </div>
      `).join("")
      : emptyState("No courses yet.");
  }

  function renderDashboardReviews() {
    const projects = state.data.projects.slice(0, 4);
    document.getElementById("dashboardReviewsList").innerHTML = projects.length
      ? projects.map(projectCardCompact).join("")
      : emptyState("No projects submitted yet.");
  }

  function renderDashboardShop() {
    const items = state.data.shopItems.slice(0, 4);
    document.getElementById("dashboardShopList").innerHTML = items.length
      ? items.map((item) => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(item.name || "Shop item")}</strong>
            <small>${Number(item.price || 0).toLocaleString("en-IN")} coins</small>
          </div>
          <button class="ghost-btn" type="button" data-edit-shop="${item.id}">Edit</button>
        </div>
      `).join("")
      : emptyState("No shop items yet.");

    document.querySelectorAll("[data-edit-shop]").forEach((button) => {
      button.addEventListener("click", () => openShopModal(findById(state.data.shopItems, button.dataset.editShop)));
    });
  }

  function renderAnnouncements() {
    const grid = document.getElementById("announcementsGrid");
    if (!grid) return;
    const query = searchQuery();
    const rows = state.data.announcements
      .filter((item) => matchesAnnouncement(item, query))
      .sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));

    grid.innerHTML = rows.length
      ? rows.map(announcementCard).join("")
      : emptyState(hasQuery(query) ? "No announcements match your search." : "No announcements published yet.");

    grid.querySelectorAll("[data-edit-announcement]").forEach((button) => {
      button.addEventListener("click", () => openAnnouncementModal(findById(state.data.announcements, button.dataset.editAnnouncement)));
    });
    grid.querySelectorAll("[data-delete-announcement]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("announcements", button.dataset.deleteAnnouncement));
    });
  }

  function announcementCard(item) {
    const author = findById(state.data.users, item.created_by);
    const target = announcementTargetLabel(item);
    return `
      <article class="announcement-card ${escapeAttr(item.priority || "normal")}">
        <div class="announcement-topline">
          <span class="badge ${announcementColor(item)}">${escapeHtml(announcementAudienceLabel(item))}</span>
          <span class="badge gray">${escapeHtml(item.priority || "normal")}</span>
        </div>
        <h3>${escapeHtml(item.title || "Announcement")}</h3>
        <p>${escapeHtml(item.message || "")}</p>
        <div class="announcement-meta">
          <span>${escapeHtml(target)}</span>
          <span>${escapeHtml(formatDate(item.published_at || item.created_at))}</span>
          <span>${escapeHtml(author?.name || author?.email || item.created_by_role || "Admin")}</span>
        </div>
        <div class="course-actions">
          <button class="ghost-btn" type="button" data-edit-announcement="${escapeAttr(item.id)}">Edit</button>
          <button class="danger-btn" type="button" data-delete-announcement="${escapeAttr(item.id)}">Delete</button>
        </div>
      </article>
    `;
  }

  function renderDashboardTasks() {
    const rows = state.data.batchTasks.slice(0, 5);
    document.getElementById("dashboardTasksList").innerHTML = rows.length
      ? rows.map((task) => {
        const batch = findById(state.data.batches, task.batch_id);
        const count = countSubmissionsForTask(task.id);
        return `
          <div class="list-row">
            <div>
              <strong>${escapeHtml(task.title || task.name || "Batch task")}</strong>
              <small>${escapeHtml(batch?.name || "No batch")} · ${count} submissions</small>
            </div>
            <span class="badge ${statusColor(task.status || "pending")}">${escapeHtml(task.status || "pending")}</span>
          </div>
        `;
      }).join("")
      : emptyState("No tasks created yet.");
  }

  function renderUsers() {
    const query = searchQuery("userSearch");
    const rows = state.data.users
      .filter((user) => state.userRole === "all" || user.role === state.userRole)
      .filter((user) => matchesUser(user, query));

    document.getElementById("usersTable").innerHTML = rows.length
      ? rows.map((user) => `
        <tr>
          <td><strong>${escapeHtml(user.name || "Unnamed")}</strong><br><small>${escapeHtml(user.username || "")}</small></td>
          <td>${escapeHtml(user.email || "")}</td>
          <td><span class="badge ${roleColor(user.role)}">${escapeHtml(user.role || "user")}</span></td>
          <td>${userLearningSummary(user)}</td>
          <td>${Number(user.coins || 0).toLocaleString("en-IN")}</td>
          <td>${formatDate(user.created_at)}</td>
          <td>
            <div class="row-actions">
              <button class="ghost-btn" type="button" data-view-user="${user.id}">View</button>
              <button class="soft-btn" type="button" data-edit-user="${user.id}">Edit</button>
            </div>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="7">${emptyState("No users found.")}</td></tr>`;

    document.querySelectorAll("[data-view-user]").forEach((button) => {
      button.addEventListener("click", () => openUserModal(findById(state.data.users, button.dataset.viewUser), false));
    });
    document.querySelectorAll("[data-edit-user]").forEach((button) => {
      button.addEventListener("click", () => openUserModal(findById(state.data.users, button.dataset.editUser), true));
    });
  }

  function renderCourses() {
    const grid = document.getElementById("coursesGrid");
    const query = searchQuery();
    const rows = state.data.courses.filter((course) => matchesText(query, course.title, course.description, course.category, course.instructor_name, course.status, course.price));
    grid.innerHTML = rows.length
      ? rows.map((course) => {
        const enrolled = courseAssignedUserIds(course, "student").size;
        const coursePrice = formatCoursePrice(course.price);
        return `
          <article class="course-card">
            <img class="course-thumb" src="${escapeAttr(course.thumbnail_url || "image/login/loginimg.png")}" alt="">
            <div class="course-body">
              <div class="list-row">
                <div>
                  <h3>${escapeHtml(course.title || "Untitled course")}</h3>
                  <small>${escapeHtml(course.category || "General")} · ${escapeHtml(course.duration || "No duration")}</small>
                </div>
                <span class="badge ${statusColor(course.status)}">${escapeHtml(course.status || "Draft")}</span>
              </div>
              <p>${escapeHtml(course.description || "No description added.")}</p>
              <small>${enrolled} students · ${escapeHtml(course.instructor_name || "Academy Mentor")} · ${escapeHtml(coursePrice)}</small>
              <div class="course-actions">
                <button class="primary-btn" type="button" data-assign-course="${course.id}">Assign</button>
                <button class="ghost-btn" type="button" data-edit-course="${course.id}">Edit</button>
                <button class="soft-btn" type="button" data-toggle-course="${course.id}">${course.status === "Published" ? "Unpublish" : "Publish"}</button>
                <button class="danger-btn" type="button" data-delete-course="${course.id}">Delete</button>
              </div>
            </div>
          </article>
        `;
      }).join("")
      : emptyState(hasQuery(query) ? "No courses match your search." : "No courses yet.");

    grid.querySelectorAll("[data-edit-course]").forEach((button) => {
      button.addEventListener("click", () => openCourseModal(findById(state.data.courses, button.dataset.editCourse)));
    });
    grid.querySelectorAll("[data-assign-course]").forEach((button) => {
      button.addEventListener("click", () => openCourseAssignmentModal(findById(state.data.courses, button.dataset.assignCourse)));
    });
    grid.querySelectorAll("[data-toggle-course]").forEach((button) => {
      button.addEventListener("click", () => toggleCourseStatus(button.dataset.toggleCourse));
    });
    grid.querySelectorAll("[data-delete-course]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("courses", button.dataset.deleteCourse));
    });
  }

  function renderBatches() {
    const grid = document.getElementById("batchesGrid");
    const query = searchQuery();
    const rows = state.data.batches.filter((batch) => {
      const course = findById(state.data.courses, batch.course_id);
      const mentor = findById(state.data.users, batch.mentor_id);
      return matchesText(query, batch.name, batch.status, course?.title, mentor?.name);
    });
    grid.innerHTML = rows.length
      ? rows.map((batch) => {
        const course = findById(state.data.courses, batch.course_id);
        const mentor = findById(state.data.users, batch.mentor_id);
        const enrolled = state.data.users.filter((user) => user.batch_id === batch.id).length || Number(batch.enrolled_count || 0);
        return `
          <article class="batch-card">
            <div class="panel-heading">
              <div>
                <h3>${escapeHtml(batch.name || "Untitled batch")}</h3>
                <p>${escapeHtml(course?.title || "No course assigned")}</p>
              </div>
              <span class="badge ${statusColor(batch.status)}">${escapeHtml(batch.status || "draft")}</span>
            </div>
            <div class="batch-meta">
              <div><span>Mentor</span><strong>${escapeHtml(mentor?.name || "Unassigned")}</strong></div>
              <div><span>Students</span><strong>${enrolled}</strong></div>
              <div><span>Period</span><strong>${escapeHtml(batchPeriod(batch))}</strong></div>
              <div><span>Progress</span><strong>${Math.round(Number(batch.progress || 0))}%</strong></div>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Number(batch.progress || 0))}%"></div></div>
            <div class="batch-actions">
              <button class="ghost-btn" type="button" data-edit-batch="${batch.id}">Edit</button>
              <button class="soft-btn" type="button" data-open-chat="${batch.id}">Chat</button>
              <button class="danger-btn" type="button" data-delete-batch="${batch.id}">Delete</button>
            </div>
          </article>
        `;
      }).join("")
      : emptyState(hasQuery(query) ? "No batches match your search." : "No batches yet.");

    grid.querySelectorAll("[data-edit-batch]").forEach((button) => {
      button.addEventListener("click", () => openBatchModal(findById(state.data.batches, button.dataset.editBatch)));
    });
    grid.querySelectorAll("[data-open-chat]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedBatchId = button.dataset.openChat;
        setView("chat");
        renderChatBatches();
        renderChat();
      });
    });
    grid.querySelectorAll("[data-delete-batch]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("batches", button.dataset.deleteBatch));
    });
  }

  function renderEnrollments() {
    const table = document.getElementById("enrollmentsTable");
    if (!table) return;
    const query = searchQuery();
    const rows = state.data.userCourses.filter((enrollment) => {
      const user = enrollmentUser(enrollment);
      // Only show students — mentors/admins enrolled in courses should not appear here
      if (!user || String(user.role).toLowerCase() !== "student") return false;
      if (String(user.email || enrollment.student_email || "").toLowerCase() === "adolf@gmail.com" || sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")) return false;
      const course = enrollmentCourse(enrollment);
      const batch = enrollmentBatch(enrollment, user);
      return matchesText(query, user?.name, user?.email, course?.title, batch?.name, enrollment.status);
    });

    table.innerHTML = rows.length
      ? rows.map((enrollment) => {
        const user = enrollmentUser(enrollment);
        const course = enrollmentCourse(enrollment);
        const batch = enrollmentBatch(enrollment, user);
        const progress = enrollmentProgress(enrollment);
        return `
          <tr>
            <td><strong>${escapeHtml(user?.name || enrollment.student_name || "Unknown learner")}</strong><br><small>${escapeHtml(user?.email || enrollment.student_email || "")}</small></td>
            <td>${escapeHtml(course?.title || enrollment.course_name || "Unassigned course")}</td>
            <td>${escapeHtml(batch?.name || "No batch")}</td>
            <td>
              <strong>${progress}%</strong>
              <div class="bar-track"><div class="bar-fill" style="width:${progress}%"></div></div>
            </td>
            <td><span class="badge ${statusColor(enrollment.status || "active")}">${escapeHtml(enrollment.status || "active")}</span></td>
            <td>
              <div class="row-actions">
                <button class="ghost-btn" type="button" data-edit-enrollment="${escapeAttr(enrollment._key)}">Edit</button>
                <button class="danger-btn" type="button" data-delete-enrollment="${escapeAttr(enrollment._key)}">Remove</button>
              </div>
            </td>
          </tr>
        `;
      }).join("")
      : `<tr><td colspan="6">${emptyState(hasQuery(query) ? "No enrollments match your search." : "No enrollments yet.")}</td></tr>`;

    table.querySelectorAll("[data-edit-enrollment]").forEach((button) => {
      button.addEventListener("click", () => openEnrollmentModal(findEnrollmentByKey(button.dataset.editEnrollment)));
    });
    table.querySelectorAll("[data-delete-enrollment]").forEach((button) => {
      button.addEventListener("click", () => deleteEnrollment(findEnrollmentByKey(button.dataset.deleteEnrollment)));
    });
  }

  function renderTasks() {
    const grid = document.getElementById("tasksGrid");
    if (!grid) return;
    const query = searchQuery();
    const rows = state.data.batchTasks.filter((task) => {
      const batch = findById(state.data.batches, task.batch_id);
      const course = findById(state.data.courses, batch?.course_id || task.course_id);
      return matchesText(query, task.title, task.name, task.description, task.status, batch?.name, course?.title);
    });

    grid.innerHTML = rows.length
      ? rows.map((task) => {
        const batch = findById(state.data.batches, task.batch_id);
        const course = findById(state.data.courses, batch?.course_id || task.course_id);
        const submissions = countSubmissionsForTask(task.id);
        return `
          <article class="task-card">
            <div class="panel-heading">
              <div>
                <h3>${escapeHtml(task.title || task.name || "Untitled task")}</h3>
                <p>${escapeHtml(batch?.name || "No batch")} · ${escapeHtml(course?.title || "No course")}</p>
              </div>
              <span class="badge ${statusColor(task.status || "pending")}">${escapeHtml(task.status || "pending")}</span>
            </div>
            <p>${escapeHtml(task.description || "No instructions added.")}</p>
            <div class="task-meta">
              <div><span>Due</span><strong>${formatDate(task.due_date || task.deadline)}</strong></div>
              <div><span>Submissions</span><strong>${submissions}</strong></div>
              <div><span>Drive</span><strong>${task.drive_link ? "Linked" : "Missing"}</strong></div>
              <div><span>Created</span><strong>${formatDate(task.created_at)}</strong></div>
            </div>
            <div class="row-actions">
              <button class="ghost-btn" type="button" data-edit-task="${task.id}">Edit</button>
              <button class="soft-btn" type="button" data-review-task="${task.id}">Submissions</button>
              <button class="danger-btn" type="button" data-delete-task="${task.id}">Delete</button>
            </div>
          </article>
        `;
      }).join("")
      : emptyState(hasQuery(query) ? "No tasks match your search." : "No batch tasks yet.");

    grid.querySelectorAll("[data-edit-task]").forEach((button) => {
      button.addEventListener("click", () => openTaskModal(findById(state.data.batchTasks, button.dataset.editTask)));
    });
    grid.querySelectorAll("[data-review-task]").forEach((button) => {
      button.addEventListener("click", () => openTaskSubmissionsModal(button.dataset.reviewTask));
    });
    grid.querySelectorAll("[data-delete-task]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("batch_tasks", button.dataset.deleteTask));
    });
  }

  function renderChatBatches() {
    const list = document.getElementById("chatBatchList");
    const query = searchQuery();
    const rows = state.data.batches.filter((batch) => matchesText(query, batch.name, batch.status));
    list.innerHTML = rows.length
      ? rows.map((batch) => {
        const count = state.data.chats.filter((chat) => chat.batch_id === batch.id).length;
        return `
          <div class="list-row ${batch.id === state.selectedBatchId ? "active" : ""}" data-select-batch="${batch.id}">
            <div>
              <strong>${escapeHtml(batch.name || "Untitled batch")}</strong>
              <small>${count} messages</small>
            </div>
            <span class="badge blue">Open</span>
          </div>
        `;
      }).join("")
      : emptyState(hasQuery(query) ? "No batches match your search." : "No batches available.");

    list.querySelectorAll("[data-select-batch]").forEach((row) => {
      row.addEventListener("click", () => {
        state.selectedBatchId = row.dataset.selectBatch;
        renderChatBatches();
        renderChat();
      });
    });
  }

  function renderChat() {
    const batch = findById(state.data.batches, state.selectedBatchId);
    document.getElementById("chatBatchTitle").textContent = batch?.name || "Batch Chat";
    document.getElementById("chatBatchSubtitle").textContent = batch ? "Moderate messages and reply as admin" : "Choose a batch";

    const messages = state.data.chats
      .filter((chat) => chat.batch_id === state.selectedBatchId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    document.getElementById("chatFeed").innerHTML = messages.length
      ? messages.map((chat) => {
        const user = findById(state.data.users, chat.user_id);
        const isReply = Boolean(chat.parent_id);
        return `
          <article class="chat-message ${isReply ? "reply" : ""}">
            <div class="chat-message-head">
              <div>
                <strong>${escapeHtml(user?.name || "Unknown")}</strong>
                <small>${formatDate(chat.created_at)}</small>
              </div>
              <span class="badge ${roleColor(user?.role)}">${escapeHtml(user?.role || "user")}</span>
            </div>
            <p>${escapeHtml(chat.message || "")}</p>
            <div class="row-actions">
              <button class="ghost-btn" type="button" data-reply-chat="${chat.id}">Reply</button>
              <button class="danger-btn" type="button" data-delete-chat="${chat.id}">Delete</button>
            </div>
          </article>
        `;
      }).join("")
      : emptyState(batch ? "No messages in this batch yet." : "Select a batch to view messages.");

    document.querySelectorAll("[data-reply-chat]").forEach((button) => {
      button.addEventListener("click", () => openReplyModal(button.dataset.replyChat));
    });
    document.querySelectorAll("[data-delete-chat]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("batch_chats", button.dataset.deleteChat));
    });
  }

  function renderShop() {
    const grid = document.getElementById("shopGrid");
    const query = searchQuery();
    const rows = state.data.shopItems.filter((item) => matchesText(query, item.name, item.price));
    grid.innerHTML = rows.length
      ? rows.map((item) => `
        <article class="shop-card">
          <img class="shop-thumb" src="${escapeAttr(item.image_url || "image/icon/star.png")}" alt="">
          <div>
            <h3>${escapeHtml(item.name || "Shop item")}</h3>
            <p>${Number(item.price || 0).toLocaleString("en-IN")} coins</p>
            <small>Created ${formatDate(item.created_at)}</small>
            <div class="shop-actions">
              <button class="ghost-btn" type="button" data-edit-shop="${item.id}">Edit</button>
              <button class="danger-btn" type="button" data-delete-shop="${item.id}">Delete</button>
            </div>
          </div>
        </article>
      `).join("")
      : emptyState(hasQuery(query) ? "No shop items match your search." : "No shop items yet.");

    grid.querySelectorAll("[data-edit-shop]").forEach((button) => {
      button.addEventListener("click", () => openShopModal(findById(state.data.shopItems, button.dataset.editShop)));
    });
    grid.querySelectorAll("[data-delete-shop]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("shop_items", button.dataset.deleteShop));
    });
  }

  function renderReviews() {
    const query = searchQuery();
    const projects = state.data.projects.filter((project) => matchesText(query, project.title, project.student_name, project.batch_name, project.status));
    const submissions = state.data.taskSubmissions.filter((submission) => matchesText(query, submission.title, submission.student_name, submission.student_email, submission.status));

    document.getElementById("projectsList").innerHTML = projects.length
      ? projects.map(projectCardCompact).join("")
      : emptyState(hasQuery(query) ? "No projects match your search." : "No project submissions.");

    document.getElementById("submissionsList").innerHTML = submissions.length
      ? submissions.map((submission) => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(submission.title || "Task submission")}</strong>
            <small>${escapeHtml(submission.student_name || "Unknown student")} · ${formatDate(submission.submitted_at)}</small>
          </div>
          <div class="row-actions">
            <span class="badge ${statusColor(submission.status)}">${escapeHtml(submission.status || "pending")}</span>
            <button class="ghost-btn" type="button" data-review-submission="${submission.id}">Review</button>
          </div>
        </div>
      `).join("")
      : emptyState(hasQuery(query) ? "No submissions match your search." : "No task submissions.");

    document.querySelectorAll("[data-review-project]").forEach((button) => {
      button.addEventListener("click", () => openProjectReviewModal(findById(state.data.projects, button.dataset.reviewProject)));
    });
    document.querySelectorAll("[data-review-submission]").forEach((button) => {
      button.addEventListener("click", () => openSubmissionReviewModal(findById(state.data.taskSubmissions, button.dataset.reviewSubmission)));
    });
  }

  function projectCardCompact(project) {
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(project.title || "Project")}</strong>
          <small>${escapeHtml(project.student_name || "Unknown student")} · ${formatDate(project.submission_date)}</small>
        </div>
        <div class="row-actions">
          <span class="badge ${statusColor(project.status)}">${escapeHtml(project.status || "pending")}</span>
          <button class="ghost-btn" type="button" data-review-project="${project.id}">Review</button>
        </div>
      </div>
    `;
  }

  function openCourseModal(course = null) {
    const isEdit = Boolean(course);
    openModal(`${isEdit ? "Edit" : "Add"} Course`, `
      <form class="form-grid" id="courseForm">
        <div class="form-row">
          <label for="courseTitle">Title</label>
          <input id="courseTitle" required value="${escapeAttr(course?.title || "")}">
        </div>
        <div class="form-row">
          <label for="courseDescription">Description</label>
          <textarea id="courseDescription">${escapeHtml(course?.description || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="courseCategory">Category</label>
            <input id="courseCategory" value="${escapeAttr(course?.category || "")}">
          </div>
          <div>
            <label for="courseDuration">Duration</label>
            <input id="courseDuration" value="${escapeAttr(course?.duration || "")}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="coursePrice">Price</label>
            <input id="coursePrice" type="number" min="0" step="1" value="${escapeAttr(course?.price ?? 0)}" placeholder="0">
          </div>
          <div>
            <label for="courseInstructor">Instructor</label>
            <input id="courseInstructor" value="${escapeAttr(course?.instructor_name || "")}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="courseStatus">Status</label>
            <select id="courseStatus">
              ${option("Published", course?.status)}
              ${option("Draft", course?.status)}
              ${option("Archived", course?.status)}
            </select>
          </div>
          <div>
            <label for="courseThumbnail">Thumbnail URL</label>
            <input id="courseThumbnail" value="${escapeAttr(course?.thumbnail_url || "")}">
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    document.getElementById("courseForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const price = Number(valueOf("coursePrice") || 0);
      const payload = {
        title: valueOf("courseTitle"),
        description: valueOf("courseDescription"),
        category: valueOf("courseCategory") || null,
        duration: valueOf("courseDuration") || null,
        price: Number.isFinite(price) ? Math.max(0, price) : 0,
        instructor_name: valueOf("courseInstructor") || "Academy Mentor",
        status: valueOf("courseStatus"),
        thumbnail_url: valueOf("courseThumbnail") || null,
        created_by_admin: true
      };
      await saveCourseRecord(payload, course?.id);
    });
  }

  function openCourseAssignmentModal(course) {
    if (!course) return;
    const students = state.data.users.filter((user) => (
      user.role === "student"
      && String(user.email).toLowerCase() !== "adolf@gmail.com"
      && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")
    ));
    const mentors = state.data.users.filter((user) => user.role === "mentor");
    const assignedStudents = courseAssignedUserIds(course, "student");
    const assignedMentors = courseAssignedUserIds(course, "mentor");

    openModal("Course Assignment", `
      <form class="assignment-form" id="courseAssignmentForm">
        <div class="assignment-course-head">
          <span class="badge ${statusColor(course.status)}">${escapeHtml(course.status || "Draft")}</span>
          <h3>${escapeHtml(course.title || "Untitled course")}</h3>
          <p>${escapeHtml(course.category || "General")} · ${escapeHtml(formatCoursePrice(course.price))}</p>
        </div>

        <section class="assignment-section">
          <div class="assignment-section-head">
            <h4>Assign Students</h4>
            <small>${students.length} available</small>
          </div>
          <div class="assignment-list">
            ${students.length ? students.map((user) => assignmentOption(user, assignedStudents.has(String(user.id)), "assignedStudents")).join("") : `<div class="assignment-empty">No student users found.</div>`}
          </div>
        </section>

        <section class="assignment-section">
          <div class="assignment-section-head">
            <h4>Assign Mentors</h4>
            <small>${mentors.length} available</small>
          </div>
          <div class="assignment-list">
            ${mentors.length ? mentors.map((user) => assignmentOption(user, assignedMentors.has(String(user.id)), "assignedMentors")).join("") : `<div class="assignment-empty">No mentor users found.</div>`}
          </div>
        </section>

        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Assignment</button>
        </div>
      </form>
    `);

    document.getElementById("courseAssignmentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedStudentIds = checkedValues("assignedStudents");
      const selectedMentorIds = checkedValues("assignedMentors");
      await saveCourseAssignments(course, selectedStudentIds, selectedMentorIds);
    });
  }

  function openBatchModal(batch = null) {
    const mentors = state.data.users.filter((user) => user.role === "mentor" || user.role === "admin");
    const isEdit = Boolean(batch);
    openModal(`${isEdit ? "Edit" : "Add"} Batch`, `
      <form class="form-grid" id="batchForm">
        <div class="form-row">
          <label for="batchName">Batch Name</label>
          <input id="batchName" required value="${escapeAttr(batch?.name || "")}">
        </div>
        <div class="form-row two">
          <div>
            <label for="batchCourse">Course</label>
            <select id="batchCourse" required>
              ${state.data.courses.map((course) => option(course.id, batch?.course_id, course.title)).join("")}
            </select>
          </div>
          <div>
            <label for="batchMentor">Mentor</label>
            <select id="batchMentor">
              <option value="">Unassigned</option>
              ${mentors.map((user) => option(user.id, batch?.mentor_id, user.name)).join("")}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="batchCapacity">Capacity</label>
            <input id="batchCapacity" type="number" min="0" value="${escapeAttr(batch?.capacity || "")}">
          </div>
          <div>
            <label for="batchStatus">Status</label>
            <select id="batchStatus">
              ${option("draft", batch?.status)}
              ${option("active", batch?.status)}
              ${option("completed", batch?.status)}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="batchStartDate">Starting Period</label>
            <input id="batchStartDate" type="date" value="${escapeAttr(toDateInput(batch?.start_date))}">
          </div>
          <div>
            <label for="batchEndDate">Ending Period</label>
            <input id="batchEndDate" type="date" value="${escapeAttr(toDateInput(batch?.end_date))}">
          </div>
        </div>
        <div class="form-row">
          <label for="batchProgress">Progress</label>
          <input id="batchProgress" type="number" min="0" max="100" value="${escapeAttr(batch?.progress || 0)}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    document.getElementById("batchForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: valueOf("batchName"),
        course_id: valueOf("batchCourse"),
        mentor_id: valueOf("batchMentor") || null,
        capacity: numberOrNull("batchCapacity"),
        status: valueOf("batchStatus"),
        start_date: valueOf("batchStartDate") || null,
        end_date: valueOf("batchEndDate") || null,
        progress: numberOrNull("batchProgress") || 0
      };
      await upsertRecord("batches", payload, batch?.id);
    });
  }

  function openEnrollmentModal(enrollment = null) {
    const students = state.data.users.filter((user) => (
      user.role === "student"
      && String(user.email).toLowerCase() !== "adolf@gmail.com"
      && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")
    ));
    const user = enrollmentUser(enrollment || {});
    const batch = enrollmentBatch(enrollment || {}, user);
    const course = enrollmentCourse(enrollment || {});
    const isEdit = Boolean(enrollment);

    openModal(`${isEdit ? "Edit" : "Assign"} Enrollment`, `
      <form class="form-grid" id="enrollmentForm">
        <div class="form-row two">
          <div>
            <label for="enrollmentUser">Student</label>
            <select id="enrollmentUser" required>
              ${students.map((student) => option(student.id, user?.id, student.name)).join("")}
            </select>
          </div>
          <div>
            <label for="enrollmentCourse">Course</label>
            <select id="enrollmentCourse" required>
              ${state.data.courses.map((item) => option(item.id, course?.id, item.title)).join("")}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="enrollmentBatch">Batch</label>
            <select id="enrollmentBatch">
              <option value="">No batch</option>
              ${state.data.batches.map((item) => option(item.id, batch?.id, item.name)).join("")}
            </select>
          </div>
          <div>
            <label for="enrollmentStatus">Status</label>
            <select id="enrollmentStatus">
              ${option("active", enrollment?.status)}
              ${option("completed", enrollment?.status)}
              ${option("paused", enrollment?.status)}
              ${option("cancelled", enrollment?.status)}
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Assign"}</button>
        </div>
      </form>
    `);

    document.getElementById("enrollmentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveEnrollment({
        user_id: valueOf("enrollmentUser"),
        course_id: valueOf("enrollmentCourse"),
        status: valueOf("enrollmentStatus") || "active"
      }, valueOf("enrollmentBatch"), enrollment);
    });
  }

  function openUserCreateModal() {
    const defaultRole = state.userRole !== "all" ? state.userRole : "student";
    openModal("Add User", `
      <form class="form-grid" id="createUserForm">
        <div class="form-row two">
          <div>
            <label for="createUserName">Name</label>
            <input id="createUserName" required placeholder="Student or mentor name">
          </div>
          <div>
            <label for="createUserEmail">Email</label>
            <input id="createUserEmail" type="email" required placeholder="name@example.com">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="createUserPassword">Login Password</label>
            <input id="createUserPassword" required placeholder="Temporary password">
          </div>
          <div>
            <label for="createUserRole">Role</label>
            <select id="createUserRole">
              ${option("student", defaultRole)}
              ${option("mentor", defaultRole)}
              ${option("admin", defaultRole)}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="createUserUsername">Username</label>
            <input id="createUserUsername" placeholder="Optional">
          </div>
          <div>
            <label for="createUserPhone">Phone</label>
            <input id="createUserPhone" type="tel" placeholder="Optional">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="createUserCourse">Assign Course</label>
            <select id="createUserCourse">
              <option value="">No course yet</option>
              ${state.data.courses.map((course) => option(course.id, "", course.title || course.name || "Course")).join("")}
            </select>
          </div>
          <div>
            <label for="createUserBatch">Assign Batch</label>
            <select id="createUserBatch">
              <option value="">No batch</option>
              ${state.data.batches.map((batch) => option(batch.id, "", batch.name || "Batch")).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label for="createUserCoins">Starting Coins</label>
          <input id="createUserCoins" type="number" min="0" value="0">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Create User</button>
        </div>
      </form>
    `);

    document.getElementById("createUserForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveAdminUser({
          name: valueOf("createUserName"),
          email: valueOf("createUserEmail"),
          password: valueOf("createUserPassword"),
          role: valueOf("createUserRole"),
          username: valueOf("createUserUsername") || null,
          phone: valueOf("createUserPhone") || null,
          coins: Number(valueOf("createUserCoins") || 0)
        }, {
          courseId: valueOf("createUserCourse") || null,
          batchId: valueOf("createUserBatch") || null
        });
        closeModal();
        await loadAllData();
        showAlert("User added and assigned.");
      } catch (error) {
        showAlert(error.message || "Unable to add user.", true);
      }
    });
  }

  function openUserImportModal() {
    openModal("Bulk Import Users", `
      <form class="form-grid" id="userImportForm">
        <div class="import-callout">
          CSV headers supported: name, email, password, role, phone, username, course, course_id, batch, batch_id, coins.
        </div>
        <div class="form-row">
          <label for="userCsvFile">CSV File</label>
          <input id="userCsvFile" type="file" accept=".csv,text/csv" required>
        </div>
        <div class="form-row two">
          <div>
            <label for="importDefaultRole">Default Role</label>
            <select id="importDefaultRole">
              ${option("student", "student")}
              ${option("mentor", "student")}
              ${option("admin", "student")}
            </select>
          </div>
          <div>
            <label for="importDefaultPassword">Default Password</label>
            <input id="importDefaultPassword" value="123456">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="importDefaultCourse">Default Course</label>
            <select id="importDefaultCourse">
              <option value="">Use CSV course</option>
              ${state.data.courses.map((course) => option(course.id, "", course.title || course.name || "Course")).join("")}
            </select>
          </div>
          <div>
            <label for="importDefaultBatch">Default Batch</label>
            <select id="importDefaultBatch">
              <option value="">Use CSV batch</option>
              ${state.data.batches.map((batch) => option(batch.id, "", batch.name || "Batch")).join("")}
            </select>
          </div>
        </div>
        <div class="csv-preview" id="csvPreview">Choose a CSV file to preview the first rows.</div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Import Users</button>
        </div>
      </form>
    `);

    let parsedRows = [];
    const fileInput = document.getElementById("userCsvFile");
    const preview = document.getElementById("csvPreview");
    fileInput.addEventListener("change", async () => {
      parsedRows = await readUserCsv(fileInput.files?.[0]);
      preview.innerHTML = userCsvPreview(parsedRows);
    });

    document.getElementById("userImportForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        if (!parsedRows.length) parsedRows = await readUserCsv(fileInput.files?.[0]);
        const result = await importUsersFromCsv(parsedRows, {
          role: valueOf("importDefaultRole") || "student",
          password: valueOf("importDefaultPassword") || "123456",
          courseId: valueOf("importDefaultCourse") || null,
          batchId: valueOf("importDefaultBatch") || null
        });
        closeModal();
        await loadAllData();
        showAlert(`Imported ${result.created} user${result.created === 1 ? "" : "s"}${result.failed ? `, ${result.failed} skipped` : ""}.`, Boolean(result.failed));
      } catch (error) {
        showAlert(error.message || "Unable to import users.", true);
      }
    });
  }

  function openTaskModal(task = null) {
    const isEdit = Boolean(task);
    openModal(`${isEdit ? "Edit" : "Create"} Batch Task`, `
      <form class="form-grid" id="taskForm">
        <div class="form-row">
          <label for="taskTitle">Title</label>
          <input id="taskTitle" required value="${escapeAttr(task?.title || task?.name || "")}">
        </div>
        <div class="form-row">
          <label for="taskDescription">Instructions</label>
          <textarea id="taskDescription">${escapeHtml(task?.description || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="taskBatch">Batch</label>
            <select id="taskBatch" required>
              ${state.data.batches.map((batch) => option(batch.id, task?.batch_id, batch.name)).join("")}
            </select>
          </div>
          <div>
            <label for="taskDueDate">Due Date</label>
            <input id="taskDueDate" type="date" value="${escapeAttr(toDateInput(task?.due_date || task?.deadline))}">
          </div>
        </div>
        <div class="form-row">
          <label for="taskStatus">Status</label>
          <select id="taskStatus">
            ${option("draft", task?.status)}
            ${option("active", task?.status)}
            ${option("closed", task?.status)}
          </select>
        </div>
        <div class="form-row">
          <label for="taskDriveLink">Drive Link</label>
          <input id="taskDriveLink" type="url" placeholder="https://drive.google.com/..." value="${escapeAttr(task?.drive_link || "")}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    document.getElementById("taskForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await upsertRecord("batch_tasks", {
        title: valueOf("taskTitle"),
        description: valueOf("taskDescription"),
        batch_id: valueOf("taskBatch"),
        due_date: valueOf("taskDueDate") || null,
        drive_link: valueOf("taskDriveLink") || null,
        status: valueOf("taskStatus")
      }, task?.id);
    });
  }

  function openTaskSubmissionsModal(taskId) {
    const task = findById(state.data.batchTasks, taskId);
    const submissions = state.data.taskSubmissions.filter((submission) => String(submission.task_id || submission.batch_task_id) === String(taskId));
    openModal("Task Submissions", `
      <div class="compact-list">
        ${submissions.length ? submissions.map((submission) => `
          <div class="list-row">
            <div>
              <strong>${escapeHtml(submission.title || task?.title || "Submission")}</strong>
              <small>${escapeHtml(submission.student_name || submission.student_email || "Unknown student")} · ${formatDate(submission.submitted_at || submission.created_at)}</small>
            </div>
            <div class="row-actions">
              <span class="badge ${statusColor(submission.status || "pending")}">${escapeHtml(submission.status || "pending")}</span>
              <button class="ghost-btn" type="button" data-review-submission="${submission.id}">Review</button>
            </div>
          </div>
        `).join("") : emptyState("No submissions for this task yet.")}
      </div>
    `);

    modalBody.querySelectorAll("[data-review-submission]").forEach((button) => {
      button.addEventListener("click", () => openSubmissionReviewModal(findById(state.data.taskSubmissions, button.dataset.reviewSubmission)));
    });
  }

  function openShopModal(item = null) {
    const isEdit = Boolean(item);
    openModal(`${isEdit ? "Edit" : "Add"} Shop Item`, `
      <form class="form-grid" id="shopForm">
        <div class="form-row">
          <label for="shopName">Item Name</label>
          <input id="shopName" required value="${escapeAttr(item?.name || "")}">
        </div>
        <div class="form-row">
          <label for="shopPrice">Price (coins)</label>
          <input id="shopPrice" type="number" min="0" required value="${escapeAttr(item?.price || 0)}">
        </div>
        <div class="form-row">
          <label for="shopImage">Image URL / Data URL</label>
          <textarea id="shopImage">${escapeHtml(item?.image_url || "")}</textarea>
        </div>
        <div class="form-row">
          <label for="shopImageFile">Select Image</label>
          <input id="shopImageFile" type="file" accept="image/*">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    document.getElementById("shopImageFile").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        document.getElementById("shopImage").value = reader.result;
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("shopForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        name: valueOf("shopName"),
        price: Number(valueOf("shopPrice") || 0),
        image_url: valueOf("shopImage")
      };
      await upsertRecord("shop_items", payload, item?.id);
    });
  }

  function openAnnouncementModal(item = null) {
    const isEdit = Boolean(item);
    openModal(`${isEdit ? "Edit" : "Create"} Announcement`, `
      <form class="form-grid" id="announcementForm">
        <div class="form-row">
          <label for="announcementTitle">Title</label>
          <input id="announcementTitle" value="${escapeAttr(item?.title || "")}" placeholder="Optional headline">
        </div>
        <div class="form-row">
          <label for="announcementMessage">Announcement message</label>
          <textarea id="announcementMessage" required placeholder="Write the announcement...">${escapeHtml(item?.message || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="announcementAudience">Audience</label>
            <select id="announcementAudience">
              ${option("all", item?.audience, "Students and mentors")}
              ${option("students", item?.audience, "Students only")}
              ${option("mentors", item?.audience, "Mentors only")}
              ${option("batch", item?.audience, "Specific batch")}
              ${option("course", item?.audience, "Specific course")}
            </select>
          </div>
          <div>
            <label for="announcementPriority">Priority</label>
            <select id="announcementPriority">
              ${option("normal", item?.priority, "Normal")}
              ${option("important", item?.priority, "Important")}
              ${option("urgent", item?.priority, "Urgent")}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="announcementBatch">Batch target</label>
            <select id="announcementBatch">
              <option value="">No batch target</option>
              ${state.data.batches.map((batch) => option(batch.id, item?.batch_id, batch.name || "Batch")).join("")}
            </select>
          </div>
          <div>
            <label for="announcementCourse">Course target</label>
            <select id="announcementCourse">
              <option value="">No course target</option>
              ${state.data.courses.map((course) => option(course.id, item?.course_id, course.title || "Course")).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label for="announcementExpiry">Expires on</label>
          <input id="announcementExpiry" type="date" value="${escapeAttr(toDateInput(item?.expires_at))}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Send"}</button>
        </div>
      </form>
    `);

    const syncTargets = () => {
      const audience = valueOf("announcementAudience") || "all";
      const batchSelect = document.getElementById("announcementBatch");
      const courseSelect = document.getElementById("announcementCourse");
      if (batchSelect) batchSelect.disabled = audience !== "batch";
      if (courseSelect) courseSelect.disabled = audience !== "course";
    };
    document.getElementById("announcementAudience")?.addEventListener("change", syncTargets);
    syncTargets();

    document.getElementById("announcementForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const audience = valueOf("announcementAudience") || "all";
      const batchId = valueOf("announcementBatch");
      const courseId = valueOf("announcementCourse");
      if (audience === "batch" && !batchId) {
        showAlert("Choose a batch for this announcement.", true);
        return;
      }
      if (audience === "course" && !courseId) {
        showAlert("Choose a course for this announcement.", true);
        return;
      }

      const expiry = valueOf("announcementExpiry");
      const payload = {
        title: valueOf("announcementTitle") || null,
        message: valueOf("announcementMessage"),
        audience,
        priority: valueOf("announcementPriority") || "normal",
        batch_id: audience === "batch" ? batchId : null,
        course_id: audience === "course" ? courseId : null,
        created_by: item?.created_by || state.admin?.id || null,
        created_by_role: item?.created_by_role || "admin",
        status: "published",
        published_at: item?.published_at || new Date().toISOString(),
        expires_at: expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null,
        updated_at: new Date().toISOString()
      };
      await upsertRecord("announcements", payload, item?.id);
    });
  }

  function openUserModal(user, editable) {
    if (!user) return;
    const primaryEnrollment = state.data.userCourses.find((row) => String(row.user_id || row.student_id || "") === String(user.id));
    const selectedCourseId = primaryEnrollment?.course_id || arrayFrom(user.course_ids)[0] || "";
    const selectedBatchId = primaryEnrollment?.batch_id || user.batch_id || "";
    const disabled = editable ? "" : "disabled";
    openModal(editable ? "Edit User" : "User Details", `
      <form class="form-grid" id="userForm">
        <div class="form-row two">
          <div>
            <label for="userName">Name</label>
            <input id="userName" value="${escapeAttr(user.name || "")}" ${disabled} required>
          </div>
          <div>
            <label for="userEmail">Email</label>
            <input id="userEmail" type="email" value="${escapeAttr(user.email || "")}" ${disabled} required>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="userUsername">Username</label>
            <input id="userUsername" value="${escapeAttr(user.username || "")}" ${disabled}>
          </div>
          <div>
            <label for="userPhone">Phone</label>
            <input id="userPhone" type="tel" value="${escapeAttr(user.phone || "")}" ${disabled}>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="userRole">Role</label>
            <select id="userRole" ${disabled}>
              ${option("student", user.role)}
              ${option("mentor", user.role)}
              ${option("admin", user.role)}
            </select>
          </div>
          <div>
            <label for="userCoins">Coins</label>
            <input id="userCoins" type="number" min="0" value="${escapeAttr(user.coins || 0)}" ${disabled}>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="userCourse">Course</label>
            <select id="userCourse" ${disabled}>
              <option value="">No course</option>
              ${state.data.courses.map((course) => option(course.id, selectedCourseId, course.title || course.name || "Course")).join("")}
            </select>
          </div>
          <div>
            <label for="userBatch">Batch</label>
            <select id="userBatch" ${disabled}>
              <option value="">No batch</option>
              ${state.data.batches.map((batch) => option(batch.id, selectedBatchId, batch.name || "Batch")).join("")}
            </select>
          </div>
        </div>
        ${editable ? `
          <div class="form-row">
            <label for="userPassword">Reset Password</label>
            <input id="userPassword" placeholder="Leave blank to keep current password">
          </div>
        ` : ""}
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Close</button>
          ${editable ? '<button class="danger-btn" type="button" id="deleteUserBtn">Delete User</button>' : ""}
          ${editable ? '<button class="primary-btn" type="submit">Save</button>' : ""}
        </div>
      </form>
    `);

    if (!editable) return;
    document.getElementById("userForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await saveAdminUser({
          name: valueOf("userName"),
          email: valueOf("userEmail"),
          password: valueOf("userPassword") || undefined,
          role: valueOf("userRole"),
          username: valueOf("userUsername") || null,
          phone: valueOf("userPhone") || null,
          coins: Number(valueOf("userCoins") || 0)
        }, {
          targetUserId: user.id,
          courseId: valueOf("userCourse") || null,
          batchId: valueOf("userBatch") || null
        });
        closeModal();
        await loadAllData();
        showAlert("User details updated.");
      } catch (error) {
        showAlert(error.message || "Unable to update user.", true);
      }
    });
    document.getElementById("deleteUserBtn")?.addEventListener("click", () => deleteAdminUser(user));
  }

  function openReplyModal(parentId) {
    const parent = findById(state.data.chats, parentId);
    if (!parent) return;
    openModal("Reply to Message", `
      <form class="form-grid" id="replyForm">
        <div class="form-row">
          <label>Original Message</label>
          <textarea disabled>${escapeHtml(parent.message || "")}</textarea>
        </div>
        <div class="form-row">
          <label for="replyMessage">Reply</label>
          <textarea id="replyMessage" required></textarea>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Post Reply</button>
        </div>
      </form>
    `);

    document.getElementById("replyForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await insertChatMessage(valueOf("replyMessage"), parent.batch_id, parent.id);
    });
  }

  function openProjectReviewModal(project) {
    if (!project) return;
    openReviewModal({
      title: "Review Project",
      table: "projects",
      id: project.id,
      status: project.status,
      notes: project.review_notes,
      noteField: "review_notes",
      statusOptions: ["pending", "approved", "changes_requested", "rejected"],
      extraPayload: {
        reviewed_by: state.admin.id,
        reviewed_date: new Date().toISOString()
      }
    });
  }

  function openSubmissionReviewModal(submission) {
    if (!submission) return;
    openReviewModal({
      title: "Review Submission",
      table: "task_submissions",
      id: submission.id,
      status: submission.status,
      notes: submission.feedback,
      noteField: "feedback",
      statusOptions: ["pending", "approved", "changes_requested", "rejected"]
    });
  }

  function openReviewModal(config) {
    openModal(config.title, `
      <form class="form-grid" id="reviewForm">
        <div class="form-row">
          <label for="reviewStatus">Status</label>
          <select id="reviewStatus">
            ${config.statusOptions.map((item) => option(item, config.status)).join("")}
          </select>
        </div>
        <div class="form-row">
          <label for="reviewNotes">Notes</label>
          <textarea id="reviewNotes">${escapeHtml(config.notes || "")}</textarea>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Review</button>
        </div>
      </form>
    `);

    document.getElementById("reviewForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await upsertRecord(config.table, {
        status: valueOf("reviewStatus"),
        [config.noteField]: valueOf("reviewNotes"),
        ...(config.extraPayload || {})
      }, config.id);
    });
  }

  async function postChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById("chatMessage");
    const message = input.value.trim();
    if (!message) return;
    await insertChatMessage(message, state.selectedBatchId, null);
    input.value = "";
  }

  async function insertChatMessage(message, batchId, parentId) {
    if (!batchId) {
      showAlert("Choose a batch before posting.", true);
      return;
    }
    await upsertRecord("batch_chats", {
      batch_id: batchId,
      user_id: state.admin.id,
      message,
      parent_id: parentId
    });
  }

  async function toggleCourseStatus(courseId) {
    const course = findById(state.data.courses, courseId);
    if (!course) return;
    await upsertRecord("courses", {
      status: course.status === "Published" ? "Draft" : "Published"
    }, course.id);
  }

  async function saveEnrollment(payload, batchId, existingEnrollment = null) {
    try {
      await writeEnrollmentRecord(payload.user_id, payload.course_id, batchId, payload.status || "active", existingEnrollment);
      closeModal();
      await loadAllData();
      showAlert("Enrollment saved.");
    } catch (error) {
      showAlert(error.message || "Enrollment save failed.", true);
    }
  }

  async function saveAdminUser(payload, assignment = {}) {
    const supabaseClient = getClient();
    const targetUser = assignment.targetUserId ? findById(state.data.users, assignment.targetUserId) : null;
    const email = String(payload.email || targetUser?.email || "").trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    const existingUser = targetUser || state.data.users.find((user) => String(user.email || "").toLowerCase() === email);
    const courseIds = mergeCourseIds(existingUser?.course_ids, assignment.courseId);
    const userPayload = compactObject({
      ...payload,
      email,
      name: payload.name || email,
      role: String(payload.role || "student").toLowerCase(),
      batch_id: assignment.batchId || payload.batch_id || existingUser?.batch_id || null,
      course_ids: courseIds.length ? courseIds : undefined
    });

    const rpcSaved = await saveAdminUserViaRpc(userPayload, {
      targetUserId: existingUser?.id || null,
      courseId: assignment.courseId || null,
      batchId: assignment.batchId || userPayload.batch_id || null
    });
    if (rpcSaved) return normalizeUser({ ...existingUser, ...rpcSaved });

    const saved = existingUser
      ? await updateUserRecord(existingUser.id, userPayload)
      : await insertUserRecord(userPayload);

    if (assignment.courseId) {
      await writeEnrollmentRecord(saved.id, assignment.courseId, assignment.batchId || userPayload.batch_id || null, "active");
    } else if (assignment.batchId) {
      await updateUserRecord(saved.id, { batch_id: assignment.batchId });
    }

    return normalizeUser({ ...existingUser, ...saved });
  }

  async function deleteAdminUser(user) {
    if (!user?.id || !window.confirm(`Delete ${user.name || user.email || "this user"}?`)) return;
    try {
      const rpcDeleted = await deleteAdminUserViaRpc(user.id);
      if (!rpcDeleted) {
        const { error } = await getClient().from("users").delete().eq("id", user.id);
        if (error) throw error;
      }
      closeModal();
      await loadAllData();
      showAlert("User deleted.");
    } catch (error) {
      showAlert(error.message || "Unable to delete user.", true);
    }
  }

  async function deleteAdminUserViaRpc(targetUserId) {
    if (!state.admin?.id || !getClient()?.rpc) return false;
    const { error } = await getClient().rpc("lms_admin_delete_user", {
      admin_user_id: state.admin.id,
      target_user_id: targetUserId
    });
    if (!error) return true;
    if (isMissingRpcError(error)) return false;
    throw error;
  }

  async function saveAdminUserViaRpc(userPayload, assignment) {
    if (!state.admin?.id || !getClient()?.rpc) return null;
    const { data, error } = await getClient().rpc("lms_admin_save_user", {
      admin_user_id: state.admin.id,
      target_user_id: assignment.targetUserId,
      user_payload: userPayload,
      assign_course_id: assignment.courseId,
      assign_batch_id: assignment.batchId
    });
    if (!error) return Array.isArray(data) ? data[0] : data;
    if (isMissingRpcError(error)) return null;
    throw error;
  }

  async function insertUserRecord(payload) {
    const candidates = [
      payload,
      stripKeys(payload, ["course_ids"]),
      stripKeys(payload, ["password"]),
      stripKeys(payload, ["password", "course_ids"]),
      stripKeys(payload, ["password", "course_ids", "coins"])
    ];
    return writeFirstWorkingUser(candidates, null);
  }

  async function updateUserRecord(id, payload) {
    const candidates = [
      payload,
      stripKeys(payload, ["course_ids"]),
      stripKeys(payload, ["password"]),
      stripKeys(payload, ["password", "course_ids"]),
      stripKeys(payload, ["password", "course_ids", "coins"])
    ];
    return writeFirstWorkingUser(candidates, id);
  }

  async function writeFirstWorkingUser(payloads, id) {
    let lastError = null;
    for (const payload of payloads) {
      const writePayload = compactObject(payload);
      const request = id
        ? getClient().from("users").update(writePayload).eq("id", id).select()
        : getClient().from("users").insert(writePayload).select();
      const { data, error } = await request;
      if (!error) return normalizeUser(Array.isArray(data) ? data[0] : data);
      lastError = error;
      if (!isSchemaShapeError(error)) break;
    }
    throw lastError || new Error("User save failed.");
  }

  async function writeEnrollmentRecord(userId, courseId, batchId, status = "active", existingEnrollment = null) {
    if (!userId || !courseId) return;
    const supabaseClient = getClient();
    const current = existingEnrollment || state.data.userCourses.find((row) => (
      String(row.user_id || row.student_id || "") === String(userId)
      && String(row.course_id || "") === String(courseId)
    ));
    const payload = compactObject({ user_id: userId, course_id: courseId, status });
    let request = null;

    if (current?.id) {
      request = supabaseClient.from("user_courses").update(payload).eq("id", current.id).select();
    } else if (current) {
      request = supabaseClient
        .from("user_courses")
        .update(payload)
        .eq("user_id", current.user_id)
        .eq("course_id", current.course_id)
        .select();
    } else {
      request = supabaseClient.from("user_courses").insert(payload).select();
    }

    let { error } = await request;
    if (error && isSchemaShapeError(error)) {
      const compatiblePayload = stripKeys(payload, ["status"]);
      request = current?.id
        ? supabaseClient.from("user_courses").update(compatiblePayload).eq("id", current.id).select()
        : current
          ? supabaseClient.from("user_courses").update(compatiblePayload).eq("user_id", current.user_id).eq("course_id", current.course_id).select()
          : supabaseClient.from("user_courses").insert(compatiblePayload).select();
      ({ error } = await request);
    }
    if (error) throw error;

    const user = findById(state.data.users, userId);
    const courseIds = mergeCourseIds(user?.course_ids, courseId);
    await updateUserRecord(userId, compactObject({
      batch_id: batchId || null,
      course_ids: courseIds.length ? courseIds : undefined
    }));
  }

  async function saveAdminProfile(event) {
    event.preventDefault();
    const name = valueOf("adminProfileName");
    const username = valueOf("adminProfileUsername");
    const phone = valueOf("adminProfilePhone");
    const payload = {
      name: name || state.admin?.name || state.admin?.email || "Admin",
      username: username || null,
      phone: phone || null
    };

    try {
      if (!state.admin?.id && !state.admin?.email) {
        throw new Error("Admin session is missing. Please login again.");
      }

      const supabaseClient = getClient();
      let request = supabaseClient.from("users").update(payload).select();
      request = state.admin?.id
        ? request.eq("id", state.admin.id)
        : request.eq("email", state.admin.email);

      const { data, error } = await request;
      if (error) throw error;

      const saved = Array.isArray(data) && data[0] ? data[0] : payload;
      state.admin = normalizeUser({ ...state.admin, ...saved, role: "admin" });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.admin));
      sessionStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(state.admin));

      const index = state.data.users.findIndex((user) => {
        if (state.admin.id && String(user.id) === String(state.admin.id)) return true;
        return String(user.email || "").toLowerCase() === String(state.admin.email || "").toLowerCase();
      });
      if (index >= 0) {
        state.data.users[index] = normalizeUser({ ...state.data.users[index], ...saved });
      }

      renderAdminIdentity();
      showAlert("Admin profile updated.");
    } catch (error) {
      showAlert(error.message || "Profile update failed.", true);
    }
  }

  async function deleteEnrollment(enrollment) {
    if (!enrollment) return;
    try {
      const supabaseClient = getClient();
      const request = enrollment.id
        ? supabaseClient.from("user_courses").delete().eq("id", enrollment.id)
        : supabaseClient
          .from("user_courses")
          .delete()
          .eq("user_id", enrollment.user_id)
          .eq("course_id", enrollment.course_id);
      const { error } = await request;
      if (error) throw error;
      await loadAllData();
      showAlert("Enrollment removed.");
    } catch (error) {
      showAlert(error.message || "Enrollment remove failed.", true);
    }
  }

  async function saveCourseRecord(payload, id = null) {
    try {
      await writeCourseRecord(payload, id);
      closeModal();
      await loadAllData();
      showAlert("Course saved successfully.");
    } catch (error) {
      showAlert(error.message || "Course save failed.", true);
    }
  }

  async function writeCourseRecord(payload, id = null) {
    const candidates = [
      payload,
      stripKeys(payload, ["mentor_id"]),
      stripKeys(payload, ["created_by_admin"]),
      stripKeys(payload, ["mentor_id", "created_by_admin"])
    ];
    let lastError = null;

    for (const candidate of candidates) {
      const writePayload = compactObject(candidate);
      const request = id
        ? getClient().from("courses").update(writePayload).eq("id", id).select()
        : getClient().from("courses").insert(writePayload).select();
      const { data, error } = await request;
      if (!error) return Array.isArray(data) ? data[0] : data;
      lastError = error;
      if (!isSchemaShapeError(error)) break;
    }

    throw lastError || new Error("Course save failed.");
  }

  async function saveCourseAssignments(course, selectedStudentIds, selectedMentorIds) {
    try {
      const courseId = course?.id;
      if (!courseId) throw new Error("Course is missing.");

      const selectedStudents = new Set(selectedStudentIds.map(String));
      const selectedMentors = new Set(selectedMentorIds.map(String));
      const currentStudents = courseAssignedUserIds(course, "student");
      const currentMentors = courseAssignedUserIds(course, "mentor");

      for (const userId of currentStudents) {
        if (!selectedStudents.has(String(userId))) {
          await removeCourseAssignment(userId, courseId);
        }
      }

      for (const userId of currentMentors) {
        if (!selectedMentors.has(String(userId))) {
          await removeCourseAssignment(userId, courseId);
        }
      }

      for (const userId of selectedStudents) {
        const user = findById(state.data.users, userId);
        await writeEnrollmentRecord(userId, courseId, user?.batch_id || null, "active");
      }

      for (const userId of selectedMentors) {
        const user = findById(state.data.users, userId);
        await writeEnrollmentRecord(userId, courseId, user?.batch_id || null, "active");
      }

      const primaryMentor = selectedMentorIds.map((id) => findById(state.data.users, id)).find(Boolean);
      await writeCourseRecord({
        mentor_id: primaryMentor?.id || null,
        instructor_name: primaryMentor?.name || primaryMentor?.email || "Academy Mentor"
      }, courseId);

      closeModal();
      await loadAllData();
      showAlert("Course assignment saved.");
    } catch (error) {
      showAlert(error.message || "Course assignment failed.", true);
    }
  }

  async function removeCourseAssignment(userId, courseId) {
    const rows = state.data.userCourses.filter((row) => (
      String(row.user_id || row.student_id || "") === String(userId)
      && String(row.course_id || "") === String(courseId)
    ));

    for (const row of rows) {
      await deleteEnrollmentRecord(row);
    }

    const user = findById(state.data.users, userId);
    if (!user) return;
    const courseIds = arrayFrom(user.course_ids).filter((id) => String(id) !== String(courseId));
    await updateUserRecord(userId, { course_ids: courseIds });
  }

  async function deleteEnrollmentRecord(enrollment) {
    const supabaseClient = getClient();
    let request = null;
    if (enrollment.id) {
      request = supabaseClient.from("user_courses").delete().eq("id", enrollment.id);
    } else if (enrollment.user_id) {
      request = supabaseClient.from("user_courses").delete().eq("user_id", enrollment.user_id).eq("course_id", enrollment.course_id);
    } else {
      request = supabaseClient.from("user_courses").delete().eq("student_id", enrollment.student_id).eq("course_id", enrollment.course_id);
    }
    const { error } = await request;
    if (error) throw error;
  }

  async function upsertRecord(table, payload, id = null) {
    try {
      const supabaseClient = getClient();
      const request = id
        ? supabaseClient.from(table).update(payload).eq("id", id).select()
        : supabaseClient.from(table).insert(payload).select();
      const { error } = await request;
      if (error) throw error;
      closeModal();
      await loadAllData();
      showAlert("Saved successfully.");
    } catch (error) {
      showAlert(error.message || "Save failed.", true);
    }
  }

  async function deleteRecord(table, id) {
    if (!id || !window.confirm("Delete this item?")) return;
    try {
      const supabaseClient = getClient();
      const { error } = await supabaseClient.from(table).delete().eq("id", id);
      if (error) throw error;
      await loadAllData();
      showAlert("Deleted successfully.");
    } catch (error) {
      showAlert(error.message || "Delete failed.", true);
    }
  }

  async function logout() {
    clearStoredSessions();
    const supabaseClient = getClient();
    await supabaseClient?.auth?.signOut?.();
    window.location.replace("login.html");
  }

  function setView(view) {
    if (!views[view]) view = "dashboard";
    state.activeView = view;
    Object.entries(views).forEach(([key, element]) => {
      if (!element) return;
      element.classList.toggle("active", key === view);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    document.getElementById("sidebarProfileBtn")?.classList.toggle("active", view === "profile");
    viewTitle.textContent = views[view]?.dataset.title || "Dashboard";
    renderActiveView();
  }

  function renderActiveView() {
    switch (state.activeView) {
      case "dashboard":
        renderDashboard();
        break;
      case "users":
        renderUsers();
        break;
      case "courses":
        renderCourses();
        break;
      case "batches":
        renderBatches();
        break;
      case "enrollments":
        renderEnrollments();
        break;
      case "tasks":
        renderTasks();
        break;
      case "chat":
        renderChatBatches();
        renderChat();
        break;
      case "shop":
        renderShop();
        break;
      case "reviews":
        renderReviews();
        break;
      case "announcements":
        renderAnnouncements();
        break;
      case "profile":
        renderProfile();
        break;
      default:
        break;
    }
  }

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    modal.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
  }

  function closeModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
  }

  function setLoading(isLoading) {
    loadingPanel.classList.toggle("show", isLoading);
  }

  function setSyncStatus(message) {
    if (!syncStatus) return;
    syncStatus.textContent = message;
    setText("profileSyncText", message);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function showAlert(message, isError = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle("error", isError);
    alertBox.classList.add("show");
    window.clearTimeout(showAlert.timer);
    showAlert.timer = window.setTimeout(() => {
      alertBox.classList.remove("show");
    }, 3200);
  }

  function setActiveButton(selector, activeButton) {
    document.querySelectorAll(selector).forEach((button) => button.classList.remove("active"));
    activeButton.classList.add("active");
  }

  function assignmentOption(user, checked, groupName) {
    return `
      <label class="assignment-option">
        <span>
          <strong>${escapeHtml(user.name || user.email || "User")}</strong>
          <small>${escapeHtml(user.email || user.username || "")}</small>
        </span>
        <input type="checkbox" name="${escapeAttr(groupName)}" value="${escapeAttr(user.id)}" ${checked ? "checked" : ""}>
      </label>
    `;
  }

  function checkedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
  }

  function courseAssignedUserIds(course, role) {
    const ids = new Set();
    const courseId = String(course?.id || "");
    if (!courseId) return ids;

    state.data.userCourses.forEach((enrollment) => {
      if (String(enrollment.course_id || "") !== courseId) return;
      const user = findById(state.data.users, enrollment.user_id || enrollment.student_id);
      if (user?.role === role) {
        if (role === "student") {
          if (String(user.email || enrollment.student_email || "").toLowerCase() === "adolf@gmail.com" || sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")) return;
        }
        ids.add(String(user.id));
      }
    });

    state.data.users
      .filter((user) => user.role === role)
      .forEach((user) => {
        if (role === "student") {
          if (String(user.email || "").toLowerCase() === "adolf@gmail.com" || sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")) return;
        }
        if (arrayFrom(user.course_ids).some((id) => String(id) === courseId)) {
          ids.add(String(user.id));
        }
      });

    if (role === "mentor") {
      if (course?.mentor_id) ids.add(String(course.mentor_id));
      const instructor = String(course?.instructor_name || "").toLowerCase();
      const matchedMentor = state.data.users.find((user) => (
        user.role === "mentor"
        && [user.name, user.username, user.email].some((value) => String(value || "").toLowerCase() === instructor)
      ));
      if (matchedMentor?.id) ids.add(String(matchedMentor.id));
    }

    return ids;
  }

  function formatCoursePrice(price) {
    const amount = Number(price || 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Free";
    return `INR ${amount.toLocaleString("en-IN")}`;
  }

  function normalizeUser(user) {
    return {
      ...user,
      name: user?.name || user?.username || user?.email || "User",
      role: (user?.role || "student").toLowerCase()
    };
  }

  function normalizeEnrollment(enrollment) {
    const userId = enrollment?.user_id || enrollment?.student_id || enrollment?.learner_id || "";
    const courseId = enrollment?.course_id || "";
    return {
      ...enrollment,
      _key: enrollment?.id || `${userId}::${courseId}`,
      user_id: userId,
      course_id: courseId
    };
  }

  function matchesUser(user, query) {
    return matchesText(query, user.name, user.email, user.username, user.role);
  }

  function userLearningSummary(user) {
    const enrollments = state.data.userCourses.filter((row) => String(row.user_id || row.student_id || "") === String(user.id));
    const courseNames = enrollments
      .map((row) => enrollmentCourse(row)?.title || enrollmentCourse(row)?.name)
      .filter(Boolean);
    const batch = findById(state.data.batches, user.batch_id);
    const courseLabel = courseNames.length ? courseNames.join(", ") : "No course";
    const batchLabel = batch?.name || "No batch";
    return `<strong>${escapeHtml(courseLabel)}</strong><br><small>${escapeHtml(batchLabel)}</small>`;
  }

  async function readUserCsv(file) {
    if (!file) throw new Error("Choose a CSV file first.");
    const text = await file.text();
    const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell || "").trim()));
    if (rows.length < 2) throw new Error("CSV needs a header row and at least one user.");
    const headers = rows[0].map(normalizeCsvHeader);
    return rows.slice(1).map((cells, index) => {
      const row = { _row: index + 2 };
      headers.forEach((header, cellIndex) => {
        if (header) row[header] = String(cells[cellIndex] || "").trim();
      });
      return row;
    }).filter((row) => row.email || row.name);
  }

  function userCsvPreview(rows) {
    if (!rows.length) return "No user rows found.";
    const previewRows = rows.slice(0, 5).map((row) => `
      <tr>
        <td>${escapeHtml(row.name || "Unnamed")}</td>
        <td>${escapeHtml(row.email || "Missing email")}</td>
        <td>${escapeHtml(row.role || "default")}</td>
        <td>${escapeHtml(row.course || row.course_id || "default")}</td>
      </tr>
    `).join("");
    return `
      <div class="csv-preview-meta">${rows.length} row${rows.length === 1 ? "" : "s"} ready. Previewing first ${Math.min(rows.length, 5)}.</div>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Course</th></tr></thead>
        <tbody>${previewRows}</tbody>
      </table>
    `;
  }

  async function importUsersFromCsv(rows, defaults) {
    let created = 0;
    let failed = 0;
    const errors = [];
    for (const row of rows) {
      try {
        const courseId = resolveCourseId(row.course_id || row.course || row.coursetitle || row.course_name) || defaults.courseId;
        const batchId = resolveBatchId(row.batch_id || row.batch || row.batchname || row.batch_name) || defaults.batchId;
        await saveAdminUser({
          name: row.name || row.fullname || row.full_name || row.email,
          email: row.email,
          password: row.password || defaults.password,
          role: row.role || defaults.role,
          phone: row.phone || row.mobile || null,
          username: row.username || null,
          coins: Number(row.coins || 0)
        }, { courseId, batchId });
        created += 1;
      } catch (error) {
        failed += 1;
        errors.push(`Row ${row._row}: ${error.message || "failed"}`);
      }
    }
    if (errors.length) console.warn("CSV user import issues", errors);
    return { created, failed, errors };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (char !== "\r") {
        cell += char;
      }
    }
    row.push(cell);
    rows.push(row);
    return rows;
  }

  function normalizeCsvHeader(value) {
    const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const aliases = {
      full_name: "name",
      student_name: "name",
      learner_name: "name",
      mail: "email",
      email_address: "email",
      mobile_number: "phone",
      course_title: "course",
      course_name: "course",
      batch_name: "batch"
    };
    return aliases[key] || key;
  }

  function resolveCourseId(value) {
    const token = String(value || "").trim();
    if (!token) return "";
    const exact = state.data.courses.find((course) => String(course.id) === token);
    if (exact) return exact.id;
    const normalized = token.toLowerCase();
    return state.data.courses.find((course) => String(course.title || course.name || "").toLowerCase() === normalized)?.id || "";
  }

  function resolveBatchId(value) {
    const token = String(value || "").trim();
    if (!token) return "";
    const exact = state.data.batches.find((batch) => String(batch.id) === token);
    if (exact) return exact.id;
    const normalized = token.toLowerCase();
    return state.data.batches.find((batch) => String(batch.name || "").toLowerCase() === normalized)?.id || "";
  }

  function mergeCourseIds(existingValue, courseId) {
    const ids = arrayFrom(existingValue);
    if (courseId) ids.push(courseId);
    return Array.from(new Set(ids.filter(Boolean).map(String)));
  }

  function arrayFrom(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch (error) {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  }

  function compactObject(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  function stripKeys(payload, keys) {
    const next = { ...payload };
    keys.forEach((key) => delete next[key]);
    return next;
  }

  function isSchemaShapeError(error) {
    return /column|schema|does not exist|could not find|relation/i.test(error?.message || "");
  }

  function isMissingRpcError(error) {
    return /function|schema cache|not found|could not find/i.test(error?.message || "") || error?.code === "PGRST202";
  }

  function matchesAnnouncement(item, query) {
    return matchesText(
      query,
      item?.title,
      item?.message,
      item?.audience,
      item?.priority,
      item?.status,
      announcementAudienceLabel(item),
      announcementTargetLabel(item)
    );
  }

  function announcementAudienceLabel(item) {
    const audience = String(item?.audience || "all").toLowerCase();
    if (audience === "students") return "Students only";
    if (audience === "mentors") return "Mentors only";
    if (audience === "batch") return "Batch";
    if (audience === "course") return "Course";
    return "Students and mentors";
  }

  function announcementTargetLabel(item) {
    const audience = String(item?.audience || "all").toLowerCase();
    if (audience === "batch") {
      const batch = findById(state.data.batches, item?.batch_id);
      return batch?.name || "Specific batch";
    }
    if (audience === "course") {
      const course = findById(state.data.courses, item?.course_id);
      return course?.title || course?.name || "Specific course";
    }
    return announcementAudienceLabel(item);
  }

  function announcementColor(item) {
    const priority = String(item?.priority || "normal").toLowerCase();
    const audience = String(item?.audience || "all").toLowerCase();
    if (priority === "urgent") return "red";
    if (priority === "important") return "amber";
    if (audience === "mentors") return "green";
    if (audience === "students") return "blue";
    return "gray";
  }

  function matchesText(query, ...values) {
    const queries = (Array.isArray(query) ? query : [query])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    if (!queries.length) return true;
    return queries.every((item) => values.some((value) => String(value ?? "").toLowerCase().includes(item)));
  }

  function searchQuery(localInputId = "") {
    const localQuery = localInputId ? document.getElementById(localInputId)?.value.trim().toLowerCase() : "";
    return [state.globalQuery, localQuery].filter(Boolean);
  }

  function hasQuery(query) {
    return Array.isArray(query) ? query.length > 0 : Boolean(query);
  }

  function estimateProgress(row) {
    if (typeof row.quiz_score === "number" && row.quiz_completed) return Math.min(100, Math.max(0, row.quiz_score));
    const course = state.data.courses.find((item) => String(item.id) === String(row.course_id));
    const totalModules = progressModuleCount(course);
    const modules = progressArrayCount(row.completed_modules);
    if (totalModules) return Math.min(100, Math.round((modules / totalModules) * 100));
    const lessons = progressArrayCount(row.completed_lessons);
    return Math.min(100, (lessons * 10) + (modules * 20));
  }

  function progressArrayCount(value) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.length;
      } catch (error) {
        // Fall through to numeric parsing.
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }
    return 0;
  }

  function progressModuleCount(course) {
    const raw = typeof course?.modules === "string" ? safeJson(course.modules) : course?.modules;
    const modules = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : [];
    return modules.length;
  }

  function safeJson(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function findById(rows, id) {
    return rows.find((row) => String(row.id) === String(id));
  }

  function sameId(a, b) {
    return String(a || "") === String(b || "");
  }

  function findEnrollmentByKey(key) {
    return state.data.userCourses.find((row) => String(row._key) === String(key));
  }

  function enrollmentUser(enrollment) {
    return findById(state.data.users, enrollment.user_id || enrollment.student_id || enrollment.learner_id);
  }

  function enrollmentCourse(enrollment) {
    return findById(state.data.courses, enrollment.course_id);
  }

  function enrollmentBatch(enrollment, user) {
    return findById(state.data.batches, enrollment.batch_id || user?.batch_id);
  }

  function batchPeriod(batch) {
    const start = batch?.start_date ? formatDate(batch.start_date) : "";
    const end = batch?.end_date ? formatDate(batch.end_date) : "";
    if (start && end) return `${start} to ${end}`;
    return start || end || "Not set";
  }

  function enrollmentProgress(enrollment) {
    const row = state.data.progress.find((item) => {
      const sameUser = String(item.user_id || item.student_id || "") === String(enrollment.user_id || enrollment.student_id || "");
      const sameCourse = String(item.course_id || "") === String(enrollment.course_id || "");
      return sameUser && sameCourse;
    });
    if (row) return Math.round(estimateProgress(row));
    return Math.min(100, Math.max(0, Math.round(Number(enrollment.progress || 0))));
  }

  function countSubmissionsForTask(taskId) {
    return state.data.taskSubmissions.filter((submission) => String(submission.task_id || submission.batch_task_id) === String(taskId)).length;
  }

  function formatTableName(table) {
    return String(table || "LMS data").replaceAll("_", " ");
  }

  function toDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function roleColor(role) {
    if (role === "admin") return "red";
    if (role === "mentor") return "amber";
    if (role === "student") return "blue";
    return "";
  }

  function statusColor(status) {
    const value = String(status || "").toLowerCase();
    if (["published", "active", "approved", "completed"].includes(value)) return "green";
    if (["pending", "draft", "changes_requested", "paused"].includes(value)) return "amber";
    if (["rejected", "archived", "cancelled", "closed"].includes(value)) return "red";
    return "blue";
  }

  function valueOf(id) {
    return document.getElementById(id).value.trim();
  }

  function numberOrNull(id) {
    const value = valueOf(id);
    return value === "" ? null : Number(value);
  }

  function option(value, selectedValue, label = value) {
    return `<option value="${escapeAttr(value)}" ${String(value) === String(selectedValue || "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function initials(value) {
    return String(value || "A")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "Not set";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(value));
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
