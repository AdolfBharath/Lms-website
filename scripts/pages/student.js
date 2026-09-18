(function () {
  const SESSION_KEY = "jenovateStudentSession";
  const APP_SESSION_KEY = "jenovateCurrentUser";
  const ADMIN_SESSION_KEY = "jenovateAdminSession";
  const MENTOR_SESSION_KEY = "jenovateMentorSession";
  const getClient = () => window.getSupabaseClient?.();
  const PAGE_SIZE = 20;
  const CHAT_PAGE_SIZE = 30;
  const QUERY_CACHE_TTL = 45_000;
  const QUERY_CACHE_PREFIX = "jenovate:lms:student:v3:";
  const SELECTS = {
    users: "id,name,email,role,username,phone,batch_id,course_ids,coins,streak_count,last_active_date,last_login_reward_date,reward_history,status,deleted_at,created_at,referral,referral_key",
    courses: "id,title,description,category,duration,module_type,instructor_name,thumbnail_url,rating,price,difficulty,modules,is_featured,is_my_course,status,created_by_admin,quiz_coin_reward,quiz_pass_score,mentor_id,created_at,google_form_url",
    batches: "id,name,course_id,mentor_id,capacity,enroll_limit,smart_waitlist,status,start_date,end_date,progress,enrolled_count,created_at",
    userCourses: "id,user_id,student_id,learner_id,course_id,batch_id,created_at,status,deleted_at",
    progress: "student_id,course_id,completed_lessons,completed_modules,rewarded_modules,quiz_completed,quiz_score,updated_at,quiz_attempts,quiz_failed_attempts,quiz_locked,quiz_rewatch_required,quiz_last_score,quiz_last_total,quiz_best_score,module_quiz_state",
    shopItems: "id,name,price,image_url,created_at",
    purchases: "id,user_id,item_id,purchased_at",
    projects: "id,title,description,status,student_id,user_id,batch_id,course_id,type,drive_link,file_url,file_urls,review_notes,feedback,reviewed_at,created_at,updated_at",
    batchTasks: "id,batch_id,title,description,file_url,drive_link,deadline,status,created_by,created_at",
    taskSubmissions: "id,task_id,student_id,user_id,batch_id,course_id,status,drive_link,file_url,file_type,submitted_at,created_at,feedback",
    quizAttempts: "id,student_id,course_id,score,total,pass_score,passed,attempt_number,module_id,module_order,module_title,quiz_id,max_score,answers,created_at,submitted_at",
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
      fallbackSelect: "id,name,email,role,username,phone,batch_id,course_ids,coins,streak_count,last_active_date,created_at,referral,referral_key",
      limit: 500,
      scope: "studentUsers"
    },
    { key: "courses", table: "courses", select: SELECTS.courses, limit: 30, scope: "courseCatalog" },
    { key: "catalogCourses", table: "courses", select: SELECTS.courses, limit: 30, scope: "courseCatalog" },
    { key: "batches", table: "batches", select: SELECTS.batches, limit: PAGE_SIZE, scope: "studentBatches" },
    { key: "userCourses", table: "user_courses", select: SELECTS.userCourses, fallbackSelect: "user_id,course_id,created_at,status", limit: 200, scope: "studentUserCourses" },
    { key: "progress", table: "student_course_progress", select: SELECTS.progress, limit: 200, scope: "studentOnlyRows" },
    { key: "shopItems", table: "shop_items", select: SELECTS.shopItems, limit: PAGE_SIZE },
    { key: "purchases", table: "shop_purchases", select: SELECTS.purchases, optional: true, limit: 30, scope: "studentPurchaseRows" },
    { key: "studentShopPurchases", table: "student_shop_purchases", select: SELECTS.purchases, optional: true, limit: 30, scope: "studentPurchaseRows" },
    { key: "projects", table: "projects", select: SELECTS.projects, fallbackSelect: "id,title,description,status,student_id,user_id,batch_id,course_id,type,file_urls,review_notes,feedback,created_at", limit: 100, scope: "studentProjectRows", order: "created_at.desc" },
    { key: "batchTasks", table: "batch_tasks", select: SELECTS.batchTasks, fallbackSelect: "id,batch_id,title,description,file_url,drive_link,deadline,created_by,created_at", limit: PAGE_SIZE, scope: "studentBatchRows" },
    { key: "taskSubmissions", table: "task_submissions", select: SELECTS.taskSubmissions, fallbackSelect: "id,task_id,student_id,status,drive_link,file_url,file_type,submitted_at,feedback", limit: 200, scope: "studentOnlyRows", order: "submitted_at.desc" },
    { key: "quizAttempts", table: "student_quiz_attempts", select: SELECTS.quizAttempts, optional: true, limit: 200, scope: "studentOnlyRows", order: "submitted_at.desc" },
    { key: "chats", table: "batch_chats", select: SELECTS.chats, limit: CHAT_PAGE_SIZE, scope: "studentBatchRows", order: "created_at.desc" },
    { key: "announcements", table: "announcements", select: SELECTS.announcements, limit: 30, order: "published_at.desc" },
    { key: "supportTickets", table: "support_tickets", select: SELECTS.supportTickets, optional: true, limit: 30, scope: "supportOwnerRows", order: "updated_at.desc" },
    { key: "supportMessages", table: "support_messages", select: SELECTS.supportMessages, optional: true, limit: 120, order: "created_at.desc" },
    { key: "supportNotifications", table: "support_notifications", select: SELECTS.supportNotifications, optional: true, limit: 30, scope: "supportNotificationRows", order: "created_at.desc" }
  ];

  const state = {
    student: null,
    activeView: "dashboard",
    courseFilter: "active",
    catalogCategory: "all",
    catalogFilter: "all",
    catalogFiltersOpen: false,
    taskFilter: "pending",
    query: "",
    selectedCourseId: "",
    selectedLessonKey: "",
    selectedBatchId: "",
    selectedTaskId: "",
    questionsFilter: "all",
    discQuery: "",
    selectedQuestionId: null,
    replyToChatId: null,
    lessonTrackerCleanup: null,
    videoProgressLastSaved: {},
    videoProgressSaveInFlight: {},
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

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    wireNavigation();
    wireActions();
    initializeHistoryNavigation();
    document.body.dataset.studentView = state.activeView;

    if (!getClient()) {
      showAlert("Learning data could not load. Check your internet connection and refresh the page.", true);
      return;
    }

    const student = await resolveStudentSession();
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
    // NOTE: pagehide/beforeunload session clear removed — caused session loss
    // on in-tab navigation. Session is cleared only on explicit logout.

    renderIdentity();
    notifyDailyLoginReward();
    console.log("Jenovate LMS: 5-Question Quiz Randomizer (Fisher-Yates) is ACTIVE.");
    await loadAllData();
    setupRealtime();
  }

  function wireNavigation() {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.addEventListener("click", () => {
        setView(button.dataset.view);
        closeMobileMenu();
      });
    });

    document.querySelectorAll("[data-jump]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        setView(button.dataset.jump);
        closeMobileMenu();
      });
    });

    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        closeMobileMenu();
      }
    });
  }

  function wireActions() {
    on("refreshBtn", "click", () => loadAllData({ force: true }));
    on("reloadTasksBtn", "click", () => loadAllData({ force: true }));
    on("reloadChatBtn", "click", () => loadAllData({ force: true }));
    on("reloadAnnouncementsBtn", "click", () => loadAllData({ force: true }));
    on("refreshSupportBtn", "click", () => loadAllData({ force: true }));
    on("logoutBtn", "click", logout);
    on("studentMenuBtn", "click", openMobileMenu);
    on("studentSidebarScrim", "click", closeMobileMenu);
    on("topSearchInput", "input", handleTopSearch);
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
    
    // Discussions UI actions
    on("discAskBtn", "click", () => {
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "false");
    });
    on("discAskBtnAlt", "click", () => {
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "false");
    });
    on("discAskClose", "click", () => {
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "true");
    });
    
    // Close overlay on background click
    const askOverlay = document.getElementById("discAskOverlay");
    askOverlay?.addEventListener("click", (event) => {
      if (event.target === askOverlay) {
        askOverlay.setAttribute("aria-hidden", "true");
      }
    });

    // Discussion sidebar filter tabs
    const filterTabs = document.querySelector(".disc-filter-tabs");
    filterTabs?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-disc-filter]");
      if (!button) return;
      state.questionsFilter = button.dataset.discFilter || "all";
      renderQuestions();
    });

    // Question card selection click
    const questionListEl = document.getElementById("questionList");
    questionListEl?.addEventListener("click", (event) => {
      const card = event.target.closest("[data-question-id]");
      if (!card) return;
      // Skip click handling if clicking on a button or link inside card
      if (event.target.closest("button, a, input, select")) return;
      state.selectedQuestionId = card.dataset.questionId;
      renderQuestions();
    });

    // Search input listener
    on("discSearchInput", "input", (event) => {
      state.discQuery = event.target.value.trim().toLowerCase();
      renderQuestions();
    });

    on("supportTicketForm", "submit", submitSupportTicket);
    on("profileForm", "submit", saveProfile);
    on("passwordForm", "submit", updatePassword);

    // Profile page interactive UI toggles
    on("profileEditToggleBtn", "click", () => {
      const inputs = ["profileName", "profileUsername", "profilePhone"].map(id => document.getElementById(id));
      const isDisabled = inputs[0] ? inputs[0].disabled : true;
      inputs.forEach(input => { if (input) input.disabled = !isDisabled; });
      const actions = document.getElementById("profileFormActions");
      if (actions) actions.style.display = isDisabled ? "flex" : "none";
      const btnText = document.getElementById("profileEditToggleBtn");
      if (btnText) btnText.innerHTML = isDisabled ? "Cancel" : `<span class="edit-icon">✎</span> Edit Details`;
    });

    on("profileCancelBtn", "click", () => {
      const inputs = ["profileName", "profileUsername", "profilePhone"].map(id => document.getElementById(id));
      inputs.forEach(input => { if (input) input.disabled = true; });
      const actions = document.getElementById("profileFormActions");
      if (actions) actions.style.display = "none";
      const btnText = document.getElementById("profileEditToggleBtn");
      if (btnText) btnText.innerHTML = `<span class="edit-icon">✎</span> Edit Details`;
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
      document.querySelectorAll("[data-course-filter]").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderCourses();
    });

    document.getElementById("catalogCoursesGrid")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-catalog-category]");
      if (button) {
        state.catalogCategory = button.dataset.catalogCategory || "all";
        renderCatalog();
        return;
      }

      const filterButton = event.target.closest("[data-catalog-filter]");
      if (filterButton) {
        state.catalogFilter = filterButton.dataset.catalogFilter || "all";
        state.catalogFiltersOpen = false;
        renderCatalog();
        return;
      }

      const filterToggle = event.target.closest("[data-catalog-filter-toggle]");
      if (filterToggle) {
        state.catalogFiltersOpen = !state.catalogFiltersOpen;
        renderCatalog();
      }
    });

    document.addEventListener("click", (event) => {
      const reviewCourse = event.target.closest("[data-review-course]");
      if (reviewCourse) {
        openCourseReview(reviewCourse.dataset.reviewCourse);
        return;
      }

      const openCourse = event.target.closest("[data-open-course]");
      if (openCourse) {
        state.selectedCourseId = openCourse.dataset.openCourse;
        state.selectedLessonKey = "";
        setView(openCourse.closest("#coursesView") ? "learn" : "courses");
        return;
      }

      const detailCourse = event.target.closest("[data-course-detail]");
      if (detailCourse) {
        openCourseDetailModal(detailCourse.dataset.courseDetail);
        return;
      }

      const catalogCard = event.target.closest("[data-catalog-course-card]");
      if (catalogCard && !event.target.closest("button,a,input,select,textarea,label")) {
        const courseId = catalogCard.dataset.catalogCourseCard;
        if (studentCourseIds().has(String(courseId))) {
          state.selectedCourseId = courseId;
          state.selectedLessonKey = "";
          setView("learn");
        } else {
          openCourseDetailModal(courseId);
        }
        return;
      }

      const courseCard = event.target.closest("[data-course-card-open]");
      if (courseCard && !event.target.closest("button,a,input,select,textarea,label")) {
        state.selectedCourseId = courseCard.dataset.courseCardOpen;
        state.selectedLessonKey = "";
        setView("learn");
        return;
      }

      const enrollCourse = event.target.closest("[data-enroll-course]");
      if (enrollCourse) {
        enrollInCourse(enrollCourse.dataset.enrollCourse, enrollCourse);
        return;
      }

      const selectLesson = event.target.closest("[data-select-lesson]");
      if (selectLesson) {
        state.selectedLessonKey = selectLesson.dataset.selectLesson;
        renderLearn();
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
      console.warn("Student auth check failed", error);
    }
    return null;
  }

  async function enforceLiveSession() {
    if (!(await resolveStudentSession())) {
      if (redirectToActiveSession("student")) return;
      window.location.replace("login.html?next=student");
    }
  }

  function redirectToActiveSession(expectedRole) {
    const profile = window.JenovateSessionRouter?.activeSession?.();
    const target = window.JenovateSessionRouter?.routeFor?.(profile);
    if (!profile?.role || profile.role === expectedRole || !target) return false;
    window.location.replace(target);
    return true;
  }

  async function loadAllData(options = {}) {
    const silent = options.silent === true;
    if (options.force === true) clearQueryCache();
    setLoading(!silent);
    setSyncStatus("");

    try {
      const results = await Promise.all(TABLE_SPECS.map((spec) => fetchTableSafe(spec, { force: options.force === true })));
      const rows = Object.fromEntries(results.map((result) => [result.key, result.rows]));
      const failed = results.filter((result) => result.error && !result.optional);

      state.tableErrors = Object.fromEntries(failed.map((result) => [result.table, result.error.message || "Unable to fetch"]));
      state.data.users = rows.users.map(normalizeUser);
      state.data.courses = rows.courses.map(normalizeCourse);
      state.data.catalogCourses = rows.catalogCourses.map(normalizeCourse);
      state.data.batches = rows.batches;
      state.data.userCourses = rows.userCourses.map(normalizeEnrollment);
      state.data.progress = rows.progress;
      state.data.shopItems = rows.shopItems;
      state.data.studentShopPurchases = rows.studentShopPurchases;
      state.data.purchases = mergePurchaseRows(rows.purchases, rows.studentShopPurchases);
      state.data.projects = rows.projects;
      state.data.batchTasks = rows.batchTasks;
      state.data.taskSubmissions = rows.taskSubmissions;
      state.data.quizAttempts = rows.quizAttempts || [];
      state.data.chats = rows.chats;
      state.data.announcements = rows.announcements;
      state.data.supportTickets = rows.supportTickets || [];
      state.data.supportMessages = rows.supportMessages || [];
      state.data.supportNotifications = rows.supportNotifications || [];
      notifyUnreadSupportReplies();

      const refreshedProfile = state.data.users.find((user) => sameId(user.id, state.student.id));
      if (refreshedProfile) {
        state.student = normalizeUser({ ...state.student, ...refreshedProfile });
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
        sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));
      }

      await loadSupplementalBatches();
      await loadSupplementalBatchRows();
      await syncDailyStreak({ silent: true });
      ensureSelections();
      renderAll();

      const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (failed.length) {
        console.warn("Student background data loaded with warnings", failed.map((item) => ({ table: item.table, error: friendlySupabaseError(item.error) })));
        setSyncStatus("");
      } else {
        setSyncStatus("");
      }
    } catch (error) {
      const errorMsg = error.message || "Unable to load student data.";
      console.error("Student background data sync failed", errorMsg);
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
      console.warn("Unable to load supplemental batch rows", error);
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
      console.warn("Unable to load supplemental batches", error);
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
      if (!spec.optional) {
        console.error(`Supabase fetch failed for ${spec.table}`, error);
      }
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
    query = applyScopedFilters(query, spec);
    if (spec.order) {
      const [column, direction = "desc"] = spec.order.split(".");
      query = query.order(column, { ascending: direction === "asc" });
    } else if (["batch_chats", "announcements", "batch_tasks"].includes(spec.table)) {
      query = query.order("created_at", { ascending: false });
    }
    const { data, error } = await query.range(0, limit - 1);
    if (error && spec.table === "users") {
      const fallback = await supabaseClient.rpc("lms_public_active_users");
      if (!fallback.error) return applyScopedFiltersToRows(fallback.data || [], spec).slice(0, limit);
    }
    if (error) throw error;
    return data || [];
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
      case "studentUserCourses":
        return studentId ? query.eq("user_id", studentId) : query;
      case "studentPurchaseRows":
        return studentId ? query.eq("user_id", studentId) : query;
      case "studentProjectRows":
        return studentId ? query.eq("student_id", studentId) : query;
      case "studentBatchRows":
        return batchId ? query.eq("batch_id", batchId) : query;
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
        return courseIds.length ? query.in("id", courseIds) : query.in("status", ["Published", "published", "Active", "active"]);
      case "courseCatalog":
        return query;
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
    const num = Number(limit);
    if (!isNaN(num) && num > 0) return num;
    return PAGE_SIZE;
  }

  function queryCacheKey(spec, limit) {
    const scope = [state.student?.id || "", state.student?.batch_id || "", parseIdList(state.student?.course_ids).join("|")].join(":");
    return `${QUERY_CACHE_PREFIX}${spec.table}:${spec.select}:${spec.scope || "all"}:${spec.order || ""}:${limit}:${scope}`;
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
      // Ignore quota limits; memory cache still prevents duplicate requests.
    }
  }

  function revalidateTable(spec, limit, cacheKey) {
    if (state.inFlightRequests.has(cacheKey)) return;
    const supabaseClient = getClient();
    const promise = runSupabaseQuery(supabaseClient, spec, limit)
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
    const supabaseClient = getClient();
    if (!supabaseClient?.channel || state.realtimeChannel) return;

    const liveTables = ["projects", "batch_chats", "announcements", "support_tickets", "support_messages", "support_notifications"];

    const channel = supabaseClient.channel("student-lms-realtime");
    liveTables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queueRealtimeRefresh(table));
    });

    channel.subscribe((status) => {
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        console.warn("Student realtime status", status);
      }
    });

    state.realtimeChannel = channel;
    window.addEventListener("pagehide", cleanupRealtime, { once: true });
    window.addEventListener("beforeunload", cleanupRealtime, { once: true });
  }

  function queueRealtimeRefresh(table) {
    setSyncStatus("");
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => loadAllData({ silent: true, force: true }), 900);
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
      console.error(`Unable to render ${state.activeView} view`, error);
      if (state.activeView === "learn") {
        renderLearnFallback(error);
      }
      showAlert("This page could not render completely. Refresh data and try again.", true);
    }
  }

  function renderIdentity() {
    const student = state.student;
    if (!student) return;
    const initials = initialsFor(student.name || student.email);
    setText("sidebarStudentName", student.name || "Student");
    setText("sidebarStudentEmail", student.email || "");
    setText("sidebarStudentAvatar", initials);
    setText("topbarStudentAvatar", initials);
    setText("topbarStudentName", firstName(student.name || student.email || "Student"));
    setText("sidebarBatchName", `Batch: ${currentBatch()?.name || "Alpha-2024"}`);
    setText("coinBalance", formatNumber(student.coins));
    setText("shopCoinBalance", formatNumber(student.coins));
    renderStreakCard();
    setValue("profileName", student.name || "");
    setValue("profileUsername", student.username || "");
    setValue("profilePhone", student.phone || "");
    setValue("profileEmail", student.email || "");
  }

  function renderDashboard() {
    const courses = filteredCourses(enrolledCourses());
    const batches = scopedBatches();
    const tasks = scopedTasks();
    const pendingTasks = tasks.filter((task) => !submissionForTask(task.id));
    const purchases = state.data.purchases.filter((purchase) => sameId(purchase.user_id, state.student.id));
    const primaryBatch = currentBatch();
    const overallProgress = averageCourseProgress(courses);
    const completedCourses = courses.filter((course) => courseProgress(course).percent >= 100).length;
    const completionRate = courses.length ? Math.round((completedCourses / courses.length) * 100) : 0;
    const activeCourse = preferredLearningCourse(courses) || courses[0] || null;

    setText("sidebarBatchName", `Batch: ${primaryBatch?.name || "Alpha-2024"}`);
    setText("heroBatchName", primaryBatch ? `Welcome back, ${primaryBatch.name}` : "Welcome back");
    setText("heroGreeting", `${dashboardGreeting()}, ${firstName(state.student.name || state.student.email || "Student")}!`);
    setText("heroSummary", courses.length
      ? `You've completed ${overallProgress}% of your weekly goal. Keep momentum going and finish your ${activeCourse?.title || "active course"} today.`
      : "Your courses will appear here as soon as admin enrolls you.");
    setText("metricCourses", courses.length);
    setText("metricCompletedCourses", completedCourses);
    setText("dashboardCompletionRate", `${completionRate}% rate`);
    setText("metricTasks", pendingTasks.length);
    setText("metricTasksMeta", pendingTasks.length === 1 ? "pending submission" : "pending submissions");
    setText("metricStreak", currentStreak());
    setText("metricStreakMeta", isActiveToday() ? "active today" : "start today to save it");
    setText("metricRewards", purchases.length);
    setText("overallProgressLabel", `${overallProgress}%`);
    setText("overallProgressMeta", courses.length ? `${courses.length} active course${courses.length === 1 ? "" : "s"}` : "No progress recorded yet");
    setStyleWidth("overallProgressBar", overallProgress);
    setStyleWidth("dashboardCourseMetricBar", overallProgress);
    renderDashboardActiveCourse(activeCourse);
    renderDashboardQuizMetric();
    renderDashboardCourseOverview(courses.slice(0, 2));
    renderStreakCard();

    renderRailTasks(pendingTasks.slice(0, 4));
    renderRailAnnouncements(scopedAnnouncements().slice(0, 3));
  }

  function dashboardGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
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
    target.innerHTML = courses.length ? courses.map((course, index) => {
      const progress = courseProgress(course);
      const modules = parseModules(course.modules);
      const lessons = flattenCourseLessons(course, modules);
      return `
        <article class="dashboard-overview-course" data-open-course="${escapeAttr(course.id)}">
          <img src="${escapeAttr(courseDisplayImage(course, index + 5))}" alt="">
          <div>
            <span>${escapeHtml(course.category || course.difficulty || "Masterclass")}</span>
            <h3>${escapeHtml(course.title || "Course")}</h3>
            <p>${escapeHtml(course.instructor_name || course.mentor_name || "Jenovate Mentor")}</p>
            <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
            <small><span>${progress.percent}%</span><span>${lessons.length ? `${Math.max(1, Math.round((progress.percent / 100) * lessons.length))}/${lessons.length} Lessons` : `${modules.length} Modules`}</span></small>
            <button class="primary-btn" type="button" data-open-course="${escapeAttr(course.id)}">Resume</button>
          </div>
        </article>
      `;
    }).join("") : emptyState("No courses yet", "Your enrolled courses will appear here.");
  }

  function renderDashboardLeaderboard() {
    const target = document.getElementById("dashboardLeaderboard");
    if (!target) return;
    const batch = currentBatch();
    const students = classmatesForBatch(batch).slice(0, 3);
    const rows = students.length ? students : [state.student].filter(Boolean);
    target.innerHTML = rows.map((user, index) => `
      <article class="dashboard-leader-row ${sameId(user.id, state.student.id) ? "active" : ""}">
        <span class="student-avatar small">${escapeHtml(initialsFor(user.name || user.email || "U"))}</span>
        <div><strong>${escapeHtml(user.name || user.email || "Student")}${sameId(user.id, state.student.id) ? " (You)" : ""}</strong><small>${formatNumber(Number(user.coins || state.student.coins || 0) + Math.max(0, 3 - index) * 1250)} pts</small></div>
        <b>${index === 0 ? "1st Place" : index === 1 ? "2nd" : "3rd"}</b>
      </article>
    `).join("");
  }

  function renderCatalog() {
    const target = document.getElementById("catalogCoursesGrid");
    if (!target) return;
    const enrolledIds = studentCourseIds();
    const catalog = filteredCourses(catalogCourses()).sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
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
      if (activeFilter === "enrolled") return enrolledIds.has(String(course.id));
      if (activeFilter === "available") return !enrolledIds.has(String(course.id));
      if (activeFilter === "quiz") return modules.some((module) => moduleQuiz(module));
      if (activeFilter === "modules") return modules.length > 0;
      return true;
    });
    const totalModules = visibleCatalog.reduce((sum, course) => sum + parseModules(course.modules).length, 0);
    const enrolledCount = catalog.filter((course) => enrolledIds.has(String(course.id))).length;
    const filterLabels = {
      all: "Filters",
      enrolled: "Enrolled",
      available: "Available",
      quiz: "Has Quiz",
      modules: "Has Modules"
    };
    target.innerHTML = `
      <section class="course-discovery-hero">
        <div>
          <span>Premium learning collection</span>
          <h2>Master New Skills Today.</h2>
          <p>Explore ${visibleCatalog.length || 0} courses with ${totalModules || 0} modules selected for your Jenovate learning path.</p>
          <div class="catalog-hero-actions">
            <div class="catalog-search-pill">Search for courses, tools, or mentors...</div>
            <button class="primary-btn" type="button">Explore All</button>
          </div>
        </div>
        <aside class="catalog-hero-stat">
          <strong>${visibleCatalog.length || 0}</strong>
          <span>Available courses</span>
          <small>${enrolledCount} already in your learning plan</small>
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
        <button class="${activeFilter === "enrolled" ? "active" : ""}" type="button" data-catalog-filter="enrolled">Enrolled</button>
        <button class="${activeFilter === "available" ? "active" : ""}" type="button" data-catalog-filter="available">Available</button>
        <button class="${activeFilter === "quiz" ? "active" : ""}" type="button" data-catalog-filter="quiz">Has Quiz</button>
        <button class="${activeFilter === "modules" ? "active" : ""}" type="button" data-catalog-filter="modules">Has Modules</button>
      </div>
      <div class="catalog-card-grid">
        ${visibleCatalog.length
          ? visibleCatalog.map((course) => courseCatalogCard(course, enrolledIds.has(String(course.id)))).join("")
          : emptyState("No courses available", "Published courses will appear here when they are ready.")}
      </div>
      <section class="catalog-accelerator-card">
        <div>
          <span>Exclusive Opportunity</span>
          <h2>The Developer's Career Accelerator Pack</h2>
          <p>Accelerate your roadmap with mentor-led course resources, project practice, and the next best track from your learning catalog.</p>
          <button class="primary-btn" type="button">Unlock Next Track</button>
          <button class="secondary-btn" type="button">Learn More</button>
        </div>
      </section>
    `;
  }

  function courseCatalogCard(course, enrolled) {
    const modules = parseModules(course.modules);
    const quizCount = modules.filter((module) => moduleQuiz(module)).length;
    const thumbnail = escapeAttr(courseDisplayImage(course, modules.length));
    const title = escapeHtml(course.title || "Untitled course");
    const category = escapeHtml(course.category || course.difficulty || "Learning");
    const instructor = escapeHtml(course.instructor_name || course.mentor_name || "Jenovate Mentor");
    const tag = enrolled ? "Enrolled" : modules.length >= 3 ? "Hot" : "New";
    const duration = escapeHtml(course.duration || `${modules.length || 1} modules`);
    const rawPrice = String(course.price || "").trim();
    const price = rawPrice ? escapeHtml(rawPrice) : "Included";
    return `
      <article class="discovery-course-card" data-catalog-course-card="${escapeAttr(course.id)}">
        <div class="discovery-media">
          <img src="${thumbnail}" alt="">
          <span class="discovery-status">${escapeHtml(tag)}</span>
          <b class="discovery-price">${price}</b>
        </div>
        <div class="discovery-body">
          <div class="discovery-kicker"><span class="course-category-label">${category}</span><small>${duration}</small></div>
          <h3>${title}</h3>
          <div class="discovery-rating">★★★★★ <small>${escapeHtml(instructor)}</small></div>
          <div class="discovery-meta"><span>${modules.length || 1} Modules</span><span>${quizCount} Quizzes</span></div>
          <div class="discovery-actions">
            <button class="secondary-btn" type="button" data-course-detail="${escapeAttr(course.id)}">View Details</button>
            <button class="primary-btn" type="button" ${enrolled ? `data-open-course="${escapeAttr(course.id)}"` : `data-course-detail="${escapeAttr(course.id)}"`}>${enrolled ? "Start" : "Enroll"}</button>
          </div>
        </div>
      </article>
    `;
  }

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
        icon: "QZ",
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
    target.innerHTML = items.length ? items.map((item) => `
      <article class="rail-note">
        <span>AN</span>
        <div>
          <strong>${escapeHtml(item.title || "Announcement")}</strong>
          <small>${escapeHtml(formatDate(item.published_at || item.created_at))}</small>
        </div>
      </article>
    `).join("") : emptyState("No active announcements", "New notices from admin and mentors will appear here.");
  }

  function renderStreakCard() {
    if (!state.student) return;
    const studentName = firstName(state.student.name || state.student.email || "Student");
    const streak = currentStreak();
    const activeDays = weeklyActiveDateKeys();
    const today = todayKey();

    setText("streakAvatar", initialsFor(state.student.name || state.student.email));
    setText("streakStudentName", studentName);
    setText("streakCoinBalance", formatNumber(state.student.coins));
    setText("streakTitle", `${streak} Day${streak === 1 ? "" : "s"} Streak`);
    setText("dashboardMonthlyStreak", `${streak} Day${streak === 1 ? "" : "s"}`);
    setText("weeklyActivityLabel", `${activeDays.size}/7`);
    setText("streakStatusText", isActiveToday()
      ? "Today is locked in. Keep learning."
      : "Complete one activity to protect your streak.");

    const weekTarget = document.getElementById("dashboardStreakWeek");
    if (!weekTarget) return;
    weekTarget.innerHTML = weekDays().map((day) => {
      const active = activeDays.has(day.key);
      const isToday = day.key === today;
      return `
        <div class="streak-day ${active ? "active" : ""} ${isToday ? "today" : ""}" title="${escapeAttr(day.fullLabel)} - ${active ? "Active" : "Open"}">
          <span class="streak-day-dot" aria-hidden="true">${active ? "&#128293;" : ""}</span>
          <span class="streak-day-label">${escapeHtml(day.shortLabel)}</span>
        </div>
      `;
    }).join("");
  }

  function renderCourses() {
    const allCourses = enrolledCourses();
    let courses = filteredCourses(allCourses);
    if (state.courseFilter === "active") {
      courses = courses.filter((course) => courseProgress(course).percent < 100);
    } else if (state.courseFilter === "completed") {
      courses = courses.filter((course) => courseProgress(course).percent >= 100);
    } else if (state.courseFilter === "wishlist") {
      courses = [];
    }

    const overallProgress = averageCourseProgress(allCourses);
    setText("coursesOverallProgress", `${overallProgress}%`);
    setStyleWidth("coursesOverallProgressBar", overallProgress);
    if (state.courseFilter === "wishlist" && !courses.length) {
      const target = document.getElementById("coursesGrid");
      if (target) target.innerHTML = emptyState("No wishlist courses yet", "Courses you save for later will appear here.");
      return;
    }
    renderCourseCards("coursesGrid", courses, { compact: false });
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
      const reviewUrl = String(course.google_form_url || course.review_url || "").trim();
      return `
        <article class="my-course-card ${options.compact ? "compact-course-card" : ""}" data-course-card-open="${escapeAttr(course.id)}">
          <div class="course-card-media">
            <img class="course-thumb" src="${thumbnail}" alt="">
          </div>
          <div class="course-card-body">
            <h3>${title}</h3>
            <p class="course-instructor">${escapeHtml(course.description || `Instructor: ${instructor}`)}</p>
            <div class="course-mentor-row"><span class="student-avatar small">${escapeHtml(initialsFor(instructor))}</span><small>${instructor}</small></div>
            <small class="card-meta">${modules.length || 0} Modules | ${lessons.length || 0} Lessons</small>
            <div class="my-course-progress-row"><span>Overall Progress</span><b>${progress.percent}%</b></div>
            <div class="mini-progress ${progress.percent >= 85 ? "gold" : ""}"><span style="width:${progress.percent}%"></span></div>
            <div class="card-footer">
              ${progress.percent >= 100
                ? `<button class="primary-btn" type="button" data-open-course="${escapeAttr(course.id)}">Watch Again <span aria-hidden="true">></span></button>${reviewUrl ? `<button class="secondary-btn review-btn" type="button" data-review-course="${escapeAttr(course.id)}">Review Course</button>` : ""}`
                : `<button class="primary-btn" type="button" data-open-course="${escapeAttr(course.id)}">Continue Learning <span aria-hidden="true">></span></button>`}
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
          <button class="primary-btn" type="button" ${enrolled ? `data-open-course="${escapeAttr(course.id)}"` : `data-enroll-course="${escapeAttr(course.id)}"`}>${enrolled ? "Start Learning" : "Enroll Now"}</button>
        </div>
      </div>
    `);
  }

  async function enrollInCourse(courseId, button) {
    const course = catalogCourses().find((item) => sameId(item.id, courseId))
      || state.data.courses.find((item) => sameId(item.id, courseId));
    if (!course || !state.student?.id) return;
    if (studentCourseIds().has(String(course.id))) {
      state.selectedCourseId = course.id;
      closeModal();
      setView("learn");
      return;
    }

    const originalText = button?.textContent || "Enroll Now";
    if (button) {
      button.disabled = true;
      button.textContent = "Enrolling...";
    }

    const enrollment = {
      user_id: state.student.id,
      course_id: course.id,
      status: "active",
      created_at: new Date().toISOString()
    };

    try {
      const saved = await enrollStudentCourse(enrollment);
      mergeLocalEnrollment(saved);
      state.student.course_ids = Array.from(new Set([...parseIdList(state.student.course_ids), String(course.id)]));
      state.selectedCourseId = course.id;
      state.selectedLessonKey = "";
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
      sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));
      clearQueryCache();
      closeModal();
      renderAll();
      setView("courses");

      if (button) {
        button.disabled = false;
        button.textContent = "Continue Learning";
        button.removeAttribute("data-enroll-course");
        button.setAttribute("data-open-course", String(course.id));
      }

      showAlert(`You are enrolled in ${course.title || "this course"}.`);
      await loadAllData({ force: true, silent: true });
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
      showAlert(userFriendlyError(error, "Unable to enroll in this course."), true);
    }
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

  async function enrollStudentCourse(enrollment) {
    if (getClient()?.rpc) {
      const { data, error } = await getClient().rpc("lms_enroll_student", {
        target_user_id: enrollment.user_id,
        target_course_id: enrollment.course_id
      });
      if (!error) return normalizeEnrollment(Array.isArray(data) ? data[0] : data || enrollment);
      if (!isMissingRpcError(error)) throw error;
    }

    const { data, error } = await getClient()
      .from("user_courses")
      .insert(enrollment)
      .select(SELECTS.userCourses);
    if (error) throw error;
    return normalizeEnrollment(Array.isArray(data) ? data[0] : data || enrollment);
  }

  function courseStudyResources(course, modules = parseModules(course?.modules)) {
    const resources = [];
    modules.forEach((module, moduleIndex) => {
      (module.lessons || []).forEach((lesson, lessonIndex) => {
        const url = lessonMediaUrl(lesson);
        const type = String(lesson.content_type || "").toLowerCase();
        const looksLikeMaterial = type.includes("material")
          || /\.(pdf|docx?|pptx?|xlsx?|zip|txt)(?:$|\?)/i.test(url);
        if (!url || !looksLikeMaterial) return;
        const ext = (url.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1] || "file").toUpperCase();
        resources.push({
          url,
          title: lesson.title || `${module.title || `Module ${moduleIndex + 1}`} Material`,
          meta: `${module.title || `Module ${moduleIndex + 1}`} - ${lesson.duration || `Item ${lessonIndex + 1}`}`,
          label: ext.slice(0, 3),
          kind: ext.toLowerCase().includes("pdf") ? "pdf" : "file"
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
          <button class="active" type="button">Overview</button>
          <button type="button">Notes</button>
          <button type="button">Resources</button>
          <button type="button" data-jump="questions">Discussion</button>
        </nav>

        <section class="lesson-body-grid lesson-reference-body">
          <article class="lesson-about-card reference-overview-card">
            <h3>${escapeHtml(selectedTitle)}</h3>
            <div class="lesson-facts">
              <span>${escapeHtml(selectedLesson?.lesson?.duration || course?.duration || "Self paced")}</span>
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
          <article class="lesson-mentor-card">
            <span class="student-avatar">${escapeHtml(initialsFor(instructor))}</span>
            <div>
              <strong>${escapeHtml(instructor)}</strong>
              <small>${escapeHtml(course?.category || "Course Mentor")}</small>
              <p>Helping you move through the course with practical lessons, materials, and project guidance.</p>
            </div>
            <button class="secondary-btn" type="button" data-jump="questions">Ask</button>
          </article>
          <aside class="lesson-resource-card reference-resource-card">
            <div class="resource-card-head">
              <div>
                <h3>Curated Course Materials</h3>
                <p>Download assets and study files shared for this course.</p>
              </div>
              ${resources.length ? `<a class="primary-btn" href="${escapeAttr(resources[0].url)}" target="_blank" rel="noopener">Open First</a>` : ""}
            </div>
            <div class="resource-grid">
              ${resources.length ? resources.slice(0, 4).map((resource) => `
                <a class="resource-download-card" href="${escapeAttr(resource.url)}" target="_blank" rel="noopener">
                  <span class="resource-icon ${escapeAttr(resource.kind)}">${escapeHtml(resource.label)}</span>
                  <strong>${escapeHtml(resource.title)}</strong>
                  <small>${escapeHtml(resource.meta)}</small>
                  <em>Download</em>
                </a>
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
          <button class="secondary-btn" type="button" aria-label="More learning actions">⋮</button>
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
            </span>
            <span class="rail-chevron">⌄</span>
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
                    ${done ? "✓" : mediaUrl ? "▶" : "○"}
                  </button>
                  <span>
                    <strong>${lessonIndex + 1}. ${escapeHtml(lesson.title || `Lesson ${lessonIndex + 1}`)}</strong>
                    <small>${escapeHtml(lesson.duration || "08:15")}</small>
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
    const embedUrl = mediaEmbedUrl(mediaUrl);
    const directVideo = contentType === "video" && mediaUrl && isDirectVideoUrl(mediaUrl);
    const description = lesson.description || lesson.transcript || lessonItem.module.description || course.description || "";
    const moduleLabel = `Module ${lessonItem.moduleIndex + 1}: ${lessonItem.module.title || "Untitled module"}`;
    const lessonLabel = `Lesson ${lessonItem.lessonIndex + 1}`;

    target.innerHTML = `
      <div class="player-header">
        <div>
          <span>${escapeHtml(`${moduleLabel} - ${contentLabel} ${lessonItem.lessonIndex + 1}`)}</span>
          <h3>${escapeHtml(lesson.title || "Lesson")}</h3>
        </div>
        ${mediaUrl ? `<a class="secondary-btn" href="${escapeAttr(mediaUrl)}" target="_blank" rel="noopener">Open ${escapeHtml(contentLabel)}</a>` : ""}
      </div>
      <div class="media-frame">
        ${directVideo ? `
          <video controls preload="metadata" src="${escapeAttr(mediaUrl)}"></video>
        ` : embedUrl ? `
          <iframe src="${escapeAttr(embedUrl)}" title="${escapeAttr(lesson.title || "Lesson video")}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
        ` : `
          <div class="media-empty">
            <strong>${mediaUrl ? `Open the ${escapeHtml(contentLabel.toLowerCase())}` : `No ${escapeHtml(contentLabel.toLowerCase())} attached`}</strong>
            <p>${escapeHtml(mediaUrl ? "This content opens in a new tab." : "Your mentor has not attached a file or link yet.")}</p>
            ${mediaUrl ? `<a class="primary-btn" href="${escapeAttr(mediaUrl)}" target="_blank" rel="noopener">Open ${escapeHtml(contentLabel)}</a>` : ""}
          </div>
        `}
      </div>
      <div class="player-description">
        <strong>Description</strong>
        <p>${escapeHtml(description || "No description added for this lesson.")}</p>
      </div>
    `;

    updateLessonProgressStatus(lessonProgressFromState(courseProgress(course).row, lessonItem));
    attachLessonProgressTracker(course, lessonItem, { directVideo, embedUrl });
  }

  function moduleQuizBlock(course, module, moduleIndex) {
    const quiz = moduleQuiz(module);
    if (!quiz || !quiz.questions.length) return "";
    const best = bestQuizAttempt(course.id, module.id, quiz.id);
    const attemptQuestionsCount = Math.min(5, quiz.questions.length);
    const sampleQuestions = quiz.questions.slice(0, attemptQuestionsCount);
    const totalMarks = sampleQuestions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
    const passMarks = Math.ceil(totalMarks * 0.6);
    return `
      <div class="module-quiz-card">
        <span class="quiz-icon">QZ</span>
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

    // Select exactly 5 random questions from the pool using a robust Fisher-Yates shuffle
    const shuffled = [...quiz.questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const attemptQuestions = shuffled.slice(0, 5);
    console.log(`[Quiz Randomizer] Pool has ${quiz.questions.length} questions. Sliced to exactly ${attemptQuestions.length} random questions.`);
    const totalMarks = attemptQuestions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
    const passMarks = Math.ceil(totalMarks * 0.6);
    const best = bestQuizAttempt(course.id, module.id, quiz.id);
    openModal(quiz.title || `${course.title || "Course"} Quiz`, `
      <form class="quiz-attempt-form stitch-quiz-screen" id="quizAttemptForm">
        <div class="quiz-progress-strip">
          <span>Question 01 of ${String(attemptQuestions.length).padStart(2, "0")}</span>
          <div><i style="width:${Math.max(1, Math.round(100 / Math.max(attemptQuestions.length, 1)))}%"></i></div>
          <small>${Math.round(100 / Math.max(attemptQuestions.length, 1))}% Completed</small>
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
          <h3>Quiz Overview</h3>
          <div class="quiz-legend">
            <span>Answered</span><span>Unanswered</span><span>Current</span><span>Flagged</span>
          </div>
          <div class="quiz-number-grid">
            ${Array.from({ length: attemptQuestions.length }, (_, index) => `
              <button type="button" data-quiz-jump="${index}" class="${index === 0 ? "current" : ""}">${index + 1}</button>
            `).join("")}
          </div>
          <div class="quiz-help-card">
            <strong>Need assistance?</strong>
            <p>If you experience technical issues, contact the system administrator immediately.</p>
          </div>
        </aside>
        <button class="submit-quiz-btn" type="submit">Submit Quiz</button>
      </form>
    `);

    const form = document.getElementById("quizAttemptForm");
    if (form) {
      form._attemptQuestions = attemptQuestions;
      wireQuizAttemptControls(form, attemptQuestions.length);
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

  function wireQuizAttemptControls(form, totalQuestions) {
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
      if (progressPercent) progressPercent.textContent = `${percent}% Completed`;
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
    const passed = score >= Math.ceil(maxScore * 0.6);

    let saveMessage = "";
    try {
      await saveQuizAttempt(course, module, quiz, { score, maxScore, passed, answers });
      await saveQuizProgress(course, score, maxScore, passed);
      await loadAllData({ silent: true });
    } catch (error) {
      saveMessage = /student_quiz_attempts|schema cache|relation|could not find/i.test(error.message || "")
        ? "Run supabase-quiz-leaderboard-setup.sql so this score can be saved to the leaderboard."
        : error.message || "Quiz score calculated, but saving failed.";
      showAlert(saveMessage, true);
    }

    openModal("Quiz Result", `
      <div class="quiz-result-card ${passed ? "passed" : "failed"}">
        <span class="pill ${passed ? "success" : "warning"}">${passed ? "Passed" : "Needs Practice"}</span>
        <h3>${escapeHtml(quiz.title || "Module Quiz")}</h3>
        <p>Score ${score}/${maxScore}. Passing score is ${Math.ceil(maxScore * 0.6)}/${maxScore}.</p>
        ${saveMessage ? `<p class="quiz-save-warning">${escapeHtml(saveMessage)}</p>` : ""}
        <div class="quiz-review-list">
          ${results.map((result, index) => `
            <div class="${result.earned ? "correct" : "wrong"}">
              <span>${result.earned ? "OK" : "!"}</span>
              <p>Q${index + 1}: Correct ${escapeHtml(result.correct)}, your answer ${escapeHtml(result.answer || "None")}</p>
            </div>
          `).join("")}
        </div>
        <button class="primary-btn" type="button" data-start-quiz data-course-id="${escapeAttr(course.id)}" data-module-index="${parseModules(course.modules).findIndex((item) => sameId(item.id, module.id))}">Start Another Attempt</button>
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
    const passScore = Number(quiz.pass_marks || Math.ceil(result.maxScore * 0.6));
    const fullPayload = {
      student_id: state.student.id,
      course_id: course.id,
      module_id: module.id,
      quiz_id: quiz.id,
      score: result.score,
      max_score: result.maxScore,
      passed: result.passed,
      answers: result.answers,
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

    // Update tab active classes
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

    // Render left task cards list
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

        const assignedDateStr = task.created_at ? formatDate(task.created_at) : "Oct 24, 2024";

        return `
          <article class="task-card ${selected ? "active" : ""}" data-select-task="${escapeAttr(task.id)}" tabindex="0">
            <div class="task-card-top">
              <span class="task-status-badge ${statusClass}">${escapeHtml(statusLabel)}</span>
              <span class="task-due-text ${statusClass === "overdue" ? "late" : ""}">${escapeHtml(dueLabel)}</span>
            </div>
            <div class="task-card-content">
              <h3>${escapeHtml(task.title || "Untitled task")}</h3>
              <p>Module: ${escapeHtml(batch?.name || "Visual Hierarchy & Layouts")}</p>
            </div>
            <div class="task-card-footer">
              <span class="task-calendar-icon">📅</span>
              <small>Assigned ${escapeHtml(assignedDateStr)}</small>
            </div>
          </article>
        `;
      }).join("");
    }

    // Render right details main pane
    if (!activeTask) {
      taskMainEl.innerHTML = `
        <div class="task-empty-state">
          <span>📋</span>
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
        const title = activeResource.split("/").pop() || "Bento_Guidelines.pdf";
        resourceCardsHtml = `
          <div class="task-resources-list">
            <div class="resource-card ${isPdf ? "pdf" : "figma"}">
              <div class="resource-icon-container">
                <span class="resource-icon">${isPdf ? "📄" : "❖"}</span>
              </div>
              <div class="resource-info">
                <strong>${escapeHtml(title)}</strong>
                <small>${isPdf ? "PDF" : "RESOURCE"} • External Link</small>
              </div>
              <a class="resource-download-btn" href="${escapeAttr(activeResource)}" target="_blank" rel="noopener" title="Open Resource">
                <span>↗</span>
              </a>
            </div>
          </div>
        `;
      } else {
        resourceCardsHtml = `<p class="task-no-resources">No downloadable resources added</p>`;
      }

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
              <span class="task-submit-icon">✅</span>
              <div>
                <strong>Submission Saved Successfully</strong>
                <small>Submitted on ${escapeHtml(formatDate(activeSubmission.submitted_at || activeSubmission.created_at))}</small>
              </div>
            </div>
            ${feedbackHtml}
            <div class="task-submit-actions">
              <a class="primary-btn text-center" href="${escapeAttr(taskSubmissionLink(activeSubmission))}" target="_blank" rel="noopener">
                View Your Submission ↗
              </a>
            </div>
          </div>
        `;
      } else {
        submitBoxHtml = `
          <div class="task-submit-card">
            <div class="task-submit-header">
              <span class="task-submit-icon">📤</span>
              <div>
                <strong>Submit Your Work</strong>
                <small>Paste a Google Drive link containing your Figma file or document.</small>
              </div>
            </div>
            <form id="taskSubmitForm" class="task-submit-form">
              <div class="task-submit-input-group">
                <input id="taskSubmissionDriveLink" type="url" placeholder="https://drive.google.com/..." required />
                <button class="primary-btn" type="submit">Submit Task</button>
              </div>
            </form>
          </div>
        `;
      }

      taskMainEl.innerHTML = `
        <div class="task-detail-header">
          <div class="task-detail-meta">
            <span class="task-module-pill">${escapeHtml(taskCourse?.title || activeBatch?.name || "Module 4: Advanced Layouts")}</span>
            <span class="task-read-time">⏱ 45 mins read</span>
          </div>
          <div class="task-points-display">
            <small>Points Possible</small>
            <strong>100 XP</strong>
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
            <li>Create a hi-fidelity prototype of the required layout.</li>
            <li>Utilize clean, structured layout hierarchy.</li>
            <li>Ensure responsive behavior across layout resolutions.</li>
            <li>Submit a Google Drive link containing your file and walkthrough.</li>
          </ul>
        </section>

        <section class="task-detail-section">
          <h3>Downloadable Resources</h3>
          ${resourceCardsHtml}
        </section>

        ${submitBoxHtml}
      `;

      if (!activeSubmission) {
        document.getElementById("taskSubmitForm")?.addEventListener("submit", (event) => submitTask(event, activeTask));
      }
    }
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
    }

    if (sidebar) {
      if (!batch) {
        sidebar.innerHTML = emptyState("No batch assigned", "Your batch details will appear here.");
      } else {
        const students = classmatesForBatch(batch);
        const mentorName = mentor?.name || "Not assigned";
        const courseTitle = course?.title || course?.name || "PYTHON";
        const batchPeriodStr = batchPeriod(batch) || "14 May 2026";
        const statusLabel = batch.status && batch.status.toLowerCase() !== "draft" ? batch.status.toUpperCase() : "";

        // Filter classmates list to render instructors
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
            ${statusLabel ? `<span class="sidebar-status-badge">• ${escapeHtml(statusLabel)}</span>` : ""}
          </div>

          <div class="batch-sidebar-cards">
            <div class="sidebar-card">
              <div class="sidebar-card-icon">👤</div>
              <div class="sidebar-card-info">
                <small>MENTOR</small>
                <strong>${escapeHtml(mentorName)}</strong>
              </div>
            </div>

            <div class="sidebar-card">
              <div class="sidebar-card-icon">📅</div>
              <div class="sidebar-card-info">
                <small>PERIOD</small>
                <strong>${escapeHtml(batchPeriodStr)}</strong>
              </div>
            </div>

            <div class="sidebar-card">
              <div class="sidebar-card-icon">📖</div>
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

        // Update online status student count
        const onlineStatusEl = document.getElementById("chatOnlineStatus");
        if (onlineStatusEl) {
          onlineStatusEl.textContent = `• ${students.length} Students Online`;
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
      target.innerHTML = emptyState("No messages", "Start a batch conversation with your mentor and classmates.");
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
            ${reply ? `<div class="reply-preview">Replying to ${escapeHtml(truncate(reply.message || "", 80))}</div>` : ""}
            <p class="chat-message-text">${escapeHtml(message.message || "")}</p>
            <button class="chat-bubble-reply-btn" type="button" data-reply-chat="${escapeAttr(message.id)}">reply</button>
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

    // Filter tabs active class
    const filterTabs = document.querySelector(".disc-filter-tabs");
    if (filterTabs) {
      filterTabs.querySelectorAll("button").forEach(button => {
        button.classList.toggle("active", button.dataset.discFilter === (state.questionsFilter || "all"));
      });
    }

    let questions = myQuestions();

    // Localized sidebar search filter
    if (state.discQuery) {
      questions = questions.filter(q => 
        String(q.title || "").toLowerCase().includes(state.discQuery) ||
        String(q.description || "").toLowerCase().includes(state.discQuery)
      );
    }

    // Global header search filter
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
      // Clear thread if no questions are present
      state.selectedQuestionId = null;
      renderQuestionThread(null);
      return;
    }

    // Auto-select first question if none selected or if selected is not in current view
    let activeQuestion = questions.find(q => sameId(q.id, state.selectedQuestionId));
    if (!activeQuestion && questions.length > 0) {
      activeQuestion = questions[0];
      state.selectedQuestionId = activeQuestion.id;
    }

    target.innerHTML = questions.map((question) => {
      const course = state.data.courses.find((item) => sameId(item.id, question.course_id));
      const res = question.review_notes || question.response || question.feedback || "";
      const answered = Boolean(res) || /resolved|answered|complete|approved|reviewed/i.test(question.status);
      const studentName = state.student?.name || "Student";
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
                ${answered ? `<span style="color: var(--st-success);">💬 Answered</span>` : `<span>⏱ Pending</span>`}
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
    if (cat.includes("database") || cat.includes("sql") || cat.includes("supabase") || cat.includes("backend")) {
      return "background: rgba(24, 185, 111, 0.08); color: var(--st-success); border: 1px solid rgba(24, 185, 111, 0.15);";
    }
    return "background: var(--st-panel-soft); color: var(--st-muted); border: 1px solid var(--st-line);";
  }

  function renderQuestionThread(question) {
    const mainPane = document.getElementById("discMain");
    if (!mainPane) return;

    // Remove any previous thread content
    const existingThread = document.getElementById("discThreadContainer");
    if (existingThread) existingThread.remove();

    const emptyPane = document.getElementById("discEmptyPane");

    if (!question) {
      if (emptyPane) emptyPane.hidden = false;
      return;
    }

    if (emptyPane) emptyPane.hidden = true;

    const course = state.data.courses.find((item) => sameId(item.id, question.course_id));
    const studentName = state.student?.name || "Student";
    const studentInitials = initialsFor(studentName);
    const dateStr = formatDate(question.created_at) || "Recent";
    const courseName = course?.title || course?.name || "General support";

    const response = question.review_notes || question.response || question.feedback || "";
    const answered = Boolean(response) || /resolved|answered|complete|approved|reviewed/i.test(question.status);

    // Dynamic but deterministic view & like counters using a simple hash code
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
            <div class="disc-best-badge">★ BEST ANSWER</div>
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
              <button class="text-btn" type="button">Reply</button>
            </div>
          </article>
        </div>
      `;
    } else {
      answerHtml = `
        <div class="disc-answers-section">
          <h3 class="disc-answers-title">Answers (0)</h3>
          <div class="disc-pending-answer">
            <div class="disc-pending-icon">⏱</div>
            <div>
              <strong>Pending Mentor Response</strong>
              <p>Our LMS mentor team has been notified. You'll receive a response here within 2–4 hours.</p>
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
        const codeContent = lines.slice(1, lines.length - (lines[lines.length-1] === "```" ? 1 : 0)).join("\n");
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
            <div class="disc-attachment-icon">📎</div>
            <div class="disc-attachment-details">
              <strong>Attached Resource</strong>
              <small>${escapeHtml(truncate(question.drive_link || question.file_url, 45))}</small>
            </div>
            <a class="disc-attachment-link-btn" href="${escapeAttr(question.drive_link || question.file_url)}" target="_blank" rel="noopener">
              View File ↗
            </a>
          </div>
        ` : ""}
      </div>

      <div class="disc-stats-bar">
        <span class="disc-like-count">${likeCount} likes</span>
        <button class="disc-action-btn like-btn" type="button">❤️ Like</button>
      </div>

      ${answerHtml}
    `;

    mainPane.appendChild(threadContainer);

    // Bind interactive actions on the thread
    // Like button
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
          likeBtn.innerHTML = isLiked ? "❤️ Liked" : "❤️ Like";
        }
      });
    }


    // Copy code buttons
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
    const unreadLabel = unread ? ` · ${unread} NEW` : " · NO UNREAD";
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
          <button class="ticket-view-link" type="button" data-open-support-ticket="${ticketId}">View Thread →</button>
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
      body: `From: ${state.student.name || state.student.email || "Student"} | Role: Student | Category: ${ticket.category || "general"} | Subject: ${ticket.subject || "Support ticket"}`,
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
    return window.createSupabaseSignedUrl?.("support-attachments", path) || path;
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
    // Update coin balance in the new hero banner
    setText("shopCoinBalance", formatNumber(state.student.coins));

    const purchases = new Set(state.data.purchases
      .filter((item) => sameId(item.user_id || item.student_id, state.student.id))
      .map((item) => String(purchaseItemId(item))));
    const items = filteredRecords(state.data.shopItems, ["name", "description"]);
    const target = document.getElementById("shopGrid");
    if (!target) return;

    if (!items.length) {
      target.innerHTML = emptyState("Shop is empty", "Admin can add reward items from the admin dashboard.");
      return;
    }

    target.innerHTML = items.map((item, index) => {
      const owned = purchases.has(String(item.id));
      const price = Number(item.price || item.coins || 0);
      const canBuy = !owned && Number(state.student.coins || 0) >= price;
      const btnClass = owned ? "primary-btn owned-btn" : "primary-btn";
      const btnLabel = owned ? "✓ Owned" : "Redeem";
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
    const profileName = state.student.name || "Student";
    const profileEmail = state.student.email || "";
    const streak = currentStreak();
    
    // Top banner card
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

    // Metrics cards
    setText("profileCoinsVal", formatNumber(state.student.coins));
    setText("profileStreakVal", `${streak} Day${streak === 1 ? "" : "s"}`);
    setText("profileEnrolledCount", courses.length);
    setText("profileAverageProgress", `${averageCourseProgress(courses)}%`);
    setText("profileBatchName", batch?.name || "Not assigned");

    // Completed courses count
    const completedCount = courses.filter(c => courseProgress(c).percent === 100).length;
    setText("profileCoursesCount", completedCount);

    // Active Enrollment details
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
      "dsa-with-python": "course/1. Technology & Software Development/we.avif",
      "front-end-web-development": "course/1. Technology & Software Development/mk.avif",
      "full-stack-web-development": "course/1. Technology & Software Development/st.avif",
      "senior-sde-interview-prep": "course/1. Technology & Software Development/fotis-fotopoulos-6sAl6aQ4OWI.jpg",
      "full-stack-developer-portfolio": "course/1. Technology & Software Development/premium_photo-1720287601920-.avif",
      "android-development": "course/1. Technology & Software Development/hossain-khan-UP3SMQSoNsM.jpg",
      "artificial-intelligence": "course/2. Artificial Intelligence & Data Science/ai.jpg",
      "ai-agentic-and-generative": "course/2. Artificial Intelligence & Data Science/premium_photo-.avif",
      "machine-learning": "course/2. Artificial Intelligence & Data Science/br.jpg",
      "data-science": "course/2. Artificial Intelligence & Data Science/ji.avif",
      "data-engineering-with-sql-and-cloud": "course/2. Artificial Intelligence & Data Science/jonathan-kemper-MMUzS5Qzuus.jpg",
      "data-analytics-with-power-bi": "course/2. Artificial Intelligence & Data Science/yhn.jpg",
      "data-analysis": "course/2. Artificial Intelligence & Data Science/nnii.avif",
      "cyber-security-and-ethical-hacking": "course/3. Cyber Security, Cloud & DevOps/premium_photoegsd.avif",
      "cloud-computing": "course/3. Cyber Security, Cloud & DevOps/istockphoto-952067022.jpg",
      "devops": "course/3. Cyber Security, Cloud & DevOps/gettyimages.jpg",
      "internet-of-things-iot": "course/4. Engineering & Emerging Technologies/premium_photo-1681010317789.avif",
      "embedded-systems": "course/4. Engineering & Emerging Technologies/jeswin-thomas--Cm7hnp4WOg.jpg",
      "vlsi": "course/4. Engineering & Emerging Technologies/adi-goldstein-EUsVwEOsblE.jpg",
      "robotics": "course/4. Engineering & Emerging Technologies/ray-rui-SyzQ5aByJnE.jpg",
      "hybrid-electric-vehicle": "course/4. Engineering & Emerging Technologies/premium_photo.avif",
      "nanotechnology": "course/4. Engineering & Emerging Technologies/marius-masalar-CyFBmFEsytU.jpg",
      "digital-marketing": "course/5. Business, Finance & Marketing/social-sail-Uno9TGPs4pc.jpg",
      "human-resource-management": "course/5. Business, Finance & Marketing/vitaly-gariev-pg2eJwNVpvY.jpg",
      "finance": "course/5. Business, Finance & Marketing/anne-nygard-x07ELaNFt34.jpg",
      "startup-and-entrepreneurship": "course/5. Business, Finance & Marketing/lala-azizli-OFZUaeYKP3k.jpg",
      "business-analysis": "course/5. Business, Finance & Marketing/premium_photo-1661443781814.avif",
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
    const supabaseClient = getClient();
    const { error } = await supabaseClient
      .from("student_course_progress")
      .upsert(payload, { onConflict: "student_id,course_id" });

    if (!error) return;

    const { error: updateError } = await supabaseClient
      .from("student_course_progress")
      .update(payload)
      .eq("student_id", state.student.id)
      .eq("course_id", course.id);
    if (!updateError) return;

    const { error: insertError } = await supabaseClient.from("student_course_progress").insert(payload);
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

    const candidates = [
      {
        student_id: state.student.id,
        batch_id: currentBatch()?.id || null,
        course_id: courseId,
        title,
        description: details,
        status: "pending"
      },
      {
        student_id: state.student.id,
        user_id: state.student.id,
        course_id: courseId,
        title,
        description: details,
        drive_link: link || null,
        file_url: link || null,
        status: "pending",
        type: "question",
        created_at: new Date().toISOString()
      },
      {
        student_id: state.student.id,
        course_id: courseId,
        title,
        description: details,
        status: "pending",
        created_at: new Date().toISOString()
      },
      {
        user_id: state.student.id,
        course_id: courseId,
        title,
        description: details,
        status: "pending",
        created_at: new Date().toISOString()
      }
    ];

    try {
      await submitQuestionRecord({ courseId, title, details, link });
      event.target.reset();
      document.getElementById("discAskOverlay")?.setAttribute("aria-hidden", "true");
      showAlert("Question submitted to your LMS team.");
      await loadAllData({ silent: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to submit question. Check the projects table schema and RLS."), true);
    }
  }

  async function submitQuestionRecord({ courseId, title, details, link }) {
    if (getClient()?.rpc) {
      const { error } = await getClient().rpc("lms_submit_student_question", {
        target_user_id: state.student.id,
        target_course_id: courseId,
        question_title: title,
        question_description: details,
        question_link: link || null
      });
      if (!error) return;
      if (!isMissingRpcError(error)) throw error;
    }

    const isEnrolled = studentCourseIds().has(String(courseId));
    if (!isEnrolled) throw new Error("You can ask questions only for enrolled courses.");
    await insertFirstWorking("projects", [
      {
        student_id: state.student.id,
        user_id: state.student.id,
        batch_id: currentBatch()?.id || null,
        course_id: courseId,
        title,
        description: details,
        drive_link: link || null,
        file_url: link || null,
        status: "pending",
        type: "question",
        created_at: new Date().toISOString()
      }
    ]);
  }

  async function postChatMessage(event) {
    event.preventDefault();
    const input = document.getElementById("chatMessage");
    const message = input?.value.trim();
    const batch = currentBatch();
    if (!message || !batch) {
      showAlert("You need an assigned batch before sending messages.", true);
      return;
    }

    try {
      const { error } = await getClient().from("batch_chats").insert({
        batch_id: batch.id,
        user_id: state.student.id,
        message,
        parent_id: state.replyToChatId,
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      state.replyToChatId = null;
      input.value = "";
      input.placeholder = "Write a message to your batch...";
      showAlert("Message posted.");
      await loadAllData({ silent: true });
    } catch (error) {
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
    const existing = submissionForTask(taskId);
    const resourceLink = taskResourceLink(task);
    openModal("Submit Task", `
      <form class="stack-form" id="taskSubmitForm">
        <p class="muted">${escapeHtml(task.title || "Task")}</p>
        <div class="task-submit-link">
          <span>Task Resource</span>
          ${resourceLink
            ? `<a class="secondary-btn" href="${escapeAttr(resourceLink)}" target="_blank" rel="noopener">Open Task Link</a>`
            : `<p class="muted">No task resource link has been added.</p>`}
        </div>
        ${existing ? `
          <div class="import-callout">You already submitted this task on ${escapeHtml(formatDateTime(existing.submitted_at || existing.created_at))}. Duplicate submissions are not allowed.</div>
          ${taskSubmissionLink(existing) ? `<a class="secondary-btn" href="${escapeAttr(taskSubmissionLink(existing))}" target="_blank" rel="noopener">Open Your Submission</a>` : ""}
        ` : `
          <label>
            <span>Your Google Drive Link</span>
            <input id="taskSubmissionDriveLink" type="url" placeholder="https://drive.google.com/..." required>
          </label>
          <button class="primary-btn" type="submit">Submit Task</button>
        `}
      </form>
    `);
    if (!existing) document.getElementById("taskSubmitForm")?.addEventListener("submit", (event) => submitTask(event, task));
  }

  async function submitTask(event, task) {
    event.preventDefault();
    const link = document.getElementById("taskSubmissionDriveLink")?.value.trim();
    if (!link) {
      showAlert("Paste your Google Drive submission link before submitting.", true);
      return;
    }
    const existing = submissionForTask(task.id);
    if (existing) {
      showAlert("This task has already been submitted. Duplicate submissions are not allowed.", true);
      closeModal();
      return;
    }
    const now = new Date().toISOString();

    try {
      await submitTaskRecord(task, link, now);
      closeModal();
      await rewardCoins(10);
      showAlert("Task submission saved. You earned 10 coins.");
      await loadAllData({ silent: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to save task submission. Check task submission RLS."), true);
    }
  }

  async function submitTaskRecord(task, link, now) {
    if (getClient()?.rpc) {
      const { error } = await getClient().rpc("lms_submit_task_once", {
        target_task_id: task.id,
        target_student_id: state.student.id,
        submission_drive_link: link
      });
      if (!error) return;
      if (!isMissingRpcError(error)) throw error;
    }

    const candidates = [
      {
        task_id: task.id,
        student_id: state.student.id,
        user_id: state.student.id,
        batch_id: task.batch_id || currentBatch()?.id || null,
        course_id: task.course_id || selectedCourse()?.id || null,
        drive_link: link,
        file_url: link,
        status: "submitted",
        submitted_at: now,
        created_at: now
      },
      {
        task_id: task.id,
        student_id: state.student.id,
        drive_link: link,
        file_url: link,
        status: "submitted",
        submitted_at: now
      },
      {
        task_id: task.id,
        user_id: state.student.id,
        file_url: link,
        status: "submitted",
        submitted_at: now
      }
    ];
    await insertFirstWorking("task_submissions", candidates);
  }

  async function purchaseItem(itemId) {
    const item = state.data.shopItems.find((shopItem) => sameId(shopItem.id, itemId));
    if (!item) return;
    const price = Number(item.price || item.coins || 0);
    const coins = Number(state.student.coins || 0);
    if (coins < price) {
      showAlert("You do not have enough coins for this reward.", true);
      return;
    }

    try {
      const purchasePayloads = [
        { user_id: state.student.id, item_id: item.id },
        { student_id: state.student.id, item_id: item.id }
      ];
      await insertPurchaseRecord(purchasePayloads);

      await updateStudentProfile({ coins: Math.max(0, coins - price) });
      showAlert("Reward added to your profile.");
      await loadAllData({ silent: true });
    } catch (error) {
      const message = /duplicate|unique/i.test(error.message || "")
        ? "You already own this reward."
        : userFriendlyError(error, "Unable to buy item. Check the shop purchase table permissions.");
      showAlert(message, true);
    }
  }

  async function syncDailyStreak(options = {}) {
    if (!state.student?.id) return;
    const next = nextDailyStreakState(state.student);
    if (!next.shouldSave) return;

    const DAILY_COINS = 10;
    const currentCoins = Math.max(0, Number(state.student.coins || 0));

    try {
      await updateStudentProfile({
        last_active_date: next.today,
        streak_count: next.count,
        coins: currentCoins + DAILY_COINS
      });
      // Reflect changes locally so UI updates immediately without a reload
      state.student.last_active_date = next.today;
      state.student.streak_count = next.count;
      state.student.coins = currentCoins + DAILY_COINS;
      renderIdentity();
      if (!options.silent) {
        showAlert(`🔥 Day ${next.count} streak! +${DAILY_COINS} coins earned.`);
      }
    } catch (error) {
      console.warn("Daily streak update failed", error);
      if (!options.silent) {
        showAlert("Streak could not be saved right now. Please try again.", true);
      }
    }
  }

  async function rewardCoins(amount) {
    const current = Number(state.student.coins || 0);
    const streak = nextDailyStreakState(state.student);
    try {
      await updateStudentProfile({
        coins: current + amount,
        last_active_date: streak.today,
        streak_count: streak.count
      });
    } catch (error) {
      console.warn("Coin reward update failed", error);
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
      if (btnText) btnText.innerHTML = `<span class="edit-icon">✎</span> Edit Details`;
      await loadAllData({ silent: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to update profile."), true);
    }
  }

  async function updateStudentProfile(payload) {
    const { error } = await getClient().from("users").update(payload).eq("id", state.student.id);
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

  function handleTopSearch(event) {
    state.query = String(event.target.value || "").trim().toLowerCase();
    clearTimeout(state.searchTimer);
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
    document.querySelectorAll(".student-top-nav [data-jump]").forEach((button) => {
      button.classList.toggle("active", button.dataset.jump === viewName);
    });
    document.querySelectorAll(".page-tabs [data-jump]").forEach((button) => {
      button.classList.toggle("active", button.dataset.jump === viewName);
    });
    viewTitle.textContent = views[viewName].dataset.title || "Student LMS";
    viewKicker.textContent = views[viewName].dataset.kicker || "Jenovate";
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
    return ids.size ? sourceCourses.filter((course) => (
      ids.has(String(course.id))
      && String(course.status || "").toLowerCase() !== "archived"
    )) : [];
  }

  function catalogCourses() {
    const courses = mergedCourseRows(state.data.catalogCourses, state.data.courses);
    return (courses.length ? courses : state.data.courses)
      .filter((course) => String(course.status || "").toLowerCase() !== "archived");
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
    const publishedBonus = ["published", "active", "live"].includes(String(course?.status || "").toLowerCase()) ? 1 : 0;
    return lessonCount * 1000 + quizCount * 100 + modules.length * 10 + publishedBonus;
  }

  function studentCourseIds() {
    const ids = new Set();
    parseIdList(state.student.course_ids).forEach((id) => ids.add(String(id)));
    state.data.userCourses
      .filter((item) => (
        sameId(item.user_id || item.student_id || item.learner_id, state.student.id)
        && !item.deleted_at
        && !["cancelled", "archived", "removed"].includes(String(item.status || "active").toLowerCase())
      ))
      .forEach((item) => item.course_id && ids.add(String(item.course_id)));
    state.data.progress
      .filter((item) => sameId(item.student_id, state.student.id))
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
    return state.data.batches.filter((batch) => (
      String(batch.status || "").toLowerCase() !== "archived"
      && (sameId(batch.id, state.student.batch_id) || courseIds.has(String(batch.course_id)))
    ));
  }

  function currentBatch() {
    return scopedBatches().find((batch) => sameId(batch.id, state.selectedBatchId))
      || scopedBatches().find((batch) => sameId(batch.id, state.student.batch_id))
      || scopedBatches()[0]
      || null;
  }

  function scopedTasks() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.batchTasks.filter((task) => (
      String(task.status || "active").toLowerCase() !== "archived"
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
    return state.data.taskSubmissions.find((submission) => sameId(submission.task_id, taskId)
      && (sameId(submission.student_id, state.student.id) || sameId(submission.user_id, state.student.id)));
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

  function courseProgress(course) {
    const row = state.data.progress.find((item) => sameId(item.course_id, course.id) && sameId(item.student_id, state.student.id));
    const modules = parseModules(course.modules);
    const lessons = flattenCourseLessons(course, modules);
    const totalLessons = lessons.length;
    const completedLessons = lessons.filter((item) => (
      lessonProgressFromState(row, item).completed || legacyOrderCompleted(row?.completed_lessons, item.order)
    )).length;
    const completedModules = modules.filter((module, index) => (
      moduleProgressFromState(course, modules, index, row).completed || legacyOrderCompleted(row?.completed_modules, index + 1)
    )).length;
    const explicitProgress = numberFrom(row?.progress ?? row?.percentage ?? row?.percent);
    const percent = modules.length
      ? clamp(Math.round((completedModules / modules.length) * 100), 0, 100)
      : explicitProgress !== null
      ? clamp(Math.round(explicitProgress), 0, 100)
      : totalLessons
        ? clamp(Math.round((completedLessons / totalLessons) * 100), 0, 100)
        : 0;

    return { row, modules, totalLessons, completedLessons, completedModules, percent };
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
    const passScore = numberFrom(best.pass_score ?? quiz.pass_marks ?? quiz.pass_score);
    if (score === null) return false;
    if (passScore !== null) return score >= passScore;
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

  function lessonMediaUrl(lesson) {
    return [
      lesson?.video_drive_link,
      lesson?.videoDriveLink,
      lesson?.video_url,
      lesson?.videoUrl,
      lesson?.drive_link,
      lesson?.driveLink,
      lesson?.google_drive_link,
      lesson?.googleDriveLink,
      lesson?.file_url,
      lesson?.fileUrl,
      lesson?.url,
      lesson?.content_url,
      lesson?.contentUrl,
      lesson?.material_url,
      lesson?.materialUrl
    ].map((item) => String(item || "").trim()).find(Boolean) || "";
  }

  function mediaEmbedUrl(url) {
    if (!url) return "";
    const text = String(url).trim();
    const driveFile = text.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (driveFile?.[1]) return `https://drive.google.com/file/d/${driveFile[1]}/preview`;
    const driveOpen = text.match(/drive\.google\.com\/open\?id=([^&]+)/i);
    if (driveOpen?.[1]) return `https://drive.google.com/file/d/${driveOpen[1]}/preview`;
    if (/drive\.google\.com\/.*\/preview/i.test(text)) return text;
    const youtube = youtubeId(text);
    if (youtube) return `https://www.youtube.com/embed/${youtube}`;
    if (/player\.vimeo\.com\/video\//i.test(text)) return text;
    const vimeo = text.match(/vimeo\.com\/(\d+)/i);
    if (vimeo?.[1]) return `https://player.vimeo.com/video/${vimeo[1]}`;
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
              material_url: lesson.material_url || lesson.materialUrl || lesson.drive_link || lesson.driveLink || lesson.google_drive_link || lesson.googleDriveLink || ""
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
      questions
    };
  }

  function normalizeQuizQuestion(question, index = 0) {
    if (!question || typeof question !== "object") return { id: randomId(), text: "", option_a: "", option_b: "", option_c: "", option_d: "", answer: "A", marks: 1 };

    // ── Resolve options from every known format ──────────────────────────────

    let opt_a = "", opt_b = "", opt_c = "", opt_d = "";

    // Format 1: flat named keys — option_a / option_b / option_c / option_d
    if (question.option_a || question.option_b) {
      opt_a = String(question.option_a || question.a || "");
      opt_b = String(question.option_b || question.b || "");
      opt_c = String(question.option_c || question.c || "");
      opt_d = String(question.option_d || question.d || "");
    }

    // Format 2: camelCase — optionA / optionB / optionC / optionD
    else if (question.optionA || question.optionB) {
      opt_a = String(question.optionA || "");
      opt_b = String(question.optionB || "");
      opt_c = String(question.optionC || "");
      opt_d = String(question.optionD || "");
    }

    // Format 3: numbered — option1 / option2 / option3 / option4
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

    // Format 6: options — array or object
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

    // ── Resolve correct answer ────────────────────────────────────────────────

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

  function lessonsBefore(modules, moduleIndex) {
    return modules.slice(0, moduleIndex).reduce((sum, module) => sum + module.lessons.length, 0);
  }

  // Returns the ISO key ("YYYY-MM-DD") for Monday of the current week.
  function thisWeekMondayKey() {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7; // getDay(): 0=Sun,1=Mon…6=Sat
    const monday = new Date(now);
    monday.setDate(now.getDate() - mondayOffset);
    return dateKeyFromDate(monday);
  }

  // Weekly streak state (Mon–Sun).
  // The count goes 1→7 as the student logs in each day of the week.
  // On the first login of a new week (Monday or later after last week)
  // the count resets to 1.
  function nextDailyStreakState(profile) {
    const today = todayKey();
    const lastActive = dateKeyFromValue(profile?.last_active_date);
    const current = Math.max(0, Math.floor(Number(profile?.streak_count || 0)));

    // Already logged in today — nothing to save
    if (lastActive === today) {
      return { count: current, today, shouldSave: false };
    }

    const monday = thisWeekMondayKey();
    // lastActive is still in this Mon–Sun week if it is >= this Monday
    const isThisWeek = lastActive && lastActive >= monday;

    return {
      count: isThisWeek ? Math.min(7, current + 1) : 1,
      today,
      shouldSave: true
    };
  }

  // Display value for the streak counter.
  // Returns 0 when the student has not yet logged in this week.
  // Aligned to show the number of active days in the current week to match the UI flames.
  function currentStreak() {
    return weeklyActivityScore();
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
    // clamping strictly to this Mon–Sun window.
    // NO historical task/progress data is mixed in — that was causing
    // last-week activity to bleed into the current week's dots.
    const monday = thisWeekMondayKey();
    const sunday = weekDays()[6].key; // last day of this week
    const lastActive = dateKeyFromValue(state.student?.last_active_date);
    const streak = Math.max(0, Math.floor(Number(state.student?.streak_count || 0)));
    const active = new Set();

    if (!lastActive || streak <= 0) return active;
    // Safety: lastActive must be within this week
    if (lastActive < monday || lastActive > sunday) return active;

    // Walk backward from lastActive for exactly streak days, stop at Monday
    for (let i = 0; i < streak; i++) {
      const key = shiftDateKey(lastActive, -i);
      if (key >= monday) {
        active.add(key);
      } else {
        break; // gone past Monday — stop
      }
    }

    return active;
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

  async function insertFirstWorking(table, payloads) {
    let lastError = null;
    for (const payload of payloads) {
      const compactPayload = stripNullish(payload);
      const { error } = await getClient().from(table).insert(compactPayload);
      if (!error) return;
      lastError = error;
      if (!isSchemaShapeError(error)) break;
    }
    throw lastError || new Error(`Unable to insert into ${table}.`);
  }

  async function insertPurchaseRecord(payloads) {
    let lastError = null;
    for (const table of ["shop_purchases", "student_shop_purchases"]) {
      try {
        await insertFirstWorking(table, payloads);
        return;
      } catch (error) {
        lastError = error;
        if (!isSchemaShapeError(error)) break;
      }
    }
    throw lastError || new Error("Unable to save shop purchase.");
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

  function isSchemaShapeError(error) {
    return /column|schema|does not exist|could not find|relation/i.test(error?.message || "");
  }

  function userFriendlyError(error, fallback) {
    const sharedFormatter = window.JenovatePortalErrors?.formatPortalError;
    if (sharedFormatter) return sharedFormatter(error, fallback);

    const message = error?.message || String(error || "");
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return "Could not reach the learning server. Check your internet connection and try again.";
    }
    if (/permission denied|row-level security|rls/i.test(message)) {
      return "This action is blocked by current permissions. Please contact support.";
    }
    if (/schema cache|could not find|column/i.test(message)) {
      return "The learning server schema is updating. Refresh the page and try again.";
    }
    return message || fallback;
  }

  function stripNullish(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  function normalizeUser(user) {
    return {
      ...user,
      id: user.id ? String(user.id) : "",
      name: user.name || user.username || user.email || "Student",
      role: String(user.role || "student").toLowerCase(),
      coins: Number(user.coins || 0),
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
    showAlert(`🎉 Daily Login Reward Claimed! +${amount} Coins`);
    delete state.student.daily_login_reward_claimed;
    delete state.student.daily_login_reward_amount;
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

  function parseIdList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const parsed = typeof value === "string" ? tryJson(value) : value;
    if (Array.isArray(parsed)) return parsed;
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
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

  function parseJsonDeep(value) {
    let parsed = value;
    for (let i = 0; i < 2 && typeof parsed === "string"; i += 1) {
      const next = tryJson(parsed);
      if (next === null) break;
      parsed = next;
    }
    return parsed;
  }

  function tryJson(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function sameId(a, b) {
    return a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);
  }

  function friendlySupabaseError(error) {
    const message = error?.message || "Unable to fetch";
    if (/permission|policy|rls/i.test(message)) return "permission/RLS blocked";
    if (/relation|table|does not exist/i.test(message)) return "table is missing";
    if (/column|schema cache|could not find/i.test(message)) return "schema cache/column mismatch";
    return message;
  }

  function randomId() {
    return window.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function numberFrom(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function uniqueArray(values) {
    return Array.from(new Set(values.filter((value) => value !== undefined && value !== null)));
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function truncate(value, length) {
    const text = String(value || "");
    return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
  }

  function initialsFor(value) {
    return String(value || "S")
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase())
      .join("") || "S";
  }

  function formatTableName(table) {
    return String(table || "").replace(/_/g, " ");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function setProgress(id, value) {
    const element = document.getElementById(id);
    if (element) element.style.width = `${clamp(Number(value || 0), 0, 100)}%`;
  }

  function setLoading(active) {
    loadingPanel?.classList.toggle("active", active);
  }

  function setSyncStatus(message) {
    if (syncStatus) syncStatus.textContent = "";
  }

  function showAlert(message, isError = false) {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.classList.toggle("error", Boolean(isError));
    alertBox.classList.add("show");
    window.clearTimeout(showAlert.timer);
    showAlert.timer = window.setTimeout(() => alertBox.classList.remove("show"), isError ? 7000 : 3500);
  }

  function emptyState(title, detail) {
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail || "")}</p></div>`;
  }

  function openModal(title, body) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modal?.classList.toggle("quiz-modal", /quiz/i.test(String(title || "")));
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
    modal?.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
  }

  function closeModal() {
    modal?.classList.remove("open");
    modal?.classList.remove("quiz-modal");
    modal?.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
  }

  function on(id, eventName, handler) {
    document.getElementById(id)?.addEventListener(eventName, handler);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
