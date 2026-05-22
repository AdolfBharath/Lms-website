(function () {
  const SESSION_KEY = "jenovateStudentSession";
  const APP_SESSION_KEY = "jenovateCurrentUser";
  const ADMIN_SESSION_KEY = "jenovateAdminSession";
  const MENTOR_SESSION_KEY = "jenovateMentorSession";
  const getClient = () => window.getSupabaseClient?.();

  const TABLE_SPECS = [
    {
      key: "users",
      table: "users",
      select: "id,name,email,role,username,phone,batch_id,course_ids,coins,streak_count,last_active_date,created_at,referral,referral_key",
      limit: 500
    },
    { key: "courses", table: "courses", select: "*", limit: 200 },
    { key: "batches", table: "batches", select: "*", limit: 200 },
    { key: "userCourses", table: "user_courses", select: "*", limit: 1000 },
    { key: "progress", table: "student_course_progress", select: "*", limit: 1000 },
    { key: "shopItems", table: "shop_items", select: "*", limit: 100 },
    { key: "purchases", table: "shop_purchases", select: "*", optional: true, limit: 200 },
    { key: "studentShopPurchases", table: "student_shop_purchases", select: "*", optional: true, limit: 200 },
    { key: "projects", table: "projects", select: "*", limit: 500 },
    { key: "batchTasks", table: "batch_tasks", select: "*", limit: 500 },
    { key: "taskSubmissions", table: "task_submissions", select: "*", limit: 500 },
    { key: "quizAttempts", table: "student_quiz_attempts", select: "*", optional: true, limit: 1000 },
    { key: "chats", table: "batch_chats", select: "*", limit: 200 },
    { key: "announcements", table: "announcements", select: "*", limit: 100 }
  ];

  const state = {
    student: null,
    activeView: "dashboard",
    courseFilter: "all",
    query: "",
    selectedCourseId: "",
    selectedLessonKey: "",
    selectedBatchId: "",
    replyToChatId: null,
    lessonTrackerCleanup: null,
    videoProgressLastSaved: {},
    videoProgressSaveInFlight: {},
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
      purchases: [],
      studentShopPurchases: [],
      projects: [],
      batchTasks: [],
      taskSubmissions: [],
      quizAttempts: [],
      chats: [],
      announcements: []
    }
  };

  const views = {
    dashboard: document.getElementById("dashboardView"),
    courses: document.getElementById("coursesView"),
    learn: document.getElementById("learnView"),
    tasks: document.getElementById("tasksView"),
    batch: document.getElementById("batchView"),
    announcements: document.getElementById("announcementsView"),
    questions: document.getElementById("questionsView"),
    shop: document.getElementById("shopView"),
    rewards: document.getElementById("rewardsView"),
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

    if (!getClient()) {
      showAlert("Supabase library did not load. Check your internet connection and refresh the page.", true);
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
      button.addEventListener("click", () => {
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
    on("refreshBtn", "click", () => loadAllData());
    on("reloadTasksBtn", "click", () => loadAllData());
    on("reloadChatBtn", "click", () => loadAllData());
    on("reloadAnnouncementsBtn", "click", () => loadAllData());
    on("homeBtn", "click", () => {
      closeModal();
      closeMobileMenu();
      setView("dashboard");
      document.querySelector(".student-main")?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    on("logoutBtn", "click", logout);
    on("themeToggle", "click", toggleTheme);
    on("studentMenuBtn", "click", openMobileMenu);
    on("studentSidebarScrim", "click", closeMobileMenu);
    on("globalSearch", "input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      renderActiveView();
    });
    on("taskBatchFilter", "change", (event) => {
      state.selectedBatchId = event.target.value;
      renderTasks();
    });
    on("chatComposer", "submit", postChatMessage);
    on("questionForm", "submit", submitQuestion);
    on("profileForm", "submit", saveProfile);
    on("passwordForm", "submit", updatePassword);

    document.getElementById("courseFilterTabs")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-course-filter]");
      if (!button) return;
      state.courseFilter = button.dataset.courseFilter;
      document.querySelectorAll("[data-course-filter]").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderCourses();
    });

    document.addEventListener("click", (event) => {
      const openCourse = event.target.closest("[data-open-course]");
      if (openCourse) {
        state.selectedCourseId = openCourse.dataset.openCourse;
        state.selectedLessonKey = "";
        setView("learn");
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

      const quizButton = event.target.closest("[data-start-quiz]");
      if (quizButton) {
        openStudentQuiz(quizButton.dataset.courseId, Number(quizButton.dataset.moduleIndex || 0));
        return;
      }

      const replyButton = event.target.closest("[data-reply-chat]");
      if (replyButton) {
        prepareChatReply(replyButton.dataset.replyChat);
      }
    });
  }

  async function resolveStudentSession() {
    return readStoredRoleSession("student");
  }

  function readStoredRoleSession(expectedRole) {
    for (const key of [SESSION_KEY, APP_SESSION_KEY]) {
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
    if (!readStoredRoleSession("student")) {
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
    setLoading(!silent);
    setSyncStatus("Connecting to Supabase...");

    try {
      const results = await Promise.all(TABLE_SPECS.map(fetchTableSafe));
      const rows = Object.fromEntries(results.map((result) => [result.key, result.rows]));
      const failed = results.filter((result) => result.error && !result.optional);

      state.tableErrors = Object.fromEntries(failed.map((result) => [result.table, result.error.message || "Unable to fetch"]));
      state.data.users = rows.users.map(normalizeUser);
      state.data.courses = rows.courses;
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

      const refreshedProfile = state.data.users.find((user) => sameId(user.id, state.student.id));
      if (refreshedProfile) {
        state.student = normalizeUser({ ...state.student, ...refreshedProfile });
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.student));
        sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(state.student));
      }

      await syncDailyStreak({ silent: true });
      ensureSelections();
      renderAll();

      const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (failed.length) {
        const failedTables = failed.map((item) => item.table).join(", ");
        showAlert(`Some data couldn't load (${failedTables}). Refresh to try again.`, true);
        setSyncStatus(`Synced with warnings at ${stamp}`);
      } else {
        if (!silent) showAlert("Student data synced from Supabase.");
        setSyncStatus(`Live Supabase data synced ${stamp}`);
      }
    } catch (error) {
      const errorMsg = error.message || "Unable to load student data.";
      showAlert(`${errorMsg} Check your connection and try refreshing.`, true);
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
      if (!spec.optional) {
        console.error(`Supabase fetch failed for ${spec.table}`, error);
      }
      return { ...spec, rows: [], error };
    }
  }

  async function fetchTable(table, select, limit = 500) {
    const supabaseClient = getClient();
    const { data, error } = await supabaseClient.from(table).select(select).limit(limit);
    if (error) throw error;
    return data || [];
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

    const liveTables = [
      "users",
      "courses",
      "batches",
      "user_courses",
      "student_course_progress",
      "shop_items",
      "shop_purchases",
      "student_shop_purchases",
      "projects",
      "batch_tasks",
      "task_submissions",
      "student_quiz_attempts",
      "batch_chats",
      "announcements"
    ];

    const channel = supabaseClient.channel("student-lms-realtime");
    liveTables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => queueRealtimeRefresh(table));
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
    state.refreshTimer = window.setTimeout(() => loadAllData({ silent: true }), 650);
  }

  function renderAll() {
    renderIdentity();
    renderDashboard();
    renderCourses();
    renderLearn();
    renderTasks();
    renderBatch();
    renderAnnouncements();
    renderQuestions();
    renderShop();
    renderRewards();
    renderReferral();
    renderProfile();
  }

  function renderActiveView() {
    const renderers = {
      dashboard: renderDashboard,
      courses: renderCourses,
      learn: renderLearn,
      tasks: renderTasks,
      batch: renderBatch,
      announcements: renderAnnouncements,
      questions: renderQuestions,
      shop: renderShop,
      rewards: renderRewards,
      referral: renderReferral,
      profile: renderProfile
    };
    renderers[state.activeView]?.();
  }

  function renderIdentity() {
    const student = state.student;
    if (!student) return;
    const initials = initialsFor(student.name || student.email);
    setText("sidebarStudentName", student.name || "Student");
    setText("sidebarStudentEmail", student.email || "");
    setText("sidebarStudentAvatar", initials);
    setText("topbarStudentAvatar", initials);
    setText("coinBalance", formatNumber(student.coins));
    setText("shopCoinBalance", formatNumber(student.coins));
    renderStreakCard();
    setValue("profileName", student.name || "");
    setValue("profileUsername", student.username || "");
    setValue("profilePhone", student.phone || "");
  }

  function renderDashboard() {
    const courses = filteredCourses(enrolledCourses());
    const batches = scopedBatches();
    const tasks = scopedTasks();
    const pendingTasks = tasks.filter((task) => !submissionForTask(task.id));
    const purchases = state.data.purchases.filter((purchase) => sameId(purchase.user_id, state.student.id));
    const avgProgress = averageCourseProgress(courses);
    const primaryBatch = currentBatch();

    setText("heroBatchName", primaryBatch ? primaryBatch.name : "Your learning workspace");
    setText("heroGreeting", `Welcome back, ${state.student.name || "Student"}.`);
    setText("heroSummary", courses.length
      ? `You have ${courses.length} course${courses.length === 1 ? "" : "s"} active and ${pendingTasks.length} task${pendingTasks.length === 1 ? "" : "s"} waiting.`
      : "Your courses will appear here as soon as admin enrolls you.");
    setText("metricCourses", courses.length);
    setText("metricTasks", pendingTasks.length);
    setText("metricTasksMeta", pendingTasks.length === 1 ? "pending submission" : "pending submissions");
    setText("metricStreak", currentStreak());
    setText("metricStreakMeta", isActiveToday() ? "active today" : "start today to save it");
    setText("metricRewards", purchases.length);
    setText("overallProgressLabel", `${avgProgress}%`);
    setText("overallProgressMeta", courses.length ? `${courses.length} active course${courses.length === 1 ? "" : "s"}` : "No progress recorded yet");
    setProgress("overallProgressBar", avgProgress);
    renderStreakCard();

    renderCourseCards("dashboardCourses", courses.slice(0, 3), { compact: true });
    renderCompactTasks("dashboardTasks", tasks.slice(0, 4));
    renderCompactChats("dashboardChats", scopedChats().slice(-4).reverse());
    renderCompactAnnouncements("dashboardAnnouncements", scopedAnnouncements().slice(0, 4));
    renderDashboardAchievements();
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
          <span class="streak-day-dot" aria-hidden="true"></span>
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
    }

    renderCourseCards("coursesGrid", courses, { compact: false });
  }

  function renderCourseCards(targetId, courses, options = {}) {
    const target = document.getElementById(targetId);
    if (!target) return;
    if (!courses.length) {
      target.innerHTML = emptyState("No courses found", "Your enrolled courses will appear here from Supabase.");
      return;
    }

    target.innerHTML = courses.map((course) => {
      const progress = courseProgress(course);
      const modules = parseModules(course.modules);
      const title = escapeHtml(course.title || course.name || "Untitled course");
      const description = escapeHtml(truncate(course.description || "No course description available.", options.compact ? 110 : 160));
      const status = progress.percent >= 100 ? "Completed" : "Active";
      const thumbnail = escapeAttr(course.thumbnail_url || "image/login/loginimg.png");
      return `
        <article class="course-card">
          <img class="course-thumb" src="${thumbnail}" alt="">
          <span class="pill ${progress.percent >= 100 ? "success" : ""}">${escapeHtml(status)}</span>
          <h3>${title}</h3>
          <p>${description}</p>
          <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
          <div class="card-footer">
            <small class="card-meta">${modules.length} module${modules.length === 1 ? "" : "s"} - ${progress.percent}% complete</small>
            <button class="primary-btn" type="button" data-open-course="${escapeAttr(course.id)}">Start Learning</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderLearn() {
    const courses = filteredCourses(enrolledCourses());
    const list = document.getElementById("learnCourseList");
    if (list) {
      list.innerHTML = courses.length ? courses.map((course) => {
        const progress = courseProgress(course);
        return `
          <button class="course-pick ${sameId(course.id, state.selectedCourseId) ? "active" : ""}" type="button" data-open-course="${escapeAttr(course.id)}">
            <strong>${escapeHtml(course.title || course.name || "Untitled course")}</strong>
            <span class="muted">${progress.percent}% complete</span>
            <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
          </button>
        `;
      }).join("") : emptyState("No courses", "You are not enrolled in a course yet.");
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
    setText("lessonCourseMeta", course
      ? `${course.category || course.difficulty || "Course"} - ${modules.length} module${modules.length === 1 ? "" : "s"}`
      : "No course selected");
    setText("lessonTitle", selectedLesson?.lesson?.title || course?.title || course?.name || "Choose a course");
    setText("lessonDescription", selectedLesson
      ? `Module ${selectedModuleNumber}: ${selectedLesson.module.title || "Untitled module"} - Lesson ${selectedLessonNumber}`
      : course?.description || "Your course modules and lessons will appear here.");
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

    const progress = courseProgress(course);
    moduleList.innerHTML = modules.map((module, index) => {
      const moduleLessons = module.lessons.length ? module.lessons : [{ title: module.title || `Module ${index + 1}`, duration: course.duration || "" }];
      const moduleStart = lessonsBefore(modules, index);
      const moduleStats = moduleProgressFromState(course, modules, index, progress.row);
      const completedInModule = moduleLessons.filter((lesson, lessonIndex) => {
        const item = {
          key: lessonKey(course.id, index, lessonIndex, lesson),
          course,
          module,
          moduleIndex: index,
          lesson,
          lessonIndex,
          order: moduleStart + lessonIndex + 1,
          mediaUrl: lessonMediaUrl(lesson)
        };
        return lessonProgressFromState(progress.row, item).completed || legacyOrderCompleted(progress.row?.completed_lessons, item.order);
      }).length;
      const modulePercent = moduleStats.percent;
      const moduleSelected = selectedLesson?.moduleIndex === index;
      return `
        <details class="module-card ${moduleSelected ? "active" : ""}" ${moduleSelected || index === 0 ? "open" : ""}>
          <summary class="module-summary">
            <span class="module-number">Module ${index + 1}</span>
            <span class="module-summary-main">
              <strong>${escapeHtml(module.title || `Module ${index + 1}`)}</strong>
              ${module.description ? `<small>${escapeHtml(module.description)}</small>` : ""}
            </span>
            <span class="module-summary-meta">
              <b>${completedInModule}/${moduleLessons.length}</b>
              <small>lessons</small>
            </span>
          </summary>
          <div class="module-progress">
            <span style="width:${modulePercent}%"></span>
          </div>
          <ul class="lesson-list">
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
                  <span>
                    <strong>${escapeHtml(lesson.title || `Lesson ${lessonIndex + 1}`)}</strong>
                    <small>${escapeHtml(`Module ${index + 1} - Lesson ${lessonIndex + 1}${lesson.duration ? ` - ${lesson.duration}` : ""}`)}</small>
                    ${lesson.description || lesson.transcript || mediaUrl ? `<small>${escapeHtml(lesson.description || lesson.transcript || mediaUrl)}</small>` : ""}
                  </span>
                  <span class="lesson-actions">
                    <span class="pill ${done ? "success" : mediaUrl ? "" : "warning"}">${done ? "Done" : mediaUrl ? `${lessonStats.percent}%` : escapeHtml(lesson.duration || "Pending")}</span>
                    <button class="${mediaUrl ? "primary-btn" : "secondary-btn"}" type="button" data-select-lesson="${escapeAttr(key)}">${mediaUrl ? "Play" : "Open"}</button>
                  </span>
                </li>
              `;
            }).join("")}
          </ul>
          ${moduleQuizBlock(course, module, index)}
        </details>
      `;
    }).join("");
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
    if (!lessonItem) {
      target.innerHTML = emptyState("No lessons yet", "Lessons and videos added by your mentor will appear here.");
      return;
    }

    const lesson = lessonItem.lesson;
    const mediaUrl = lessonItem.mediaUrl;
    const embedUrl = mediaEmbedUrl(mediaUrl);
    const directVideo = mediaUrl && isDirectVideoUrl(mediaUrl);
    const description = lesson.description || lesson.transcript || lessonItem.module.description || course.description || "";
    const moduleLabel = `Module ${lessonItem.moduleIndex + 1}: ${lessonItem.module.title || "Untitled module"}`;
    const lessonLabel = `Lesson ${lessonItem.lessonIndex + 1}`;

    target.innerHTML = `
      <div class="player-header">
        <div>
          <span>${escapeHtml(`${moduleLabel} - ${lessonLabel}`)}</span>
          <h3>${escapeHtml(lesson.title || "Lesson")}</h3>
        </div>
        ${mediaUrl ? `<a class="secondary-btn" href="${escapeAttr(mediaUrl)}" target="_blank" rel="noopener">Open Source</a>` : ""}
      </div>
      <div class="media-frame">
        ${directVideo ? `
          <video controls preload="metadata" src="${escapeAttr(mediaUrl)}"></video>
        ` : embedUrl ? `
          <iframe src="${escapeAttr(embedUrl)}" title="${escapeAttr(lesson.title || "Lesson video")}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
        ` : `
          <div class="media-empty">
            <strong>${mediaUrl ? "Open the lesson resource" : "No video attached"}</strong>
            <p>${escapeHtml(mediaUrl ? "This lesson uses an external resource that opens in a new tab." : "Add a video or Drive link in the mentor course editor.")}</p>
            ${mediaUrl ? `<a class="primary-btn" href="${escapeAttr(mediaUrl)}" target="_blank" rel="noopener">Open Lesson</a>` : ""}
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
    const quiz = normalizeQuiz(module.quiz || module.quizQuestions || module.questions, module);
    if (!quiz || !quiz.questions.length) return "";
    const best = bestQuizAttempt(course.id, module.id, quiz.id);
    const attemptQuestionsCount = Math.min(5, quiz.questions.length);
    const sampleQuestions = quiz.questions.slice(0, attemptQuestionsCount);
    const totalMarks = sampleQuestions.reduce((sum, q) => sum + Number(q.marks || 1), 0);
    const passMarks = Math.ceil(totalMarks * 0.6);
    return `
      <div class="module-quiz-card">
        <div>
          <span class="pill">Quiz</span>
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
    const quiz = normalizeQuiz(module?.quiz || module?.quizQuestions || module?.questions, module);
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
    openModal("Module Quiz", `
      <form class="quiz-attempt-form" id="quizAttemptForm">
        <div class="quiz-attempt-hero">
          <div>
            <span>${escapeHtml(module.title || "Module")}</span>
            <h3>${escapeHtml(quiz.title || "Module Quiz")}</h3>
            <p>${attemptQuestions.length} questions - ${totalMarks} marks - Pass ${passMarks}</p>
          </div>
          <strong>Best ${Number(best?.score || 0)}</strong>
        </div>
        ${attemptQuestions.map((question, index) => `
          <fieldset class="quiz-question">
            <legend>Q${index + 1}. ${escapeHtml(question.text)}</legend>
            ${["A", "B", "C", "D"].map((key) => {
              const text = question[`option_${key.toLowerCase()}`];
              if (!text) return "";
              return `
                <label class="quiz-option">
                  <input type="radio" name="quiz_${index}" value="${key}" required>
                  <span>${key}</span>
                  <strong>${escapeHtml(text)}</strong>
                </label>
              `;
            }).join("")}
            <small>${Number(question.marks || 1)} mark${Number(question.marks || 1) === 1 ? "" : "s"}</small>
          </fieldset>
        `).join("")}
        <div class="modal-actions">
          <button class="secondary-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Submit Quiz</button>
        </div>
      </form>
    `);

    const form = document.getElementById("quizAttemptForm");
    if (form) {
      form._attemptQuestions = attemptQuestions;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitQuizAttempt(course, module, quiz, form);
      });
    }
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
    const maxScore = questionsToEvaluate.reduce((sum, question) => sum + Number(question.marks || 0), 0);
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

    const target = document.getElementById("tasksGrid");
    if (!target) return;
    if (!tasks.length) {
      target.innerHTML = emptyState("No tasks", "Assignments from your mentor or admin will appear here.");
      return;
    }

    target.innerHTML = tasks.map((task) => {
      const submission = submissionForTask(task.id);
      const due = task.deadline ? formatDate(task.deadline) : "No deadline";
      const batch = state.data.batches.find((item) => sameId(item.id, task.batch_id));
      const status = submission ? submission.status || "Submitted" : "Pending";
      return `
        <article class="task-card ${submission ? "is-submitted" : ""}">
          <div class="card-topline">
            <span class="pill ${statusTone(status)}">${escapeHtml(humanizeStatus(status))}</span>
            <small>${escapeHtml(due)}</small>
          </div>
          <div class="card-copy">
            <h3>${escapeHtml(task.title || "Untitled task")}</h3>
            <p>${escapeHtml(truncate(task.description || "No task details available.", 150))}</p>
          </div>
          <div class="card-footer">
            <small class="card-meta">${escapeHtml(batch?.name || "Batch")}</small>
            <button class="primary-btn" type="button" data-open-task="${escapeAttr(task.id)}">${submission ? "Update" : "Submit"}</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderBatch() {
    const batch = currentBatch();
    const batchInfo = document.getElementById("batchInfo");
    const classmates = document.getElementById("classmateList");

    if (batchInfo) {
      if (!batch) {
        batchInfo.innerHTML = emptyState("No batch assigned", "Your batch appears here after admin enrollment.");
      } else {
        const course = state.data.courses.find((item) => sameId(item.id, batch.course_id));
        const mentor = mentorForBatch(batch);
        batchInfo.innerHTML = `
          <div class="profile-meta">
            <div><small class="muted">Batch</small><strong>${escapeHtml(batch.name || "Batch")}</strong></div>
            <div><small class="muted">Course</small><strong>${escapeHtml(course?.title || "Course")}</strong></div>
            <div><small class="muted">Mentor</small><strong>${escapeHtml(mentor?.name || "Not assigned")}</strong></div>
            <div><small class="muted">Period</small><strong>${escapeHtml(batchPeriod(batch))}</strong></div>
            <div><small class="muted">Status</small><strong>${escapeHtml(batch.status || "Active")}</strong></div>
          </div>
        `;
      }
    }

    if (classmates) {
      const students = classmatesForBatch(batch);
      classmates.innerHTML = students.length ? students.map((user) => `
        <div class="classmate-card">
          <strong>${escapeHtml(user.name || user.email || "Student")}</strong>
          <small class="muted">${escapeHtml(user.email || "")}</small>
        </div>
      `).join("") : emptyState("No classmates visible", "Classmates appear when Supabase policies allow batch members.");
    }

    renderChat();
  }

  function renderAnnouncements() {
    const target = document.getElementById("announcementsList");
    if (!target) return;
    const rows = scopedAnnouncements().filter((item) => filteredAnnouncement(item));
    target.innerHTML = rows.length
      ? rows.map(announcementCard).join("")
      : emptyState("No announcements", "Notices from admin and mentors will appear here.");
  }

  function renderChat() {
    const target = document.getElementById("chatList");
    if (!target) return;
    const messages = scopedChats().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    if (!messages.length) {
      target.innerHTML = emptyState("No messages", "Start a batch conversation with your mentor and classmates.");
      return;
    }

    target.innerHTML = messages.map((message) => {
      const user = state.data.users.find((item) => sameId(item.id, message.user_id));
      const mine = sameId(message.user_id, state.student.id);
      const reply = message.parent_id ? messages.find((item) => sameId(item.id, message.parent_id)) : null;
      return `
        <div class="chat-bubble ${mine ? "mine" : ""}">
          <header>
            <strong>${escapeHtml(mine ? "You" : user?.name || user?.email || "User")}</strong>
            <time>${escapeHtml(formatDateTime(message.created_at))}</time>
          </header>
          ${reply ? `<div class="reply-preview">Replying to ${escapeHtml(truncate(reply.message || "", 80))}</div>` : ""}
          <p>${escapeHtml(message.message || "")}</p>
          <div class="chat-actions">
            <button class="text-btn" type="button" data-reply-chat="${escapeAttr(message.id)}">Reply</button>
          </div>
        </div>
      `;
    }).join("");
    target.scrollTop = target.scrollHeight;
  }

  function renderQuestions() {
    const select = document.getElementById("questionCourse");
    const courses = enrolledCourses();
    if (select) {
      select.innerHTML = courses.length ? courses.map((course) => (
        `<option value="${escapeAttr(course.id)}">${escapeHtml(course.title || course.name || "Course")}</option>`
      )).join("") : `<option value="">No enrolled courses</option>`;
    }

    const questions = filteredRecords(myQuestions(), ["title", "description", "status"]);
    const target = document.getElementById("questionList");
    if (!target) return;
    target.innerHTML = questions.length ? questions.map((question) => {
      const course = state.data.courses.find((item) => sameId(item.id, question.course_id));
      const status = question.status || "Pending";
      const response = question.review_notes || question.response || question.feedback || "";
      return `
        <article class="question-card">
          <div class="card-topline">
            <span class="pill ${statusTone(status)}">${escapeHtml(humanizeStatus(status))}</span>
            <small>${escapeHtml(formatDateTime(question.created_at))}</small>
          </div>
          <div class="card-copy">
            <h3>${escapeHtml(question.title || question.name || "Question")}</h3>
            <p>${escapeHtml(truncate(question.description || question.details || "", 150))}</p>
          </div>
          ${response ? `<div class="question-response"><small>Response</small><p>${escapeHtml(truncate(response, 170))}</p></div>` : ""}
          <div class="card-footer"><small class="card-meta">${escapeHtml(course?.title || course?.name || "General support")}</small></div>
        </article>
      `;
    }).join("") : emptyState("No questions yet", "Submit a question when you need mentor help.");
  }

  function renderShop() {
    setText("shopCoinBalance", formatNumber(state.student.coins));
    const purchases = new Set(state.data.purchases
      .filter((item) => sameId(item.user_id || item.student_id, state.student.id))
      .map((item) => String(purchaseItemId(item))));
    const items = filteredRecords(state.data.shopItems, ["name", "description"]);
    const target = document.getElementById("shopGrid");
    if (!target) return;
    if (!items.length) {
      target.innerHTML = emptyState("Shop is empty", "Admin can add coin rewards from the admin dashboard.");
      return;
    }

    target.innerHTML = items.map((item) => {
      const owned = purchases.has(String(item.id));
      const price = Number(item.price || item.coins || 0);
      const canBuy = !owned && Number(state.student.coins || 0) >= price;
      return `
        <article class="shop-card">
          ${item.image_url ? `<img src="${escapeAttr(item.image_url)}" alt="${escapeAttr(item.name || "Reward item")}" />` : ""}
          <div class="card-copy">
            <h3>${escapeHtml(item.name || "Reward item")}</h3>
            <p>${escapeHtml(truncate(item.description || "Redeem this reward with coins.", 120))}</p>
          </div>
          <div class="shop-actions">
            <span class="pill">${formatNumber(price)} coins</span>
            <button class="primary-btn" type="button" data-buy-item="${escapeAttr(item.id)}" ${canBuy ? "" : "disabled"}>${owned ? "Owned" : "Buy"}</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderRewards() {
    renderWeeklyActivity();
    renderAchievementGrid();
    renderOwnedItems();
  }

  function renderReferral() {
    window.renderStudentReferral?.(state.student);
  }

  function renderWeeklyActivity() {
    const target = document.getElementById("weeklyActivity");
    if (!target) return;
    const activeDays = weeklyActiveDateKeys();
    target.innerHTML = weekDays().map((day) => {
      const active = activeDays.has(day.key);
      return `
      <div class="day-cell ${active ? "active" : ""}">
        <strong>${escapeHtml(day.shortLabel)}</strong>
        <small>${active ? "Active" : "Open"}</small>
      </div>
    `;
    }).join("");
  }

  function renderDashboardAchievements() {
    const target = document.getElementById("dashboardAchievements");
    if (!target) return;
    target.innerHTML = achievements().slice(0, 4).map((item) => `
      <div class="achievement-card">
        <strong>${escapeHtml(item.value)}</strong>
        <small>${escapeHtml(item.label)}</small>
      </div>
    `).join("");
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
    target.innerHTML = `
      <div class="profile-hero">
        <div class="student-avatar">${escapeHtml(initialsFor(state.student.name || state.student.email))}</div>
        <div>
          <h2>${escapeHtml(state.student.name || "Student")}</h2>
          <p class="muted">${escapeHtml(state.student.email || "")}</p>
        </div>
      </div>
      <div class="profile-meta">
        <div><small class="muted">Role</small><strong>Student</strong></div>
        <div><small class="muted">Coins</small><strong>${formatNumber(state.student.coins)}</strong></div>
        <div><small class="muted">Streak</small><strong>${currentStreak()} day${currentStreak() === 1 ? "" : "s"}</strong></div>
        <div><small class="muted">Batch</small><strong>${escapeHtml(batch?.name || "Not assigned")}</strong></div>
        <div><small class="muted">Courses</small><strong>${courses.length}</strong></div>
      </div>
    `;
    renderIdentity();
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
    const courseId = document.getElementById("questionCourse")?.value || state.selectedCourseId || null;
    const title = document.getElementById("questionTitle")?.value.trim();
    const details = document.getElementById("questionDetails")?.value.trim();
    const link = document.getElementById("questionLink")?.value.trim();
    if (!title || !details) return;

    const candidates = [
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
      await insertFirstWorking("projects", candidates);
      event.target.reset();
      showAlert("Question submitted to your LMS team.");
      await loadAllData({ silent: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to submit question. Check the projects table schema and RLS."), true);
    }
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
    if (input) {
      input.value = source?.message ? `Replying: ${truncate(source.message, 40)} - ` : "";
      input.focus();
    }
  }

  function openTaskModal(taskId) {
    const task = state.data.batchTasks.find((item) => sameId(item.id, taskId));
    if (!task) return;
    const existing = submissionForTask(taskId);
    const submissionLink = taskSubmissionLink(task);
    openModal("Submit Task", `
      <form class="stack-form" id="taskSubmitForm">
        <p class="muted">${escapeHtml(task.title || "Task")}</p>
        <div class="task-submit-link">
          <span>Submission Link</span>
          ${submissionLink
            ? `<a class="secondary-btn" href="${escapeAttr(submissionLink)}" target="_blank" rel="noopener">Open Drive Link</a>`
            : `<p class="muted">No Drive link has been added for this task yet.</p>`}
        </div>
        <button class="primary-btn" type="submit" ${submissionLink ? "" : "disabled"}>${existing ? "Update Submission" : "Submit Task"}</button>
      </form>
    `);
    document.getElementById("taskSubmitForm")?.addEventListener("submit", (event) => submitTask(event, task));
  }

  async function submitTask(event, task) {
    event.preventDefault();
    const link = taskSubmissionLink(task);
    if (!link) {
      showAlert("This task does not have a Drive submission link yet.", true);
      return;
    }
    const existing = submissionForTask(task.id);
    const now = new Date().toISOString();

    const candidates = [
      {
        task_id: task.id,
        student_id: state.student.id,
        user_id: state.student.id,
        batch_id: task.batch_id || currentBatch()?.id || null,
        course_id: task.course_id || selectedCourse()?.id || null,
        submission_url: link || null,
        drive_link: link || null,
        file_url: link || null,
        status: "submitted",
        submitted_at: now,
        created_at: existing?.created_at || now
      },
      {
        task_id: task.id,
        student_id: state.student.id,
        submission_url: link || null,
        status: "submitted",
        submitted_at: now
      },
      {
        task_id: task.id,
        user_id: state.student.id,
        file_url: link || null,
        status: "submitted",
        submitted_at: now
      }
    ];

    try {
      if (existing?.id) {
        await updateFirstWorking("task_submissions", existing.id, candidates);
      } else {
        await insertFirstWorking("task_submissions", candidates);
      }
      closeModal();
      await rewardCoins(10);
      showAlert("Task submission saved. You earned 10 coins.");
      await loadAllData({ silent: true });
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to save task submission. Check task submission RLS."), true);
    }
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

    try {
      await updateStudentProfile({
        last_active_date: next.today,
        streak_count: next.count
      });
      if (!options.silent) {
        showAlert(`Daily streak saved: ${next.count} day${next.count === 1 ? "" : "s"}.`);
      }
    } catch (error) {
      console.warn("Daily streak update failed", error);
      if (!options.silent) {
        showAlert("Streak could not be saved. Check Supabase user update permissions.", true);
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
      const { data, error } = await getClient().rpc("lms_change_legacy_password", {
        login_email: state.student.email,
        current_password: currentPassword,
        new_password: password
      });
      if (error) throw error;
      if (!data) throw new Error("Current password is incorrect.");
      event.target.reset();
      showAlert("Password updated.");
    } catch (error) {
      showAlert(userFriendlyError(error, "Unable to update password."), true);
    }
  }

  async function logout() {
    try {
      await getClient()?.auth?.signOut();
    } catch (error) {
      console.warn("Sign out failed", error);
    }
    clearStoredSessions();
    window.location.replace("login.html");
  }

  function clearStoredSessions() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(APP_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(MENTOR_SESSION_KEY);
  }

  function openMobileMenu() {
    document.querySelector(".student-sidebar")?.classList.add("mobile-open");
    document.getElementById("studentSidebarScrim")?.classList.add("show");
  }

  function closeMobileMenu() {
    document.querySelector(".student-sidebar")?.classList.remove("mobile-open");
    document.getElementById("studentSidebarScrim")?.classList.remove("show");
  }

  function setView(viewName) {
    if (!views[viewName]) return;
    state.activeView = viewName;
    Object.entries(views).forEach(([name, element]) => {
      element?.classList.toggle("active", name === viewName);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === viewName);
    });
    viewTitle.textContent = views[viewName].dataset.title || "Student LMS";
    viewKicker.textContent = views[viewName].dataset.kicker || "Jenovate";
    renderActiveView();
  }

  function ensureSelections() {
    const courses = enrolledCourses();
    if (!state.selectedCourseId || !courses.some((course) => sameId(course.id, state.selectedCourseId))) {
      state.selectedCourseId = preferredLearningCourse(courses)?.id || "";
    } else {
      const selected = courses.find((course) => sameId(course.id, state.selectedCourseId));
      const preferred = preferredLearningCourse(courses);
      if (selected && !parseModules(selected.modules).length && preferred && parseModules(preferred.modules).length) {
        state.selectedCourseId = preferred.id;
      }
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
    const mentorIds = studentMentorIds();
    const courses = state.data.courses.filter((course) => (
      ids.size === 0
      || ids.has(String(course.id))
      || (
        mentorIds.has(String(course.mentor_id || ""))
        && ["published", "active", "live"].includes(String(course.status || "").toLowerCase())
      )
    ));
    return courses.length ? courses : state.data.courses;
  }

  function preferredLearningCourse(courses) {
    return courses.find((course) => parseModules(course.modules).length)
      || courses.find((course) => ["published", "active", "live"].includes(String(course.status || "").toLowerCase()))
      || courses[0]
      || null;
  }

  function studentCourseIds() {
    const ids = new Set();
    parseIdList(state.student.course_ids).forEach((id) => ids.add(String(id)));
    state.data.userCourses
      .filter((item) => sameId(item.user_id || item.student_id || item.learner_id, state.student.id))
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
    return state.data.batches.filter((batch) => sameId(batch.id, state.student.batch_id) || courseIds.has(String(batch.course_id)));
  }

  function currentBatch() {
    return scopedBatches().find((batch) => sameId(batch.id, state.student.batch_id))
      || scopedBatches().find((batch) => sameId(batch.id, state.selectedBatchId))
      || scopedBatches()[0]
      || null;
  }

  function scopedTasks() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.batchTasks.filter((task) => !task.batch_id || batchIds.has(String(task.batch_id)));
  }

  function scopedChats() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.chats.filter((chat) => !chat.batch_id || batchIds.has(String(chat.batch_id)));
  }

  function scopedAnnouncements() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    const courseIds = studentCourseIds();
    return state.data.announcements
      .filter((item) => {
        const status = String(item.status || "published").toLowerCase();
        const audience = String(item.audience || "all").toLowerCase();
        const expired = item.expires_at && new Date(item.expires_at).getTime() < Date.now();
        if (status !== "published" || expired) return false;
        if (audience === "all" || audience === "students") return true;
        if (item.batch_id && batchIds.has(String(item.batch_id))) return true;
        if (item.course_id && courseIds.has(String(item.course_id))) return true;
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
    if (audience === "students") return "Students";
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
    const totalLessons = Math.max(1, lessons.length);
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
      : clamp(Math.round((completedLessons / totalLessons) * 100), 0, 100);

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
    const measured = mediaLessons
      .map((item) => lessonProgressFromState(row, item))
      .filter((item) => item.durationSeconds > 0);
    const totalDuration = measured.reduce((sum, item) => sum + item.durationSeconds, 0);
    if (totalDuration > 0) {
      const watched = measured.reduce((sum, item) => sum + Math.min(item.watchedSeconds, item.durationSeconds), 0);
      const percent = clamp(Math.round((watched / totalDuration) * 100), 0, 100);
      return { percent, completed: percent >= 95, watchedSeconds: watched, durationSeconds: totalDuration };
    }

    const completedLessons = lessons.filter((item) => (
      lessonProgressFromState(row, item).completed || legacyOrderCompleted(row?.completed_lessons, item.order)
    )).length;
    const percent = clamp(Math.round((completedLessons / Math.max(1, lessons.length)) * 100), 0, 100);
    return {
      percent,
      completed: percent >= 100 || completedValueArray(row?.completed_modules).map(String).includes(moduleProgressKey(course, module, moduleIndex)),
      watchedSeconds: 0,
      durationSeconds: 0
    };
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
      const sourceLessons = module.lessons.length ? module.lessons : [{ title: module.title || `Module ${moduleIndex + 1}`, duration: course?.duration || "" }];
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
      lesson?.video_url,
      lesson?.drive_link,
      lesson?.google_drive_link,
      lesson?.file_url,
      lesson?.url,
      lesson?.content_url,
      lesson?.material_url
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
    const parsed = typeof value === "string" ? tryJson(value) : value;
    const source = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.modules)
        ? parsed.modules
        : parsed && typeof parsed === "object"
          ? Object.values(parsed)
          : [];
    return source.map((module, index) => {
      if (typeof module === "string") {
        return { id: `module-${index + 1}`, title: module, description: "", order_index: index + 1, lessons: [{ title: module, order_index: 1 }] };
      }
      const lessons = Array.isArray(module.lessons) ? module.lessons : Array.isArray(module.items) ? module.items : [];
      const moduleId = module.id || module.module_id || `module-${index + 1}`;
      const moduleTitle = module.title || module.name || `Module ${index + 1}`;
      return {
        id: moduleId,
        title: moduleTitle,
        description: module.description || module.summary || "",
        type: module.type || module.module_type || "Self-paced",
        order_index: Number(module.order_index || module.order || index + 1),
        quiz: normalizeQuiz(module.quiz || module.module_quiz || module.quizQuestions || module.questions, { ...module, id: moduleId, title: moduleTitle }),
        lessons: lessons.map((lesson, lessonIndex) => typeof lesson === "string"
          ? { id: `lesson-${index + 1}-${lessonIndex + 1}`, title: lesson, order_index: lessonIndex + 1 }
          : {
              id: lesson.id || lesson.lesson_id || `lesson-${index + 1}-${lessonIndex + 1}`,
              title: lesson.title || lesson.name || `Lesson ${lessonIndex + 1}`,
              description: lesson.description || lesson.summary || "",
              duration: lesson.duration || lesson.time || "",
              transcript: lesson.transcript || "",
              order_index: Number(lesson.order_index || lesson.order || lessonIndex + 1),
              video_drive_link: lesson.video_drive_link || "",
              video_url: lesson.video_url || "",
              drive_link: lesson.drive_link || lesson.google_drive_link || lesson.url || "",
              google_drive_link: lesson.google_drive_link || "",
              file_url: lesson.file_url || "",
              url: lesson.url || "",
              content_url: lesson.content_url || "",
              material_url: lesson.material_url || ""
            }).sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0))
      };
    }).sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
  }

  function normalizeQuiz(rawQuiz, module = {}) {
    if (!rawQuiz) return null;
    const source = Array.isArray(rawQuiz) ? { questions: rawQuiz } : rawQuiz;
    if (!source || typeof source !== "object") return null;
    const rawQuestions = Array.isArray(source.questions)
      ? source.questions
      : Array.isArray(source.quizQuestions)
        ? source.quizQuestions
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
      text: question.text || question.question || question.prompt || question.title || question.q || "",
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
    return modules.slice(0, moduleIndex).reduce((sum, module) => sum + Math.max(1, module.lessons.length), 0);
  }

  function nextDailyStreakState(profile) {
    const today = todayKey();
    const lastActive = dateKeyFromValue(profile?.last_active_date);
    const current = Math.max(0, Math.floor(Number(profile?.streak_count || 0)));

    if (lastActive === today) {
      return {
        count: Math.max(1, current),
        today,
        shouldSave: current < 1
      };
    }

    const gap = lastActive ? daysBetween(lastActive, today) : Number.POSITIVE_INFINITY;
    return {
      count: gap === 1 ? current + 1 : 1,
      today,
      shouldSave: true
    };
  }

  function currentStreak() {
    const lastActive = dateKeyFromValue(state.student?.last_active_date);
    const streak = Math.max(0, Math.floor(Number(state.student?.streak_count || 0)));
    if (!lastActive) return streak;
    return daysBetween(lastActive, todayKey()) > 1 ? 0 : streak;
  }

  function isActiveToday() {
    return dateKeyFromValue(state.student?.last_active_date) === todayKey();
  }

  function weeklyActivityScore() {
    return weeklyActiveDateKeys().size;
  }

  function weeklyActiveDateKeys() {
    const active = activityDateKeysFromData();
    const weekKeys = new Set(weekDays().map((day) => day.key));
    const orderedWeekKeys = weekDays().map((day) => day.key);
    const lastActive = dateKeyFromValue(state.student?.last_active_date);
    const streak = currentStreak();

    if (lastActive && streak > 0) {
      for (let index = 0; index < streak; index += 1) {
        const key = shiftDateKey(lastActive, -index);
        if (weekKeys.has(key)) {
          active.add(key);
        } else if (daysBetween(key, orderedWeekKeys[0]) > 0) {
          const carryKey = [...orderedWeekKeys].reverse().find((dayKey) => !active.has(dayKey));
          if (carryKey) active.add(carryKey);
        }
      }
    }

    return new Set([...active].filter((key) => weekKeys.has(key)));
  }

  function activityDateKeysFromData() {
    const keys = new Set();
    const addDate = (value) => {
      const key = dateKeyFromValue(value);
      if (key) keys.add(key);
    };

    state.data.progress
      .filter((item) => sameId(item.student_id, state.student.id) || sameId(item.user_id, state.student.id))
      .forEach((item) => addDate(item.updated_at || item.created_at));
    state.data.taskSubmissions
      .filter((item) => sameId(item.student_id, state.student.id) || sameId(item.user_id, state.student.id))
      .forEach((item) => addDate(item.submitted_at || item.updated_at || item.created_at));
    state.data.projects
      .filter((item) => sameId(item.student_id, state.student.id) || sameId(item.user_id, state.student.id))
      .forEach((item) => addDate(item.submitted_at || item.updated_at || item.created_at));

    const lastActive = dateKeyFromValue(state.student?.last_active_date);
    if (lastActive) keys.add(lastActive);
    return keys;
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
      return "Could not reach Supabase. Check your internet connection and try again.";
    }
    if (/permission denied|row-level security|rls/i.test(message)) {
      return "Supabase blocked this action. Check the table insert/update policy for this student role.";
    }
    if (/schema cache|could not find|column/i.test(message)) {
      return "Supabase schema cache does not match this table yet. Refresh the page; if it continues, reload the schema in Supabase.";
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
      streak_count: Number(user.streak_count || 0)
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
    if (syncStatus) syncStatus.textContent = message;
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
    modal?.classList.add("open");
    modal?.setAttribute("aria-hidden", "false");
    modal?.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
  }

  function closeModal() {
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
  }

  function toggleTheme() {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    localStorage.setItem("jenovateStudentTheme", dark ? "dark" : "light");
    setText("themeToggle", dark ? "Light Mode" : "Dark Mode");
  }

  if (localStorage.getItem("jenovateStudentTheme") === "dark") {
    document.body.classList.add("dark");
    setText("themeToggle", "Light Mode");
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
