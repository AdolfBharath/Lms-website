(function () {
  const SESSION_KEY = "jenovateStudentSession";
  const APP_SESSION_KEY = "jenovateCurrentUser";
  const ADMIN_SESSION_KEY = "jenovateAdminSession";
  const MENTOR_SESSION_KEY = "jenovateMentorSession";
  const getClient = () => window.getLmsPlatformClient?.();
  const contentService = window.JenovateContentService || {};
  const utils = window.JenovatePortalUtils;
  const {
    clamp,
    createUploadMeter,
    emptyState,
    escapeAttr,
    escapeHtml,
    formatDate,
    formatDateTime,
    formatFileSize,
    formatNumber,
    formatTableName,
    initialsFor,
    isSchemaShapeError,
    numberFrom,
    on,
    parseIdList,
    parseJsonDeep,
    randomId,
    relativeActivityTime,
    runLockedSubmit,
    setProgress,
    setText,
    setValue,
    stripNullish,
    truncate,
    uniqueArray,
    userFriendlyError
  } = utils;
  const tryJson = (value) => utils.parseJson(value, null);
  const sameId = (a, b) => utils.sameId(a, b, { strictPresent: true });
  const DEBUG_STUDENT_PORTAL = Boolean(window.JENOVATE_DEBUG);
  const LMS_MESSAGES = {
    load: "Unable to load lesson. Please try again later.",
    material: "Unable to load study material. Please try again later.",
    video: "Video is temporarily unavailable.",
    save: "Unable to save progress right now.",
    generic: "Something went wrong. Please try again later."
  };
  const studentDebug = (message, detail) => {
    if (!DEBUG_STUDENT_PORTAL || !window.console) return;
    if (detail === undefined) console.warn(message);
    else console.warn(message, detail);
  };
  const safeStudentMessage = (message = LMS_MESSAGES.generic) => message;
  const isConstraintError = (error) => /foreign key constraint|violates foreign key constraint|23503/i.test(String(error?.message || error?.details || error?.code || ""));
  const PAGE_SIZE = 20;
  const CHAT_PAGE_SIZE = 30;
  const QUERY_CACHE_TTL = 45_000;
  const QUERY_CACHE_PREFIX = "jenovate:lms:student:v3:";
  const SELECTS = {
    users: "id,name,full_name,display_name,email,role,username,phone,batch_id,course_ids,coins,coin_balance,streak_count,last_active_date,last_login_reward_date,reward_history,status,deleted_at,created_at,referral,referral_key",
    courses: "id,title,description,category,duration,module_type,instructor_name,thumbnail_url,rating,price,difficulty,modules,is_featured,is_my_course,status,created_by_admin,quiz_coin_reward,quiz_pass_score,mentor_id,created_at,google_form_url",
    batches: "id,name,course_id,mentor_id,capacity,enroll_limit,smart_waitlist,status,start_date,end_date,progress,enrolled_count,created_at",
    userCourses: "id,user_id,student_id,learner_id,course_id,batch_id,created_at,status,deleted_at",
    progress: "student_id,course_id,completed_lessons,completed_modules,rewarded_modules,quiz_completed,quiz_score,updated_at,quiz_attempts,quiz_failed_attempts,quiz_locked,quiz_rewatch_required,quiz_last_score,quiz_last_total,quiz_best_score,module_quiz_state",
    shopItems: "id,name,price,image_url,stock,status,deleted_at,created_at",
    purchases: "id,user_id,item_id,purchased_at",
    projects: "id,title,description,status,student_id,user_id,batch_id,course_id,type,drive_link,file_url,file_urls,review_notes,feedback,reviewed_at,created_at,updated_at",
    batchTasks: "id,batch_id,course_id,title,description,file_url,drive_link,deadline,status,total_marks,max_marks,published_at,deleted_at,created_by,created_at",
    taskSubmissions: "id,task_id,student_id,user_id,batch_id,course_id,status,drive_link,file_url,file_type,score,marks_obtained,total_marks,max_marks,is_on_time,graded_at,submitted_at,created_at,deleted_at,feedback",
    quizAttempts: "id,student_id,course_id,score,total,pass_score,passed,attempt_number,module_id,module_order,module_title,quiz_id,max_score,answers,time_taken_seconds,duration_seconds,question_count,selected_question_ids,created_at,submitted_at,deleted_at",
    academicActivity: "id,student_id,batch_id,course_id,activity_type,points,max_points,occurred_at,metadata,created_at",
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
      fallbackSelect: "id,name,full_name,display_name,email,role,username,phone,batch_id,course_ids,coins,coin_balance,streak_count,last_active_date,created_at,referral,referral_key",
      limit: 500,
      scope: "studentUsers"
    },
    { key: "courses", table: "courses", select: SELECTS.courses, limit: 200, scope: "courseCatalog" },
    { key: "catalogCourses", table: "courses", select: SELECTS.courses, limit: 200, scope: "courseCatalog" },
    { key: "batches", table: "batches", select: SELECTS.batches, limit: PAGE_SIZE, scope: "studentBatches" },
    { key: "userCourses", table: "user_courses", select: SELECTS.userCourses, fallbackSelect: "user_id,course_id,created_at,status", limit: 200, scope: "studentUserCourses" },
    { key: "progress", table: "student_course_progress", select: SELECTS.progress, limit: 200, scope: "studentOnlyRows" },
    { key: "shopItems", table: "shop_items", select: SELECTS.shopItems, fallbackSelect: "id,name,price,image_url,created_at", limit: PAGE_SIZE },
    { key: "purchases", table: "shop_purchases", select: SELECTS.purchases, optional: true, limit: 30, scope: "studentPurchaseRows" },
    { key: "studentShopPurchases", table: "student_shop_purchases", select: SELECTS.purchases, optional: true, limit: 30, scope: "studentPurchaseRows" },
    { key: "projects", table: "projects", select: SELECTS.projects, fallbackSelect: "id,title,description,status,student_id,user_id,batch_id,course_id,type,file_urls,review_notes,feedback,created_at", limit: 100, scope: "studentProjectRows", order: "created_at.desc" },
    { key: "batchTasks", table: "batch_tasks", select: SELECTS.batchTasks, fallbackSelect: "id,batch_id,title,description,file_url,drive_link,deadline,created_by,created_at", limit: PAGE_SIZE, scope: "studentBatchRows" },
    { key: "taskSubmissions", table: "task_submissions", select: SELECTS.taskSubmissions, fallbackSelect: "id,task_id,student_id,status,drive_link,file_url,file_type,submitted_at,feedback", limit: 200, scope: "studentOnlyRows", order: "submitted_at.desc" },
    { key: "quizAttempts", table: "student_quiz_attempts", select: SELECTS.quizAttempts, fallbackSelect: "id,student_id,course_id,score,total,pass_score,passed,attempt_number,module_id,module_order,module_title,quiz_id,max_score,answers,created_at,submitted_at", optional: true, limit: 200, scope: "studentOnlyRows", order: "submitted_at.desc" },
    { key: "academicActivity", table: "student_academic_activity", select: SELECTS.academicActivity, optional: true, limit: 300, scope: "studentOnlyRows", order: "occurred_at.desc" },
    { key: "chats", table: "batch_chats", select: SELECTS.chats, limit: CHAT_PAGE_SIZE, scope: "studentBatchRows", order: "created_at.desc" },
    { key: "announcements", table: "announcements", select: SELECTS.announcements, limit: 30, order: "published_at.desc" },
    { key: "supportTickets", table: "support_tickets", select: SELECTS.supportTickets, optional: true, limit: 30, scope: "supportOwnerRows", order: "updated_at.desc" },
    { key: "supportMessages", table: "support_messages", select: SELECTS.supportMessages, optional: true, limit: 120, order: "created_at.desc" },
    { key: "supportNotifications", table: "support_notifications", select: SELECTS.supportNotifications, optional: true, limit: 30, scope: "supportNotificationRows", order: "created_at.desc" }
  ];

  const DASHBOARD_INITIAL_TABLE_KEYS = new Set([
    "users",
    "courses",
    "batches",
    "userCourses",
    "progress",
    "batchTasks",
    "taskSubmissions",
    "quizAttempts",
    "academicActivity",
    "announcements"
  ]);

  const state = {
    student: null,
    activeView: "dashboard",
    courseFilter: "active",
    courseSearch: "",
    courseSort: "recent",
    courseCategory: "all",
    courseLayout: "grid",
    courseVisibleCount: 8,
    catalogCategory: "all",
    catalogFilter: "all",
    catalogFiltersOpen: false,
    taskFilter: "pending",
    query: "",
    selectedCourseId: "",
    selectedLessonKey: "",
    lessonTab: "overview",
    selectedBatchId: "",
    selectedTaskId: "",
    questionsFilter: "all",
    discQuery: "",
    selectedQuestionId: null,
    leaderboardCourseId: "",
    leaderboardSort: "rank",
    leaderboardSearch: "",
    academicPeriod: "all",
    replyToChatId: null,
    lessonTrackerCleanup: null,
    courseAccessTimes: null,
    videoProgressLastSaved: {},
    videoProgressSaveInFlight: {},
    resourceHandles: new Map(),
    realtimeChannel: null,
    refreshTimer: null,
    searchTimer: null,
    tableErrors: {},
    data: {
      users: [],
      courses: [],
      catalogCourses: [],
      batches: [],
      userCourses: [],
      progress: [],
      shopItems: [],
      purchases: [],
      studentShopPurchases: [],
      projects: [],
      batchTasks: [],
      taskSubmissions: [],
      quizAttempts: [],
      academicActivity: [],
      chats: [],
      announcements: [],
      supportTickets: [],
      supportMessages: [],
      supportNotifications: [],
      leaderboard: []
    },
    queryCache: new Map(),
    inFlightRequests: new Map()
  };

  const tableClient = window.JenovatePortalData.createTableClient({
    applyScopedFilters,
    cachePrefix: QUERY_CACHE_PREFIX,
    cacheTtl: QUERY_CACHE_TTL,
    defaultOrderTables: ["batch_chats", "announcements", "batch_tasks"],
    getCacheScope: () => [
      state.student?.id || "",
      state.student?.batch_id || "",
      parseIdList(state.student?.course_ids).join("|")
    ].join(":"),
    getClient,
    onFetchError: (spec, error) => {
      if (!spec.optional) studentDebug("Learning data request failed.", error);
    },
    pageSize: PAGE_SIZE,
    runSpecialQuery: runStudentSpecialQuery,
    state
  });

  const views = {
    dashboard: document.getElementById("dashboardView"),
    catalog: document.getElementById("catalogView"),
    courses: document.getElementById("coursesView"),
    learn: document.getElementById("learnView"),
    tasks: document.getElementById("tasksView"),
    batch: document.getElementById("batchView"),
    announcements: document.getElementById("announcementsView"),
    questions: document.getElementById("questionsView"),
    support: document.getElementById("supportView"),
    shop: document.getElementById("shopView"),
    referral: document.getElementById("referralView"),
    profile: document.getElementById("profileView")
  };

  const viewTitle = document.getElementById("viewTitle");
  const viewKicker = document.getElementById("viewKicker");
  const alertBox = document.getElementById("studentAlert");
  const loadingPanel = document.getElementById("loadingPanel");
  const syncStatus = document.getElementById("syncStatus");
  const modal = document.getElementById("studentModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  async function init() {
    wireNavigation();
    wireActions();
    initializeHistoryNavigation();
    document.body.dataset.studentView = state.activeView;

    if (!getClient()) {
      showAlert("Learning data could not load. Check your internet connection and refresh the page.", true);
      return;
    }

    const cachedStudent = window.JenovateAuth?.readStoredSession?.("student");
    const student = cachedStudent ? normalizeUser(cachedStudent) : await resolveStudentSession();
    if (!student) {
      if (redirectToActiveSession("student")) return;
      clearStoredSessions();
      window.location.replace("login.html?next=student");
      return;
    }

    state.student = student;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(student));
    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(student));
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(MENTOR_SESSION_KEY);
    window.addEventListener("pageshow", enforceLiveSession);
    // on in-tab navigation. Session is cleared only on explicit logout.

    recordLocalStreakVisit();
    setupDailyStreakRefresh();
    renderIdentity();
    notifyDailyLoginReward();
    renderAll();
    void finishStudentBootstrap({ hasCachedStudent: Boolean(cachedStudent) });
  }

  async function finishStudentBootstrap(options = {}) {
    if (!options.hasCachedStudent) {
      const liveStudent = await resolveStudentSession();
      if (!liveStudent) {
        clearStoredSessions();
        window.location.replace("login.html?next=student");
        return;
      }
      state.student = liveStudent;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(liveStudent));
      sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(liveStudent));
      renderIdentity();
    } else {
      const liveStudent = await resolveStudentSession();
      if (liveStudent) {
        state.student = liveStudent;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(liveStudent));
        sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(liveStudent));
        renderIdentity();
      }
    }

    void syncDailyStreak({ render: true, notify: true });
    await loadAllData({ initial: true, force: true });
    setupRealtime();
    window.setTimeout(() => void loadAllData({ silent: true }), 0);
  }

  function withStudentTimeout(value, timeoutMs, message) {
    if (window.JenovateAuth?.withTimeout) {
      return window.JenovateAuth.withTimeout(value, timeoutMs, message);
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([Promise.resolve(value), timeout]).finally(() => window.clearTimeout(timer));
  }

  async function syncDailyStreak(options = {}) {
    recordLocalStreakVisit();
    const client = getClient();
    if (!client?.rpc || !state.student?.id) return false;

    let response;
    try {
      response = await withStudentTimeout(
        client.rpc("lms_claim_daily_login_reward", { target_user_id: state.student.id }),
        4_000,
        "Daily streak sync timed out."
      );
    } catch (error) {
      studentDebug("Daily streak sync skipped.", error);
      return false;
    }
    const { data, error } = response;
    if (error) {
      studentDebug("Daily streak sync failed.", error);
      return false;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return false;

    state.student = normalizeUser({
      ...state.student,
      coins: Number(result.coins ?? state.student.coins ?? 0),
      coin_balance: Number(result.coin_balance ?? result.coins ?? state.student.coin_balance ?? state.student.coins ?? 0),
      streak_count: Number(result.streak_count ?? state.student.streak_count ?? 0),
      last_active_date: result.last_active_date || state.student.last_active_date || "",
      last_login_reward_date: result.last_login_reward_date || state.student.last_login_reward_date || ""
    });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));

    if (result.claimed && options.notify === true) {
      const totalReward = Number(result.totalReward ?? result.total_coins_awarded ?? result.reward_amount ?? 10);
      const streakBonus = Number(result.streakBonus ?? result.streak_bonus ?? 0);
      showAlert(streakBonus > 0 ? `Daily reward claimed! +${totalReward} Coins including +${streakBonus} streak bonus` : `Daily reward claimed! +${totalReward} Coins`);
    }
    if (options.render === true) {
      await refreshStudentProfileAfterReward(result);
      renderIdentity();
      renderStreakCard();
    }
    return true;
  }

  async function refreshStudentProfileAfterReward(result = {}) { const client = getClient(); if (client?.from && state.student?.id) try { const { data, error } = await withStudentTimeout(client.from("users").select("coins,coin_balance,streak_count,last_active_date,last_login_reward_date").eq("id", state.student.id).maybeSingle(), 2500, "Daily reward profile refresh timed out."); if (!error && data) state.student = normalizeUser({ ...state.student, ...data }); } catch (error) { studentDebug("Daily reward profile refresh skipped.", error); } state.student.daily_login_reward_claimed = Boolean(result.claimed); state.student.daily_login_reward_amount = Number(result.totalReward ?? result.total_coins_awarded ?? result.reward_amount ?? 0); state.student.daily_login_streak_bonus = Number(result.streakBonus ?? result.streak_bonus ?? 0); sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student)); sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student)); }

  function setupDailyStreakRefresh() {
    const scheduleMidnightRefresh = () => {
      window.clearTimeout(state.streakRolloverTimer);
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      state.streakRolloverTimer = window.setTimeout(async () => {
        await syncDailyStreak({ render: true, notify: true });
        scheduleMidnightRefresh();
      }, Math.max(1_000, nextDay.getTime() - now.getTime() + 1_000));
    };

    scheduleMidnightRefresh();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !isActiveToday()) {
        void syncDailyStreak({ render: true, notify: true });
      }
    });
  }

  async function refreshStudentWallet() {
    if (!getClient()?.rpc || !state.student?.id) return;
    const { data, error } = await getClient().rpc("lms_student_wallet_summary"); if (error) { if (!isMissingRpcError(error)) studentDebug("Wallet summary failed.", error); return; }
    const row = Array.isArray(data) ? data[0] : data; if (!row) return;
    state.student = normalizeUser({ ...state.student, coins: Number(row.coins ?? state.student.coins ?? 0), referral_key: row.referral_key || state.student.referral_key || row.referral_code, referral_count: Number(row.referral_count || 0), successful_referrals: Number(row.successful_referrals || 0), referral_coins_earned: Number(row.referral_coins_earned || 0) });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student)); sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student)); window.renderStudentReferral?.(state.student);
  }

  function wireNavigation() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        setView(button.dataset.view);
        closeMobileMenu();
      });
    });

    document.querySelectorAll("[data-panel-view]").forEach((button) => {
      button.addEventListener("click", () => {
        setView(button.dataset.panelView);
        closeMobileMenu();
      });
    });

    on("studentSidePanelClose", "click", closeLearningPanel);

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-modal]")) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        closeMobileMenu();
        closeLearningPanel();
      }
    });
  }

  function wireActions() {
    on("refreshBtn", "click", () => loadAllData({ force: true }));
    on("reloadTasksBtn", "click", () => loadAllData({ force: true }));
    on("reloadChatBtn", "click", () => refreshChatRows({ force: true }));
    on("reloadAnnouncementsBtn", "click", () => loadAllData({ force: true }));
    on("refreshSupportBtn", "click", () => loadAllData({ force: true }));
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("#logoutBtn")) {
        event.preventDefault();
        logout();
      }
      const jump = target instanceof Element ? target.closest("[data-jump]") : null;
      if (jump) {
        event.preventDefault();
        setView(jump.dataset.jump);
        closeMobileMenu();
      }
    });
    on("studentMenuBtn", "click", openMobileMenu);
    on("studentSidebarScrim", "click", closeMobileMenu);
    on("topSearchInput", "input", handleTopSearch);
    on("courseLibrarySearch", "input", (event) => {
      state.courseSearch = String(event.target.value || "").trim().toLowerCase();
      state.courseVisibleCount = 8;
      renderCourses();
    });
    on("courseSortSelect", "change", (event) => {
      state.courseSort = event.target.value || "recent";
      state.courseVisibleCount = 8;
      renderCourses();
    });
    on("courseCategoryToggle", "click", () => {
      const menu = document.getElementById("courseCategoryMenu");
      const toggle = document.getElementById("courseCategoryToggle");
      if (!menu || !toggle) return;
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
    });
    document.getElementById("courseCategoryMenu")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-course-category]");
      if (!button) return;
      state.courseCategory = button.dataset.courseCategory || "all";
      state.courseVisibleCount = 8;
      document.getElementById("courseCategoryMenu").hidden = true;
      document.getElementById("courseCategoryToggle")?.setAttribute("aria-expanded", "false");
      renderCourses();
    });
    document.querySelector(".course-view-toggle")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-course-layout]");
      if (!button) return;
      state.courseLayout = button.dataset.courseLayout || "grid";
      document.querySelectorAll("[data-course-layout]").forEach((item) => item.classList.toggle("active", item === button));
      renderCourses();
    });
    on("courseLoadMore", "click", () => {
      state.courseVisibleCount += 8;
      renderCourses();
    });
    on("courseSliderPrev", "click", () => scrollCourseSlider(-1));
    on("courseSliderNext", "click", () => scrollCourseSlider(1));
    on("leaderboardCourseFilter", "change", (event) => {
      state.leaderboardCourseId = event.target.value;
      renderDashboardLeaderboard();
    });
    on("leaderboardSort", "change", (event) => {
      state.leaderboardSort = event.target.value;
      renderDashboardLeaderboard();
    });
    on("academicPeriodFilter", "change", (event) => {
      state.academicPeriod = event.target.value || "all";
      renderDashboardAssignmentStats(scopedTasks());
    });
    on("leaderboardSearch", "input", (event) => {
      state.leaderboardSearch = event.target.value.trim().toLowerCase();
      renderDashboardLeaderboard();
    });
    document.getElementById("dashboardAssignmentStats")?.addEventListener("click", (event) => {
      const jump = event.target.closest("[data-jump]");
      if (!jump) return;
      setView(jump.dataset.jump);
    });
    on("taskBatchFilter", "change", (event) => {
      state.selectedBatchId = event.target.value;
      renderTasks();
    });
    on("chatBatchSelect", "change", (event) => {
      state.selectedBatchId = event.target.value;
      state.replyToChatId = null;
      renderBatch();
      renderAnnouncements();
    });
    on("chatComposer", "submit", postChatMessage);
    on("questionForm", "submit", submitQuestion);

    on("discAskBtn", "click", () => {
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "false");
    });
    on("discAskBtnAlt", "click", () => {
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "false");
    });
    on("discMain", "click", (event) => {
      const button = event.target.closest("[data-disc-follow-up]");
      if (!button) return;
      openQuestionComposer({ followUpId: button.dataset.discFollowUp });
    });
    on("discAskClose", "click", () => {
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "true");
    });

    const askOverlay = document.getElementById("discAskOverlay");
    askOverlay?.addEventListener("click", (event) => {
      if (event.target === askOverlay) {
        askOverlay.setAttribute("aria-hidden", "true");
      }
    });

    const filterTabs = document.querySelector(".disc-filter-tabs");
    filterTabs?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-disc-filter]");
      if (!button) return;
      state.questionsFilter = button.dataset.discFilter || "all";
      renderQuestions();
    });

    const questionListEl = document.getElementById("questionList");
    questionListEl?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-question-id]");
      if (!card) return;
      if (event.target.closest("button, a, input, select")) return;
      state.selectedQuestionId = card.dataset.questionId;
      renderQuestions();
    });

    on("discSearchInput", "input", (event) => {
      state.discQuery = event.target.value.trim().toLowerCase();
      renderQuestions();
    });

    on("supportTicketForm", "submit", submitSupportTicket);
    on("profileForm", "submit", saveProfile);
    on("passwordForm", "submit", updatePassword);
    on("profileReferKeyCopyBtn", "click", copyProfileReferKey);

    on("profileEditToggleBtn", "click", () => {
      const inputs = ["profileName", "profileUsername", "profilePhone"].map(id => document.getElementById(id));
      const isDisabled = inputs[0] ? inputs[0].disabled : true;
      inputs.forEach(input => { if (input) input.disabled = !isDisabled; });
      const actions = document.getElementById("profileFormActions");
      if (actions) actions.style.display = isDisabled ? "flex" : "none";
      const btnText = document.getElementById("profileEditToggleBtn");
      if (btnText) btnText.innerHTML = isDisabled ? "Cancel" : `<span class="edit-icon">Edit</span> Edit Details`;
    });

    on("profileCancelBtn", "click", () => {
      const inputs = ["profileName", "profileUsername", "profilePhone"].map(id => document.getElementById(id));
      inputs.forEach(input => { if (input) input.disabled = true; });
      const actions = document.getElementById("profileFormActions");
      if (actions) actions.style.display = "none";
      const btnText = document.getElementById("profileEditToggleBtn");
      if (btnText) btnText.innerHTML = `<span class="edit-icon">Edit</span> Edit Details`;
      renderIdentity();
    });

    on("passwordToggleBtn", "click", () => {
      const form = document.getElementById("passwordForm");
      if (form) {
        const isHidden = form.style.display === "none";
        form.style.display = isHidden ? "block" : "none";
      }
    });

    on("passwordCancelBtn", "click", () => {
      const form = document.getElementById("passwordForm");
      if (form) form.style.display = "none";
    });

    document.getElementById("courseFilterTabs")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-course-filter]");
      if (!button) return;
      state.courseFilter = button.dataset.courseFilter;
      state.courseVisibleCount = 8;
      document.querySelectorAll("[data-course-filter]").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderCourses();
    });

    document.getElementById("catalogCoursesGrid")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-catalog-category]");
      if (button) {
        state.catalogCategory = button.dataset.catalogCategory || "all";
        return renderCatalog();
      }
      const filterButton = event.target.closest("[data-catalog-filter]");
      if (filterButton) {
        state.catalogFilter = filterButton.dataset.catalogFilter || "all";
        state.catalogFiltersOpen = false;
        return renderCatalog();
      }
      const filterToggle = event.target.closest("[data-catalog-filter-toggle]");
      if (filterToggle) {
        state.catalogFiltersOpen = !state.catalogFiltersOpen;
        return renderCatalog();
      }
      const resetButton = event.target.closest("[data-catalog-reset]");
      if (resetButton) {
        state.catalogCategory = state.catalogFilter = "all"; state.catalogFiltersOpen = false; state.query = "";
        const topSearch = document.getElementById("topSearchInput");
        if (topSearch) topSearch.value = "";
        renderCatalog();
      }
    });
    document.getElementById("catalogCoursesGrid")?.addEventListener("input", (event) => {
      if (!event.target.matches("#catalogSearchInput")) return;
      state.query = String(event.target.value || "").trim().toLowerCase();
      const topSearch = document.getElementById("topSearchInput");
      if (topSearch && topSearch.value !== event.target.value) topSearch.value = event.target.value;
      clearTimeout(state.searchTimer); state.searchTimer = setTimeout(renderCatalog, 120);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".course-category-control")) {
        const categoryMenu = document.getElementById("courseCategoryMenu");
        if (categoryMenu && !categoryMenu.hidden) {
          categoryMenu.hidden = true;
          document.getElementById("courseCategoryToggle")?.setAttribute("aria-expanded", "false");
        }
      }

      const reviewCourse = event.target.closest("[data-review-course]");
      if (reviewCourse) {
        openCourseReview(reviewCourse.dataset.reviewCourse);
        return;
      }

      const openCourse = event.target.closest("[data-open-course],[data-start-assigned-course]");
      if (openCourse) {
        state.selectedCourseId = openCourse.dataset.openCourse || openCourse.dataset.startAssignedCourse;
        state.selectedLessonKey = "";
        recordCourseAccess(state.selectedCourseId);
        setView("learn");
        return;
      }

      const detailCourse = event.target.closest("[data-course-detail]");
      if (detailCourse) {
        openCourseDetailModal(detailCourse.dataset.courseDetail);
        return;
      }

      const catalogCard = event.target.closest("[data-catalog-course-card]");
      if (catalogCard && !event.target.closest("button,a,input,select,textarea,label")) {
        openCourseDetailModal(catalogCard.dataset.catalogCourseCard);
        return;
      }

      const courseCard = event.target.closest("[data-course-card-open]");
      if (courseCard && !event.target.closest("button,a,input,select,textarea,label")) {
        state.selectedCourseId = courseCard.dataset.courseCardOpen;
        state.selectedLessonKey = "";
        recordCourseAccess(state.selectedCourseId);
        setView("learn");
        return;
      }

      const selectLesson = event.target.closest("[data-select-lesson]");
      if (selectLesson) {
        state.selectedLessonKey = selectLesson.dataset.selectLesson;
        state.lessonTab = "overview";
        renderLearn();
        return;
      }

      const lessonTab = event.target.closest("[data-lesson-tab]");
      if (lessonTab) {
        state.lessonTab = lessonTab.dataset.lessonTab || "overview";
        updateLessonTabPanels();
        return;
      }

      const lessonSeek = event.target.closest("[data-lesson-seek]");
      if (lessonSeek) {
        seekActiveLessonVideo(Number(lessonSeek.dataset.lessonSeek || 0));
        return;
      }

      const lessonTogglePlay = event.target.closest("[data-lesson-toggle-play]");
      if (lessonTogglePlay) {
        toggleActiveLessonVideo();
        return;
      }

      const lessonToggleMute = event.target.closest("[data-lesson-toggle-mute]");
      if (lessonToggleMute) {
        toggleActiveLessonMute();
        return;
      }

      const lessonSpeed = event.target.closest("[data-lesson-speed]");
      if (lessonSpeed) {
        setActiveLessonSpeed(Number(lessonSpeed.dataset.lessonSpeed || 1));
        return;
      }

      const lessonFullscreen = event.target.closest("[data-lesson-fullscreen]");
      if (lessonFullscreen) {
        openLessonFullscreen();
        return;
      }

      const openResource = event.target.closest("[data-open-resource]");
      if (openResource) {
        void openResourcePreview(openResource.dataset.openResource, openResource.dataset.resourceTitle || "Resource", openResource.dataset.resourceKind || "");
        return;
      }

      const buyItem = event.target.closest("[data-buy-item]");
      if (buyItem) {
        purchaseItem(buyItem.dataset.buyItem);
        return;
      }

      const taskButton = event.target.closest("[data-open-task]");
      if (taskButton) {
        openTaskModal(taskButton.dataset.openTask);
        return;
      }

      const taskFilter = event.target.closest("[data-task-filter]");
      if (taskFilter) {
        state.taskFilter = taskFilter.dataset.taskFilter || "pending";
        state.selectedTaskId = "";
        renderTasks();
        return;
      }

      const taskCard = event.target.closest("[data-select-task]");
      if (taskCard) {
        state.selectedTaskId = taskCard.dataset.selectTask;
        renderTasks();
        return;
      }

      const quizButton = event.target.closest("[data-start-quiz]");
      if (quizButton) {
        openStudentQuiz(quizButton.dataset.courseId, Number(quizButton.dataset.moduleIndex || 0));
        return;
      }

      const replyButton = event.target.closest("[data-reply-chat]");
      if (replyButton) {
        prepareChatReply(replyButton.dataset.replyChat);
        return;
      }

      const focusChatButton = event.target.closest("[data-focus-chat]");
      if (focusChatButton) {
        document.getElementById("chatMessage")?.focus();
        return;
      }

      const cancelReplyButton = event.target.closest("[data-cancel-chat-reply]");
      if (cancelReplyButton) {
        state.replyToChatId = null;
        renderChatReplyBar();
        const chatInput = document.getElementById("chatMessage");
        if (chatInput) chatInput.placeholder = "Write a message to your batch...";
      }
    });
  }

  async function resolveStudentSession() {
    try {
      const profile = await window.JenovateAuth?.requireRole?.("student");
      if (profile) return normalizeUser(profile);
    } catch (error) {
      studentDebug("Session check failed.", error);
    }
    return null;
  }

  async function enforceLiveSession() {
    const liveStudent = await resolveStudentSession();
    if (liveStudent) {
      state.student = liveStudent;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(liveStudent));
      sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(liveStudent));
      return;
    }
    if (window.JenovateAuth?.readStoredSession?.("student")) {
      return;
    }
    {
      if (redirectToActiveSession("student")) return;
      window.location.replace("login.html?next=student");
    }
  }

  function redirectToActiveSession(expectedRole) {
    const profile = window.JenovateSessionRouter?.activeSession?.();
    const target = window.JenovateSessionRouter?.routeFor?.(profile);
    if (!profile?.role || profile.role === expectedRole || !target) return false;
    window.location.replace(`unauthorized.html?expected=${encodeURIComponent(expectedRole)}&role=${encodeURIComponent(profile.role)}`);
    return true;
  }

  async function loadAllData(options = {}) {
    const silent = options.silent === true;
    if (options.force === true) clearQueryCache();
    setLoading(!silent);
    setSyncStatus("");

    try {
      const requestedSpecs = options.initial
        ? TABLE_SPECS.filter((spec) => DASHBOARD_INITIAL_TABLE_KEYS.has(spec.key))
        : TABLE_SPECS;
      const results = await Promise.all(requestedSpecs.map((spec) => fetchTableSafe(spec, { force: options.force === true })));
      const rows = Object.fromEntries(results.map((result) => [result.key, result.rows]));
      if (options.initial === true) {
        window.setTimeout(() => {
          void window.resolveLmsAssetsDeep?.(rows).then(renderActiveView).catch((error) => {
            studentDebug("Deferred asset preparation failed.", error);
          });
        }, 0);
      } else {
        await window.resolveLmsAssetsDeep?.(rows);
      }
      const failed = results.filter((result) => result.error && !result.optional);

      state.tableErrors = Object.fromEntries(failed.map((result) => [result.table, result.error.message || "Unable to fetch"]));
      state.data.users = (rows.users || state.data.users).map(normalizeUser);
      state.data.courses = (rows.courses || state.data.courses).map(normalizeCourse);
      state.data.catalogCourses = (rows.catalogCourses || state.data.catalogCourses).map(normalizeCourse);
      state.data.batches = rows.batches || state.data.batches;
      state.data.userCourses = (rows.userCourses || state.data.userCourses).map(normalizeEnrollment);
      state.data.progress = rows.progress || state.data.progress;
      state.data.shopItems = rows.shopItems || state.data.shopItems;
      state.data.studentShopPurchases = rows.studentShopPurchases || state.data.studentShopPurchases;
      state.data.purchases = mergePurchaseRows(rows.purchases || state.data.purchases, rows.studentShopPurchases || state.data.studentShopPurchases);
      state.data.projects = rows.projects || state.data.projects;
      state.data.batchTasks = rows.batchTasks || state.data.batchTasks;
      state.data.taskSubmissions = rows.taskSubmissions || state.data.taskSubmissions;
      state.data.quizAttempts = rows.quizAttempts || state.data.quizAttempts || [];
      state.data.academicActivity = rows.academicActivity || state.data.academicActivity || [];
      state.data.chats = rows.chats || state.data.chats;
      state.data.announcements = rows.announcements || state.data.announcements;
      state.data.supportTickets = rows.supportTickets || state.data.supportTickets || [];
      state.data.supportMessages = rows.supportMessages || state.data.supportMessages || [];
      state.data.supportNotifications = rows.supportNotifications || state.data.supportNotifications || [];
      notifyUnreadSupportReplies();

      const refreshedProfile = state.data.users.find((user) => sameId(user.id, state.student.id));
      if (refreshedProfile) {
        state.student = normalizeUser({ ...state.student, ...refreshedProfile });
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
        sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));
        window.renderStudentReferral?.(state.student);
      }
      await refreshStudentWallet();

      if (!options.initial) {
        await Promise.all([loadSupplementalCourses(), loadSupplementalBatches()]);
        await loadSupplementalBatchRows();
      }

      ensureSelections();
      if (options.initial === true) {
        if (!state.data.leaderboard.length) state.data.leaderboard = buildPersonalLeaderboardRows();
      } else {
        await loadLeaderboardData();
      }
      renderAll();

      const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (failed.length) {
        studentDebug("Some background learning data could not be loaded.");
        setSyncStatus("");
      } else {
        setSyncStatus("");
      }
    } catch (error) {
      const errorMsg = error.message || "Unable to load student data.";
      studentDebug("Background learning data sync failed.", error);
      setSyncStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupplementalBatchRows() {
    const batchIds = scopedBatches().map((batch) => String(batch.id)).filter(Boolean);
    const missingBatchIds = batchIds.filter((id) => !sameId(id, state.student?.batch_id));
    if (!missingBatchIds.length) return;

    const client = getClient();
    try {
      const [chatResult, taskResult, userResult] = await Promise.all([
        client.from("batch_chats").select(SELECTS.chats).in("batch_id", missingBatchIds).order("created_at", { ascending: false }).limit(CHAT_PAGE_SIZE),
        client.from("batch_tasks").select(SELECTS.batchTasks).in("batch_id", missingBatchIds).order("created_at", { ascending: false }).limit(PAGE_SIZE),
        client.from("users").select(SELECTS.users).in("batch_id", missingBatchIds).limit(PAGE_SIZE)
      ]);
      if (!chatResult.error) state.data.chats = mergeRowsById(state.data.chats, chatResult.data || []);
      if (!taskResult.error) state.data.batchTasks = mergeRowsById(state.data.batchTasks, taskResult.data || []);
      if (!userResult.error) state.data.users = mergeRowsById(state.data.users, (userResult.data || []).map(normalizeUser));
    } catch (error) {
      studentDebug("Supplemental batch rows could not be loaded.", error);
    }
  }

  async function loadSupplementalBatches() {
    const courseIds = Array.from(studentCourseIds()).map(String).filter(Boolean);
    if (!courseIds.length) return;
    try {
      const { data, error } = await getClient()
        .from("batches")
        .select(SELECTS.batches)
        .in("course_id", courseIds)
        .neq("status", "archived")
        .limit(PAGE_SIZE);
      if (!error) state.data.batches = mergeRowsById(state.data.batches, data || []);
    } catch (error) {
      studentDebug("Supplemental batches could not be loaded.", error);
    }
  }

  function mergeRowsById(existing = [], incoming = []) {
    const rows = new Map();
    [...existing, ...incoming].forEach((row) => {
      const key = String(row?.id || row?.task_id || row?.created_at || Math.random());
      rows.set(key, row);
    });
    return Array.from(rows.values());
  }

  async function fetchTableSafe(spec, options = {}) {
    return tableClient.fetchTableSafe(spec, {
      ...options,
      timeoutMs: 8_000,
      withTimeout: withStudentTimeout
    });
  }

  function isMissingColumnError(error) {
    return window.JenovatePortalData.isMissingColumnError(error);
  }

  async function fetchTable(spec, options = {}) {
    return tableClient.fetchTable(spec, options);
  }

  async function runStudentSpecialQuery(platformClient, spec, limit) {
    if (spec.scope === "studentUsers") {
      const [profileResult, directoryResult] = await Promise.all([
        platformClient.from("users").select(spec.select).eq("id", state.student.id).maybeSingle(),
        platformClient.rpc("lms_student_directory")
      ]);
      const profileRows = profileResult.error
        ? [state.student].filter(Boolean)
        : (profileResult.data ? [profileResult.data] : [state.student].filter(Boolean));
      const directoryRows = directoryResult.error ? [] : (directoryResult.data || []);
      if (directoryResult.error) {
        studentDebug("Student directory is unavailable; showing the signed-in profile only.", directoryResult.error);
      }
      if (profileResult.error && !profileRows.length) throw profileResult.error;
      return mergeRowsById(profileRows, directoryRows).slice(0, limit);
    }
    return null;
  }

  function applyScopedFiltersToRows(rows, spec) {
    if (spec.scope !== "studentUsers") return rows;
    const studentId = String(state.student?.id || "");
    const batchId = String(state.student?.batch_id || "");
    return rows.filter((user) => (
      String(user.id) === studentId
      || (batchId && String(user.batch_id || "") === batchId)
      || String(user.role || "").toLowerCase() === "mentor"
    ));
  }

  function applyScopedFilters(query, spec) {
    const studentId = state.student?.id;
    const batchId = state.student?.batch_id;
    const courseIds = parseIdList(state.student?.course_ids).map(String);
    switch (spec.scope) {
      case "studentOnlyRows":
        return studentId ? query.eq("student_id", studentId) : query;
      case "studentUserCourses": {
        if (!studentId) return query;
        const selectable = String(spec.select || "");
        const clauses = ["user_id.eq." + studentId];
        if (selectable.includes("student_id")) clauses.push("student_id.eq." + studentId);
        if (selectable.includes("learner_id")) clauses.push("learner_id.eq." + studentId);
        return query.or(clauses.join(","));
      }
      case "studentPurchaseRows":
        return studentId ? query.eq("user_id", studentId) : query;
      case "studentProjectRows":
        return studentId ? query.eq("student_id", studentId) : query;
      case "studentBatchRows":
        return studentBatchFilterIds().length ? query.in("batch_id", studentBatchFilterIds()) : query;
      case "supportOwnerRows":
        return studentId ? query.eq("user_id", studentId) : query;
      case "supportMessageRows": {
        const ticketIds = state.data.supportTickets.map((ticket) => String(ticket.id || ticket.ticket_id)).filter(Boolean);
        return ticketIds.length ? query.in("ticket_id", ticketIds) : query.eq("ticket_id", "00000000-0000-0000-0000-000000000000");
      }
      case "supportNotificationRows":
        return studentId ? query.eq("recipient_user_id", studentId) : query;
      case "studentBatches":
        if (batchId && courseIds.length) return query.or(`id.eq.${batchId},course_id.in.(${courseIds.join(",")})`);
        if (courseIds.length) return query.in("course_id", courseIds);
        return batchId ? query.eq("id", batchId) : query;
      case "studentCourses":
        return courseIds.length ? query.in("id", courseIds) : query.ilike("status", "active").is("deleted_at", null);
      case "courseCatalog":
        return query.ilike("status", "active").is("deleted_at", null);
      case "studentUsers":
        return batchId
          ? query.or(`id.eq.${studentId},batch_id.eq.${batchId},role.eq.mentor`)
          : studentId ? query.eq("id", studentId) : query;
      case "studentAnnouncementRows": {
        const clauses = ["audience.in.(all,students)"];
        if (batchId) clauses.push(`batch_id.eq.${batchId}`);
        if (courseIds.length) clauses.push(`course_id.in.(${courseIds.join(",")})`);
        return query.or(clauses.join(","));
      }
      default:
        return query;
    }
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

  async function refreshChatRows(options = {}) {
    const spec = TABLE_SPECS.find((item) => item.key === "chats");
    if (!spec) return;
    const result = await fetchTableSafe(spec, { force: options.force === true });
    if (result.error) {
      studentDebug("Unable to refresh batch chat.", result.error);
      return;
    }
    state.data.chats = result.rows || [];
    renderChat();
    renderBatchPendingTasks();
    setSyncStatus("");
  }

  function mergePurchaseRows(...sources) {
    const seen = new Set();
    return sources.flat().filter(Boolean).filter((purchase) => {
      const key = [
        purchase.id || "",
        purchase.user_id || purchase.student_id || "",
        purchaseItemId(purchase) || ""
      ].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function setupRealtime() {
    const platformClient = getClient();
    if (!platformClient?.channel || state.realtimeChannel) return;

    const liveTables = ["projects", "batch_chats", "announcements", "support_tickets", "support_messages", "support_notifications"];

    const channel = platformClient.channel("student-lms-realtime");
    liveTables.forEach((table) => {
      const filter = table === "batch_chats" && state.student?.batch_id
        ? `batch_id=eq.${state.student.batch_id}`
        : undefined;
      const config = filter
        ? { event: "*", schema: "public", table, filter }
        : { event: "*", schema: "public", table };
      channel.on("postgres_changes", config, () => queueRealtimeRefresh(table));
    });

    channel.subscribe((status) => {
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        studentDebug("Realtime status update.", status);
      }
    });

    state.realtimeChannel = channel;
    window.addEventListener("pagehide", cleanupRealtime, { once: true });
    window.addEventListener("beforeunload", cleanupRealtime, { once: true });
  }

  function queueRealtimeRefresh(table) {
    setSyncStatus("");
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      if (table === "batch_chats") {
        void refreshChatRows({ force: true });
        return;
      }
      void loadAllData({ silent: true, force: true });
    }, table === "batch_chats" ? 650 : 900);
  }

  async function cleanupRealtime() {
    window.clearTimeout(state.refreshTimer);
    if (state.realtimeChannel && getClient()?.removeChannel) {
      await getClient().removeChannel(state.realtimeChannel);
    }
    state.realtimeChannel = null;
  }

  function renderAll() {
    renderIdentity();
    renderDashboard();
    renderCatalog();
    renderCourses();
    renderLearn();
    renderTasks();
    renderBatch();
    renderAnnouncements();
    renderQuestions();
    renderSupport();
    renderShop();
    renderReferral();
    renderProfile();
  }

  function renderActiveView() {
    const renderers = {
      dashboard: renderDashboard,
      catalog: renderCatalog,
      courses: renderCourses,
      learn: renderLearn,
      tasks: renderTasks,
      batch: renderBatch,
      announcements: renderAnnouncements,
      questions: renderQuestions,
      support: renderSupport,
      shop: renderShop,
      referral: renderReferral,
      profile: renderProfile
    };
    try {
      renderers[state.activeView]?.();
    } catch (error) {
      studentDebug("Unable to render the selected view.", error);
      if (state.activeView === "learn") {
        renderLearnFallback(error);
      }
      showAlert("This page could not render completely. Refresh data and try again.", true);
    }
  }

  function renderIdentity() {
    const student = state.student;
    if (!student) return;
    const displayName = studentDisplayName(student);
    const shortName = firstName(displayName);
    const initials = initialsFor(displayName || student.email);
    setText("sidebarStudentName", displayName);
    setText("sidebarStudentEmail", student.email || "");
    setText("sidebarStudentAvatar", initials);
    setText("panelStudentName", displayName);
    setText("topbarStudentAvatar", initials);
    setText("topbarStudentName", shortName);
    setText("sidebarBatchName", `Batch: ${currentBatch()?.name || "2026"}`);
    setText("coinBalance", formatNumber(student.coins));
    setText("shopCoinBalance", formatNumber(student.coins));
    renderStreakCard();
    setValue("profileName", student.name || "");
    setValue("profileUsername", student.username || "");
    setValue("profilePhone", student.phone || "");
    setValue("profileEmail", student.email || "");
    const referKey = studentReferKey(student);
    setValue("profileReferKey", referKey || "Loading...");
    const referCopy = document.getElementById("profileReferKeyCopyBtn");
    if (referCopy) referCopy.disabled = !referKey;
  }

  function renderDashboard() {
    const courses = filteredCourses(enrolledCourses());
    const activeDashboardCourses = courses.filter((course) => !isArchivedCourse(course) && courseProgress(course).percent < 100);
    const batches = scopedBatches();
    const tasks = scopedTasks();
    const pendingTasks = tasks.filter((task) => !submissionForTask(task.id));
    const purchases = state.data.purchases.filter((purchase) => sameId(purchase.user_id, state.student.id));
    const primaryBatch = currentBatch();
    const overallProgress = averageCourseProgress(courses);
    const completedCourses = courses.filter((course) => courseProgress(course).percent >= 100).length;
    const completionRate = courses.length ? Math.round((completedCourses / courses.length) * 100) : 0;
    const recentCourses = recentDashboardCourses(activeDashboardCourses);
    const activeCourse = recentCourses[0] || preferredLearningCourse(activeDashboardCourses) || activeDashboardCourses[0] || null;
    const session = dashboardSession();

    const heroCard = document.querySelector("#dashboardView .dashboard-hero-card");
    if (heroCard) heroCard.setAttribute("data-session", session.type);

    setText("sidebarBatchName", `Batch: ${primaryBatch?.name || "2026"}`);
    setText("panelBatchName", primaryBatch?.name || "Batch");
    setText("panelCourseCount", String(enrolledCourses().length));
    setText("heroBatchName", primaryBatch ? `Welcome back, ${primaryBatch.name}` : "Welcome back");

    const heroSessionIconEl = document.getElementById("heroSessionIcon");
    if (heroSessionIconEl) heroSessionIconEl.textContent = session.icon;
    const heroSessionTextEl = document.getElementById("heroSessionText");
    if (heroSessionTextEl) heroSessionTextEl.textContent = session.label;
    const heroSessionArtwork = document.getElementById("heroSessionArtwork");
    if (heroSessionArtwork && heroSessionArtwork.getAttribute("src") !== session.artwork) {
      heroSessionArtwork.setAttribute("src", session.artwork);
    }

    const heroGreeting = document.getElementById("heroGreeting");
    if (heroGreeting) {
      const studentFirstName = firstName(studentDisplayName(state.student));
      const accent = session.accent ? ` <span class="hero-wave">${escapeHtml(session.accent)}</span>` : "";
      heroGreeting.innerHTML = `${escapeHtml(session.greeting)}, <span class="hero-greeting-person"><span class="hero-name">${escapeHtml(studentFirstName)}</span>!${accent}</span>`;
    }

    const heroSummaryEl = document.getElementById("heroSummary");
    if (heroSummaryEl) {
      heroSummaryEl.textContent = session.summary(overallProgress);
    }

    setText("heroSessionNoteTitle", session.noteTitle);
    setText("heroSessionNoteText", session.noteText);
    setText("metricCourses", courses.length);
    setText("metricCompletedCourses", completedCourses);
    setText("dashboardCompletionRate", `${completionRate}% rate`);
    setText("metricTasks", pendingTasks.length);
    setText("metricTasksMeta", pendingTasks.length === 1 ? "pending submission" : "pending submissions");
    setText("metricStreak", currentStreak());
    setText("metricStreakMeta", isActiveToday() ? "active today" : "start today to save it");
    setText("metricRewards", purchases.length);
    setStyleWidth("dashboardCourseMetricBar", overallProgress);
    renderDashboardActiveCourse(activeCourse);
    renderDashboardQuizMetric();
    renderDashboardCourseOverview(recentCourses);
    renderStreakCard();
    renderDashboardLeaderboard();
    renderDashboardAssignmentStats(tasks);
    renderDashboardDeadlines(tasks.slice(0, 3));

    renderRailTasks(pendingTasks.slice(0, 4));
    renderRailAnnouncements(scopedAnnouncements().slice(0, 3));
  }

  async function loadSupplementalCourses() {
    const ids = new Set(Array.from(studentCourseIds()).map(String).filter(Boolean));
    state.data.batches.forEach((batch) => {
      if (batch?.course_id) ids.add(String(batch.course_id));
    });
    const missingIds = Array.from(ids).filter((id) => !state.data.courses.some((course) => sameId(course.id, id))
      && !state.data.catalogCourses.some((course) => sameId(course.id, id)));
    if (!missingIds.length) return;
    try {
      const { data, error } = await getClient()
        .from("courses")
        .select(SELECTS.courses)
        .in("id", missingIds)
        .limit(Math.max(missingIds.length, PAGE_SIZE));
      if (!error) {
        const rows = (data || []).map(normalizeCourse);
        state.data.courses = mergeRowsById(state.data.courses, rows);
        state.data.catalogCourses = mergeRowsById(state.data.catalogCourses, rows);
      }
    } catch (error) {
      studentDebug("Supplemental courses could not be loaded.", error);
    }
  }

  function dashboardGreeting() {
    return dashboardSession().greeting;
  }

  function dashboardSession() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return {
        type: "morning",
        artwork: "assets/student-sessions/morning.webp",
        label: "MORNING SESSION",
        greeting: "Good Morning",
        accent: "",
        icon: "",
        noteTitle: "Fresh start",
        noteText: "Begin with one lesson.",
        summary: () => "A fresh start is a chance to learn something meaningful today."
      };
    }
    if (hour >= 12 && hour < 17) {
      return {
        type: "afternoon",
        artwork: "assets/student-sessions/afternoon.webp",
        label: "AFTERNOON SESSION",
        greeting: "Good Afternoon",
        accent: "",
        icon: "",
        noteTitle: "Keep moving",
        noteText: "Your progress is building.",
        summary: () => "Keep your momentum going and turn today's effort into progress."
      };
    }
    if (hour >= 17 && hour < 22) {
      return {
        type: "evening",
        artwork: "assets/student-sessions/evening.webp",
        label: "EVENING SESSION",
        greeting: "Good Evening",
        accent: "",
        icon: "",
        noteTitle: "Keep it up!",
        noteText: "You're doing great today.",
        summary: () => "The best time for learning is now. Let's keep building your knowledge and confidence."
      };
    }
    return {
      type: "night",
      artwork: "assets/student-sessions/night.webp",
      label: "LATE NIGHT FOCUS",
      greeting: "Good Night",
      accent: "",
      icon: "",
      noteTitle: "Easy pace",
      noteText: "A short session is enough.",
      summary: () => "Quiet hours are perfect for one focused step forward."
    };
  }

  function renderDashboardActiveCourse(course) {
    const titleTarget = document.getElementById("dashboardActiveCourseTitle");
    if (!titleTarget) return;
    if (!course) {
      setText("dashboardActiveCourseTitle", "No active course yet");
      setText("dashboardActiveCourseInitial", "J");
      setText("dashboardActiveCourseChapter", "Enrollment pending");
      setText("dashboardActiveCoursePercent", "0%");
      setText("dashboardActiveCourseTime", "Your active course will appear here after enrollment.");
      setStyleWidth("dashboardActiveCourseBar", 0);
      return;
    }
    const progress = courseProgress(course);
    const modules = parseModules(course.modules);
    const currentModule = modules[Math.max(0, Math.min(modules.length - 1, Math.floor((progress.percent / 100) * Math.max(modules.length, 1))))];
    setText("dashboardActiveCourseTitle", course.title || "Active course");
    setText("dashboardActiveCourseInitial", initialsFor(course.title || "J"));
    setText("dashboardActiveCourseChapter", currentModule?.title ? `Chapter: ${currentModule.title}` : `${modules.length || 1} learning modules`);
    setText("dashboardActiveCoursePercent", `${progress.percent}%`);
    setText("dashboardActiveCourseTime", progress.percent ? "Resume from your last saved module" : "Start your first module today");
    setStyleWidth("dashboardActiveCourseBar", progress.percent);
  }

  function renderDashboardQuizMetric() {
    const attempts = state.data.quizAttempts.filter((attempt) => sameId(attempt.student_id || attempt.user_id, state.student.id));
    const scored = attempts
      .map((attempt) => {
        const score = Number(attempt.score || attempt.quiz_score || 0);
        const total = Number(attempt.max_score || attempt.total || 0);
        return total ? Math.round((score / total) * 100) : Number(attempt.quiz_score || 0);
      })
      .filter((value) => Number.isFinite(value) && value >= 0);
    const average = scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : 0;
    setText("dashboardAvgQuizScore", `${average}%`);
    setText("dashboardQuizMeta", scored.length ? "+4% from last week" : "No quiz attempts yet");
  }

  function renderDashboardResume(course) {
    const target = document.getElementById("dashboardResumeCard");
    if (!target) return;
    if (!course) {
      target.innerHTML = emptyState("No active course", "Your current course will appear here after enrollment.");
      return;
    }
    const progress = courseProgress(course);
    const modules = parseModules(course.modules);
    target.innerHTML = `
      <img src="${escapeAttr(courseDisplayImage(course, 2))}" alt="">
      <div class="dashboard-resume-copy">
        <div><span>Most Recent</span><small>Module ${Math.max(1, Math.min(modules.length || 1, Math.ceil((progress.percent || 1) / Math.max(100 / Math.max(modules.length || 1, 1), 1))))} of ${Math.max(modules.length, 1)}</small></div>
        <h3>${escapeHtml(course.title || "Current Course")}</h3>
        <p>${escapeHtml(truncate(course.description || "Master the art of creating seamless user experiences through consistent design.", 92))}</p>
        <div class="dashboard-resume-progress"><span>Progress</span><b>${progress.percent}%</b></div>
        <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
        <button class="primary-btn" type="button" data-open-course="${escapeAttr(course.id)}">Resume <span aria-hidden="true">›</span></button>
      </div>
    `;
  }

  function renderDashboardCourseOverview(courses) {
    const target = document.getElementById("dashboardCourseOverview");
    if (!target) return;
    const overviewCourses = courses.slice(0, 2);
    target.innerHTML = overviewCourses.length ? overviewCourses.map((course, index) => {
      const progress = courseProgress(course);
      const modules = parseModules(course.modules);
      const lessons = flattenCourseLessons(course, modules);
      const statusLabel = progress.percent >= 100 ? "Completed" : progress.percent > 0 ? "In Progress" : "Ready to Start";
      const statusTone = progress.percent >= 100 ? "completed" : progress.percent > 0 ? "in-progress" : "ready";
      const actionLabel = progress.percent >= 100 ? "Review Course" : progress.percent > 0 ? "Continue Learning" : "Start Learning";
      const lessonLabel = `${lessons.length || modules.length || 0} ${lessons.length === 1 ? "Lesson" : "Lessons"}`;
      const durationSeconds = lessonDurationSeconds({ duration: course.duration })
        || lessons.reduce((sum, item) => sum + lessonDurationSeconds(item.lesson), 0);
      const remainingSeconds = Math.max(0, Math.round(durationSeconds * (1 - (progress.percent / 100))));
      const timeLabel = remainingSeconds ? compactCourseDuration(remainingSeconds) : progress.percent >= 100 ? "Completed" : "Self paced";
      return `
        <article class="dashboard-overview-course dashboard-reference-course" data-open-course="${escapeAttr(course.id)}">
          <div class="dashboard-reference-course-media">
            <img src="${escapeAttr(courseDisplayImage(course, index + 5))}" alt="${escapeAttr(course.title || "Course")}">
            <span class="dashboard-reference-course-status ${statusTone}"><i></i>${statusLabel}</span>
            <span class="dashboard-reference-course-progress" style="--course-progress:${progress.percent * 3.6}deg"><b>${progress.percent}%</b></span>
          </div>
          <div class="dashboard-reference-course-body">
            <small class="dashboard-reference-course-kicker">ASSIGNED BATCH</small>
            <h3>${escapeHtml(course.title || "Course")}</h3>
            <p>${escapeHtml(truncate(course.description || "Build practical skills through guided lessons and hands-on learning.", 96))}</p>
            <div class="dashboard-reference-course-footer">
              <div class="dashboard-reference-course-meta">
                <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4V5.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H14v17a3 3 0 0 1 3-3h3V5.5Z"/></svg>${escapeHtml(lessonLabel)}</span>
                <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>${escapeHtml(timeLabel)}</span>
              </div>
              <button class="primary-btn dashboard-reference-course-action" type="button" data-open-course="${escapeAttr(course.id)}">
                ${escapeHtml(actionLabel)}
                <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></span>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join("") : emptyState("No courses yet", "Your enrolled courses will appear here.");
  }

  function compactCourseDuration(seconds) {
    const totalMinutes = Math.max(1, Math.ceil(Number(seconds || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes}m left`;
    return `${hours}h${minutes ? ` ${minutes}m` : ""} left`;
  }

  async function loadLeaderboardData() {
    try {
      const { data, error } = await getClient().rpc("lms_student_leaderboard");
      if (error) throw error;
      state.data.leaderboard = (data || []).map(normalizeLeaderboardRow);
    } catch (error) {
      studentDebug("Shared leaderboard could not be loaded.", error);
      state.data.leaderboard = buildPersonalLeaderboardRows();
    }
  }

  function normalizeLeaderboardRow(row) {
    return {
      ...row,
      user_id: String(row?.user_id || ""),
      course_id: String(row?.course_id || ""),
      progress_percent: clamp(Math.round(Number(row?.progress_percent || 0)), 0, 100),
      tasks_completed: Math.max(0, Math.floor(Number(row?.tasks_completed || 0))),
      quizzes_completed: Math.max(0, Math.floor(Number(row?.quizzes_completed || 0))),
      quiz_average: clamp(Math.round(Number(row?.quiz_average || 0)), 0, 100),
      achievements: Math.max(0, Math.floor(Number(row?.achievements || 0))),
      total_score: Math.max(0, Math.floor(Number(row?.total_score || 0))),
      course_rank: Math.max(1, Math.floor(Number(row?.course_rank || 1)))
    };
  }

  function buildPersonalLeaderboardRows() {
    return enrolledCourses().map((course) => {
      const progress = courseProgress(course);
      const courseBatchIds = new Set(scopedBatches()
        .filter((batch) => sameId(batch.course_id, course.id))
        .map((batch) => String(batch.id)));
      const taskIds = new Set(state.data.batchTasks
        .filter((task) => courseBatchIds.has(String(task.batch_id || "")))
        .map((task) => String(task.id)));
      const submissions = state.data.taskSubmissions.filter((submission) => (
        sameId(submission.student_id || submission.user_id, state.student.id)
        && (sameId(submission.course_id, course.id) || taskIds.has(String(submission.task_id || "")))
        && !["draft", "rejected", "cancelled"].includes(String(submission.status || "submitted").toLowerCase())
      ));
      const attempts = state.data.quizAttempts.filter((attempt) => (
        sameId(attempt.student_id, state.student.id) && sameId(attempt.course_id, course.id)
      ));
      const quizScores = attempts.map((attempt) => {
        const total = Number(attempt.total || attempt.max_score || 0);
        return total > 0 ? (Number(attempt.score || 0) / total) * 100 : 0;
      });
      const quizAverage = quizScores.length
        ? Math.round(quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length)
        : 0;
      const passedQuizzes = new Set(attempts
        .filter((attempt) => attempt.passed)
        .map((attempt) => String(attempt.quiz_id || attempt.module_id || attempt.module_order || ""))
        .filter(Boolean)).size;
      const achievements = progress.completedModules + submissions.length + passedQuizzes;
      return normalizeLeaderboardRow({
        user_id: state.student.id,
        learner_name: studentDisplayName(state.student),
        username: state.student.username || "",
        batch_id: state.student.batch_id || "",
        course_id: course.id,
        course_title: course.title || "Course",
        progress_percent: progress.percent,
        tasks_completed: new Set(submissions.map((submission) => String(submission.task_id))).size,
        quizzes_completed: attempts.length,
        quiz_average: quizAverage,
        achievements,
        total_score: progress.percent * 10 + submissions.length * 100 + quizAverage * 5 + (progress.completedModules + passedQuizzes) * 25,
        course_rank: 1
      });
    });
  }

  function renderDashboardLeaderboard() {
    const target = document.getElementById("dashboardLeaderboard");
    if (!target) return;
    const courses = enrolledCourses();
    const courseFilter = document.getElementById("leaderboardCourseFilter");
    const availableCourseIds = new Set(courses.map((course) => String(course.id)));
    if (!state.leaderboardCourseId || !availableCourseIds.has(String(state.leaderboardCourseId))) {
      state.leaderboardCourseId = courses[0]?.id ? String(courses[0].id) : "";
    }
    if (courseFilter) {
      courseFilter.innerHTML = courses.length
        ? courses.map((course) => `<option value="${escapeAttr(course.id)}">${escapeHtml(course.title || "Course")}</option>`).join("")
        : '<option value="">No enrolled courses</option>';
      courseFilter.value = state.leaderboardCourseId;
    }
    const sortSelect = document.getElementById("leaderboardSort");
    if (sortSelect) sortSelect.value = state.leaderboardSort;
    const searchInput = document.getElementById("leaderboardSearch");
    if (searchInput && document.activeElement !== searchInput) searchInput.value = state.leaderboardSearch;

    const query = state.leaderboardSearch;
    const rows = state.data.leaderboard
      .filter((row) => !state.leaderboardCourseId || sameId(row.course_id, state.leaderboardCourseId))
      .filter((row) => !query || String(row.learner_name || row.username || "").toLowerCase().includes(query))
      .slice();
    const byName = (a, b) => String(a.learner_name || "").localeCompare(String(b.learner_name || ""));
    const sorters = {
      rank: (a, b) => a.course_rank - b.course_rank || b.total_score - a.total_score || byName(a, b),
      score: (a, b) => b.total_score - a.total_score || byName(a, b),
      "name-asc": byName,
      "name-desc": (a, b) => byName(b, a),
      progress: (a, b) => b.progress_percent - a.progress_percent || byName(a, b),
      tasks: (a, b) => b.tasks_completed - a.tasks_completed || byName(a, b),
      quiz: (a, b) => b.quiz_average - a.quiz_average || byName(a, b)
    };
    rows.sort(sorters[state.leaderboardSort] || sorters.rank);

    target.innerHTML = rows.length ? rows.slice(0, 20).map((row) => {
      const rank = row.course_rank;
      const rankClass = rank <= 3 ? `top-${rank}` : "";
      const isCurrentStudent = sameId(row.user_id, state.student.id);
      return `
        <tr class="${isCurrentStudent ? "current-student" : ""}">
          <td><span class="dashboard-rank-medal ${rankClass}">${rank}</span></td>
          <td><div class="dashboard-leader-identity"><span>${escapeHtml(initialsFor(row.learner_name || row.username || "S"))}</span><div><strong>${escapeHtml(row.learner_name || "Student")}${isCurrentStudent ? " (You)" : ""}</strong><small>${row.username ? `@${escapeHtml(row.username)}` : "Learner"}</small></div></div></td>
          <td><span class="dashboard-leader-course">${escapeHtml(row.course_title || "Course")}</span></td>
          <td><div class="dashboard-leader-progress"><span><i style="width:${row.progress_percent}%"></i></span><b>${row.progress_percent}%</b></div></td>
          <td>${formatNumber(row.tasks_completed)}</td>
          <td>${row.quiz_average}%</td>
          <td>${formatNumber(row.achievements)}</td>
          <td><strong class="dashboard-leader-score">${formatNumber(row.total_score)}</strong></td>
        </tr>
      `;
    }).join("") : '<tr><td class="dashboard-leaderboard-empty" colspan="8">No verified leaderboard entries match these filters.</td></tr>';
  }

  function renderDashboardAssignmentStatsLegacy(tasks) {
    const target = document.getElementById("dashboardAssignmentStats");
    if (!target) return;
    const submissions = state.data.taskSubmissions.filter((item) => sameId(item.student_id || item.user_id, state.student.id));
    const attempts = state.data.quizAttempts.filter((attempt) => sameId(attempt.student_id || attempt.user_id, state.student.id));
    const totalTasks = tasks.length;
    const totalQuizzes = enrolledCourses().reduce((sum, course) => (
      sum + parseModules(course.modules).filter((module) => Boolean(moduleQuiz(module))).length
    ), 0);
    const bestScores = new Map();
    attempts.forEach((attempt, index) => {
      const total = Number(attempt.total || attempt.max_score || 0);
      const percent = total > 0
        ? clamp(Math.round((Number(attempt.score || 0) / total) * 100), 0, 100)
        : clamp(Math.round(Number(attempt.quiz_score || 0)), 0, 100);
      const key = String(attempt.quiz_id || `${attempt.course_id || "course"}:${attempt.module_id || attempt.module_order || index}`);
      bestScores.set(key, Math.max(bestScores.get(key) || 0, percent));
    });
    const scores = Array.from(bestScores.values());
    const averageScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    const highestScore = scores.length ? Math.max(...scores) : 0;

    const latestSubmission = submissions.slice().sort((a, b) => (
      new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0)
    ))[0];
    const latestAttempt = attempts.slice().sort((a, b) => (
      new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0)
    ))[0];
    const submissionDate = latestSubmission?.submitted_at || latestSubmission?.created_at;
    const attemptDate = latestAttempt?.submitted_at || latestAttempt?.created_at;
    const recentIsQuiz = latestAttempt && (!latestSubmission || new Date(attemptDate || 0) >= new Date(submissionDate || 0));
    const recentTask = latestSubmission
      ? tasks.find((task) => sameId(task.id, latestSubmission.task_id))
      : null;
    const recentCourse = latestAttempt
      ? state.data.courses.find((course) => sameId(course.id, latestAttempt.course_id))
      : null;
    const recentTitle = recentIsQuiz
      ? latestAttempt.module_title || `${recentCourse?.title || "Course"} Quiz`
      : recentTask?.title || (latestSubmission ? "Assignment Submission" : "No recent activity");
    const recentMeta = recentIsQuiz
      ? `Completed - ${relativeActivityTime(attemptDate)}`
      : latestSubmission
        ? `Submitted - ${relativeActivityTime(submissionDate)}`
        : "Complete an assignment or quiz to begin";

    const tiles = [
      { label: "Total Assignments", value: totalTasks, tone: "blue", icon: '<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7V3Z"/><path d="M15 3v5h5M10 12h6M10 16h6"/></svg>' },
      { label: "Total Quizzes", value: totalQuizzes, tone: "purple", icon: '<svg viewBox="0 0 24 24"><path d="M5 4h14v14H9l-4 3V4Z"/><path d="M9.5 9a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 1.9M12 16h.01"/></svg>' },
      { label: "Average Score", value: `${averageScore}%`, tone: "green", icon: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>' },
      { label: "Highest Score", value: `${highestScore}%`, tone: "gold", icon: '<svg viewBox="0 0 24 24"><path d="M8 4h8v4a4 4 0 0 1-8 0V4ZM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6"/></svg>' }
    ];
    target.innerHTML = `
      <div class="dashboard-assignment-metrics">
        ${tiles.map((tile) => `
          <article class="dashboard-assignment-metric ${tile.tone}">
            <span aria-hidden="true">${tile.icon}</span>
            <div><small>${escapeHtml(tile.label)}</small><strong>${escapeHtml(tile.value)}</strong></div>
          </article>
        `).join("")}
      </div>
      <footer class="dashboard-assignment-recent">
        <span class="dashboard-assignment-clock" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg></span>
        <div><small>Recent Activity</small><strong>${escapeHtml(recentTitle)}</strong><p>${escapeHtml(recentMeta)}</p></div>
        <button type="button" data-jump="tasks">View All <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        <span class="dashboard-assignment-book" aria-hidden="true"><svg viewBox="0 0 90 72"><path d="M17 15h49a8 8 0 0 1 8 8v39H25a8 8 0 0 1-8-8V15Z"/><path d="M25 8h49v47H25a8 8 0 0 0-8 8V16a8 8 0 0 1 8-8Z"/><path d="M35 21h25M35 29h19M33 62v8l7-4 7 4v-8"/></svg></span>
      </footer>
    `;
  }

  function academicPeriodRange(period = "all", now = new Date()) {
    const end = new Date(now);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "today") return { start, end };
    if (period === "week") {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      return { start, end };
    }
    if (period === "month") {
      start.setDate(1);
      return { start, end };
    }
    if (period === "year") {
      start.setMonth(0, 1);
      return { start, end };
    }
    return { start: null, end };
  }

  function dateInAcademicPeriod(value, range) {
    if (!range.start) return true;
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) && date >= range.start && date <= range.end;
  }

  function assessmentPercent(score, total) {
    if (window.JenovateAcademicMetrics) return window.JenovateAcademicMetrics.percentage(score, total);
    const earned = numberFrom(score);
    const maximum = numberFrom(total);
    return earned !== null && maximum !== null && maximum > 0
      ? clamp((earned / maximum) * 100, 0, 100)
      : null;
  }

  function courseQuizCatalog(course) {
    return parseModules(course?.modules).flatMap((module, moduleIndex) => {
      const quiz = moduleQuiz(module);
      const status = String(quiz?.status || "published").toLowerCase();
      if (!quiz?.questions?.length || ["draft", "unpublished", "archived"].includes(status)) return [];
      return [{
        key: `${course.id}:${String(quiz.id || module.id || moduleIndex)}`,
        id: quiz.id,
        courseId: course.id,
        courseTitle: course.title || "Course",
        moduleId: module.id || moduleIndex,
        moduleOrder: moduleIndex + 1,
        title: quiz.title || `${module.title || "Module"} Quiz`,
        maximum: quizTotalMarks(quiz),
        passRatio: quizTotalMarks(quiz) > 0
          ? clamp(Number(quiz.pass_marks || quiz.pass_score || Math.ceil(quizTotalMarks(quiz) * 0.6)) / quizTotalMarks(quiz), 0, 1)
          : 0.6
      }];
    });
  }

  function quizAttemptKey(attempt, quizzes = []) {
    const courseId = String(attempt.course_id || "");
    const courseQuizzes = quizzes.filter((quiz) => sameId(quiz.courseId, courseId));
    if (attempt.quiz_id) {
      const matched = courseQuizzes.find((quiz) => sameId(quiz.id, attempt.quiz_id));
      return matched?.key || "";
    }
    if (attempt.module_id !== undefined && attempt.module_id !== null) {
      const matched = courseQuizzes.find((quiz) => sameId(quiz.moduleId, attempt.module_id));
      if (matched) return matched.key;
    }
    if (attempt.module_order !== undefined && attempt.module_order !== null) {
      const matched = courseQuizzes.find((quiz) => Number(quiz.moduleOrder) === Number(attempt.module_order));
      if (matched) return matched.key;
    }
    return courseQuizzes.length === 1 ? courseQuizzes[0].key : "";
  }

  function isSubmittedAssignment(submission) {
    return ["submitted", "graded", "approved", "completed", "reviewed"]
      .includes(String(submission?.status || "submitted").toLowerCase());
  }

  function quizAttemptPassMarks(quiz, attemptMaximum) {
    const configuredMaximum = quizTotalMarks(quiz);
    if (window.JenovateAcademicMetrics) {
      return window.JenovateAcademicMetrics.scaledPassMark(quiz?.pass_marks ?? quiz?.pass_score, configuredMaximum, attemptMaximum);
    }
    const ratio = configuredMaximum > 0 && Number(quiz?.pass_marks || quiz?.pass_score) > 0
      ? Number(quiz.pass_marks || quiz.pass_score) / configuredMaximum
      : 0.6;
    return Math.ceil(Number(attemptMaximum || 0) * clamp(ratio, 0, 1));
  }

  function buildAcademicMetrics(tasks, period = state.academicPeriod) {
    const range = academicPeriodRange(period);
    const publishedTasks = tasks.filter((task) => (
      !task.deleted_at
      && !["draft", "unpublished", "archived", "deleted", "cancelled"].includes(String(task.status || "published").toLowerCase())
      && dateInAcademicPeriod(task.published_at || task.created_at, range)
    ));
    const taskById = new Map(tasks.map((task) => [String(task.id), task]));
    const publishedTaskIds = new Set(publishedTasks.map((task) => String(task.id)));
    const submissions = state.data.taskSubmissions.filter((item) => (
      sameId(item.student_id || item.user_id, state.student.id)
      && !item.deleted_at
      && publishedTaskIds.has(String(item.task_id || ""))
      && isSubmittedAssignment(item)
      && dateInAcademicPeriod(item.submitted_at || item.created_at, range)
    ));
    const latestSubmissions = new Map();
    submissions.forEach((submission) => {
      const key = String(submission.task_id || submission.id);
      const previous = latestSubmissions.get(key);
      if (!previous || new Date(submission.submitted_at || submission.created_at || 0) > new Date(previous.submitted_at || previous.created_at || 0)) {
        latestSubmissions.set(key, submission);
      }
    });

    const quizzes = enrolledCourses().flatMap(courseQuizCatalog);
    const quizByKey = new Map(quizzes.map((quiz) => [quiz.key, quiz]));
    const attempts = state.data.quizAttempts.filter((attempt) => (
      sameId(attempt.student_id || attempt.user_id, state.student.id)
      && !attempt.deleted_at
      && dateInAcademicPeriod(attempt.submitted_at || attempt.created_at, range)
    ));
    const bestAttempts = new Map();
    attempts.forEach((attempt) => {
      const key = quizAttemptKey(attempt, quizzes);
      if (!key) return;
      const percent = assessmentPercent(attempt.score ?? attempt.quiz_score, attempt.total ?? attempt.max_score)
        ?? clamp(Number(attempt.quiz_score || 0), 0, 100);
      const previous = bestAttempts.get(key);
      if (!previous || percent > previous.percent) bestAttempts.set(key, { ...attempt, key, percent });
    });

    const assignmentResults = [...latestSubmissions.values()].map((submission) => {
      const task = taskById.get(String(submission.task_id));
      const earned = numberFrom(submission.marks_obtained ?? submission.score);
      const maximum = numberFrom(submission.total_marks ?? submission.max_marks ?? task?.total_marks ?? task?.max_marks);
      return { submission, task, earned, maximum, percent: assessmentPercent(earned, maximum) };
    }).filter((result) => result.percent !== null);
    const quizResults = [...bestAttempts.values()].map((attempt) => ({
      attempt,
      earned: numberFrom(attempt.score ?? attempt.quiz_score),
      maximum: numberFrom(attempt.total ?? attempt.max_score),
      percent: attempt.percent
    })).filter((result) => result.percent !== null);
    const allResults = [...assignmentResults, ...quizResults];
    const averageScore = window.JenovateAcademicMetrics
      ? window.JenovateAcademicMetrics.averagePercent(allResults.map((item) => item.percent))
      : allResults.length ? allResults.reduce((sum, item) => sum + item.percent, 0) / allResults.length : 0;
    const highestScore = allResults.length ? Math.max(...allResults.map((item) => item.percent)) : 0;
    const pooledPercent = (rows) => {
      if (window.JenovateAcademicMetrics) return window.JenovateAcademicMetrics.pooledPerformance(rows);
      const valid = rows.filter((row) => row.earned !== null && row.maximum !== null && row.maximum > 0);
      const maximum = valid.reduce((sum, row) => sum + row.maximum, 0);
      return maximum > 0 ? clamp((valid.reduce((sum, row) => sum + row.earned, 0) / maximum) * 100, 0, 100) : 0;
    };
    const assignmentPerformance = pooledPercent(assignmentResults);
    const quizPerformance = pooledPercent(quizResults);

    const activityWeights = { attendance: 30, live_session: 20, discussion: 20, assignment_on_time: 20, daily_login: 10 };
    const activityRows = state.data.academicActivity.filter((activity) => (
      sameId(activity.student_id, state.student.id)
      && dateInAcademicPeriod(activity.occurred_at || activity.created_at, range)
    ));
    const participationByType = new Map();
    activityRows.forEach((activity) => {
      const type = String(activity.activity_type || "").toLowerCase();
      if (!(type in activityWeights)) return;
      const current = participationByType.get(type) || { earned: 0, maximum: 0 };
      current.earned += Math.max(0, Number(activity.points || 0));
      current.maximum += Math.max(0, Number(activity.max_points || 0));
      participationByType.set(type, current);
    });
    let participation = 0;
    ["attendance", "live_session", "discussion"].forEach((type) => {
      const weight = activityWeights[type];
      const component = participationByType.get(type);
      if (component?.maximum > 0) participation += clamp(component.earned / component.maximum, 0, 1) * weight;
    });
    if (latestSubmissions.size) {
      const onTime = [...latestSubmissions.values()].filter((submission) => {
        if (submission.is_on_time === true) return true;
        const deadline = taskById.get(String(submission.task_id))?.deadline;
        return deadline && new Date(submission.submitted_at || 0) <= new Date(deadline);
      }).length;
      participation += (onTime / latestSubmissions.size) * activityWeights.assignment_on_time;
    }
    const loginRows = activityRows.filter((activity) => String(activity.activity_type || "").toLowerCase() === "daily_login");
    if (loginRows.length) {
      const loginDates = new Set(loginRows.map((activity) => dateKeyFromValue(activity.occurred_at || activity.created_at)).filter(Boolean));
      const firstLogin = [...loginRows].sort((a, b) => new Date(a.occurred_at || a.created_at) - new Date(b.occurred_at || b.created_at))[0];
      const earliest = range.start || new Date(firstLogin.occurred_at || firstLogin.created_at);
      const expectedDays = Math.max(1, daysBetween(dateKeyFromDate(earliest), todayKey()) + 1);
      participation += clamp(loginDates.size / expectedDays, 0, 1) * activityWeights.daily_login;
    }
    const overall = window.JenovateAcademicMetrics
      ? window.JenovateAcademicMetrics.weightedScore([
        { value: assignmentPerformance, weight: 40 },
        { value: quizPerformance, weight: 40 },
        { value: participation, weight: 20 }
      ])
      : assignmentPerformance * 0.4 + quizPerformance * 0.4 + participation * 0.2;

    const recent = [
      ...submissions.map((submission) => ({
        type: "assignment",
        title: taskById.get(String(submission.task_id))?.title || "Assignment submitted",
        meta: `Submitted - ${relativeActivityTime(submission.submitted_at || submission.created_at)}`,
        date: submission.submitted_at || submission.created_at,
        value: assignmentResults.find((item) => item.submission === submission)?.percent
      })),
      ...attempts.map((attempt) => ({
        type: "quiz",
        title: attempt.module_title || quizByKey.get(quizAttemptKey(attempt, quizzes))?.title || "Quiz completed",
        meta: `Completed - ${relativeActivityTime(attempt.submitted_at || attempt.created_at)}`,
        date: attempt.submitted_at || attempt.created_at,
        value: assessmentPercent(attempt.score ?? attempt.quiz_score, attempt.total ?? attempt.max_score)
      }))
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 5);

    return {
      totalAssignments: publishedTasks.length,
      submittedAssignments: latestSubmissions.size,
      totalQuizzes: quizzes.length,
      attemptedQuizzes: bestAttempts.size,
      averageScore: Math.round(averageScore * 10) / 10,
      highestScore: Math.round(highestScore * 10) / 10,
      assignmentPerformance: Math.round(assignmentPerformance * 10) / 10,
      quizPerformance: Math.round(quizPerformance * 10) / 10,
      participation: Math.round(participation * 10) / 10,
      overall: Math.round(overall),
      recent
    };
  }

  function renderDashboardAssignmentStats(tasks) {
    const target = document.getElementById("dashboardAssignmentStats");
    if (!target) return;
    const metrics = buildAcademicMetrics(tasks);
    const tiles = [
      { label: "Total Assignments", value: metrics.totalAssignments, detail: `${metrics.submittedAssignments} submitted`, tone: "blue", symbol: "=" },
      { label: "Total Quizzes", value: metrics.totalQuizzes, detail: `${metrics.attemptedQuizzes} attempted`, tone: "purple", symbol: "?" },
      { label: "Average Score", value: `${metrics.averageScore}%`, detail: "Completed assessments", tone: "green", symbol: "+" },
      { label: "Highest Score", value: `${metrics.highestScore}%`, detail: "Best performance", tone: "gold", symbol: "*" }
    ];
    const recentMarkup = metrics.recent.length ? metrics.recent.map((activity) => `
      <article class="academic-activity-row ${activity.type}">
        <span aria-hidden="true">${activity.type === "quiz" ? "?" : "="}</span>
        <div><strong>${escapeHtml(activity.title)}</strong><small>${escapeHtml(activity.meta)}</small></div>
        ${activity.value !== null && activity.value !== undefined ? `<b>${Math.round(activity.value * 10) / 10}%</b>` : '<b>Submitted</b>'}
      </article>
    `).join("") : '<p class="academic-empty">No completed assessments in this period.</p>';
    const periodLabel = document.getElementById("academicPeriodFilter")?.selectedOptions?.[0]?.textContent || "All Time";

    target.innerHTML = `
      <div class="dashboard-assignment-metrics">
        ${tiles.map((tile) => `
          <article class="dashboard-assignment-metric ${tile.tone}">
            <span class="academic-metric-icon" aria-hidden="true">${tile.symbol}</span>
            <div><small>${escapeHtml(tile.label)}</small><strong>${escapeHtml(tile.value)}</strong><p>${escapeHtml(tile.detail)}</p></div>
          </article>
        `).join("")}
      </div>
      <div class="academic-dashboard-lower">
        <section class="academic-recent-panel">
          <header><h3>Recent Activity</h3><button type="button" data-jump="tasks">View All</button></header>
          <div>${recentMarkup}</div>
        </section>
        <section class="academic-performance-panel">
          <header><h3>Performance Overview</h3><span>${escapeHtml(periodLabel)}</span></header>
          <div class="academic-performance-body">
            <div class="academic-overall-ring" style="--academic-score:${metrics.overall * 3.6}deg"><strong>${metrics.overall}%</strong><small>Overall</small></div>
            <dl>
              <div><dt><i class="blue"></i>Assignments</dt><dd>${metrics.assignmentPerformance}%</dd></div>
              <div><dt><i class="purple"></i>Quizzes</dt><dd>${metrics.quizPerformance}%</dd></div>
              <div><dt><i class="green"></i>Participation</dt><dd>${metrics.participation}%</dd></div>
            </dl>
          </div>
          <p class="academic-performance-note">Performance uses verified marks and recorded participation only.</p>
        </section>
      </div>
    `;
  }

  function renderDashboardDeadlines(tasks) {
    const target = document.getElementById("dashboardDeadlineList");
    if (!target) return;
    const upcoming = tasks
      .filter((task) => !submissionForTask(task.id))
      .sort((a, b) => new Date(a.deadline || a.created_at || 0) - new Date(b.deadline || b.created_at || 0))
      .slice(0, 3);
    target.innerHTML = upcoming.length ? upcoming.map((task, index) => `
      <article class="deadline-chip-row ${index === 0 ? "urgent" : ""}">
        <span class="deadline-dot" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(task.title || "Assignment")}</strong>
          <small>${escapeHtml(formatDate(task.deadline || task.created_at))}</small>
        </div>
        <button class="${index === 0 ? "primary-btn" : "secondary-btn"}" type="button" data-jump="tasks">${index === 0 ? "Submit Now" : "View Details"}</button>
      </article>
    `).join("") : emptyState("No upcoming deadlines", "Assigned tasks will appear here.");
  }

  function renderCatalog() {
    const target = document.getElementById("catalogCoursesGrid");
    if (!target) return;
    const enrolledIds = studentCourseIds();
    const catalog = filteredCourses(catalogCourses())
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
    const categories = [...new Set(catalog
      .map((course) => String(course.category || course.difficulty || "").trim())
      .filter(Boolean))]
      .slice(0, 5);
    const activeCategory = state.catalogCategory || "all";
    const categoryCatalog = activeCategory === "all"
      ? catalog
      : catalog.filter((course) => String(course.category || course.difficulty || "").trim().toLowerCase() === activeCategory.toLowerCase());
    const activeFilter = state.catalogFilter || "all";
    const visibleCatalog = categoryCatalog.filter((course) => {
      const modules = parseModules(course.modules);
      if (activeFilter === "quiz") return modules.some((module) => moduleQuiz(module));
      if (activeFilter === "modules") return modules.length > 0;
      return true;
    });
    const totalModules = visibleCatalog.reduce((sum, course) => sum + parseModules(course.modules).length, 0);
    const enrolledCount = enrolledCourses().length;
    const filterLabels = {
      all: "Filters",
      quiz: "Has Quiz",
      modules: "Has Modules"
    };
    target.innerHTML = `
      <section class="course-discovery-hero">
        <div>
          <span>Premium learning collection</span>
          <h2>Master New Skills Today.</h2>
          <p>Explore ${visibleCatalog.length || 0} available courses with ${totalModules || 0} modules. Assigned courses are marked in the catalog.</p>
          <div class="catalog-hero-actions">
            <label class="catalog-search-pill" for="catalogSearchInput">
              <input id="catalogSearchInput" type="search" value="${escapeAttr(state.query || "")}" placeholder="Search for courses, tools, or mentors..." autocomplete="off" />
            </label>
            <button class="primary-btn" type="button" data-catalog-reset>Explore All</button>
          </div>
        </div>
        <aside class="catalog-hero-stat">
          <strong>${visibleCatalog.length || 0}</strong>
          <span>Available courses</span>
          <small>${enrolledCount} assigned in My Courses</small>
        </aside>
      </section>
      <div class="catalog-control-row">
        <div class="catalog-chip-row">
          <button class="${activeCategory === "all" ? "active" : ""}" type="button" data-catalog-category="all">All Courses</button>
          ${categories.map((category) => `<button class="${activeCategory.toLowerCase() === category.toLowerCase() ? "active" : ""}" type="button" data-catalog-category="${escapeAttr(category)}">${escapeHtml(category)}</button>`).join("")}
        </div>
        <div class="catalog-actions">
          <button type="button">Sort: Featured</button>
          <button class="${activeFilter !== "all" || state.catalogFiltersOpen ? "active" : ""}" type="button" data-catalog-filter-toggle aria-expanded="${state.catalogFiltersOpen ? "true" : "false"}">${escapeHtml(activeFilter === "all" ? "Filters" : filterLabels[activeFilter] || "Filters")}</button>
        </div>
      </div>
      <div class="catalog-filter-row ${state.catalogFiltersOpen ? "open" : ""}" aria-label="Course filters" ${state.catalogFiltersOpen ? "" : "hidden"}>
        <button class="${activeFilter === "all" ? "active" : ""}" type="button" data-catalog-filter="all">All</button>
        <button class="${activeFilter === "quiz" ? "active" : ""}" type="button" data-catalog-filter="quiz">Has Quiz</button>
        <button class="${activeFilter === "modules" ? "active" : ""}" type="button" data-catalog-filter="modules">Has Modules</button>
      </div>
      <div class="catalog-card-grid">
        ${visibleCatalog.length
        ? visibleCatalog.map((course) => courseCatalogCard(course, enrolledIds)).join("")
        : emptyState("No courses available", "Published courses will appear here when they are ready.")}
      </div>
      <section class="catalog-accelerator-card">
        <div>
          <span>Exclusive Opportunity</span>
          <h2>The Developer's Career Accelerator Pack</h2>
          <p>Accelerate your roadmap with mentor-led course resources, project practice, and the next best track from your learning catalog.</p>
          <a class="primary-btn" href="launchpad-detail.html?plan=pro">Unlock Next Track</a>
          <a class="secondary-btn" href="launchpad-detail.html?plan=advanced">Learn More</a>
        </div>
      </section>
    `;
  }

  function courseCatalogCard(course, enrolledIds = studentCourseIds()) {
    const modules = parseModules(course.modules);
    const isAssigned = enrolledIds.has(String(course.id));
    const quizCount = modules.filter((module) => moduleQuiz(module)).length;
    const thumbnail = escapeAttr(courseDisplayImage(course, modules.length));
    const title = escapeHtml(course.title || "Untitled course");
    const category = escapeHtml(course.category || course.difficulty || "Learning");
    const instructor = escapeHtml(course.instructor_name || course.mentor_name || "Jenovate Mentor");
    const tag = modules.length >= 3 ? "Hot" : "New";
    const duration = escapeHtml(course.duration || `${modules.length || 1} modules`);
    const price = escapeHtml(formatCatalogCoursePrice(course.price));
    const buyHref = courseDetailCheckoutHref(course);
    return `
      <article class="discovery-course-card" data-catalog-course-card="${escapeAttr(course.id)}">
        <div class="discovery-media">
          <img src="${thumbnail}" alt="">
          <span class="discovery-status">${escapeHtml(isAssigned ? "Assigned" : tag)}</span>
          <b class="discovery-price">${price}</b>
        </div>
        <div class="discovery-body">
          <div class="discovery-kicker"><span class="course-category-label">${category}</span><small>${duration}</small></div>
          <h3>${title}</h3>
          <div class="discovery-rating">Rating 5.0 <small>${escapeHtml(instructor)}</small></div>
          <div class="discovery-meta"><span>${modules.length || 1} Modules</span><span>${quizCount} Quizzes</span></div>
          <div class="discovery-actions">
            <button class="secondary-btn" type="button" data-course-detail="${escapeAttr(course.id)}">View Details</button>
            ${isAssigned ? `<button class="primary-btn" type="button" data-start-assigned-course="${escapeAttr(course.id)}">Open</button>` : `<a class="primary-btn" href="${escapeAttr(buyHref)}" data-buy-catalog-course="${escapeAttr(course.id)}">Buy Now</a>`}
          </div>
        </div>
      </article>
    `;
  }

  function courseDetailCheckoutHref(course) { const slug = String(course?.slug || course?.course_slug || course?.handle || "").trim() || String(course?.title || course?.name || course?.id || "course").toLowerCase().replace(/&/g, "and").replace(/\(iot\)/g, "iot").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); return `course-detail.html?course=${encodeURIComponent(slug)}&checkout=1`; }

  function formatCatalogCoursePrice(price) { const raw = String(price ?? "").trim(); if (!raw) return "Included"; const amount = Number(raw.replace(/[^0-9.]/g, "")); return Number.isFinite(amount) && amount > 0 ? `INR ${Math.round(amount).toLocaleString("en-IN")}` : "Free"; }

  function renderRailTasks(tasks) {
    const target = document.getElementById("dashboardRailTasks");
    if (!target) return;
    const quiz = state.data.quizAttempts
      .filter((attempt) => sameId(attempt.student_id || attempt.user_id, state.student.id))
      .sort((a, b) => new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0))[0];
    const activities = [];
    if (quiz) {
      const course = state.data.courses.find((item) => sameId(item.id, quiz.course_id));
      activities.push({
        icon: "Quiz",
        title: "Quiz Completed",
        body: `${course?.title || quiz.module_title || "Course quiz"} ${quiz.score !== undefined ? `- ${quiz.score}/${quiz.total || quiz.max_score || "?"}` : ""}`,
        date: quiz.submitted_at || quiz.created_at
      });
    }
    tasks.slice(0, 2).forEach((task) => activities.push({
      icon: "TS",
      title: submissionForTask(task.id) ? "Task Submitted" : "Task Pending",
      body: task.title || "Assignment task",
      date: task.deadline || task.created_at
    }));
    const announcements = scopedAnnouncements().slice(0, 1);
    announcements.forEach((item) => activities.push({
      icon: "AN",
      title: "New Milestone",
      body: item.title || "Announcement",
      date: item.published_at || item.created_at
    }));
    if (!activities.length) {
      activities.push({
        icon: "ST",
        title: "Learning Workspace Ready",
        body: "Your activity will appear here as you learn.",
        date: new Date().toISOString()
      });
    }
    target.innerHTML = activities.slice(0, 4).map((item) => `
      <article class="rail-event deadline-event dashboard-activity-row">
        <span class="rail-avatar">${escapeHtml(item.icon)}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.body)}</small>
          <time>${escapeHtml(formatDateTime(item.date))}</time>
        </div>
      </article>
    `).join("");
  }

  function renderRailAnnouncements(items) {
    const target = document.getElementById("dashboardRailAnnouncements");
    if (!target) return;
    const latest = items[0] || null;
    if (!latest) {
      target.innerHTML = "";
      setText("dashboardInboxFooterTitle", "All caught up!");
      setText("dashboardInboxFooterText", "You have no new messages");
      return;
    }

    const publishedAt = latest.published_at || latest.created_at;
    const publishedTime = new Date(publishedAt || 0).getTime();
    const isRecent = Number.isFinite(publishedTime) && publishedTime > 0
      && Date.now() - publishedTime <= 7 * 24 * 60 * 60 * 1000;
    const senderLabel = humanizeStatus(latest.created_by_role || "Announcement");
    const senderInitials = latest.created_by_role ? initialsFor(senderLabel) : "AN";
    const statusLabel = String(latest.priority || "").toLowerCase() === "high" ? "Important" : isRecent ? "New" : "";

    target.innerHTML = `
      <article class="dashboard-inbox-message">
        <span class="dashboard-inbox-avatar ${isRecent ? "unread" : ""}" aria-label="From ${escapeAttr(senderLabel)}">${escapeHtml(senderInitials)}</span>
        <div class="dashboard-inbox-message-copy">
          <strong>${escapeHtml(latest.title || "Announcement")}</strong>
          <p>${escapeHtml(truncate(latest.message || "A new update is available in your learning workspace.", 76))}</p>
        </div>
        <div class="dashboard-inbox-message-meta">
          <time datetime="${escapeAttr(publishedAt || "")}">${escapeHtml(formatDate(publishedAt))}</time>
          ${statusLabel ? `<span>${escapeHtml(statusLabel)}</span>` : ""}
        </div>
      </article>
    `;

    const remaining = Math.max(0, items.length - 1);
    setText("dashboardInboxFooterTitle", remaining ? `${remaining} more update${remaining === 1 ? "" : "s"}` : "All caught up!");
    setText("dashboardInboxFooterText", remaining ? "Open View All to read every message" : "You have no more messages");
  }

  function renderStreakCard() {
    if (!state.student) return;
    const studentName = firstName(studentDisplayName(state.student));
    const activeDays = weeklyActiveDateKeys();
    const streak = activeDays.size;
    const today = todayKey();

    setText("streakAvatar", initialsFor(studentDisplayName(state.student) || state.student.email));
    setText("streakStudentName", studentName);
    setText("streakCoinBalance", formatNumber(state.student.coins));
    setText("streakTitle", `${streak} Day${streak === 1 ? "" : "s"} Streak`);
    setText("dashboardMonthlyStreak", `${streak} Day${streak === 1 ? "" : "s"}`);
    setText("weeklyActivityLabel", `${activeDays.size}/7`);
    setText("streakStatusText", isActiveToday()
      ? "Today is locked in. Keep learning."
      : "Complete one activity to protect your streak.");

    const weeklyRecord = 7;
    const remainingDays = Math.max(0, weeklyRecord - streak);
    const trackerTitle = streak >= weeklyRecord
      ? "Perfect week!"
      : streak >= 5
        ? "Amazing progress!"
        : streak >= 2
          ? "Building momentum!"
          : streak === 1
            ? "Great start!"
            : "Start your streak!";
    const trackerMessage = streak >= weeklyRecord
      ? "You reached all 7 active days this week."
      : isActiveToday()
        ? "Consistency is the secret to mastery."
        : "Complete an activity today to move forward.";
    const recordText = remainingDays === 0
      ? "Weekly record<br>achieved!"
      : `${remainingDays} day${remainingDays === 1 ? "" : "s"} more<br>to a record!`;

    setText("studentStreakProgressTitle", trackerTitle);
    setText("studentStreakProgressMessage", trackerMessage);
    const recordTextTarget = document.getElementById("studentStreakRecordText");
    if (recordTextTarget) recordTextTarget.innerHTML = recordText;
    const recordTarget = document.getElementById("studentStreakRecord");
    if (recordTarget) {
      recordTarget.classList.toggle("record-achieved", remainingDays === 0);
      recordTarget.setAttribute("aria-label", remainingDays === 0
        ? "Seven day weekly record achieved"
        : `${remainingDays} day${remainingDays === 1 ? "" : "s"} remaining to the seven day weekly record`);
    }

    const weekTarget = document.getElementById("dashboardStreakWeek");
    if (!weekTarget) return;
    const flameIcon = `<svg class="streak-day-flame" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M12.4 2.3c.3 2.9-1.1 4.5-2.4 5.9-1.2 1.3-2.3 2.5-2.3 4.5 0 1.3.6 2.4 1.6 3.1-.1-.4-.2-.8-.2-1.2 0-1.6.9-2.8 2.1-3.9.1 1.5.9 2.2 1.7 2.9.8.7 1.5 1.4 1.5 2.7 0 .7-.2 1.4-.6 1.9 1.9-.7 3.3-2.6 3.3-4.8 0-2.8-1.6-5.5-4.7-8.2.1 1.7-.4 2.8-1 3.6.2-2.3-.4-4.4 1-6.5Z"/></svg>`;
    weekTarget.innerHTML = weekDays().map((day) => {
      const active = activeDays.has(day.key);
      const isToday = day.key === today;
      return `
        <div class="student-streak-day ${active ? "active" : ""} ${isToday ? "today" : ""}" title="${escapeAttr(day.fullLabel)} - ${active ? "Active" : "Open"}">
          <span class="student-streak-day-dot" aria-hidden="true">${active ? flameIcon : escapeHtml(day.shortLabel)}</span>
          <span class="student-streak-day-label">${escapeHtml(day.shortLabel)}</span>
        </div>
      `;
    }).join("");
  }

  function renderCourses() {
    const allCourses = enrolledCourses();
    let courses = filteredCourses(allCourses);
    if (state.courseFilter === "active") {
      courses = courses.filter((course) => !isArchivedCourse(course) && courseProgress(course).percent < 100);
    } else if (state.courseFilter === "completed") {
      courses = courses.filter((course) => courseProgress(course).percent >= 100);
    } else if (state.courseFilter === "wishlist") {
      courses = [];
    }

    const categories = [...new Set(allCourses.map((course) => String(course.category || "General").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    if (state.courseCategory !== "all" && !categories.includes(state.courseCategory)) state.courseCategory = "all";
    const categoryMenu = document.getElementById("courseCategoryMenu");
    if (categoryMenu) {
      categoryMenu.innerHTML = ["all", ...categories].map((category) => `
        <button class="${state.courseCategory === category ? "active" : ""}" type="button" data-course-category="${escapeAttr(category)}">
          ${escapeHtml(category === "all" ? "All categories" : category)}
        </button>
      `).join("");
    }
    document.getElementById("courseCategoryToggle")?.classList.toggle("active", state.courseCategory !== "all");

    if (state.courseCategory !== "all") {
      courses = courses.filter((course) => String(course.category || "General") === state.courseCategory);
    }
    if (state.courseSearch) {
      courses = courses.filter((course) => [course.title, course.name, course.description, course.category, course.instructor_name, course.mentor_name]
        .some((value) => String(value || "").toLowerCase().includes(state.courseSearch)));
    }
    courses = [...courses].sort((a, b) => {
      if (state.courseSort === "title") return String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""));
      if (state.courseSort === "progress-desc") return courseProgress(b).percent - courseProgress(a).percent;
      if (state.courseSort === "progress-asc") return courseProgress(a).percent - courseProgress(b).percent;
      return courseEnrollmentTime(b) - courseEnrollmentTime(a);
    });
    const visibleCourses = courses.slice(0, state.courseVisibleCount);
    const target = document.getElementById("coursesGrid");
    target?.classList.toggle("list-layout", state.courseLayout === "list");
    const loadMoreWrap = document.getElementById("courseLoadMoreWrap");
    if (loadMoreWrap) loadMoreWrap.hidden = visibleCourses.length >= courses.length;
    if (state.courseFilter === "wishlist" && !courses.length) {
      if (target) target.innerHTML = emptyState("No wishlist courses yet", "Courses you save for later will appear here.");
      if (loadMoreWrap) loadMoreWrap.hidden = true;
      return;
    }
    renderCourseCards("coursesGrid", visibleCourses, { compact: false }); updateCourseSliderControls();
  }
  function scrollCourseSlider(direction) { const target = document.getElementById("coursesGrid"), card = target?.querySelector(".my-course-card"); if (!target) return; target.scrollBy({ left: direction * (card ? card.getBoundingClientRect().width + 24 : Math.max(280, target.clientWidth * 0.85)), behavior: "smooth" }); window.setTimeout(updateCourseSliderControls, 280); }
  function updateCourseSliderControls() { const target = document.getElementById("coursesGrid"), shell = target?.closest(".student-course-slider-shell"); if (target && shell) shell.classList.toggle("can-scroll", target.scrollWidth > target.clientWidth + 8); }
  function courseEnrollmentTime(course) {
    const enrollment = state.data.userCourses.find((item) => (
      sameId(item.course_id, course.id)
      && sameId(item.user_id || item.student_id || item.learner_id, state.student.id)
      && !item.deleted_at
    ));
    return new Date(enrollment?.created_at || course.created_at || 0).getTime() || 0;
  }

  function recentDashboardCourses(courses) {
    return [...courses]
      .sort((a, b) => courseRecentActivityTime(b) - courseRecentActivityTime(a)
        || courseProgress(b).percent - courseProgress(a).percent
        || String(a.title || a.name || "").localeCompare(String(b.title || b.name || "")))
      .slice(0, 2);
  }

  function courseRecentActivityTime(course) {
    const courseId = String(course?.id || "");
    const accessTimes = storedCourseAccessTimes();
    const times = [
      accessTimes[courseId],
      courseProgress(course).row?.updated_at,
      latestQuizTimeForCourse(course),
      latestSubmissionTimeForCourse(course),
      latestAcademicActivityTimeForCourse(course),
      courseEnrollmentTime(course)
    ].map(timestampValue).filter(Boolean);
    return times.length ? Math.max(...times) : 0;
  }

  function latestQuizTimeForCourse(course) {
    return state.data.quizAttempts
      .filter((attempt) => sameId(attempt.student_id || attempt.user_id, state.student.id) && sameId(attempt.course_id, course.id))
      .reduce((latest, attempt) => Math.max(latest, timestampValue(attempt.submitted_at || attempt.created_at)), 0);
  }

  function latestSubmissionTimeForCourse(course) {
    return state.data.taskSubmissions
      .filter((submission) => (
        sameId(submission.student_id || submission.user_id, state.student.id)
        && !submission.deleted_at
        && sameId(submissionCourseId(submission), course.id)
      ))
      .reduce((latest, submission) => Math.max(latest, timestampValue(submission.submitted_at || submission.created_at)), 0);
  }

  function submissionCourseId(submission) {
    if (submission?.course_id) return submission.course_id;
    const task = state.data.batchTasks.find((item) => sameId(item.id, submission?.task_id));
    if (task?.course_id) return task.course_id;
    const batch = state.data.batches.find((item) => sameId(item.id, submission?.batch_id || task?.batch_id));
    return batch?.course_id || "";
  }

  function latestAcademicActivityTimeForCourse(course) {
    return state.data.academicActivity
      .filter((activity) => sameId(activity.student_id, state.student.id) && sameId(activity.course_id, course.id))
      .reduce((latest, activity) => Math.max(latest, timestampValue(activity.occurred_at || activity.created_at)), 0);
  }

  function recordCourseAccess(courseId) {
    if (!courseId) return;
    const times = storedCourseAccessTimes();
    times[String(courseId)] = Date.now();
    state.courseAccessTimes = times;
    try {
      localStorage.setItem(courseAccessStorageKey(), JSON.stringify(times));
    } catch (error) {
      studentDebug("Recent course access could not be saved locally.", error);
    }
  }

  function storedCourseAccessTimes() {
    if (state.courseAccessTimes) return state.courseAccessTimes;
    try {
      const parsed = JSON.parse(localStorage.getItem(courseAccessStorageKey()) || "{}");
      state.courseAccessTimes = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      state.courseAccessTimes = {};
    }
    return state.courseAccessTimes;
  }

  function courseAccessStorageKey() {
    return `jenovate:student:course-access:${state.student?.id || state.student?.email || "guest"}`;
  }

  function timestampValue(value) {
    if (!value) return 0;
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function renderCourseCards(targetId, courses, options = {}) {
    const target = document.getElementById(targetId);
    if (!target) return;
    if (!courses.length) {
      target.innerHTML = emptyState("No courses found", "Your enrolled courses will appear here when they are assigned.");
      return;
    }

    const cards = courses.map((course, index) => {
      const progress = courseProgress(course);
      const modules = parseModules(course.modules);
      const lessons = flattenCourseLessons(course, modules);
      const title = escapeHtml(course.title || course.name || "Untitled course");
      const thumbnail = escapeAttr(courseDisplayImage(course, index));
      const instructor = escapeHtml(course.instructor_name || course.mentor_name || "Jenovate Mentor");
      const category = escapeHtml(course.category || course.difficulty || "Learning");
      const reviewUrl = String(course.google_form_url || course.review_url || "").trim();
      const actionLabel = progress.percent >= 100 ? "Watch Again" : "Continue Learning";
      return `
        <article class="my-course-card scalable-course-card course-tone-${index % 6} ${options.compact ? "compact-course-card" : ""}" data-course-card-open="${escapeAttr(course.id)}">
          <div class="course-card-media">
            <img class="course-thumb" src="${thumbnail}" alt="">
            <span class="course-category-badge">${category}</span>
            <span class="course-progress-ring" style="--course-progress:${progress.percent * 3.6}deg" aria-label="${progress.percent}% complete"><b>${progress.percent}%</b></span>
          </div>
          <div class="course-card-body">
            <h3>${title}</h3>
            <div class="course-mentor-row"><span class="student-avatar small">${escapeHtml(initialsFor(instructor))}</span><small>${instructor}</small><svg viewBox="0 0 24 24" aria-label="Verified mentor"><path d="m9 12 2 2 4-5"></path><path d="M12 3.5 14.2 5l2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 20l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1Z"></path></svg></div>
            <small class="card-meta"><span>${modules.length || 0} Modules</span><i></i><span>${lessons.length || 0} Lessons</span></small>
            <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
            <div class="card-footer">
              <button class="secondary-btn course-continue-button" type="button" data-open-course="${escapeAttr(course.id)}">${actionLabel}</button>
              ${progress.percent >= 100 && reviewUrl ? `<button class="course-review-link" type="button" data-review-course="${escapeAttr(course.id)}">Review</button>` : ""}
              <button class="course-card-menu" type="button" data-course-detail="${escapeAttr(course.id)}" aria-label="View ${title} details" title="Course details">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
            </div>
          </div>
        </article>
      `;
    });
    target.innerHTML = cards.join("");
  }

  function openCourseDetailModal(courseId) {
    const course = catalogCourses().find((item) => sameId(item.id, courseId))
      || state.data.courses.find((item) => sameId(item.id, courseId));
    if (!course) return;
    const modules = parseModules(course.modules);
    const enrolled = studentCourseIds().has(String(course.id));
    const thumbnail = courseDisplayImage(course, modules.length);
    openModal("Course Details", `
      <div class="course-detail-modal">
        <div class="course-detail-head">
          <img src="${escapeAttr(thumbnail)}" alt="${escapeAttr(course.title || "Course")}">
          <div>
            <span class="pill">${escapeHtml(course.category || course.difficulty || "Course")}</span>
            <h3>${escapeHtml(course.title || "Course")}</h3>
            <p>${escapeHtml(course.description || "No course description available.")}</p>
          </div>
        </div>
        <div class="course-meta-row detail">
          <span>${modules.length} modules</span>
          <span>${modules.filter((module) => moduleQuiz(module)).length} quizzes</span>
          <span>${escapeHtml(course.duration || "Self paced")}</span>
        </div>
        <div class="module-preview-list">
          ${modules.length ? modules.slice(0, 6).map((module, index) => `
            <div>
              <strong>Module ${index + 1}: ${escapeHtml(module.title || module.name || "Lesson module")}</strong>
              <small>${moduleLessons(module).length} lessons${moduleQuiz(module) ? " - includes quiz" : ""}</small>
            </div>
          `).join("") : emptyState("No module preview", "This course has no module data yet.")}
        </div>
        <div class="modal-actions">
          <button class="secondary-btn" type="button" data-close-modal>Close</button>
          ${enrolled
            ? `<button class="primary-btn" type="button" data-open-course="${escapeAttr(course.id)}">Start Learning</button>`
            : `<a class="primary-btn" href="${escapeAttr(courseDetailCheckoutHref(course))}">View & Buy</a>`}
        </div>
      </div>
    `);
  }

  function openCourseReview(courseId) {
    const course = enrolledCourses().find((item) => sameId(item.id, courseId))
      || state.data.courses.find((item) => sameId(item.id, courseId));
    const reviewUrl = String(course?.google_form_url || course?.review_url || "").trim();
    if (!reviewUrl) {
      showAlert("Review form is not available for this course yet.", true);
      return;
    }
    window.open(reviewUrl, "_blank", "noopener");
  }

  function mergeLocalEnrollment(enrollment) {
    const normalized = normalizeEnrollment(enrollment);
    const index = state.data.userCourses.findIndex((item) => (
      sameId(item.user_id || item.student_id || item.learner_id, normalized.user_id)
      && sameId(item.course_id, normalized.course_id)
    ));
    if (index >= 0) {
      state.data.userCourses[index] = { ...state.data.userCourses[index], ...normalized };
    } else {
      state.data.userCourses.push(normalized);
    }
  }

  function registerLmsResource(url, title = "Resource", kind = "file") {
    const id = `lms-resource-${state.resourceHandles.size + 1}`;
    state.resourceHandles.set(id, {
      kind: String(kind || "file"),
      title: String(title || "Resource"),
      url: String(url || "").trim()
    });
    return id;
  }

  function resourceFromHandle(handleOrUrl, fallbackTitle = "Resource", fallbackKind = "file") {
    const value = String(handleOrUrl || "").trim();
    return state.resourceHandles.get(value) || {
      kind: fallbackKind,
      title: fallbackTitle,
      url: value
    };
  }

  function courseStudyResources(course, modules = parseModules(course?.modules)) {
    const resources = [];
    state.resourceHandles.clear();
    modules.forEach((module, moduleIndex) => {
      (module.lessons || []).forEach((lesson, lessonIndex) => {
        const url = lessonMaterialUrl(lesson);
        const type = String(lesson.content_type || "").toLowerCase();
        const looksLikeMaterial = type.includes("material")
          || /\.(pdf|docx?|pptx?|xlsx?|zip|txt)(?:$|\?)/i.test(url);
        if (!url || !looksLikeMaterial) return;
        const ext = (url.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1] || "file").toUpperCase();
        const title = lesson.title || `${module.title || `Module ${moduleIndex + 1}`} Material`;
        const kind = ext.toLowerCase().includes("pdf") ? "pdf" : "file";
        resources.push({
          id: registerLmsResource(url, title, kind),
          title,
          meta: `${module.title || `Module ${moduleIndex + 1}`} - ${lessonDurationLabel(lesson, `Item ${lessonIndex + 1}`)}`,
          label: ext.slice(0, 3),
          kind
        });
      });
    });
    return resources;
  }

  function renderLearn() {
    const surface = document.getElementById("learnSurface");
    const courses = filteredCourses(enrolledCourses());
    if (!surface) return;

    if (!courses.length) {
      cleanupLessonTracker();
      surface.innerHTML = `
        <article class="panel learn-empty-card">
          ${emptyState("No courses yet", "Your enrolled courses will appear here as soon as admin adds you.")}
        </article>
      `;
      return;
    }

    if (!state.selectedCourseId || !courses.some((item) => sameId(item.id, state.selectedCourseId))) {
      state.selectedCourseId = preferredLearningCourse(courses)?.id || courses[0]?.id || "";
    }
    const course = selectedCourse();
    const modules = course ? parseModules(course.modules) : [];
    const lessons = course ? flattenCourseLessons(course, modules) : [];
    if (course && lessons.length && !lessons.some((item) => item.key === state.selectedLessonKey)) {
      state.selectedLessonKey = (lessons.find((item) => item.mediaUrl) || lessons[0]).key;
    }
    const selectedLesson = lessons.find((item) => item.key === state.selectedLessonKey) || lessons[0] || null;
    const selectedModuleNumber = selectedLesson ? selectedLesson.moduleIndex + 1 : 0;
    const selectedLessonNumber = selectedLesson ? selectedLesson.lessonIndex + 1 : 0;
    const progress = courseProgress(course);
    const quizCount = modules.filter((module) => moduleQuiz(module)?.questions?.length).length;
    const cover = courseDisplayImage(course, modules.length);
    const category = course?.category || course?.difficulty || "Development";
    const title = course?.title || course?.name || "Untitled course";
    const description = course?.description || "Study the lessons, complete each module quiz, and keep your progress moving.";
    const activeModule = selectedLesson?.module || modules[0] || null;
    const resources = courseStudyResources(course, modules);
    const selectedTitle = selectedLesson?.lesson?.title || title;
    const instructor = course?.instructor_name || course?.mentor_name || "Jenovate Mentor";
    const activeLessonTab = ["overview", "notes", "resources", "discussion"].includes(state.lessonTab) ? state.lessonTab : "overview";
    const notesText = lessonNotesText(selectedLesson?.lesson, activeModule, course);
    const activeMaterialUrl = lessonMaterialUrl(selectedLesson?.lesson);

    surface.innerHTML = `
      <section class="stitch-learn-main learn-reference-main">
        <header class="stitch-lesson-header">
          <div>
            <span class="learn-kicker">Module ${selectedModuleNumber || 1} - Lesson ${selectedLessonNumber || 1}</span>
            <h2>${escapeHtml(selectedLesson?.lesson?.title || title)}</h2>
            <div class="stitch-lesson-meta">
              <span>${escapeHtml(course?.instructor_name || course?.mentor_name || "Jenovate Mentor")}</span>
              <span>${escapeHtml(course?.difficulty || "Intermediate")}</span>
              <span>${escapeHtml(course?.duration || `${lessons.length || 1} lessons`)}</span>
            </div>
          </div>
          <button class="primary-btn mark-complete-btn" type="button" data-select-lesson="${escapeAttr((selectedLesson || lessons[0])?.key || "")}">
            Mark Complete
          </button>
        </header>

        <div class="lesson-player stitch-video-player reference-video-player" id="lessonPlayer"></div>

        <nav class="lesson-tabs reference-lesson-tabs" aria-label="Lesson tabs">
          <button class="${activeLessonTab === "overview" ? "active" : ""}" type="button" data-lesson-tab="overview">Overview</button>
          <button class="${activeLessonTab === "notes" ? "active" : ""}" type="button" data-lesson-tab="notes">Notes</button>
          <button class="${activeLessonTab === "resources" ? "active" : ""}" type="button" data-lesson-tab="resources">Resources</button>
          <button class="${activeLessonTab === "discussion" ? "active" : ""}" type="button" data-lesson-tab="discussion">Discussion</button>
        </nav>

        <section class="lesson-body-grid lesson-reference-body">
          <article class="lesson-about-card reference-overview-card lesson-tab-panel ${activeLessonTab === "overview" ? "active" : ""}" data-lesson-panel="overview">
            <h3>${escapeHtml(selectedTitle)}</h3>
            <div class="lesson-facts">
              <span>${escapeHtml(lessonDurationLabel(selectedLesson?.lesson, course?.duration || "Self paced"))}</span>
              <span>${escapeHtml(course?.difficulty || "Intermediate")}</span>
              <span>${escapeHtml(category)}</span>
            </div>
            <p>${escapeHtml(selectedLesson?.lesson?.description || description)}</p>
            <div class="learning-outcomes-card">
              <span>WHAT YOU'LL LEARN</span>
              <ul>
                <li>Complete the active lesson in this module.</li>
                <li>Practice with module resources and study material.</li>
                <li>Track progress through course content and quizzes.</li>
                <li>Ask questions when you need mentor support.</li>
              </ul>
            </div>
          </article>
          <article class="lesson-about-card reference-overview-card lesson-tab-panel ${activeLessonTab === "notes" ? "active" : ""}" data-lesson-panel="notes" ${activeLessonTab === "notes" ? "" : "hidden"}>
            <h3>Lesson Notes</h3>
            <p>${escapeHtml(notesText)}</p>
            ${selectedLesson?.lesson?.transcript ? `
              <div class="lesson-notes-box">
                <strong>Transcript</strong>
                <p>${escapeHtml(selectedLesson.lesson.transcript)}</p>
              </div>
            ` : ""}
            ${activeMaterialUrl ? `<button class="primary-btn" type="button" data-open-resource="${escapeAttr(registerLmsResource(activeMaterialUrl, `${selectedTitle} Notes`, "pdf"))}" data-resource-title="${escapeAttr(`${selectedTitle} Notes`)}" data-resource-kind="pdf">Open Study Material</button>` : ""}</article>
          <article class="lesson-resource-card reference-resource-card lesson-tab-panel ${activeLessonTab === "resources" ? "active" : ""}" data-lesson-panel="resources" ${activeLessonTab === "resources" ? "" : "hidden"}>
            <div class="resource-card-head">
              <div>
                <h3>Curated Course Materials</h3>
                <p>Open PDFs and study files inside the learning player.</p>
              </div>
            </div>
            <div class="resource-grid">
              ${resources.length ? resources.map((resource) => `
                <button class="resource-download-card" type="button" data-open-resource="${escapeAttr(resource.id)}" data-resource-title="${escapeAttr(resource.title)}" data-resource-kind="${escapeAttr(resource.kind)}">
                  <span class="resource-icon ${escapeAttr(resource.kind)}">${escapeHtml(resource.label)}</span>
                  <strong>${escapeHtml(resource.title)}</strong>
                  <small>${escapeHtml(resource.meta)}</small>
                  <em>Open</em>
                </button>
              `).join("") : emptyState("No study materials yet", "Optional PDFs and materials added by your mentor will appear here.")}
            </div>
          </article>
          <article class="lesson-about-card reference-overview-card lesson-tab-panel ${activeLessonTab === "discussion" ? "active" : ""}" data-lesson-panel="discussion" ${activeLessonTab === "discussion" ? "" : "hidden"}>
            <h3>Lesson Discussion</h3>
            <p>Ask your mentor or continue the batch discussion for this lesson.</p>
            <div class="lesson-discussion-actions">
              <button class="primary-btn" type="button" data-jump="questions">Open Discussion</button>
              <button class="secondary-btn" type="button" data-jump="batch">Open Batch Chat</button>
            </div>
          </article>
          <article class="lesson-mentor-card lesson-tab-panel ${activeLessonTab === "overview" ? "active" : ""}" data-lesson-panel-extra="overview" ${activeLessonTab === "overview" ? "" : "hidden"}>
            <span class="student-avatar">${escapeHtml(initialsFor(instructor))}</span>
            <div>
              <strong>${escapeHtml(instructor)}</strong>
              <small>${escapeHtml(course?.category || "Course Mentor")}</small>
              <p>Helping you move through the course with practical lessons, materials, and project guidance.</p>
            </div>
            <button class="secondary-btn" type="button" data-jump="questions">Ask</button>
          </article>
          <aside class="lesson-resource-card reference-resource-card lesson-tab-panel ${activeLessonTab === "overview" ? "active" : ""}" data-lesson-panel-extra="overview" ${activeLessonTab === "overview" ? "" : "hidden"}>
            <div class="resource-card-head">
              <div>
                <h3>Curated Course Materials</h3>
                <p>Download assets and study files shared for this course.</p>
              </div>
              ${resources.length ? `<button class="primary-btn" type="button" data-open-resource="${escapeAttr(resources[0].id)}" data-resource-title="${escapeAttr(resources[0].title)}" data-resource-kind="${escapeAttr(resources[0].kind)}">Open Study Material</button>` : ""}
            </div>
            <div class="resource-grid">
              ${resources.length ? resources.slice(0, 4).map((resource) => `
                <button class="resource-download-card" type="button" data-open-resource="${escapeAttr(resource.id)}" data-resource-title="${escapeAttr(resource.title)}" data-resource-kind="${escapeAttr(resource.kind)}">
                  <span class="resource-icon ${escapeAttr(resource.kind)}">${escapeHtml(resource.label)}</span>
                  <strong>${escapeHtml(resource.title)}</strong>
                  <small>${escapeHtml(resource.meta)}</small>
                  <em>Open</em>
                </button>
              `).join("") : emptyState("No study materials yet", "Optional PDFs and materials added by your mentor will appear here.")}
            </div>
          </aside>
        </section>
      </section>

      <aside class="stitch-course-rail reference-course-rail">
        <div class="rail-progress-card">
          <div>
            <strong>Course Content</strong>
            <span>${progress.percent}% Complete</span>
          </div>
          <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
          <button class="primary-btn mark-complete-btn" type="button" data-select-lesson="${escapeAttr((selectedLesson || lessons[0])?.key || "")}">
            Mark as Complete
          </button>
        </div>
        <div class="course-rail-scroll">
          <div class="module-list udemy-modules" id="moduleList"></div>
        </div>
        <footer class="course-rail-footer">
          <div class="circle-progress">${progress.percent}%</div>
          <div>
            <strong>${Math.max(lessons.length - Number(progress.completedLessons || 0), 0)} Lessons Left</strong>
            <small>${progress.percent}% complete</small>
          </div>
          <button class="secondary-btn" type="button" aria-label="More learning actions">More</button>
        </footer>
      </aside>
    `;

    renderLessonPlayer(course, selectedLesson);

    const moduleList = document.getElementById("moduleList");
    if (!moduleList) return;
    if (!course) {
      moduleList.innerHTML = emptyState("Pick a course", "Select a course from the left to view lessons.");
      return;
    }
    if (!modules.length) {
      moduleList.innerHTML = emptyState("No modules yet", "Admin or mentor has not added module content for this course.");
      return;
    }

    moduleList.innerHTML = modules.map((module, index) => {
      const moduleLessons = module.lessons;
      const moduleStart = lessonsBefore(modules, index);
      const moduleStats = moduleProgressFromState(course, modules, index, progress.row);
      const modulePercent = moduleStats.percent;
      const moduleSelected = selectedLesson?.moduleIndex === index;
      return `
        <details class="module-card udemy-module ${moduleSelected ? "active" : ""}" ${moduleSelected || index === 0 ? "open" : ""}>
          <summary class="module-summary">
            <span class="module-summary-main">
              <small>Module ${String(index + 1).padStart(2, "0")}</small>
              <strong>${escapeHtml(module.title || `Module ${index + 1}`)}</strong>
              ${module.description ? `<em>${escapeHtml(module.description)}</em>` : ""}
            </span>
            <span class="rail-chevron">v</span>
          </summary>
          <div class="module-progress">
            <span style="width:${modulePercent}%"></span>
          </div>
          ${moduleLessons.length ? `<ul class="lesson-list">
            ${moduleLessons.map((lesson, lessonIndex) => {
        const order = moduleStart + lessonIndex + 1;
        const key = lessonKey(course.id, index, lessonIndex, lesson);
        const mediaUrl = lessonMediaUrl(lesson);
        const isSelected = key === state.selectedLessonKey;
        const lessonStats = lessonProgressFromState(progress.row, {
          key,
          course,
          module,
          moduleIndex: index,
          lesson,
          lessonIndex,
          order,
          mediaUrl
        });
        const done = lessonStats.completed || legacyOrderCompleted(progress.row?.completed_lessons, order);
        return `
                <li class="${isSelected ? "active" : ""}">
                  <button class="lesson-play-dot ${done ? "done" : ""}" type="button" data-select-lesson="${escapeAttr(key)}" aria-label="Open lesson ${escapeAttr(lesson.title || lessonIndex + 1)}">
                    ${done ? "OK" : mediaUrl ? "Play" : "-"}
                  </button>
                  <span>
                    <strong>${lessonIndex + 1}. ${escapeHtml(lesson.title || `Lesson ${lessonIndex + 1}`)}</strong>
                    <small>${escapeHtml(lessonDurationLabel(lesson, "Video lesson"))}</small>
                  </span>
                  <span class="lesson-actions">
                  </span>
                </li>
              `;
      }).join("")}
          </ul>` : emptyState("No lessons yet", "This module has been created, but no lesson content is attached yet.")}
          ${moduleQuizBlock(course, module, index)}
        </details>
      `;
    }).join("");
  }

  function renderLearnFallback(error) {
    const surface = document.getElementById("learnSurface");
    if (!surface) return;
    cleanupLessonTracker();
    surface.innerHTML = `
      <article class="panel learn-empty-card">
        ${emptyState("Learning player needs attention", escapeHtml(error?.message || "Refresh data to load the course player again."))}
      </article>
    `;
  }

  function renderLessonPlayer(course, lessonItem) {
    cleanupLessonTracker();
    updateLessonProgressStatus(null);
    const target = document.getElementById("lessonPlayer");
    if (!target) return;
    if (!course) {
      target.innerHTML = emptyState("Choose a course", "Select an enrolled course to open its lessons.");
      return;
    }
    if (!parseModules(course.modules).length) {
      target.innerHTML = emptyState("No modules yet", "Admin or mentor has not added module content for this course.");
      return;
    }
    if (!lessonItem) {
      target.innerHTML = emptyState("No lessons yet", "Lessons and videos added by your mentor will appear here.");
      return;
    }

    const lesson = lessonItem.lesson;
    const mediaUrl = lessonItem.mediaUrl;
    const contentType = String(lesson.content_type || "video").toLowerCase();
    const contentLabel = contentType === "study_material" ? "Study Material"
      : contentType === "assignment" ? "Assignment"
        : contentType === "quiz" ? "Quiz"
          : "Video";
    const playableUrl = contentService.isProviderUrl?.(mediaUrl) ? mediaUrl : contentService.directProviderContentUrl?.(mediaUrl) || mediaUrl;
    const embedUrl = mediaEmbedUrl(mediaUrl);
    const directVideo = contentType === "video" && playableUrl && isDirectVideoUrl(playableUrl);
    const documentEmbedUrl = !directVideo && playableUrl ? resourcePreviewUrl(playableUrl, contentType) : "";
    const description = lesson.description || lesson.transcript || lessonItem.module.description || course.description || "";
    const moduleLabel = `Module ${lessonItem.moduleIndex + 1}: ${lessonItem.module.title || "Untitled module"}`;
    const lessonLabel = `Lesson ${lessonItem.lessonIndex + 1}`;
    const canSeek = Boolean(directVideo);

    target.innerHTML = `
      <div class="player-header">
        <div>
          <span>${escapeHtml(`${moduleLabel} - ${contentLabel} ${lessonItem.lessonIndex + 1}`)}</span>
          <h3>${escapeHtml(lesson.title || "Lesson")}</h3>
        </div>
        ${playableUrl ? `<button class="secondary-btn" type="button" data-lesson-fullscreen>Full Screen</button>` : ""}
      </div>
      <div class="media-frame" data-player-direct="${directVideo ? "true" : "false"}" data-player-title="${escapeAttr(lesson.title || "Lesson")}">
        ${directVideo ? `
          <video playsinline preload="metadata" src="${escapeAttr(playableUrl)}"></video>
        ` : embedUrl ? `
          <iframe src="${escapeAttr(embedUrl)}" title="${escapeAttr(lesson.title || "Lesson video")}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
        ` : documentEmbedUrl ? `
          <iframe src="${escapeAttr(documentEmbedUrl)}" title="${escapeAttr(lesson.title || "Lesson material")}" allow="fullscreen" allowfullscreen></iframe>
        ` : `
          <div class="media-empty">
            <strong>${playableUrl ? `${escapeHtml(contentLabel)} temporarily unavailable` : `No ${escapeHtml(contentLabel.toLowerCase())} attached`}</strong>
            <p>${escapeHtml(playableUrl ? LMS_MESSAGES.video : "Your mentor has not attached this lesson yet.")}</p>
          </div>
        `}
        ${directVideo ? `
          <button class="lesson-fullscreen-launch" type="button" data-lesson-fullscreen aria-label="Open lesson in full screen">Full Screen</button>
          <div class="lesson-video-controls" aria-label="Lesson player controls">
            <div class="lesson-control-progress" aria-hidden="true">
              <span class="lesson-control-buffer"></span>
              <span class="lesson-control-played" data-lesson-played></span>
            </div>
            <div class="lesson-control-row">
              <div class="lesson-control-left">
                <button class="lesson-icon-control lesson-play-toggle" type="button" data-lesson-toggle-play ${canSeek ? "" : "disabled"} aria-label="Play lesson">
                  <span data-lesson-play-icon>Play</span>
                </button>
                <button class="lesson-icon-control" type="button" data-lesson-toggle-mute ${canSeek ? "" : "disabled"} aria-label="Mute lesson">Audio</button>
                <span class="lesson-time-readout" data-lesson-time>0:00 / 0:00</span>
              </div>
              <div class="lesson-control-right">
                <button class="lesson-icon-control" type="button" data-lesson-seek="-10" ${canSeek ? "" : "disabled"} aria-label="Rewind 10 seconds">-10</button>
                <button class="lesson-icon-control" type="button" data-lesson-seek="10" ${canSeek ? "" : "disabled"} aria-label="Forward 10 seconds">+10</button>
                ${[0.75, 1, 1.25, 1.5, 2].map((speed) => `<button class="lesson-speed-chip ${speed === 1 ? "active" : ""}" type="button" data-lesson-speed="${speed}" ${canSeek ? "" : "disabled"}>${speed}x</button>`).join("")}
                <button class="lesson-icon-control" type="button" data-lesson-fullscreen aria-label="Open fullscreen">Full</button>
              </div>
            </div>
          </div>
        ` : ""}
      </div>
      <div class="player-description">
        <strong>Description</strong>
        <p>${escapeHtml(description || "No description added for this lesson.")}</p>
      </div>
    `;

    updateLessonProgressStatus(lessonProgressFromState(courseProgress(course).row, lessonItem));
    attachLessonProgressTracker(course, lessonItem, { directVideo, embedUrl: embedUrl || documentEmbedUrl });
    initializeLessonVideoControls();
  }

  function updateLessonTabPanels() {
    const activeTab = ["overview", "notes", "resources", "discussion"].includes(state.lessonTab) ? state.lessonTab : "overview";
    document.querySelectorAll("[data-lesson-tab]").forEach((button) => {
      const active = button.dataset.lessonTab === activeTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-lesson-panel]").forEach((panel) => {
      const active = panel.dataset.lessonPanel === activeTab;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    document.querySelectorAll("[data-lesson-panel-extra]").forEach((panel) => {
      const active = panel.dataset.lessonPanelExtra === activeTab;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function seekActiveLessonVideo(deltaSeconds) {
    const video = document.querySelector("#lessonPlayer video");
    if (!video || !Number.isFinite(deltaSeconds)) return;
    video.currentTime = clamp((video.currentTime || 0) + deltaSeconds, 0, Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER);
    updateLessonVideoControls(video);
  }

  function toggleActiveLessonVideo() {
    const video = document.querySelector("#lessonPlayer video");
    if (!video) return;
    if (video.paused) {
      video.play?.().catch(() => {});
    } else {
      video.pause?.();
    }
    updateLessonVideoControls(video);
  }

  function toggleActiveLessonMute() {
    const video = document.querySelector("#lessonPlayer video");
    if (!video) return;
    video.muted = !video.muted;
    updateLessonVideoControls(video);
  }

  function setActiveLessonSpeed(rate) {
    const video = document.querySelector("#lessonPlayer video");
    if (!video || !Number.isFinite(rate) || rate <= 0) return;
    video.playbackRate = rate;
    document.querySelectorAll("[data-lesson-speed]").forEach((button) => {
      button.classList.toggle("active", Number(button.dataset.lessonSpeed) === rate);
    });
  }

  function initializeLessonVideoControls() {
    const video = document.querySelector("#lessonPlayer video");
    if (!video) return;
    ["loadedmetadata", "timeupdate", "durationchange", "play", "pause", "volumechange", "progress"].forEach((eventName) => {
      video.addEventListener(eventName, () => updateLessonVideoControls(video));
    });
    updateLessonVideoControls(video);
  }

  function updateLessonVideoControls(video) {
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const percent = duration ? clamp((current / duration) * 100, 0, 100) : 0;
    const bufferedEnd = video.buffered?.length ? video.buffered.end(video.buffered.length - 1) : 0;
    const bufferedPercent = duration ? clamp((bufferedEnd / duration) * 100, 0, 100) : 0;
    document.querySelector("[data-lesson-played]")?.style.setProperty("width", `${percent}%`);
    document.querySelector(".lesson-control-buffer")?.style.setProperty("width", `${bufferedPercent}%`);
    const timeReadout = document.querySelector("[data-lesson-time]");
    if (timeReadout) timeReadout.textContent = `${formatVideoTime(current)} / ${formatVideoTime(duration)}`;
    const playIcon = document.querySelector("[data-lesson-play-icon]");
    if (playIcon) playIcon.textContent = video.paused ? "Play" : "Pause";
    const playButton = document.querySelector("[data-lesson-toggle-play]");
    if (playButton) playButton.setAttribute("aria-label", video.paused ? "Play lesson" : "Pause lesson");
    const muteButton = document.querySelector("[data-lesson-toggle-mute]");
    if (muteButton) {
      muteButton.textContent = video.muted || video.volume === 0 ? "Muted" : "Audio";
      muteButton.setAttribute("aria-label", video.muted || video.volume === 0 ? "Unmute lesson" : "Mute lesson");
    }
  }

  function formatVideoTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds || 0)));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remainingSeconds = value % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  async function openLessonFullscreen() {
    const frame = document.querySelector("#lessonPlayer .media-frame");
    if (!frame) return;
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (fullscreenElement) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        await exitFullscreen?.call(document);
      } catch (_) {}
      return;
    }

    const requestFullscreen = frame.requestFullscreen || frame.webkitRequestFullscreen;
    if (!requestFullscreen) return;
    try {
      await requestFullscreen.call(frame);
    } catch (_) {}
  }

  async function openResourcePreview(url, title = "Resource", kind = "") {
    const resource = resourceFromHandle(url, title, kind || "file");
    if (!resource.url) return;
    const displayTitle = resource.title || title || "Study Material";
    const displayKind = resource.kind || kind || "file";
    const loadingHtml = (heading, message, close = false) => `
      <div class="resource-preview-modal"><div class="resource-preview-loading">
        <strong>${escapeHtml(heading)}</strong><p>${escapeHtml(message)}</p>
        ${close ? `<button class="secondary-btn" type="button" data-close-modal>Close</button>` : ""}
      </div></div>`;
    openModal(displayTitle, loadingHtml("Opening study material...", "Please wait while your file is prepared."));
    modal?.classList.add("resource-modal");

    const resolvedRaw = await resolveResourceUrl(resource.url), unresolvedBarePath = isBareStorageMaterialPath(resource.url) && String(resolvedRaw || "").replace(/^\/+/, "") === String(resource.url || "").trim().replace(/^\/+/, "");
    const resolvedUrl = normalizePreviewUrl(resolvedRaw);
    const previewUrl = unresolvedBarePath ? "" : resourcePreviewUrl(resolvedUrl, displayKind);
    if (!previewUrl) {
      modalBody.innerHTML = loadingHtml("Study material temporarily unavailable", LMS_MESSAGES.material, true);
      return;
    }
    modalBody.innerHTML = `
      <div class="resource-preview-modal">
        <iframe src="${escapeAttr(previewUrl)}" title="${escapeAttr(displayTitle)}" allow="fullscreen" allowfullscreen></iframe>
        <div class="resource-preview-actions">
          <a class="primary-btn" href="${escapeAttr(resourceDownloadUrl(resolvedUrl))}" target="_blank" rel="noopener" download>Download PDF</a>
          <button class="secondary-btn" type="button" data-close-modal>Close</button>
        </div>
      </div>
    `;
  }

  async function resolveResourceUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    try {
      const resolveAssetUrl = window.resolveLmsAssetUrl;
      if (resolveAssetUrl) {
        const resolved = await resolveAssetUrl(raw);
        if (resolved && resolved !== raw) return resolved;
      }
      const createSignedAssetUrl = window.createLmsSignedAssetUrl;
      if (createSignedAssetUrl && isBareStorageMaterialPath(raw)) {
        return await createSignedAssetUrl("study-materials", raw.replace(/^\/+/, ""));
      }
    } catch (error) {
      studentDebug("Study material could not be prepared.", error);
    }
    return raw;
  }

  function isBareStorageMaterialPath(value) {
    const text = String(value || "").trim();
    if (!text || /^[a-z][a-z0-9+.-]*:/i.test(text)) return false;
    if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(text)) return false;
    return /\.(pdf|docx?|pptx?|xlsx?|zip|txt)(?:$|\?|#)/i.test(text)
      || /^[0-9a-f-]{20,}\//i.test(text.replace(/^\/+/, ""));
  }

  function normalizePreviewUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    try {
      const current = new URL(window.location.href);
      const prepared = /^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(raw) ? `${current.protocol}//${raw}` : raw;
      const parsed = new URL(prepared, window.location.href);
      const isLoopback = ["127.0.0.1", "localhost"].includes(parsed.hostname);
      if (isLoopback) {
        parsed.protocol = current.protocol;
        parsed.hostname = current.hostname;
        parsed.port = current.port;
        return parsed.toString();
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  function resourceDownloadUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    return contentService.isProviderUrl?.(raw) ? contentService.directProviderContentUrl?.(raw) || raw : raw;
  }

  function lessonNotesText(lesson, module, course) {
    return [
      lesson?.notes,
      lesson?.note,
      lesson?.summary,
      lesson?.description,
      module?.notes,
      module?.description,
      course?.notes,
      course?.description
    ].map((item) => String(item || "").trim()).find(Boolean)
      || "No mentor notes have been added for this lesson yet.";
  }

  function moduleQuizBlock(course, module, moduleIndex) {
    const quiz = moduleQuiz(module);
    if (!quiz || !quiz.questions.length) return "";
    const best = bestQuizAttempt(course.id, module.id, quiz.id);
    const attemptQuestionsCount = Math.min(Number(quiz.random_count || 15) || 15, quiz.questions.length);
    const sampleQuestions = quiz.questions.slice(0, attemptQuestionsCount);
    const totalMarks = sampleQuestions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
    const passMarks = quizAttemptPassMarks(quiz, totalMarks);
    return `
      <div class="module-quiz-card">
        <span class="quiz-icon">Quiz</span>
        <div>
          <strong>${escapeHtml(quiz.title || "Module Quiz")}</strong>
          <small>${attemptQuestionsCount} questions - ${totalMarks} marks${passMarks ? ` - Pass ${passMarks}` : ""}</small>
          ${best ? `<small>Best score: ${Number(best.score || 0)}/${Number(best.max_score || best.total || totalMarks)}</small>` : ""}
        </div>
        <button class="primary-btn" type="button" data-start-quiz data-course-id="${escapeAttr(course.id)}" data-module-index="${moduleIndex}">
          ${best ? "Retake Quiz" : "Start Quiz"}
        </button>
      </div>
    `;
  }

  function openStudentQuiz(courseId, moduleIndex) {
    const course = state.data.courses.find((item) => sameId(item.id, courseId));
    const modules = parseModules(course?.modules);
    const module = modules[moduleIndex];
    const quiz = moduleQuiz(module);
    if (!course || !module || !quiz || !quiz.questions.length) {
      showAlert("This module does not have a quiz yet.", true);
      return;
    }
    if (String(quiz.status || "published").toLowerCase() !== "published") {
      showAlert("This quiz is not published yet.", true);
      return;
    }
    if (quiz.questions.length < 15) return showAlert("This quiz needs at least 15 questions before students can attempt it.", true);
    const priorAttempts = quizAttemptsFor(course.id, module.id, quiz.id);
    const maxAttempts = Number(quiz.max_attempts || 0);
    if (maxAttempts > 0 && priorAttempts.length >= maxAttempts) {
      showAlert(`You have used all ${maxAttempts} allowed attempt${maxAttempts === 1 ? "" : "s"} for this quiz.`, true);
      return;
    }

    const shuffled = [...quiz.questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const configuredCount = Number(quiz.random_count || 15) || 15;
    const attemptQuestions = shuffled.slice(0, Math.min(configuredCount, shuffled.length));
    const totalMarks = attemptQuestions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
    const passMarks = quizAttemptPassMarks(quiz, totalMarks);
    const best = bestQuizAttempt(course.id, module.id, quiz.id);
    const timerSeconds = Math.max(0, Number(quiz.timer_minutes || 0)) * 60;
    openModal(quiz.title || `${course.title || "Course"} Quiz`, `
      <form class="quiz-attempt-form stitch-quiz-screen" id="quizAttemptForm">
        <header class="quiz-shell-header">
          <div>
            <span class="quiz-kicker">Knowledge Check</span>
            <h2>${escapeHtml(quiz.title || `${course.title || "Course"} Quiz`)}</h2>
            <p>${escapeHtml(course.title || "Course")} - ${escapeHtml(module.title || "Module")}</p>
          </div>
          <button class="quiz-exit-btn" type="button" data-close-modal aria-label="Close quiz">Close</button>
        </header>
        <div class="quiz-progress-strip">
          <span>Question 01 of ${String(attemptQuestions.length).padStart(2, "0")}</span>
          <div><i style="width:${Math.max(1, Math.round(100 / Math.max(attemptQuestions.length, 1)))}%"></i></div>
          <small>${timerSeconds ? formatQuizTime(timerSeconds) : `${Math.round(100 / Math.max(attemptQuestions.length, 1))}% Completed`}</small>
        </div>
        <section class="quiz-main-card">
          ${attemptQuestions.map((question, index) => `
            <fieldset class="quiz-question ${index === 0 ? "active" : ""}">
              <span class="quiz-topic">${escapeHtml(module.title || "Architecture Design")}</span>
              <legend>${escapeHtml(question.text)}</legend>
              ${["A", "B", "C", "D"].map((key) => {
      const text = question[`option_${key.toLowerCase()}`];
      if (!text) return "";
      return `
                  <label class="quiz-option">
                    <input type="radio" name="quiz_${index}" value="${key}">
                    <span></span>
                    <strong>${escapeHtml(text)}</strong>
                  </label>
                `;
    }).join("")}
            </fieldset>
          `).join("")}
          <div class="modal-actions quiz-actions">
            <button class="secondary-btn" type="button" data-quiz-prev>&lsaquo; Previous</button>
            <button class="primary-btn" type="button" data-quiz-next>Next Question &rsaquo;</button>
          </div>
        </section>
        <aside class="quiz-overview-panel">
          <span class="quiz-kicker">Overview</span>
          <h3>${attemptQuestions.length} Questions</h3>
          <div class="quiz-legend">
            <span>Answered</span><span>Current</span>
          </div>
          <div class="quiz-number-grid">
            ${Array.from({ length: attemptQuestions.length }, (_, index) => `
              <button type="button" data-quiz-jump="${index}" class="${index === 0 ? "current" : ""}">${index + 1}</button>
            `).join("")}
          </div>
          <div class="quiz-help-card">
            <strong>${timerSeconds ? "Timer Active" : "No Timer"}</strong>
            <p>${timerSeconds ? "This quiz will auto-submit when the timer ends." : "Complete every question before submitting."}</p>
          </div>
          <div class="quiz-help-card">
            <strong>Attempt Rules</strong>
            <p>${priorAttempts.length}${maxAttempts ? ` / ${maxAttempts}` : ""} used. Pass marks: ${passMarks}/${totalMarks}.</p>
          </div>
        </aside>
        <button class="submit-quiz-btn" type="submit">Submit Quiz</button>
      </form>
    `);

    const form = document.getElementById("quizAttemptForm");
    if (form) {
      form._attemptQuestions = attemptQuestions; form.dataset.startedAt = String(Date.now());
      wireQuizAttemptControls(form, attemptQuestions.length, timerSeconds);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const unansweredIndex = attemptQuestions.findIndex((_, index) => !form.querySelector(`[name="quiz_${index}"]:checked`));
        if (unansweredIndex !== -1) {
          form._setQuizIndex?.(unansweredIndex);
          showAlert(`Answer question ${unansweredIndex + 1} before submitting.`, true);
          return;
        }
        submitQuizAttempt(course, module, quiz, form);
      });
    }
  }

  function wireQuizAttemptControls(form, totalQuestions, timerSeconds = 0) {
    const questions = Array.from(form.querySelectorAll(".quiz-question"));
    const overviewButtons = Array.from(form.querySelectorAll("[data-quiz-jump]"));
    const progressLabel = form.querySelector(".quiz-progress-strip span");
    const progressBar = form.querySelector(".quiz-progress-strip i");
    const progressPercent = form.querySelector(".quiz-progress-strip small");
    const previousButton = form.querySelector("[data-quiz-prev]");
    const nextButton = form.querySelector("[data-quiz-next]");
    let currentIndex = 0;

    const isAnswered = (index) => Boolean(form.querySelector(`[name="quiz_${index}"]:checked`));
    const render = () => {
      const answeredCount = questions.filter((_, index) => isAnswered(index)).length;
      const percent = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

      questions.forEach((question, index) => {
        question.classList.toggle("active", index === currentIndex);
      });
      overviewButtons.forEach((button, index) => {
        button.classList.toggle("current", index === currentIndex);
        button.classList.toggle("answered", isAnswered(index));
      });
      if (progressLabel) progressLabel.textContent = `Question ${String(currentIndex + 1).padStart(2, "0")} of ${String(totalQuestions).padStart(2, "0")}`;
      if (progressBar) progressBar.style.width = `${Math.max(percent, 1)}%`;
      if (progressPercent && !timerSeconds) progressPercent.textContent = `${percent}% Completed`;
      if (previousButton) previousButton.disabled = currentIndex === 0;
      if (nextButton) nextButton.disabled = currentIndex === totalQuestions - 1;
    };

    form._setQuizIndex = (index) => {
      currentIndex = Math.min(Math.max(Number(index) || 0, 0), Math.max(totalQuestions - 1, 0));
      render();
    };

    previousButton?.addEventListener("click", () => form._setQuizIndex(currentIndex - 1));
    nextButton?.addEventListener("click", () => form._setQuizIndex(currentIndex + 1));
    overviewButtons.forEach((button) => {
      button.addEventListener("click", () => form._setQuizIndex(button.dataset.quizJump));
    });
    form.addEventListener("change", (event) => {
      if (event.target?.matches?.('input[type="radio"][name^="quiz_"]')) render();
    });
    if (timerSeconds && progressPercent) {
      const endsAt = Date.now() + timerSeconds * 1000;
      const timer = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        progressPercent.textContent = formatQuizTime(remaining);
        if (remaining <= 0) {
          window.clearInterval(timer);
          if (document.body.contains(form)) {
            showAlert("Quiz time is up. Submitting your answers now.", true);
            form.requestSubmit();
          }
        }
      }, 1000);
      form.addEventListener("submit", () => window.clearInterval(timer), { once: true });
    }

    render();
  }

  async function submitQuizAttempt(course, module, quiz, form) {
    const answers = {};
    const questionsToEvaluate = form._attemptQuestions || quiz.questions;
    const results = questionsToEvaluate.map((question, index) => {
      const answer = form.querySelector(`[name="quiz_${index}"]:checked`)?.value || "";
      const correct = normalizeAnswerKey(question.answer);
      const earned = answer === correct ? Number(question.marks || 1) : 0;
      answers[question.id || `q${index + 1}`] = answer;
      return { question, answer, correct, earned };
    });
    const score = results.reduce((sum, result) => sum + result.earned, 0);
    const maxScore = questionsToEvaluate.reduce((sum, question) => sum + Number(question.marks || 1), 0);
    const passMarks = quizAttemptPassMarks(quiz, maxScore);
    const passed = score >= passMarks;
    const timeTakenSeconds = Math.max(1, Math.round((Date.now() - Number(form.dataset.startedAt || Date.now())) / 1000));

    let saveMessage = "";
    try {
      const selectedQuestionIds = questionsToEvaluate.map((question, index) => question.id || `q${index + 1}`);
      await saveQuizAttempt(course, module, quiz, { score, maxScore, passed, answers, timeTakenSeconds, questionCount: questionsToEvaluate.length, selectedQuestionIds });
      await saveQuizProgress(course, score, maxScore, passed);
      await loadAllData({ silent: true });
    } catch (error) {
      saveMessage = /student_quiz_attempts|schema cache|relation|could not find/i.test(error.message || "")
        ? "Leaderboard saving is temporarily unavailable. Your attempt is still recorded locally."
        : error.message || "Quiz score calculated, but saving failed.";
      showAlert(saveMessage, true);
    }

    const scorePercent = maxScore ? Math.round((score / maxScore) * 100) : 0;
    const correctCount = results.filter((result) => result.earned).length;
    openModal("Quiz Result", `
      <div class="quiz-result-card quiz-result-refresh ${passed ? "passed" : "failed"}">
        <section class="quiz-result-hero">
          <div class="quiz-result-ring" style="--quiz-result-score:${scorePercent * 3.6}deg">
            <strong>${scorePercent}%</strong>
            <small>${score}/${maxScore}</small>
          </div>
          <div>
            <span class="pill ${passed ? "success" : "warning"}">${passed ? "Passed" : "Needs Practice"}</span>
            <h3>${escapeHtml(quiz.title || "Module Quiz")}</h3>
            <p>${passed ? "Strong work. Your attempt has been recorded." : "Keep going. Review the lesson and try again when you are ready."}</p>
          </div>
        </section>
        <div class="quiz-result-stats">
          <div><small>Score</small><strong>${score}/${maxScore}</strong></div>
          <div><small>Correct</small><strong>${correctCount}/${results.length}</strong></div>
          <div><small>Pass Mark</small><strong>${passMarks}/${maxScore}</strong></div>
          <div><small>Time Taken</small><strong>${formatDuration(timeTakenSeconds)}</strong></div>
        </div>
        ${saveMessage ? `<p class="quiz-save-warning">${escapeHtml(saveMessage)}</p>` : ""}
        <div class="quiz-review-list">
          ${results.map((result, index) => `
            <div class="quiz-review-item ${result.earned ? "correct" : "wrong"}">
              <span>${result.earned ? "OK" : "Try"}</span>
              <div>
                <strong>Q${index + 1}. ${escapeHtml(truncate(result.question.text || "Question", 130))}</strong>
                <p>${result.earned
                  ? `Correct. Your answer: ${escapeHtml(result.answer || "None")}.`
                  : `Your answer: ${escapeHtml(result.answer || "None")}. The correct answer is hidden for retakes.`}</p>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="quiz-result-actions">
          <button class="secondary-btn" type="button" data-close-modal>Back to Lesson</button>
          <button class="primary-btn" type="button" data-start-quiz data-course-id="${escapeAttr(course.id)}" data-module-index="${parseModules(course.modules).findIndex((item) => sameId(item.id, module.id))}">Start Another Attempt</button>
        </div>
      </div>
    `);
    renderLearn();
  }

  async function saveQuizAttempt(course, module, quiz, result) {
    const attempts = state.data.quizAttempts.filter((attempt) => (
      sameId(attempt.student_id || attempt.user_id, state.student.id)
      && sameId(attempt.course_id, course.id)
      && sameId(attempt.module_id, module.id)
    ));
    const passScore = quizAttemptPassMarks(quiz, result.maxScore);
    const fullPayload = {
      student_id: state.student.id,
      course_id: course.id,
      module_id: module.id,
      quiz_id: quiz.id,
      score: result.score,
      total: result.maxScore,
      pass_score: passScore,
      max_score: result.maxScore,
      passed: result.passed,
      attempt_number: attempts.length + 1,
      answers: result.answers,
      time_taken_seconds: result.timeTakenSeconds, duration_seconds: result.timeTakenSeconds,
      question_count: result.questionCount, selected_question_ids: result.selectedQuestionIds,
      submitted_at: new Date().toISOString()
    };
    const legacyPayload = {
      student_id: state.student.id,
      course_id: course.id,
      module_id: module.id,
      module_order: Number(module.order_index || 0) || null,
      module_title: module.title || null,
      score: result.score,
      total: result.maxScore,
      pass_score: passScore,
      passed: result.passed,
      attempt_number: attempts.length + 1,
      created_at: new Date().toISOString()
    };
    const compactLegacyPayload = {
      student_id: state.student.id,
      course_id: course.id,
      score: result.score,
      total: result.maxScore,
      pass_score: passScore,
      passed: result.passed,
      attempt_number: attempts.length + 1,
      created_at: new Date().toISOString()
    };
    await insertFirstWorking("student_quiz_attempts", [fullPayload, legacyPayload, compactLegacyPayload]);
    state.data.quizAttempts = mergeRowsById(state.data.quizAttempts, [{
      id: `local-quiz-${Date.now()}`,
      ...fullPayload,
      total: result.maxScore,
      pass_score: passScore,
      attempt_number: attempts.length + 1,
      created_at: fullPayload.submitted_at
    }]);
  }

  async function saveQuizProgress(course, score, maxScore, passed) {
    const progress = courseProgress(course);
    const percent = maxScore ? Math.round((score / maxScore) * 100) : 0;
    const payload = {
      student_id: state.student.id,
      course_id: course.id,
      completed_lessons: Array.isArray(progress.row?.completed_lessons) ? progress.row.completed_lessons : [],
      completed_modules: Array.isArray(progress.row?.completed_modules) ? progress.row.completed_modules : [],
      quiz_completed: passed,
      quiz_score: percent,
      updated_at: new Date().toISOString()
    };
    const { error } = await getClient().from("student_course_progress").upsert(payload, { onConflict: "student_id,course_id" });
    if (error && !isSchemaShapeError(error)) throw error;
  }

  function renderTasks() {
    const select = document.getElementById("taskBatchFilter");
    const batches = scopedBatches();
    if (select) {
      select.innerHTML = `<option value="">All batches</option>${batches.map((batch) => (
        `<option value="${escapeAttr(batch.id)}" ${sameId(batch.id, state.selectedBatchId) ? "selected" : ""}>${escapeHtml(batch.name || "Batch")}</option>`
      )).join("")}`;
    }

    let tasks = scopedTasks();
    if (state.selectedBatchId) {
      tasks = tasks.filter((task) => sameId(task.batch_id, state.selectedBatchId));
    }
    tasks = filteredRecords(tasks, ["title", "description"]);

    const taskListEl = document.getElementById("taskList");
    const taskMainEl = document.getElementById("taskMain");
    if (!taskListEl || !taskMainEl) return;

    const taskBuckets = {
      pending: tasks.filter((task) => !submissionForTask(task.id)),
      submitted: tasks.filter((task) => {
        const submission = submissionForTask(task.id);
        return submission && !isReviewedSubmission(submission);
      }),
      reviewed: tasks.filter((task) => {
        const submission = submissionForTask(task.id);
        return submission && isReviewedSubmission(submission);
      })
    };

    if (!taskBuckets[state.taskFilter]?.length) {
      state.taskFilter = taskBuckets.pending.length ? "pending"
        : taskBuckets.submitted.length ? "submitted"
          : taskBuckets.reviewed.length ? "reviewed"
            : "pending";
      state.selectedTaskId = "";
    }

    document.querySelectorAll("#tasksView [data-task-filter]").forEach((btn) => {
      const active = btn.dataset.taskFilter === state.taskFilter;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    const pendingCount = taskBuckets.pending.length;
    const pendingBadge = document.getElementById("tasksTabBadgePending");
    if (pendingBadge) {
      pendingBadge.textContent = pendingCount;
    }

    const visibleTasks = taskBuckets[state.taskFilter] || taskBuckets.pending;
    const activeTask = visibleTasks.find((task) => sameId(task.id, state.selectedTaskId)) || visibleTasks[0] || tasks[0];
    state.selectedTaskId = activeTask?.id || "";

    if (!visibleTasks.length) {
      taskListEl.innerHTML = emptyState("No tasks in this tab", "Switch tabs to view other assigned or submitted work.");
    } else {
      taskListEl.innerHTML = visibleTasks.map((task) => {
        const submission = submissionForTask(task.id);
        const batch = state.data.batches.find((item) => sameId(item.id, task.batch_id));
        const selected = sameId(task.id, activeTask?.id);

        let statusLabel = "PENDING";
        let statusClass = "pending";
        let dueLabel = "";

        if (submission) {
          if (isReviewedSubmission(submission)) {
            statusLabel = "REVIEWED";
            statusClass = "reviewed";
          } else {
            statusLabel = "SUBMITTED";
            statusClass = "submitted";
          }
          dueLabel = formatDate(submission.submitted_at || submission.created_at);
        } else {
          if (task.deadline) {
            const deadlineDate = new Date(task.deadline);
            const today = new Date();
            const diffTime = deadlineDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
              statusLabel = "OVERDUE";
              statusClass = "overdue";
              dueLabel = "LATE";
            } else if (diffDays <= 3) {
              statusLabel = "IN PROGRESS";
              statusClass = "in-progress";
              dueLabel = `Due: ${diffDays} Day${diffDays === 1 ? "" : "s"}`;
            } else if (diffDays <= 10) {
              statusLabel = "UPCOMING";
              statusClass = "upcoming";
              dueLabel = `Due: ${diffDays} Days`;
            } else {
              statusLabel = "PENDING";
              statusClass = "pending";
              dueLabel = `Due: ${diffDays} Days`;
            }
          } else {
            statusLabel = "PENDING";
            statusClass = "pending";
            dueLabel = "No deadline";
          }
        }

        const assignedDateStr = task.created_at ? formatDate(task.created_at) : "Not scheduled";

        return `
          <article class="task-card ${selected ? "active" : ""}" data-select-task="${escapeAttr(task.id)}" tabindex="0">
            <div class="task-card-top">
              <span class="task-status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
              <span class="task-due-text ${statusClass === "overdue" ? "late" : ""}">${escapeHtml(dueLabel)}</span>
            </div>
            <div class="task-card-content">
              <h3>${escapeHtml(task.title || "Untitled task")}</h3>
              <p>Module: ${escapeHtml(batch?.name || "Assigned batch")}</p>
            </div>
            <div class="task-card-footer">
              <span class="task-calendar-icon">Due</span>
              <small>Assigned ${escapeHtml(assignedDateStr)}</small>
            </div>
          </article>
        `;
      }).join("");
    }

    if (!activeTask) {
      taskMainEl.innerHTML = `
        <div class="task-empty-state">
          <span>Task</span>
          <strong>Select a task</strong>
          <p>Pick an assignment from the left to view requirements and submit.</p>
        </div>
      `;
    } else {
      const activeSubmission = submissionForTask(activeTask.id);
      const activeBatch = state.data.batches.find((item) => sameId(item.id, activeTask.batch_id));
      const activeResource = taskResourceLink(activeTask);
      const taskCourse = courseForBatch(activeBatch);

      let resourceCardsHtml = "";
      if (activeResource) {
        const isPdf = activeResource.toLowerCase().endsWith(".pdf");
        const title = activeTask.title ? `${activeTask.title} Resource` : "Assignment Resource";
        const resourceId = registerLmsResource(activeResource, title, isPdf ? "pdf" : "file");
        resourceCardsHtml = `
          <div class="task-resources-list">
            <div class="resource-card ${isPdf ? "pdf" : "figma"}">
              <div class="resource-icon-container">
                <span class="resource-icon">${isPdf ? "PDF" : "File"}</span>
              </div>
              <div class="resource-info">
                <strong>${escapeHtml(title)}</strong>
                <small>${isPdf ? "PDF" : "RESOURCE"} - Study Material</small>
              </div>
              <button class="resource-download-btn" type="button" data-open-resource="${escapeAttr(resourceId)}" data-resource-title="${escapeAttr(title)}" data-resource-kind="${isPdf ? "pdf" : "file"}" title="Open Resource"><span>Open</span></button>
            </div>
          </div>
        `;
      } else {
        resourceCardsHtml = `<p class="task-no-resources">No downloadable resources added</p>`;
      }

      const marks = Number(activeTask.total_marks ?? activeTask.max_marks ?? 100);
      const pointsLabel = Number.isFinite(marks) && marks > 0 ? `${Math.round(marks)} XP` : "XP";
      const requirementItems = taskRequirements(activeTask);

      let submitBoxHtml = "";
      if (activeSubmission) {
        const feedbackHtml = activeSubmission.feedback
          ? `<div class="task-feedback-box">
               <strong>Mentor Feedback</strong>
               <p>${escapeHtml(activeSubmission.feedback)}</p>
             </div>`
          : "";
        submitBoxHtml = `
          <div class="task-submit-card submitted">
            <div class="task-submit-header">
              <span class="task-submit-icon">OK</span>
              <div>
                <strong>Submission Saved Successfully</strong>
                <small>Submitted on ${escapeHtml(formatDate(activeSubmission.submitted_at || activeSubmission.created_at))}</small>
              </div>
            </div>
            ${feedbackHtml}
            <div class="task-submit-actions">
              <button class="primary-btn text-center" type="button" data-open-resource="${escapeAttr(registerLmsResource(taskSubmissionLink(activeSubmission), "Your Submission", "file"))}" data-resource-title="Your Submission" data-resource-kind="file">
                View Your Submission
              </button>
              <button class="secondary-btn text-center" type="button" data-open-task="${escapeAttr(activeTask.id)}">
                Resubmit
              </button>
            </div>
          </div>
        `;
      } else {
        submitBoxHtml = `
          <div class="task-submit-card">
            <div class="task-submit-header">
              <span class="task-submit-icon">OK</span>
              <div>
                <strong>Submit Your Work</strong>
                <small>Paste a shareable project link or upload your file.</small>
              </div>
            </div>
            <form id="taskSubmitForm" class="task-submit-form">
              <div class="task-submit-input-group">
                <input id="taskSubmissionDriveLink" type="url" placeholder="https://your-project-link.example" required />
                <button class="primary-btn" type="submit">Submit Task</button>
              </div>
            </form>
          </div>
        `;
      }

      taskMainEl.innerHTML = `
        <article class="task-detail-document">
          <div class="task-detail-body">
            <div class="task-detail-header">
              <div class="task-detail-meta">
                <span class="task-module-pill">${escapeHtml(taskCourse?.title || activeBatch?.name || "Assignment")}</span>
                <span class="task-read-time">45 mins read</span>
              </div>
              <div class="task-points-display">
                <small>Points Possible</small>
                <strong>${escapeHtml(pointsLabel)}</strong>
              </div>
            </div>

            <h2 class="task-detail-title">${escapeHtml(activeTask.title || "Selected Task")}</h2>

            <section class="task-detail-section">
              <h3>Assignment Overview</h3>
              <p>${escapeHtml(activeTask.description || "No assignment overview has been added yet.")}</p>
            </section>

            <section class="task-detail-section">
              <h3>Submission Requirements</h3>
              <ul>
                ${requirementItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>
            </section>

            <section class="task-detail-section">
              <h3>Downloadable Resources</h3>
              ${resourceCardsHtml}
            </section>
          </div>

          ${submitBoxHtml}
        </article>
      `;

      if (!activeSubmission) {
        document.getElementById("taskSubmitForm")?.addEventListener("submit", (event) => submitTask(event, activeTask));
      }
    }
  }

  function taskRequirements(task) {
    const raw = task?.requirements || task?.submission_requirements || task?.instructions;
    const parsed = parseJsonDeep(raw);
    if (Array.isArray(parsed)) {
      const items = parsed.map((item) => String(item?.title || item?.text || item || "").trim()).filter(Boolean);
      if (items.length) return items;
    }
    if (typeof parsed === "string" && parsed.trim()) {
      const items = parsed.split(/\r?\n|;/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
      if (items.length) return items;
    }
    return [
      "Review the assignment overview before starting your work.",
      "Complete the task using the format requested by your mentor.",
      "Keep your work accessible through a shareable project link.",
      "Submit the final link before the deadline."
    ];
  }

  function renderBatch() {
    const batch = currentBatch();
    const sidebar = document.getElementById("batchSidebar");
    const chatBatchSelect = document.getElementById("chatBatchSelect");
    const batches = scopedBatches();
    const course = batch ? state.data.courses.find((item) => sameId(item.id, batch.course_id)) : null;
    const mentor = mentorForBatch(batch);

    if (chatBatchSelect) {
      chatBatchSelect.innerHTML = batches.length ? batches.map((item) => {
        const batchCourse = courseForBatch(item);
        const label = [item.name || "Batch", batchCourse?.title || batchCourse?.name].filter(Boolean).join(" - ");
        return `<option value="${escapeAttr(item.id)}" ${sameId(item.id, batch?.id) ? "selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("") : `<option value="">No batch assigned</option>`;
      chatBatchSelect.disabled = batches.length <= 1;
      if (chatBatchSelect.value) state.selectedBatchId = chatBatchSelect.value;
    }

    if (sidebar) {
      if (!batch) {
        sidebar.innerHTML = emptyState("No batch assigned", "Your batch details will appear here.");
      } else {
        const students = classmatesForBatch(batch);
        const mentorName = mentor?.name || "Not assigned";
        const courseTitle = course?.title || course?.name || "Course not assigned";
        const batchPeriodStr = batchPeriod(batch) || "14 May 2026";
        const statusLabel = batch.status && batch.status.toLowerCase() !== "draft" ? batch.status.toUpperCase() : "";

        const instructors = [mentor].filter(Boolean);
        const instructorsHtml = instructors.length ? instructors.map((user) => `
          <div class="batch-instructor-row">
            <span class="student-avatar small">${escapeHtml(initialsFor(user.name || user.email || "U"))}</span>
            <span>
              <strong>${escapeHtml(user.name || user.email || "Instructor")}</strong>
              <small>Lead Instructor</small>
            </span>
          </div>
        `).join("") : `
          <div class="batch-instructor-row">
            <span class="student-avatar small">M</span>
            <span>
              <strong>Not assigned</strong>
              <small>Lead Mentor</small>
            </span>
          </div>
        `;

        sidebar.innerHTML = `
          <div class="batch-sidebar-header">
            <span class="sidebar-eyebrow">LEARNING HUB</span>
            <h2 class="sidebar-title">${escapeHtml(batch.name || "Your Batch")}</h2>
            ${statusLabel ? `<span class="sidebar-status-badge">${escapeHtml(statusLabel)}</span>` : ""}
          </div>

          <div class="batch-sidebar-cards">
            <div class="sidebar-card">
              <div class="sidebar-card-icon">M</div>
              <div class="sidebar-card-info">
                <small>MENTOR</small>
                <strong>${escapeHtml(mentorName)}</strong>
              </div>
            </div>

            <div class="sidebar-card">
              <div class="sidebar-card-icon">D</div>
              <div class="sidebar-card-info">
                <small>PERIOD</small>
                <strong>${escapeHtml(batchPeriodStr)}</strong>
              </div>
            </div>

            <div class="sidebar-card">
              <div class="sidebar-card-icon">C</div>
              <div class="sidebar-card-info">
                <small>COURSE</small>
                <strong>${escapeHtml(courseTitle)}</strong>
              </div>
            </div>
          </div>

          <div class="batch-instructors-section">
            <header class="instructors-header">
              <span>Instructors</span>
              <small>${instructors.length} Active</small>
            </header>
            <div class="instructors-list">
              ${instructorsHtml}
            </div>
          </div>
        `;

        const onlineStatusEl = document.getElementById("chatOnlineStatus");
        if (onlineStatusEl) {
          onlineStatusEl.textContent = `${students.length} students online`;
        }
      }
    }

    renderChat();
    renderBatchPendingTasks();
  }

  function renderChat() {
    const target = document.getElementById("chatList");
    if (!target) return;
    const messages = scopedChats().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    renderChatReplyBar(messages);
    if (!messages.length) {
      target.innerHTML = `
        <div class="batch-chat-empty">
          <span class="batch-chat-empty-icon" aria-hidden="true"></span>
          <strong>Start the conversation</strong>
          <p>Your learning journey is better together. Reach out to your mentor and classmates to begin.</p>
          <button class="batch-chat-empty-action" type="button" data-focus-chat>Send first message</button>
        </div>
      `;
      return;
    }

    function formatTimeOnly(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.valueOf())) return "";
      return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
    }

    let lastDateLabel = "";
    target.innerHTML = messages.map((message) => {
      const user = state.data.users.find((item) => sameId(item.id, message.user_id));
      const mine = sameId(message.user_id, state.student.id);
      const isMentor = user?.role === "mentor";
      const reply = message.parent_id ? messages.find((item) => sameId(item.id, message.parent_id)) : null;
      const replyUser = reply ? state.data.users.find((item) => sameId(item.id, reply.user_id)) : null;
      const dateLabel = message.created_at ? formatDate(message.created_at) : "Recent";
      const divider = dateLabel !== lastDateLabel ? `<div class="chat-date-divider"><span>${escapeHtml(dateLabel)}</span></div>` : "";
      lastDateLabel = dateLabel;

      const authorName = mine ? "You" : (user?.name || user?.email || "User");
      const roleTag = isMentor ? " <span class=\"mentor-badge\">(Mentor)</span>" : "";
      const timeStr = message.created_at ? formatTimeOnly(message.created_at) : "";

      return `
        ${divider}
        <div class="chat-message-row ${mine ? "mine" : ""}">
          <div class="chat-message-meta">
            <span class="chat-message-author">${escapeHtml(authorName)}${roleTag}</span>
            <span class="chat-message-time">${escapeHtml(timeStr)}</span>
          </div>
          <div class="chat-message-bubble">
            ${reply ? `<div class="reply-preview">Replying to ${escapeHtml(replyUser?.name || replyUser?.email || "User")}: ${escapeHtml(truncate(reply.message || "", 80))}</div>` : ""}
            <p class="chat-message-text">${escapeHtml(message.message || "")}</p>
            <div class="chat-message-actions"><span class="chat-message-action-author">${escapeHtml(authorName)}${roleTag}</span><button class="chat-bubble-reply-btn" type="button" data-reply-chat="${escapeAttr(message.id)}">Reply</button></div>
          </div>
        </div>
      `;
    }).join("");
    target.scrollTop = target.scrollHeight;
  }

  function renderBatchPendingTasks() {
    const target = document.getElementById("batchPendingTasks");
    if (!target) return;
    const batch = currentBatch();
    const tasks = scopedTasks()
      .filter((task) => (!batch || !task.batch_id || sameId(task.batch_id, batch.id)) && !submissionForTask(task.id))
      .slice(0, 4);
    target.innerHTML = tasks.length ? tasks.map((task) => `
      <button class="batch-task-row" type="button" data-open-task="${escapeAttr(task.id)}">
        <span class="batch-task-check"></span>
        <span><strong>${escapeHtml(task.title || "Task")}</strong><small>${escapeHtml(task.deadline ? `Due ${formatDate(task.deadline)}` : "No deadline")}</small></span>
        <b>Open</b>
      </button>
    `).join("") : emptyState("No pending tasks", "Your batch work is clear for now.");
  }

  function renderAnnouncements() {
    const target = document.getElementById("announcementsList");
    if (!target) return;
    const rows = scopedAnnouncements().filter((item) => filteredAnnouncement(item));
    target.innerHTML = rows.length
      ? rows.map(announcementCard).join("")
      : emptyState("No active announcements", "New notices from admin and mentors will appear here.");
  }

  function renderChatReplyBar(messages = scopedChats()) {
    const target = document.getElementById("chatReplyBar");
    if (!target) return;
    const source = state.replyToChatId ? messages.find((chat) => sameId(chat.id, state.replyToChatId)) : null;
    if (!source) {
      target.hidden = true;
      target.innerHTML = "";
      return;
    }
    const author = sameId(source.user_id, state.student.id)
      ? "your message"
      : state.data.users.find((item) => sameId(item.id, source.user_id))?.name || "a classmate";
    target.hidden = false;
    target.innerHTML = `
      <span><small>Replying to ${escapeHtml(author)}</small><strong>${escapeHtml(truncate(source.message || "", 90))}</strong></span>
      <button class="text-btn" type="button" data-cancel-chat-reply>Cancel</button>
    `;
  }

  function renderQuestions() {
    const select = document.getElementById("questionCourse");
    const courses = enrolledCourses();
    if (select) {
      select.innerHTML = courses.length ? courses.map((course) => (
        `<option value="${escapeAttr(course.id)}">${escapeHtml(course.title || course.name || "Course")}</option>`
      )).join("") : `<option value="">No enrolled courses</option>`;
      select.disabled = !courses.length;
    }
    const submitButton = document.getElementById("questionSubmitBtn");
    if (submitButton) submitButton.disabled = !courses.length;

    const filterTabs = document.querySelector(".disc-filter-tabs");
    if (filterTabs) {
      filterTabs.querySelectorAll("button").forEach(button => {
        button.classList.toggle("active", button.dataset.discFilter === (state.questionsFilter || "all"));
      });
    }

    let questions = myQuestions();

    if (state.discQuery) {
      questions = questions.filter(q =>
        String(q.title || "").toLowerCase().includes(state.discQuery) ||
        String(q.description || "").toLowerCase().includes(state.discQuery)
      );
    }

    questions = filteredRecords(questions, ["title", "description", "status"]);

    const filter = state.questionsFilter || "all";
    if (filter === "pending") {
      questions = questions.filter(q => {
        const res = q.review_notes || q.response || q.feedback || "";
        return !res && !/resolved|answered|complete|approved|reviewed/i.test(q.status);
      });
    } else if (filter === "answered") {
      questions = questions.filter(q => {
        const res = q.review_notes || q.response || q.feedback || "";
        return Boolean(res) || /resolved|answered|complete|approved|reviewed/i.test(q.status);
      });
    }

    const target = document.getElementById("questionList");
    if (!target) return;

    if (!questions.length) {
      target.innerHTML = `<div style="text-align: center; color: var(--st-muted); padding: 24px; font-size: 13px;">No discussions found</div>`;
      state.selectedQuestionId = null;
      renderQuestionThread(null);
      return;
    }

    let activeQuestion = questions.find(q => sameId(q.id, state.selectedQuestionId));
    if (!activeQuestion && questions.length > 0) {
      activeQuestion = questions[0];
      state.selectedQuestionId = activeQuestion.id;
    }

    target.innerHTML = questions.map((question) => {
      const course = state.data.courses.find((item) => sameId(item.id, question.course_id));
      const res = question.review_notes || question.response || question.feedback || "";
      const answered = Boolean(res) || /resolved|answered|complete|approved|reviewed/i.test(question.status);
      const studentName = studentDisplayName(state.student);
      const initials = initialsFor(studentName);
      const activeClass = sameId(question.id, state.selectedQuestionId) ? "active" : "";
      const courseName = course?.title || course?.name || "General support";

      return `
        <article class="disc-question-card ${activeClass}" data-question-id="${escapeAttr(question.id)}">
          <div class="disc-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div class="disc-question-card-content">
            <h3 class="disc-card-title">${escapeHtml(question.title || "Question")}</h3>
            <div class="disc-card-meta">
              <span class="disc-tag">${escapeHtml(truncate(courseName, 20))}</span>
              <span class="disc-card-stats">
                ${answered ? `<span style="color: var(--st-success);">Answered</span>` : `<span>Pending</span>`}
              </span>
            </div>
          </div>
        </article>
      `;
    }).join("");

    renderQuestionThread(activeQuestion);
  }

  function categoryTagStyle(category = "") {
    const cat = String(category).toLowerCase();
    if (cat.includes("react") || cat.includes("frontend") || cat.includes("js") || cat.includes("javascript")) {
      return "background: rgba(85, 71, 233, 0.08); color: var(--st-primary); border: 1px solid rgba(85, 71, 233, 0.15);";
    }
    if (cat.includes("design") || cat.includes("ui") || cat.includes("ux") || cat.includes("figma")) {
      return "background: rgba(255, 159, 28, 0.08); color: var(--st-warning); border: 1px solid rgba(255, 159, 28, 0.15);";
    }
    if (cat.includes("data engineering") || cat.includes("cloud")) {
      return "background: rgba(24, 185, 111, 0.08); color: var(--st-success); border: 1px solid rgba(24, 185, 111, 0.15);";
    }
    return "background: var(--st-panel-soft); color: var(--st-muted); border: 1px solid var(--st-line);";
  }

  function renderQuestionThread(question) {
    const mainPane = document.getElementById("discMain");
    if (!mainPane) return;

    const existingThread = document.getElementById("discThreadContainer");
    if (existingThread) existingThread.remove();

    const emptyPane = document.getElementById("discEmptyPane");

    if (!question) {
      if (emptyPane) emptyPane.hidden = false;
      return;
    }

    if (emptyPane) emptyPane.hidden = true;

    const course = state.data.courses.find((item) => sameId(item.id, question.course_id));
    const studentName = studentDisplayName(state.student);
    const studentInitials = initialsFor(studentName);
    const dateStr = formatDate(question.created_at) || "Recent";
    const courseName = course?.title || course?.name || "General support";

    const response = question.review_notes || question.response || question.feedback || "";
    const answered = Boolean(response) || /resolved|answered|complete|approved|reviewed/i.test(question.status);

    const hashCode = (str) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      return hash;
    };
    const codeHash = hashCode(String(question.id || ""));
    const viewCount = Math.abs(codeHash) % 80 + 15;
    const likeCount = Math.abs(codeHash) % 15 + 3;

    let answerHtml = "";
    if (answered) {
      const mentorName = mentorNameForQuestion(0);
      const mentorInitials = initialsFor(mentorName);
      const mentorDate = formatDate(question.reviewed_at || question.updated_at) || "Recent";

      const formattedAnswer = response.split("\n\n").map(para => {
        if (para.startsWith("- ") || para.startsWith("* ")) {
          const items = para.split(/\n[-*]\s+/).map(item => item.replace(/^[-*]\s+/, ""));
          return `<ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
        }
        return `<p>${escapeHtml(para)}</p>`;
      }).join("");

      answerHtml = `
        <div class="disc-answers-section">
          <h3 class="disc-answers-title">Answers (1)</h3>
          <article class="disc-answer-card best-answer">
            <div class="disc-best-badge">BEST ANSWER</div>
            <div class="disc-answer-author">
              <div class="disc-avatar mentor-avatar" aria-hidden="true">${escapeHtml(mentorInitials)}</div>
              <div class="disc-author-info">
                <strong>${escapeHtml(mentorName)}</strong>
                <span class="disc-author-meta">Mentor &bull; ${escapeHtml(mentorDate)}</span>
              </div>
            </div>
            <div class="disc-answer-content">
              ${formattedAnswer}
            </div>
            <div class="disc-answer-actions">
              <button class="text-btn" type="button" data-disc-follow-up="${escapeAttr(question.id)}">Ask follow-up</button>
            </div>
          </article>
        </div>
      `;
    } else {
      answerHtml = `
        <div class="disc-answers-section">
          <h3 class="disc-answers-title">Answers (0)</h3>
          <div class="disc-pending-answer">
            <div class="disc-pending-icon">Pending</div>
            <div>
              <strong>Pending Mentor Response</strong>
              <p>Our LMS mentor team has been notified. You'll receive a response here within 2-4 hours.</p>
            </div>
          </div>
        </div>
      `;
    }

    const threadContainer = document.createElement("div");
    threadContainer.id = "discThreadContainer";
    threadContainer.className = "disc-thread-container";

    const formattedDetails = question.description.split("\n\n").map(para => {
      if (para.startsWith("```")) {
        const lines = para.split("\n");
        const headerLine = lines[0].replace("```", "").trim() || "Code";
        const codeContent = lines.slice(1, lines.length - (lines[lines.length - 1] === "```" ? 1 : 0)).join("\n");
        return `
          <div class="code-block-wrapper">
            <div class="code-block-header">
              <span>${escapeHtml(headerLine)}</span>
              <button class="copy-code-btn" type="button">Copy</button>
            </div>
            <pre><code>${escapeHtml(codeContent)}</code></pre>
          </div>
        `;
      }
      return `<p>${escapeHtml(para)}</p>`;
    }).join("");

    const tagStyle = categoryTagStyle(courseName);

    threadContainer.innerHTML = `
      <header class="disc-thread-header">
        <span class="disc-category-tag" style="${tagStyle}">${escapeHtml(courseName)}</span>
        <h2 class="disc-thread-title">${escapeHtml(question.title)}</h2>

        <div class="disc-author-bar">
          <div class="disc-avatar student-avatar" aria-hidden="true">${escapeHtml(studentInitials)}</div>
          <div class="disc-author-info">
            <strong>${escapeHtml(studentName)}</strong>
            <span class="disc-author-meta">Posted &bull; ${escapeHtml(dateStr)}</span>
          </div>
        </div>
      </header>

      <div class="disc-thread-body">
        ${formattedDetails}

        ${question.drive_link || question.file_url ? `
          <div class="disc-attachment-card">
            <div class="disc-attachment-icon">File</div>
            <div class="disc-attachment-details">
              <strong>Attached Resource</strong>
              <small>Study material</small>
            </div>
            <button class="disc-attachment-link-btn" type="button" data-open-resource="${escapeAttr(registerLmsResource(question.drive_link || question.file_url, "Attached Resource", "file"))}" data-resource-title="Attached Resource" data-resource-kind="file">
              View File
            </button>
          </div>
        ` : ""}
      </div>

      <div class="disc-stats-bar">
        <span class="disc-like-count">${likeCount} likes</span>
        <button class="disc-action-btn like-btn" type="button">Like</button>
      </div>

      ${answerHtml}
    `;

    mainPane.appendChild(threadContainer);

    const likeBtn = threadContainer.querySelector(".disc-action-btn.like-btn");
    if (likeBtn) {
      likeBtn.addEventListener("click", () => {
        const isLiked = likeBtn.classList.toggle("active");
        likeBtn.classList.toggle("liked", isLiked);
        const valEl = threadContainer.querySelector(".disc-like-count");
        if (valEl) {
          let val = parseInt(valEl.innerText) || 0;
          val = isLiked ? val + 1 : val - 1;
          valEl.innerText = `${val} likes`;
          likeBtn.innerHTML = isLiked ? "Liked" : "Like";
        }
      });
    }


    threadContainer.querySelectorAll(".copy-code-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wrapper = btn.closest(".code-block-wrapper");
        const code = wrapper?.querySelector("code")?.innerText || "";
        navigator.clipboard.writeText(code).then(() => {
          showAlert("Code copied to clipboard!");
        });
      });
    });
  }

  function openQuestionComposer(options = {}) {
    const source = options.followUpId ? myQuestions().find((question) => sameId(question.id, options.followUpId)) : null;
    if (source) {
      setValue("questionCourse", source.course_id || "");
      setValue("questionTitle", `Follow-up: ${source.title || "Question"}`);
    }
    document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "false");
    window.setTimeout(() => document.getElementById(source ? "questionDetails" : "questionTitle")?.focus(), 0);
  }

  function mentorNameForQuestion(index = 0) {
    const mentors = state.data.users.filter((user) => String(user.role || "").toLowerCase() === "mentor");
    const mentor = mentors[index % Math.max(mentors.length, 1)];
    return mentor?.name || "Mentor Sarah L.";
  }

  function mentorInitialsForQuestion(index = 0) {
    return initialsFor(mentorNameForQuestion(index));
  }

  function renderSupport() {
    const target = document.getElementById("supportTicketList");
    if (!target) return;
    const tickets = supportTicketsForUser();
    target.innerHTML = tickets.length ? tickets.map(supportTicketCard).join("") : emptyState("No support tickets", "Create a ticket when you need admin support.");
    target.querySelectorAll("[data-open-support-ticket]").forEach((button) => {
      button.addEventListener("click", () => openSupportTicketThread(button.dataset.openSupportTicket));
    });
  }

  function supportTicketCard(ticket) {
    const unread = supportUnreadMessages(ticket).length;
    const status = (ticket.status || "open").toLowerCase();
    const statusLabel = escapeHtml(humanizeSupportStatus(ticket.status));
    const dateStr = escapeHtml(formatDateTime(ticket.updated_at || ticket.created_at));
    const category = escapeHtml((ticket.category || "general").toUpperCase());
    const unreadLabel = unread ? ` - ${unread} NEW` : " - NO UNREAD";
    const ticketId = escapeAttr(ticket.id || ticket.ticket_id);
    return `
      <article class="support-ticket-item" data-ticket-id="${ticketId}">
        <div class="ticket-meta-row">
          <span class="ticket-status-badge ${status}">${statusLabel}</span>
          <span class="ticket-date">${dateStr}</span>
        </div>
        <h3 class="ticket-title">${escapeHtml(ticket.subject || "Support ticket")}</h3>
        <p class="ticket-preview">${escapeHtml(truncate(ticket.message || "", 140))}</p>
        <div class="ticket-footer-row">
          <span class="ticket-category-tag">${category}${unreadLabel}</span>
          <button class="ticket-view-link" type="button" data-open-support-ticket="${ticketId}">View Thread</button>
        </div>
      </article>
    `;
  }

  async function submitSupportTicket(event) {
    event.preventDefault();
    const category = document.getElementById("supportCategory")?.value || "other";
    const subject = document.getElementById("supportSubject")?.value.trim();
    const message = document.getElementById("supportMessage")?.value.trim();
    const file = document.getElementById("supportAttachment")?.files?.[0] || null;
    if (!subject || !message) return;

    try {
      const attachmentUrl = file ? await uploadSupportAttachment(file) : null;
      const ticket = await createSupportTicket({ category, subject, message, attachmentUrl });
      event.target.reset();
      showAlert("Support ticket submitted. Admin has been notified.");
      clearQueryCache();
      await loadAllData({ force: true, silent: true });
      if (ticket?.id || ticket?.ticket_id) openSupportTicketThread(ticket.id || ticket.ticket_id);
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to submit support ticket."), true);
    }
  }

  async function createSupportTicket({ category, subject, message, attachmentUrl }) {
    if (getClient()?.rpc) {
      const { data, error } = await getClient().rpc("lms_support_create_ticket", {
        requester_user_id: state.student.id,
        requester_role: "student",
        ticket_category: category,
        ticket_subject: subject,
        ticket_message: message,
        ticket_attachment_url: attachmentUrl
      });
      if (!error) return Array.isArray(data) ? data[0] : data;
      if (!isMissingRpcError(error)) throw error;
    }
    const payload = {
      user_id: state.student.id,
      user_role: "student",
      category,
      subject,
      message,
      attachment_url: attachmentUrl,
      status: "open",
      priority: "normal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const { data, error } = await getClient().from("support_tickets").insert(payload).select(SELECTS.supportTickets);
    if (error) throw error;
    const ticket = Array.isArray(data) ? data[0] : data;
    await createSupportAdminNotifications(ticket);
    return ticket;
  }

  async function createSupportAdminNotifications(ticket) {
    const admins = state.data.users.filter((user) => String(user.role || "").toLowerCase() === "admin");
    if (!ticket || !admins.length) return;
    const rows = admins.map((admin) => ({
      ticket_id: ticket.id || ticket.ticket_id,
      recipient_user_id: admin.id,
      recipient_role: "admin",
      title: "New Support Ticket",
      body: `From: ${studentDisplayName(state.student)} | Role: Student | Category: ${ticket.category || "general"} | Subject: ${ticket.subject || "Support ticket"}`,
      channel: "in_app",
      is_read: false,
      created_at: new Date().toISOString()
    }));
    const { error } = await getClient().from("support_notifications").insert(rows);
    if (error && !isSchemaShapeError(error)) throw error;
  }

  async function openSupportTicketThread(ticketId) {
    const ticket = supportTicketsForUser().find((item) => sameId(item.id || item.ticket_id, ticketId));
    if (!ticket) return;
    const messages = supportMessagesForTicket(ticket).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    openModal("Support Thread", `
      <div class="support-thread-modal">
        <div class="support-thread-summary">
          <span class="pill ${statusTone(ticket.status || "open")}">${escapeHtml(humanizeSupportStatus(ticket.status))}</span>
          <h3>${escapeHtml(ticket.subject || "Support ticket")}</h3>
          <p>${escapeHtml(ticket.message || "")}</p>
          ${ticket.attachment_url ? `<a class="text-btn" href="${escapeAttr(ticket.attachment_url)}" target="_blank" rel="noopener">Open attachment</a>` : ""}
        </div>
        <div class="support-thread">
          ${messages.length ? messages.map(supportMessageBubble).join("") : emptyState("No replies yet", "Admin replies will appear here.")}
        </div>
        <form class="stack-form" id="supportReplyForm">
          <label>Reply
            <textarea id="supportReplyMessage" rows="4" placeholder="Add more context..."></textarea>
          </label>
          <label>Attachment
            <input id="supportReplyAttachment" type="file" />
          </label>
          <button class="primary-btn" type="submit">Send Reply</button>
        </form>
      </div>
    `);
    document.getElementById("supportReplyForm")?.addEventListener("submit", (event) => replyToSupportTicket(event, ticket));
    markSupportNotificationsRead(ticket);
  }

  async function replyToSupportTicket(event, ticket) {
    event.preventDefault();
    await runLockedSubmit(event.currentTarget, event.submitter, "Sending reply...", async () => {
      const message = document.getElementById("supportReplyMessage")?.value.trim();
      const file = document.getElementById("supportReplyAttachment")?.files?.[0] || null;
      if (!message && !file) return;
      try {
        const attachmentUrl = file ? await uploadSupportAttachment(file) : null;
        await sendSupportReply(ticket, message, attachmentUrl);
        showAlert("Support reply sent.");
        await loadAllData({ force: true, silent: true });
        openSupportTicketThread(ticket.id || ticket.ticket_id);
      } catch (error) {
        showAlert(userFriendlyError(error, "Unable to send support reply."), true);
      }
    });
  }

  async function sendSupportReply(ticket, message, attachmentUrl) {
    const ticketId = ticket.id || ticket.ticket_id;
    if (getClient()?.rpc) {
      const { error } = await getClient().rpc("lms_support_reply", {
        actor_user_id: state.student.id,
        actor_role: "student",
        target_ticket_id: ticketId,
        reply_message: message || "",
        reply_attachment_url: attachmentUrl,
        next_status: null,
        next_priority: null
      });
      if (!error) return;
      if (!isMissingRpcError(error)) throw error;
    }
    const { error } = await getClient().from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: state.student.id,
      sender_role: "student",
      message: message || "",
      attachment_url: attachmentUrl,
      created_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  async function uploadSupportAttachment(file) {
    const safeName = String(file.name || "support-file").replace(/[^a-z0-9._-]+/gi, "-");
    const path = `${state.student.id}/${Date.now()}-${safeName}`;
    const { error } = await getClient().storage.from("support-attachments").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return `support-attachments:${path}`;
  }

  function supportTicketsForUser() {
    return state.data.supportTickets
      .filter((ticket) => sameId(ticket.user_id, state.student.id))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  }

  function supportMessagesForTicket(ticket) {
    const ticketId = ticket.id || ticket.ticket_id;
    return state.data.supportMessages.filter((message) => sameId(message.ticket_id, ticketId));
  }

  function supportUnreadMessages(ticket) {
    return supportMessagesForTicket(ticket).filter((message) => (
      !message.is_read && String(message.sender_role || "").toLowerCase() === "admin"
    ));
  }

  function notifyUnreadSupportReplies() {
    if (!state.student?.id) return;
    const storageKey = `${QUERY_CACHE_PREFIX}seen-support-notifications:${state.student.id}`;
    const seen = new Set(parseIdList(sessionStorage.getItem(storageKey)));
    const unread = state.data.supportNotifications.filter((item) => (
      sameId(item.recipient_user_id, state.student.id)
      && !item.is_read
      && !seen.has(String(item.id))
      && /admin has replied/i.test(`${item.title || ""} ${item.body || ""}`)
    ));
    if (!unread.length) return;
    unread.forEach((item) => seen.add(String(item.id)));
    sessionStorage.setItem(storageKey, JSON.stringify(Array.from(seen).slice(-80)));
    showAlert("Admin has replied to your support request.");
  }

  function supportMessageBubble(message) {
    const mine = sameId(message.sender_id, state.student.id);
    return `
      <div class="chat-bubble support-message ${mine ? "mine" : ""}">
        <header><strong>${escapeHtml(mine ? "You" : "Admin")}</strong><time>${escapeHtml(formatDateTime(message.created_at))}</time></header>
        <p>${escapeHtml(message.message || "")}</p>
        ${message.attachment_url ? `<a class="text-btn" href="${escapeAttr(message.attachment_url)}" target="_blank" rel="noopener">Open attachment</a>` : ""}
        <small>${message.is_read ? "Read" : "Unread"}</small>
      </div>
    `;
  }

  function humanizeSupportStatus(status) {
    return String(status || "open").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }

  async function markSupportNotificationsRead(ticket) {
    const ticketId = ticket.id || ticket.ticket_id;
    const unreadIds = state.data.supportNotifications
      .filter((item) => sameId(item.ticket_id, ticketId) && sameId(item.recipient_user_id, state.student.id) && !item.is_read)
      .map((item) => item.id)
      .filter(Boolean);
    if (!unreadIds.length) return;
    await getClient().from("support_notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unreadIds);
  }

  function renderShop() {
    setText("shopCoinBalance", formatNumber(state.student.coins));

    const purchases = new Set(state.data.purchases
      .filter((item) => sameId(item.user_id || item.student_id, state.student.id))
      .map((item) => String(purchaseItemId(item))));
    const items = filteredRecords(state.data.shopItems, ["name", "description"])
      .filter((item) => !item.deleted_at)
      .filter((item) => !["archived", "disabled", "inactive"].includes(String(item.status || "active").toLowerCase()))
      .filter((item) => item.stock === undefined || item.stock === null || Number(item.stock) > 0);
    const target = document.getElementById("shopGrid");
    if (!target) return;

    if (!items.length) {
      target.innerHTML = emptyState("Shop is empty", "Admin can add reward items from the admin dashboard.");
      return;
    }

    target.innerHTML = items.map((item, index) => {
      const owned = purchases.has(String(item.id));
      const price = Number(item.price || item.coins || 0);
      const inStock = item.stock === undefined || item.stock === null || Number(item.stock) > 0;
      const canBuy = inStock && !owned && Number(state.student.coins || 0) >= price;
      const btnClass = owned ? "primary-btn owned-btn" : "primary-btn";
      const btnLabel = owned ? "Owned" : "Redeem";
      return `
        <article class="shop-card">
          <img src="${escapeAttr(item.image_url || rewardDisplayImage(index))}" alt="${escapeAttr(item.name || "Reward item")}" loading="lazy" />
          <div class="card-copy">
            <h3>${escapeHtml(item.name || "Reward item")}</h3>
            <p>${escapeHtml(truncate(item.description || "Redeem this reward with your earned coins.", 120))}</p>
          </div>
          <div class="shop-actions">
            <span class="pill">${formatNumber(price)} coins</span>
            <button class="${btnClass}" type="button" data-buy-item="${escapeAttr(item.id)}" ${canBuy ? "" : "disabled"}>${btnLabel}</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderRewards() {
    renderAchievementGrid();
    renderOwnedItems();
  }

  function renderReferral() {
    window.renderStudentReferral?.(state.student);
  }

  function renderAchievementGrid() {
    const target = document.getElementById("achievementGrid");
    if (!target) return;
    target.innerHTML = achievements().map((item) => `
      <div class="achievement-card">
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.label)}</small>
      </div>
    `).join("");
  }

  function renderOwnedItems() {
    const target = document.getElementById("ownedItems");
    if (!target) return;
    const purchases = state.data.purchases.filter((purchase) => sameId(purchase.user_id || purchase.student_id, state.student.id));
    const items = purchases.map((purchase) => ({
      purchase,
      item: state.data.shopItems.find((shopItem) => sameId(shopItem.id, purchaseItemId(purchase)))
    }));

    target.innerHTML = items.length ? items.map(({ purchase, item }) => `
      <article class="owned-card">
        ${item?.image_url ? `<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name || "Owned reward")}" />` : ""}
        <strong>${escapeHtml(item?.name || "Owned reward")}</strong>
        <small class="muted">${escapeHtml(formatDateTime(purchase.created_at || purchase.purchased_at || purchase.updated_at))}</small>
      </article>
    `).join("") : emptyState("No rewards owned yet", "Use coins in the shop to collect rewards.");
  }

  function renderProfile() {
    const target = document.getElementById("profileSummary");
    if (!target) return;
    const batch = currentBatch();
    const courses = enrolledCourses();
    const profileName = studentDisplayName(state.student);
    const profileEmail = state.student.email || "";
    const streak = currentStreak();

    target.innerHTML = `
      <div class="profile-banner-glass">
        <div class="banner-glass-left">
          <div class="banner-avatar-wrapper">
            <div class="student-avatar-square">${escapeHtml(initialsFor(profileName || profileEmail))}</div>
          </div>
          <div class="banner-identity">
            <h2>${escapeHtml(profileName)}</h2>
            <div class="banner-badge-row">
              <span class="student-badge">Student</span>
              <span class="batch-text">${escapeHtml(batch?.name || "No batch assigned")}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    setText("profileCoinsVal", formatNumber(state.student.coins));
    setText("profileStreakVal", `${streak} Day${streak === 1 ? "" : "s"}`);
    setText("profileEnrolledCount", courses.length);
    setText("profileAverageProgress", `${averageCourseProgress(courses)}%`);
    setText("profileBatchName", batch?.name || "Not assigned");

    const completedCount = courses.filter(c => courseProgress(c).percent === 100).length;
    setText("profileCoursesCount", completedCount);

    const activeCourse = state.selectedCourseId
      ? courses.find((course) => sameId(course.id, state.selectedCourseId)) || courses[0]
      : courses[0];
    const activeCourseEl = document.getElementById("profileActiveCourse");
    if (activeCourseEl) {
      if (activeCourse) {
        activeCourseEl.textContent = activeCourse.title || activeCourse.name || "";
        const progress = courseProgress(activeCourse);
        setText("profileActiveProgressPercent", `${progress.percent}%`);
        const bar = document.getElementById("profileActiveProgressBar");
        if (bar) bar.style.width = `${progress.percent}%`;
        const activeCard = activeCourseEl.closest(".active-enrollment-card");
        if (activeCard) activeCard.style.display = "block";
      } else {
        const activeCard = activeCourseEl.closest(".active-enrollment-card");
        if (activeCard) activeCard.style.display = "none";
      }
    }

    renderIdentity();
  }

  function averageCourseProgress(courses = enrolledCourses()) {
    if (!courses.length) return 0;
    return Math.round(courses.reduce((sum, course) => sum + courseProgress(course).percent, 0) / courses.length);
  }

  function courseDisplayImage(course, index = 0) {
    const explicitUrl = [
      course?.thumbnail_url,
      course?.image_url,
      course?.cover_url,
      course?.photo_url,
      course?.banner_url
    ].find((url) => url && !isSharedCoursePlaceholder(url));
    if (explicitUrl) return explicitUrl;
    const slugifyCourseImageTitle = (title) => String(title || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const imageByCourseSlug = {
      "javascript-imagination": "course/1. Technology & Software Development/mk.avif",
      "react-frontend-bootcamp": "course/1. Technology & Software Development/st.avif",
      "python-data-analytics": "course/2. Artificial Intelligence & Data Science/yhn.jpg",
      "graphic-design-beginners": "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
      "ui-ux-mobile-sprint": "course/6. Design & Creative Arts/ux-store-jJT2r2n7lYA.jpg",
      "brand-identity-masterclass": "course/6. Design & Creative Arts/andy-brown-8dgFq8Vbelo.jpg",
      "facebook-digital-marketing": "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.jpg",
      "social-ads-content-strategy": "course/5. Business, Finance & Marketing/premium_photo-1661604346220-5208d18cb34e.avif",
      "financial-analyst-investing": "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg",
      "personal-finance-students": "course/5. Business, Finance & Marketing/kelly-sikkema-xoU52jUVUXA.jpg",
      "startup-business-strategy": "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.jpg",
      "product-management-fundamentals": "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
      "team-leadership-communication": "course/5. Business, Finance & Marketing/premium_photo-1664476794112.avif",
      "wellness-productivity-system": "course/7. Healthcare & Human Sciences/premium_photo-1690297732590.avif",
      "ai-tools-study-career": "course/2. Artificial Intelligence & Data Science/premium_photo-.avif",
      "cyber-security-basics": "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
      "photography-visual-storytelling": "course/6. Design & Creative Arts/premium_photo-1737597230774.avif",
      "programming-in-python": "course/1. Technology & Software Development/code.jpg",
      "programming-in-java": "course/1. Technology & Software Development/chris-ried-ieic5Tq8YMk.jpg",
      "dsa-with-python": "course/1. Technology & Software Development/boitumelo-mZ-vSMus7zM.webp",
      "front-end-web-development": "course/1. Technology & Software Development/fahim-muntashir-v-FOvoL3o.webp",
      "full-stack-web-development": "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
      "senior-sde-interview-prep": "course/1. Technology & Software Development/fotis-fotopoulos-6sAl6aQ4OWI.jpg",
      "full-stack-developer-portfolio": "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
      "android-development": "course/1. Technology & Software Development/hossain-khan-UP3SMQSoNsM.jpg",
      "artificial-intelligence": "course/2. Artificial Intelligence & Data Science/ai.jpg", "artificial-intelligence-and-machine-learning": "course/2. Artificial Intelligence & Data Science/carlos-gil-AsxOJcsaR4g.jpg",
      "ai-agentic-and-generative": "course/2. Artificial Intelligence & Data Science/clarisse-croset--tikpxRBcsA.webp",
      "machine-learning": "course/2. Artificial Intelligence & Data Science/steve-a-johnson-WhAQMsdRKMI.jpg",
      "data-science": "course/2. Artificial Intelligence & Data Science/ji.avif",
      "data-engineering-with-sql-and-cloud": "course/2. Artificial Intelligence & Data Science/jonathan-kemper-MMUzS5Qzuus.jpg",
      "data-analytics-with-power-bi": "course/2. Artificial Intelligence & Data Science/yhn.jpg",
      "data-analysis": "course/2. Artificial Intelligence & Data Science/nnii.avif",
      "cyber-security-and-ethical-hacking": "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
      "cloud-computing": "course/3. Cyber Security, Cloud & DevOps/glen-carrie-Ls1Npp-C-P8.webp",
      "devops": "course/3. Cyber Security, Cloud & DevOps/kevin-horvat-Pyjp2zmxuLk.webp",
      "internet-of-things-iot": "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
      "iot-and-robotics": "course/4. Engineering & Emerging Technologies/ray-rui-SyzQ5aByJnE.webp",
      "embedded-systems": "course/4. Engineering & Emerging Technologies/jeswin-thomas--Cm7hnp4WOg.jpg",
      "vlsi": "course/4. Engineering & Emerging Technologies/adi-goldstein-EUsVwEOsblE.jpg",
      "robotics": "course/4. Engineering & Emerging Technologies/ray-rui-SyzQ5aByJnE.jpg",
      "hybrid-electric-vehicle": "course/4. Engineering & Emerging Technologies/thisisengineering-omrpeqLz6Po.webp",
      "nanotechnology": "course/4. Engineering & Emerging Technologies/marius-masalar-CyFBmFEsytU.jpg",
      "digital-marketing": "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.jpg",
      "human-resource-management": "course/5. Business, Finance & Marketing/scott-graham-5fNmWej4tAA.webp",
      "finance": "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg",
      "startup-and-entrepreneurship": "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.jpg",
      "business-analysis": "course/5. Business, Finance & Marketing/mirea-mazzei-d1Lp7juy6JU.webp",
      "operation-and-supply-chain-management": "course/5. Business, Finance & Marketing/shutter-speed-BQ9usyzHx_w.jpg",
      "e-commerce-operations-management": "course/5. Business, Finance & Marketing/premium_photo-1681488262364.avif",
      "product-and-project-management": "course/5. Business, Finance & Marketing/photo-1590103514966.avif",
      "stock-marketing": "course/5. Business, Finance & Marketing/premium_photo-1663040328859.avif",
      "ui-ux": "course/6. Design & Creative Arts/ux-store-jJT2r2n7lYA.jpg",
      "graphic-designing": "course/6. Design & Creative Arts/premium_photo-1661310081873-.avif",
      "autocad": "course/6. Design & Creative Arts/grove-brands-RDfZRXZH2Kc.jpg",
      "car-design": "course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg",
      "medical-coding": "course/7. Healthcare & Human Sciences/accuray-MFSEP2g4YS0.jpg",
      "clinical-trials-and-research": "course/7. Healthcare & Human Sciences/piron-guillaume-y5hQCIn1c6o.jpg",
      "psychology": "course/7. Healthcare & Human Sciences/psychology.webp",
      "counselling-psychology-practice": "course/7. Healthcare & Human Sciences/metaphor-bipolar-disorder-mind-mental-dou.webp",
      "clinical-psychology-basics": "course/7. Healthcare & Human Sciences/importance-of-.webp",
      "rehabilitation-psychology": "course/7. Healthcare & Human Sciences/premium_photo-1699387204388.avif"
    };
    const titleImage = imageByCourseSlug[slugifyCourseImageTitle(course?.title || course?.name)];
    if (titleImage) return titleImage;

    const groups = {
      aitool: ["course/2. Artificial Intelligence & Data Science/premium_photo-.avif", "course/2. Artificial Intelligence & Data Science/premium_photo-1725907643701.avif", "course/2. Artificial Intelligence & Data Science/re.avif"],
      business: ["course/5. Business, Finance & Marketing/photo-1590103514966.avif", "course/5. Business, Finance & Marketing/premium_photo-1681487767138.avif", "course/5. Business, Finance & Marketing/premium_photo-1726804880693-8fcdd773ce80.avif"],
      cyber: ["course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif", "course/3. Cyber Security, Cloud & DevOps/istockphoto-1556021855.jpg", "course/3. Cyber Security, Cloud & DevOps/glen-carrie-Ls1Npp-C-P8.jpg", "course/3. Cyber Security, Cloud & DevOps/kevin-horvat-Pyjp2zmxuLk.jpg", "course/3. Cyber Security, Cloud & DevOps/premium_photo-1733306493254.avif"],
      development: ["course/1. Technology & Software Development/mk.avif", "course/1. Technology & Software Development/st.avif", "course/1. Technology & Software Development/we.avif"],
      finance: ["course/5. Business, Finance & Marketing/premium_photo-1663040328859.avif", "course/5. Business, Finance & Marketing/premium_photo-1664476794112.avif"],
      graphicDesign: ["course/6. Design & Creative Arts/premium_photo-1661310081873-.avif", "course/6. Design & Creative Arts/premium_photo-1661412864160-e0.avif", "course/6. Design & Creative Arts/premium_photo-172362970.avif"],
      lifestyle: ["course/7. Healthcare & Human Sciences/psychology.webp", "course/7. Healthcare & Human Sciences/importance-of-.webp", "course/7. Healthcare & Human Sciences/ux-788002_640.webp"],
      management: ["course/5. Business, Finance & Marketing/premium_photo-1726812103168-6ad609e53f94.avif", "course/5. Business, Finance & Marketing/premium_photo-1733328013343.avif", "course/5. Business, Finance & Marketing/ishant-mishra-osWDvhPlGLU.jpg"],
      marketing: ["course/5. Business, Finance & Marketing/premium_photo-1661443781814.avif", "course/5. Business, Finance & Marketing/premium_photo-1661604346220-5208d18cb34e.avif", "course/5. Business, Finance & Marketing/premium_photo-1681488262364.avif"],
      photo: ["course/6. Design & Creative Arts/premium_photo-1737597230774.avif", "course/6. Design & Creative Arts/hyundai-motor-group-V1DFo8C4JPA.jpg", "course/6. Design & Creative Arts/premium_photo-1661771683263.avif"]
    };
    const key = courseImageGroupKey(course);
    const images = groups[key] || groups.development;
    const basis = `${course?.title || course?.name || ""}:${course?.category || course?.difficulty || ""}`;
    return images[Math.abs(stableHash(basis || String(index))) % images.length];
  }

  function isSharedCoursePlaceholder(url) {
    return /(?:assets\/img\/courses\/course_thumb0\d|image\/login\/loginimg)\.(?:jpg|png|webp)$/i.test(String(url || ""));
  }

  function courseImageGroupKey(course) {
    const text = `${course?.title || course?.name || ""} ${course?.category || ""} ${course?.difficulty || ""}`.toLowerCase();
    if (/\b(ai|prompt|automation|workflow)\b/.test(text)) return "aitool";
    if (/\b(cyber|security|hacking|network)\b/.test(text)) return "cyber";
    if (/\b(finance|financial|invest|money|budget|analyst)\b/.test(text)) return "finance";
    if (/\b(graphic|design|ui|ux|brand|figma|visual)\b/.test(text)) return "graphicDesign";
    if (/\b(marketing|facebook|social|ads|content|campaign)\b/.test(text)) return "marketing";
    if (/\b(business|startup|founder|entrepreneur)\b/.test(text)) return "business";
    if (/\b(management|product|leadership|team|communication|roadmap)\b/.test(text)) return "management";
    if (/\b(lifestyle|life style|wellness|productivity|habit|focus)\b/.test(text)) return "lifestyle";
    if (/\b(photo|photography|camera)\b/.test(text)) return "photo";
    return "development";
  }

  function stableHash(value) {
    return String(value || "").split("").reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0);
  }

  function rewardDisplayImage(index = 0) {
    const fallbacks = [
      "assets/img/blog/blog_post01.jpg",
      "assets/img/blog/blog_post02.jpg",
      "assets/img/blog/blog_post03.jpg",
      "assets/img/blog/blog_post04.jpg"
    ];
    return fallbacks[index % fallbacks.length];
  }

  function setStyleWidth(id, value) {
    const element = document.getElementById(id);
    if (element) element.style.width = `${clamp(Number(value) || 0, 0, 100)}%`;
  }

  function attachLessonProgressTracker(course, lessonItem, options = {}) {
    if (!course || !lessonItem?.mediaUrl) return;
    if (options.directVideo) {
      attachDirectVideoProgressTracker(course, lessonItem);
      return;
    }
    if (options.embedUrl) {
      attachEmbeddedVideoProgressTracker(course, lessonItem);
    }
  }

  function attachDirectVideoProgressTracker(course, lessonItem) {
    const video = document.querySelector("#lessonPlayer video");
    if (!video) return;
    const existing = lessonProgressFromState(courseProgress(course).row, lessonItem);

    const collect = () => {
      const durationSeconds = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : existing.durationSeconds;
      const watchedSeconds = durationSeconds
        ? Math.min(durationSeconds, existing.watchedSeconds + timeRangesSeconds(video.played))
        : 0;
      return progressSnapshot(watchedSeconds, durationSeconds);
    };

    const handleProgress = (immediate = false) => {
      const snapshot = collect();
      updateLessonProgressStatus(snapshot);
      queueLessonProgressSave(course, lessonItem, snapshot, immediate);
    };

    const onMetadata = () => handleProgress(false);
    const onTimeUpdate = () => handleProgress(false);
    const onPause = () => handleProgress(true);
    const onEnded = () => handleProgress(true);
    video.addEventListener("loadedmetadata", onMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    state.lessonTrackerCleanup = () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }

  function attachEmbeddedVideoProgressTracker(course, lessonItem) {
    const plannedDuration = lessonDurationSeconds(lessonItem.lesson);
    if (!plannedDuration) return;
    const existing = lessonProgressFromState(courseProgress(course).row, lessonItem);
    let watchedSeconds = Math.min(existing.watchedSeconds, plannedDuration);
    let lastTick = Date.now();

    const interval = window.setInterval(() => {
      if (state.selectedLessonKey !== lessonItem.key) return;
      const now = Date.now();
      const elapsed = (now - lastTick) / 1000;
      lastTick = now;
      if (document.visibilityState !== "visible") return;
      watchedSeconds = Math.min(plannedDuration, watchedSeconds + elapsed);
      const snapshot = progressSnapshot(watchedSeconds, plannedDuration);
      updateLessonProgressStatus(snapshot);
      queueLessonProgressSave(course, lessonItem, snapshot, snapshot.completed);
    }, 1000);

    updateLessonProgressStatus(progressSnapshot(watchedSeconds, plannedDuration));
    state.lessonTrackerCleanup = () => window.clearInterval(interval);
  }

  function cleanupLessonTracker() {
    if (typeof state.lessonTrackerCleanup === "function") {
      state.lessonTrackerCleanup();
    }
    state.lessonTrackerCleanup = null;
  }

  function queueLessonProgressSave(course, lessonItem, snapshot, immediate = false) {
    if (!snapshot.durationSeconds || !state.student?.id) return;
    const key = lessonItem.key;
    const now = Date.now();
    const lastSaved = state.videoProgressLastSaved[key] || 0;
    if (!immediate && now - lastSaved < 5000) return;
    state.videoProgressLastSaved[key] = now;
    if (state.videoProgressSaveInFlight[key]) return;
    state.videoProgressSaveInFlight[key] = true;
    saveLessonProgress(course, lessonItem, snapshot)
      .catch((error) => showAlert(error.message || "Unable to save video progress.", true))
      .finally(() => {
        state.videoProgressSaveInFlight[key] = false;
      });
  }

  async function saveLessonProgress(course, lessonItem, snapshot) {
    const payload = buildVideoProgressPayload(course, lessonItem, snapshot);
    mergeLocalProgressRow(payload);
    const platformClient = getClient();
    const { error } = await platformClient
      .from("student_course_progress")
      .upsert(payload, { onConflict: "student_id,course_id" });

    if (!error) return;

    const { error: updateError } = await platformClient
      .from("student_course_progress")
      .update(payload)
      .eq("student_id", state.student.id)
      .eq("course_id", course.id);
    if (!updateError) return;

    const { error: insertError } = await platformClient.from("student_course_progress").insert(payload);
    if (insertError) throw insertError;
  }

  function buildVideoProgressPayload(course, lessonItem, snapshot) {
    const existing = courseProgress(course).row || {};
    const modules = parseModules(course.modules);
    const storedState = progressJsonState(existing);
    const videoProgress = { ...storedState.video_progress };
    videoProgress[lessonItem.key] = {
      module_index: lessonItem.moduleIndex,
      lesson_index: lessonItem.lessonIndex,
      module_id: lessonItem.module.id,
      lesson_id: lessonItem.lesson.id,
      watched_seconds: Math.round(snapshot.watchedSeconds),
      duration_seconds: Math.round(snapshot.durationSeconds),
      percent: snapshot.percent,
      completed: snapshot.completed,
      updated_at: new Date().toISOString()
    };

    const virtualRow = {
      ...existing,
      module_quiz_state: {
        ...storedState,
        video_progress: videoProgress
      }
    };

    const lessons = flattenCourseLessons(course, modules);
    const completedLessons = new Set([
      ...legacyCompletedLessonKeys(course, modules, existing.completed_lessons),
      ...completedValueArray(existing.completed_lessons).filter((value) => Number.isNaN(Number(value))).map(String)
    ]);
    lessons.forEach((item) => {
      if (lessonProgressFromState(virtualRow, item).completed || legacyOrderCompleted(existing.completed_lessons, item.order)) {
        completedLessons.add(item.key);
      }
    });

    const completedModules = new Set([
      ...legacyCompletedModuleKeys(course, modules, existing.completed_modules),
      ...completedValueArray(existing.completed_modules).filter((value) => Number.isNaN(Number(value))).map(String)
    ]);
    modules.forEach((module, index) => {
      if (moduleProgressFromState(course, modules, index, virtualRow).completed || legacyOrderCompleted(existing.completed_modules, index + 1)) {
        completedModules.add(moduleProgressKey(course, module, index));
      }
    });

    return {
      student_id: state.student.id,
      course_id: course.id,
      completed_lessons: Array.from(completedLessons),
      completed_modules: Array.from(completedModules),
      rewarded_modules: Array.isArray(existing.rewarded_modules) ? existing.rewarded_modules : [],
      quiz_completed: Boolean(existing.quiz_completed || (modules.length > 0 && completedModules.size >= modules.length)),
      quiz_score: existing.quiz_score || 0,
      module_quiz_state: virtualRow.module_quiz_state,
      updated_at: new Date().toISOString()
    };
  }

  function mergeLocalProgressRow(payload) {
    const index = state.data.progress.findIndex((item) => sameId(item.student_id || item.user_id, payload.student_id) && sameId(item.course_id, payload.course_id));
    if (index >= 0) {
      state.data.progress[index] = { ...state.data.progress[index], ...payload };
    } else {
      state.data.progress.push({ ...payload });
    }
  }

  async function submitQuestion(event) {
    event.preventDefault();
    const courseId = document.getElementById("questionCourse")?.value || null;
    const title = document.getElementById("questionTitle")?.value.trim();
    const details = document.getElementById("questionDetails")?.value.trim();
    const link = document.getElementById("questionLink")?.value.trim();
    if (!title || !details) return;
    if (!courseId || !studentCourseIds().has(String(courseId))) {
      showAlert("Choose one of your enrolled courses before submitting a question.", true);
      return;
    }
    try {
      const question = await submitQuestionRecord({ courseId, title, details, link });
      if (question?.id) state.selectedQuestionId = question.id;
      state.questionsFilter = "all";
      event.target.reset(); document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "true");
      showAlert("Question submitted to your LMS team.");
      await loadAllData({ silent: true, force: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to submit question. Check the projects table schema and RLS."), true);
    }
  }

  async function submitQuestionRecord({ courseId, title, details, link }) {
    if (getClient()?.rpc) {
      const { data, error } = await getClient().rpc("lms_submit_student_question", {
        target_user_id: state.student.id,
        target_course_id: courseId,
        question_title: title,
        question_description: details,
        question_link: link || null
      });
      if (!error) return Array.isArray(data) ? data[0] : data;
      if (!isMissingRpcError(error)) throw error;
    }
    const isEnrolled = studentCourseIds().has(String(courseId));
    if (!isEnrolled) throw new Error("You can ask questions only for enrolled courses.");
    const questionBatch = batchForCourse(courseId);
    const fallbackQuestion = {
      student_id: state.student.id, user_id: state.student.id,
      batch_id: questionBatch?.id || null,
      course_id: courseId, title, description: details,
      drive_link: link || null, file_url: link || null,
      status: "pending", type: "question",
      created_at: new Date().toISOString()
    };
    const questionWithoutBatch = { ...fallbackQuestion };
    delete questionWithoutBatch.batch_id;
    await insertFirstWorking("projects", [fallbackQuestion, questionWithoutBatch], { retryOnConstraint: true });
    return fallbackQuestion;
  }

  async function postChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById("chatMessage");
    const message = input?.value.trim();
    const batchId = document.getElementById("chatBatchSelect")?.value || currentBatch()?.id || state.selectedBatchId;
    if (batchId) state.selectedBatchId = batchId;
    if (!message || !batchId) {
      showAlert("Choose a batch before sending messages.", true);
      return;
    }

    try {
      const payload = { batch_id: batchId, user_id: state.student.id, message, parent_id: state.replyToChatId, created_at: new Date().toISOString() };
      const { data, error } = await getClient().from("batch_chats").insert(payload).select(SELECTS.chats).maybeSingle();
      if (error) throw error;
      state.data.chats = mergeRowsById(state.data.chats, [data || { ...payload, id: randomId() }]);
      state.replyToChatId = null;
      input.value = "";
      input.placeholder = "Write a message to your batch...";
      renderChat();
      clearAlert();
      showChatStatus("Message posted.");
      void refreshChatRows({ force: true });
    } catch (error) {
      showChatStatus("");
      showAlert(userFriendlyError(error, "Unable to post chat message. Check batch chat RLS."), true);
    }
  }

  function prepareChatReply(chatId) {
    state.replyToChatId = chatId;
    const source = state.data.chats.find((chat) => sameId(chat.id, chatId));
    const input = document.getElementById("chatMessage");
    renderChatReplyBar();
    if (input) {
      input.placeholder = source?.message ? `Reply to: ${truncate(source.message, 40)}` : "Write a message to your batch...";
      input.focus();
    }
  }

  function openTaskModal(taskId) {
    const task = state.data.batchTasks.find((item) => sameId(item.id, taskId));
    if (!task) return;
    const submissions = submissionsForTask(taskId).sort((a, b) => new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0));
    const existing = submissions[0] || null;
    const resourceLink = taskResourceLink(task);
    openModal(existing ? "Resubmit Task" : "Submit Task", `
      <form class="stack-form" id="taskSubmitForm">
        <p class="muted">${escapeHtml(task.title || "Task")}</p>
        <div class="task-submit-link">
          <span>Task Resource</span>
          ${resourceLink
        ? `<a class="secondary-btn" href="${escapeAttr(resourceLink)}" target="_blank" rel="noopener">Open Task Link</a>`
        : `<p class="muted">No task resource link has been added.</p>`}
        </div>
        ${existing ? `
          <div class="import-callout">Latest submission: ${escapeHtml(formatDateTime(existing.submitted_at || existing.created_at))}. You can resubmit; the previous submission remains in history.</div>
          ${taskSubmissionLink(existing) ? `<a class="secondary-btn" href="${escapeAttr(taskSubmissionLink(existing))}" target="_blank" rel="noopener">Open Your Submission</a>` : ""}
        ` : ""}
        ${submissions.length ? `
          <div class="task-submit-link">
            <span>Submission History</span>
            ${submissions.slice(0, 5).map((submission, index) => `
              <a class="secondary-btn" href="${escapeAttr(taskSubmissionLink(submission) || "#")}" target="_blank" rel="noopener">
                ${index === 0 ? "Latest" : `Attempt ${submissions.length - index}`} - ${escapeHtml(formatDateTime(submission.submitted_at || submission.created_at))}
              </a>
            `).join("")}
          </div>
        ` : ""}
          <label>
            <span>Submission Link</span>
            <input id="taskSubmissionDriveLink" type="url" placeholder="https://your-project-link.example">
          </label>
          <label>
            <span>Or Upload File</span>
            <input id="taskSubmissionFile" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.png,.jpg,.jpeg,.webp">
          </label>
          <small class="muted">Accepted: documents, archives, and images up to 25MB.</small>
          <button class="primary-btn" type="submit">${existing ? "Resubmit Task" : "Submit Task"}</button>
      </form>
    `);
    document.getElementById("taskSubmitForm")?.addEventListener("submit", (event) => submitTask(event, task, Boolean(existing)));
  }

  async function submitTask(event, task, isResubmission = false) {
    event.preventDefault();
    const form = event.currentTarget;
    await runLockedSubmit(form, event.submitter, "Submitting task...", async () => {
      const link = document.getElementById("taskSubmissionDriveLink")?.value.trim();
      const file = document.getElementById("taskSubmissionFile")?.files?.[0] || null;
      if (!link && !file) {
        showAlert("Add a submission link or upload a file before submitting.", true);
        return;
      }
      const meter = file ? createUploadMeter(form, file) : null;
      try {
        const fileUrl = file ? await uploadAssignmentSubmission(file, task.id) : "";
        const result = await submitTaskRecord(task, fileUrl || link, { isResubmission, originalLink: link, fileUrl });
        state.selectedTaskId = task.id;
        state.taskFilter = "submitted";
        closeModal();
        const reward = Number(result?.reward_amount || 0);
        showAlert(`${isResubmission ? "Task resubmission" : "Task submission"} saved.${reward ? ` You earned ${reward} coins.` : ""}`);
        await loadAllData({ silent: true, force: true });
      } catch (error) {
        showAlert(userFriendlyError(error, "Unable to save task submission. Check task submission RLS."), true);
      } finally {
        meter?.remove();
      }
    });
  }

  async function submitTaskRecord(task, link, options = {}) {
    const { data, error } = await getClient().rpc("lms_submit_task_once", {
      target_task_id: task.id,
      target_student_id: state.student.id,
      submission_drive_link: link
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  }

  async function uploadAssignmentSubmission(file, taskId) {
    validateUploadFile(file, {
      maxBytes: 25 * 1024 * 1024,
      types: [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
        "image/png",
        "image/jpeg",
        "image/webp"
      ]
    });
    const safeName = String(file.name || "assignment-file").replace(/[^a-z0-9._-]+/gi, "-");
    const path = `${state.student.id}/${taskId}/${Date.now()}-${safeName}`;
    const { error } = await getClient().storage.from("assignment-submissions").upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });
    if (error) throw error;
    return `assignment-submissions:${path}`;
  }

  function validateUploadFile(file, options = {}) {
    if (!file) throw new Error("Choose a file first.");
    const maxBytes = Number(options.maxBytes || 10 * 1024 * 1024);
    const types = new Set(options.types || []);
    if (file.size > maxBytes) throw new Error(`File is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
    if (types.size && !types.has(file.type)) throw new Error("This file type is not allowed.");
  }

  async function purchaseItem(itemId) {
    const item = state.data.shopItems.find((shopItem) => sameId(shopItem.id, itemId));
    if (!item) return;
    if (item.deleted_at || ["archived", "disabled", "inactive"].includes(String(item.status || "active").toLowerCase())) {
      showAlert("This reward is not available right now.", true);
      return;
    }
    if (item.stock !== undefined && item.stock !== null && Number(item.stock) <= 0) {
      showAlert("This reward is out of stock.", true);
      return;
    }
    const price = Number(item.price || item.coins || 0);
    const coins = Number(state.student.coins || 0);
    if (coins < price) {
      showAlert("You do not have enough coins for this reward.", true);
      return;
    }

    try {
      const { data, error } = await getClient().rpc("lms_purchase_shop_item", { target_item_id: item.id });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      state.student.coins = Number(result?.coins ?? coins - price);
      showAlert("Reward added to your profile.");
      await loadAllData({ silent: true });
    } catch (error) {
      const message = /duplicate|unique/i.test(error.message || "")
        ? "You already own this reward."
        : userFriendlyError(error, "Unable to buy item. Check the shop purchase table permissions.");
      showAlert(message, true);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const payload = {
      name: document.getElementById("profileName")?.value.trim() || state.student.name,
      username: document.getElementById("profileUsername")?.value.trim() || null,
      phone: document.getElementById("profilePhone")?.value.trim() || null
    };

    try {
      await updateStudentProfile(payload);
      showAlert("Profile updated.");
      const inputs = ["profileName", "profileUsername", "profilePhone"].map(id => document.getElementById(id));
      inputs.forEach(input => { if (input) input.disabled = true; });
      const actions = document.getElementById("profileFormActions");
      if (actions) actions.style.display = "none";
      const btnText = document.getElementById("profileEditToggleBtn");
      if (btnText) btnText.innerHTML = `<span class="edit-icon">Edit</span> Edit Details`;
      await loadAllData({ silent: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to update profile."), true);
    }
  }

  async function updateStudentProfile(payload) {
    const { error } = await getClient().rpc("lms_update_own_profile", {
      profile_name: payload.name || null,
      profile_username: payload.username || null,
      profile_phone: payload.phone || null
    });
    if (error) throw error;
    state.student = normalizeUser({ ...state.student, ...payload });
    const index = state.data.users.findIndex((user) => sameId(user.id, state.student.id));
    if (index >= 0) {
      state.data.users[index] = normalizeUser({ ...state.data.users[index], ...payload });
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));
    renderIdentity();
  }

  async function updatePassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById("currentPassword")?.value;
    const password = document.getElementById("newPassword")?.value;
    if (!currentPassword) {
      showAlert("Enter your current password.", true);
      return;
    }
    if (!password || password.length < 6) {
      showAlert("Password must be at least 6 characters.", true);
      return;
    }
    try {
      await window.JenovateAuth.signInWithPassword(state.student.email, currentPassword);
      const { data, error } = await getClient().auth.updateUser({ password });
      if (error) throw error;
      if (!data?.user) throw new Error("Password update failed.");
      event.target.reset();
      const form = document.getElementById("passwordForm");
      if (form) form.style.display = "none";
      showAlert("Password updated.");
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to update password."), true);
    }
  }

  async function logout() {
    if (window.JenovateAuth?.signOut) await window.JenovateAuth.signOut();
    else clearStoredSessions();
    window.location.replace("login.html?from=logout");
  }

  function clearStoredSessions() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(APP_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(MENTOR_SESSION_KEY);
  }

  function openMobileMenu() {
    document.body.classList.add("sidebar-open");
    document.querySelector(".student-sidebar")?.classList.add("mobile-open", "open");
    document.getElementById("studentSidebarScrim")?.classList.add("show");
    document.getElementById("studentMenuBtn")?.setAttribute("aria-expanded", "true");
  }

  function closeMobileMenu() {
    document.body.classList.remove("sidebar-open");
    document.querySelector(".student-sidebar")?.classList.remove("mobile-open", "open");
    document.getElementById("studentSidebarScrim")?.classList.remove("show");
    document.getElementById("studentMenuBtn")?.setAttribute("aria-expanded", "false");
  }

  function openLearningPanel() {
    document.body.classList.add("learning-panel-open");
    document.getElementById("studentSidePanel")?.classList.add("open");
  }

  function closeLearningPanel() {
    document.body.classList.remove("learning-panel-open");
    document.getElementById("studentSidePanel")?.classList.remove("open");
  }

  function handleTopSearch(event) {
    state.query = String(event.target.value || "").trim().toLowerCase();
    clearTimeout(state.searchTimer);
    if (state.query && !["catalog", "courses", "learn"].includes(state.activeView)) { state.courseVisibleCount = 8; setView("catalog", { historyMode: "none" }); }
    state.searchTimer = setTimeout(renderActiveView, 120);
  }

  function initializeHistoryNavigation() {
    const current = history.state?.studentView;
    if (!current || !views[current]) {
      history.replaceState({ studentView: "dashboard" }, "", window.location.href);
    }
    history.pushState({ studentView: "dashboard", studentGuard: true }, "", window.location.href);
    window.addEventListener("popstate", () => {
      if (state.activeView !== "dashboard") {
        setView("dashboard", { historyMode: "none" });
        history.pushState({ studentView: "dashboard", studentGuard: true }, "", window.location.href);
      } else if (window.confirm("Go back to the login page?")) {
        window.location.replace("login.html?from=back");
      } else {
        history.pushState({ studentView: "dashboard", studentGuard: true }, "", window.location.href);
      }
    });
  }

  function setView(viewName, options = {}) {
    if (!views[viewName]) return;
    const previousView = state.activeView;
    state.activeView = viewName;
    document.body.dataset.studentView = viewName;
    Object.entries(views).forEach(([name, element]) => {
      element?.classList.toggle("active", name === viewName);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === viewName);
    });
    document.querySelectorAll("[data-panel-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.panelView === viewName);
    });
    document.querySelectorAll(".student-top-nav [data-jump]").forEach((button) => {
      button.classList.toggle("active", button.dataset.jump === viewName);
    });
    document.querySelectorAll(".page-tabs [data-jump]").forEach((button) => {
      button.classList.toggle("active", button.dataset.jump === viewName);
    });
    viewTitle.textContent = views[viewName].dataset.title || "Student LMS";
    viewKicker.textContent = views[viewName].dataset.kicker || "Jenovate";
    const topbarTitle = document.querySelector(".student-topbar-title");
    if (topbarTitle) topbarTitle.textContent = views[viewName].dataset.title || "Student LMS";
    if (viewName === "learn") {
      openLearningPanel();
    } else {
      closeLearningPanel();
    }
    document.querySelector(".student-main")?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
    renderActiveView();
    if (options.historyMode !== "none" && previousView !== viewName) {
      history.pushState({ studentView: viewName }, "", window.location.href);
    }
  }

  function ensureSelections() {
    const courses = enrolledCourses();
    if (!state.selectedCourseId || !courses.some((course) => sameId(course.id, state.selectedCourseId))) {
      state.selectedCourseId = preferredLearningCourse(courses)?.id || "";
    }
    const batches = scopedBatches();
    if (!state.selectedBatchId || !batches.some((batch) => sameId(batch.id, state.selectedBatchId))) {
      state.selectedBatchId = currentBatch()?.id || batches[0]?.id || "";
    }
  }

  function selectedCourse() {
    const courses = enrolledCourses();
    return courses.find((course) => sameId(course.id, state.selectedCourseId)) || courses[0] || null;
  }

  function enrolledCourses() {
    const ids = studentCourseIds();
    const sourceCourses = mergedCourseRows(state.data.courses, state.data.catalogCourses);
    return ids.size ? sourceCourses.filter((course) => ids.has(String(course.id)) && isStudentVisibleCourse(course)) : [];
  }

  function isArchivedCourse(course) { return !isStudentVisibleCourse(course); }
  function isStudentVisibleCourse(course) { return !course?.deleted_at && String(course?.status || "").toLowerCase() === "active"; }
  function isInactiveRecord(item) { return item?.deleted_at || ["archived", "deleted", "inactive", "cancelled", "removed", "disabled"].includes(String(item?.status || "active").toLowerCase()); }
  function catalogCourses() {
    const courses = mergedCourseRows(state.data.catalogCourses, state.data.courses);
    return (courses.length ? courses : state.data.courses).filter((course) => isStudentVisibleCourse(course));
  }

  function mergedCourseRows(...sources) {
    const rows = new Map();
    sources.flat().filter(Boolean).forEach((course) => {
      const key = String(course.id || course.title || randomId());
      const existing = rows.get(key);
      if (!existing || courseRichness(course) > courseRichness(existing)) {
        rows.set(key, { ...(existing || {}), ...course });
      } else {
        rows.set(key, { ...course, ...existing });
      }
    });
    return Array.from(rows.values());
  }

  function courseRichness(course) {
    return parseModules(course?.modules).length * 100 + Object.values(course || {}).filter(Boolean).length;
  }

  function preferredLearningCourse(courses) {
    return [...courses].sort((a, b) => courseContentScore(b) - courseContentScore(a))[0]
      || null;
  }

  function courseContentScore(course) {
    const modules = parseModules(course?.modules);
    const lessonCount = modules.reduce((sum, module) => sum + moduleLessons(module).length, 0);
    const quizCount = modules.reduce((sum, module) => sum + Number(moduleQuiz(module)?.questions?.length || 0), 0);
    const publishedBonus = isStudentVisibleCourse(course) ? 1 : 0;
    return lessonCount * 1000 + quizCount * 100 + modules.length * 10 + publishedBonus;
  }

  function studentCourseIds() {
    return assignedCourseIds();
  }
  function assignedCourseIds() {
    const ids = new Set();
    parseIdList(state.student.course_ids).forEach((id) => ids.add(String(id)));
    state.data.userCourses
      .filter((item) => (
        sameId(item.user_id || item.student_id || item.learner_id, state.student.id)
        && !item.deleted_at
        && !["cancelled", "archived", "removed"].includes(String(item.status || "active").toLowerCase())
      ))
      .forEach((item) => item.course_id && ids.add(String(item.course_id)));
    state.data.batches
      .filter((batch) => sameId(batch.id, state.student.batch_id))
      .forEach((batch) => batch.course_id && ids.add(String(batch.course_id)));
    return ids;
  }
  function studentMentorIds() {
    const ids = new Set();
    state.data.batches
      .filter((batch) => sameId(batch.id, state.student.batch_id) || studentCourseIds().has(String(batch.course_id)))
      .forEach((batch) => batch.mentor_id && ids.add(String(batch.mentor_id)));
    return ids;
  }
  function scopedBatches() {
    const courseIds = studentCourseIds();
    return state.data.batches.filter((batch) => !isInactiveRecord(batch) && (sameId(batch.id, state.student.batch_id) || courseIds.has(String(batch.course_id))));
  }
  function studentBatchFilterIds() { const ids = new Set(parseIdList(state.student?.batch_id).map(String)); parseIdList(state.selectedBatchId).forEach((id) => ids.add(String(id))); state.data.batches.filter((batch) => !isInactiveRecord(batch) && (sameId(batch.id, state.student?.batch_id) || studentCourseIds().has(String(batch.course_id)))).forEach((batch) => ids.add(String(batch.id))); state.data.userCourses.filter((item) => sameId(item.user_id || item.student_id || item.learner_id, state.student?.id) && item.batch_id && !isInactiveRecord(item)).forEach((item) => ids.add(String(item.batch_id))); return Array.from(ids).filter(Boolean); }
  function currentBatch() {
    const batches = scopedBatches();
    return batches.find((batch) => sameId(batch.id, state.selectedBatchId)) || batches.find((batch) => sameId(batch.id, state.student.batch_id)) || batches[0] || (state.selectedBatchId ? { id: state.selectedBatchId } : null);
  }
  function batchForCourse(courseId) {
    const batches = scopedBatches();
    const enrollment = state.data.userCourses.find((item) => sameId(item.user_id || item.student_id || item.learner_id, state.student.id) && sameId(item.course_id, courseId) && item.batch_id);
    if (enrollment?.batch_id) return batches.find((batch) => sameId(batch.id, enrollment.batch_id)) || { id: String(enrollment.batch_id) };
    return batches.find((batch) => sameId(batch.course_id, courseId)) || batches.find((batch) => sameId(batch.id, state.student.batch_id)) || batches[0] || null;
  }

  function scopedTasks() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.batchTasks.filter((task) => (
      !isInactiveRecord(task)
      && (!task.batch_id || batchIds.has(String(task.batch_id)))
    ));
  }

  function scopedChats() {
    const selected = currentBatch();
    if (selected) {
      return state.data.chats.filter((chat) => !chat.batch_id || sameId(chat.batch_id, selected.id));
    }
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.chats.filter((chat) => !chat.batch_id || batchIds.has(String(chat.batch_id)));
  }

  function scopedAnnouncements() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    const courseIds = studentCourseIds();
    const selected = currentBatch();
    return state.data.announcements
      .filter((item) => {
        const status = String(item.status || "published").toLowerCase();
        const audience = String(item.audience || "all").toLowerCase();
        const expired = item.expires_at && new Date(item.expires_at).getTime() < Date.now();
        if (!["published", "active", "live", "sent", ""].includes(status) || expired) return false;
        if (["all", "student", "students", "learner", "learners"].includes(audience)) return true;
        if (item.batch_id && (sameId(item.batch_id, selected?.id) || batchIds.has(String(item.batch_id)))) return true;
        if (item.course_id && courseIds.has(String(item.course_id))) return true;
        if (["batch", "batches"].includes(audience) && !item.batch_id) return true;
        if (["course", "courses"].includes(audience) && !item.course_id) return true;
        return false;
      })
      .sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));
  }

  function classmatesForBatch(batch) {
    if (!batch) return [];
    return state.data.users.filter((user) => (
      sameId(user.batch_id, batch.id)
      && String(user.role).toLowerCase() === "student"
      && String(user.email).toLowerCase() !== "adolf@gmail.com"
      && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")
    ));
  }

  function mentorForBatch(batch) {
    if (!batch) return null;
    return state.data.users.find((user) => sameId(user.id, batch.mentor_id))
      || state.data.users.find((user) => String(user.role).toLowerCase() === "mentor");
  }

  function courseForBatch(batch) {
    if (!batch) return null;
    return state.data.courses.find((item) => sameId(item.id, batch.course_id)) || null;
  }

  function batchPeriod(batch) {
    const start = batch?.start_date ? formatDate(batch.start_date) : "";
    const end = batch?.end_date ? formatDate(batch.end_date) : "";
    if (start && end) return `${start} to ${end}`;
    return start || end || "Not set";
  }

  function myQuestions() {
    return state.data.projects.filter((project) => {
      const mine = sameId(project.student_id, state.student.id) || sameId(project.user_id, state.student.id);
      const type = String(project.type || "question").toLowerCase();
      return mine && type === "question";
    });
  }

  function submissionForTask(taskId) {
    return state.data.taskSubmissions
      .filter((submission) => sameId(submission.task_id, taskId)
        && (sameId(submission.student_id, state.student.id) || sameId(submission.user_id, state.student.id)))
      .sort((a, b) => new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0))[0] || null;
  }

  function taskSubmissionLink(task) {
    return String(task?.drive_link || task?.google_drive_link || task?.submission_url || task?.file_url || "").trim();
  }

  function taskResourceLink(task) {
    return String(task?.drive_link || task?.google_drive_link || task?.file_url || "").trim();
  }

  function filteredCourses(courses) {
    return filteredRecords(courses, ["title", "name", "description", "category", "difficulty"]);
  }

  function filteredRecords(records, keys) {
    if (!state.query) return records;
    return records.filter((record) => keys.some((key) => String(record[key] || "").toLowerCase().includes(state.query)));
  }

  function filteredAnnouncement(item) {
    if (!state.query) return true;
    return [
      item.title,
      item.message,
      item.audience,
      item.priority,
      announcementAudienceLabel(item),
      announcementTargetLabel(item)
    ].some((value) => String(value || "").toLowerCase().includes(state.query));
  }

  function announcementAudienceLabel(item) {
    const audience = String(item?.audience || "all").toLowerCase();
    if (audience === "batch") return "Batch";
    if (audience === "course") return "Course";
    if (["student", "students", "learner", "learners"].includes(audience)) return "Students";
    return "Students and mentors";
  }

  function announcementTargetLabel(item) {
    const audience = String(item?.audience || "all").toLowerCase();
    if (audience === "batch") {
      const batch = state.data.batches.find((row) => sameId(row.id, item?.batch_id));
      return batch?.name || "Your batch";
    }
    if (audience === "course") {
      const course = state.data.courses.find((row) => sameId(row.id, item?.course_id));
      return course?.title || course?.name || "Your course";
    }
    return announcementAudienceLabel(item);
  }

  function announcementColor(item) {
    const priority = String(item?.priority || "normal").toLowerCase();
    if (priority === "urgent") return "danger";
    if (priority === "important") return "warning";
    return "success";
  }

  function isReviewedSubmission(submission) {
    const status = String(submission?.status || "").toLowerCase();
    return Boolean(String(submission?.feedback || "").trim())
      || /reviewed|approved|graded|accepted|completed|resolved/.test(status);
  }

  function statusTone(value) {
    const status = String(value || "").toLowerCase();
    if (/done|complete|submitted|approved|resolved|active/.test(status)) return "success";
    if (/reject|cancel|fail|overdue/.test(status)) return "danger";
    return "warning";
  }

  function humanizeStatus(value) {
    return String(value || "Pending")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function purchaseItemId(purchase) {
    return purchase?.item_id || purchase?.shop_item_id || purchase?.product_id || purchase?.reward_id;
  }

  function tasksForCourse(course) {
    const batchIds = new Set(scopedBatches()
      .filter((batch) => sameId(batch.course_id, course.id))
      .map((batch) => String(batch.id)));
    return scopedTasks().filter((task) => (
      !task.deleted_at
      && !["draft", "unpublished", "archived", "deleted", "cancelled"].includes(String(task.status || "published").toLowerCase())
      && (sameId(task.course_id, course.id) || batchIds.has(String(task.batch_id || "")))
    ));
  }

  function moduleContentProgressFromState(course, modules, moduleIndex, row) {
    const lessons = flattenCourseLessons(course, modules).filter((item) => item.moduleIndex === moduleIndex);
    const measured = lessons
      .map((item) => lessonProgressFromState(row, item))
      .filter((item) => item.durationSeconds > 0);
    const totalDuration = measured.reduce((sum, item) => sum + item.durationSeconds, 0);
    if (totalDuration > 0) {
      const watched = measured.reduce((sum, item) => sum + Math.min(item.watchedSeconds, item.durationSeconds), 0);
      return clamp((watched / totalDuration) * 100, 0, 100);
    }
    if (!lessons.length) return null;
    const completed = lessons.filter((item) => (
      lessonProgressFromState(row, item).completed || legacyOrderCompleted(row?.completed_lessons, item.order)
    )).length;
    return clamp((completed / lessons.length) * 100, 0, 100);
  }

  function courseProgress(course) {
    const row = state.data.progress.find((item) => sameId(item.course_id, course.id) && sameId(item.student_id, state.student.id));
    const modules = parseModules(course.modules);
    const lessons = flattenCourseLessons(course, modules);
    const totalLessons = lessons.length;
    const completedLessons = lessons.filter((item) => (
      lessonProgressFromState(row, item).completed || legacyOrderCompleted(row?.completed_lessons, item.order)
    )).length;
    const moduleStates = modules.map((module, index) => {
      const measured = moduleProgressFromState(course, modules, index, row);
      const completed = measured.completed || legacyOrderCompleted(row?.completed_modules, index + 1);
      return { ...measured, completed, percent: completed ? 100 : measured.percent };
    });
    const completedModules = moduleStates.filter((module) => module.completed).length;
    const explicitProgress = numberFrom(row?.progress ?? row?.percentage ?? row?.percent);
    const lessonContent = lessons.map((item) => lessonProgressFromState(row, item));
    const measuredDurations = lessonContent.map((item) => item.durationSeconds).filter((duration) => duration > 0);
    const fallbackDuration = measuredDurations.length
      ? measuredDurations.reduce((sum, duration) => sum + duration, 0) / measuredDurations.length
      : 1;
    const contentWeight = lessonContent.reduce((sum, item) => sum + (item.durationSeconds || fallbackDuration), 0);
    const contentPercent = lessonContent.length && contentWeight > 0
      ? clamp(lessonContent.reduce((sum, item) => (
        sum + (item.completed ? 100 : item.percent) * (item.durationSeconds || fallbackDuration)
      ), 0) / contentWeight, 0, 100)
      : explicitProgress !== null
        ? clamp(explicitProgress, 0, 100)
        : 0;

    const requiredTasks = tasksForCourse(course);
    const requiredTaskIds = new Set(requiredTasks.map((task) => String(task.id)));
    const submittedTaskIds = new Set(state.data.taskSubmissions
      .filter((submission) => (
        sameId(submission.student_id || submission.user_id, state.student.id)
        && !submission.deleted_at
        && requiredTaskIds.has(String(submission.task_id || ""))
        && isSubmittedAssignment(submission)
      ))
      .map((submission) => String(submission.task_id)));
    const assignmentCompletion = requiredTasks.length ? (submittedTaskIds.size / requiredTasks.length) * 100 : 0;

    const requiredQuizzes = courseQuizCatalog(course);
    const completedQuizzes = requiredQuizzes.filter((quiz) => {
      const attempt = bestQuizAttempt(course.id, quiz.moduleId, quiz.id);
      if (!attempt) return false;
      if (attempt.passed === true || String(attempt.passed).toLowerCase() === "true") return true;
      const score = numberFrom(attempt.score ?? attempt.quiz_score);
      const maximum = numberFrom(attempt.total ?? attempt.max_score);
      const passScore = maximum !== null ? Math.ceil(maximum * quiz.passRatio) : null;
      return score !== null && passScore !== null && score >= passScore;
    }).length;
    const quizCompletion = requiredQuizzes.length ? (completedQuizzes / requiredQuizzes.length) * 100 : 0;

    const contentAvailable = totalLessons > 0 || explicitProgress !== null;
    const percent = window.JenovateAcademicMetrics
      ? Math.round(window.JenovateAcademicMetrics.courseProgress({
        content: { value: contentPercent, available: contentAvailable },
        assignments: { value: assignmentCompletion, available: requiredTasks.length > 0 },
        quizzes: { value: quizCompletion, available: requiredQuizzes.length > 0 }
      }))
      : Math.round(contentPercent);

    return {
      row,
      modules,
      totalLessons,
      completedLessons,
      completedModules,
      contentPercent: Math.round(contentPercent),
      assignmentCompletion: Math.round(assignmentCompletion),
      quizCompletion: Math.round(quizCompletion),
      percent
    };
  }

  function lessonProgressFromState(row, lessonItem) {
    const entry = progressJsonState(row).video_progress[lessonItem?.key] || {};
    const durationSeconds = numberFrom(entry.duration_seconds) || lessonDurationSeconds(lessonItem?.lesson) || 0;
    const watchedSeconds = clamp(Number(entry.watched_seconds || 0), 0, durationSeconds || Number.MAX_SAFE_INTEGER);
    const percent = durationSeconds
      ? clamp(Math.round((watchedSeconds / durationSeconds) * 100), 0, 100)
      : clamp(Math.round(Number(entry.percent || 0)), 0, 100);
    const completed = Boolean(entry.completed || percent >= 95);
    return { watchedSeconds, durationSeconds, percent, completed };
  }

  function moduleProgressFromState(course, modules, moduleIndex, row) {
    const module = modules[moduleIndex];
    const lessons = flattenCourseLessons(course, modules).filter((item) => item.moduleIndex === moduleIndex);
    const mediaLessons = lessons.filter((item) => item.mediaUrl);
    const quiz = moduleQuiz(module);
    const hasQuiz = Boolean(quiz?.questions?.length);
    const quizCompleted = !hasQuiz || moduleQuizCompleted(course, module, quiz);
    const measured = mediaLessons
      .map((item) => lessonProgressFromState(row, item))
      .filter((item) => item.durationSeconds > 0);
    const totalDuration = measured.reduce((sum, item) => sum + item.durationSeconds, 0);
    if (totalDuration > 0) {
      const watched = measured.reduce((sum, item) => sum + Math.min(item.watchedSeconds, item.durationSeconds), 0);
      const percent = clamp(Math.round((watched / totalDuration) * 100), 0, 100);
      const completed = percent >= 95 && quizCompleted;
      return { percent: completed ? 100 : percent, completed, watchedSeconds: watched, durationSeconds: totalDuration };
    }

    const completedLessons = lessons.filter((item) => (
      lessonProgressFromState(row, item).completed || legacyOrderCompleted(row?.completed_lessons, item.order)
    )).length;
    const percent = clamp(Math.round((completedLessons / Math.max(1, lessons.length)) * 100), 0, 100);
    const lessonCompleted = lessons.length ? percent >= 100 : true;
    const storedCompleted = completedValueArray(row?.completed_modules).map(String).includes(moduleProgressKey(course, module, moduleIndex));
    const completed = (storedCompleted || lessonCompleted) && quizCompleted;
    return {
      percent: completed ? 100 : (hasQuiz && !quizCompleted ? Math.min(percent, 95) : percent),
      completed,
      watchedSeconds: 0,
      durationSeconds: 0
    };
  }

  function moduleQuizCompleted(course, module, quiz = moduleQuiz(module)) {
    if (!quiz?.questions?.length) return true;
    const best = bestQuizAttempt(course?.id, module?.id, quiz?.id);
    if (!best) return false;
    if (best.passed === true || String(best.passed).toLowerCase() === "true") return true;
    const score = numberFrom(best.score ?? best.quiz_score);
    const total = numberFrom(best.total ?? best.max_score ?? best.maxScore);
    if (score === null) return false;
    const storedPassScore = numberFrom(best.pass_score);
    if (storedPassScore !== null) return score >= storedPassScore;
    if (total !== null) return score >= quizAttemptPassMarks(quiz, total);
    return total ? Math.round((score / total) * 100) >= 60 : false;
  }

  function progressJsonState(row) {
    const parsed = typeof row?.module_quiz_state === "string" ? tryJson(row.module_quiz_state) : row?.module_quiz_state;
    const stateValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    const videoProgress = stateValue.video_progress && typeof stateValue.video_progress === "object" && !Array.isArray(stateValue.video_progress)
      ? stateValue.video_progress
      : {};
    return { ...stateValue, video_progress: videoProgress };
  }

  function progressSnapshot(watchedSeconds, durationSeconds) {
    const duration = Math.max(0, Number(durationSeconds || 0));
    const watched = duration ? clamp(Number(watchedSeconds || 0), 0, duration) : Math.max(0, Number(watchedSeconds || 0));
    const percent = duration ? clamp(Math.round((watched / duration) * 100), 0, 100) : 0;
    return { watchedSeconds: watched, durationSeconds: duration, percent, completed: percent >= 95 };
  }

  function updateLessonProgressStatus(snapshot) {
    const percent = snapshot?.percent || 0;
    setText("lessonProgressPercent", `${percent}%`);
    setText("lessonProgressMeta", snapshot?.durationSeconds
      ? `${formatDuration(snapshot.watchedSeconds)} / ${formatDuration(snapshot.durationSeconds)}`
      : "No progress yet");
  }

  function completedValueArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "number") return Array.from({ length: Math.max(0, Math.floor(value)) }, (_, index) => index + 1);
    if (typeof value === "string") {
      const parsed = tryJson(value);
      if (Array.isArray(parsed)) return parsed;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Array.from({ length: Math.max(0, Math.floor(numeric)) }, (_, index) => index + 1) : [];
    }
    return [];
  }

  function legacyOrderCompleted(value, order) {
    return completedValueArray(value).some((item) => Number(item) >= Number(order));
  }

  function legacyCompletedLessonKeys(course, modules, value) {
    const numeric = Number(value);
    const count = Number.isFinite(numeric) ? numeric : Array.isArray(value) && value.every((item) => Number.isFinite(Number(item))) ? value.length : 0;
    if (!count) return [];
    return flattenCourseLessons(course, modules).slice(0, count).map((item) => item.key);
  }

  function legacyCompletedModuleKeys(course, modules, value) {
    const numeric = Number(value);
    const count = Number.isFinite(numeric) ? numeric : Array.isArray(value) && value.every((item) => Number.isFinite(Number(item))) ? value.length : 0;
    if (!count) return [];
    return modules.slice(0, count).map((module, index) => moduleProgressKey(course, module, index));
  }

  function moduleProgressKey(course, module, index) {
    return [course?.id || "course", "module", module?.id || index + 1].map((item) => String(item)).join(":");
  }

  function lessonDurationSeconds(lesson) {
    const value = String(lesson?.duration || lesson?.time || "").trim().toLowerCase();
    if (!value) return 0;
    const colonParts = value.split(":").map((part) => Number(part.trim()));
    if (colonParts.length > 1 && colonParts.every((part) => Number.isFinite(part))) {
      return colonParts.reduce((total, part) => (total * 60) + part, 0);
    }
    const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*(h|hr|hour)/)?.[1] || 0);
    const minutes = Number(value.match(/(\d+(?:\.\d+)?)\s*(m|min|minute)/)?.[1] || 0);
    const seconds = Number(value.match(/(\d+(?:\.\d+)?)\s*(s|sec|second)/)?.[1] || 0);
    if (hours || minutes || seconds) return Math.round((hours * 3600) + (minutes * 60) + seconds);
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 60) : 0;
  }

  function timeRangesSeconds(ranges) {
    let total = 0;
    for (let index = 0; index < ranges.length; index += 1) {
      total += Math.max(0, ranges.end(index) - ranges.start(index));
    }
    return total;
  }

  function formatDuration(value) {
    const seconds = Math.max(0, Math.round(Number(value || 0)));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function lessonDurationLabel(lesson, fallback = "Video lesson") {
    const status = String(lesson?.duration_status || lesson?.durationStatus || "").trim().toLowerCase();
    const raw = String(lesson?.duration || lesson?.time || "").trim();
    return !raw || status.includes("estimated") || status.includes("unavailable") || status.includes("requires_source") || /duration unavailable|unavailable|unknown/i.test(raw) ? fallback : raw;
  }

  function averageCourseProgress(courses) {
    if (!courses.length) return 0;
    return Math.round(courses.reduce((sum, course) => sum + courseProgress(course).percent, 0) / courses.length);
  }

  function completedCount(value) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = tryJson(value);
      if (Array.isArray(parsed)) return parsed.length;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    return 0;
  }

  function flattenCourseLessons(course, modules = parseModules(course?.modules)) {
    return modules.flatMap((module, moduleIndex) => {
      const sourceLessons = module.lessons;
      return sourceLessons.map((lesson, lessonIndex) => ({
        key: lessonKey(course?.id, moduleIndex, lessonIndex, lesson),
        course,
        module,
        moduleIndex,
        lesson,
        lessonIndex,
        order: lessonsBefore(modules, moduleIndex) + lessonIndex + 1,
        mediaUrl: lessonMediaUrl(lesson)
      }));
    });
  }

  function selectedLessonDetails(course) {
    const lessons = flattenCourseLessons(course);
    return lessons.find((item) => item.key === state.selectedLessonKey) || lessons[0] || null;
  }

  function lessonKey(courseId, moduleIndex, lessonIndex, lesson) {
    return [courseId || "course", moduleIndex, lessonIndex, lesson?.id || lesson?.title || "lesson"].map((item) => String(item)).join(":");
  }

  function lessonMediaUrl(lesson) { const candidates = [lesson?.video_drive_link, lesson?.videoDriveLink, lesson?.video_url, lesson?.videoUrl, lesson?.google_drive_link, lesson?.googleDriveLink, lesson?.drive_link, lesson?.driveLink, lesson?.url, lesson?.content_url, lesson?.contentUrl]; return candidates.map((item) => String(item || "").trim()).find((item) => item && (isVideoLesson(lesson) || !looksLikeStudyMaterialUrl(item))) || ""; }

  function lessonMaterialUrl(lesson) {
    const isVideo = isVideoLesson(lesson);
    const candidates = [lesson?.material_url, lesson?.materialUrl, lesson?.study_material_url, lesson?.studyMaterialUrl, lesson?.notes_url, lesson?.notesUrl, lesson?.pdf_url, lesson?.pdfUrl, lesson?.file_url, lesson?.fileUrl, isVideo ? "" : lesson?.drive_link, isVideo ? "" : lesson?.driveLink, lesson?.content_url, lesson?.contentUrl, lesson?.resource_url, lesson?.resourceUrl];
    return candidates.map((item) => String(item || "").trim()).find((item) => item && looksLikeStudyMaterialUrl(item)) || "";
  }

  function isVideoLesson(lesson) { const type = String(lesson?.content_type || lesson?.contentType || lesson?.type || "").toLowerCase(); if (/\b(video|recorded|lecture|media)\b/.test(type)) return true; if (/\b(material|resource|pdf|document|note|assignment)\b/.test(type)) return false; return Boolean(lesson?.video_drive_link || lesson?.videoDriveLink || lesson?.video_url || lesson?.videoUrl || lesson?.video || lesson?.media_url); }

  function looksLikeStudyMaterialUrl(url) {
    const text = String(url || "").trim(); return Boolean(text) && (/\.(pdf|docx?|pptx?|xlsx?|zip|txt)(?:$|\?|#)/i.test(text) || /\/storage\/v1\/object\/(?:sign|public)\/study-materials\//i.test(text) || /docs\.google\.com\/(?:document|presentation|spreadsheets)\//i.test(text) || (isGoogleDriveUrl(text) && !/\.(mp4|webm|ogg|mov)(?:$|\?|#)/i.test(text)));
  }

  function mediaEmbedUrl(url) {
    if (!url) return "";
    const text = String(url).trim();
    if (isGoogleDriveUrl(text)) {
      return contentService.providerFileId?.(text) ? contentService.providerPreviewUrl?.(text) || "" : "";
    }
    const youtube = youtubeId(text);
    if (youtube) return `https://www.youtube.com/embed/${youtube}`;
    if (/player\.vimeo\.com\/video\//i.test(text)) return text;
    const vimeo = text.match(/vimeo\.com\/(\d+)/i);
    if (vimeo?.[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return "";
  }

  function resourcePreviewUrl(url, contentType = "") {
    if (!url) return "";
    const text = String(url).trim();
    const type = String(contentType || "").toLowerCase();
    try { const parsed = new URL(text, window.location.href); if (parsed.origin === window.location.origin && isBareStorageMaterialPath(parsed.pathname)) return ""; } catch {}
    const driveContent = contentService.providerPreviewUrl?.(text);
    if (driveContent) return driveContent;
    const drivePreview = mediaEmbedUrl(text);
    if (/\.pdf(?:$|\?|#)/i.test(text) || type.includes("pdf")) return text;
    if (/\/storage\/v1\/object\/(?:sign|public)\/study-materials\//i.test(text) && !/\.(mp4|webm|ogg|mov)(?:$|\?|#)/i.test(text)) return text;
    if (/docs\.google\.com\/(?:document|presentation|spreadsheets)\//i.test(text)) return text.replace(/\/edit(?:\?.*)?$/i, "/preview");
    return "";
  }

  function youtubeId(url) {
    const patterns = [
      /youtube\.com\/watch\?[^#]*v=([^&#]+)/i,
      /youtu\.be\/([^?&#]+)/i,
      /youtube\.com\/embed\/([^?&#]+)/i,
      /youtube\.com\/shorts\/([^?&#]+)/i
    ];
    for (const pattern of patterns) {
      const match = String(url).match(pattern);
      if (match?.[1]) return match[1];
    }
    return "";
  }

  function isGoogleDriveUrl(url) { const text = String(url || "").trim(); try { return Boolean(text) && (contentService.isProviderUrl?.(text) || /(^|\.)drive\.google\.com$/i.test(new URL(text, window.location.href).hostname)); } catch { return /drive\.google\.com/i.test(text); } }

  function isDirectVideoUrl(url) {
    return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(String(url || ""));
  }

  function parseModules(value) {
    const parsed = parseJsonDeep(value);
    const source = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.modules)
        ? parsed.modules
        : Array.isArray(parsed?.course_modules)
          ? parsed.course_modules
          : Array.isArray(parsed?.data?.modules)
            ? parsed.data.modules
            : Array.isArray(parsed?.course?.modules)
              ? parsed.course.modules
              : Array.isArray(parsed?.curriculum)
                ? parsed.curriculum
                : Array.isArray(parsed?.syllabus)
                  ? parsed.syllabus
                  : Array.isArray(parsed?.content)
                    ? parsed.content
                    : Array.isArray(parsed?.lessons)
                      ? [{ title: parsed.title || "Course content", lessons: parsed.lessons, quiz: parsed.quiz || parsed.questions || parsed.quizQuestions }]
                      : Array.isArray(parsed?.items)
                        ? parsed.items
                        : parsed && typeof parsed === "object"
                          ? Object.values(parsed)
                          : [];
    return source.filter((module) => module && !module.deleted_at).map((module, index) => {
      if (typeof module === "string") {
        return { id: `module-${index + 1}`, title: module, description: "", order_index: index + 1, lessons: [{ title: module, order_index: 1 }] };
      }
      if (typeof module !== "object") {
        return { id: `module-${index + 1}`, title: `Module ${index + 1}`, description: String(module || ""), order_index: index + 1, lessons: [] };
      }
      const parsedLessonSources = [
        module.lessons,
        module.lesson_list,
        module.lessonList,
        module.module_lessons,
        module.moduleLessons,
        module.videos,
        module.resources,
        module.studyMaterials,
        module.study_materials,
        module.materials,
        module.items,
        module.content
      ].map(parseJsonDeep).filter(Array.isArray);
      const parsedLessons = [];
      const seenLessons = new Set();
      parsedLessonSources.flat().forEach((lesson) => {
        const key = typeof lesson === "string"
          ? `text:${lesson}`
          : [
            lesson?.id,
            lesson?.lesson_id,
            lesson?.title,
            lesson?.name,
            lesson?.video_drive_link,
            lesson?.video_url,
            lesson?.drive_link,
            lesson?.driveLink,
            lesson?.google_drive_link,
            lesson?.googleDriveLink,
            lesson?.url
          ].filter(Boolean).join(":");
        const stableKey = key || `lesson-${parsedLessons.length + 1}`;
        if (seenLessons.has(stableKey)) return;
        seenLessons.add(stableKey);
        parsedLessons.push(lesson);
      });
      const moduleId = module.id || module.module_id || `module-${index + 1}`;
      const moduleTitle = module.title || module.name || module.module_title || module.heading || `Module ${index + 1}`;
      return {
        id: moduleId,
        title: moduleTitle,
        description: module.description || module.summary || "",
        type: module.type || module.module_type || "Self-paced",
        order_index: Number(module.order_index || module.order || index + 1),
        quiz: normalizeQuiz(
          module.quiz
          || module.module_quiz
          || module.moduleQuiz
          || module.quizQuestions
          || module.quiz_questions
          || module.quiz_items
          || module.questions
          || module.question_list
          || module.data?.quiz
          || module.data?.questions
          || module.assessment
          || module.test,
          { ...module, id: moduleId, title: moduleTitle }
        ),
        lessons: parsedLessons.filter((lesson) => typeof lesson === "string" || !lesson?.deleted_at).map((lesson, lessonIndex) => typeof lesson === "string"
          ? { id: `lesson-${index + 1}-${lessonIndex + 1}`, title: lesson, order_index: lessonIndex + 1 }
          : {
            id: lesson.id || lesson.lesson_id || `lesson-${index + 1}-${lessonIndex + 1}`,
            title: lesson.title || lesson.name || lesson.lesson_title || lesson.heading || `Lesson ${lessonIndex + 1}`,
            description: lesson.description || lesson.summary || "",
            content_type: lesson.content_type || lesson.contentType || lesson.type || (lesson.material_url || lesson.materialUrl ? "study_material" : "video"),
            duration: lesson.duration || lesson.time || "",
            transcript: lesson.transcript || "",
            order_index: Number(lesson.order_index || lesson.order || lessonIndex + 1),
            video_drive_link: lesson.video_drive_link || lesson.videoDriveLink || lesson.drive_video || "",
            video_url: lesson.video_url || lesson.videoUrl || lesson.video || lesson.media_url || "",
            drive_link: lesson.drive_link || lesson.driveLink || lesson.google_drive_link || lesson.googleDriveLink || lesson.url || "",
            google_drive_link: lesson.google_drive_link || lesson.googleDriveLink || "",
            file_url: lesson.file_url || lesson.fileUrl || "",
            url: lesson.url || "",
            content_url: lesson.content_url || lesson.contentUrl || "",
            material_url: lesson.material_url || lesson.materialUrl || (isVideoLesson(lesson) ? "" : lesson.drive_link || lesson.driveLink || lesson.google_drive_link || lesson.googleDriveLink || "")
          }).sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0))
      };
    }).sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
  }

  function moduleLessons(module) {
    return Array.isArray(module?.lessons) ? module.lessons : [];
  }

  function moduleQuiz(module) {
    return module?.quiz || normalizeQuiz(
      module?.module_quiz
      || module?.moduleQuiz
      || module?.quizQuestions
      || module?.quiz_questions
      || module?.quiz_items
      || module?.questions
      || module?.question_list
      || module?.data?.quiz
      || module?.data?.questions
      || module?.assessment
      || module?.test,
      module
    );
  }

  function normalizeQuiz(rawQuiz, module = {}) {
    if (!rawQuiz) return null;
    const parsedQuiz = parseJsonDeep(rawQuiz);
    const source = Array.isArray(parsedQuiz) ? { questions: parsedQuiz } : parsedQuiz;
    if (!source || typeof source !== "object") return null;
    const rawQuestions = Array.isArray(source.questions)
      ? source.questions
      : Array.isArray(source.quizQuestions)
        ? source.quizQuestions
        : Array.isArray(source.quiz_questions)
          ? source.quiz_questions
          : Array.isArray(source.items)
            ? source.items
            : Array.isArray(source.question_list)
              ? source.question_list
              : Array.isArray(source.data?.questions)
                ? source.data.questions
                : Array.isArray(source.quiz?.questions)
                  ? source.quiz.questions
                  : [];
    const questions = rawQuestions.map(normalizeQuizQuestion).filter((question) => question.text);
    const totalMarks = questions.reduce((sum, question) => sum + Number(question.marks || 0), 0);
    const title = source.title || source.name || `${module?.title || "Module"} Quiz`;
    if (!questions.length && !String(title || "").trim()) return null;
    return {
      id: source.id || source.quiz_id || `quiz-${module?.id || randomId()}`,
      title,
      pass_marks: Number(source.pass_marks || source.passMarks || source.passing_score || Math.ceil(totalMarks * 0.6) || 0),
      random_count: Number(source.random_count || source.randomQuestions || source.random_questions || 0),
      max_attempts: Number(source.max_attempts || source.maxAttempts || 0),
      timer_minutes: Number(source.timer_minutes || source.timerMinutes || source.duration_minutes || source.durationMinutes || 0),
      status: String(source.status || source.publish_status || (source.is_published === false ? "draft" : "published")).toLowerCase(),
      questions
    };
  }

  function normalizeQuizQuestion(question, index = 0) {
    if (!question || typeof question !== "object") return { id: randomId(), text: "", option_a: "", option_b: "", option_c: "", option_d: "", answer: "A", marks: 1 };

    let opt_a = "", opt_b = "", opt_c = "", opt_d = "";
    if (question.option_a || question.option_b) {
      opt_a = String(question.option_a || question.a || "");
      opt_b = String(question.option_b || question.b || "");
      opt_c = String(question.option_c || question.c || "");
      opt_d = String(question.option_d || question.d || "");
    }
    else if (question.optionA || question.optionB) {
      opt_a = String(question.optionA || "");
      opt_b = String(question.optionB || "");
      opt_c = String(question.optionC || "");
      opt_d = String(question.optionD || "");
    }
    else if (question.option1 || question.option2) {
      opt_a = String(question.option1 || "");
      opt_b = String(question.option2 || "");
      opt_c = String(question.option3 || "");
      opt_d = String(question.option4 || "");
    }

    // Format 4: choices array [{text, isCorrect}, ...] or [{label, value}, ...]
    else if (Array.isArray(question.choices) && question.choices.length) {
      const letters = ["A", "B", "C", "D"];
      const slots = [opt_a, opt_b, opt_c, opt_d];
      question.choices.slice(0, 4).forEach((choice, i) => {
        slots[i] = typeof choice === "string" ? choice : String(choice.text || choice.label || choice.value || choice.option || "");
      });
      [opt_a, opt_b, opt_c, opt_d] = slots;
    }

    // Format 5: answers object {A: "text", B: "text"} or {"1": "text"}
    else if (question.answers && typeof question.answers === "object" && !Array.isArray(question.answers)) {
      const ans = question.answers;
      opt_a = String(ans.A || ans.a || ans["1"] || ans[1] || "");
      opt_b = String(ans.B || ans.b || ans["2"] || ans[2] || "");
      opt_c = String(ans.C || ans.c || ans["3"] || ans[3] || "");
      opt_d = String(ans.D || ans.d || ans["4"] || ans[4] || "");
    }
    else if (question.options !== undefined) {
      const rawOpts = question.options;

      if (Array.isArray(rawOpts)) {
        // Strip letter prefix if present: "A) text", "a. text", "(A) text", "1. text"
        const stripped = rawOpts.map((item) => {
          if (typeof item === "string") return item.replace(/^[A-Da-d1-4][\)\.\s]+/, "").trim();
          return typeof item === "object" ? String(item.text || item.label || item.value || item.option || "") : String(item || "");
        });
        opt_a = stripped[0] || "";
        opt_b = stripped[1] || "";
        opt_c = stripped[2] || "";
        opt_d = stripped[3] || "";
      } else if (typeof rawOpts === "object" && rawOpts !== null) {
        opt_a = String(rawOpts.a || rawOpts.A || rawOpts["1"] || rawOpts[0] || "");
        opt_b = String(rawOpts.b || rawOpts.B || rawOpts["2"] || rawOpts[1] || "");
        opt_c = String(rawOpts.c || rawOpts.C || rawOpts["3"] || rawOpts[2] || "");
        opt_d = String(rawOpts.d || rawOpts.D || rawOpts["4"] || rawOpts[3] || "");
      }
    }

    let rawAnswer = question.answer || question.correct || question.correct_answer
      || question.correctAnswer || question.correct_option
      || question.rightAnswer || question.right_answer || "A";

    // correct_option as 1-based number (1=A, 2=B, 3=C, 4=D)
    const answerNum = Number(rawAnswer);
    if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= 4) {
      rawAnswer = ["A", "B", "C", "D"][answerNum - 1];
    }

    // Handle choices array with isCorrect flag
    if (Array.isArray(question.choices) && question.choices.length && !question.answer) {
      const correctIdx = question.choices.findIndex((c) =>
        c.isCorrect === true || c.is_correct === true || c.correct === true
      );
      if (correctIdx >= 0 && correctIdx <= 3) {
        rawAnswer = ["A", "B", "C", "D"][correctIdx];
      }
    }

    if (![opt_a, opt_b, opt_c, opt_d].some(Boolean) && !/^[A-Da-d1-4]$/.test(String(rawAnswer).trim())) {
      opt_a = String(rawAnswer || "").trim();
      rawAnswer = "A";
    }

    return {
      id: question.id || question.question_id || randomId(),
      text: question.text || question.question || question.question_text || question.questionText || question.prompt || question.prompt_text || question.title || question.q || "",
      option_a: opt_a,
      option_b: opt_b,
      option_c: opt_c,
      option_d: opt_d,
      answer: normalizeAnswerKey(rawAnswer),
      marks: Math.max(1, Number(question.marks || question.score || question.points || question.weight || 1)),
      explanation: question.explanation || question.hint || ""
    };
  }

  function normalizeAnswerKey(value) {
    const text = String(value || "A").trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(text)) return text;
    const number = Number(text);
    if (number >= 1 && number <= 4) return ["A", "B", "C", "D"][number - 1];
    // Handle "OPTION_A", "OPTION A" etc.
    if (text.includes("A")) return "A";
    if (text.includes("B")) return "B";
    if (text.includes("C")) return "C";
    if (text.includes("D")) return "D";
    return "A";
  }

  function quizTotalMarks(quiz) {
    return (quiz?.questions || []).reduce((sum, question) => sum + Number(question.marks || 0), 0);
  }

  function quizAttemptsFor(courseId, moduleId, quizId) {
    const course = state.data.courses.find((c) => sameId(c.id, courseId));
    const modules = course ? parseModules(course.modules) : [];
    const quizModules = modules.filter((module) => {
      const quiz = normalizeQuiz(module.quiz || module.quizQuestions || module.questions, module);
      return quiz && quiz.questions && quiz.questions.length > 0;
    });
    const hasOnlyOneQuiz = quizModules.length === 1;
    return state.data.quizAttempts.filter((attempt) => (
      sameId(attempt.student_id || attempt.user_id, state.student.id)
      && !attempt.deleted_at
      && sameId(attempt.course_id, courseId)
      && (
        sameId(attempt.module_id, moduleId)
        || sameId(attempt.quiz_id, quizId)
        || (
          (attempt.module_id === null || attempt.module_id === undefined || attempt.quiz_id === null || attempt.quiz_id === undefined)
          && hasOnlyOneQuiz
          && sameId(quizModules[0].id, moduleId)
        )
      )
    ));
  }

  function bestQuizAttempt(courseId, moduleId, quizId) {
    const course = state.data.courses.find((c) => sameId(c.id, courseId));
    const modules = course ? parseModules(course.modules) : [];
    const quizModules = modules.filter(m => {
      const q = normalizeQuiz(m.quiz || m.quizQuestions || m.questions, m);
      return q && q.questions && q.questions.length > 0;
    });
    const hasOnlyOneQuiz = quizModules.length === 1;

    return state.data.quizAttempts
      .filter((attempt) => (
        sameId(attempt.student_id || attempt.user_id, state.student.id)
        && !attempt.deleted_at
        && sameId(attempt.course_id, courseId)
        && (
          sameId(attempt.module_id, moduleId)
          || sameId(attempt.quiz_id, quizId)
          || (
            (attempt.module_id === null || attempt.module_id === undefined || attempt.quiz_id === null || attempt.quiz_id === undefined)
            && hasOnlyOneQuiz
            && sameId(quizModules[0].id, moduleId)
          )
        )
      ))
      .sort((a, b) => Number(b.score || b.quiz_score || 0) - Number(a.score || a.quiz_score || 0))[0] || null;
  }

  function formatQuizTime(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(total / 60);
    const remainder = Math.floor(total % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")} left`;
  }

  function lessonsBefore(modules, moduleIndex) {
    return modules.slice(0, moduleIndex).reduce((sum, module) => sum + module.lessons.length, 0);
  }

  // Returns the ISO key ("YYYY-MM-DD") for Monday of the current week.
  function thisWeekMondayKey() {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7; // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    return dateKeyFromDate(monday);
  }
  // On the first login of a new week (Monday or later after last week)
  // the count resets to 1.
  function nextDailyStreakState(profile) {
    const today = todayKey();
    const lastActive = dateKeyFromValue(profile?.last_active_date);
    const current = Math.max(0, Math.floor(Number(profile?.streak_count || 0)));
    if (lastActive === today) {
      return { count: current, today, shouldSave: false };
    }

    const monday = thisWeekMondayKey();
    const isThisWeek = lastActive && lastActive >= monday;

    return {
      count: isThisWeek ? Math.min(7, current + 1) : 1,
      today,
      shouldSave: true
    };
  }

  // The persisted counter is the real consecutive-day streak. The weekly dots below
  // remain a separate Mon-Sun view and intentionally clamp this history to the week.
  function currentStreak() {
    const count = Math.max(0, Math.floor(Number(state.student?.streak_count || 0)));
    const lastActive = dateKeyFromValue(state.student?.last_active_date);
    if (!lastActive || count === 0) return 0;
    const today = todayKey();
    const yesterday = shiftDateKey(today, -1);
    return lastActive === today || lastActive === yesterday ? count : 0;
  }

  function isActiveToday() {
    return dateKeyFromValue(state.student?.last_active_date) === todayKey();
  }

  function weeklyActivityScore() {
    return weeklyActiveDateKeys().size;
  }

  function weeklyActiveDateKeys() {
    // Source of truth: streak_count = how many days this week the student logged in.
    // last_active_date = the most recent login day.
    // We fill backward from last_active_date for streak_count days,
    // last-week activity to bleed into the current week's dots.
    const monday = thisWeekMondayKey();
    const sunday = weekDays()[6].key; // last day of this week
    const lastActive = dateKeyFromValue(state.student?.last_active_date);
    const streak = Math.max(0, Math.floor(Number(state.student?.streak_count || 0)));
    const active = new Set();

    localWeeklyStreakDates().forEach((key) => active.add(key));

    if (!lastActive || streak <= 0) return active;
    // Safety: lastActive must be within this week
    if (lastActive < monday || lastActive > sunday) return active;

    // Walk backward from lastActive for exactly streak days, stop at Monday
    for (let i = 0; i < streak; i++) {
      const key = shiftDateKey(lastActive, -i);
      if (key >= monday) {
        active.add(key);
      } else {
        break; // gone past Monday, stop
      }
    }

    return active;
  }

  function localStreakStorageKey() {
    return `jenovate:lms:weekly-streak:${String(state.student?.id || "anonymous")}`;
  }

  function localWeeklyStreakDates() {
    if (!state.student?.id) return new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(localStreakStorageKey()) || "null");
      if (saved?.week !== thisWeekMondayKey() || !Array.isArray(saved.dates)) return new Set();
      const monday = thisWeekMondayKey();
      const sunday = weekDays()[6].key;
      return new Set(saved.dates.filter((key) => key >= monday && key <= sunday));
    } catch {
      return new Set();
    }
  }

  function recordLocalStreakVisit() {
    if (!state.student?.id) return;
    try {
      const dates = localWeeklyStreakDates();
      dates.add(todayKey());
      localStorage.setItem(localStreakStorageKey(), JSON.stringify({
        week: thisWeekMondayKey(),
        dates: [...dates].sort()
      }));
    } catch (error) {
      studentDebug("Local streak visit could not be saved.", error);
    }
  }



  function weekDays() {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = addDays(today, -mondayOffset);
    const labels = ["M", "T", "W", "T", "F", "S", "S"];
    const full = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return labels.map((label, index) => {
      const date = addDays(start, index);
      return {
        key: dateKeyFromDate(date),
        shortLabel: label,
        fullLabel: full[index]
      };
    });
  }

  function todayKey() {
    return dateKeyFromDate(new Date());
  }

  function dateKeyFromDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateKeyFromValue(value) {
    if (!value) return "";
    const text = String(value);
    const match = text.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    const date = new Date(text);
    return Number.isNaN(date.valueOf()) ? "" : dateKeyFromDate(date);
  }

  function shiftDateKey(key, delta) {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + delta);
    return dateKeyFromDate(date);
  }

  function addDays(date, delta) {
    const copy = new Date(date);
    copy.setHours(12, 0, 0, 0);
    copy.setDate(copy.getDate() + delta);
    return copy;
  }

  function daysBetween(startKey, endKey) {
    const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
    const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
    const start = Date.UTC(startYear, startMonth - 1, startDay);
    const end = Date.UTC(endYear, endMonth - 1, endDay);
    return Math.round((end - start) / 86400000);
  }

  function firstName(value) {
    return String(value || "Student").trim().split(/\s+/)[0] || "Student";
  }

  async function copyProfileReferKey() {
    const referKey = studentReferKey(state.student);
    if (!referKey) return showAlert("Your Refer Key is still loading. Please try again in a moment.", true);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(referKey);
      else {
        const input = document.getElementById("profileReferKey");
        input?.select?.();
        document.execCommand("copy");
        input?.blur?.();
      }
      showAlert("Refer Key copied!");
    } catch {
      showAlert("Copy failed. Select the Refer Key manually.", true);
    }
  }

  function studentReferKey(profile = {}) {
    const key = String(profile?.referral_key || "").trim();
    return key && !/^jnv-?(?:0+|pending|account)$/i.test(key) ? key.toUpperCase() : "";
  }

  function studentDisplayName(user = {}) {
    const value = [
      user.display_name,
      user.full_name,
      user.name,
      user.username,
      user.email
    ]
      .map((item) => String(item || "").trim())
      .find((item) => item && !/^(student|student user|learner|learner user|user)$/i.test(item));
    if (!value) return "Student";
    return value.includes("@") ? value.split("@")[0] : value;
  }

  function achievements() {
    const courses = enrolledCourses();
    const completed = courses.filter((course) => courseProgress(course).percent >= 100).length;
    const submitted = state.data.taskSubmissions.filter((item) => sameId(item.student_id, state.student.id) || sameId(item.user_id, state.student.id)).length;
    const questions = myQuestions().length;
    return [
      { label: "Courses active", value: String(courses.length) },
      { label: "Courses completed", value: String(completed) },
      { label: "Tasks submitted", value: String(submitted) },
      { label: "Questions asked", value: String(questions) },
      { label: "Current coins", value: formatNumber(state.student.coins) },
      { label: "Current streak", value: `${currentStreak()} day${currentStreak() === 1 ? "" : "s"}` },
      { label: "Weekly active days", value: `${weeklyActivityScore()}/7` }
    ];
  }

  function renderCompactTasks(targetId, tasks) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = tasks.length ? tasks.map((task) => `
      <div class="message-card">
        <strong>${escapeHtml(task.title || "Task")}</strong>
        <p>${escapeHtml(task.deadline ? `Due ${formatDate(task.deadline)}` : "No deadline")}</p>
      </div>
    `).join("") : emptyState("No upcoming tasks", "You are clear for now.");
  }

  function renderCompactChats(targetId, chats) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = chats.length ? chats.map((chat) => {
      const user = state.data.users.find((item) => sameId(item.id, chat.user_id));
      return `
        <div class="message-card">
          <strong>${escapeHtml(user?.name || user?.email || "User")}</strong>
          <p>${escapeHtml(truncate(chat.message || "", 90))}</p>
        </div>
      `;
    }).join("") : emptyState("No batch chat yet", "Messages will show here.");
  }

  function renderCompactAnnouncements(targetId, announcements) {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = announcements.length ? announcements.map((item) => `
      <div class="message-card">
        <strong>${escapeHtml(item.title || "Announcement")}</strong>
        <p>${escapeHtml(truncate(item.message || "", 96))}</p>
      </div>
    `).join("") : emptyState("No announcements", "New notices will show here.");
  }

  function announcementCard(item) {
    return `
      <article class="announcement-card ${escapeAttr(item.priority || "normal")}">
        <div class="announcement-topline">
          <span class="pill ${announcementColor(item)}">${escapeHtml(announcementAudienceLabel(item))}</span>
          <small class="muted">${escapeHtml(formatDate(item.published_at || item.created_at))}</small>
        </div>
        <h3>${escapeHtml(item.title || "Announcement")}</h3>
        <p>${escapeHtml(item.message || "")}</p>
        <div class="card-footer">
          <small class="card-meta">${escapeHtml(announcementTargetLabel(item))}</small>
          <small class="card-meta">${escapeHtml(item.created_by_role === "mentor" ? "Mentor" : "Admin")}</small>
        </div>
      </article>
    `;
  }

  async function insertFirstWorking(table, payloads, options = {}) {
    let lastError = null;
    for (const payload of payloads) {
      const compactPayload = stripNullish(payload);
      const { error } = await getClient().from(table).insert(compactPayload);
      if (!error) return;
      lastError = error;
      if (!isSchemaShapeError(error) && !(options.retryOnConstraint && isConstraintError(error))) break;
    }
    throw lastError || new Error(`Unable to insert into ${table}.`);
  }

  async function updateFirstWorking(table, id, payloads) {
    let lastError = null;
    for (const payload of payloads) {
      const compactPayload = stripNullish(payload);
      delete compactPayload.created_at;
      const { error } = await getClient().from(table).update(compactPayload).eq("id", id);
      if (!error) return;
      lastError = error;
      if (!isSchemaShapeError(error)) break;
    }
    throw lastError || new Error(`Unable to update ${table}.`);
  }
  function normalizeUser(user) {
    const displayName = studentDisplayName(user);
    return {
      ...user,
      id: user.id ? String(user.id) : "",
      name: displayName,
      role: String(user.role || "student").toLowerCase(),
      coins: Math.max(Number(user.coins || 0), Number(user.coin_balance || 0)),
      streak_count: Number(user.streak_count || 0),
      last_login_reward_date: user.last_login_reward_date || "",
      reward_history: Array.isArray(user.reward_history) ? user.reward_history : []
    };
  }

  function isMissingRpcError(error) {
    return /function|schema cache|not found|could not find|permission denied/i.test(error?.message || "")
      || ["PGRST202", "42501"].includes(String(error?.code || ""));
  }

  function notifyDailyLoginReward() {
    if (!state.student?.daily_login_reward_claimed) return;
    const amount = Number(state.student.daily_login_reward_amount || 10);
    const bonus = Number(state.student.daily_login_streak_bonus || 0);
    showAlert(bonus > 0 ? `Daily Login Reward Claimed! +${amount} Coins including +${bonus} streak bonus` : `Daily Login Reward Claimed! +${amount} Coins`);
    delete state.student.daily_login_reward_claimed;
    delete state.student.daily_login_reward_amount;
    delete state.student.daily_login_streak_bonus;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));
  }

  function normalizeCourse(course) {
    const modules = parseModules(firstNonEmptyCourseContent(course));
    return {
      ...course,
      id: course?.id ? String(course.id) : "",
      modules
    };
  }

  function normalizeEnrollment(item) {
    const userId = item.user_id || item.student_id || item.learner_id || "";
    return {
      ...item,
      user_id: userId ? String(userId) : "",
      student_id: item.student_id ? String(item.student_id) : "",
      learner_id: item.learner_id ? String(item.learner_id) : "",
      course_id: item.course_id ? String(item.course_id) : ""
    };
  }
  function firstNonEmptyCourseContent(course) {
    const fields = [
      course?.modules,
      course?.course_modules,
      course?.curriculum,
      course?.syllabus,
      course?.content,
      course?.lessons,
      course?.data
    ];
    return fields.find((field) => {
      const parsed = parseJsonDeep(field);
      if (Array.isArray(parsed)) return parsed.length > 0;
      return parsed && typeof parsed === "object" && Object.keys(parsed).length > 0;
    }) || course?.modules || [];
  }

  function setLoading(active) {
    loadingPanel?.classList.toggle("active", active);
  }
  function setSyncStatus(message) {
    if (syncStatus) syncStatus.textContent = "";
  }
  function showAlert(message, isError = false) { if (!alertBox) return; alertBox.textContent = message; alertBox.classList.toggle("error", Boolean(isError)); alertBox.classList.add("show"); window.clearTimeout(showAlert.timer); showAlert.timer = window.setTimeout(() => alertBox.classList.remove("show"), isError ? 7000 : 3500); }
  function clearAlert() { if (!alertBox) return; alertBox.textContent = ""; alertBox.classList.remove("show", "error"); window.clearTimeout(showAlert.timer); }
  function showChatStatus(message) { const target = document.getElementById("chatStatus"); if (!target) return; target.textContent = message || ""; window.clearTimeout(showChatStatus.timer); if (message) showChatStatus.timer = window.setTimeout(() => { target.textContent = ""; }, 2200); }
  function openModal(title, body) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modal?.classList.toggle("quiz-modal", /quiz/i.test(String(title || "")));
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    modal?.classList.remove("open");
    modal?.classList.remove("quiz-modal");
    modal?.classList.remove("resource-modal");
    modal?.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
  }
})();
