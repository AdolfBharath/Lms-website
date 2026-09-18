(function () {
  const SESSION_KEY = "jenovateAdminSession";
  const LEGACY_SESSION_KEY = "jenovateCurrentUser";
  const getClient = () => window.getSupabaseClient?.();
  const PAGE_SIZE = 20;
  const CHAT_PAGE_SIZE = 30;
  const QUERY_CACHE_TTL = 45_000;
  const QUERY_CACHE_PREFIX = "jenovate:lms:admin:";
  const SELECTS = {
    users: "id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,last_login_reward_date,status,deleted_at,courseNames,created_at",
    courses: "id,title,description,category,duration,module_type,instructor_name,thumbnail_url,rating,price,difficulty,modules,is_featured,is_my_course,status,created_by_admin,quiz_coin_reward,quiz_pass_score,mentor_id,created_at,google_form_url",
    batches: "id,name,course_id,mentor_id,capacity,enroll_limit,smart_waitlist,status,start_date,end_date,progress,enrolled_count,created_at",
    userCourses: "id,user_id,student_id,learner_id,course_id,batch_id,created_at,status,deleted_at",
    progress: "student_id,course_id,completed_lessons,completed_modules,rewarded_modules,quiz_completed,quiz_score,updated_at,quiz_attempts,quiz_failed_attempts,quiz_locked,quiz_rewatch_required,quiz_last_score,quiz_last_total,quiz_best_score,module_quiz_state",
    shopItems: "id,name,price,image_url,created_at",
    projects: "id,title,description,status,student_id,batch_id,file_urls,review_notes",
    batchTasks: "id,batch_id,title,description,file_url,drive_link,deadline,status,created_by,created_at",
    taskSubmissions: "id,task_id,student_id,user_id,batch_id,course_id,status,drive_link,file_url,file_type,submitted_at,created_at,feedback",
    chats: "id,batch_id,user_id,message,parent_id,created_at",
    announcements: "id,title,message,audience,priority,batch_id,course_id,created_by,created_by_role,status,published_at,expires_at,created_at,updated_at",
    supportTickets: "id,ticket_id,user_id,user_role,category,subject,message,attachment_url,status,priority,created_at,updated_at",
    supportMessages: "id,ticket_id,sender_id,sender_role,message,attachment_url,is_read,read_at,created_at",
    supportNotifications: "id,ticket_id,recipient_user_id,recipient_role,title,body,channel,is_read,read_at,created_at"
  };
  const TABLE_SPECS = [
    {
      key: "users",
      table: "users",
      select: SELECTS.users,
      fallbackSelect: "id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,courseNames,created_at",
      limit: 1000
    },
    { key: "courses", table: "courses", select: SELECTS.courses, limit: 30 },
    { key: "batches", table: "batches", select: SELECTS.batches, limit: 30 },
    { key: "userCourses", table: "user_courses", select: SELECTS.userCourses, fallbackSelect: "user_id,course_id,created_at,status", limit: 1000 },
    { key: "progress", table: "student_course_progress", select: SELECTS.progress, limit: 1000 },
    { key: "shopItems", table: "shop_items", select: SELECTS.shopItems, limit: PAGE_SIZE },
    { key: "projects", table: "projects", select: SELECTS.projects, fallbackSelect: "id,title,description,status,student_id,batch_id,file_urls,review_notes", limit: 500 },
    { key: "batchTasks", table: "batch_tasks", select: SELECTS.batchTasks, fallbackSelect: "id,batch_id,title,description,file_url,drive_link,deadline,created_by,created_at", limit: PAGE_SIZE, order: "created_at.desc" },
    { key: "taskSubmissions", table: "task_submissions", select: SELECTS.taskSubmissions, fallbackSelect: "id,task_id,student_id,status,drive_link,file_url,file_type,submitted_at,feedback", limit: 500, order: "submitted_at.desc" },
    { key: "chats", table: "batch_chats", select: SELECTS.chats, limit: CHAT_PAGE_SIZE, scope: "selectedBatch", order: "created_at.desc" },
    { key: "announcements", table: "announcements", select: SELECTS.announcements, limit: 30, order: "published_at.desc" },
    { key: "supportTickets", table: "support_tickets", select: SELECTS.supportTickets, optional: true, limit: 60, order: "updated_at.desc" },
    { key: "supportMessages", table: "support_messages", select: SELECTS.supportMessages, optional: true, limit: 160, order: "created_at.desc" },
    { key: "supportNotifications", table: "support_notifications", select: SELECTS.supportNotifications, optional: true, limit: 60, scope: "adminNotifications", order: "created_at.desc" }
  ];

  const state = {
    admin: null,
    activeView: "dashboard",
    dashboardRole: "student",
    reportActivityFilter: "all",
    userRole: "all",
    analyticsRange: "daily",   // daily | weekly | monthly
    globalQuery: "",
    supportStatusFilter: "all",
    supportSearch: "",
    selectedSupportTicketId: "",
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
      announcements: [],
      supportTickets: [],
      supportMessages: [],
      supportNotifications: []
    },
    queryCache: new Map(),
    inFlightRequests: new Map()
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
    support: document.getElementById("supportView"),
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
    initializeHistoryNavigation();
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

    wireReportTabs();

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
  }

  function wireActions() {
    document.getElementById("refreshBtn").addEventListener("click", () => loadAllData({ force: true }));
    document.getElementById("refreshReviewsBtn").addEventListener("click", () => loadAllData({ force: true }));
    document.getElementById("reloadChatBtn").addEventListener("click", loadChats);
    document.getElementById("refreshSupportBtn")?.addEventListener("click", () => loadAllData({ force: true }));
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
    document.getElementById("supportStatusFilter")?.addEventListener("change", (event) => {
      state.supportStatusFilter = event.target.value || "all";
      renderSupport();
    });
    document.getElementById("supportSearch")?.addEventListener("input", (event) => {
      state.supportSearch = event.target.value.trim().toLowerCase();
      renderSupport();
    });
    document.getElementById("supportReplyForm")?.addEventListener("submit", submitAdminSupportReply);

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

  function wireReportTabs() {
    document.querySelectorAll("#dashboardView [data-report-filter]").forEach((button) => {
      if (button.dataset.wired === "true") return;
      button.dataset.wired = "true";
      button.addEventListener("click", () => {
        state.reportActivityFilter = button.dataset.reportFilter || "all";
        document.querySelectorAll("#dashboardView [data-report-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderAdminReportActivity();
      });
    });
  }

  async function resolveAdminSession() {
    try {
      const profile = await window.JenovateAuth?.requireRole?.("admin");
      if (profile) return normalizeUser(profile);
    } catch (error) {
      console.warn("Admin auth check failed", error);
    }
    return null;
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

  async function enforceLiveSession() {
    if (!(await resolveAdminSession())) {
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
    if (options.force === true) clearQueryCache();
    setSyncStatus("Connecting to Supabase...");
    setLoading(!silent);
    try {
      const results = await Promise.all(TABLE_SPECS.map((spec) => fetchTableSafe(spec, { force: options.force === true })));
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
      state.data.supportTickets = rows.supportTickets || [];
      state.data.supportMessages = rows.supportMessages || [];
      state.data.supportNotifications = rows.supportNotifications || [];
      if (state.selectedSupportTicketId && !state.data.supportTickets.some((ticket) => sameId(ticket.id || ticket.ticket_id, state.selectedSupportTicketId))) {
        state.selectedSupportTicketId = "";
      }

      if (!state.selectedBatchId && state.data.batches[0]) {
        state.selectedBatchId = state.data.batches[0].id;
      }

      renderAll();
      const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (failed.length) {
        setSyncStatus(`Synced with ${failed.length} table warning${failed.length === 1 ? "" : "s"} at ${stamp}`);
        if (!silent) showAlert(`Some Supabase tables need attention: ${failed.map((item) => `${item.table}: ${friendlySupabaseError(item.error)}`).join("; ")}`, true);
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

  async function fetchTableSafe(spec, options = {}) {
    try {
      const rows = await fetchTable(spec, options);
      return { ...spec, rows, error: null };
    } catch (error) {
      if (spec.fallbackSelect && isMissingColumnError(error)) {
        try {
          const rows = await fetchTable({ ...spec, select: spec.fallbackSelect, fallbackSelect: null }, { ...options, force: true });
          return { ...spec, rows, error: null };
        } catch (fallbackError) {
          error = fallbackError;
        }
      }
      console.error(`Supabase fetch failed for ${spec.table}`, error);
      return { ...spec, rows: [], error };
    }
  }

  function isMissingColumnError(error) {
    return ["42703", "PGRST204"].includes(String(error?.code || ""))
      || /column .* does not exist|schema cache|could not find .* column|could not find .* in the schema/i.test(String(error?.message || ""));
  }

  async function fetchTable(spec, options = {}) {
    const supabaseClient = getClient();
    const limit = normalizeLimit(spec.limit);
    const cacheKey = queryCacheKey(spec, limit);
    if (!options.force) {
      const memory = state.queryCache.get(cacheKey);
      if (memory && Date.now() - memory.timestamp < QUERY_CACHE_TTL) return memory.rows;
      const stored = readCachedRows(cacheKey);
      if (stored) {
        revalidateTable(spec, limit, cacheKey);
        return stored.rows;
      }
      if (state.inFlightRequests.has(cacheKey)) return state.inFlightRequests.get(cacheKey);
    }

    const promise = runSupabaseQuery(supabaseClient, spec, limit).then((rows) => {
      writeCachedRows(cacheKey, rows);
      return rows;
    }).finally(() => state.inFlightRequests.delete(cacheKey));
    state.inFlightRequests.set(cacheKey, promise);
    return promise;
  }

  async function runSupabaseQuery(supabaseClient, spec, limit) {
    let query = supabaseClient.from(spec.table).select(spec.select);
    if (spec.scope === "selectedBatch" && state.selectedBatchId) {
      query = query.eq("batch_id", state.selectedBatchId);
    } else if (spec.scope === "adminNotifications") {
      query = query.eq("recipient_role", "admin");
    }
    if (spec.order) {
      const [column, direction = "desc"] = spec.order.split(".");
      query = query.order(column, { ascending: direction === "asc" });
    } else if (["batch_chats", "announcements", "batch_tasks"].includes(spec.table)) {
      query = query.order("created_at", { ascending: false });
    }
    const { data, error } = await query.range(0, limit - 1);
    if (error && spec.table === "users") {
      const fallback = await supabaseClient.rpc("lms_public_active_users");
      if (!fallback.error) return (fallback.data || []).slice(0, limit);
    }
    if (error) throw error;
    return data || [];
  }

  function normalizeLimit(limit = PAGE_SIZE) {
    const num = Number(limit);
    if (!isNaN(num) && num > 0) return num;
    return PAGE_SIZE;
  }

  function queryCacheKey(spec, limit) {
    return `${QUERY_CACHE_PREFIX}${spec.table}:${spec.select}:${spec.scope || "all"}:${spec.order || ""}:${limit}:${state.selectedBatchId || ""}`;
  }

  function readCachedRows(cacheKey) {
    const memory = state.queryCache.get(cacheKey);
    if (memory) return memory;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (!cached || Date.now() - cached.timestamp > QUERY_CACHE_TTL * 4) return null;
      state.queryCache.set(cacheKey, cached);
      return cached;
    } catch (error) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
  }

  function writeCachedRows(cacheKey, rows) {
    const cached = { timestamp: Date.now(), rows };
    state.queryCache.set(cacheKey, cached);
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(cached));
    } catch (error) {
      // Memory cache still prevents duplicate requests when storage is full.
    }
  }

  function revalidateTable(spec, limit, cacheKey) {
    if (state.inFlightRequests.has(cacheKey)) return;
    const promise = runSupabaseQuery(getClient(), spec, limit)
      .then((rows) => writeCachedRows(cacheKey, rows))
      .catch((error) => console.warn(`Background refresh failed for ${spec.table}`, error))
      .finally(() => state.inFlightRequests.delete(cacheKey));
    state.inFlightRequests.set(cacheKey, promise);
  }

  function clearQueryCache() {
    state.queryCache.clear();
    state.inFlightRequests.clear();
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(QUERY_CACHE_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  }

  async function loadChats() {
    try {
      state.data.chats = await fetchTable(TABLE_SPECS.find((spec) => spec.key === "chats"), { force: true });
      renderChat();
      showAlert("Chat refreshed.");
    } catch (error) {
      showAlert(error.message || "Unable to refresh chat.", true);
    }
  }

  function setupRealtime() {
    const supabaseClient = getClient();
    if (!supabaseClient?.channel || state.realtimeChannel) return;

    const liveTables = ["batch_chats", "announcements", "support_tickets", "support_messages", "support_notifications"];

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
    window.addEventListener("pagehide", cleanupRealtime, { once: true });
    window.addEventListener("beforeunload", cleanupRealtime, { once: true });
  }

  function queueRealtimeRefresh(table) {
    setSyncStatus(`Live update from ${formatTableName(table)}`);
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      loadAllData({ silent: true, force: true });
    }, 900);
  }

  async function cleanupRealtime() {
    window.clearTimeout(state.refreshTimer);
    if (state.realtimeChannel && getClient()?.removeChannel) {
      await getClient().removeChannel(state.realtimeChannel);
    }
    state.realtimeChannel = null;
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
    renderSupport();
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
    ensureAdminReportDashboard();
    const heroTitle = document.querySelector(".review-spotlight h2");
    const heroCopy = document.querySelector(".review-spotlight p");
    const heroStatus = document.querySelector(".review-spotlight .status-pill");
    if (heroTitle) heroTitle.textContent = "Admin Workspace";
    if (heroCopy) heroCopy.textContent = "Manage users, courses, enrollments, reviews, batches, and rewards from one clean control center.";
    if (heroStatus) heroStatus.textContent = "Live Operations";

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
    setText("metricUsers", users.length);
    setText("metricUsersMeta", `${students} students, ${mentors} mentors`);
    setText("metricCourses", state.data.courses.length);
    setText("metricBatches", state.data.batches.length);
    setText("metricShop", state.data.shopItems.length);
    setText("metricTasks", state.data.batchTasks.length);
    setText("metricEnrollments", state.data.userCourses.length);
    setText("metricTasksMeta", `${state.data.taskSubmissions.length} submitted reviews`);
    setText("metricEnrollmentsMeta", `${state.data.progress.length} progress records`);

    renderAdminReportDashboard({ users, students, mentors, publishedCourses, draftCourses, activeBatches, pendingReviews, reviewedItems });

    if (document.getElementById("dashboardUsersList")) renderDashboardUsers();
    if (document.getElementById("courseProgressList")) renderCourseProgress();
    if (document.getElementById("dashboardReviewsList")) renderDashboardReviews();
    if (document.getElementById("dashboardShopList")) renderDashboardShop();
    if (document.getElementById("dashboardTasksList")) renderDashboardTasks();
    renderAnalyticsChart();
  }

  function ensureAdminReportDashboard() {
    const view = document.getElementById("dashboardView");
    if (!view || view.dataset.reportDashboard === "true") return;
    view.dataset.reportDashboard = "true";
    view.innerHTML = `
      <div class="role-report-dashboard">
        <section class="report-card report-activity-card">
          <div class="report-card-head">
            <div>
              <h2>Learners activity <span aria-hidden="true">i</span></h2>
            </div>
            <button class="report-link" type="button" data-jump="users">View all</button>
          </div>
          <div class="report-mini-tabs" aria-label="Activity filters">
            <button class="active" type="button" data-report-filter="all">All</button>
            <button type="button" data-report-filter="courses">Courses</button>
            <button type="button" data-report-filter="tasks">Tasks</button>
            <button type="button" data-report-filter="reviews">Reviews</button>
          </div>
          <div class="report-list" id="adminReportActivityList"></div>
        </section>

        <section class="report-card report-total-card">
          <div class="report-card-head">
            <h2>Total learners <span aria-hidden="true">i</span></h2>
            <button class="report-select" type="button">All roles</button>
          </div>
          <div class="report-total"><strong id="adminReportTotalLearners">0</strong><span>People</span></div>
          <div class="report-breakdown" id="adminReportBreakdown"></div>
        </section>

        <section class="report-card report-time-card">
          <div class="report-card-head">
            <h2>Learning time <span aria-hidden="true">i</span></h2>
            <button class="report-select" type="button">All courses</button>
          </div>
          <div class="report-total"><strong id="adminReportLearningTime">0</strong><span>Hours</span></div>
          <small class="report-growth">+ synced from active LMS data</small>
          <div class="report-sparkline" id="adminReportSparkline"></div>
        </section>

        <section class="report-card report-line-card">
          <div class="report-card-head">
            <h2>Weekly active learners <span aria-hidden="true">i</span></h2>
            <button class="report-select" type="button">This week</button>
          </div>
          <div class="report-chart" id="adminReportWeeklyChart"></div>
        </section>

        <section class="report-card report-bars-card">
          <div class="report-card-head">
            <h2>Most active learners <span aria-hidden="true">i</span></h2>
            <button class="report-select" type="button">Last 4 weeks</button>
          </div>
          <div class="report-bars" id="adminReportActiveLearners"></div>
        </section>

        <section class="report-card report-health-card">
          <div class="report-card-head">
            <h2>Content health <span aria-hidden="true">i</span></h2>
            <button class="report-link" type="button" data-jump="courses">Manage</button>
          </div>
          <div class="report-kpi-grid" id="adminReportContentHealth"></div>
        </section>

        <section class="report-card report-workload-card">
          <div class="report-card-head">
            <h2>Operations queue <span aria-hidden="true">i</span></h2>
            <button class="report-link" type="button" data-jump="reviews">Open</button>
          </div>
          <div class="report-kpi-grid" id="adminReportWorkload"></div>
        </section>

        <section class="report-card report-courses-card">
          <div class="report-card-head">
            <h2>Course snapshot <span aria-hidden="true">i</span></h2>
            <button class="report-link" type="button" data-jump="courses">View all</button>
          </div>
          <div class="report-compact-list" id="adminReportCourses"></div>
        </section>

        <section class="report-card report-batches-card">
          <div class="report-card-head">
            <h2>Batch snapshot <span aria-hidden="true">i</span></h2>
            <button class="report-link" type="button" data-jump="batches">View all</button>
          </div>
          <div class="report-compact-list" id="adminReportBatches"></div>
        </section>

        <section class="report-card report-attention-card">
          <div class="report-card-head">
            <h2>Needs attention <span aria-hidden="true">i</span></h2>
            <button class="report-select" type="button">Live</button>
          </div>
          <div class="report-compact-list" id="adminReportAttention"></div>
        </section>
      </div>
    `;
    view.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.jump));
    });
    wireReportTabs();
  }

  function renderAdminReportDashboard(summary) {
    const activeLearners = adminLearnerRows();
    const weekly = weeklyEventSeries();
    const contentHealth = adminContentHealth(summary);
    const workload = adminWorkload(summary);
    const courseRows = adminCourseSnapshotRows();
    const batchRows = adminBatchSnapshotRows();
    const attentionRows = adminAttentionRows(summary);
    const learningHours = Math.max(
      state.data.courses.length * 8,
      state.data.progress.length * 2 + state.data.taskSubmissions.length + state.data.projects.length
    );

    setText("adminReportTotalLearners", summary.students + summary.mentors);
    setText("adminReportLearningTime", learningHours);
    renderAdminReportActivity();
    setHtml("adminReportBreakdown", [
      { label: "Students", value: summary.students, color: "#12b981" },
      { label: "Mentors", value: summary.mentors, color: "#ef4444" },
      { label: "Courses", value: state.data.courses.length, color: "#4f46e5" },
      { label: "Batches", value: state.data.batches.length, color: "#0ea5e9" },
      { label: "Tasks", value: state.data.batchTasks.length, color: "#f59e0b" },
      { label: "Reviews", value: summary.pendingReviews + summary.reviewedItems, color: "#a855f7" }
    ].map(reportBreakdownItem).join(""));
    setHtml("adminReportSparkline", reportSparklineSvg(weekly.current));
    setHtml("adminReportWeeklyChart", reportLineSvg(weekly.labels, weekly.current, weekly.previous));
    setHtml("adminReportActiveLearners", activeLearners.length ? activeLearners.map(reportBarRow).join("") : emptyState("Learner activity will appear after enrollments."));
    setHtml("adminReportContentHealth", contentHealth.map(reportKpiItem).join(""));
    setHtml("adminReportWorkload", workload.map(reportKpiItem).join(""));
    setHtml("adminReportCourses", courseRows.length ? courseRows.map(reportCompactItem).join("") : emptyState("Courses added by admin or mentor will appear here."));
    setHtml("adminReportBatches", batchRows.length ? batchRows.map(reportCompactItem).join("") : emptyState("Live batches will appear here."));
    setHtml("adminReportAttention", attentionRows.length ? attentionRows.map(reportCompactItem).join("") : emptyState("No urgent admin actions right now."));
  }

  function renderAdminReportActivity() {
    const activityRows = adminActivityRows(state.reportActivityFilter);
    const label = state.reportActivityFilter === "all" ? "Live user activity" : `${state.reportActivityFilter} activity`;
    setHtml("adminReportActivityList", activityRows.length ? activityRows.map(reportActivityRow).join("") : emptyState(`${label} will appear here.`));
  }

  function adminContentHealth(summary) {
    const modules = state.data.courses.reduce((sum, course) => sum + adminCourseModules(course).length, 0);
    const quizzes = state.data.courses.reduce((sum, course) => sum + adminCourseQuizzes(course).length, 0);
    return [
      { label: "Courses", value: state.data.courses.length, tone: "blue" },
      { label: "Published", value: summary.publishedCourses, tone: "green" },
      { label: "Draft", value: summary.draftCourses, tone: "amber" },
      { label: "Modules", value: modules, tone: "violet" },
      { label: "Quizzes", value: quizzes, tone: "cyan" },
      { label: "Shop items", value: state.data.shopItems.length, tone: "rose" }
    ];
  }

  function adminWorkload(summary) {
    const overdueTasks = state.data.batchTasks.filter((task) => {
      if (!task.deadline) return false;
      const deadline = new Date(task.deadline);
      return !isNaN(deadline.getTime()) && deadline < new Date();
    }).length;
    return [
      { label: "Pending reviews", value: summary.pendingReviews, tone: summary.pendingReviews ? "rose" : "green" },
      { label: "Reviewed", value: summary.reviewedItems, tone: "green" },
      { label: "Task submissions", value: state.data.taskSubmissions.length, tone: "blue" },
      { label: "Project uploads", value: state.data.projects.length, tone: "violet" },
      { label: "Overdue tasks", value: overdueTasks, tone: overdueTasks ? "rose" : "green" },
      { label: "Announcements", value: state.data.announcements.length, tone: "amber" }
    ];
  }

  function adminCourseSnapshotRows() {
    return state.data.courses.slice(0, 6).map((course) => {
      const modules = adminCourseModules(course).length;
      const quizzes = adminCourseQuizzes(course).length;
      const enrolled = activeEnrollments().filter((row) => sameId(row.course_id, course.id)).length;
      const avg = averageCourseProgress(course.id);
      return {
        badge: "CO",
        title: course.title || "Untitled course",
        meta: `${modules} modules - ${quizzes} quizzes - ${enrolled} enrolled`,
        value: `${avg}%`,
        progress: avg
      };
    });
  }

  function adminBatchSnapshotRows() {
    return state.data.batches.slice(0, 6).map((batch) => {
      const course = findById(state.data.courses, batch.course_id);
      const mentor = findById(state.data.users, batch.mentor_id);
      const tasks = state.data.batchTasks.filter((task) => sameId(task.batch_id, batch.id)).length;
      const students = state.data.users.filter((user) => sameId(user.batch_id, batch.id) || String(user.batch_id || "").toLowerCase() === String(batch.name || "").toLowerCase()).length;
      return {
        badge: "BA",
        title: batch.name || "Untitled batch",
        meta: `${course?.title || "No course"} - ${mentor?.name || "No mentor"} - ${tasks} tasks`,
        value: `${students}/${batch.capacity || "-"}`,
        progress: Math.min(100, Number(batch.progress || 0))
      };
    });
  }

  function adminAttentionRows(summary) {
    const rows = [];
    if (summary.pendingReviews) rows.push({ badge: "RV", title: "Review pending work", meta: `${summary.pendingReviews} submissions/projects need checking`, value: "Open" });
    const unassignedBatches = state.data.batches.filter((batch) => !batch.mentor_id).length;
    if (unassignedBatches) rows.push({ badge: "BA", title: "Assign mentors", meta: `${unassignedBatches} batches without mentor`, value: "Fix" });
    const draftCourses = summary.draftCourses;
    if (draftCourses) rows.push({ badge: "CO", title: "Publish course drafts", meta: `${draftCourses} courses are still draft`, value: "Edit" });
    const noModuleCourses = state.data.courses.filter((course) => !adminCourseModules(course).length).length;
    if (noModuleCourses) rows.push({ badge: "MD", title: "Add module content", meta: `${noModuleCourses} courses missing modules`, value: "Build" });
    const noQuizCourses = state.data.courses.filter((course) => !adminCourseQuizzes(course).length).length;
    if (noQuizCourses) rows.push({ badge: "QZ", title: "Add quiz checks", meta: `${noQuizCourses} courses missing quizzes`, value: "Build" });
    return rows.slice(0, 5);
  }

  function averageCourseProgress(courseId) {
    const rows = state.data.progress.filter((row) => sameId(row.course_id, courseId));
    if (!rows.length) return 0;
    return Math.round(rows.reduce((sum, row) => sum + estimateProgress(row), 0) / rows.length);
  }

  function adminCourseModules(course, includeDeleted = false) {
    const modules = course?.modules;
    if (Array.isArray(modules)) return includeDeleted ? modules : modules.filter((module) => !module?.deleted_at);
    if (typeof modules === "string") {
      try {
        const parsed = JSON.parse(modules);
        return Array.isArray(parsed) ? (includeDeleted ? parsed : parsed.filter((module) => !module?.deleted_at)) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function adminCourseQuizzes(course) {
    return adminCourseModules(course).filter((module) => {
      const quiz = module?.quiz || module?.module_quiz || module?.quizQuestions || module?.questions;
      if (Array.isArray(quiz)) return quiz.length > 0;
      if (Array.isArray(quiz?.questions)) return quiz.questions.length > 0;
      return Boolean(quiz && Object.keys(quiz).length);
    });
  }

  function adminActivityRows(filter = "all") {
    const rows = [
      ...state.data.users.map((user) => ({
        name: user.name || user.email || "User",
        detail: `Joined as ${user.role || "learner"}`,
        time: user.created_at,
        badge: initials(user.name || user.email || "US"),
        type: "all"
      })),
      ...state.data.courses.map((course) => ({
        name: course.title || "Course",
        detail: `Course ${course.status || "created"}`,
        time: course.created_at,
        badge: "CO",
        type: "courses"
      })),
      ...state.data.userCourses.map((row) => {
        const user = findById(state.data.users, row.user_id || row.student_id);
        const course = findById(state.data.courses, row.course_id);
        return {
          name: user?.name || user?.email || "Learner",
          detail: `Enrolled in ${course?.title || "a course"}`,
          time: row.enrolled_at || row.created_at,
          badge: "CO",
          type: "courses"
        };
      }),
      ...state.data.batchTasks.map((task) => ({
        name: task.title || task.name || "Batch task",
        detail: "Task assigned to a batch",
        time: task.created_at,
        badge: "TS",
        type: "tasks"
      })),
      ...state.data.taskSubmissions.map((row) => {
        const user = findById(state.data.users, row.student_id || row.user_id);
        const task = findById(state.data.batchTasks, row.task_id);
        return {
          name: user?.name || user?.email || "Learner",
          detail: `Submitted ${task?.title || task?.name || "a task"}`,
          time: row.submitted_at || row.created_at,
          badge: "TS",
          type: "tasks"
        };
      }),
      ...state.data.projects.map((project) => {
        const user = findById(state.data.users, project.student_id || project.user_id);
        return {
          name: user?.name || user?.email || "Learner",
          detail: `Project review: ${project.title || "submitted work"}`,
          time: project.submitted_at || project.created_at,
          badge: "RV",
          type: "reviews"
        };
      }),
      ...state.data.chats.map((chat) => {
        const user = findById(state.data.users, chat.user_id || chat.sender_id);
        return {
          name: user?.name || user?.email || chat.sender_name || "Chat",
          detail: "Posted in batch chat",
          time: chat.created_at,
          badge: "MS",
          type: "all"
        };
      })
    ].filter((row) => row.time)
      .filter((row) => filter === "all" || row.type === filter)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 7);
    return rows;
  }

  function adminLearnerRows() {
    const students = state.data.users.filter((user) => user.role === "student");
    return students.map((student) => {
      const userId = String(student.id || "");
      const progressScore = state.data.progress
        .filter((row) => sameId(row.user_id || row.student_id, userId))
        .reduce((sum, row) => sum + estimateProgress(row), 0);
      const submissions = state.data.taskSubmissions.filter((row) => sameId(row.student_id || row.user_id, userId)).length;
      const projects = state.data.projects.filter((row) => sameId(row.student_id || row.user_id, userId)).length;
      const enrollments = activeEnrollments().filter((row) => sameId(row.user_id || row.student_id, userId)).length;
      return {
        name: student.name || student.email || "Learner",
        value: progressScore + submissions * 25 + projects * 30 + enrollments * 15,
        meta: `${enrollments} courses`
      };
    }).filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  function weeklyEventSeries() {
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    const current = Array(7).fill(0);
    const previous = Array(7).fill(0);
    const today = new Date();
    const weekStart = startOfDay(new Date(today));
    const day = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - day + 1);
    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const events = [
      ...state.data.users.map((item) => item.created_at),
      ...state.data.userCourses.map((item) => item.enrolled_at || item.created_at),
      ...state.data.taskSubmissions.map((item) => item.submitted_at || item.created_at),
      ...state.data.projects.map((item) => item.submitted_at || item.created_at),
      ...state.data.chats.map((item) => item.created_at)
    ].filter(Boolean);

    events.forEach((value) => {
      const date = new Date(value);
      if (isNaN(date.getTime())) return;
      const diff = Math.floor((startOfDay(date) - weekStart) / 86400000);
      const prevDiff = Math.floor((startOfDay(date) - prevStart) / 86400000);
      if (diff >= 0 && diff < 7) current[diff] += 1;
      if (prevDiff >= 0 && prevDiff < 7) previous[prevDiff] += 1;
    });
    return { labels, current, previous };
  }

  function reportActivityRow(row) {
    return `
      <article class="report-row">
        <span class="report-avatar">${escapeHtml(row.badge || initials(row.name))}</span>
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          <small>${escapeHtml(row.detail)}</small>
        </div>
        <time>${escapeHtml(relativeTime(row.time))}</time>
      </article>
    `;
  }

  function reportBreakdownItem(item) {
    return `
      <div class="report-breakdown-item">
        <span style="--dot:${item.color}"></span>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${Number(item.value || 0)}</small>
      </div>
    `;
  }

  function reportBarRow(row) {
    const width = Math.min(100, Math.max(8, Number(row.value || 0)));
    return `
      <div class="report-bar-row">
        <span class="report-avatar small">${escapeHtml(initials(row.name))}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <div class="report-bar-track"><span style="width:${width}%"></span></div>
        <small>${escapeHtml(row.meta || `${row.value} pts`)}</small>
      </div>
    `;
  }

  function reportKpiItem(item) {
    return `
      <article class="report-kpi ${escapeAttr(item.tone || "blue")}">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </article>
    `;
  }

  function reportCompactItem(item) {
    const progress = Number.isFinite(Number(item.progress)) ? Math.max(0, Math.min(100, Number(item.progress))) : null;
    return `
      <article class="report-compact-row">
        <span class="report-avatar small">${escapeHtml(item.badge || initials(item.title))}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.meta || "")}</small>
          ${progress === null ? "" : `<div class="report-mini-track"><span style="width:${progress}%"></span></div>`}
        </div>
        <b>${escapeHtml(item.value || "")}</b>
      </article>
    `;
  }

  function reportLineSvg(labels, current, previous) {
    const max = Math.max(1, ...current, ...previous);
    const points = (values) => values.map((value, index) => {
      const x = 18 + index * 46;
      const y = 118 - (Number(value || 0) / max) * 96;
      return `${x},${y}`;
    }).join(" ");
    const labelsSvg = labels.map((label, index) => `<text x="${18 + index * 46}" y="143">${escapeHtml(label)}</text>`).join("");
    return `
      <svg viewBox="0 0 320 150" role="img" aria-label="Weekly active learners chart">
        <line x1="16" y1="118" x2="296" y2="118" class="axis"></line>
        <line x1="16" y1="72" x2="296" y2="72" class="grid"></line>
        <line x1="16" y1="26" x2="296" y2="26" class="grid"></line>
        <polyline points="${points(previous)}" class="previous"></polyline>
        <polyline points="${points(current)}" class="current"></polyline>
        ${labelsSvg}
      </svg>
    `;
  }

  function reportSparklineSvg(values) {
    const max = Math.max(1, ...values);
    const points = values.map((value, index) => {
      const x = 4 + index * 22;
      const y = 44 - (Number(value || 0) / max) * 34;
      return `${x},${y}`;
    }).join(" ");
    return `<svg viewBox="0 0 150 52" role="img" aria-label="Learning trend"><polyline points="${points}" class="current"></polyline></svg>`;
  }

  function relativeTime(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) return "Now";
    const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
    if (diffMinutes < 60) return `${diffMinutes || 1}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(value);
  }

  function setHtml(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = value;
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
      const enrolled = activeEnrollments().filter((row) => row.course_id === course.id).length;
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

  function renderSupport() {
    const list = document.getElementById("supportTicketList");
    const thread = document.getElementById("supportThread");
    if (!list || !thread) return;
    const rows = filteredSupportTickets();
    setText("supportTicketCount", `${rows.length} ticket${rows.length === 1 ? "" : "s"}`);
    if (!state.selectedSupportTicketId && rows[0]) {
      state.selectedSupportTicketId = rows[0].id || rows[0].ticket_id;
    }
    list.innerHTML = rows.length ? rows.map(adminSupportTicketCard).join("") : emptyState("No support tickets match this view.");
    list.querySelectorAll("[data-select-support-ticket]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSupportTicketId = button.dataset.selectSupportTicket;
        renderSupport();
        markAdminSupportNotificationsRead(button.dataset.selectSupportTicket);
      });
    });
    renderSupportThread();
  }

  function filteredSupportTickets() {
    const statusFilter = state.supportStatusFilter || "all";
    const query = state.supportSearch || "";
    return state.data.supportTickets
      .filter((ticket) => statusFilter === "all" || String(ticket.status || "open").toLowerCase() === statusFilter)
      .filter((ticket) => matchesText(query, ticket.subject, ticket.message, ticket.category, ticket.user_role, ticket.status, supportUser(ticket)?.name, supportUser(ticket)?.email))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  }

  function adminSupportTicketCard(ticket) {
    const user = supportUser(ticket);
    const selected = sameId(ticket.id || ticket.ticket_id, state.selectedSupportTicketId);
    const unread = supportUnreadForAdmin(ticket).length;
    return `
      <button class="support-ticket-row ${selected ? "active" : ""}" type="button" data-select-support-ticket="${escapeAttr(ticket.id || ticket.ticket_id)}">
        <span class="badge ${statusColor(ticket.status || "open")}">${escapeHtml(humanizeSupportStatus(ticket.status))}</span>
        <strong>${escapeHtml(ticket.subject || "Support ticket")}</strong>
        <small>${escapeHtml(user?.name || user?.email || "Unknown user")} - ${escapeHtml(ticket.user_role || "user")} - ${escapeHtml(ticket.category || "general")}</small>
        <em>${escapeHtml(ticket.priority || "normal")}${unread ? ` - ${unread} unread` : ""}</em>
      </button>
    `;
  }

  function renderSupportThread() {
    const target = document.getElementById("supportThread");
    if (!target) return;
    const ticket = selectedSupportTicket();
    const form = document.getElementById("supportReplyForm");
    if (!ticket) {
      target.innerHTML = emptyState("Choose a ticket to view the support conversation.");
      if (form) form.querySelectorAll("textarea,input,select,button").forEach((field) => { field.disabled = true; });
      setText("supportThreadMeta", "Choose a ticket to reply.");
      return;
    }

    if (form) form.querySelectorAll("textarea,input,select,button").forEach((field) => { field.disabled = false; });
    setValue("supportStatusUpdate", ticket.status || "open");
    setValue("supportPriorityUpdate", ticket.priority || "normal");
    const user = supportUser(ticket);
    setText("supportThreadMeta", `${user?.name || user?.email || "Unknown user"} - ${humanizeSupportStatus(ticket.status)} - ${ticket.priority || "normal"}`);
    const messages = supportMessagesForTicket(ticket).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    target.innerHTML = `
      <div class="support-thread-summary">
        <span class="badge ${statusColor(ticket.status || "open")}">${escapeHtml(humanizeSupportStatus(ticket.status))}</span>
        <h3>${escapeHtml(ticket.subject || "Support ticket")}</h3>
        <p>${escapeHtml(ticket.message || "")}</p>
        ${ticket.attachment_url ? `<a class="ghost-btn" href="${escapeAttr(ticket.attachment_url)}" target="_blank" rel="noopener">Open attachment</a>` : ""}
      </div>
      ${messages.length ? messages.map(adminSupportMessageBubble).join("") : emptyState("No thread messages yet.")}
    `;
  }

  async function submitAdminSupportReply(event) {
    event.preventDefault();
    const ticket = selectedSupportTicket();
    if (!ticket) return;
    const message = valueOf("supportReplyMessage");
    const status = valueOf("supportStatusUpdate") || ticket.status || "open";
    const priority = valueOf("supportPriorityUpdate") || ticket.priority || "normal";
    const file = document.getElementById("supportReplyAttachment")?.files?.[0] || null;
    if (!message && status === ticket.status && priority === ticket.priority && !file) return;
    try {
      const attachmentUrl = file ? await uploadSupportAttachment(file) : null;
      await sendAdminSupportReply(ticket, message, attachmentUrl, status, priority);
      document.getElementById("supportReplyMessage").value = "";
      document.getElementById("supportReplyAttachment").value = "";
      showAlert(String(status).toLowerCase() === "resolved" ? "Support ticket resolved and deleted." : "Support ticket updated.");
      await loadAllData({ force: true, silent: true });
      state.selectedSupportTicketId = String(status).toLowerCase() === "resolved" ? null : ticket.id || ticket.ticket_id;
      renderSupport();
    } catch (error) {
      showAlert(error.message || "Support update failed.", true);
    }
  }

  async function sendAdminSupportReply(ticket, message, attachmentUrl, status, priority) {
    const ticketId = ticket.id || ticket.ticket_id;
    const resolved = String(status || "").toLowerCase() === "resolved";
    if (getClient()?.rpc) {
      const { error } = await getClient().rpc("lms_support_reply", {
        actor_user_id: state.admin.id,
        actor_role: "admin",
        target_ticket_id: ticketId,
        reply_message: message || "",
        reply_attachment_url: attachmentUrl,
        next_status: status,
        next_priority: priority
      });
      if (!error) {
        if (resolved) await permanentlyDeleteSupportTicket(ticketId);
        return;
      }
      if (!isMissingRpcError(error)) throw error;
    }
    if (message || attachmentUrl) {
      const { error: messageError } = await getClient().from("support_messages").insert({
        ticket_id: ticketId,
        sender_id: state.admin.id,
        sender_role: "admin",
        message: message || "",
        attachment_url: attachmentUrl,
        created_at: new Date().toISOString()
      });
      if (messageError) throw messageError;
      await createSupportOwnerNotification(ticket, "Admin has replied to your support request.");
    }
    if (resolved) {
      await permanentlyDeleteSupportTicket(ticketId);
      return;
    }
    const { error } = await getClient().from("support_tickets").update({
      status,
      priority,
      updated_at: new Date().toISOString()
    }).eq("id", ticketId);
    if (error) throw error;
  }

  async function createSupportOwnerNotification(ticket, body) {
    if (!ticket?.user_id) return;
    const { error } = await getClient().from("support_notifications").insert({
      ticket_id: ticket.id || ticket.ticket_id,
      recipient_user_id: ticket.user_id,
      recipient_role: ticket.user_role || "student",
      title: "Support Ticket Reply",
      body,
      channel: "in_app",
      is_read: false,
      created_at: new Date().toISOString()
    });
    if (error && !isSchemaShapeError(error)) throw error;
  }

  async function permanentlyDeleteSupportTicket(ticketId) {
    const client = getClient();
    if (client?.rpc) {
      const { error } = await client.rpc("lms_delete_resolved_support_ticket", { target_ticket_id: ticketId });
      if (!error) return;
      if (!isMissingRpcError(error)) throw error;
    }
    await deleteSupportChildRows("support_notifications", ticketId);
    await deleteSupportChildRows("support_attachments", ticketId);
    await deleteSupportChildRows("support_messages", ticketId);
    const { error } = await client.from("support_tickets").delete().eq("id", ticketId);
    if (error) throw error;
  }

  async function deleteSupportChildRows(table, ticketId) {
    const { error } = await getClient().from(table).delete().eq("ticket_id", ticketId);
    if (error && !isSchemaShapeError(error)) throw error;
  }

  async function uploadSupportAttachment(file) {
    const safeName = String(file.name || "support-file").replace(/[^a-z0-9._-]+/gi, "-");
    const path = `admin/${state.admin.id}/${Date.now()}-${safeName}`;
    const { error } = await getClient().storage.from("support-attachments").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    const { data } = getClient().storage.from("support-attachments").getPublicUrl(path);
    return data?.publicUrl || "";
  }

  function selectedSupportTicket() {
    return state.data.supportTickets.find((ticket) => sameId(ticket.id || ticket.ticket_id, state.selectedSupportTicketId)) || null;
  }

  function supportMessagesForTicket(ticket) {
    const ticketId = ticket.id || ticket.ticket_id;
    return state.data.supportMessages.filter((message) => sameId(message.ticket_id, ticketId));
  }

  function supportUnreadForAdmin(ticket) {
    return supportMessagesForTicket(ticket).filter((message) => !message.is_read && String(message.sender_role || "").toLowerCase() !== "admin");
  }

  function supportUser(ticket) {
    return findById(state.data.users, ticket?.user_id);
  }

  function adminSupportMessageBubble(message) {
    const user = findById(state.data.users, message.sender_id);
    const senderRole = String(message.sender_role || "").toLowerCase();
    const mine = senderRole === "admin";
    return `
      <div class="message-row ${mine ? "mine" : ""}">
        <strong>${escapeHtml(mine ? "Admin" : user?.name || senderRole || "User")}</strong>
        <p>${escapeHtml(message.message || "")}</p>
        ${message.attachment_url ? `<a class="ghost-btn" href="${escapeAttr(message.attachment_url)}" target="_blank" rel="noopener">Open attachment</a>` : ""}
        <small>${escapeHtml(formatDateTime(message.created_at))} - ${message.is_read ? "Read" : "Unread"}</small>
      </div>
    `;
  }

  function humanizeSupportStatus(status) {
    return String(status || "open").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  async function markAdminSupportNotificationsRead(ticketId) {
    const unreadIds = state.data.supportNotifications
      .filter((item) => sameId(item.ticket_id, ticketId) && String(item.recipient_role || "").toLowerCase() === "admin" && !item.is_read)
      .map((item) => item.id)
      .filter(Boolean);
    if (unreadIds.length) {
      await getClient().from("support_notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unreadIds);
    }
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
        const allModules = adminCourseModules(course, true);
        const archivedContent = allModules.filter((module) => module?.deleted_at).length
          + allModules.reduce((sum, module) => sum + (module?.lessons || []).filter((lesson) => lesson?.deleted_at).length, 0);
        return `
          <article class="course-card">
            <img class="course-thumb" src="${escapeAttr(course.thumbnail_url || "image/login/loginimg.webp")}" alt="">
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
                ${String(course.status || "").toLowerCase() === "archived"
                  ? `<button class="soft-btn" type="button" data-restore-course="${course.id}">Restore</button>`
                  : `<button class="danger-btn" type="button" data-delete-course="${course.id}">Archive</button>`}
                ${archivedContent ? `<button class="soft-btn" type="button" data-restore-course-content="${course.id}">Recover Content (${archivedContent})</button>` : ""}
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
    grid.querySelectorAll("[data-restore-course]").forEach((button) => {
      button.addEventListener("click", () => restoreRecord("courses", button.dataset.restoreCourse, "Draft"));
    });
    grid.querySelectorAll("[data-restore-course-content]").forEach((button) => {
      button.addEventListener("click", () => restoreCourseContent(button.dataset.restoreCourseContent));
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
              ${String(batch.status || "").toLowerCase() === "archived"
                ? `<button class="soft-btn" type="button" data-restore-batch="${batch.id}">Restore</button>`
                : `<button class="danger-btn" type="button" data-delete-batch="${batch.id}">Archive</button>`}
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
    grid.querySelectorAll("[data-restore-batch]").forEach((button) => {
      button.addEventListener("click", () => restoreRecord("batches", button.dataset.restoreBatch, "draft"));
    });
  }

  function renderEnrollments() {
    const table = document.getElementById("enrollmentsTable");
    if (!table) return;
    const query = searchQuery();
    const rows = state.data.userCourses.filter((enrollment) => {
      if (enrollment.deleted_at || ["archived", "removed"].includes(String(enrollment.status || "").toLowerCase())) return false;
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
              ${String(task.status || "").toLowerCase() === "archived"
                ? `<button class="soft-btn" type="button" data-restore-task="${task.id}">Restore</button>`
                : `<button class="danger-btn" type="button" data-delete-task="${task.id}">Archive</button>`}
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
    grid.querySelectorAll("[data-restore-task]").forEach((button) => {
      button.addEventListener("click", () => restoreRecord("batch_tasks", button.dataset.restoreTask, "active"));
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
          ${item.image_url ? `<img class="shop-thumb" src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name || "Shop item")}">` : `<div class="shop-thumb no-image">No Image Available</div>`}
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
    const submissions = state.data.taskSubmissions.filter((submission) => {
      const task = findById(state.data.batchTasks, submission.task_id);
      const student = findById(state.data.users, submission.student_id || submission.user_id);
      return matchesText(query, task?.title, student?.name, student?.email, submission.status, submission.drive_link, submission.file_url);
    });

    document.getElementById("projectsList").innerHTML = projects.length
      ? projects.map(projectCardCompact).join("")
      : emptyState(hasQuery(query) ? "No projects match your search." : "No project submissions.");

    document.getElementById("submissionsList").innerHTML = submissions.length
      ? submissions.map(adminSubmissionRow).join("")
      : emptyState(hasQuery(query) ? "No submissions match your search." : "No task submissions."); /*
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
      */

    document.querySelectorAll("[data-review-project]").forEach((button) => {
      button.addEventListener("click", () => openProjectReviewModal(findById(state.data.projects, button.dataset.reviewProject)));
    });
    document.querySelectorAll("[data-review-submission]").forEach((button) => {
      button.addEventListener("click", () => openSubmissionReviewModal(findById(state.data.taskSubmissions, button.dataset.reviewSubmission)));
    });
  }

  function adminSubmissionRow(submission) {
    const task = findById(state.data.batchTasks, submission.task_id);
    const student = findById(state.data.users, submission.student_id || submission.user_id);
    const link = taskSubmissionLink(submission);
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(task?.title || "Task submission")}</strong>
          <small>${escapeHtml(student?.name || "Unknown student")} - ${formatDate(submission.submitted_at || submission.created_at)}</small>
          ${link ? `<small><a href="${escapeAttr(link)}" target="_blank" rel="noopener">Open Google Drive Link</a></small>` : ""}
        </div>
        <div class="row-actions">
          <span class="badge ${statusColor(submission.status)}">${escapeHtml(submission.status || "pending")}</span>
          <button class="ghost-btn" type="button" data-review-submission="${submission.id}">Review</button>
        </div>
      </div>
    `;
  }

  function taskSubmissionLink(submission) {
    return String(submission?.drive_link || submission?.submission_url || submission?.file_url || "").trim();
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
      <form class="assignment-form assignment-form-pro" id="courseAssignmentForm">
        <div class="assignment-course-head">
          <span class="badge ${statusColor(course.status)}">${escapeHtml(course.status || "Draft")}</span>
          <h3>${escapeHtml(course.title || "Untitled course")}</h3>
          <div class="assignment-head-stats">
            <span><strong id="assignedStudentsCount">${assignedStudents.size}</strong> Students</span>
            <span><strong id="assignedMentorsCount">${assignedMentors.size}</strong> Mentors</span>
          </div>
          <p>${escapeHtml(course.category || "General")} · ${escapeHtml(formatCoursePrice(course.price))}</p>
        </div>

        <section class="assignment-section">
          <div class="assignment-section-head">
            <h4>Assign Students</h4>
            <small>${students.length} available</small>
          </div>
          <label class="assignment-search">
            <span>Search student</span>
            <input id="assignmentStudentSearch" placeholder="Name or email">
          </label>
          <div class="assignment-list" data-assignment-list="students">
            ${students.length ? students.map((user) => assignmentOption(user, assignedStudents.has(String(user.id)), "assignedStudents")).join("") : `<div class="assignment-empty">No student users found.</div>`}
          </div>
        </section>

        <section class="assignment-section">
          <div class="assignment-section-head">
            <h4>Assign Mentors</h4>
            <small>${mentors.length} available</small>
          </div>
          <label class="assignment-search">
            <span>Search mentor</span>
            <input id="assignmentMentorSearch" placeholder="Name or email">
          </label>
          <div class="assignment-list" data-assignment-list="mentors">
            ${mentors.length ? mentors.map((user) => assignmentOption(user, assignedMentors.has(String(user.id)), "assignedMentors")).join("") : `<div class="assignment-empty">No mentor users found.</div>`}
          </div>
        </section>

        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Assignment</button>
        </div>
      </form>
    `);

    bindAssignmentSearch("assignmentStudentSearch", "students");
    bindAssignmentSearch("assignmentMentorSearch", "mentors");
    modalBody.querySelectorAll("input[name='assignedStudents'], input[name='assignedMentors']").forEach((input) => {
      input.addEventListener("change", updateAssignmentCounts);
    });
    updateAssignmentCounts();

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
        <div class="import-callout">
          Search, select a student, then assign a course. The list shows only name and email to keep assignment clean.
        </div>
        <div class="form-row two">
          <div>
            <label for="enrollmentSearch">Search Student</label>
            <input id="enrollmentSearch" placeholder="Type name or email">
          </div>
          <div>
            <label for="enrollmentUser">Select Student</label>
            <select id="enrollmentUser" required>
              ${students.map((student) => option(student.id, user?.id, `${student.name || "Student"} - ${student.email || ""}`)).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div>
            <label for="enrollmentCourse">Assign Course</label>
            <select id="enrollmentCourse" required>
              ${state.data.courses.map((item) => option(item.id, course?.id, item.title)).join("")}
            </select>
          </div>
        </div>
        <details class="advanced-form-options">
          <summary>Advanced assignment options</summary>
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
        </details>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Assign Course"}</button>
        </div>
      </form>
    `);

    document.getElementById("enrollmentSearch")?.addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      const select = document.getElementById("enrollmentUser");
      const rows = students.filter((student) => matchesText(query, student.name, student.email));
      select.innerHTML = rows.map((student) => option(student.id, user?.id, `${student.name || "Student"} - ${student.email || ""}`)).join("");
    });

    document.getElementById("enrollmentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveEnrollment({
        user_id: valueOf("enrollmentUser"),
        course_id: valueOf("enrollmentCourse"),
        status: valueOf("enrollmentStatus") || "active"
      }, valueOf("enrollmentBatch"), enrollment);
    });
  }

  function openEnrollmentModalLegacy(enrollment = null) {
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
        await loadAllData({ force: true });
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
        await loadAllData({ force: true });
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
        deadline: valueOf("taskDueDate") ? new Date(`${valueOf("taskDueDate")}T23:59:59`).toISOString() : null,
        drive_link: valueOf("taskDriveLink") || null
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
        await loadAllData({ force: true });
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
      statusOptions: ["pending", "approved", "changes_requested", "rejected"]
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
      await loadAllData({ force: true });
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
      coins: existingUser ? Number(payload.coins ?? existingUser.coins ?? 0) : Number(payload.coins ?? 0),
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
    if (!user?.id || !window.confirm(`Archive ${user.name || user.email || "this user"}? You can recover the account later.`)) return;
    try {
      const rpcArchived = await archiveRecordViaRpc("users", user.id);
      if (!rpcArchived) {
        const { error } = await getClient().from("users").update(softDeletePayload("users")).eq("id", user.id);
        if (error) throw error;
      }
      closeModal();
      await loadAllData({ force: true });
      showAlert("User archived.");
    } catch (error) {
      showAlert(error.message || "Unable to archive user.", true);
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
    let { data, error } = await getClient().rpc("lms_admin_save_auth_user", {
      admin_user_id: state.admin.id,
      target_user_id: assignment.targetUserId,
      user_payload: userPayload,
      assign_course_id: assignment.courseId,
      assign_batch_id: assignment.batchId
    });
    if (!error) return Array.isArray(data) ? data[0] : data;
    if (isMissingRpcError(error)) {
      throw new Error("Supabase Auth user creation is not configured yet. Run supabase-auth-production-setup.sql before adding LMS users.");
    }
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
        ? getClient().from("users").update(writePayload).eq("id", id).select(SELECTS.users)
        : getClient().from("users").insert(writePayload).select(SELECTS.users);
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
      request = supabaseClient.from("user_courses").update(payload).eq("id", current.id).select(SELECTS.userCourses);
    } else if (current) {
      request = supabaseClient
        .from("user_courses")
        .update(payload)
        .eq("user_id", current.user_id)
        .eq("course_id", current.course_id)
        .select(SELECTS.userCourses);
    } else {
      request = supabaseClient.from("user_courses").insert(payload).select(SELECTS.userCourses);
    }

    let { error } = await request;
    if (error && isSchemaShapeError(error)) {
      const compatiblePayload = stripKeys(payload, ["status"]);
      request = current?.id
        ? supabaseClient.from("user_courses").update(compatiblePayload).eq("id", current.id).select(SELECTS.userCourses)
        : current
          ? supabaseClient.from("user_courses").update(compatiblePayload).eq("user_id", current.user_id).eq("course_id", current.course_id).select(SELECTS.userCourses)
          : supabaseClient.from("user_courses").insert(compatiblePayload).select(SELECTS.userCourses);
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
      let request = supabaseClient.from("users").update(payload).select(SELECTS.users);
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
        ? supabaseClient.from("user_courses").update(softDeletePayload("user_courses")).eq("id", enrollment.id)
        : supabaseClient
          .from("user_courses")
          .update(softDeletePayload("user_courses"))
          .eq("user_id", enrollment.user_id)
          .eq("course_id", enrollment.course_id);
      const { error } = await request;
      if (error) throw error;
      await loadAllData({ force: true });
      showAlert("Enrollment removed.");
    } catch (error) {
      showAlert(error.message || "Enrollment remove failed.", true);
    }
  }

  async function saveCourseRecord(payload, id = null) {
    try {
      await writeCourseRecord(payload, id);
      closeModal();
      await loadAllData({ force: true });
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
        ? getClient().from("courses").update(writePayload).eq("id", id).select(SELECTS.courses)
        : getClient().from("courses").insert(writePayload).select(SELECTS.courses);
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
      await loadAllData({ force: true });
      showAlert("Course assignment saved.");
    } catch (error) {
      showAlert(error.message || "Course assignment failed.", true);
    }
  }

  async function removeCourseAssignment(userId, courseId) {
    const rows = activeEnrollments().filter((row) => (
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
      request = supabaseClient.from("user_courses").update(softDeletePayload("user_courses")).eq("id", enrollment.id);
    } else if (enrollment.user_id) {
      request = supabaseClient.from("user_courses").update(softDeletePayload("user_courses")).eq("user_id", enrollment.user_id).eq("course_id", enrollment.course_id);
    } else {
      request = supabaseClient.from("user_courses").update(softDeletePayload("user_courses")).eq("student_id", enrollment.student_id).eq("course_id", enrollment.course_id);
    }
    const { error } = await request;
    if (error) throw error;
  }

  async function upsertRecord(table, payload, id = null) {
    try {
      const supabaseClient = getClient();
      const returning = selectForTable(table);
      const request = id
        ? supabaseClient.from(table).update(payload).eq("id", id).select(returning)
        : supabaseClient.from(table).insert(payload).select(returning);
      const { error } = await request;
      if (error) throw error;
      closeModal();
      await loadAllData({ force: true });
      showAlert("Saved successfully.");
    } catch (error) {
      showAlert(error.message || "Save failed.", true);
    }
  }

  function selectForTable(table) {
    const spec = TABLE_SPECS.find((item) => item.table === table);
    return spec?.select || "id,created_at";
  }

  async function deleteRecord(table, id) {
    if (!id || !window.confirm("Archive this item? You can restore it later.")) return;
    try {
      const rpcArchived = await archiveRecordViaRpc(table, id);
      if (!rpcArchived) {
        const supabaseClient = getClient();
        const request = supabaseClient.from(table).update(softDeletePayload(table)).eq("id", id);
        const { error } = await request;
        if (error) throw error;
      }
      await loadAllData({ force: true });
      showAlert("Archived successfully.");
    } catch (error) {
      showAlert(error.message || "Archive failed.", true);
    }
  }

  function softDeletePayload(table) {
    const now = new Date().toISOString();
    if (table === "batch_chats") return { deleted_at: now, status: "archived" };
    return { status: "archived", deleted_at: now };
  }

  async function restoreRecord(table, id, status) {
    if (!id || !window.confirm("Restore this item?")) return;
    try {
      const rpcRestored = await restoreRecordViaRpc(table, id, status);
      if (!rpcRestored) {
        const { error } = await getClient().from(table).update({ status, deleted_at: null }).eq("id", id);
        if (error) throw error;
      }
      await loadAllData({ force: true });
      showAlert("Restored successfully.");
    } catch (error) {
      showAlert(error.message || "Restore failed.", true);
    }
  }

  async function archiveRecordViaRpc(table, id) {
    if (!state.admin?.id || !getClient()?.rpc) return false;
    const { error } = await getClient().rpc("lms_soft_delete", {
      actor_user_id: state.admin.id,
      target_table: table,
      target_id: id
    });
    if (!error) return true;
    if (isMissingRpcError(error)) return false;
    throw error;
  }

  async function restoreRecordViaRpc(table, id, status = "active") {
    if (!state.admin?.id || !getClient()?.rpc) return false;
    const { error } = await getClient().rpc("lms_restore_record", {
      actor_user_id: state.admin.id,
      target_table: table,
      target_id: id,
      restored_status: status || "active"
    });
    if (!error) return true;
    if (isMissingRpcError(error)) return false;
    throw error;
  }

  async function restoreCourseContent(courseId) {
    const course = findById(state.data.courses, courseId);
    if (!course || !window.confirm("Recover all archived playlists and playlist content in this course?")) return;
    const modules = adminCourseModules(course, true).map((module) => ({
      ...module,
      deleted_at: null,
      lessons: (module.lessons || []).map((lesson) => ({ ...lesson, deleted_at: null }))
    }));
    try {
      const { error } = await getClient().from("courses").update({ modules }).eq("id", course.id);
      if (error) throw error;
      await loadAllData({ force: true });
      showAlert("Archived course content recovered.");
    } catch (error) {
      showAlert(error.message || "Content recovery failed.", true);
    }
  }

  async function logout() {
    if (window.JenovateAuth?.signOut) await window.JenovateAuth.signOut();
    else clearStoredSessions();
    window.location.replace("login.html?from=logout");
  }

  function initializeHistoryNavigation() {
    if (!history.state?.adminView || !views[history.state.adminView]) {
      history.replaceState({ adminView: "dashboard" }, "", window.location.href);
    }
    history.pushState({ adminView: "dashboard", adminGuard: true }, "", window.location.href);
    window.addEventListener("popstate", () => {
      if (state.activeView !== "dashboard") {
        setView("dashboard", { historyMode: "none" });
        history.pushState({ adminView: "dashboard", adminGuard: true }, "", window.location.href);
      } else if (window.confirm("Go back to the login page?")) {
        window.location.replace("login.html?from=back");
      } else {
        history.pushState({ adminView: "dashboard", adminGuard: true }, "", window.location.href);
      }
    });
  }

  function setView(view, options = {}) {
    if (!views[view]) view = "dashboard";
    const previousView = state.activeView;
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
    if (options.historyMode !== "none" && previousView !== view) {
      history.pushState({ adminView: view }, "", window.location.href);
    }
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
      case "support":
        renderSupport();
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
    const searchText = `${user.name || ""} ${user.email || ""} ${user.username || ""}`.toLowerCase();
    return `
      <label class="assignment-option" data-assignment-option data-assignment-search="${escapeAttr(searchText)}">
        <span>
          <strong>${escapeHtml(user.name || user.email || "User")}</strong>
          <small>${escapeHtml(user.email || user.username || "")}</small>
        </span>
        <input type="checkbox" name="${escapeAttr(groupName)}" value="${escapeAttr(user.id)}" ${checked ? "checked" : ""}>
      </label>
    `;
  }

  function bindAssignmentSearch(inputId, listName) {
    const input = document.getElementById(inputId);
    const list = modalBody.querySelector(`[data-assignment-list="${listName}"]`);
    if (!input || !list) return;
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      list.querySelectorAll("[data-assignment-option]").forEach((optionNode) => {
        optionNode.hidden = Boolean(query) && !String(optionNode.dataset.assignmentSearch || "").includes(query);
      });
    });
  }

  function updateAssignmentCounts() {
    text("assignedStudentsCount", checkedValues("assignedStudents").length);
    text("assignedMentorsCount", checkedValues("assignedMentors").length);
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
      if (enrollment.deleted_at || ["archived", "removed", "cancelled"].includes(String(enrollment.status || "active").toLowerCase())) return;
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

  function activeEnrollments() {
    return state.data.userCourses.filter((enrollment) => (
      !enrollment.deleted_at
      && !["archived", "removed", "cancelled"].includes(String(enrollment.status || "active").toLowerCase())
    ));
  }

  function matchesUser(user, query) {
    return matchesText(query, user.name, user.email, user.username, user.role);
  }

  function userLearningSummary(user) {
    const enrollments = activeEnrollments().filter((row) => String(row.user_id || row.student_id || "") === String(user.id));
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

  function friendlySupabaseError(error) {
    const message = error?.message || "Unable to fetch";
    if (/permission|policy|rls/i.test(message)) return "permission/RLS blocked";
    if (/relation|table|does not exist/i.test(message)) return "table is missing";
    if (/column|schema cache|could not find/i.test(message)) return "schema cache/column mismatch";
    return message;
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

  function formatDateTime(value) {
    if (!value) return "Not set";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
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
