(function () {
  const SESSION_KEY = "jenovateAdminSession";
  const LEGACY_SESSION_KEY = "jenovateCurrentUser";
  const getClient = () => window.getSupabaseClient?.();
  const utils = window.JenovatePortalUtils;
  const {
    escapeAttr,
    escapeHtml,
    isSchemaShapeError,
    matchesText,
    setText,
    setValue
  } = utils;
  const arrayFrom = utils.parseIdList;
  const emptyState = (message) => `<div class="empty-state">${escapeHtml(message)}</div>`;
  const findById = (rows, id) => (rows || []).find((row) => sameId(row.id, id));
  const formatDate = (value) => utils.formatDate(value) || "Not set";
  const formatDateTime = (value) => utils.formatDateTime(value) || "Not set";
  const formatTableName = (table) => utils.formatTableName(table || "LMS data");
  const friendlySupabaseError = utils.friendlySupabaseError;
  const initials = (value) => utils.initialsFor(value, "A");
  const sameId = utils.sameId;
  const showAlert = (message, isError = false) => utils.showAlert(alertBox, message, isError, { errorMs: 12000, successMs: 3200 });
  const PAGE_SIZE = 20;
  const CHAT_PAGE_SIZE = 30;
  const QUERY_CACHE_TTL = 45_000;
  const QUERY_CACHE_PREFIX = "jenovate:lms:admin:";
  const MIN_ADMIN_PASSWORD_LENGTH = 8;
  const MAX_USER_CSV_BYTES = 1 * 1024 * 1024;
  const MAX_USER_CSV_ROWS = 500;
  const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const SUPPORT_ATTACHMENT_TYPES = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/csv",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ]);
  const SUPPORT_ATTACHMENT_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "csv", "txt", "doc", "docx", "xls", "xlsx"]);
  const SELECTS = {
    users: "id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,last_login_reward_date,status,deleted_at,courseNames,created_at,referral,referral_key",
    courses: "id,title,description,category,duration,module_type,instructor_name,thumbnail_url,image_url,rating,price,discount,difficulty,modules,is_featured,is_my_course,status,created_by_admin,quiz_coin_reward,quiz_pass_score,mentor_id,created_at,updated_at,google_form_url",
    batches: "id,name,course_id,mentor_id,capacity,enroll_limit,smart_waitlist,status,start_date,end_date,progress,enrolled_count,created_at",
    userCourses: "id,user_id,student_id,learner_id,course_id,batch_id,created_at,status,deleted_at",
    progress: "student_id,course_id,completed_lessons,completed_modules,rewarded_modules,quiz_completed,quiz_score,updated_at,quiz_attempts,quiz_failed_attempts,quiz_locked,quiz_rewatch_required,quiz_last_score,quiz_last_total,quiz_best_score,module_quiz_state",
    shopItems: "id,name,price,image_url,stock,status,deleted_at,created_at",
    projects: "id,title,description,status,student_id,user_id,batch_id,course_id,type,drive_link,file_url,file_urls,review_notes,feedback,reviewed_at,created_at,updated_at",
    batchTasks: "id,batch_id,course_id,title,description,file_url,drive_link,deadline,status,total_marks,published_at,deleted_at,created_by,created_at",
    taskSubmissions: "id,task_id,student_id,user_id,batch_id,course_id,status,drive_link,file_url,file_type,score,marks_obtained,total_marks,is_on_time,graded_at,submitted_at,created_at,deleted_at,feedback",
    quizAttempts: "id,student_id,course_id,score,total,pass_score,passed,attempt_number,module_id,module_order,module_title,quiz_id,max_score,answers,time_taken_seconds,duration_seconds,question_count,selected_question_ids,created_at,submitted_at,deleted_at",
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
      fallbackSelect: "id,name,email,role,username,phone,batch_id,expertise,course_ids,coins,streak_count,last_active_date,courseNames,created_at,referral,referral_key",
      limit: 1000
    },
    { key: "courses", table: "courses", select: SELECTS.courses, fallbackSelect: "id,title,description,category,duration,module_type,instructor_name,thumbnail_url,rating,price,difficulty,modules,is_featured,is_my_course,status,created_by_admin,quiz_coin_reward,quiz_pass_score,mentor_id,created_at,google_form_url", limit: 30 },
    { key: "batches", table: "batches", select: SELECTS.batches, limit: 30 },
    { key: "userCourses", table: "user_courses", select: SELECTS.userCourses, fallbackSelect: "user_id,course_id,created_at,status", limit: 1000 },
    { key: "progress", table: "student_course_progress", select: SELECTS.progress, limit: 1000 },
    { key: "shopItems", table: "shop_items", select: SELECTS.shopItems, fallbackSelect: "id,name,price,image_url,created_at", limit: PAGE_SIZE },
    { key: "projects", table: "projects", select: SELECTS.projects, fallbackSelect: "id,title,description,status,student_id,user_id,batch_id,course_id,type,file_urls,review_notes,feedback,created_at", limit: 500 },
    { key: "batchTasks", table: "batch_tasks", select: SELECTS.batchTasks, fallbackSelect: "id,batch_id,title,description,file_url,drive_link,deadline,created_by,created_at", limit: PAGE_SIZE, order: "created_at.desc" },
    { key: "taskSubmissions", table: "task_submissions", select: SELECTS.taskSubmissions, fallbackSelect: "id,task_id,student_id,status,drive_link,file_url,file_type,submitted_at,feedback", limit: 500, order: "submitted_at.desc" },
    { key: "quizAttempts", table: "student_quiz_attempts", select: SELECTS.quizAttempts, fallbackSelect: "id,student_id,course_id,score,total,pass_score,passed,attempt_number,module_id,module_order,module_title,quiz_id,max_score,answers,created_at,submitted_at", optional: true, limit: 500, order: "submitted_at.desc" },
    { key: "chats", table: "batch_chats", select: SELECTS.chats, limit: CHAT_PAGE_SIZE, scope: "selectedBatch", order: "created_at.desc" },
    { key: "announcements", table: "announcements", select: SELECTS.announcements, limit: 30, order: "published_at.desc" },
    { key: "supportTickets", table: "support_tickets", select: SELECTS.supportTickets, optional: true, limit: 60, order: "updated_at.desc" },
    { key: "supportMessages", table: "support_messages", select: SELECTS.supportMessages, optional: true, limit: 160, order: "created_at.desc" },
    { key: "supportNotifications", table: "support_notifications", select: SELECTS.supportNotifications, optional: true, limit: 60, scope: "adminNotifications", order: "created_at.desc" }
  ];
  const ADMIN_INITIAL_TABLE_KEYS = new Set([
    "users",
    "courses",
    "batches",
    "userCourses",
    "progress",
    "projects",
    "batchTasks",
    "taskSubmissions",
    "quizAttempts",
    "announcements"
  ]);

  const state = {
    admin: null,
    activeView: "dashboard",
    dashboardRole: "student",
    dashboardAnalysisRange: "weekly",
    reportActivityFilter: "all",
    userRole: "all",
    courseStatusFilter: "all",
    analyticsRange: "daily",   // daily | weekly | monthly
    globalQuery: "",
    supportStatusFilter: "all",
    supportSearch: "",
    selectedSupportTicketId: "",
    selectedBatchId: null,
    realtimeChannel: null,
    refreshTimer: null,
    analyticsAutoRefreshTimer: null,
    viewTransitionTimer: null,
    analyticsFilter: "overview",
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
      quizAttempts: [],
      chats: [],
      announcements: [],
      supportTickets: [],
      supportMessages: [],
      supportNotifications: []
    },
    queryCache: new Map(),
    inFlightRequests: new Map()
  };

  const tableClient = window.JenovatePortalData.createTableClient({
    applyScopedFilters,
    cachePrefix: QUERY_CACHE_PREFIX,
    cacheTtl: QUERY_CACHE_TTL,
    defaultOrderTables: ["batch_chats", "announcements", "batch_tasks"],
    getCacheScope: () => [state.admin?.id || state.admin?.email || "", state.selectedBatchId || ""].join(":"),
    getClient,
    onFetchError: (spec, error) => console.error(`Supabase fetch failed for ${spec.table}`, error),
    pageSize: PAGE_SIZE,
    state
  });

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
  // NOTE: Do NOT re-run verifyCurrentAdmin on pageshow/persisted —
  // doing so causes a redirect loop when user presses the Back button.

  async function init() {
    document.body.dataset.adminView = state.activeView;
    document.body.classList.add("admin-context-collapsed");
    wireNavigation();
    wireActions();

    if (!getClient()) {
      showAlert("Learning data service did not load. Check your internet connection and refresh.", true);
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
    document.body.classList.remove("admin-auth-pending");
    window.addEventListener("pageshow", enforceLiveSession);
    // NOTE: pagehide/beforeunload session clear removed — it caused session loss
    // on normal in-tab navigation. Session is cleared only on explicit logout.
    
    renderAdminIdentity();
    initializeHistoryNavigation();
    await loadAllData({ initial: true, force: true });
    setupRealtime();
    window.setTimeout(() => void loadAllData({ silent: true, force: true }), 0);
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
      document.body.classList.remove("admin-auth-pending");
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
      button.addEventListener("click", () => {
        const view = button.dataset.view;
        document.body.classList.toggle("admin-context-collapsed", view !== "dashboard");
        setView(view);
      });
    });

    document.querySelectorAll("[data-context-view]").forEach((button) => {
      button.addEventListener("click", () => {
        setView(button.dataset.contextView);
      });
    });

    document.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.jump));
    });

    document.querySelectorAll("[data-quick-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.quickAction;
        if (action === "course") {
          setView("courses");
          openCourseModal();
        } else if (action === "user") {
          setView("users");
          openUserCreateModal();
        } else if (action === "batch") {
          setView("batches");
          openBatchModal();
        } else if (action === "announcement") {
          setView("announcements");
          openAnnouncementModal();
        }
      });
    });

    wireReportTabs();

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
  }

  function wireActions() {
    setupAdminSidebarToggle();
    document.getElementById("refreshBtn").addEventListener("click", () => loadAllData({ force: true }));
    document.getElementById("refreshReviewsBtn").addEventListener("click", () => loadAllData({ force: true }));
    document.getElementById("reloadChatBtn").addEventListener("click", loadChats);
    document.getElementById("refreshSupportBtn")?.addEventListener("click", () => loadAllData({ force: true }));
    document.getElementById("homeBtn")?.addEventListener("click", () => {
      closeModal();
      document.body.classList.remove("admin-context-collapsed");
      setView("dashboard");
      document.querySelector(".admin-main")?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("#logoutBtn")) {
        event.preventDefault();
        logout();
      }
    });
    document.getElementById("profileQuickBtn")?.addEventListener("click", () => setView("profile"));
    document.getElementById("sidebarProfileBtn")?.addEventListener("click", () => setView("profile"));
    document.getElementById("adminAvatar")?.addEventListener("click", () => setView("profile"));
    document.getElementById("adminProfileForm")?.addEventListener("submit", saveAdminProfile);
    document.getElementById("resetProfileFormBtn")?.addEventListener("click", renderProfile);
    document.getElementById("addCourseBtn")?.addEventListener("click", () => openCourseModal());
    document.getElementById("addBatchBtn")?.addEventListener("click", () => openBatchModal());
    document.getElementById("addUserBtn")?.addEventListener("click", () => openUserCreateModal());
    document.getElementById("importUsersBtn")?.addEventListener("click", () => openUserImportModal());
    document.getElementById("exportUsersBtn")?.addEventListener("click", exportFilteredUsersCsv);
    document.getElementById("addEnrollmentBtn")?.addEventListener("click", () => openEnrollmentModal());
    document.getElementById("addTaskBtn")?.addEventListener("click", () => openTaskModal());
    document.getElementById("addShopBtn")?.addEventListener("click", () => openShopModal());
    document.getElementById("addAnnouncementBtn")?.addEventListener("click", () => openAnnouncementModal());
    document.getElementById("globalSearch")?.addEventListener("input", (event) => {
      state.globalQuery = event.target.value.trim().toLowerCase();
      renderActiveView();
    });
    document.getElementById("dashboardUserSearch")?.addEventListener("input", renderDashboardUsers);
    document.getElementById("userSearch")?.addEventListener("input", renderUsers);
    document.getElementById("courseStatusFilter")?.addEventListener("change", (event) => { state.courseStatusFilter = event.target.value || "all"; renderCourses(); });
    document.getElementById("chatComposer")?.addEventListener("submit", postChatMessage);
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

    document.getElementById("adminContextCollapse")?.addEventListener("click", () => {
      document.body.classList.add("admin-context-collapsed");
    });

    document.getElementById("adminTopbarMenu")?.addEventListener("click", () => {
      document.body.classList.toggle("admin-context-collapsed");
    });

    wireEnterpriseAnalyticsControls();

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function setupAdminSidebarToggle() {
    const button = document.getElementById("adminSidebarToggle");
    if (!button || button.dataset.wired === "true") return;
    button.dataset.wired = "true";
    const storageKey = "jenovateAdminSidebarCollapsed";
    const applyState = (collapsed) => {
      document.body.classList.toggle("admin-nav-collapsed", collapsed);
      button.setAttribute("aria-expanded", String(!collapsed));
      button.setAttribute("aria-label", collapsed ? "Open navigation" : "Close navigation");
      try {
        localStorage.setItem(storageKey, collapsed ? "1" : "0");
      } catch {
        // Ignore storage failures; the button should still work for this session.
      }
    };
    let saved = false;
    try {
      saved = localStorage.getItem(storageKey) === "1";
    } catch {
      saved = false;
    }
    applyState(saved);
    button.addEventListener("click", () => {
      applyState(!document.body.classList.contains("admin-nav-collapsed"));
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
    window.location.replace(`unauthorized.html?expected=${encodeURIComponent(expectedRole)}&role=${encodeURIComponent(profile.role)}`);
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
    setSyncStatus("Connecting to LMS data...");
    setLoading(!silent);
    try {
      const requestedSpecs = options.initial === true
        ? TABLE_SPECS.filter((spec) => ADMIN_INITIAL_TABLE_KEYS.has(spec.key))
        : TABLE_SPECS;
      const results = await Promise.all(requestedSpecs.map((spec) => fetchTableSafe(spec, { force: options.force === true })));
      const rows = Object.fromEntries(results.map((result) => [result.key, result.rows]));
      if (options.initial === true) {
        window.setTimeout(() => {
          void window.resolveSupabaseAssetsDeep?.(rows).then(renderActiveView).catch((error) => {
            console.warn("Deferred admin asset resolution failed", error);
          });
        }, 0);
      } else {
        await window.resolveSupabaseAssetsDeep?.(rows);
      }
      const failed = results.filter((result) => result.error);

      state.tableErrors = Object.fromEntries(failed.map((result) => [result.table, result.error.message || "Unable to fetch"]));
      state.data.users = (rows.users || state.data.users).map(normalizeUser);
      state.data.courses = rows.courses || state.data.courses;
      state.data.batches = rows.batches || state.data.batches;
      state.data.userCourses = (rows.userCourses || state.data.userCourses).map(normalizeEnrollment);
      state.data.progress = rows.progress || state.data.progress;
      state.data.shopItems = rows.shopItems || state.data.shopItems;
      state.data.projects = rows.projects || state.data.projects;
      state.data.batchTasks = rows.batchTasks || state.data.batchTasks;
      state.data.taskSubmissions = rows.taskSubmissions || state.data.taskSubmissions;
      state.data.chats = rows.chats || state.data.chats;
      state.data.announcements = rows.announcements || state.data.announcements;
      state.data.supportTickets = rows.supportTickets || state.data.supportTickets || [];
      state.data.supportMessages = rows.supportMessages || state.data.supportMessages || [];
      state.data.supportNotifications = rows.supportNotifications || state.data.supportNotifications || [];
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
        if (!silent) showAlert(`Some LMS data areas need attention: ${failed.map((item) => `${formatTableName(item.table)}: ${friendlySupabaseError(item.error)}`).join("; ")}`, true);
      } else {
        setSyncStatus(`LMS data synced ${stamp}`);
        if (!silent) showAlert("Admin data synced.");
      }
    } catch (error) {
      showAlert(error.message || "Unable to load admin data.", true);
      setSyncStatus("Sync needs attention");
    } finally {
      setLoading(false);
    }
  }

  async function fetchTableSafe(spec, options = {}) {
    return tableClient.fetchTableSafe(spec, options);
  }

  function isMissingColumnError(error) {
    return window.JenovatePortalData.isMissingColumnError(error);
  }

  async function fetchTable(spec, options = {}) {
    return tableClient.fetchTable(spec, options);
  }

  async function runSupabaseQuery(supabaseClient, spec, limit) {
    return tableClient.runSupabaseQuery(supabaseClient, spec, limit);
  }

  function applyScopedFilters(query, spec) {
    if (spec.scope === "selectedBatch" && state.selectedBatchId) {
      return query.eq("batch_id", state.selectedBatchId);
    }
    if (spec.scope === "adminNotifications") {
      return query.eq("recipient_role", "admin");
    }
    return query;
  }

  function normalizeLimit(limit = PAGE_SIZE) {
    return tableClient.normalizeLimit(limit);
  }

  function queryCacheKey(spec, limit) {
    return tableClient.queryCacheKey(spec, limit);
  }

  function readCachedRows(cacheKey) {
    return tableClient.readCachedRows(cacheKey);
  }

  function writeCachedRows(cacheKey, rows) {
    return tableClient.writeCachedRows(cacheKey, rows);
  }

  function revalidateTable(spec, limit, cacheKey) {
    return tableClient.revalidateTable(spec, limit, cacheKey);
  }

  function clearQueryCache() {
    return tableClient.clearQueryCache();
  }

  async function loadChats(options = {}) {
    try { state.data.chats = await fetchTable(TABLE_SPECS.find((spec) => spec.key === "chats"), { force: true }); renderChat(); if (!options.silent) showAlert("Chat refreshed."); }
    catch (error) { showAlert(error.message || "Unable to refresh chat.", true); }
  }

  function setupRealtime() {
    const supabaseClient = getClient();
    if (!supabaseClient?.channel) {
      startAnalyticsAutoRefresh();
      return;
    }
    if (state.realtimeChannel) return;

    const liveTables = Array.from(new Set(TABLE_SPECS.map((spec) => spec.table)));

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
        setSyncStatus("LMS data ready");
        stopAnalyticsAutoRefresh();
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        setSyncStatus("LMS data reconnecting");
        startAnalyticsAutoRefresh();
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
    stopAnalyticsAutoRefresh();
    if (state.realtimeChannel && getClient()?.removeChannel) {
      await getClient().removeChannel(state.realtimeChannel);
    }
    state.realtimeChannel = null;
  }

  function startAnalyticsAutoRefresh() {
    if (state.analyticsAutoRefreshTimer) return;
    state.analyticsAutoRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      loadAllData({ silent: true, force: true });
    }, 60_000);
  }

  function stopAnalyticsAutoRefresh() {
    if (!state.analyticsAutoRefreshTimer) return;
    window.clearInterval(state.analyticsAutoRefreshTimer);
    state.analyticsAutoRefreshTimer = null;
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
    setText("contextAdminName", name);
    renderProfile();
  }

  function renderProfile() {
    if (!views.profile || !state.admin) return;
    const adminRecord = findById(state.data.users, state.admin.id) || state.admin;
    const admin = normalizeUser({ ...state.admin, ...adminRecord });
    const students = state.data.users.filter((user) => user.role === "student" && String(user.email).toLowerCase() !== "adolf@gmail.com" && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")).length;
    const mentors = state.data.users.filter((user) => user.role === "mentor" || String(user.email).toLowerCase() === "adolf@gmail.com" || sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")).length;
    const syncText = syncStatus?.textContent || "LMS data ready";

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
    setText("adminContextLearningCount", state.data.courses.length + state.data.batches.length + state.data.batchTasks.length);

    renderAdminReportDashboard({ users, students, mentors, publishedCourses, draftCourses, activeBatches, pendingReviews, reviewedItems });
    renderAdminReferenceDashboard({ users, students, mentors, publishedCourses, draftCourses, activeBatches, pendingReviews, reviewedItems });
    renderEnterpriseAnalytics();

    if (document.getElementById("dashboardUsersList")) renderDashboardUsers();
    if (document.getElementById("courseProgressList")) renderCourseProgress();
    if (document.getElementById("dashboardReviewsList")) renderDashboardReviews();
    if (document.getElementById("dashboardShopList")) renderDashboardShop();
    if (document.getElementById("dashboardTasksList")) renderDashboardTasks();
    renderAnalyticsChart();
  }

  function dashboardSummary() {
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
    return { users, students, mentors, publishedCourses, draftCourses, activeBatches, pendingReviews, reviewedItems };
  }

  function ensureAdminReportDashboard() {
    const view = document.getElementById("dashboardView");
    if (!view || view.dataset.reportDashboard === "reference") return;
    view.dataset.reportDashboard = "reference";
    view.innerHTML = `
      <div class="admin-reference-dashboard">
        <section class="admin-reference-hero">
          <article class="admin-welcome-panel">
            <div>
              <h2 id="adminRefGreeting">Good Morning, Admin</h2>
              <p>Here is what is happening in your LMS today.</p>
            </div>
            <span><i></i><b id="adminRefSync">Last synced just now</b></span>
          </article>

          <article class="admin-status-panel">
            <span class="admin-ref-icon">SS</span>
            <div>
              <strong>System Status</strong>
              <p><i></i>All systems operational</p>
              <small id="adminRefUptime">Realtime sync ready</small>
            </div>
          </article>
        </section>

        <section class="admin-ref-kpis" id="adminRefKpis"></section>

        <section class="admin-ref-grid">
          <article class="admin-ref-card admin-ref-card-wide">
            <header>
              <div>
                <h3>Student Growth</h3>
                <p>New users, enrollments, submissions, and chat activity</p>
              </div>
            <div class="admin-ref-segments" aria-label="Growth period">
              <button class="active" type="button" data-admin-ref-range="weekly">Weekly</button>
              <button type="button" data-admin-ref-range="monthly">Monthly</button>
              <button type="button" data-admin-ref-range="yearly">Yearly</button>
            </div>
            </header>
            <div class="admin-ref-chart admin-ref-chart-large" id="adminRefGrowthChart"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <div>
                <h3>Platform Overview</h3>
                <p id="adminRefOverviewMeta">Live LMS metrics</p>
              </div>
              <button class="admin-ref-link" type="button" data-jump="courses">View Report</button>
            </header>
            <strong class="admin-ref-total" id="adminRefPlatformTotal">0</strong>
            <span class="admin-ref-trend" id="adminRefPlatformTrend">+0% from activity</span>
            <div class="admin-ref-chart" id="adminRefRevenueChart"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <div>
                <h3>Quick Actions</h3>
                <p>Common admin tasks</p>
              </div>
            </header>
            <div class="admin-ref-actions">
              <button type="button" data-quick-action="course"><span>+</span>Create Course</button>
              <button type="button" data-quick-action="user"><span>US</span>Add User</button>
              <button type="button" data-quick-action="batch"><span>BA</span>Create Batch</button>
              <button type="button" data-quick-action="announcement"><span>AN</span>Publish Announcement</button>
              <button type="button" data-jump="reviews"><span>RV</span>Review Work</button>
            </div>
          </article>

          <article class="admin-ref-card">
            <header>
              <h3>Top Courses</h3>
              <button class="admin-ref-link" type="button" data-jump="courses">View All</button>
            </header>
            <div class="admin-ref-table" id="adminRefTopCourses"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <h3>Recent Activity</h3>
              <button class="admin-ref-link" type="button" data-jump="users">View All</button>
            </header>
            <div class="admin-ref-activity" id="adminRefActivity"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <h3>Pending Tasks</h3>
              <button class="admin-ref-link" type="button" data-jump="reviews">View All</button>
            </header>
            <div class="admin-ref-pending" id="adminRefPending"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <h3>Support Tickets</h3>
              <button class="admin-ref-link" type="button" data-jump="support">View All</button>
            </header>
            <div class="admin-ref-support" id="adminRefSupport"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <h3>Batch Schedule</h3>
              <button class="admin-ref-link" type="button" data-jump="batches">View Calendar</button>
            </header>
            <div class="admin-ref-schedule" id="adminRefSchedule"></div>
          </article>

          <article class="admin-ref-card admin-ref-card-wide">
            <header>
              <h3>Latest Announcements</h3>
              <button class="admin-ref-link" type="button" data-jump="announcements">View All</button>
            </header>
            <div class="admin-ref-announcements" id="adminRefAnnouncements"></div>
          </article>

          <article class="admin-ref-card">
            <header>
              <h3>System Health</h3>
              <button class="admin-ref-link" type="button" data-jump="support">Open</button>
            </header>
            <div class="admin-ref-health" id="adminRefHealth"></div>
          </article>
        </section>
      </div>
    `;
    view.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.jump));
    });
    view.querySelectorAll("[data-quick-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.quickAction;
        if (action === "course") {
          setView("courses");
          openCourseModal();
        } else if (action === "user") {
          setView("users");
          openUserCreateModal();
        } else if (action === "batch") {
          setView("batches");
          openBatchModal();
        } else if (action === "announcement") {
          setView("announcements");
          openAnnouncementModal();
        }
      });
    });
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

  function renderAdminReferenceDashboard(summary) {
    if (!document.getElementById("adminRefKpis")) return;
    const adminName = state.admin?.name || state.admin?.username || "Admin";
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
    const enrollments = activeEnrollments();
    const submissions = state.data.taskSubmissions.filter((item) => !item.deleted_at);
    const projects = state.data.projects.filter((item) => !item.deleted_at);
    const avgProgress = state.data.progress.length
      ? Math.round(state.data.progress.reduce((sum, row) => sum + estimateProgress(row), 0) / state.data.progress.length)
      : 0;
    const totalCoins = state.data.users.reduce((sum, user) => sum + Number(user.coins || 0), 0);
    const weekly = weeklyEventSeries();
    const trend = dashboardAnalysisSeries(state.dashboardAnalysisRange);
    const activeLearners = learnerActivityIds(30).size;
    const supportOpen = state.data.supportTickets.filter((ticket) => !["resolved", "closed", "archived"].includes(String(ticket.status || "").toLowerCase())).length;

    setText("adminRefGreeting", `${greeting}, ${adminName}`);
    setText("adminRefSync", state.realtimeChannel ? "Realtime sync active" : "Last synced just now");
    setText("adminRefUptime", `${state.tableErrors && Object.keys(state.tableErrors).length ? "Check table warnings" : "Data services ready"}`);
    setText("adminRefPlatformTotal", `${summary.students + summary.mentors + state.data.courses.length + state.data.batches.length}`);
    setText("adminRefPlatformTrend", `${activeLearners} active learners in last 30 days`);
    setText("adminRefOverviewMeta", `${enrollments.length} enrollments - ${submissions.length + projects.length} review records`);

    const kpis = [
      { icon: "US", label: "Total Students", value: summary.students, meta: `${summary.mentors} mentors`, delta: `${activeLearners} active`, tone: "blue", spark: weekly.current },
      { icon: "CO", label: "Active Courses", value: summary.publishedCourses, meta: `${summary.draftCourses} draft`, delta: `${state.data.courses.length} total`, tone: "indigo", spark: trend.current.slice(-7) },
      { icon: "BA", label: "Active Batches", value: summary.activeBatches, meta: `${state.data.batches.length} total batches`, delta: `${enrollments.length} enrollments`, tone: "cyan", spark: weekly.previous },
      { icon: "RV", label: "Pending Reviews", value: summary.pendingReviews, meta: `${summary.reviewedItems} reviewed`, delta: summary.pendingReviews ? "Needs attention" : "Clear", tone: summary.pendingReviews ? "rose" : "green", spark: weekly.current.slice().reverse() }
    ];

    setHtml("adminRefKpis", kpis.map(adminRefKpiCard).join(""));
    setHtml("adminRefGrowthChart", adminRefLineChart(trend.labels, trend.current, trend.previous, "Student growth and engagement"));
    syncAdminRefRangeButtons();
    setHtml("adminRefRevenueChart", adminRefLineChart(["Users", "Courses", "Batches", "Tasks", "Reviews", "Coins"], [
      summary.students,
      state.data.courses.length,
      state.data.batches.length,
      state.data.batchTasks.length,
      summary.pendingReviews + summary.reviewedItems,
      Math.max(1, Math.round(totalCoins / 100))
    ], [], "Platform overview"));
    setHtml("adminRefTopCourses", adminRefTopCourseRows().map(adminRefCourseRow).join("") || emptyState("Courses will appear here."));
    setHtml("adminRefActivity", adminActivityRows("all").slice(0, 5).map(adminRefActivityRow).join("") || emptyState("Recent activity will appear here."));
    setHtml("adminRefPending", adminRefPendingRows(summary, supportOpen).map(adminRefPendingRow).join(""));
    setHtml("adminRefSupport", adminRefSupportRows().map(adminRefSupportRow).join("") || emptyState("No support tickets yet."));
    setHtml("adminRefSchedule", adminRefScheduleRows().map(adminRefScheduleRow).join("") || emptyState("Batch dates will appear here."));
    setHtml("adminRefAnnouncements", adminRefAnnouncementRows().map(adminRefAnnouncementRow).join("") || emptyState("Announcements will appear here."));
    setHtml("adminRefHealth", adminRefHealthRows({ avgProgress, supportOpen }).map(adminRefHealthRow).join(""));
  }

  function syncAdminRefRangeButtons() {
    document.querySelectorAll("[data-admin-ref-range]").forEach((button) => {
      const isActive = button.dataset.adminRefRange === state.dashboardAnalysisRange;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
      if (button.dataset.wired === "true") return;
      button.dataset.wired = "true";
      button.addEventListener("click", () => {
        state.dashboardAnalysisRange = button.dataset.adminRefRange || "weekly";
        renderAdminReferenceDashboard(dashboardSummary());
      });
    });
  }

  function adminRefKpiCard(item) {
    return `
      <article class="admin-ref-kpi ${escapeAttr(item.tone)}">
        <span class="admin-ref-icon">${escapeHtml(item.icon)}</span>
        <div>
          <small>${escapeHtml(item.label)}</small>
          <strong>${escapeHtml(item.value)}</strong>
          <p>${escapeHtml(item.delta)} <em>${escapeHtml(item.meta)}</em></p>
        </div>
        <div class="admin-ref-spark">${reportSparklineSvg(item.spark || [0])}</div>
      </article>
    `;
  }

  function adminRefTopCourseRows() {
    return analyticsCoursePerformanceRows().slice(0, 5).map((row) => ({
      title: row.title,
      students: row.meta.split(" enrolled")[0] || "0",
      completion: row.progress,
      rating: Math.max(3.8, Math.min(5, (4 + Number(row.progress || 0) / 100))).toFixed(1)
    }));
  }

  function adminRefCourseRow(row) {
    const title = String(row.title || "Course");
    const students = Number(row.students || 0);
    const completion = Math.max(0, Math.min(100, Number(row.completion || 0)));
    const rating = String(row.rating || "0.0");
    return `
      <article class="admin-ref-course-row" title="${escapeAttr(`${title}: ${students} students, ${completion}% completion, ${rating} rating`)}">
        <strong>${escapeHtml(title)}</strong>
        <span title="${escapeAttr(`${students} students`)}">${escapeHtml(students)}</span>
        <div title="${escapeAttr(`${completion}% completion`)}"><i style="width:${Math.max(4, completion)}%"></i></div>
        <b>${escapeHtml(completion)}%</b>
        <em>${escapeHtml(rating)}</em>
      </article>
    `;
  }

  function adminRefActivityRow(row) {
    return `
      <article class="admin-ref-activity-row">
        <time>${escapeHtml(relativeTime(row.time))}</time>
        <span class="admin-ref-dot"></span>
        <b>${escapeHtml(row.badge || initials(row.name))}</b>
        <div>
          <strong>${escapeHtml(row.name)}</strong>
          <small>${escapeHtml(row.detail)}</small>
        </div>
      </article>
    `;
  }

  function adminRefPendingRows(summary, supportOpen) {
    const unverified = state.data.users.filter((user) => String(user.status || "active").toLowerCase() !== "active").length;
    return [
      { label: "Review Assignments", value: summary.pendingReviews, icon: "RV", view: "reviews" },
      { label: "Approve Mentors", value: state.data.users.filter((user) => user.role === "mentor" && String(user.status || "active").toLowerCase() !== "active").length, icon: "ME", view: "users" },
      { label: "Verify Students", value: unverified, icon: "ST", view: "users" },
      { label: "Open Support", value: supportOpen, icon: "SP", view: "support" }
    ];
  }

  function adminRefPendingRow(row) {
    return `
      <button class="admin-ref-pending-row" type="button" data-jump="${escapeAttr(row.view)}">
        <span>${escapeHtml(row.icon)}</span>
        <strong>${escapeHtml(row.label)}</strong>
        <b>${Number(row.value || 0)}</b>
      </button>
    `;
  }

  function adminRefSupportRows() {
    return state.data.supportTickets.slice(0, 4).map((ticket) => ({
      id: ticket.ticket_id || ticket.id || "Ticket",
      priority: ticket.priority || "Normal",
      status: ticket.status || "Open",
      time: ticket.updated_at || ticket.created_at
    }));
  }

  function adminRefSupportRow(row) {
    return `
      <article class="admin-ref-support-row">
        <strong>#${escapeHtml(row.id)}</strong>
        <span class="${escapeAttr(String(row.priority).toLowerCase())}">${escapeHtml(row.priority)}</span>
        <b>${escapeHtml(row.status)}</b>
        <time>${escapeHtml(row.time ? relativeTime(row.time) : "Now")}</time>
      </article>
    `;
  }

  function adminRefScheduleRows() {
    return state.data.batches
      .map((batch) => ({ batch, date: batch.start_date || batch.end_date || batch.created_at }))
      .filter((item) => item.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 4);
  }

  function adminRefScheduleRow(item) {
    const course = findById(state.data.courses, item.batch.course_id);
    return `
      <article class="admin-ref-schedule-row">
        <span>BA</span>
        <div>
          <strong>${escapeHtml(formatDate(item.date))}</strong>
          <small>${escapeHtml(item.batch.name || "Batch")}</small>
        </div>
        <b>${escapeHtml(course?.title || "No course")}</b>
      </article>
    `;
  }

  function adminRefAnnouncementRows() {
    return state.data.announcements.slice(0, 3);
  }

  function adminRefAnnouncementRow(item) {
    return `
      <article class="admin-ref-announcement-row">
        <span>AN</span>
        <div>
          <strong>${escapeHtml(item.title || "Announcement")}</strong>
          <small>${escapeHtml(truncate(item.message || "No message", 92))}</small>
        </div>
      </article>
    `;
  }

  function adminRefHealthRows(model) {
    const warningCount = state.tableErrors ? Object.keys(state.tableErrors).length : 0;
    return [
      { label: "Database", value: warningCount ? "Warning" : "Operational", ok: !warningCount },
      { label: "Realtime", value: state.realtimeChannel ? "Operational" : "Ready", ok: true },
      { label: "Support Queue", value: model.supportOpen ? `${model.supportOpen} Open` : "Clear", ok: model.supportOpen === 0 },
      { label: "Avg Progress", value: `${model.avgProgress}%`, ok: model.avgProgress >= 40 || state.data.progress.length === 0 },
      { label: "Admin Service", value: "Configured", ok: true }
    ];
  }

  function adminRefHealthRow(row) {
    return `
      <article class="admin-ref-health-row">
        <strong>${escapeHtml(row.label)}</strong>
        <span class="${row.ok ? "ok" : "warn"}">${escapeHtml(row.value)} <i></i></span>
      </article>
    `;
  }

  function adminRefLineChart(labels, current, previous = [], title = "Dashboard chart") {
    const max = Math.max(1, ...current, ...previous);
    const width = 620;
    const height = 230;
    const chartWidth = 540;
    const points = (values) => values.map((value, index) => {
      const x = 42 + (values.length <= 1 ? 0 : index * (chartWidth / (values.length - 1)));
      const y = 184 - (Number(value || 0) / max) * 132;
      return `${x},${y}`;
    }).join(" ");
    const labelStep = Math.max(1, Math.ceil(labels.length / 6));
    const labelSvg = labels.map((label, index) => index % labelStep ? "" : `<text x="${42 + (labels.length <= 1 ? 0 : index * (chartWidth / (labels.length - 1)))}" y="214">${escapeHtml(label)}</text>`).join("");
    const previousLine = previous.length ? `<polyline points="${points(previous)}" class="previous"></polyline>` : "";
    const dots = current.map((value, index) => {
      const x = 42 + (current.length <= 1 ? 0 : index * (chartWidth / (current.length - 1)));
      const y = 184 - (Number(value || 0) / max) * 132;
      const tip = `${labels[index] || title}: ${Number(value || 0)}`;
      const tipX = Math.max(58, Math.min(width - 92, x - 44));
      const tipY = Math.max(24, y - 20);
      return `
        <g class="admin-ref-chart-point" tabindex="0" role="button" aria-label="${escapeAttr(tip)}">
          <circle cx="${x}" cy="${y}" r="5"></circle>
          <rect class="admin-ref-chart-tip-bg" x="${tipX}" y="${tipY - 16}" width="88" height="22" rx="7"></rect>
          <text class="admin-ref-chart-tip" x="${tipX + 44}" y="${tipY - 1}">${escapeHtml(tip)}</text>
          <title>${escapeHtml(tip)}</title>
        </g>
      `;
    }).join("");
    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(title)}">
        <defs>
          <linearGradient id="adminRefChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#2f63ff" stop-opacity=".22"/>
            <stop offset="100%" stop-color="#2f63ff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="40" y1="184" x2="586" y2="184" class="axis"></line>
        <line x1="40" y1="140" x2="586" y2="140" class="grid"></line>
        <line x1="40" y1="96" x2="586" y2="96" class="grid"></line>
        <line x1="40" y1="52" x2="586" y2="52" class="grid"></line>
        ${previousLine}
        <polygon points="${points(current)} 586,184 42,184" class="fill"></polygon>
        <polyline points="${points(current)}" class="current"></polyline>
        ${dots}
        ${labelSvg}
      </svg>
    `;
  }

  function wireEnterpriseAnalyticsControls() {
    document.querySelectorAll("[data-analytics-filter]").forEach((button) => {
      if (button.dataset.wired === "true") return;
      button.dataset.wired = "true";
      button.addEventListener("click", () => {
        state.analyticsFilter = button.dataset.analyticsFilter || "overview";
        document.querySelectorAll("[data-analytics-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
        renderEnterpriseAnalytics();
      });
    });
  }

  function renderEnterpriseAnalytics() {
    if (!document.getElementById("enterpriseAnalytics")) return;
    wireEnterpriseAnalyticsControls();
    const model = buildEnterpriseAnalyticsModel();
    const focus = state.analyticsFilter || "overview";
    const visibleKpis = (focus === "overview"
      ? model.kpis
      : model.kpis.filter((item) => item.focus === "overview" || item.focus === focus)
    ).slice(0, 6);

    setText("analyticsFreshness", model.freshness);
    setText("analyticsTrendDelta", model.trendDelta);
    setHtml("analyticsKpiGrid", visibleKpis.map(analyticsKpiCard).join(""));
    setHtml("analyticsEngagementChart", analyticsLineChart(model.trend.labels, model.trend.current, model.trend.previous));
    setHtml("analyticsLearningFunnel", model.funnel.map(analyticsFunnelRow).join(""));
    setHtml("analyticsCoursePerformance", model.coursePerformance.length ? model.coursePerformance.map(analyticsRankedRow).join("") : emptyState("Course performance appears after enrollments and progress records."));
    setHtml("analyticsReviewDonut", analyticsDonut(model.reviewStatus));
    setHtml("analyticsReviewStatus", model.reviewStatus.length ? model.reviewStatus.map(analyticsStatusRow).join("") : emptyState("Review status appears after submissions."));
    setHtml("analyticsInsights", model.insights.length ? model.insights.map(analyticsInsightRow).join("") : emptyState("No analytics recommendations right now."));
    document.querySelectorAll("#enterpriseAnalytics [data-jump]").forEach((button) => {
      if (button.dataset.wired === "true") return;
      button.dataset.wired = "true";
      button.addEventListener("click", () => setView(button.dataset.jump));
    });
  }

  function buildEnterpriseAnalyticsModel() {
    const students = state.data.users.filter((user) => String(user.role || "").toLowerCase() === "student");
    const mentors = state.data.users.filter((user) => String(user.role || "").toLowerCase() === "mentor");
    const enrollments = activeEnrollments();
    const progressRows = state.data.progress;
    const submissions = state.data.taskSubmissions.filter((item) => !item.deleted_at);
    const projects = state.data.projects.filter((item) => !item.deleted_at);
    const reviewItems = [...submissions, ...projects];
    const gradedSubmissions = submissions.filter(isReviewedRecord);
    const pendingReviews = reviewItems.filter(isPendingReviewRecord);
    const avgProgress = progressRows.length
      ? Math.round(progressRows.reduce((sum, row) => sum + estimateProgress(row), 0) / progressRows.length)
      : 0;
    const completionRate = progressRows.length
      ? Math.round((progressRows.filter((row) => estimateProgress(row) >= 100 || row.quiz_completed).length / progressRows.length) * 100)
      : 0;
    const activeLearnerIds = learnerActivityIds(30);
    const engagementRate = students.length ? Math.round((activeLearnerIds.size / students.length) * 100) : 0;
    const atRiskLearners = students.filter((student) => learnerRiskScore(student) >= 2).length;
    const onTimeRate = submissions.length
      ? Math.round((submissions.filter((item) => item.is_on_time === true || String(item.is_on_time) === "true").length / submissions.length) * 100)
      : 0;
    const averageScore = gradedSubmissions.length
      ? Math.round(gradedSubmissions.reduce((sum, item) => sum + submissionScorePercent(item), 0) / gradedSubmissions.length)
      : 0;
    const activeCourses = state.data.courses.filter((course) => ["published", "active", "live"].includes(String(course.status || "").toLowerCase())).length;
    const courseReadiness = state.data.courses.length
      ? Math.round((state.data.courses.filter((course) => adminCourseModules(course).length > 0 && adminCourseQuizzes(course).length > 0).length / state.data.courses.length) * 100)
      : 0;
    const trend = analyticsTrendSeries();
    const currentTotal = trend.current.reduce((sum, value) => sum + value, 0);
    const previousTotal = trend.previous.reduce((sum, value) => sum + value, 0);
    const trendDeltaValue = previousTotal ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100) : currentTotal ? 100 : 0;

    return {
      freshness: analyticsFreshnessLabel(),
      trend,
      trendDelta: `${trendDeltaValue >= 0 ? "+" : ""}${trendDeltaValue}%`,
      kpis: [
        { label: "Active learners", value: activeLearnerIds.size, detail: `${engagementRate}% of students active in 30 days`, trend: engagementRate, tone: "blue", focus: "overview" },
        { label: "Completion rate", value: `${completionRate}%`, detail: `${avgProgress}% average course progress`, trend: completionRate, tone: "green", focus: "learning" },
        { label: "Pending reviews", value: pendingReviews.length, detail: `${gradedSubmissions.length} submissions reviewed`, trend: reviewItems.length ? Math.round((gradedSubmissions.length / reviewItems.length) * 100) : 0, tone: pendingReviews.length ? "rose" : "green", focus: "operations" },
        { label: "On-time work", value: `${onTimeRate}%`, detail: `${submissions.length} task submissions tracked`, trend: onTimeRate, tone: "cyan", focus: "learning" },
        { label: "Average score", value: `${averageScore}%`, detail: `${gradedSubmissions.length} graded submissions`, trend: averageScore, tone: "violet", focus: "learning" },
        { label: "At-risk learners", value: atRiskLearners, detail: "Low progress or no recent activity", trend: students.length ? 100 - Math.round((atRiskLearners / students.length) * 100) : 100, tone: atRiskLearners ? "amber" : "green", focus: "operations" },
        { label: "Course readiness", value: `${courseReadiness}%`, detail: `${activeCourses} live courses`, trend: courseReadiness, tone: "blue", focus: "overview" },
        { label: "Enrollment load", value: enrollments.length, detail: `${students.length} students across ${state.data.batches.length} batches`, trend: students.length ? Math.min(100, Math.round((enrollments.length / students.length) * 100)) : 0, tone: "cyan", focus: "overview" }
      ],
      funnel: [
        { label: "Students", value: students.length, base: students.length, detail: "Registered learner profiles" },
        { label: "Enrolled", value: uniqueEnrollmentLearnerIds(enrollments).size, base: students.length, detail: "Assigned to at least one course" },
        { label: "In progress", value: uniqueProgressLearnerIds(progressRows).size, base: students.length, detail: "Progress records available" },
        { label: "Submitted", value: uniqueSubmissionLearnerIds(reviewItems).size, base: students.length, detail: "Submitted task or project work" },
        { label: "Reviewed", value: uniqueSubmissionLearnerIds(reviewItems.filter(isReviewedRecord)).size, base: students.length, detail: "Received review outcome" }
      ],
      coursePerformance: analyticsCoursePerformanceRows(),
      reviewStatus: analyticsReviewStatusRows(reviewItems),
      insights: analyticsInsightRows({ students, mentors, enrollments, pendingReviews, atRiskLearners, courseReadiness, completionRate, activeCourses, submissions })
    };
  }

  function analyticsTrendSeries() {
    const labels = [];
    const current = Array(8).fill(0);
    const previous = Array(8).fill(0);
    const now = new Date();
    const weekStart = startOfDay(new Date(now));
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay() || 7) + 1);
    const start = new Date(weekStart);
    start.setDate(start.getDate() - 7 * 7);
    const previousStart = new Date(start);
    previousStart.setDate(previousStart.getDate() - 8 * 7);
    for (let i = 0; i < 8; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
    }
    analyticsEvents().forEach((event) => {
      const date = startOfDay(event.ts);
      const diff = Math.floor((date - start) / 604800000);
      const previousDiff = Math.floor((date - previousStart) / 604800000);
      if (diff >= 0 && diff < 8) current[diff] += 1;
      if (previousDiff >= 0 && previousDiff < 8) previous[previousDiff] += 1;
    });
    return { labels, current, previous };
  }

  function dashboardAnalysisSeries(range = "weekly") {
    if (range === "monthly") return dashboardMonthlySeries();
    if (range === "yearly") return dashboardYearlySeries();
    return analyticsTrendSeries();
  }

  function dashboardMonthlySeries() {
    const labels = [];
    const current = Array(12).fill(0);
    const previous = Array(12).fill(0);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const previousStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      labels.push(d.toLocaleDateString("en-IN", { month: "short" }));
    }
    analyticsEvents().forEach((event) => {
      const date = event.ts;
      const diff = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
      const previousDiff = (date.getFullYear() - previousStart.getFullYear()) * 12 + date.getMonth() - previousStart.getMonth();
      if (diff >= 0 && diff < 12) current[diff] += 1;
      if (previousDiff >= 0 && previousDiff < 12) previous[previousDiff] += 1;
    });
    return { labels, current, previous };
  }

  function dashboardYearlySeries() {
    const labels = [];
    const current = Array(5).fill(0);
    const previous = Array(5).fill(0);
    const now = new Date();
    const startYear = now.getFullYear() - 4;
    const previousStartYear = startYear - 5;
    for (let i = 0; i < 5; i += 1) {
      labels.push(String(startYear + i));
    }
    analyticsEvents().forEach((event) => {
      const year = event.ts.getFullYear();
      const diff = year - startYear;
      const previousDiff = year - previousStartYear;
      if (diff >= 0 && diff < 5) current[diff] += 1;
      if (previousDiff >= 0 && previousDiff < 5) previous[previousDiff] += 1;
    });
    return { labels, current, previous };
  }

  function analyticsEvents() {
    const fromRows = (rows, fields, type) => rows.map((row) => {
      const raw = fields.reduce((value, field) => value || row[field], "");
      const ts = raw ? new Date(raw) : null;
      return ts && !isNaN(ts.getTime()) ? { ts, type, row } : null;
    }).filter(Boolean);
    return [
      ...fromRows(state.data.users, ["created_at"], "users"),
      ...fromRows(state.data.userCourses, ["enrolled_at", "created_at"], "enrollments"),
      ...fromRows(state.data.progress, ["updated_at", "created_at"], "progress"),
      ...fromRows(state.data.taskSubmissions, ["graded_at", "submitted_at", "created_at"], "submissions"),
      ...fromRows(state.data.projects, ["updated_at", "submitted_at", "created_at"], "projects"),
      ...fromRows(state.data.batchTasks, ["published_at", "created_at"], "tasks"),
      ...fromRows(state.data.chats, ["created_at"], "chats"),
      ...fromRows(state.data.announcements, ["published_at", "created_at"], "announcements"),
      ...fromRows(state.data.supportTickets, ["updated_at", "created_at"], "support")
    ].sort((a, b) => b.ts - a.ts);
  }

  function analyticsCoursePerformanceRows() {
    return state.data.courses.map((course) => {
      const enrollments = activeEnrollments().filter((row) => sameId(row.course_id, course.id));
      const progress = state.data.progress.filter((row) => sameId(row.course_id, course.id));
      const submissions = state.data.taskSubmissions.filter((row) => sameId(row.course_id, course.id) || enrollments.some((enrollment) => sameId(enrollment.user_id || enrollment.student_id, row.student_id || row.user_id)));
      const averageProgress = progress.length ? Math.round(progress.reduce((sum, row) => sum + estimateProgress(row), 0) / progress.length) : 0;
      const score = enrollments.length * 12 + averageProgress + submissions.length * 8 + adminCourseModules(course).length * 4;
      return {
        title: course.title || "Untitled course",
        meta: `${enrollments.length} enrolled - ${submissions.length} submissions`,
        value: `${averageProgress}%`,
        progress: averageProgress,
        score
      };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
  }

  function analyticsReviewStatusRows(reviewItems) {
    const statusMap = reviewItems.reduce((acc, item) => {
      const key = normalizedReviewStatus(item);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(statusMap)
      .map(([label, value], index) => ({ label: permissionLabel(label), value, color: analyticsPalette(index) }))
      .sort((a, b) => b.value - a.value);
  }

  function analyticsInsightRows(model) {
    const rows = [];
    if (model.pendingReviews.length) {
      rows.push({ tone: "rose", title: "Review queue needs attention", detail: `${model.pendingReviews.length} task or project submissions are waiting for review.`, action: "Open reviews", view: "reviews" });
    }
    if (model.atRiskLearners) {
      rows.push({ tone: "amber", title: "Learner risk detected", detail: `${model.atRiskLearners} students have low progress or no recent tracked activity.`, action: "Open users", view: "users" });
    }
    if (model.courseReadiness < 80 && state.data.courses.length) {
      rows.push({ tone: "blue", title: "Improve course readiness", detail: `${model.courseReadiness}% of courses include both modules and quizzes.`, action: "Manage courses", view: "courses" });
    }
    const unassignedBatches = state.data.batches.filter((batch) => !batch.mentor_id).length;
    if (unassignedBatches) {
      rows.push({ tone: "violet", title: "Assign batch mentors", detail: `${unassignedBatches} batches do not have a mentor assigned.`, action: "Open batches", view: "batches" });
    }
    if (!model.submissions.length && model.enrollments.length) {
      rows.push({ tone: "cyan", title: "Assignments have no submissions yet", detail: "Learners are enrolled, but no task submission records are available.", action: "Open tasks", view: "tasks" });
    }
    if (!rows.length && (model.students.length || model.activeCourses)) {
      rows.push({ tone: "green", title: "Analytics health looks stable", detail: `${model.completionRate}% completion rate with ${model.activeCourses} live courses.`, action: "View courses", view: "courses" });
    }
    return rows.slice(0, 5);
  }

  function learnerActivityIds(days) {
    const since = Date.now() - days * 86400000;
    const ids = new Set();
    state.data.progress.forEach((row) => addRecentLearnerId(ids, row.student_id || row.user_id, row.updated_at || row.created_at, since));
    state.data.taskSubmissions.forEach((row) => addRecentLearnerId(ids, row.student_id || row.user_id, row.submitted_at || row.created_at, since));
    state.data.projects.forEach((row) => addRecentLearnerId(ids, row.student_id || row.user_id, row.submitted_at || row.created_at, since));
    state.data.chats.forEach((row) => addRecentLearnerId(ids, row.user_id || row.sender_id, row.created_at, since));
    return ids;
  }

  function addRecentLearnerId(ids, id, value, since) {
    const date = value ? new Date(value) : null;
    if (!id || !date || isNaN(date.getTime()) || date.getTime() < since) return;
    ids.add(String(id));
  }

  function learnerRiskScore(student) {
    const id = student.id;
    const progress = state.data.progress.filter((row) => sameId(row.student_id || row.user_id, id));
    const maxProgress = progress.length ? Math.max(...progress.map(estimateProgress)) : 0;
    const hasEnrollment = activeEnrollments().some((row) => sameId(row.user_id || row.student_id, id));
    const active = learnerActivityIds(30).has(String(id));
    return (hasEnrollment && maxProgress < 35 ? 1 : 0) + (!active && hasEnrollment ? 1 : 0) + (!progress.length && hasEnrollment ? 1 : 0);
  }

  function isPendingReviewRecord(item) {
    return ["", "pending", "submitted", "review_pending", "in_review"].includes(String(item.status || "").toLowerCase());
  }

  function isReviewedRecord(item) {
    return ["approved", "reviewed", "completed", "rejected", "changes_requested", "graded"].includes(String(item.status || "").toLowerCase()) || Boolean(item.graded_at);
  }

  function normalizedReviewStatus(item) {
    if (isPendingReviewRecord(item)) return "pending";
    if (isReviewedRecord(item)) return "reviewed";
    return String(item.status || "other").toLowerCase();
  }

  function submissionScorePercent(item) {
    const score = Number(item.marks_obtained ?? item.score ?? 0);
    const total = Number(item.total_marks ?? item.max_marks ?? 0);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((score / total) * 100)));
  }

  function uniqueEnrollmentLearnerIds(rows) {
    return new Set(rows.map((row) => row.user_id || row.student_id || row.learner_id).filter(Boolean).map(String));
  }

  function uniqueProgressLearnerIds(rows) {
    return new Set(rows.map((row) => row.student_id || row.user_id).filter(Boolean).map(String));
  }

  function uniqueSubmissionLearnerIds(rows) {
    return new Set(rows.map((row) => row.student_id || row.user_id).filter(Boolean).map(String));
  }

  function analyticsFreshnessLabel() {
    const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const mode = state.realtimeChannel ? "Realtime" : "Auto refresh";
    return `${mode} sync - ${stamp}`;
  }

  function analyticsKpiCard(item) {
    const pct = Math.max(0, Math.min(100, Number(item.trend || 0)));
    return `
      <article class="analytics-kpi-card ${escapeAttr(item.tone || "blue")}">
        <div>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.detail)}</small>
        </div>
        <div class="analytics-kpi-ring" style="--pct:${pct}%"><b>${pct}%</b></div>
      </article>
    `;
  }

  function analyticsLineChart(labels, current, previous) {
    const max = Math.max(1, ...current, ...previous);
    const points = (values) => values.map((value, index) => {
      const x = 28 + index * 64;
      const y = 188 - (Number(value || 0) / max) * 144;
      return `${x},${y}`;
    }).join(" ");
    const dots = current.map((value, index) => {
      const x = 28 + index * 64;
      const y = 188 - (Number(value || 0) / max) * 144;
      const label = `${labels[index]}: ${value} events`;
      return `<circle cx="${x}" cy="${y}" r="4"><title>${escapeHtml(label)}</title></circle>`;
    }).join("");
    const axis = labels.map((label, index) => `<text x="${28 + index * 64}" y="222">${escapeHtml(label)}</text>`).join("");
    return `
      <svg viewBox="0 0 500 240" role="img" aria-label="Engagement trend chart">
        <line x1="24" y1="188" x2="480" y2="188" class="axis"></line>
        <line x1="24" y1="116" x2="480" y2="116" class="grid"></line>
        <line x1="24" y1="44" x2="480" y2="44" class="grid"></line>
        <polyline points="${points(previous)}" class="previous"></polyline>
        <polyline points="${points(current)}" class="current"></polyline>
        ${dots}
        ${axis}
      </svg>
    `;
  }

  function analyticsFunnelRow(item) {
    const pct = item.base ? Math.round((Number(item.value || 0) / item.base) * 100) : 0;
    return `
      <article class="analytics-funnel-row">
        <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></div>
        <b>${Number(item.value || 0)}</b>
        <div class="analytics-funnel-track"><span style="width:${Math.max(4, Math.min(100, pct))}%"></span></div>
      </article>
    `;
  }

  function analyticsRankedRow(item, index) {
    const progress = Math.max(0, Math.min(100, Number(item.progress || 0)));
    return `
      <article class="analytics-ranked-row">
        <span>${index + 1}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.meta)}</small>
          <div class="analytics-mini-track"><i style="width:${progress}%"></i></div>
        </div>
        <b>${escapeHtml(item.value)}</b>
      </article>
    `;
  }

  function analyticsDonut(rows) {
    const total = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
    if (!total) return `<div class="analytics-donut-empty">0</div>`;
    let cursor = 0;
    const stops = rows.map((row) => {
      const start = cursor;
      const size = (Number(row.value || 0) / total) * 100;
      cursor += size;
      return `${row.color} ${start}% ${cursor}%`;
    }).join(", ");
    return `<div class="analytics-donut-chart" style="background:conic-gradient(${stops})"><strong>${total}</strong><span>Total</span></div>`;
  }

  function analyticsStatusRow(item) {
    return `
      <article class="analytics-status-row">
        <span style="--dot:${escapeAttr(item.color)}"></span>
        <strong>${escapeHtml(item.label)}</strong>
        <b>${Number(item.value || 0)}</b>
      </article>
    `;
  }

  function analyticsInsightRow(item) {
    return `
      <article class="analytics-insight ${escapeAttr(item.tone || "blue")}">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail)}</p>
        </div>
        <button class="report-link" type="button" data-jump="${escapeAttr(item.view)}">${escapeHtml(item.action)}</button>
      </article>
    `;
  }

  function analyticsPalette(index) {
    return ["#2563eb", "#12b981", "#f59e0b", "#e11d48", "#7c3aed", "#0891b2"][index % 6];
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

    if (!allEvents.length) {
      barsEl.innerHTML = `
        <div class="chart-empty-state">
          <strong>No analytics events yet</strong>
          <span>Activity appears here after users, courses, submissions, or announcements are created.</span>
        </div>
      `;
      const legendEl = document.querySelector(".chart-legend");
      if (legendEl) legendEl.innerHTML = `<span class="legend-item muted"><b></b>No event data</span>`;
      return;
    }

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
        `    data-chart-tip="${escapeAttr(tip)}"`,
        `    title="${escapeAttr(tip)}"`,
        `    aria-label="${escapeAttr(tip)}">`,
        `    <span class="chart-tooltip">${escapeHtml(tip)}</span>`,
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
      const attachmentUrl = file ? await uploadSupportAttachment(file, ticket.user_id) : null;
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
    await deleteSupportChildRows("support_attachments", ticketId, { optional: true });
    await deleteSupportChildRows("support_messages", ticketId);
    const { error } = await client.from("support_tickets").delete().eq("id", ticketId);
    if (error) throw error;
  }

  async function deleteSupportChildRows(table, ticketId, options = {}) {
    const { error } = await getClient().from(table).delete().eq("ticket_id", ticketId);
    if (error && options.optional && isSchemaShapeError(error)) return;
    if (error && !isSchemaShapeError(error)) throw error;
  }

  async function uploadSupportAttachment(file, ownerId = state.admin.id) {
    validateSupportAttachment(file);
    const safeName = String(file.name || "support-file").replace(/[^a-z0-9._-]+/gi, "-");
    const path = `${ownerId}/admin/${state.admin.id}/${Date.now()}-${safeName}`;
    const { error } = await getClient().storage.from("support-attachments").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return `support-attachments:${path}`;
  }

  function validateSupportAttachment(file) {
    if (!file) throw new Error("Choose a support attachment first.");
    if (file.size > MAX_SUPPORT_ATTACHMENT_BYTES) throw new Error("Support attachments must be 10 MB or smaller.");
    const type = String(file.type || "").toLowerCase();
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    if (!SUPPORT_ATTACHMENT_TYPES.has(type) && !SUPPORT_ATTACHMENT_EXTENSIONS.has(extension)) {
      throw new Error("Support attachments must be PDF, image, text, CSV, Word, or Excel files.");
    }
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
        <tr class="admin-user-row">
          <td>
            <div class="admin-user-person">
              <span class="admin-user-avatar ${roleColor(user.role)}">${escapeHtml(initials(user.name || user.email || "U"))}</span>
              <div>
                <strong>${escapeHtml(user.name || "Unnamed")}</strong>
                <small>${escapeHtml(user.username || "")}</small>
              </div>
            </div>
          </td>
          <td><span class="admin-user-email">${escapeHtml(user.email || "")}</span></td>
          <td><span class="admin-user-role badge ${roleColor(user.role)}">${escapeHtml(String(user.role || "user").toUpperCase())}</span></td>
          <td><div class="admin-user-learning">${userLearningSummary(user)}</div></td>
          <td><code class="referral-code-pill admin-user-referral">${escapeHtml(userReferralCode(user))}</code></td>
          <td><strong class="admin-user-coins">${Number(user.coins || 0).toLocaleString("en-IN")}</strong></td>
          <td><strong class="admin-user-joined">${formatDate(user.created_at)}</strong></td>
          <td>
            <div class="row-actions">
              <button class="ghost-btn admin-user-action" type="button" data-view-user="${user.id}">View</button>
              <button class="soft-btn admin-user-action" type="button" data-edit-user="${user.id}">Edit</button>
            </div>
          </td>
        </tr>
      `).join("")
      : `<tr><td colspan="8">${emptyState("No users found.")}</td></tr>`;

    document.querySelectorAll("[data-view-user]").forEach((button) => {
      button.addEventListener("click", () => openUserModal(findById(state.data.users, button.dataset.viewUser), false));
    });
    document.querySelectorAll("[data-edit-user]").forEach((button) => {
      button.addEventListener("click", () => openUserModal(findById(state.data.users, button.dataset.editUser), true));
    });
  }

  function permissionLabel(value) {
    return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderCourses() {
    const grid = document.getElementById("coursesGrid");
    const query = searchQuery();
    const statusFilter = state.courseStatusFilter || "all";
    const rows = state.data.courses.filter((course) => statusFilter === "all" || courseLifecycleStatus(course) === statusFilter).filter((course) => matchesText(query, course.title, course.description, course.category, course.instructor_name, course.status, course.price, course.id));
    grid.innerHTML = rows.length
      ? rows.map((course) => {
        const enrolled = courseAssignedUserIds(course, "student").size, basePrice = numericCoursePrice(course.price), discount = Math.max(0, Number(course.discount || 0)), finalPrice = Math.max(0, basePrice - discount), allModules = adminCourseModules(course, true), lifecycle = courseLifecycleStatus(course);
        const archivedContent = allModules.filter((module) => module?.deleted_at).length + allModules.reduce((sum, module) => sum + (module?.lessons || []).filter((lesson) => lesson?.deleted_at).length, 0);
        return `
          <article class="course-card">
            <img class="course-thumb" src="${escapeAttr(course.thumbnail_url || "image/login/loginimg.webp")}" alt="">
            <div class="course-body">
              <div class="list-row">
                <div>
                  <h3>${escapeHtml(course.title || "Untitled course")}</h3>
                  <small>ID: ${escapeHtml(course.id || "-")}</small>
                </div>
                <span class="badge ${statusColor(lifecycle)}">${escapeHtml(lifecycle.toUpperCase())}</span>
              </div>
              <p>${escapeHtml(course.description || "No description added.")}</p>
              <small>${escapeHtml(course.category || "General")} - ${escapeHtml(course.duration || "No duration")} - ${escapeHtml(course.instructor_name || "Academy Mentor")}</small>
              <div class="course-inventory-grid">${[["Base", formatCoursePrice(basePrice)], ["Discount", formatCoursePrice(discount)], ["Final", formatCoursePrice(finalPrice)], ["Enrollments", enrolled], ["Created", formatDate(course.created_at)], ["Updated", formatDate(course.updated_at || course.created_at)]].map(([label, value]) => `<span><b>${escapeHtml(label)}</b>${escapeHtml(value)}</span>`).join("")}</div>
              <div class="course-actions">
                <button class="primary-btn" type="button" data-assign-course="${course.id}">Assign</button>
                <button class="ghost-btn" type="button" data-edit-course="${course.id}">Edit</button>
                <button class="ghost-btn" type="button" data-content-course="${course.id}">Content</button>
                <button class="ghost-btn" type="button" data-duplicate-course="${course.id}">Duplicate</button>
                <button class="soft-btn" type="button" data-toggle-course="${course.id}">${lifecycle === "active" ? "Move to Draft" : "Make Active"}</button>
                ${lifecycle === "deleted"
                  ? `<button class="soft-btn" type="button" data-restore-course="${course.id}">Restore</button>`
                  : `<button class="danger-btn" type="button" data-delete-course="${course.id}">Delete</button>`}
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
    grid.querySelectorAll("[data-content-course]").forEach((button) => {
      button.addEventListener("click", () => openCourseContentModal(findById(state.data.courses, button.dataset.contentCourse)));
    });
    grid.querySelectorAll("[data-toggle-course]").forEach((button) => {
      button.addEventListener("click", () => toggleCourseStatus(button.dataset.toggleCourse));
    });
    grid.querySelectorAll("[data-duplicate-course]").forEach((button) => {
      button.addEventListener("click", () => duplicateCourse(button.dataset.duplicateCourse));
    });
    grid.querySelectorAll("[data-delete-course]").forEach((button) => {
      button.addEventListener("click", () => openCourseDeleteModal(findById(state.data.courses, button.dataset.deleteCourse)));
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
              <button class="ghost-btn" type="button" data-view-batch="${batch.id}">View</button>
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

    grid.querySelectorAll("[data-view-batch]").forEach((button) => {
      button.addEventListener("click", () => openBatchDetailsModal(findById(state.data.batches, button.dataset.viewBatch)));
    });
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
      button.addEventListener("click", () => deleteChatMessage(button.dataset.deleteChat));
    });
  }

  function renderShop() {
    const grid = document.getElementById("shopGrid");
    const query = searchQuery();
    const rows = state.data.shopItems.filter((item) => matchesText(query, item.name, item.price, item.status, item.stock));
    grid.innerHTML = rows.length
      ? rows.map((item) => `
        <article class="shop-card">
          ${item.image_url ? `<img class="shop-thumb" src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name || "Shop item")}">` : `<div class="shop-thumb no-image">No Image Available</div>`}
          <div>
            <h3>${escapeHtml(item.name || "Shop item")}</h3>
            <p>${Number(item.price || 0).toLocaleString("en-IN")} coins</p>
            <p>${Number(item.stock ?? 0).toLocaleString("en-IN")} in stock</p>
            <span class="badge ${statusColor(item.status || "active")}">${escapeHtml(item.status || "active")}</span>
            <small>Created ${formatDate(item.created_at)}</small>
            <div class="shop-actions">
              <button class="ghost-btn" type="button" data-edit-shop="${item.id}">Edit</button>
              <button class="soft-btn" type="button" data-toggle-shop="${item.id}">${String(item.status || "active").toLowerCase() === "disabled" ? "Enable" : "Disable"}</button>
              ${String(item.status || "").toLowerCase() === "archived"
                ? `<button class="soft-btn" type="button" data-restore-shop="${item.id}">Restore</button>`
                : `<button class="danger-btn" type="button" data-delete-shop="${item.id}">Delete</button>`}
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
    grid.querySelectorAll("[data-restore-shop]").forEach((button) => {
      button.addEventListener("click", () => restoreRecord("shop_items", button.dataset.restoreShop, "active"));
    });
    grid.querySelectorAll("[data-toggle-shop]").forEach((button) => {
      button.addEventListener("click", () => toggleShopStatus(button.dataset.toggleShop));
    });
  }

  function openBatchDetailsModal(batch) {
    if (!batch) return;
    const course = findById(state.data.courses, batch.course_id);
    const mentor = findById(state.data.users, batch.mentor_id);
    const students = batchStudents(batch);
    const activeTasks = state.data.batchTasks.filter((task) => sameId(task.batch_id, batch.id) && !task.deleted_at);
    openModal("Batch Details", `
      <div class="detail-grid">
        <div><span>Name</span><strong>${escapeHtml(batch.name || "Untitled batch")}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(batch.status || "draft")}</strong></div>
        <div><span>Course</span><strong>${escapeHtml(course?.title || "No course assigned")}</strong></div>
        <div><span>Mentor</span><strong>${escapeHtml(mentor?.name || "Unassigned")}</strong></div>
        <div><span>Students</span><strong>${students.length}</strong></div>
        <div><span>Capacity</span><strong>${escapeHtml(batch.capacity || batch.enroll_limit || "Not set")}</strong></div>
        <div><span>Period</span><strong>${escapeHtml(batchPeriod(batch))}</strong></div>
        <div><span>Progress</span><strong>${Math.round(Number(batch.progress || 0))}%</strong></div>
        <div><span>Tasks</span><strong>${activeTasks.length}</strong></div>
      </div>
      <div class="table-card" style="margin-top:16px;">
        <div class="panel-heading">
          <div>
            <h3>Students</h3>
            <p>${students.length ? "Currently assigned to this batch." : "No students assigned."}</p>
          </div>
        </div>
        <div class="responsive-table">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Course Status</th></tr></thead>
            <tbody>
              ${students.length ? students.map((student) => {
                const enrollment = studentBatchEnrollment(student, batch);
                return `
                  <tr>
                    <td>${escapeHtml(student.name || "Student")}</td>
                    <td>${escapeHtml(student.email || "")}</td>
                    <td>${escapeHtml(enrollment?.status || "active")}</td>
                  </tr>
                `;
              }).join("") : `<tr><td colspan="3">No students assigned.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="form-actions">
        <button class="ghost-btn" type="button" data-close-modal>Close</button>
        <button class="primary-btn" type="button" data-edit-batch="${batch.id}">Edit</button>
      </div>
    `);
    modalBody.querySelector("[data-edit-batch]")?.addEventListener("click", () => openBatchModal(batch));
  }

  function renderReviews() {
    const query = searchQuery();
    const projects = state.data.projects.filter((project) => matchesText(query, project.title, project.student_name, project.batch_name, project.status));
    const submissions = state.data.taskSubmissions.filter((submission) => {
      const task = findById(state.data.batchTasks, submission.task_id);
      const student = findById(state.data.users, submission.student_id || submission.user_id);
      return matchesText(query, task?.title, student?.name, student?.email, submission.status, submission.drive_link, submission.file_url);
    });
    const quizAttempts = state.data.quizAttempts.filter((attempt) => {
      const student = findById(state.data.users, attempt.student_id || attempt.user_id);
      const course = findById(state.data.courses, attempt.course_id);
      return !attempt.deleted_at && matchesText(query, student?.name, student?.email, course?.title, attempt.module_title, attempt.passed ? "passed" : "not passed");
    });

    document.getElementById("projectsList").innerHTML = projects.length
      ? projects.map(projectCardCompact).join("")
      : emptyState(hasQuery(query) ? "No projects match your search." : "No project submissions.");

    document.getElementById("submissionsList").innerHTML = submissions.length || quizAttempts.length
      ? `${submissions.map(adminSubmissionRow).join("")}${quizAttempts.map(adminQuizAttemptRow).join("")}`
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

  function adminQuizAttemptRow(attempt) {
    const student = findById(state.data.users, attempt.student_id || attempt.user_id);
    const course = findById(state.data.courses, attempt.course_id);
    const total = Number(attempt.total || attempt.max_score || 0);
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(course?.title || "Quiz attempt")}</strong>
          <small>${escapeHtml(student?.name || "Student")} - ${escapeHtml(attempt.module_title || "Module quiz")} - attempt ${Number(attempt.attempt_number || 1)}</small>
          <small>Score ${Number(attempt.score || 0)}/${total} - ${attempt.passed ? "Passed" : "Not passed"} - ${Number(attempt.question_count || selectedQuestionIds(attempt).length || 0) || "-"} questions - ${attemptDurationLabel(attempt)}</small>
        </div>
        <div class="row-actions"><span class="badge ${attempt.passed ? "green" : "amber"}">${formatDateTime(attempt.submitted_at || attempt.created_at)}</span></div>
      </div>
    `;
  }

  function selectedQuestionIds(attempt) {
    return Array.isArray(attempt.selected_question_ids) ? attempt.selected_question_ids : [];
  }

  function attemptDurationLabel(attempt) {
    const seconds = Math.max(0, Number(attempt.time_taken_seconds || attempt.duration_seconds || 0));
    return seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "-";
  }

  function projectCardCompact(project) {
    const student = findById(state.data.users, project.student_id || project.user_id), course = findById(state.data.courses, project.course_id), batch = findById(state.data.batches, project.batch_id);
    const submittedAt = project.submitted_at || project.created_at || project.updated_at;
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(project.title || "Project")}</strong>
          <small>${escapeHtml(student?.name || project.student_name || "Unknown student")} - ${escapeHtml(course?.title || "Course")} - ${escapeHtml(batch?.name || "No batch")} - ${formatDate(submittedAt)}</small>
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
      <form class="form-grid" id="courseForm" data-testid="course-form">
        <div class="form-row">
          <label for="courseTitle">Title</label>
          <input id="courseTitle" data-testid="course-title" required value="${escapeAttr(course?.title || "")}">
        </div>
        <div class="form-row">
          <label for="courseDescription">Description</label>
          <textarea id="courseDescription" data-testid="course-description">${escapeHtml(course?.description || "")}</textarea>
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
            <select id="courseStatus" data-testid="course-status">
              ${option("active", courseLifecycleStatus(course))}
              ${option("draft", courseLifecycleStatus(course))}
              ${option("deleted", courseLifecycleStatus(course))}
            </select>
          </div>
          <div>
            <label for="courseThumbnail">Thumbnail URL</label>
            <input id="courseThumbnail" value="${escapeAttr(course?.thumbnail_url || "")}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="courseThumbnailFile">Upload Thumbnail</label>
            <input id="courseThumbnailFile" type="file" accept="image/*">
          </div>
          <div>
            <label for="courseImage">Course Image URL</label>
            <input id="courseImage" value="${escapeAttr(course?.image_url || "")}">
          </div>
        </div>
        <div class="form-row">
          <label for="courseImageFile">Upload Course Image</label>
          <input id="courseImageFile" type="file" accept="image/*">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-testid="course-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="course-submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    bindImageFileToField("courseThumbnailFile", "courseThumbnail");
    bindImageFileToField("courseImageFile", "courseImage");

    document.getElementById("courseForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
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
          image_url: valueOf("courseImage") || null,
          created_by_admin: true
        };
        await saveCourseRecord(payload, course?.id);
      });
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
      <form class="assignment-form assignment-form-pro" id="courseAssignmentForm" data-testid="course-assignment-form">
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
            <input id="assignmentStudentSearch" data-testid="assignment-student-search" placeholder="Name or email">
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
            <input id="assignmentMentorSearch" data-testid="assignment-mentor-search" placeholder="Name or email">
          </label>
          <div class="assignment-list" data-assignment-list="mentors">
            ${mentors.length ? mentors.map((user) => assignmentOption(user, assignedMentors.has(String(user.id)), "assignedMentors")).join("") : `<div class="assignment-empty">No mentor users found.</div>`}
          </div>
        </section>

        <div class="form-actions">
          <button class="ghost-btn" type="button" data-testid="course-assignment-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="course-assignment-submit">Save Assignment</button>
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

  function openCourseContentModal(course) {
    if (!course?.id) return;
    let draftModules = normalizeCourseModulesForEditor(course, true);
    if (!draftModules.length) draftModules = [blankContentModule(1)];

    const renderContentEditor = () => {
      const activeModules = draftModules.filter((module) => !module.deleted_at);
      const list = document.getElementById("courseContentModuleList");
      if (!list) return;
      list.innerHTML = activeModules.length ? activeModules.map(contentModuleHtml).join("") : emptyState("No modules yet.");
      bindContentEditorActions();
    };

    const bindContentEditorActions = () => {
      modalBody.querySelectorAll("[data-add-content-lesson]").forEach((button) => {
        button.addEventListener("click", () => {
          draftModules = syncContentModulesFromForm(draftModules).map((module) => (
            sameId(module.id, button.dataset.addContentLesson)
              ? { ...module, lessons: [...activeLessons(module), blankContentLesson(activeLessons(module).length + 1)] }
              : module
          ));
          renderContentEditor();
        });
      });
      modalBody.querySelectorAll("[data-remove-content-module]").forEach((button) => {
        button.addEventListener("click", () => {
          if (!window.confirm("Archive this module?")) return;
          draftModules = syncContentModulesFromForm(draftModules).map((module) => (
            sameId(module.id, button.dataset.removeContentModule) ? { ...module, deleted_at: new Date().toISOString() } : module
          ));
          renderContentEditor();
        });
      });
      modalBody.querySelectorAll("[data-remove-content-lesson]").forEach((button) => {
        button.addEventListener("click", () => {
          if (!window.confirm("Archive this lesson?")) return;
          draftModules = syncContentModulesFromForm(draftModules).map((module) => ({
            ...module,
            lessons: activeLessons(module).map((lesson) => (
              sameId(lesson.id, button.dataset.removeContentLesson) ? { ...lesson, deleted_at: new Date().toISOString() } : lesson
            ))
          }));
          renderContentEditor();
        });
      });
    };

    openModal("Course Content Builder", `
      <form class="form-grid content-builder-form" id="courseContentForm" data-testid="course-content-form">
        <div class="import-callout">
          ${escapeHtml(course.title || "Course")} content is saved as modules with lessons, Drive video links, PDF/material links, assignments, FAQs, and quizzes.
        </div>
        <details class="advanced-form-options">
          <summary>Import Modules JSON</summary>
          <div class="form-row"><label for="courseContentJsonImport">Modules JSON</label><textarea id="courseContentJsonImport" rows="8" placeholder='[{"title":"Module 1","lessons":[],"quiz":{"questions":[]}}]'></textarea></div>
          <button class="ghost-btn" type="button" id="importContentJsonBtn">Import JSON</button>
        </details>
        <div class="module-editor-list" id="courseContentModuleList"></div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" id="addContentModuleBtn" data-testid="add-content-module">Add Module</button>
          <button class="ghost-btn" type="button" data-testid="course-content-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="course-content-submit">Save Content</button>
        </div>
      </form>
    `);

    document.getElementById("addContentModuleBtn")?.addEventListener("click", () => {
      draftModules = syncContentModulesFromForm(draftModules);
      draftModules.push(blankContentModule(draftModules.filter((module) => !module.deleted_at).length + 1));
      renderContentEditor();
    });

    document.getElementById("importContentJsonBtn")?.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(document.getElementById("courseContentJsonImport")?.value || "[]");
        const modules = Array.isArray(parsed) ? parsed : parsed.modules;
        if (!Array.isArray(modules)) throw new Error("JSON must be an array of modules or an object with a modules array.");
        draftModules = modules.map((module, index) => ({
          ...module,
          id: module.id || module.module_id || randomContentId("module"),
          title: module.title || module.name || `Module ${index + 1}`,
          order_index: Number(module.order_index || module.order || index + 1),
          deleted_at: module.deleted_at || null,
          lessons: Array.isArray(module.lessons) ? module.lessons.map((lesson, lessonIndex) => ({
            ...lesson, id: lesson.id || lesson.lesson_id || randomContentId("lesson"), title: lesson.title || lesson.name || `Lesson ${lessonIndex + 1}`,
            content_type: lesson.content_type || lesson.type || "video", order_index: Number(lesson.order_index || lesson.order || lessonIndex + 1), deleted_at: lesson.deleted_at || null
          })) : [],
          quiz: module.quiz || module.module_quiz || module.quizQuestions || null
        }));
        renderContentEditor();
        showAlert(`Imported ${draftModules.filter((module) => !module.deleted_at).length} module${draftModules.length === 1 ? "" : "s"}. Review and save content.`);
      } catch (error) {
        showAlert(error.message || "Invalid modules JSON.", true);
      }
    });

    document.getElementById("courseContentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
        const modules = syncContentModulesFromForm(draftModules);
        const driveError = firstInvalidDriveLesson(modules);
        if (driveError) {
          showAlert(driveError, true);
          return;
        }
        const invalidQuiz = modules.find((module) => module.quiz?.questions?.length && module.quiz.questions.length < 15);
        if (invalidQuiz) {
          showAlert(`${invalidQuiz.title || "Module"} quiz needs at least 15 questions. Use the mentor quiz editor for full question banks.`, true);
          return;
        }
        await saveCourseRecord({ modules }, course.id);
      });
    });

    renderContentEditor();
  }

  function contentModuleHtml(module, index) {
    const lessons = activeLessons(module);
    const quiz = normalizeContentQuiz(module.quiz, module, index);
    return `
      <section class="assignment-section" data-content-module-row data-module-id="${escapeAttr(module.id)}">
        <div class="assignment-section-head">
          <h4>Module ${index + 1}</h4>
          <button class="danger-btn" type="button" data-remove-content-module="${escapeAttr(module.id)}">Archive Module</button>
        </div>
        <div class="form-row two">
          <div><label>Module Title</label><input data-module-field="title" value="${escapeAttr(module.title || "")}" required></div>
          <div><label>Module Type</label><input data-module-field="type" value="${escapeAttr(module.type || "Self-paced")}"></div>
        </div>
        <div class="form-row">
          <label>Module Description</label>
          <textarea data-module-field="description">${escapeHtml(module.description || "")}</textarea>
        </div>
        <div class="compact-list">
          ${lessons.length ? lessons.map(contentLessonHtml).join("") : emptyState("No lessons yet.")}
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-add-content-lesson="${escapeAttr(module.id)}">Add Lesson</button>
        </div>
        <details class="advanced-form-options">
          <summary>Quiz - requires 15 questions before publishing</summary>
          <div class="form-row two">
            <div><label>Quiz Title</label><input data-quiz-field="title" value="${escapeAttr(quiz.title)}"></div>
            <div><label>Pass Marks</label><input data-quiz-field="pass_marks" type="number" min="0" value="${escapeAttr(quiz.pass_marks)}"></div>
          </div>
          <div class="form-row two">
            <div><label>Question</label><input data-quiz-question-field="question" value="${escapeAttr(quiz.questions[0]?.question || "")}"></div>
            <div><label>Marks</label><input data-quiz-question-field="marks" type="number" min="0" value="${escapeAttr(quiz.questions[0]?.marks || 0)}"></div>
          </div>
          <div class="form-row">
            <label>Correct Answer</label>
            <input data-quiz-question-field="answer" value="${escapeAttr(quiz.questions[0]?.answer || "")}">
          </div>
        </details>
      </section>
    `;
  }

  function contentLessonHtml(lesson) {
    return `
      <div class="list-row" data-content-lesson-row data-lesson-id="${escapeAttr(lesson.id)}">
        <div class="form-grid">
          <div class="form-row two">
            <div><label>Lesson Title</label><input data-lesson-field="title" value="${escapeAttr(lesson.title || "")}" required></div>
            <div>
              <label>Type</label>
              <select data-lesson-field="content_type">
                ${option("video", lesson.content_type || "video", "Video")}
                ${option("pdf", lesson.content_type, "PDF")}
                ${option("assignment", lesson.content_type, "Assignment")}
                ${option("resource", lesson.content_type, "Resource")}
                ${option("faq", lesson.content_type, "FAQ")}
              </select>
            </div>
          </div>
          <div class="form-row">
            <label>Google Drive Video Link</label>
            <input data-lesson-field="video_drive_link" placeholder="https://drive.google.com/file/d/.../view" value="${escapeAttr(lesson.video_drive_link || "")}">
          </div>
          <div class="form-row two">
            <div><label>PDF / Material URL</label><input data-lesson-field="file_url" value="${escapeAttr(lesson.file_url || lesson.material_url || "")}"></div>
            <div><label>Assignment Link</label><input data-lesson-field="assignment_url" value="${escapeAttr(lesson.assignment_url || "")}"></div>
          </div>
          <div class="form-row">
            <label>Description / FAQ Answer</label>
            <textarea data-lesson-field="description">${escapeHtml(lesson.description || "")}</textarea>
          </div>
        </div>
        <button class="danger-btn" type="button" data-remove-content-lesson="${escapeAttr(lesson.id)}">Archive Lesson</button>
      </div>
    `;
  }

  function syncContentModulesFromForm(existingModules) {
    const rows = Array.from(modalBody.querySelectorAll("[data-content-module-row]"));
    const synced = rows.map((row, index) => {
      const moduleId = row.dataset.moduleId || randomContentId("module");
      const previous = existingModules.find((module) => sameId(module.id, moduleId)) || {};
      const title = fieldValue(row, "[data-module-field='title']") || `Module ${index + 1}`;
      const lessons = Array.from(row.querySelectorAll("[data-content-lesson-row]")).map((lessonRow, lessonIndex) => {
        const lessonId = lessonRow.dataset.lessonId || randomContentId("lesson");
        const priorLesson = activeLessons(previous).find((lesson) => sameId(lesson.id, lessonId)) || {};
        const videoLink = fieldValue(lessonRow, "[data-lesson-field='video_drive_link']");
        const fileUrl = fieldValue(lessonRow, "[data-lesson-field='file_url']");
        return {
          ...priorLesson,
          id: lessonId,
          title: fieldValue(lessonRow, "[data-lesson-field='title']") || `Lesson ${lessonIndex + 1}`,
          content_type: fieldValue(lessonRow, "[data-lesson-field='content_type']") || "video",
          order_index: lessonIndex + 1,
          video_drive_link: normalizeGoogleDrivePreviewUrl(videoLink),
          drive_link: videoLink,
          file_url: fileUrl,
          material_url: fileUrl,
          assignment_url: fieldValue(lessonRow, "[data-lesson-field='assignment_url']"),
          description: fieldValue(lessonRow, "[data-lesson-field='description']"),
          deleted_at: priorLesson.deleted_at || null
        };
      });
      const question = fieldValue(row, "[data-quiz-question-field='question']");
      const answer = fieldValue(row, "[data-quiz-question-field='answer']");
      const marks = Number(fieldValue(row, "[data-quiz-question-field='marks']") || 0);
      const priorQuizQuestions = Array.isArray(previous.quiz?.questions) ? previous.quiz.questions : [];
      const quizQuestions = question ? (
        priorQuizQuestions.length
          ? priorQuizQuestions.map((item, itemIndex) => itemIndex === 0
            ? { ...item, question, text: item.text || question, answer, marks: Number.isFinite(marks) ? marks : Number(item.marks || 0) }
            : item)
          : [{ id: randomContentId("question"), question, answer, marks: Number.isFinite(marks) ? marks : 0 }]
      ) : [];
      return {
        ...previous,
        id: moduleId,
        title,
        description: fieldValue(row, "[data-module-field='description']"),
        type: fieldValue(row, "[data-module-field='type']") || "Self-paced",
        order_index: index + 1,
        deleted_at: previous.deleted_at || null,
        lessons,
        quiz: question ? {
          id: previous.quiz?.id || randomContentId("quiz"),
          title: fieldValue(row, "[data-quiz-field='title']") || `${title} Quiz`,
          pass_marks: Number(fieldValue(row, "[data-quiz-field='pass_marks']") || 0),
          questions: quizQuestions
        } : null
      };
    });
    const archived = existingModules.filter((module) => module.deleted_at && !rows.some((row) => sameId(row.dataset.moduleId, module.id)));
    return [...synced, ...archived];
  }

  function normalizeCourseModulesForEditor(course, includeDeleted = false) {
    return adminCourseModules(course, includeDeleted).map((module, index) => ({
      id: module.id || module.module_id || randomContentId("module"),
      title: module.title || module.name || `Module ${index + 1}`,
      description: module.description || "",
      type: module.type || module.module_type || "Self-paced",
      order_index: Number(module.order_index || module.order || index + 1),
      deleted_at: module.deleted_at || null,
      lessons: Array.isArray(module.lessons) ? module.lessons.map((lesson, lessonIndex) => ({
        id: lesson.id || lesson.lesson_id || randomContentId("lesson"),
        title: lesson.title || lesson.name || `Lesson ${lessonIndex + 1}`,
        content_type: lesson.content_type || lesson.type || "video",
        order_index: Number(lesson.order_index || lesson.order || lessonIndex + 1),
        video_drive_link: lesson.video_drive_link || lesson.google_drive_link || lesson.drive_link || lesson.video_url || "",
        drive_link: lesson.drive_link || lesson.google_drive_link || "",
        file_url: lesson.file_url || lesson.material_url || "",
        material_url: lesson.material_url || lesson.file_url || "",
        assignment_url: lesson.assignment_url || lesson.submission_url || "",
        description: lesson.description || "",
        deleted_at: lesson.deleted_at || null
      })) : [],
      quiz: normalizeContentQuiz(module.quiz || module.module_quiz || module.quizQuestions || module.questions, module, index)
    }));
  }

  function activeLessons(module) { return (module.lessons || []).filter((lesson) => !lesson.deleted_at); }

  function blankContentModule(index) {
    return { id: randomContentId("module"), title: `Module ${index}`, description: "", type: "Self-paced", order_index: index, deleted_at: null, lessons: [blankContentLesson(1)], quiz: null };
  }

  function blankContentLesson(index) {
    return { id: randomContentId("lesson"), title: `Lesson ${index}`, content_type: "video", order_index: index, video_drive_link: "", drive_link: "", file_url: "", material_url: "", assignment_url: "", description: "", deleted_at: null };
  }

  function normalizeContentQuiz(rawQuiz, module = {}, index = 0) {
    const source = Array.isArray(rawQuiz) ? { questions: rawQuiz } : rawQuiz || {};
    const questions = Array.isArray(source.questions) ? source.questions : [];
    return {
      id: source.id || source.quiz_id || randomContentId("quiz"),
      title: source.title || `${module.title || `Module ${index + 1}`} Quiz`,
      pass_marks: Number(source.pass_marks || source.passScore || 0),
      questions: questions.map((question, questionIndex) => ({
        id: question.id || question.question_id || randomContentId("question"),
        question: question.question || question.text || question.title || "",
        answer: question.answer || question.correct_answer || "",
        marks: Number(question.marks ?? question.score ?? (questionIndex === 0 ? 0 : 0))
      }))
    };
  }

  function firstInvalidDriveLesson(modules) {
    for (const module of modules) {
      for (const lesson of activeLessons(module)) {
        const link = String(lesson.drive_link || lesson.video_drive_link || "").trim();
        if (!link) continue;
        if (!isValidGoogleDriveVideoLink(link)) {
          return `Invalid Google Drive video link in ${lesson.title || module.title || "course content"}. Use a public Drive file link, not a folder, Docs, or Sheets link.`;
        }
      }
    }
    return "";
  }

  function isValidGoogleDriveVideoLink(value) {
    const url = String(value || "").trim();
    if (!url) return true;
    if (!/^https:\/\/drive\.google\.com\//i.test(url)) return false;
    if (/\/folders\/|\/document\/|\/spreadsheets\/|\/presentation\//i.test(url)) return false;
    return /\/file\/d\/[^/]+|[?&]id=[^&]+/i.test(url);
  }

  function normalizeGoogleDrivePreviewUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (fileMatch?.[1]) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    const openMatch = url.match(/[?&]id=([^&]+)/i);
    if (openMatch?.[1]) return `https://drive.google.com/file/d/${openMatch[1]}/preview`;
    return url;
  }

  function fieldValue(root, selector) {
    return root.querySelector(selector)?.value?.trim() || "";
  }

  function bindImageFileToField(fileInputId, targetFieldId) {
    document.getElementById(fileInputId)?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!String(file.type || "").startsWith("image/")) {
        showAlert("Choose a valid image file.", true);
        event.target.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const target = document.getElementById(targetFieldId);
        if (target) target.value = reader.result || "";
      };
      reader.onerror = () => showAlert("Unable to read selected image.", true);
      reader.readAsDataURL(file);
    });
  }

  function randomContentId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function openBatchModal(batch = null) {
    const mentors = state.data.users.filter((user) => user.role === "mentor" || user.role === "admin");
    const isEdit = Boolean(batch);
    openModal(`${isEdit ? "Edit" : "Add"} Batch`, `
      <form class="form-grid" id="batchForm" data-testid="batch-form">
        <div class="form-row">
          <label for="batchName">Batch Name</label>
          <input id="batchName" data-testid="batch-name" required value="${escapeAttr(batch?.name || "")}">
        </div>
        <div class="form-row two">
          <div>
            <label for="batchCourse">Course</label>
            <select id="batchCourse" data-testid="batch-course" required>
              ${state.data.courses.map((course) => option(course.id, batch?.course_id, course.title)).join("")}
            </select>
          </div>
          <div>
            <label for="batchMentor">Mentor</label>
            <select id="batchMentor" data-testid="batch-mentor">
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
          <button class="ghost-btn" type="button" data-testid="batch-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="batch-submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    document.getElementById("batchForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
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
      <form class="form-grid" id="createUserForm" data-testid="create-user-form">
        <div class="form-row two">
          <div>
            <label for="createUserName">Name</label>
            <input id="createUserName" data-testid="create-user-name" required placeholder="Student or mentor name">
          </div>
          <div>
            <label for="createUserEmail">Email</label>
            <input id="createUserEmail" data-testid="create-user-email" type="email" required placeholder="name@example.com">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="createUserPassword">Login Password</label>
            <input id="createUserPassword" data-testid="create-user-password" type="password" required minlength="${MIN_ADMIN_PASSWORD_LENGTH}" autocomplete="new-password" placeholder="At least 8 characters">
          </div>
          <div>
            <label for="createUserRole">Role</label>
            <select id="createUserRole" data-testid="create-user-role">
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
            <select id="createUserCourse" data-testid="create-user-course">
              <option value="">No course yet</option>
              ${state.data.courses.map((course) => option(course.id, "", course.title || course.name || "Course")).join("")}
            </select>
          </div>
          <div>
            <label for="createUserBatch">Assign Batch</label>
            <select id="createUserBatch" data-testid="create-user-batch">
              <option value="">No batch</option>
              ${state.data.batches.map((batch) => option(batch.id, "", batch.name || "Batch")).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label for="createUserCoins">Starting Coins</label>
          <input id="createUserCoins" type="number" min="0" value="0">
        </div>
        <div class="form-row">
          <label for="createUserReferral">Refer Key</label>
          <input id="createUserReferral" placeholder="Optional, leave blank to generate a unique refer key">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-testid="create-user-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="create-user-submit">Create User</button>
        </div>
      </form>
    `);

    document.getElementById("createUserForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
        try {
          await saveAdminUser({
            name: valueOf("createUserName"),
            email: valueOf("createUserEmail"),
            password: valueOf("createUserPassword"),
            role: valueOf("createUserRole"),
            username: valueOf("createUserUsername") || null,
            phone: valueOf("createUserPhone") || null,
            referral_key: valueOf("createUserReferral") || null,
            coins: Number(valueOf("createUserCoins") || 0)
          }, {
            courseId: valueOf("createUserCourse") || null,
            batchId: valueOf("createUserBatch") || null
          });
          closeModal();
          await loadAllData({ force: true });
          showAlert("User added and assigned.");
        } catch (error) {
          console.error("Admin add user failed", error);
          showAlert(adminSaveErrorText(error, "Unable to add user."), true);
        }
      });
    });
  }

  function openUserImportModal() {
    openModal("Bulk Import Users", `
      <form class="form-grid" id="userImportForm">
        <div class="import-callout">
          CSV headers required: name, email, course, batch, password.
        </div>
        <div class="form-row">
          <label for="userCsvFile">CSV File</label>
          <input id="userCsvFile" type="file" accept=".csv,text/csv" required>
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
        const result = await importUsersFromCsv(parsedRows);
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
      <form class="form-grid" id="taskForm" data-testid="task-form">
        <div class="form-row">
          <label for="taskTitle">Title</label>
          <input id="taskTitle" data-testid="task-title" required value="${escapeAttr(task?.title || task?.name || "")}">
        </div>
        <div class="form-row">
          <label for="taskDescription">Instructions</label>
          <textarea id="taskDescription" data-testid="task-description">${escapeHtml(task?.description || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="taskBatch">Batch</label>
            <select id="taskBatch" data-testid="task-batch" required>
              ${state.data.batches.map((batch) => option(batch.id, task?.batch_id, batch.name)).join("")}
            </select>
          </div>
          <div>
            <label for="taskDueDate">Due Date</label>
            <input id="taskDueDate" data-testid="task-due-date" type="date" value="${escapeAttr(toDateInput(task?.due_date || task?.deadline))}">
          </div>
        </div>
        <div class="form-row">
          <label for="taskStatus">Status</label>
          <select id="taskStatus" data-testid="task-status">
            ${option("draft", task?.status)}
            ${option("active", task?.status)}
            ${option("closed", task?.status)}
          </select>
        </div>
        <div class="form-row">
          <label for="taskTotalMarks">Maximum Marks</label>
          <input id="taskTotalMarks" data-testid="task-total-marks" type="number" min="0" step="0.01" value="${escapeAttr(task?.total_marks ?? task?.max_marks ?? "")}">
        </div>
        <div class="form-row">
          <label for="taskDriveLink">Drive Link</label>
          <input id="taskDriveLink" data-testid="task-drive-link" type="url" placeholder="https://drive.google.com/..." value="${escapeAttr(task?.drive_link || "")}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-testid="task-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="task-submit">${isEdit ? "Save" : "Create"}</button>
        </div>
      </form>
    `);

    document.getElementById("taskForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
        await upsertRecord("batch_tasks", {
          title: valueOf("taskTitle"),
          description: valueOf("taskDescription"),
          batch_id: valueOf("taskBatch"),
          status: valueOf("taskStatus") || "draft",
          total_marks: valueOf("taskTotalMarks") === "" ? null : Number(valueOf("taskTotalMarks")),
          published_at: valueOf("taskStatus") === "active" ? task?.published_at || new Date().toISOString() : null,
          deadline: valueOf("taskDueDate") ? new Date(`${valueOf("taskDueDate")}T23:59:59`).toISOString() : null,
          drive_link: valueOf("taskDriveLink") || null
        }, task?.id);
      });
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
        <div class="form-row two">
          <div>
            <label for="shopStock">Stock</label>
            <input id="shopStock" type="number" min="0" step="1" value="${escapeAttr(item?.stock ?? 0)}">
          </div>
          <div>
            <label for="shopStatus">Status</label>
            <select id="shopStatus">
              ${option("active", item?.status || "active", "Enabled")}
              ${option("disabled", item?.status, "Disabled")}
              ${option("archived", item?.status, "Archived")}
            </select>
          </div>
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

    bindImageFileToField("shopImageFile", "shopImage");

    document.getElementById("shopForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
        const payload = {
          name: valueOf("shopName"),
          price: Number(valueOf("shopPrice") || 0),
          image_url: valueOf("shopImage"),
          stock: Math.max(0, Number(valueOf("shopStock") || 0)),
          status: valueOf("shopStatus") || "active"
        };
        await upsertRecord("shop_items", payload, item?.id);
      });
    });
  }

  function openAnnouncementModal(item = null) {
    const isEdit = Boolean(item);
    openModal(`${isEdit ? "Edit" : "Create"} Announcement`, `
      <form class="form-grid" id="announcementForm" data-testid="announcement-form">
        <div class="form-row">
          <label for="announcementTitle">Title</label>
          <input id="announcementTitle" data-testid="announcement-title" value="${escapeAttr(item?.title || "")}" placeholder="Optional headline">
        </div>
        <div class="form-row">
          <label for="announcementMessage">Announcement message</label>
          <textarea id="announcementMessage" data-testid="announcement-message" required placeholder="Write the announcement...">${escapeHtml(item?.message || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="announcementAudience">Audience</label>
            <select id="announcementAudience" data-testid="announcement-audience">
              ${option("all", item?.audience, "Students and mentors")}
              ${option("students", item?.audience, "Students only")}
              ${option("mentors", item?.audience, "Mentors only")}
              ${option("batch", item?.audience, "Specific batch")}
              ${option("course", item?.audience, "Specific course")}
            </select>
          </div>
          <div>
            <label for="announcementPriority">Priority</label>
            <select id="announcementPriority" data-testid="announcement-priority">
              ${option("normal", item?.priority, "Normal")}
              ${option("important", item?.priority, "Important")}
              ${option("urgent", item?.priority, "Urgent")}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="announcementBatch">Batch target</label>
            <select id="announcementBatch" data-testid="announcement-batch">
              <option value="">No batch target</option>
              ${state.data.batches.map((batch) => option(batch.id, item?.batch_id, batch.name || "Batch")).join("")}
            </select>
          </div>
          <div>
            <label for="announcementCourse">Course target</label>
            <select id="announcementCourse" data-testid="announcement-course">
              <option value="">No course target</option>
              ${state.data.courses.map((course) => option(course.id, item?.course_id, course.title || "Course")).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label for="announcementExpiry">Expires on</label>
          <input id="announcementExpiry" data-testid="announcement-expiry" type="date" value="${escapeAttr(toDateInput(item?.expires_at))}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-testid="announcement-cancel" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit" data-testid="announcement-submit">${isEdit ? "Save" : "Send"}</button>
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
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
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
            <label for="userReferral">Refer Key</label>
            <input id="userReferral" value="${escapeAttr(userReferralCode(user))}" ${disabled}>
          </div>
          <div>
            <label>Refer Key Source</label>
            <input value="${escapeAttr(user.referral_key ? "Database" : "Not set")}" disabled>
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
            <label for="userPassword">Reset Login Password</label>
            <input id="userPassword" type="password" minlength="${MIN_ADMIN_PASSWORD_LENGTH}" autocomplete="new-password" placeholder="Enter 8+ characters to create or reset login">
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
      await runLockedSubmit(event.currentTarget, event.submitter, async () => {
        try {
          await saveAdminUser({
            name: valueOf("userName"),
            email: valueOf("userEmail"),
            password: valueOf("userPassword") || undefined,
            role: valueOf("userRole"),
            username: valueOf("userUsername") || null,
            phone: valueOf("userPhone") || null,
            referral_key: valueOf("userReferral") || null,
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
    const student = findById(state.data.users, project.student_id || project.user_id), course = findById(state.data.courses, project.course_id), batch = findById(state.data.batches, project.batch_id), projectLinks = projectAttachmentLinks(project);
    openReviewModal({
      title: "Review Project", table: "projects", id: project.id, status: project.status, notes: project.review_notes || project.feedback, noteField: "review_notes", statusOptions: ["pending", "approved", "changes_requested", "rejected"],
      detailsHtml: `<section class="review-context-panel">${[
        ["Project", project.title || "Project"], ["Student", student?.name || student?.email || "Unknown student"], ["Course", course?.title || "Course not linked"], ["Batch", batch?.name || "No batch"], ["Submitted", formatDateTime(project.created_at || project.updated_at)], ["Status", project.status || "pending"]
      ].map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section><section class="review-context-body"><strong>Description</strong><p>${escapeHtml(project.description || "No project description was submitted.")}</p>${projectLinks.length ? `<div class="review-link-list">${projectLinks.map((link, index) => `<a class="secondary-btn" href="${escapeAttr(link)}" target="_blank" rel="noopener">Open Attachment ${index + 1}</a>`).join("")}</div>` : `<p class="muted">No attachments or links submitted.</p>`}${project.reviewed_at ? `<small class="muted">Last reviewed ${escapeHtml(formatDateTime(project.reviewed_at))}</small>` : ""}</section>`
    });
  }

  function openSubmissionReviewModal(submission) {
    if (!submission) return; const task = findById(state.data.batchTasks, submission.task_id);
    openReviewModal({ title: "Review Submission", table: "task_submissions", id: submission.id, status: submission.status, notes: submission.feedback, score: submission.marks_obtained ?? submission.score, totalMarks: submission.total_marks ?? submission.max_marks ?? task?.total_marks ?? task?.max_marks, noteField: "feedback", statusOptions: ["pending", "approved", "changes_requested", "rejected"] });
  }

  function projectAttachmentLinks(project) {
    const raw = project?.file_urls; let fileUrls = Array.isArray(raw) ? raw : [];
    if (!fileUrls.length && typeof raw === "string" && raw.trim()) { try { const parsed = JSON.parse(raw); fileUrls = Array.isArray(parsed) ? parsed : [raw]; } catch { fileUrls = raw.split(/[\n,|]+/); } }
    return [...new Set([project?.drive_link, project?.file_url, ...fileUrls].map((link) => String(link || "").trim()).filter(Boolean))];
  }

  function openReviewModal(config) {
    openModal(config.title, `
      <form class="form-grid" id="reviewForm">
        ${config.detailsHtml || ""}
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
        ${config.table === "task_submissions" ? `
          <div class="form-row two">
            <div><label for="reviewScore">Marks Obtained</label><input id="reviewScore" type="number" min="0" step="0.01" value="${escapeAttr(config.score ?? "")}"></div>
            <div><label for="reviewTotalMarks">Maximum Marks</label><input id="reviewTotalMarks" type="number" min="0" step="0.01" value="${escapeAttr(config.totalMarks ?? "")}"></div>
          </div>
        ` : ""}
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Review</button>
        </div>
      </form>
    `);

    document.getElementById("reviewForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const score = config.table === "task_submissions" && valueOf("reviewScore") !== "" ? Number(valueOf("reviewScore")) : null;
      const totalMarks = config.table === "task_submissions" && valueOf("reviewTotalMarks") !== "" ? Number(valueOf("reviewTotalMarks")) : null;
      if (score !== null && (!totalMarks || score > totalMarks)) {
        showAlert("Marks obtained must not exceed maximum marks.", true);
        return;
      }
      await upsertRecord(config.table, {
        status: valueOf("reviewStatus"), [config.noteField]: valueOf("reviewNotes"), feedback: valueOf("reviewNotes"),
        ...(config.table === "task_submissions" ? { score, marks_obtained: score, total_marks: totalMarks, graded_at: score === null ? null : new Date().toISOString() } : { reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
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
    const nextStatus = courseLifecycleStatus(course) === "active" ? "draft" : "active";
    await upsertRecord("courses", { status: nextStatus, deleted_at: null }, course.id);
  }

  async function toggleShopStatus(itemId) {
    const item = findById(state.data.shopItems, itemId);
    if (!item) return;
    const nextStatus = String(item.status || "active").toLowerCase() === "disabled" ? "active" : "disabled";
    await upsertRecord("shop_items", { status: nextStatus }, item.id);
  }

  async function duplicateCourse(courseId) {
    const course = findById(state.data.courses, courseId);
    if (!course) return;
    const now = new Date().toISOString();
    const modules = adminCourseModules(course, true).map((module, moduleIndex) => ({
      ...module,
      id: `module-copy-${Date.now()}-${moduleIndex + 1}`,
      title: module.title || `Module ${moduleIndex + 1}`,
      deleted_at: null,
      lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
        ...lesson,
        id: `lesson-copy-${Date.now()}-${moduleIndex + 1}-${lessonIndex + 1}`,
        deleted_at: null
      }))
    }));
    const payload = {
      title: `${course.title || "Course"} (Copy)`,
      description: course.description || null,
      category: course.category || null,
      duration: course.duration || null,
      module_type: course.module_type || null,
      instructor_name: course.instructor_name || "Academy Mentor",
      thumbnail_url: course.thumbnail_url || null,
      rating: course.rating || null,
      price: Number(course.price || 0),
      difficulty: course.difficulty || null,
      modules,
      is_featured: Boolean(course.is_featured),
      is_my_course: Boolean(course.is_my_course),
      status: "Draft",
      created_by_admin: true,
      quiz_coin_reward: course.quiz_coin_reward || null,
      quiz_pass_score: course.quiz_pass_score || null,
      mentor_id: course.mentor_id || null,
      google_form_url: course.google_form_url || null,
      created_at: now
    };
    try {
      await saveCourseRecord(payload);
      showAlert("Course duplicated as a draft.");
    } catch (error) {
      showAlert(error.message || "Unable to duplicate course.", true);
    }
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
    const duplicateUser = state.data.users.find((user) => String(user.email || "").toLowerCase() === email && !sameId(user.id, targetUser?.id));
    if (duplicateUser) throw new Error("A user with this email already exists.");
    const existingUser = targetUser;
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

    if (!existingUser) {
      throw new Error(lastAdminUserApiSetupError || "Admin user service is required to create users. Deploy the admin-save-user Supabase Edge Function and retry Add User.");
    }

    const authSensitiveChange = existingUser
      && (Boolean(userPayload.password) || String(existingUser.email || "").trim().toLowerCase() !== email);
    if (authSensitiveChange) {
      throw new Error("Admin user service is required to change emails or reset passwords. Deploy admin-save-user with SUPABASE_SERVICE_ROLE_KEY configured.");
    }

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

  let lastAdminUserApiSetupError = "";

  async function saveAdminUserViaRpc(userPayload, assignment) {
    lastAdminUserApiSetupError = "";
    if (!state.admin?.id || !getClient()?.functions) return null;
    const { data, error } = await getClient().functions.invoke("admin-save-user", {
      body: {
        target_user_id: assignment.targetUserId,
        user_payload: userPayload,
        assign_course_id: assignment.courseId,
        assign_batch_id: assignment.batchId
      }
    });
    if (!error) return Array.isArray(data) ? data[0] : data;
    const serviceMessage = await adminUserServiceErrorMessage(error);
    if (/failed to send a request/i.test(String(error.message || ""))) {
      lastAdminUserApiSetupError = "admin-save-user Edge Function is unavailable. Deploy it from supabase/functions/admin-save-user and retry.";
      return null;
    }
    throw new Error(serviceMessage || "Unable to save user.");
  }

  function adminSaveErrorText(error, fallback) {
    const message = String(error?.message || fallback || "Unable to save user.");
    const status = error?.status ? `HTTP ${error.status}` : "";
    const code = error?.code ? String(error.code) : "";
    const path = error?.path ? `path ${error.path}` : "";
    const detail = [status, code, path].filter(Boolean).join(" / ");
    return detail ? `${message} (${detail})` : message;
  }

  async function adminUserServiceErrorMessage(error) {
    const response = error?.context;
    if (response?.clone) {
      const body = await response.clone().json().catch(() => null);
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
    return String(error?.message || "");
  }

  async function insertUserRecord(payload) {
    const candidates = [
      payload,
      stripKeys(payload, ["referral_key"]),
      stripKeys(payload, ["referral"]),
      stripKeys(payload, ["referral", "referral_key"]),
      stripKeys(payload, ["course_ids"]),
      stripKeys(payload, ["password"]),
      stripKeys(payload, ["password", "course_ids"]),
      stripKeys(payload, ["password", "course_ids", "referral_key"]),
      stripKeys(payload, ["password", "course_ids", "referral"]),
      stripKeys(payload, ["password", "course_ids", "referral", "referral_key"]),
      stripKeys(payload, ["password", "course_ids", "coins"]),
      stripKeys(payload, ["password", "auth_user_id", "course_ids", "referral", "coins", "status"])
    ];
    return writeFirstWorkingUser(candidates, null);
  }

  async function updateUserRecord(id, payload) {
    const candidates = [
      payload,
      stripKeys(payload, ["referral_key"]),
      stripKeys(payload, ["referral"]),
      stripKeys(payload, ["referral", "referral_key"]),
      stripKeys(payload, ["course_ids"]),
      stripKeys(payload, ["password"]),
      stripKeys(payload, ["password", "course_ids"]),
      stripKeys(payload, ["password", "course_ids", "referral_key"]),
      stripKeys(payload, ["password", "course_ids", "referral"]),
      stripKeys(payload, ["password", "course_ids", "referral", "referral_key"]),
      stripKeys(payload, ["password", "course_ids", "coins"]),
      stripKeys(payload, ["password", "auth_user_id", "course_ids", "referral", "coins", "status"])
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
    let current = existingEnrollment || state.data.userCourses.find((row) => String(row.user_id || row.student_id || "") === String(userId) && String(row.course_id || "") === String(courseId));
    if (!current) {
      const { data: liveRows, error: liveError } = await supabaseClient.from("user_courses").select(SELECTS.userCourses).eq("course_id", courseId).or(`user_id.eq.${userId},student_id.eq.${userId},learner_id.eq.${userId}`);
      if (!liveError && Array.isArray(liveRows) && liveRows.length) current = liveRows.find((row) => !row.deleted_at && !["archived", "removed"].includes(String(row.status || "").toLowerCase())) || liveRows[0];
    }
    if (!current && supabaseClient.rpc) {
      const { data, error: rpcError } = await supabaseClient.rpc("lms_enroll_student", { target_user_id: userId, target_course_id: courseId });
      if (!rpcError && data) current = Array.isArray(data) ? data[0] : data;
      else if (rpcError && !isMissingRpcError(rpcError)) throw rpcError;
    }
    const payload = compactObject({ user_id: userId, course_id: courseId, batch_id: batchId || null, status });
    let writePayload = payload, error = null, selectColumns = SELECTS.userCourses;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const request = current?.id
        ? supabaseClient.from("user_courses").update(writePayload).eq("id", current.id).select(selectColumns)
        : current
          ? supabaseClient.from("user_courses").update(writePayload).eq("user_id", current.user_id).eq("course_id", current.course_id).select(selectColumns)
          : supabaseClient.from("user_courses").insert(writePayload).select(selectColumns);
      ({ error } = await request);
      if (!error) break;
      if (/duplicate key value|user_courses_pkey|unique constraint/i.test(error.message || "")) {
        const { data: duplicateRows, error: duplicateLookupError } = await supabaseClient.from("user_courses").select(SELECTS.userCourses).eq("course_id", courseId).or(`user_id.eq.${userId},student_id.eq.${userId},learner_id.eq.${userId}`);
        if (!duplicateLookupError && Array.isArray(duplicateRows) && duplicateRows.length) { current = duplicateRows[0]; continue; }
      }
      if (!isSchemaShapeError(error)) break;
      const nextPayload = compatibleWritePayload("user_courses", writePayload, error);
      if (JSON.stringify(nextPayload) === JSON.stringify(writePayload)) break;
      writePayload = nextPayload; selectColumns = "user_id,course_id,created_at,status";
    }
    if (error) throw error;

    const user = findById(state.data.users, userId);
    const courseIds = mergeCourseIds(user?.course_ids, courseId);
    await updateUserRecord(userId, compactObject({ batch_id: batchId || null, course_ids: courseIds.length ? courseIds : undefined }));
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
      stripKeys(payload, ["image_url"]),
      stripKeys(payload, ["mentor_id"]),
      stripKeys(payload, ["created_by_admin"]),
      stripKeys(payload, ["image_url", "mentor_id"]),
      stripKeys(payload, ["image_url", "created_by_admin"]),
      stripKeys(payload, ["image_url", "mentor_id", "created_by_admin"])
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
      const spec = TABLE_SPECS.find((item) => item.table === table);
      let writePayload = compactObject(payload);
      let data = null;
      let error = null;
      let selectColumns = returning;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const request = id
          ? supabaseClient.from(table).update(writePayload).eq("id", id).select(selectColumns)
          : supabaseClient.from(table).insert(writePayload).select(selectColumns);
        ({ data, error } = await request);
        if (!error) break;
        if (!isSchemaShapeError(error)) break;
        const nextPayload = compatibleWritePayload(table, writePayload, error);
        const changedPayload = JSON.stringify(nextPayload) !== JSON.stringify(writePayload);
        if (!changedPayload && selectColumns === (spec?.fallbackSelect || returning)) break;
        writePayload = nextPayload;
        selectColumns = spec?.fallbackSelect || returning;
      }
      if (error) throw error;
      mergeSavedRecord(table, Array.isArray(data) ? data[0] : data, id, writePayload);
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

  function compatibleWritePayload(table, payload, error) {
    const missingColumn = missingColumnFromError(error);
    const optionalByTable = { batch_tasks: ["max_marks", "course_id", "published_at", "created_by"], task_submissions: ["max_marks", "batch_id", "course_id", "graded_at"], batches: ["enroll_limit", "smart_waitlist", "progress", "enrolled_count"], courses: ["image_url", "mentor_id", "created_by_admin"], user_courses: ["batch_id", "status", "deleted_at"], announcements: ["updated_at", "expires_at", "course_id", "batch_id", "created_by_role"], shop_items: ["image_url", "stock", "status", "deleted_at"] };
    const optional = optionalByTable[table] || [];
    const keysToStrip = missingColumn ? [missingColumn] : optional.filter((key) => Object.prototype.hasOwnProperty.call(payload, key));
    return stripKeys(payload, keysToStrip);
  }

  function missingColumnFromError(error) {
    const message = String(error?.message || "");
    const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
    if (quoted) return quoted[1] || quoted[2] || quoted[3] || ""; return message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
  }

  function openCourseDeleteModal(course, confirmPermanent = false) {
    if (!course?.id) return; const title = escapeHtml(course.title || "this course");
    openModal(confirmPermanent ? "Permanently Delete Course" : "Delete Course", `<div class="confirm-panel danger-confirm" role="alertdialog" aria-describedby="courseDeleteHelp"><p id="courseDeleteHelp">${confirmPermanent ? `This permanently removes ${title}, enrollments, batches, chats, tasks, quiz attempts, progress, and linked reports from the LMS.` : `Choose how you want to remove ${title} from learners.`}</p><div class="confirm-choice-grid">${confirmPermanent ? "" : `<button class="soft-btn" type="button" id="draftCourseBtn">Move to Draft<small>Hide from students, keep content and data.</small></button>`}<button class="danger-btn" type="button" id="permanentCourseBtn">${confirmPermanent ? "Yes, Permanently Delete" : "Permanently Delete"}<small>${confirmPermanent ? "This cannot be restored from the portal." : "Requires one more confirmation."}</small></button></div><div class="form-actions"><button class="ghost-btn" type="button" data-close-modal>Cancel</button></div></div>`);
    document.getElementById("draftCourseBtn")?.addEventListener("click", () => moveCourseToDraft(course.id));
    document.getElementById("permanentCourseBtn")?.addEventListener("click", () => confirmPermanent ? permanentlyDeleteCourse(course.id) : openCourseDeleteModal(course, true));
  }
  async function moveCourseToDraft(courseId) {
    try { setRecordActionBusy("courses", courseId, true); const usedRpc = await callCourseLifecycleRpc("lms_admin_move_course_to_draft", courseId);
      if (!usedRpc) { const { error } = await getClient().from("courses").update({ status: "Draft", deleted_at: null }).eq("id", courseId); if (error) throw error; }
      closeModal(); applyRecordStatus("courses", courseId, { status: "Draft", deleted_at: null }); renderCourses(); await loadAllData({ force: true, silent: true }); showAlert("Course moved to draft.");
    } catch (error) { showAlert(error.message || "Unable to move course to draft.", true); } finally { setRecordActionBusy("courses", courseId, false); }
  }
  async function permanentlyDeleteCourse(courseId) {
    try { setRecordActionBusy("courses", courseId, true); const usedRpc = await callCourseLifecycleRpc("lms_admin_delete_course", courseId);
      if (!usedRpc) throw new Error("Course delete RPC is missing. Apply the latest Supabase migration before permanent deletion.");
      closeModal(); state.data.courses = state.data.courses.filter((course) => !sameId(course.id, courseId)); renderCourses(); await loadAllData({ force: true, silent: true }); showAlert("Course permanently deleted.");
    } catch (error) { showAlert(error.message || "Permanent course delete failed.", true); } finally { setRecordActionBusy("courses", courseId, false); }
  }
  async function callCourseLifecycleRpc(name, courseId) {
    if (!state.admin?.id || !getClient()?.rpc) return false; const { error } = await getClient().rpc(name, { actor_user_id: state.admin.id, target_course_id: courseId });
    if (!error) return true; if (isMissingRpcError(error)) return false; throw error;
  }

  async function deleteRecord(table, id) {
    const actionLabel = "Archive"; if (!id || !window.confirm(`${actionLabel} this item? You can restore it later.`)) return;
    try { setRecordActionBusy(table, id, true); const rpcArchived = await archiveRecordViaRpc(table, id);
      if (!rpcArchived) await archiveRecordDirect(table, id);
      applyRecordStatus(table, id, softDeletePayload(table)); renderActiveView(); await loadAllData({ force: true });
      showAlert(`${actionLabel}d successfully.`);
    } catch (error) {
      showAlert(error.message || `${actionLabel} failed.`, true);
    } finally {
      setRecordActionBusy(table, id, false);
    }
  }

  async function deleteChatMessage(id) {
    if (!id || !window.confirm("Delete this message?")) return;
    try {
      setRecordActionBusy("batch_chats", id, true);
      const { error } = await getClient().rpc("lms_admin_delete_batch_chat", { actor_user_id: state.admin.id, target_message_id: id });
      if (error) throw error;
      state.data.chats = state.data.chats.filter((chat) => !sameId(chat.id, id) && !sameId(chat.parent_id, id));
      await loadChats({ silent: true }); showAlert("Chat message deleted.");
    } catch (error) { showAlert(error.message || "Delete failed.", true); }
    finally { setRecordActionBusy("batch_chats", id, false); }
  }

  function softDeletePayload(table) {
    const now = new Date().toISOString();
    return { status: "archived", deleted_at: now };
  }

  async function archiveRecordDirect(table, id) {
    const supabaseClient = getClient();
    const payload = softDeletePayload(table);
    const candidates = [
      payload,
      stripKeys(payload, ["deleted_at"]),
      stripKeys(payload, ["status"])
    ];
    let lastError = null;
    for (const candidate of candidates) {
      const writePayload = compactObject(candidate);
      if (!Object.keys(writePayload).length) continue;
      const { error } = await supabaseClient.from(table).update(writePayload).eq("id", id);
      if (!error) return;
      lastError = error;
      if (!isSchemaShapeError(error)) throw error;
    }
    if (lastError && isSchemaShapeError(lastError)) {
      const { error } = await supabaseClient.from(table).delete().eq("id", id);
      if (!error) return;
      throw error;
    }
    throw lastError || new Error("Archive failed.");
  }

  async function restoreRecord(table, id, status) {
    if (!id || !window.confirm("Restore this item?")) return;
    try {
      setRecordActionBusy(table, id, true);
      const rpcRestored = await restoreRecordViaRpc(table, id, status);
      if (!rpcRestored) {
        const { error } = await getClient().from(table).update({ status, deleted_at: null }).eq("id", id);
        if (error) throw error;
      }
      applyRecordStatus(table, id, { status, deleted_at: null });
      renderActiveView();
      await loadAllData({ force: true });
      showAlert("Restored successfully.");
    } catch (error) {
      showAlert(error.message || "Restore failed.", true);
    } finally {
      setRecordActionBusy(table, id, false);
    }
  }

  function mergeSavedRecord(table, saved, id, fallbackPayload = {}) {
    const key = tableStateKey(table);
    if (!key || !saved) return;
    const record = { ...fallbackPayload, ...saved };
    const rows = state.data[key] || [];
    const index = rows.findIndex((row) => sameId(row.id, record.id || id));
    if (index >= 0) rows[index] = { ...rows[index], ...record };
    else state.data[key] = [record, ...rows];
  }

  function applyRecordStatus(table, id, payload) {
    const key = tableStateKey(table);
    if (!key) return;
    const rows = state.data[key] || [];
    const index = rows.findIndex((row) => sameId(row.id, id));
    if (index >= 0) rows[index] = { ...rows[index], ...payload };
  }

  function tableStateKey(table) {
    return {
      users: "users",
      courses: "courses",
      batches: "batches",
      user_courses: "userCourses",
      batch_tasks: "batchTasks",
      batch_chats: "chats",
      announcements: "announcements",
      shop_items: "shopItems"
    }[table] || "";
  }

  function setRecordActionBusy(table, id, busy) {
    const selectors = [
      `[data-delete-course="${cssEscape(id)}"]`,
      `[data-restore-course="${cssEscape(id)}"]`,
      `[data-delete-batch="${cssEscape(id)}"]`,
      `[data-restore-batch="${cssEscape(id)}"]`,
      `[data-delete-task="${cssEscape(id)}"]`,
      `[data-restore-task="${cssEscape(id)}"]`,
      `[data-delete-announcement="${cssEscape(id)}"]`,
      `[data-delete-shop="${cssEscape(id)}"]`,
      `[data-delete-chat="${cssEscape(id)}"]`
    ];
    document.querySelectorAll(selectors.join(",")).forEach((button) => {
      button.disabled = busy;
      button.setAttribute("aria-busy", String(busy));
    });
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
    const shouldAnimate = false;
    state.activeView = view;
    document.body.dataset.adminView = view;
    Object.entries(views).forEach(([key, element]) => {
      if (!element) return;
      element.classList.remove("admin-view-entering");
      element.classList.toggle("active", key === view);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    document.querySelectorAll("[data-context-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.contextView === view);
    });
    document.getElementById("sidebarProfileBtn")?.classList.toggle("active", view === "profile");
    viewTitle.textContent = views[view]?.dataset.title || "Dashboard";
    setText("adminTopbarTitle", views[view]?.dataset.title || "Dashboard");
    setText("adminContextTitle", view === "dashboard" ? "Admin Workspace" : views[view]?.dataset.title || "Admin Workspace");
    if (shouldAnimate) {
      const activeElement = views[view];
      const heading = document.querySelector(".page-heading");
      window.clearTimeout(state.viewTransitionTimer);
      document.body.classList.remove("admin-screen-switching");
      heading?.classList.remove("admin-title-entering");
      void document.body.offsetWidth;
      document.body.classList.add("admin-screen-switching");
      activeElement?.classList.add("admin-view-entering");
      heading?.classList.add("admin-title-entering");
      state.viewTransitionTimer = window.setTimeout(() => {
        document.body.classList.remove("admin-screen-switching");
        activeElement?.classList.remove("admin-view-entering");
        heading?.classList.remove("admin-title-entering");
      }, 620);
    }
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

  async function runLockedSubmit(form, submitter, action) {
    if (!form || form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    form.dataset.loading = "true";
    const buttons = Array.from(form.querySelectorAll("button"));
    const primary = submitter || buttons.find((button) => button.type === "submit");
    const originalText = primary?.textContent || "";
    buttons.forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    });
    if (primary) {
      primary.dataset.testid = primary.dataset.testid || "submit-loading";
      primary.textContent = "Saving...";
    }
    try {
      await action();
    } finally {
      if (document.body.contains(form)) {
        form.dataset.submitting = "false";
        form.dataset.loading = "false";
        buttons.forEach((button) => {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        });
        if (primary) primary.textContent = originalText;
      }
    }
  }

  function setLoading(isLoading) {
    loadingPanel.classList.toggle("show", isLoading);
  }

  function setSyncStatus(message) {
    if (!syncStatus) return;
    syncStatus.textContent = message;
    setText("profileSyncText", message);
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
    setText("assignedStudentsCount", checkedValues("assignedStudents").length);
    setText("assignedMentorsCount", checkedValues("assignedMentors").length);
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
    const amount = numericCoursePrice(price);
    if (!Number.isFinite(amount) || amount <= 0) return "Free";
    return `INR ${amount.toLocaleString("en-IN")}`;
  }

  function numericCoursePrice(price) { const amount = Number(String(price ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0; }
  function courseLifecycleStatus(course) { const status = String(course?.status || "").toLowerCase(); if (course?.deleted_at || ["deleted", "archived", "removed"].includes(status)) return "deleted"; if (["active", "published", "live"].includes(status)) return "active"; return "draft"; }

  function normalizeUser(user) {
    return {
      ...user,
      name: user?.name || user?.username || user?.email || "User",
      role: (user?.role || "student").toLowerCase()
    };
  }

  function userReferralCode(user = {}) {
    const stored = [user.referral_key, user.referralKey]
      .map((value) => String(value || "").trim())
      .find((value) => value && !/^jnv-?(?:0+|pending|account)$/i.test(value));
    if (stored) return stored.toUpperCase();
    return "";
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
    return matchesText(query, user.name, user.email, user.username, user.role, userReferralCode(user));
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
    validateUserCsvFile(file);
    const text = await file.text();
    const rows = parseCsv(text).filter((row) => row.some((cell) => String(cell || "").trim()));
    if (rows.length < 2) throw new Error("CSV needs a header row and at least one user.");
    if (rows.length - 1 > MAX_USER_CSV_ROWS) throw new Error(`CSV import is limited to ${MAX_USER_CSV_ROWS} users at a time.`);
    const headers = rows[0].map(normalizeCsvHeader);
    const requiredHeaders = ["name", "email", "course", "batch", "password"];
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
    if (missingHeaders.length) throw new Error(`CSV is missing required header${missingHeaders.length === 1 ? "" : "s"}: ${missingHeaders.join(", ")}.`);
    const users = rows.slice(1).map((cells, index) => {
      const row = { _row: index + 2 };
      headers.forEach((header, cellIndex) => {
        if (header) row[header] = String(cells[cellIndex] || "").trim();
      });
      return row;
    }).filter((row) => row.name || row.email || row.course || row.batch || row.password);
    const missingValue = users.find((row) => requiredHeaders.some((header) => !row[header]));
    if (missingValue) {
      const field = requiredHeaders.find((header) => !missingValue[header]);
      throw new Error(`Row ${missingValue._row} is missing ${field}.`);
    }
    const shortPassword = users.find((row) => String(row.password || "").length < MIN_ADMIN_PASSWORD_LENGTH);
    if (shortPassword) throw new Error(`Row ${shortPassword._row} password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`);
    return users;
  }

  function validateUserCsvFile(file) {
    if (file.size > MAX_USER_CSV_BYTES) throw new Error("CSV file must be 1 MB or smaller.");
    const extension = String(file.name || "").split(".").pop().toLowerCase();
    const type = String(file.type || "").toLowerCase();
    if (extension !== "csv" && type !== "text/csv" && type !== "application/vnd.ms-excel") {
      throw new Error("Upload a valid .csv file.");
    }
  }

  function userCsvPreview(rows) {
    if (!rows.length) return "No user rows found.";
    const previewRows = rows.slice(0, 5).map((row) => `
      <tr>
        <td>${escapeHtml(row.name || "Unnamed")}</td>
        <td>${escapeHtml(row.email || "Missing email")}</td>
        <td>${escapeHtml(row.course || "Missing course")}</td>
        <td>${escapeHtml(row.batch || "Missing batch")}</td>
      </tr>
    `).join("");
    return `
      <div class="csv-preview-meta">${rows.length} row${rows.length === 1 ? "" : "s"} ready. Previewing first ${Math.min(rows.length, 5)}.</div>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Course</th><th>Batch</th></tr></thead>
        <tbody>${previewRows}</tbody>
      </table>
    `;
  }

  async function importUsersFromCsv(rows) {
    let created = 0;
    let failed = 0;
    const errors = [];
    for (const row of rows) {
      try {
        const courseId = resolveCourseId(row.course);
        const batchId = resolveBatchId(row.batch);
        if (!courseId) throw new Error(`Course not found: ${row.course}`);
        if (!batchId) throw new Error(`Batch not found: ${row.batch}`);
        await saveAdminUser({
          name: row.name,
          email: row.email,
          password: row.password,
          role: "student",
          phone: null,
          username: null,
          coins: 0
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

  function exportFilteredUsersCsv() {
    const query = document.getElementById("userSearch")?.value.trim().toLowerCase() || "";
    const rows = state.data.users
      .filter((user) => state.userRole === "all" || user.role === state.userRole)
      .filter((user) => matchesText(query, user.name, user.email, user.username, user.role, user.phone))
      .map((user) => ({
        id: user.id || "",
        name: user.name || "",
        email: user.email || "",
        role: user.role || "",
        phone: user.phone || "",
        username: user.username || "",
        batch_id: user.batch_id || "",
        course_ids: parseIdList(user.course_ids).join("|"),
        referral: userReferralCode(user),
        coins: user.coins || 0,
        status: user.status || "active",
        created_at: user.created_at || ""
      }));
    downloadCsv(`jenovate-users-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    showAlert(`Exported ${rows.length} user${rows.length === 1 ? "" : "s"}.`);
  }

  function downloadCsv(filename, rows) {
    const columns = rows[0] ? Object.keys(rows[0]) : ["id", "name", "email", "role", "status"];
    const csv = [
      columns.join(","),
      ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
    ].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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

  function truncate(value, maxLength = 80) {
    const text = String(value || "");
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
  }

  function compactObject(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  function stripKeys(payload, keys) {
    const next = { ...payload };
    keys.forEach((key) => delete next[key]);
    return next;
  }

  function isMissingRpcError(error) {
    return /function|schema cache|not found|could not find|permission denied/i.test(error?.message || "")
      || ["PGRST202", "42501"].includes(String(error?.code || ""));
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

  function batchStudents(batch) {
    if (!batch?.id) return [];
    const ids = new Set();
    state.data.userCourses.forEach((enrollment) => {
      if (enrollment.deleted_at || ["archived", "removed", "cancelled"].includes(String(enrollment.status || "active").toLowerCase())) return;
      if (sameId(enrollment.batch_id, batch.id)) ids.add(String(enrollment.user_id || enrollment.student_id || enrollment.learner_id || ""));
    });
    return state.data.users.filter((user) => {
      if (String(user.role || "").toLowerCase() !== "student") return false;
      return sameId(user.batch_id, batch.id) || ids.has(String(user.id));
    });
  }

  function studentBatchEnrollment(student, batch) {
    return state.data.userCourses.find((enrollment) => (
      sameId(enrollment.batch_id, batch?.id)
      && sameId(enrollment.user_id || enrollment.student_id || enrollment.learner_id, student?.id)
      && !enrollment.deleted_at
      && !["archived", "removed", "cancelled"].includes(String(enrollment.status || "active").toLowerCase())
    ));
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
    return document.getElementById(id)?.value?.trim() || "";
  }

  function numberOrNull(id) {
    const value = valueOf(id);
    return value === "" ? null : Number(value);
  }

  function option(value, selectedValue, label = value) {
    return `<option value="${escapeAttr(value)}" ${String(value) === String(selectedValue || "") ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
