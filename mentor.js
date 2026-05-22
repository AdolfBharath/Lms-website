(function () {
  const SESSION_KEY = "jenovateMentorSession";
  const APP_SESSION_KEY = "jenovateCurrentUser";
  const ADMIN_SESSION_KEY = "jenovateAdminSession";
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
    { key: "projects", table: "projects", select: "*", limit: 500 },
    { key: "batchTasks", table: "batch_tasks", select: "*", limit: 500 },
    { key: "taskSubmissions", table: "task_submissions", select: "*", limit: 500 },
    { key: "quizAttempts", table: "student_quiz_attempts", select: "*", optional: true, limit: 1000 },
    { key: "extraMarks", table: "student_extra_marks", select: "*", optional: true, limit: 1000 },
    { key: "chats", table: "batch_chats", select: "*", limit: 200 },
    { key: "announcements", table: "announcements", select: "*", limit: 100 }
  ];

  const state = {
    mentor: null,
    activeView: "dashboard",
    selectedBatchId: null,
    globalQuery: "",
    realtimeChannel: null,
    refreshTimer: null,
    tableErrors: {},
    data: {
      users: [],
      courses: [],
      batches: [],
      userCourses: [],
      progress: [],
      projects: [],
      batchTasks: [],
      taskSubmissions: [],
      quizAttempts: [],
      extraMarks: [],
      chats: [],
      announcements: []
    }
  };

  const views = {
    dashboard: document.getElementById("dashboardView"),
    courses: document.getElementById("coursesView"),
    batches: document.getElementById("batchesView"),
    students: document.getElementById("studentsView"),
    enrollments: document.getElementById("enrollmentsView"),
    tasks: document.getElementById("tasksView"),
    reviews: document.getElementById("reviewsView"),
    announcements: document.getElementById("announcementsView"),
    chat: document.getElementById("chatView"),
    profile: document.getElementById("profileView")
  };

  const viewTitle = document.getElementById("viewTitle");
  const loadingPanel = document.getElementById("loadingPanel");
  const alertBox = document.getElementById("mentorAlert");
  const syncStatus = document.getElementById("syncStatus");
  const syncStatusMeta = document.getElementById("syncStatusMeta");
  const modal = document.getElementById("mentorModal");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    wireNavigation();
    wireActions();

    if (!getClient()) {
      showAlert("Supabase library did not load. Check your internet connection and refresh.", true);
      return;
    }

    const mentor = await resolveMentorSession();
    if (!mentor) {
      if (redirectToActiveSession("mentor")) return;
      clearStoredSessions();
      window.location.replace("login.html?next=mentor");
      return;
    }

    state.mentor = mentor;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(mentor));
    sessionStorage.setItem(APP_SESSION_KEY, JSON.stringify(mentor));
    window.addEventListener("pageshow", enforceLiveSession);
    // NOTE: pagehide/beforeunload session clear removed — caused session loss
    // on in-tab navigation. Session is cleared only on explicit logout.
    
    renderMentorIdentity();
    await loadAllData();
    setupRealtime();
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

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
  }

  function wireActions() {
    on("refreshBtn", "click", () => loadAllData());
    on("refreshReviewsBtn", "click", () => loadAllData());
    on("reloadChatBtn", "click", loadChats);
    on("reloadAnnouncementsBtn", "click", () => loadAllData());
    on("homeBtn", "click", () => {
      closeModal();
      setView("dashboard");
      document.querySelector(".mentor-main")?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    on("logoutBtn", "click", logout);
    on("addCourseBtn", "click", () => openCourseEditor());
    on("addEnrollmentBtn", "click", () => openEnrollmentModal());
    on("addTaskBtn", "click", () => openTaskModal());
    on("addAnnouncementBtn", "click", () => openAnnouncementModal());
    on("globalSearch", "input", (event) => {
      state.globalQuery = event.target.value.trim().toLowerCase();
      renderActiveView();
    });
    on("studentSearch", "input", renderStudents);
    on("enrollmentSearch", "input", renderEnrollments);
    on("taskBatchFilter", "change", (event) => {
      state.selectedBatchId = event.target.value;
      renderTasks();
    });
    on("chatComposer", "submit", postChatMessage);
    on("profileForm", "submit", saveProfile);
    on("passwordForm", "submit", updatePassword);
  }

  async function resolveMentorSession() {
    return readStoredRoleSession("mentor");
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
    if (!readStoredRoleSession("mentor")) {
      if (redirectToActiveSession("mentor")) return;
      window.location.replace("login.html?next=mentor");
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
    const silent = options?.silent === true;
    setSyncStatus("Connecting to Supabase...");
    setLoading(!silent);
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
      state.data.projects = rows.projects;
      state.data.batchTasks = rows.batchTasks;
      state.data.taskSubmissions = rows.taskSubmissions;
      state.data.quizAttempts = rows.quizAttempts || [];
      state.data.extraMarks = rows.extraMarks || [];
      state.data.chats = rows.chats;
      state.data.announcements = rows.announcements;

      const batches = scopedBatches();
      if (state.selectedBatchId && !batches.some((batch) => sameId(batch.id, state.selectedBatchId))) {
        state.selectedBatchId = "";
      }

      renderAll();
      const stamp = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      if (failed.length) {
        setSyncStatus(`Synced with ${failed.length} warning${failed.length === 1 ? "" : "s"} at ${stamp}`);
        if (!silent) showAlert(`Some Supabase tables need attention: ${failed.map((item) => item.table).join(", ")}`, true);
      } else {
        setSyncStatus(`Live Supabase data synced ${stamp}`);
        if (!silent) showAlert("Mentor data synced from Supabase.");
      }
    } catch (error) {
      showAlert(error.message || "Unable to load mentor data.", true);
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

  async function loadChats() {
    try {
      state.data.chats = await fetchTable("batch_chats", "*");
      renderChatBatches();
      renderChat();
      showAlert("Batch chat refreshed.");
    } catch (error) {
      showAlert(error.message || "Unable to refresh chat.", true);
    }
  }

  function setupRealtime() {
    const supabaseClient = getClient();
    if (!supabaseClient?.channel || state.realtimeChannel) return;

    const liveTables = [
      "courses",
      "batches",
      "user_courses",
      "student_course_progress",
      "projects",
      "batch_tasks",
      "task_submissions",
      "student_quiz_attempts",
      "student_extra_marks",
      "batch_chats",
      "announcements"
    ];

    const channel = supabaseClient.channel("mentor-lms-realtime");
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
    renderMentorIdentity();
    renderDashboard();
    renderCourses();
    renderBatches();
    renderStudents();
    renderEnrollments();
    renderTasks();
    renderReviews();
    renderAnnouncements();
    renderChatBatches();
    renderChat();
    renderProfile();
  }

  function renderMentorIdentity() {
    const name = state.mentor?.name || state.mentor?.username || "Mentor";
    const email = state.mentor?.email || "";
    text("sidebarMentorName", name);
    text("sidebarMentorEmail", email);
    text("sidebarMentorAvatar", initials(name));
    text("mentorAvatar", initials(name));
    text("welcomeTitle", `Welcome back, ${name}`);
    text("welcomeMeta", `${email} is connected to the mentor workspace.`);
  }

  function renderDashboard() {
    const query = state.globalQuery;
    const courses = scopedCourses().filter((course) => matchesCourse(course, query));
    const batches = scopedBatches().filter((batch) => matchesBatch(batch, query));
    const students = scopedStudents().filter((student) => matchesStudent(student, query));
    const tasks = scopedTasks().filter((task) => matchesTask(task, query));
    const submissions = scopedSubmissions().filter((submission) => matchesSubmission(submission, query));
    const projects = scopedProjects().filter((project) => matchesProject(project, query));
    const chats = scopedChats().filter((chat) => matchesChat(chat, query));
    const announcements = scopedAnnouncements().filter((item) => matchesAnnouncement(item, query));
    const pendingReviews = [...submissions, ...projects].filter(isPendingReview).length;
    const moduleCount = courses.reduce((sum, course) => sum + courseModules(course).length, 0);
    const avgProgress = averageProgress(students);
    const scoreRows = dashboardScoreRows(courses, students);
    const totalQuizMarks = scoreRows.reduce((sum, row) => sum + row.quizScore, 0);
    const totalExtraMarks = scoreRows.reduce((sum, row) => sum + row.extraMarks, 0);
    const totalMarks = scoreRows.reduce((sum, row) => sum + row.total, 0);

    text("metricCourses", courses.length);
    text("metricStudents", students.length);
    text("metricReviews", pendingReviews);
    text("metricTasks", tasks.length);
    text("metricBatches", batches.length);
    text("metricMessages", chats.length);
    text("metricProgress", `${avgProgress}%`);
    text("metricModules", moduleCount);
    text("metricQuizMarks", totalQuizMarks);
    text("metricExtraMarks", totalExtraMarks);
    text("metricTotalMarks", totalMarks);

    html("dashboardCourses", courses.length ? courses.slice(0, 4).map(courseRow).join("") : emptyState(hasQuery(query) ? "No assigned courses match this search." : "No assigned courses yet."));
    html("dashboardBatches", batches.length ? batches.slice(0, 4).map(batchRow).join("") : emptyState(hasQuery(query) ? "No assigned batches match this search." : "No assigned batches yet."));
    html("dashboardAnnouncements", announcements.length ? announcements.slice(0, 4).map(announcementRow).join("") : emptyState(hasQuery(query) ? "No announcements match this search." : "No announcements yet."));
    html("dashboardProgress", students.length ? students.slice(0, 8).map(studentProgressRow).join("") : emptyState(hasQuery(query) ? "No students match this search." : "No students are assigned yet."));
    html("dashboardScores", scoreRows.length ? scoreRows.slice(0, 6).map(scoreProgressRow).join("") : emptyState(hasQuery(query) ? "No marks match this search." : "Quiz and performance marks will appear here."));
    bindDynamicActions();
  }

  function renderCourses() {
    const query = state.globalQuery;
    const courses = scopedCourses().filter((course) => matchesCourse(course, query));

    html("courseGrid", courses.length ? courses.map((course) => {
      const modules = courseModules(course);
      const quizzes = courseQuizzes(course);
      const enrolled = studentsForCourse(course.id).length;
      const status = String(course.status || "Draft");
      return `
        <article class="course-card">
          <img class="course-thumb" src="${escapeAttr(course.thumbnail_url || "image/icon/logo_new-removebg-preview.png")}" alt="">
          <h3>${escapeHtml(course.title || "Untitled Course")}</h3>
          <p>${escapeHtml(course.description || "No course description.")}</p>
          <div class="card-meta">
            <span class="badge ${statusColor(status)}">${escapeHtml(status)}</span>
            <span class="badge gray">${escapeHtml(course.duration || "No duration")}</span>
            <span class="badge gray">${Number(course.rating || 0).toFixed(1)} rating</span>
          </div>
          <div class="stat-row">
            <div><span>Students</span><strong>${enrolled}</strong></div>
            <div><span>Modules</span><strong>${modules.length}</strong></div>
            <div><span>Quizzes</span><strong>${quizzes.length}</strong></div>
          </div>
          <div class="card-actions">
            <button class="ghost-btn" type="button" data-view-course="${course.id}">View</button>
            <button class="ghost-btn" type="button" data-edit-quiz="${course.id}">Quiz</button>
            <button class="ghost-btn" type="button" data-open-leaderboard="${course.id}">Leaderboard</button>
            <button class="primary-btn" type="button" data-edit-course="${course.id}">Edit Content</button>
          </div>
        </article>
      `;
    }).join("") : emptyState(hasQuery(query) ? "No courses match this search." : "No assigned courses yet."));
    bindDynamicActions();
  }

  function renderBatches() {
    const query = state.globalQuery;
    const batches = scopedBatches().filter((batch) => matchesBatch(batch, query));

    html("batchGrid", batches.length ? batches.map((batch) => {
      const course = courseForBatch(batch);
      const students = studentsForBatch(batch.id);
      const tasks = tasksForBatch(batch.id);
      const messages = chatsForBatch(batch.id);
      return `
        <article class="batch-card">
          <h3>${escapeHtml(batch.name || "Untitled Batch")}</h3>
          <p>${escapeHtml(course?.title || "No course assigned")}</p>
          <div class="card-meta">
            <span class="badge ${statusColor(batch.status)}">${escapeHtml(batch.status || "draft")}</span>
            <span class="badge gray">${escapeHtml(batchPeriod(batch))}</span>
          </div>
          <div class="stat-row">
            <div><span>Students</span><strong>${students.length}/${batch.capacity || "-"}</strong></div>
            <div><span>Tasks</span><strong>${tasks.length}</strong></div>
            <div><span>Messages</span><strong>${messages.length}</strong></div>
            <div><span>Progress</span><strong>${batch.progress || 0}%</strong></div>
          </div>
          <div class="card-actions">
            <button class="ghost-btn" type="button" data-open-batch="${batch.id}">Details</button>
            <button class="primary-btn" type="button" data-batch-tasks="${batch.id}">Tasks</button>
            <button class="ghost-btn" type="button" data-batch-chat="${batch.id}">Chat</button>
          </div>
        </article>
      `;
    }).join("") : emptyState(hasQuery(query) ? "No assigned batches match this search." : "No assigned batches yet."));
    bindDynamicActions();
  }

  function renderStudents() {
    const query = searchQuery("studentSearch");
    const rows = scopedStudents().filter((student) => matchesStudent(student, query));

    html("studentsTable", rows.length ? rows.map((student) => {
      const batch = findById(state.data.batches, student.batch_id);
      const courses = enrolledCoursesForStudent(student.id);
      const progress = progressForStudent(student.id);
      return `
        <tr>
          <td><strong>${escapeHtml(student.name || "Student")}</strong><small>${escapeHtml(student.email || "")}</small></td>
          <td>${escapeHtml(batch?.name || "Unassigned")}</td>
          <td>${escapeHtml(courses.map((course) => course.title).join(", ") || "No course")}</td>
          <td>
            <div class="progress-track" aria-label="${progress}% progress"><span style="--progress:${progress}%"></span></div>
            <small>${progress}% complete</small>
          </td>
          <td>${Number(student.coins || 0)}</td>
          <td>${formatDate(student.last_active_date || student.created_at)}</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="6">${emptyState(hasQuery(query) ? "No students match this search." : "No students are assigned yet.")}</td></tr>`);
  }

  function renderEnrollments() {
    const query = searchQuery("enrollmentSearch");
    const rows = scopedEnrollments().filter((enrollment) => {
      const user = enrollmentUser(enrollment);
      // Skip any enrollment where the user is not a student (e.g. mentor enrolled as learner)
      if (!user || user.role !== "student") return false;
      const course = enrollmentCourse(enrollment);
      const batch = enrollmentBatch(enrollment, user);
      return matchesText(query, user?.name, user?.email, course?.title, batch?.name, enrollment.status);
    });

    html("enrollmentsTable", rows.length ? rows.map((enrollment) => {
      const user = enrollmentUser(enrollment);
      const course = enrollmentCourse(enrollment);
      const batch = enrollmentBatch(enrollment, user);
      const progress = enrollmentProgress(enrollment);
      const marks = marksForStudentCourse(user?.id, course?.id);
      return `
        <tr>
          <td><strong>${escapeHtml(user?.name || "Unknown learner")}</strong><small>${escapeHtml(user?.email || "")}</small></td>
          <td>${escapeHtml(course?.title || "Unassigned course")}</td>
          <td>${escapeHtml(batch?.name || "No batch")}</td>
          <td>
            <div class="progress-track" aria-label="${progress}% progress"><span style="--progress:${progress}%"></span></div>
            <small>${progress}% complete</small>
          </td>
          <td><strong>${marks.total}</strong><small>Quiz ${marks.quizScore} + Extra ${marks.extraMarks}</small></td>
          <td><span class="badge ${statusColor(enrollment.status || "active")}">${escapeHtml(enrollment.status || "active")}</span></td>
          <td>
            <button class="ghost-btn" type="button" data-edit-enrollment="${escapeAttr(enrollment._key || enrollment.id)}">Edit</button>
          </td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="7">${emptyState(hasQuery(query) ? "No enrollments match this search." : "No students are enrolled in your courses yet.")}</td></tr>`);

    bindDynamicActions();
  }

  function renderTasks() {
    renderBatchFilterOptions();
    const query = state.globalQuery;
    const batchId = state.selectedBatchId;
    const tasks = scopedTasks()
      .filter((task) => !batchId || sameId(task.batch_id, batchId))
      .filter((task) => matchesTask(task, query));

    html("tasksGrid", tasks.length ? tasks.map((task) => {
      const batch = findById(state.data.batches, task.batch_id);
      const submissions = submissionsForTask(task.id);
      return `
        <article class="task-card">
          <div class="card-meta">
            <span class="badge ${isPast(task.deadline) ? "red" : "green"}">${isPast(task.deadline) ? "Due" : "Open"}</span>
            <span class="badge gray">${escapeHtml(batch?.name || "Batch")}</span>
          </div>
          <h3>${escapeHtml(task.title || "Untitled Task")}</h3>
          <p>${escapeHtml(task.description || "No task description.")}</p>
          <div class="task-meta">
            <span>Deadline: ${formatDate(task.deadline)}</span>
            <span>${submissions.length} submissions</span>
          </div>
          <div class="card-actions">
            ${task.drive_link ? `<a class="primary-btn" href="${escapeAttr(task.drive_link)}" target="_blank" rel="noopener">Open Link</a>` : ""}
            <button class="primary-btn" type="button" data-open-task="${task.id}">Submissions</button>
            <button class="primary-btn" type="button" data-edit-task="${task.id}">Edit</button>
            <button class="primary-btn" type="button" data-delete-task="${task.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("") : emptyState(hasQuery(query) ? "No project tasks match this search." : "No project tasks found for this batch."));
    bindDynamicActions();
  }

  function renderReviews() {
    const query = state.globalQuery;
    const submissions = scopedSubmissions()
      .filter(isPendingReview)
      .filter((submission) => matchesSubmission(submission, query));
    const projects = scopedProjects()
      .filter(isPendingReview)
      .filter((project) => matchesProject(project, query));

    html("submissionsList", submissions.length ? submissions.map((submission) => {
      const task = findById(state.data.batchTasks, submission.task_id);
      const student = findById(state.data.users, submission.student_id || submission.user_id);
      return `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(task?.title || submission.title || "Task Submission")}</strong>
            <small>${escapeHtml(student?.name || submission.student_name || "Student")} · ${formatDate(submission.created_at || submission.submitted_at)}</small>
          </div>
          <div class="row-actions">
            <span class="badge ${statusColor(submission.status)}">${escapeHtml(submission.status || "pending")}</span>
            <button class="primary-btn" type="button" data-review-submission="${submission.id}">Review</button>
          </div>
        </div>
      `;
    }).join("") : emptyState(hasQuery(query) ? "No task submissions match this search." : "No pending task submissions."));

    html("projectsList", projects.length ? projects.map((project) => {
      const student = findById(state.data.users, project.student_id || project.user_id);
      return `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(project.title || "Project")}</strong>
            <small>${escapeHtml(student?.name || project.student_name || "Student")} · ${formatDate(project.submission_date || project.created_at)}</small>
          </div>
          <div class="row-actions">
            <span class="badge ${statusColor(project.status)}">${escapeHtml(project.status || "pending")}</span>
            <button class="primary-btn" type="button" data-review-project="${project.id}">Review</button>
          </div>
        </div>
      `;
    }).join("") : emptyState(hasQuery(query) ? "No projects match this search." : "No pending projects."));
    bindDynamicActions();
  }

  function renderAnnouncements() {
    const query = state.globalQuery;
    const rows = scopedAnnouncements()
      .filter((item) => matchesAnnouncement(item, query))
      .sort((a, b) => new Date(b.published_at || b.created_at || 0) - new Date(a.published_at || a.created_at || 0));

    html("announcementsGrid", rows.length ? rows.map(announcementCard).join("") : emptyState(hasQuery(query) ? "No announcements match this search." : "No announcements yet."));
    bindDynamicActions();
  }

  function renderChatBatches() {
    const query = state.globalQuery;
    const batches = scopedBatches().filter((batch) => matchesBatch(batch, query));
    html("chatBatchList", batches.length ? batches.map((batch) => {
      const messages = chatsForBatch(batch.id).length;
      return `
        <button class="batch-chat-btn ${sameId(batch.id, state.selectedBatchId) ? "active" : ""}" type="button" data-chat-batch="${batch.id}">
          <strong>${escapeHtml(batch.name || "Batch")}</strong>
          <small>${messages} messages</small>
        </button>
      `;
    }).join("") : emptyState(hasQuery(query) ? "No chat rooms match this search." : "No chat rooms available."));
    bindDynamicActions();
  }

  function renderChat() {
    const batch = findById(state.data.batches, state.selectedBatchId);
    const query = state.globalQuery;
    const messages = batch
      ? chatsForBatch(batch.id).filter((chat) => matchesChat(chat, query))
      : [];
    text("chatBatchTitle", batch?.name || "Choose a batch");
    text("chatBatchSubtitle", batch ? `${messages.length} messages in this batch` : "Messages from assigned batches");

    html("chatFeed", batch
      ? (messages.length ? messages.map(messageRow).join("") : emptyState(hasQuery(query) ? "No messages match this search." : "No messages yet."))
      : emptyState("Choose a batch to load chat."));
    bindDynamicActions();
  }

  function renderProfile() {
    const mentor = state.mentor || {};
    const expertise = Array.isArray(mentor.expertise)
      ? mentor.expertise.join(", ")
      : typeof mentor.expertise === "string"
        ? mentor.expertise
        : "";
    text("profileAvatar", initials(mentor.name || mentor.email || "M"));
    text("profileName", mentor.name || "Mentor");
    text("profileEmail", mentor.email || "");
    value("profileFullName", mentor.name || "");
    value("profilePhone", mentor.phone || "");
    value("profileExpertise", expertise);
  }

  function bindDynamicActions() {
    document.querySelectorAll("[data-edit-course]").forEach((button) => {
      button.addEventListener("click", () => openCourseEditor(findById(state.data.courses, button.dataset.editCourse)));
    });
    document.querySelectorAll("[data-view-course]").forEach((button) => {
      button.addEventListener("click", () => openCourseDetail(findById(state.data.courses, button.dataset.viewCourse)));
    });
    document.querySelectorAll("[data-edit-quiz]").forEach((button) => {
      button.addEventListener("click", () => openQuizEditor(findById(state.data.courses, button.dataset.editQuiz)));
    });
    document.querySelectorAll("[data-open-leaderboard]").forEach((button) => {
      button.addEventListener("click", () => openLeaderboardModal(findById(state.data.courses, button.dataset.openLeaderboard)));
    });
    document.querySelectorAll("[data-open-batch]").forEach((button) => {
      button.addEventListener("click", () => openBatchDetail(findById(state.data.batches, button.dataset.openBatch)));
    });
    document.querySelectorAll("[data-batch-tasks]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedBatchId = button.dataset.batchTasks;
        setView("tasks");
      });
    });
    document.querySelectorAll("[data-batch-chat], [data-chat-batch]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedBatchId = button.dataset.batchChat || button.dataset.chatBatch;
        setView("chat");
      });
    });
    document.querySelectorAll("[data-edit-task]").forEach((button) => {
      button.addEventListener("click", () => openTaskModal(findById(state.data.batchTasks, button.dataset.editTask)));
    });
    document.querySelectorAll("[data-delete-task]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("batch_tasks", button.dataset.deleteTask));
    });
    document.querySelectorAll("[data-open-task]").forEach((button) => {
      button.addEventListener("click", () => openTaskDetail(findById(state.data.batchTasks, button.dataset.openTask)));
    });
    document.querySelectorAll("[data-review-submission]").forEach((button) => {
      button.addEventListener("click", () => openReviewModal("task_submissions", findById(state.data.taskSubmissions, button.dataset.reviewSubmission), "feedback"));
    });
    document.querySelectorAll("[data-review-project]").forEach((button) => {
      button.addEventListener("click", () => openReviewModal("projects", findById(state.data.projects, button.dataset.reviewProject), "review_notes"));
    });
    document.querySelectorAll("[data-edit-announcement]").forEach((button) => {
      button.addEventListener("click", () => openAnnouncementModal(findById(state.data.announcements, button.dataset.editAnnouncement)));
    });
    document.querySelectorAll("[data-delete-announcement]").forEach((button) => {
      button.addEventListener("click", () => deleteRecord("announcements", button.dataset.deleteAnnouncement));
    });
    document.querySelectorAll("[data-edit-enrollment]").forEach((button) => {
      button.addEventListener("click", () => openEnrollmentModal(findEnrollmentByKey(button.dataset.editEnrollment)));
    });
    document.querySelectorAll("[data-reply-chat]").forEach((button) => {
      button.addEventListener("click", () => openReplyModal(findById(state.data.chats, button.dataset.replyChat)));
    });
  }

  function openCourseDetail(course) {
    if (!course) return;
    const modules = courseModules(course);
    openModal("Course Details", `
      <div class="detail-list">
        <div><span>Title</span><strong>${escapeHtml(course.title || "Course")}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(course.status || "Draft")}</strong></div>
        <div><span>Duration</span><strong>${escapeHtml(course.duration || "-")}</strong></div>
        <div><span>Students</span><strong>${studentsForCourse(course.id).length}</strong></div>
      </div>
      <p>${escapeHtml(course.description || "No description.")}</p>
      <div class="course-modules">
        ${modules.length ? modules.map((module) => `
          <div class="module-row">
            <div>
              <strong>${escapeHtml(module.title || "Module")}</strong>
              <small>${escapeHtml(module.type || module.module_type || "Self-paced")} · ${(module.lessons || []).length} lessons</small>
            </div>
          </div>
          ${(module.lessons || []).map((lesson) => `
            <div class="lesson-row">
              <div>
                <strong>${escapeHtml(lesson.title || "Lesson")}</strong>
                <small>${escapeHtml(lesson.duration || "")}</small>
              </div>
              ${lessonMediaUrl(lesson) ? `<a class="ghost-btn" href="${escapeAttr(lessonMediaUrl(lesson))}" target="_blank" rel="noopener">Open</a>` : ""}
            </div>
          `).join("")}
        `).join("") : emptyState("No modules have been added yet.")}
      </div>
    `);
  }

  function openCourseEditor(course = null) {
    const isEdit = Boolean(course);
    course = course || {
      title: "",
      description: "",
      duration: "",
      category: "",
      module_type: "Self-paced",
      status: "Draft",
      thumbnail_url: "",
      modules: []
    };
    let draftModules = courseModules(course);
    openModal(isEdit ? "Edit Course Content" : "Create Course", `
      <form class="form-grid" id="courseEditorForm">
        <div class="course-editor-grid">
          <section class="form-grid">
            <div class="form-row">
              <label for="courseTitle">Course Name</label>
              <input id="courseTitle" required value="${escapeAttr(course.title || "")}">
            </div>
            <div class="form-row two">
              <div>
                <label for="courseDuration">Course Duration</label>
                <input id="courseDuration" value="${escapeAttr(course.duration || "")}">
              </div>
              <div>
                <label for="courseCategory">Category</label>
                <input id="courseCategory" value="${escapeAttr(course.category || "")}">
              </div>
            </div>
            <div class="form-row two">
              <div>
                <label for="courseModuleType">Module Type</label>
                <select id="courseModuleType">
                  ${option("Self-paced", course.module_type)}
                  ${option("Live", course.module_type)}
                  ${option("Hybrid", course.module_type)}
                </select>
              </div>
              <div>
                <label for="courseStatus">Status</label>
                <select id="courseStatus">
                  ${option("Published", course.status)}
                  ${option("Draft", course.status)}
                  ${option("Review", course.status)}
                  ${option("Archived", course.status)}
                </select>
              </div>
            </div>
            <div class="form-row">
              <label for="courseThumbnail">Course Image URL</label>
              <input id="courseThumbnail" value="${escapeAttr(course.thumbnail_url || "")}">
            </div>
            <div class="form-row">
              <label for="courseDescription">Course Description</label>
              <textarea id="courseDescription">${escapeHtml(course.description || "")}</textarea>
            </div>
          </section>
          <section>
            <div class="editor-toolbar">
              <h3>Modules</h3>
              <button class="ghost-btn" type="button" id="addModuleBtn">Add Module</button>
            </div>
            <div class="module-editor-list" id="courseModuleList"></div>
          </section>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save Course" : "Create Course"}</button>
        </div>
      </form>
    `);

    const renderEditor = () => {
      html("courseModuleList", draftModules.length ? draftModules.map(moduleEditorHtml).join("") : emptyState("No modules yet."));
      bindCourseEditorEvents();
    };

    const bindCourseEditorEvents = () => {
      document.getElementById("addModuleBtn").onclick = () => {
        draftModules = syncModulesFromForm(draftModules);
        draftModules.push(blankModule(draftModules.length + 1));
        renderEditor();
      };
      document.querySelectorAll("[data-remove-module]").forEach((button) => {
        button.addEventListener("click", () => {
          draftModules = syncModulesFromForm(draftModules).filter((module) => module.id !== button.dataset.removeModule);
          renderEditor();
        });
      });
      document.querySelectorAll("[data-add-lesson]").forEach((button) => {
        button.addEventListener("click", () => {
          draftModules = syncModulesFromForm(draftModules).map((module) => {
            if (module.id !== button.dataset.addLesson) return module;
            return { ...module, lessons: [...(module.lessons || []), blankLesson((module.lessons || []).length + 1)] };
          });
          renderEditor();
        });
      });
      document.querySelectorAll("[data-remove-lesson]").forEach((button) => {
        button.addEventListener("click", () => {
          draftModules = syncModulesFromForm(draftModules).map((module) => ({
            ...module,
            lessons: (module.lessons || []).filter((lesson) => lesson.id !== button.dataset.removeLesson)
          }));
          renderEditor();
        });
      });
    };

    renderEditor();

    document.getElementById("courseEditorForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      draftModules = syncModulesFromForm(draftModules);
      await saveCourseRecord({
        title: valueOf("courseTitle"),
        duration: valueOf("courseDuration") || null,
        category: valueOf("courseCategory") || null,
        module_type: valueOf("courseModuleType") || null,
        status: valueOf("courseStatus") || "Draft",
        thumbnail_url: valueOf("courseThumbnail") || null,
        description: valueOf("courseDescription") || "",
        instructor_name: state.mentor.name || course.instructor_name || null,
        mentor_id: state.mentor.id,
        created_by_admin: false,
        is_my_course: true,
        modules: draftModules
      }, isEdit ? course.id : null);
    });
  }

  function openQuizEditor(course) {
    if (!course) return;
    let draftModules = courseModules(course);
    if (!draftModules.length) draftModules = [blankModule(1)];

    openModal("Course Quizzes", `
      <form class="form-grid" id="quizEditorForm">
        <div class="quiz-editor-head">
          <div>
            <strong>${escapeHtml(course.title || "Course")}</strong>
            <small>Add questions, correct answers, and marks for each module quiz.</small>
          </div>
        </div>
        <div class="quiz-module-list" id="quizModuleList"></div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Quizzes</button>
        </div>
      </form>
    `);

    const renderQuizEditor = () => {
      html("quizModuleList", draftModules.map(quizModuleEditorHtml).join(""));
      bindQuizEditorEvents();
    };

    const bindQuizEditorEvents = () => {
      document.querySelectorAll("[data-add-quiz-question]").forEach((button) => {
        button.addEventListener("click", () => {
          draftModules = syncQuizModulesFromForm(draftModules, { preserveEmptyQuestions: true }).map((module) => {
            if (!sameId(module.id, button.dataset.addQuizQuestion)) return module;
            const quiz = quizForEditor(module);
            return {
              ...module,
              quiz: {
                ...quiz,
                questions: [...quiz.questions, blankQuizQuestion(quiz.questions.length + 1)]
              }
            };
          });
          renderQuizEditor();
        });
      });

      document.querySelectorAll("[data-remove-quiz-question]").forEach((button) => {
        button.addEventListener("click", () => {
          draftModules = syncQuizModulesFromForm(draftModules, { preserveEmptyQuestions: true }).map((module) => {
            const quiz = quizForEditor(module);
            if (!quiz) return module;
            return {
              ...module,
              quiz: {
                ...quiz,
                questions: quiz.questions.filter((question) => !sameId(question.id, button.dataset.removeQuizQuestion))
              }
            };
          });
          renderQuizEditor();
        });
      });
    };

    renderQuizEditor();

    document.getElementById("quizEditorForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      draftModules = syncQuizModulesFromForm(draftModules);
      await saveCourseRecord(courseSavePayload(course, draftModules), course.id);
    });
  }

  function quizModuleEditorHtml(module, index) {
    const quiz = quizForEditor(module);
    return `
      <section class="quiz-module-editor" data-quiz-module-row data-module-id="${escapeAttr(module.id)}">
        <div class="editor-toolbar">
          <div>
            <strong>Module ${index + 1}</strong>
            <small>${quiz.questions.length} question${quiz.questions.length === 1 ? "" : "s"} - ${quizTotalMarks(quiz)} marks</small>
          </div>
          <button class="ghost-btn" type="button" data-add-quiz-question="${escapeAttr(module.id)}">Add Question</button>
        </div>
        <div class="form-row two">
          <div>
            <label>Module Title</label>
            <input data-module-field="title" value="${escapeAttr(module.title || `Module ${index + 1}`)}">
          </div>
          <div>
            <label>Quiz Title</label>
            <input data-quiz-field="title" value="${escapeAttr(quiz.title || `${module.title || `Module ${index + 1}`} Quiz`)}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>Passing Marks</label>
            <input data-quiz-field="pass_marks" type="number" min="0" value="${escapeAttr(quiz.pass_marks || 0)}">
          </div>
          <div>
            <label>Max Attempts</label>
            <input data-quiz-field="max_attempts" type="number" min="0" value="${escapeAttr(quiz.max_attempts || 0)}">
          </div>
        </div>
        <div class="quiz-question-list">
          ${quiz.questions.length ? quiz.questions.map(quizQuestionEditorHtml).join("") : emptyState("No questions yet. Add the first quiz question.")}
        </div>
      </section>
    `;
  }

  function quizQuestionEditorHtml(question, index) {
    return `
      <div class="quiz-question-editor" data-quiz-question-row data-question-id="${escapeAttr(question.id)}">
        <div class="editor-toolbar">
          <strong>Question ${index + 1}</strong>
          <button class="danger-btn" type="button" data-remove-quiz-question="${escapeAttr(question.id)}">Remove</button>
        </div>
        <div class="form-row">
          <label>Question</label>
          <textarea data-question-field="text" required>${escapeHtml(question.text || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label>Option A</label>
            <input data-question-field="option_a" value="${escapeAttr(question.option_a || "")}">
          </div>
          <div>
            <label>Option B</label>
            <input data-question-field="option_b" value="${escapeAttr(question.option_b || "")}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>Option C</label>
            <input data-question-field="option_c" value="${escapeAttr(question.option_c || "")}">
          </div>
          <div>
            <label>Option D</label>
            <input data-question-field="option_d" value="${escapeAttr(question.option_d || "")}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>Correct Answer</label>
            <select data-question-field="answer">
              ${["A", "B", "C", "D"].map((key) => option(key, question.answer)).join("")}
            </select>
          </div>
          <div>
            <label>Marks</label>
            <input data-question-field="marks" type="number" min="1" value="${escapeAttr(question.marks || 1)}">
          </div>
        </div>
      </div>
    `;
  }

  function syncQuizModulesFromForm(existingModules, options = {}) {
    const list = document.getElementById("quizModuleList");
    if (!list) return existingModules;
    const preserveEmptyQuestions = options.preserveEmptyQuestions === true;
    return Array.from(list.querySelectorAll("[data-quiz-module-row]")).map((row, index) => {
      const moduleId = row.dataset.moduleId || randomId();
      const priorModule = existingModules.find((module) => sameId(module.id, moduleId)) || blankModule(index + 1);
      const priorQuiz = quizForEditor(priorModule);
      const questions = Array.from(row.querySelectorAll("[data-quiz-question-row]")).map((questionRow) => ({
        id: questionRow.dataset.questionId || randomId(),
        text: fieldValue(questionRow, "[data-question-field='text']"),
        option_a: fieldValue(questionRow, "[data-question-field='option_a']"),
        option_b: fieldValue(questionRow, "[data-question-field='option_b']"),
        option_c: fieldValue(questionRow, "[data-question-field='option_c']"),
        option_d: fieldValue(questionRow, "[data-question-field='option_d']"),
        answer: normalizeAnswerKey(fieldValue(questionRow, "[data-question-field='answer']")),
        marks: Math.max(1, Number(fieldValue(questionRow, "[data-question-field='marks']") || 1))
      })).filter((question) => preserveEmptyQuestions || question.text);

      const moduleTitle = fieldValue(row, "[data-module-field='title']") || priorModule.title || `Module ${index + 1}`;
      return {
        ...priorModule,
        id: moduleId,
        title: moduleTitle,
        order_index: Number(priorModule.order_index || index + 1),
        quiz: (questions.length || preserveEmptyQuestions) ? {
          ...priorQuiz,
          title: fieldValue(row, "[data-quiz-field='title']") || `${moduleTitle} Quiz`,
          pass_marks: Number(fieldValue(row, "[data-quiz-field='pass_marks']") || 0),
          max_attempts: Number(fieldValue(row, "[data-quiz-field='max_attempts']") || 0),
          questions
        } : null
      };
    });
  }

  function openLeaderboardModal(course) {
    if (!course) return;
    const rows = leaderboardRows(course);
    const quizMax = courseQuizzes(course).reduce((sum, item) => sum + quizTotalMarks(item.quiz), 0);
    openModal("Course Leaderboard", `
      <div class="leaderboard-head">
        <div>
          <strong>${escapeHtml(course.title || "Course")}</strong>
          <small>Test marks plus mentor extra marks. Sorted by total marks.</small>
        </div>
        <span class="badge blue">${quizMax} quiz marks</span>
      </div>
      <div class="table-shell leaderboard-shell">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Student</th>
              <th>Quiz Marks</th>
              <th>Extra Marks</th>
              <th>Total</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row, index) => `
              <tr data-leaderboard-row data-student-id="${escapeAttr(row.student.id)}">
                <td><strong>#${index + 1}</strong></td>
                <td><strong>${escapeHtml(row.student.name || "Student")}</strong><small>${escapeHtml(row.student.email || "")}</small></td>
                <td>${row.quizScore}</td>
                <td><input data-extra-marks-input type="number" step="1" value="${escapeAttr(row.ownExtra)}"></td>
                <td><strong>${row.total}</strong></td>
                <td><input data-extra-reason-input value="${escapeAttr(row.reason || "")}" placeholder="Class performance"></td>
                <td><button class="primary-btn" type="button" data-save-extra-mark="${escapeAttr(row.student.id)}">Save</button></td>
              </tr>
            `).join("") : `<tr><td colspan="7">${emptyState("No enrolled students for this course.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    `);

    document.querySelectorAll("[data-save-extra-mark]").forEach((button) => {
      button.addEventListener("click", () => saveExtraMarks(course, button.dataset.saveExtraMark, button.closest("[data-leaderboard-row]")));
    });
  }

  function openEnrollmentModal(enrollment = null) {
    const courses = scopedCourses();
    if (!courses.length) {
      showAlert("Create a course before assigning students.", true);
      return;
    }

    const isEdit = Boolean(enrollment);
    const user = enrollmentUser(enrollment || {});
    const course = enrollmentCourse(enrollment || {}) || courses[0];
    const batch = enrollmentBatch(enrollment || {}, user);
    const students = availableStudentsForEnrollment(user?.id);
    const batches = scopedBatches();

    openModal(`${isEdit ? "Edit" : "Assign"} Enrollment`, `
      <form class="form-grid" id="enrollmentForm">
        <div class="form-row two">
          <div>
            <label for="enrollmentUser">Student</label>
            <select id="enrollmentUser" required ${isEdit ? "disabled" : ""}>
              ${students.map((student) => option(student.id, user?.id, student.name || student.email)).join("")}
            </select>
          </div>
          <div>
            <label for="enrollmentCourse">Course</label>
            <select id="enrollmentCourse" required ${isEdit ? "disabled" : ""}>
              ${courses.map((item) => option(item.id, course?.id, item.title || "Course")).join("")}
            </select>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label for="enrollmentBatch">Batch</label>
            <select id="enrollmentBatch">
              <option value="">No batch</option>
              ${batches.map((item) => option(item.id, batch?.id, item.name || "Batch")).join("")}
            </select>
          </div>
          <div>
            <label for="enrollmentStatus">Status</label>
            <select id="enrollmentStatus">
              ${option("active", enrollment?.status)}
              ${option("completed", enrollment?.status)}
              ${option("paused", enrollment?.status)}
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Assign"}</button>
        </div>
      </form>
    `);

    const syncBatchOptions = () => {
      const courseId = isEdit ? course?.id : valueOf("enrollmentCourse");
      const select = document.getElementById("enrollmentBatch");
      if (!select) return;
      const allowed = batches.filter((item) => sameId(item.course_id, courseId));
      const selected = valueOf("enrollmentBatch");
      select.innerHTML = [
        `<option value="">No batch</option>`,
        ...allowed.map((item) => option(item.id, selected, item.name || "Batch"))
      ].join("");
    };

    document.getElementById("enrollmentCourse")?.addEventListener("change", syncBatchOptions);
    syncBatchOptions();

    document.getElementById("enrollmentForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveEnrollment({
        user_id: isEdit ? user?.id : valueOf("enrollmentUser"),
        course_id: isEdit ? course?.id : valueOf("enrollmentCourse"),
        status: valueOf("enrollmentStatus") || "active"
      }, valueOf("enrollmentBatch"), enrollment);
    });
  }

  function openBatchDetail(batch) {
    if (!batch) return;
    const course = courseForBatch(batch);
    const students = studentsForBatch(batch.id);
    const tasks = tasksForBatch(batch.id);
    openModal("Batch Details", `
      <div class="detail-list">
        <div><span>Batch</span><strong>${escapeHtml(batch.name || "Batch")}</strong></div>
        <div><span>Course</span><strong>${escapeHtml(course?.title || "No course")}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(batch.status || "draft")}</strong></div>
        <div><span>Capacity</span><strong>${students.length}/${batch.capacity || "-"}</strong></div>
      </div>
      <h3>Students</h3>
      <div class="stack-list">
        ${students.length ? students.map(studentProgressRow).join("") : emptyState("No students in this batch.")}
      </div>
      <h3>Tasks</h3>
      <div class="stack-list">
        ${tasks.length ? tasks.map((task) => `
          <div class="list-row">
            <div><strong>${escapeHtml(task.title || "Task")}</strong><small>${formatDate(task.deadline)}</small></div>
            <button class="ghost-btn" type="button" data-open-task="${task.id}">Open</button>
          </div>
        `).join("") : emptyState("No tasks for this batch.")}
      </div>
    `);
    bindDynamicActions();
  }

  function openTaskModal(task = null) {
    const batches = scopedBatches();
    if (!batches.length) {
      showAlert("Assign a batch before creating tasks.", true);
      return;
    }
    const isEdit = Boolean(task);
    const defaultBatchId = task?.batch_id || state.selectedBatchId || batches[0].id;
    openModal(`${isEdit ? "Edit" : "New"} Project Task`, `
      <form class="form-grid" id="taskForm">
        <div class="form-row">
          <label for="taskBatch">Batch</label>
          <select id="taskBatch" required>
            ${batches.map((batch) => option(batch.id, defaultBatchId, batch.name)).join("")}
          </select>
        </div>
        <div class="form-row">
          <label for="taskTitle">Task Title</label>
          <input id="taskTitle" required value="${escapeAttr(task?.title || "")}">
        </div>
        <div class="form-row">
          <label for="taskDescription">Description</label>
          <textarea id="taskDescription">${escapeHtml(task?.description || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="taskDeadline">Deadline</label>
            <input id="taskDeadline" type="date" value="${escapeAttr(dateInputValue(task?.deadline))}">
          </div>
          <div>
            <label for="taskDriveLink">Submission Link</label>
            <input id="taskDriveLink" value="${escapeAttr(task?.drive_link || "")}">
          </div>
        </div>
        <div class="form-row">
          <label for="taskFileUrl">File URL</label>
          <input id="taskFileUrl" value="${escapeAttr(task?.file_url || "")}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Create Task"}</button>
        </div>
      </form>
    `);

    document.getElementById("taskForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const deadline = valueOf("taskDeadline");
      await writeRecord("batch_tasks", {
        batch_id: valueOf("taskBatch"),
        title: valueOf("taskTitle"),
        description: valueOf("taskDescription") || null,
        drive_link: valueOf("taskDriveLink") || null,
        file_url: valueOf("taskFileUrl") || null,
        deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null,
        created_by: state.mentor.id
      }, task?.id, ["file_url", "created_by"]);
    });
  }

  function openAnnouncementModal(item = null) {
    const batches = scopedBatches();
    const courses = scopedCourses();
    if (!batches.length && !courses.length) {
      showAlert("Assigned batches or courses are required before sending announcements.", true);
      return;
    }

    const isEdit = Boolean(item);
    const defaultAudience = item?.audience === "course" || (!batches.length && courses.length) ? "course" : "batch";
    const defaultBatchId = item?.batch_id || state.selectedBatchId || batches[0]?.id || "";
    const defaultCourseId = item?.course_id || courses[0]?.id || "";
    openModal(`${isEdit ? "Edit" : "New"} Announcement`, `
      <form class="form-grid" id="announcementForm">
        <div class="form-row">
          <label for="announcementTitle">Title</label>
          <input id="announcementTitle" value="${escapeAttr(item?.title || "")}" placeholder="Class update" required>
        </div>
        <div class="form-row">
          <label for="announcementMessage">Message</label>
          <textarea id="announcementMessage" required placeholder="Write the announcement for students...">${escapeHtml(item?.message || "")}</textarea>
        </div>
        <div class="form-row two">
          <div>
            <label for="announcementAudience">Send to</label>
            <select id="announcementAudience">
              ${batches.length ? option("batch", defaultAudience, "Selected batch students") : ""}
              ${courses.length ? option("course", defaultAudience, "Selected course students") : ""}
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
            <label for="announcementBatch">Batch</label>
            <select id="announcementBatch">
              ${batches.map((batch) => option(batch.id, defaultBatchId, batch.name || "Batch")).join("")}
            </select>
          </div>
          <div>
            <label for="announcementCourse">Course</label>
            <select id="announcementCourse">
              ${courses.map((course) => option(course.id, defaultCourseId, course.title || "Course")).join("")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label for="announcementExpiry">Expires on</label>
          <input id="announcementExpiry" type="date" value="${escapeAttr(dateInputValue(item?.expires_at))}">
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">${isEdit ? "Save" : "Send Announcement"}</button>
        </div>
      </form>
    `);

    const syncTargets = () => {
      const audience = valueOf("announcementAudience") || defaultAudience;
      const batchSelect = document.getElementById("announcementBatch");
      const courseSelect = document.getElementById("announcementCourse");
      if (batchSelect) batchSelect.disabled = audience !== "batch";
      if (courseSelect) courseSelect.disabled = audience !== "course";
    };
    on("announcementAudience", "change", syncTargets);
    syncTargets();

    document.getElementById("announcementForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const audience = valueOf("announcementAudience") || defaultAudience;
      const batchId = audience === "batch" ? valueOf("announcementBatch") : "";
      const courseId = audience === "course" ? valueOf("announcementCourse") : "";
      if (audience === "batch" && !batchId) {
        showAlert("Choose a batch for this announcement.", true);
        return;
      }
      if (audience === "course" && !courseId) {
        showAlert("Choose a course for this announcement.", true);
        return;
      }

      const expiry = valueOf("announcementExpiry");
      await writeRecord("announcements", {
        title: valueOf("announcementTitle"),
        message: valueOf("announcementMessage"),
        audience,
        priority: valueOf("announcementPriority") || "normal",
        batch_id: batchId || null,
        course_id: courseId || null,
        created_by: item?.created_by || state.mentor?.id || null,
        created_by_role: item?.created_by_role || "mentor",
        status: "published",
        published_at: item?.published_at || new Date().toISOString(),
        expires_at: expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null,
        updated_at: new Date().toISOString()
      }, item?.id);
    });
  }

  function openTaskDetail(task) {
    if (!task) return;
    const submissions = submissionsForTask(task.id);
    openModal("Task Submissions", `
      <div class="detail-list">
        <div><span>Task</span><strong>${escapeHtml(task.title || "Task")}</strong></div>
        <div><span>Deadline</span><strong>${formatDate(task.deadline)}</strong></div>
      </div>
      <p>${escapeHtml(task.description || "No description.")}</p>
      ${task.drive_link ? `<p><a class="ghost-btn" href="${escapeAttr(task.drive_link)}" target="_blank" rel="noopener">Open Submission Link</a></p>` : ""}
      <div class="stack-list">
        ${submissions.length ? submissions.map((submission) => {
          const student = findById(state.data.users, submission.student_id || submission.user_id);
          return `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(student?.name || submission.student_name || "Student")}</strong>
                <small>${escapeHtml(submission.submission_url || submission.file_url || submission.drive_link || "No link")} · ${formatDate(submission.created_at || submission.submitted_at)}</small>
              </div>
              <button class="primary-btn" type="button" data-review-submission="${submission.id}">Review</button>
            </div>
          `;
        }).join("") : emptyState("No student submissions yet.")}
      </div>
    `);
    bindDynamicActions();
  }

  function openReviewModal(table, item, noteField) {
    if (!item) return;
    openModal("Save Review", `
      <form class="form-grid" id="reviewForm">
        <div class="form-row">
          <label for="reviewStatus">Status</label>
          <select id="reviewStatus">
            ${["pending", "approved", "changes_requested", "rejected"].map((status) => option(status, item.status)).join("")}
          </select>
        </div>
        <div class="form-row">
          <label for="reviewNotes">Feedback</label>
          <textarea id="reviewNotes">${escapeHtml(item[noteField] || item.feedback || "")}</textarea>
        </div>
        <div class="form-actions">
          <button class="ghost-btn" type="button" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Review</button>
        </div>
      </form>
    `);

    document.getElementById("reviewForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      await writeRecord(table, {
        status: valueOf("reviewStatus"),
        [noteField]: valueOf("reviewNotes"),
        feedback: valueOf("reviewNotes"),
        reviewed_by: state.mentor.id,
        reviewed_at: new Date().toISOString(),
        reviewed_date: new Date().toISOString()
      }, item.id, ["feedback", "reviewed_by", "reviewed_at", "reviewed_date"]);
    });
  }

  function openReplyModal(parent) {
    if (!parent) return;
    const sender = findById(state.data.users, parent.user_id);
    openModal("Reply to Message", `
      <form class="form-grid" id="replyForm">
        <div class="form-row">
          <label>From ${escapeHtml(sender?.name || "User")}</label>
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
    await writeRecord("batch_chats", {
      batch_id: batchId,
      user_id: state.mentor.id,
      message,
      parent_id: parentId
    }, null, ["parent_id"]);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const expertise = valueOf("profileExpertise")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    await writeRecord("users", {
      name: valueOf("profileFullName"),
      phone: valueOf("profilePhone") || null,
      expertise
    }, state.mentor.id, ["phone", "expertise"]);
  }

  async function updatePassword(event) {
    event.preventDefault();
    const currentPassword = valueOf("currentPassword");
    const newPassword = valueOf("newPassword");
    const confirmPassword = valueOf("confirmPassword");
    if (!currentPassword || !newPassword) {
      showAlert("Enter current and new password.", true);
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("New password and confirmation do not match.", true);
      return;
    }
    try {
      const supabaseClient = getClient();
      const { data, error } = await supabaseClient.rpc("lms_change_legacy_password", {
        login_email: state.mentor.email,
        current_password: currentPassword,
        new_password: newPassword
      });
      if (error) throw error;
      if (!data) throw new Error("Current password is incorrect.");
      value("currentPassword", "");
      value("newPassword", "");
      value("confirmPassword", "");
      showAlert("Password updated.");
    } catch (error) {
      showAlert(error.message || "Password update failed.", true);
    }
  }

  async function saveEnrollment(payload, batchId, existingEnrollment = null) {
    try {
      const course = findById(scopedCourses(), payload.course_id);
      const student = findById(state.data.users, payload.user_id);
      const batch = batchId ? findById(scopedBatches(), batchId) : null;
      if (!student || student.role !== "student") {
        showAlert("Choose a valid student.", true);
        return;
      }
      if (!course) {
        showAlert("Choose one of your courses.", true);
        return;
      }
      if (batchId && (!batch || !sameId(batch.course_id, course.id))) {
        showAlert("Choose a batch that belongs to the selected course.", true);
        return;
      }

      const supabaseClient = getClient();
      const existing = existingEnrollment || state.data.userCourses.find((row) => (
        sameId(row.user_id, payload.user_id) && sameId(row.course_id, payload.course_id)
      ));
      const rowPayload = {
        user_id: payload.user_id,
        course_id: payload.course_id,
        status: payload.status || "active"
      };

      if (existing) {
        let { error } = await supabaseClient
          .from("user_courses")
          .update({ status: rowPayload.status })
          .eq("user_id", existing.user_id)
          .eq("course_id", existing.course_id)
          .select();
        if (error && /status/i.test(error.message || "") && /column/i.test(error.message || "")) {
          error = null;
        }
        if (error) throw error;
      } else {
        let { error } = await supabaseClient.from("user_courses").insert(rowPayload).select();
        if (error && /status/i.test(error.message || "") && /column/i.test(error.message || "")) {
          const { status, ...compatiblePayload } = rowPayload;
          ({ error } = await supabaseClient.from("user_courses").insert(compatiblePayload).select());
        }
        if (error && /duplicate|unique/i.test(error.message || "")) {
          error = null;
        }
        if (error) throw error;
      }

      const { error: userError } = await supabaseClient
        .from("users")
        .update({ batch_id: batchId || null })
        .eq("id", payload.user_id);
      if (userError) throw userError;

      closeModal();
      await loadAllData();
      showAlert(existing ? "Enrollment updated." : "Student assigned.");
    } catch (error) {
      showAlert(error.message || "Enrollment save failed.", true);
    }
  }

  async function writeRecord(table, payload, id = null, fallbackKeys = []) {
    try {
      let writePayload = compactPayload(payload);
      let error = await sendWrite(table, writePayload, id);

      if (error && fallbackKeys.length && /column|schema cache/i.test(error.message || "")) {
        fallbackKeys.forEach((key) => delete writePayload[key]);
        error = await sendWrite(table, writePayload, id);
      }

      if (error) throw error;
      closeModal();
      await loadAllData();
      showAlert("Saved successfully.");
    } catch (error) {
      showAlert(error.message || "Save failed.", true);
    }
  }

  async function saveCourseRecord(payload, id = null) {
    try {
      const { error } = await getClient().rpc("lms_mentor_save_course", {
        mentor_user_id: state.mentor?.id,
        course_id: id || null,
        course_payload: compactPayload(payload)
      });

      if (error) {
        if (/lms_mentor_save_course|schema cache|could not find/i.test(error.message || "")) {
          throw new Error("Mentor course save is not configured in Supabase. Run supabase-mentor-course-write-fix.sql, then refresh.");
        }
        throw error;
      }

      closeModal();
      await loadAllData();
      showAlert("Course saved successfully.");
    } catch (error) {
      showAlert(error.message || "Course save failed.", true);
    }
  }

  async function sendWrite(table, payload, id) {
    const supabaseClient = getClient();
    const request = id
      ? supabaseClient.from(table).update(payload).eq("id", id).select()
      : supabaseClient.from(table).insert(payload).select();
    const { error } = await request;
    return error || null;
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

  function clearStoredSessions() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(APP_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem("jenovateStudentSession");
  }

  function setView(view) {
    if (!views[view]) view = "dashboard";
    state.activeView = view;
    document.body.dataset.mentorView = view;
    Object.entries(views).forEach(([key, element]) => {
      element?.classList.toggle("active", key === view);
    });
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
    viewTitle.textContent = views[view]?.dataset.title || "Dashboard";
    renderActiveView();
  }

  function renderActiveView() {
    switch (state.activeView) {
      case "dashboard":
        renderDashboard();
        break;
      case "courses":
        renderCourses();
        break;
      case "batches":
        renderBatches();
        break;
      case "students":
        renderStudents();
        break;
      case "enrollments":
        renderEnrollments();
        break;
      case "tasks":
        renderTasks();
        break;
      case "reviews":
        renderReviews();
        break;
      case "announcements":
        renderAnnouncements();
        break;
      case "chat":
        renderChatBatches();
        renderChat();
        break;
      case "profile":
        renderProfile();
        break;
      default:
        renderDashboard();
    }
  }

  function scopedCourses() {
    const ids = mentorCourseIds();
    return state.data.courses.filter((course) => ids.has(String(course.id)));
  }

  function scopedBatches() {
    const ids = mentorCourseIds();
    return state.data.batches.filter((batch) => sameId(batch.mentor_id, state.mentor?.id) || ids.has(String(batch.course_id)));
  }

  function scopedStudents() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    const courseIds = mentorCourseIds();
    const enrollmentStudentIds = new Set(state.data.userCourses
      .filter((enrollment) => courseIds.has(String(enrollment.course_id)))
      .map((enrollment) => String(enrollment.user_id)));

    return state.data.users.filter((user) => {
      if (String(user.role).toLowerCase() !== "student") return false;
      if (String(user.email).toLowerCase() === "adolf@gmail.com") return false;
      if (sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")) return false;
      return batchIds.has(String(user.batch_id)) || enrollmentStudentIds.has(String(user.id));
    });
  }

  function scopedEnrollments() {
    const courseIds = mentorCourseIds();
    const studentIds = new Set(state.data.users
      .filter((user) => (
        String(user.role).toLowerCase() === "student"
        && String(user.email).toLowerCase() !== "adolf@gmail.com"
        && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7")
      ))
      .map((user) => String(user.id)));
    return state.data.userCourses
      .filter((enrollment) => {
        // Only include courses this mentor manages
        if (!courseIds.has(String(enrollment.course_id))) return false;
        // Only include students — never show mentor or admin enrollments
        const userId = String(enrollment.user_id || enrollment.student_id || enrollment.learner_id || "");
        return studentIds.has(userId);
      })
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  function availableStudentsForEnrollment(selectedUserId = "") {
    return state.data.users
      .filter((user) => (
        (String(user.role).toLowerCase() === "student" && String(user.email).toLowerCase() !== "adolf@gmail.com" && !sameId(user.id, "59d6149c-976e-4657-904e-b8a5d99a2bb7"))
        || sameId(user.id, selectedUserId)
      ))
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
  }

  function scopedTasks() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.batchTasks.filter((task) => batchIds.has(String(task.batch_id)));
  }

  function scopedChats() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    return state.data.chats.filter((chat) => batchIds.has(String(chat.batch_id)));
  }

  function scopedAnnouncements() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    const courseIds = mentorCourseIds();
    return state.data.announcements.filter((item) => {
      const status = String(item.status || "published").toLowerCase();
      const audience = String(item.audience || "all").toLowerCase();
      const expired = item.expires_at && new Date(item.expires_at).getTime() < Date.now();
      if (status !== "published" || expired) return false;
      if (isOwnAnnouncement(item)) return true;
      if (audience === "all" || audience === "mentors") return true;
      if (item.batch_id && batchIds.has(String(item.batch_id))) return true;
      if (item.course_id && courseIds.has(String(item.course_id))) return true;
      return false;
    });
  }

  function scopedSubmissions() {
    const taskIds = new Set(scopedTasks().map((task) => String(task.id)));
    const studentIds = new Set(scopedStudents().map((student) => String(student.id)));
    return state.data.taskSubmissions.filter((submission) => {
      return taskIds.has(String(submission.task_id)) ||
        studentIds.has(String(submission.student_id || submission.user_id));
    });
  }

  function scopedProjects() {
    const batchIds = new Set(scopedBatches().map((batch) => String(batch.id)));
    const courseIds = mentorCourseIds();
    const studentIds = new Set(scopedStudents().map((student) => String(student.id)));
    return state.data.projects.filter((project) => {
      return batchIds.has(String(project.batch_id)) ||
        courseIds.has(String(project.course_id)) ||
        studentIds.has(String(project.student_id || project.user_id));
    });
  }

  function mentorCourseIds() {
    const ids = new Set();
    const mentorId = String(state.mentor?.id || "");
    const mentorName = String(state.mentor?.name || state.mentor?.username || "").toLowerCase();

    state.data.courses.forEach((course) => {
      const instructor = String(course.instructor_name || "").toLowerCase();
      if (sameId(course.mentor_id, mentorId) || (mentorName && instructor === mentorName)) {
        ids.add(String(course.id));
      }
    });

    // NOTE: We intentionally do NOT add courses from the mentor's own user_courses rows.
    // A mentor enrolled as a learner should not cause those courses to appear in
    // the mentor's scoped course list — only owned/assigned courses count.

    state.data.batches.forEach((batch) => {
      if (sameId(batch.mentor_id, mentorId) && batch.course_id) ids.add(String(batch.course_id));
    });

    return ids;
  }

  function studentsForBatch(batchId) {
    return scopedStudents().filter((student) => sameId(student.batch_id, batchId));
  }

  function studentsForCourse(courseId) {
    const studentIds = new Set(state.data.userCourses
      .filter((enrollment) => sameId(enrollment.course_id, courseId))
      .map((enrollment) => String(enrollment.user_id || enrollment.student_id || enrollment.learner_id)));
    return scopedStudents().filter((student) => studentIds.has(String(student.id)));
  }

  function enrollmentUser(enrollment) {
    return findById(state.data.users, enrollment?.user_id || enrollment?.student_id || enrollment?.learner_id);
  }

  function enrollmentCourse(enrollment) {
    return findById(state.data.courses, enrollment?.course_id);
  }

  function enrollmentBatch(enrollment, user) {
    return findById(state.data.batches, enrollment?.batch_id || user?.batch_id);
  }

  function enrollmentProgress(enrollment) {
    const rows = state.data.progress.filter((row) => (
      sameId(row.student_id || row.user_id, enrollment?.user_id || enrollment?.student_id || enrollment?.learner_id)
      && sameId(row.course_id, enrollment?.course_id)
    ));
    if (rows.length) return progressPercent(rows[0], enrollmentCourse(enrollment));
    return clamp(Math.round(Number(enrollment?.progress || 0)), 0, 100);
  }

  function findEnrollmentByKey(key) {
    return state.data.userCourses.find((enrollment) => sameId(enrollment._key || enrollment.id, key));
  }

  function enrolledCoursesForStudent(studentId) {
    const courseIds = state.data.userCourses
      .filter((enrollment) => sameId(enrollment.user_id || enrollment.student_id || enrollment.learner_id, studentId))
      .map((enrollment) => enrollment.course_id);
    const mentorIds = mentorCourseIds();
    return state.data.courses.filter((course) => courseIds.some((id) => sameId(id, course.id)) && mentorIds.has(String(course.id)));
  }

  function tasksForBatch(batchId) {
    return state.data.batchTasks.filter((task) => sameId(task.batch_id, batchId));
  }

  function chatsForBatch(batchId) {
    return state.data.chats
      .filter((chat) => sameId(chat.batch_id, batchId))
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }

  function submissionsForTask(taskId) {
    return state.data.taskSubmissions.filter((submission) => sameId(submission.task_id, taskId));
  }

  function progressForStudent(studentId) {
    const rows = state.data.progress.filter((row) => sameId(row.student_id, studentId));
    if (!rows.length) return 0;
    const scores = rows.map((row) => progressPercent(row));
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  function averageProgress(students) {
    if (!students.length) return 0;
    const total = students.reduce((sum, student) => sum + progressForStudent(student.id), 0);
    return Math.round(total / students.length);
  }

  function progressPercent(row, course = findById(state.data.courses, row?.course_id)) {
    if (typeof row.quiz_score === "number" && row.quiz_completed) return Math.min(100, Math.max(0, row.quiz_score));
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

  function courseForBatch(batch) {
    return findById(state.data.courses, batch?.course_id);
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

  function courseModules(course) {
    const raw = parseJsonValue(course?.modules, []);
    if (Array.isArray(raw)) return raw.map(normalizeModule);
    if (Array.isArray(raw?.modules)) return raw.modules.map(normalizeModule);
    if (raw && typeof raw === "object") return Object.values(raw).map(normalizeModule);
    return [];
  }

  function normalizeModule(module, index = 0) {
    const moduleId = module.id || module.module_id || randomId();
    const moduleTitle = module.title || module.name || "";
    return {
      id: moduleId,
      title: moduleTitle,
      description: module.description || "",
      type: module.type || module.module_type || "Self-paced",
      order_index: Number(module.order_index || module.order || index + 1),
      reward_coins: Number(module.reward_coins || module.reward || 0),
      quiz: normalizeQuiz(module.quiz || module.module_quiz || module.quizQuestions || module.questions, { ...module, id: moduleId, title: moduleTitle }),
      lessons: Array.isArray(module.lessons) ? module.lessons.map(normalizeLesson) : []
    };
  }

  function courseQuizzes(course) {
    return courseModules(course)
      .map((module, moduleIndex) => ({
        module,
        moduleIndex,
        quiz: normalizeQuiz(module.quiz || module.quizQuestions || module.questions, module)
      }))
      .filter((item) => item.quiz && item.quiz.questions.length);
  }

  function quizForEditor(module = {}) {
    const rawQuiz = module.quiz || module.module_quiz || module.quizQuestions || module.questions;
    const normalized = normalizeQuiz(rawQuiz, module) || blankQuiz(module);
    const source = Array.isArray(rawQuiz) ? { questions: rawQuiz } : rawQuiz || {};
    const rawQuestions = Array.isArray(source.questions)
      ? source.questions
      : Array.isArray(source.quizQuestions)
        ? source.quizQuestions
        : [];
    const questions = rawQuestions.length
      ? rawQuestions.map((question, index) => normalizeQuizQuestionForEditor(question, index, module))
      : normalized.questions;
    return {
      ...normalized,
      questions
    };
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
    if (!question || typeof question !== "object") return { id: randomId(), text: "", option_a: "", option_b: "", option_c: "", option_d: "", answer: "A", marks: 1, explanation: "" };

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
    // Format 4: choices array [{text, isCorrect}, ...]
    else if (Array.isArray(question.choices) && question.choices.length) {
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

    // Resolve correct answer
    let rawAnswer = question.answer || question.correct || question.correct_answer
      || question.correctAnswer || question.correct_option
      || question.rightAnswer || question.right_answer || "A";

    const answerNum = Number(rawAnswer);
    if (!isNaN(answerNum) && answerNum >= 1 && answerNum <= 4) {
      rawAnswer = ["A", "B", "C", "D"][answerNum - 1];
    }

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
    if (text.includes("A")) return "A";
    if (text.includes("B")) return "B";
    if (text.includes("C")) return "C";
    if (text.includes("D")) return "D";
    return "A";
  }

  function normalizeQuizQuestionForEditor(question, index = 0, module = {}) {
    const normalized = normalizeQuizQuestion(question, index);
    return {
      ...normalized,
      id: question?.id || question?.question_id || `${module?.id || "module"}-question-${index + 1}`,
      text: question?.text || question?.question || question?.prompt || ""
    };
  }

  function normalizeLesson(lesson, index = 0) {
    const mediaUrl = lesson.video_drive_link || lesson.video_url || lesson.drive_link || lesson.google_drive_link || lesson.file_url || lesson.url || "";
    return {
      id: lesson.id || lesson.lesson_id || randomId(),
      title: lesson.title || lesson.name || "",
      order_index: Number(lesson.order_index || lesson.order || index + 1),
      video_drive_link: mediaUrl,
      video_url: lesson.video_url || "",
      drive_link: lesson.drive_link || mediaUrl,
      google_drive_link: lesson.google_drive_link || "",
      file_url: lesson.file_url || "",
      url: lesson.url || "",
      description: lesson.description || "",
      duration: lesson.duration || "",
      transcript: lesson.transcript || ""
    };
  }

  function blankModule(orderIndex) {
    return {
      id: randomId(),
      title: "",
      description: "",
      type: "Self-paced",
      order_index: orderIndex,
      reward_coins: 0,
      lessons: []
    };
  }

  function blankLesson(orderIndex) {
    return {
      id: randomId(),
      title: "",
      order_index: orderIndex,
      video_drive_link: "",
      drive_link: "",
      video_url: "",
      duration: "",
      transcript: ""
    };
  }

  function blankQuiz(module) {
    return {
      id: `quiz-${module?.id || randomId()}`,
      title: `${module?.title || "Module"} Quiz`,
      pass_marks: 0,
      random_count: 0,
      max_attempts: 0,
      questions: []
    };
  }

  function blankQuizQuestion(orderIndex) {
    return {
      id: randomId(),
      text: "",
      option_a: "",
      option_b: "",
      option_c: "",
      option_d: "",
      answer: "A",
      marks: 1,
      order_index: orderIndex
    };
  }

  function courseSavePayload(course, modules) {
    return {
      title: course.title || course.name || "Untitled Course",
      duration: course.duration || null,
      category: course.category || null,
      module_type: course.module_type || "Self-paced",
      status: course.status || "Draft",
      thumbnail_url: course.thumbnail_url || null,
      description: course.description || "",
      instructor_name: course.instructor_name || state.mentor?.name || null,
      mentor_id: course.mentor_id || state.mentor?.id || null,
      created_by_admin: Boolean(course.created_by_admin),
      is_my_course: course.is_my_course !== false,
      modules
    };
  }

  function quizTotalMarks(quiz) {
    return (quiz?.questions || []).reduce((sum, question) => sum + Number(question.marks || 0), 0);
  }

  function leaderboardRows(course) {
    return studentsForCourse(course.id).map((student) => {
      const ownRecord = extraMarkRecord(student.id, course.id);
      const ownExtra = Number(ownRecord?.marks || ownRecord?.extra_marks || 0);
      const marks = marksForStudentCourse(student.id, course.id);
      return {
        student,
        quizScore: marks.quizScore,
        ownExtra,
        extraTotal: marks.extraMarks,
        reason: ownRecord?.reason || "",
        total: marks.total
      };
    }).sort((a, b) => b.total - a.total || String(a.student.name || "").localeCompare(String(b.student.name || "")));
  }

  function marksForStudentCourse(studentId, courseId) {
    if (!studentId || !courseId) return { quizScore: 0, extraMarks: 0, total: 0 };
    const quizScore = quizScoreForStudentCourse(studentId, courseId);
    const extraMarks = extraMarksForStudentCourse(studentId, courseId);
    return {
      quizScore,
      extraMarks,
      total: quizScore + extraMarks
    };
  }

  function dashboardScoreRows(courses, students) {
    const allowedStudents = new Set((students || []).map((student) => String(student.id)));
    return (courses || []).flatMap((course) => studentsForCourse(course.id)
      .filter((student) => !allowedStudents.size || allowedStudents.has(String(student.id)))
      .map((student) => ({
        student,
        course,
        ...marksForStudentCourse(student.id, course.id)
      })))
      .sort((a, b) => b.total - a.total || String(a.student.name || "").localeCompare(String(b.student.name || "")));
  }

  function quizScoreForStudentCourse(studentId, courseId) {
    const bestByQuiz = new Map();
    state.data.quizAttempts
      .filter((attempt) => sameId(attempt.student_id || attempt.user_id, studentId) && sameId(attempt.course_id, courseId))
      .forEach((attempt) => {
        const key = String(attempt.quiz_id || attempt.module_id || attempt.module_order || attempt.module_title || "course-quiz");
        const score = Number(attempt.score ?? attempt.marks ?? attempt.quiz_score ?? 0);
        bestByQuiz.set(key, Math.max(bestByQuiz.get(key) || 0, score));
      });
    return Array.from(bestByQuiz.values()).reduce((sum, score) => sum + score, 0);
  }

  function extraMarksForStudentCourse(studentId, courseId) {
    return state.data.extraMarks
      .filter((row) => sameId(row.student_id || row.user_id, studentId) && sameId(row.course_id, courseId))
      .reduce((sum, row) => sum + Number(row.marks ?? row.extra_marks ?? 0), 0);
  }

  function extraMarkRecord(studentId, courseId) {
    return state.data.extraMarks.find((row) => (
      sameId(row.student_id || row.user_id, studentId)
      && sameId(row.course_id, courseId)
      && (!row.mentor_id || sameId(row.mentor_id, state.mentor?.id))
    ));
  }

  async function saveExtraMarks(course, studentId, rowElement) {
    if (!course || !studentId || !rowElement) return;
    const marks = Number(rowElement.querySelector("[data-extra-marks-input]")?.value || 0);
    const reason = rowElement.querySelector("[data-extra-reason-input]")?.value?.trim() || "";
    const existing = extraMarkRecord(studentId, course.id);
    const payload = {
      student_id: studentId,
      course_id: course.id,
      mentor_id: state.mentor?.id || null,
      marks,
      reason,
      updated_at: new Date().toISOString()
    };

    try {
      const request = existing?.id
        ? getClient().from("student_extra_marks").update(payload).eq("id", existing.id)
        : getClient().from("student_extra_marks").insert({ ...payload, created_at: new Date().toISOString() });
      const { error } = await request;
      if (error) throw error;
      await loadAllData({ silent: true });
      openLeaderboardModal(findById(state.data.courses, course.id) || course);
      showAlert("Extra marks saved.");
    } catch (error) {
      const message = /student_extra_marks|schema cache|relation|could not find/i.test(error.message || "")
        ? "Run supabase-quiz-leaderboard-setup.sql, then refresh before saving extra marks."
        : error.message || "Unable to save extra marks.";
      showAlert(message, true);
    }
  }

  function moduleEditorHtml(module, index) {
    return `
      <div class="module-editor" data-module-row data-module-id="${escapeAttr(module.id)}">
        <div class="editor-toolbar">
          <strong>Module ${index + 1}</strong>
          <div class="row-actions">
            <button class="ghost-btn" type="button" data-add-lesson="${escapeAttr(module.id)}">Add Lesson</button>
            <button class="danger-btn" type="button" data-remove-module="${escapeAttr(module.id)}">Remove</button>
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>Module Title</label>
            <input data-module-field="title" value="${escapeAttr(module.title)}">
          </div>
          <div>
            <label>Order Index</label>
            <input data-module-field="order_index" type="number" min="1" value="${escapeAttr(module.order_index || index + 1)}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>Module Type</label>
            <select data-module-field="type">
              ${option("Self-paced", module.type)}
              ${option("Live", module.type)}
              ${option("Hybrid", module.type)}
            </select>
          </div>
          <div>
            <label>Reward Coins</label>
            <input data-module-field="reward_coins" type="number" min="0" value="${escapeAttr(module.reward_coins || 0)}">
          </div>
        </div>
        <div class="form-row">
          <label>Description</label>
          <textarea data-module-field="description">${escapeHtml(module.description || "")}</textarea>
        </div>
        ${(module.lessons || []).map(lessonEditorHtml).join("")}
      </div>
    `;
  }

  function lessonEditorHtml(lesson) {
    return `
      <div class="lesson-editor" data-lesson-row data-lesson-id="${escapeAttr(lesson.id)}">
        <div class="editor-toolbar">
          <strong>Lesson</strong>
          <button class="danger-btn" type="button" data-remove-lesson="${escapeAttr(lesson.id)}">Remove Lesson</button>
        </div>
        <div class="form-row two">
          <div>
            <label>Lesson Title</label>
            <input data-lesson-field="title" value="${escapeAttr(lesson.title)}">
          </div>
          <div>
            <label>Order Index</label>
            <input data-lesson-field="order_index" type="number" min="1" value="${escapeAttr(lesson.order_index || 1)}">
          </div>
        </div>
        <div class="form-row two">
          <div>
            <label>Lesson Video / Drive Link</label>
            <input data-lesson-field="video_drive_link" value="${escapeAttr(lessonMediaUrl(lesson))}" placeholder="Google Drive, YouTube, Vimeo, or MP4 URL">
          </div>
          <div>
            <label>Duration</label>
            <input data-lesson-field="duration" value="${escapeAttr(lesson.duration)}">
          </div>
        </div>
        <div class="form-row">
          <label>Transcript</label>
          <textarea data-lesson-field="transcript">${escapeHtml(lesson.transcript || "")}</textarea>
        </div>
      </div>
    `;
  }

  function syncModulesFromForm(existingModules) {
    const list = document.getElementById("courseModuleList");
    if (!list) return existingModules;
    return Array.from(list.querySelectorAll("[data-module-row]")).map((row, index) => {
      const moduleId = row.dataset.moduleId || randomId();
      const priorModule = existingModules.find((module) => sameId(module.id, moduleId)) || {};
      const lessons = Array.from(row.querySelectorAll("[data-lesson-row]")).map((lessonRow, lessonIndex) => {
        const lessonId = lessonRow.dataset.lessonId || randomId();
        const priorLesson = (priorModule.lessons || []).find((lesson) => sameId(lesson.id, lessonId)) || {};
        const mediaUrl = fieldValue(lessonRow, "[data-lesson-field='video_drive_link']")
          || fieldValue(lessonRow, "[data-lesson-field='drive_link']")
          || lessonMediaUrl(priorLesson);
        return {
          ...priorLesson,
          id: lessonId,
          title: fieldValue(lessonRow, "[data-lesson-field='title']"),
          order_index: Number(fieldValue(lessonRow, "[data-lesson-field='order_index']") || lessonIndex + 1),
          video_drive_link: mediaUrl,
          drive_link: mediaUrl,
          video_url: mediaUrl,
          duration: fieldValue(lessonRow, "[data-lesson-field='duration']"),
          transcript: fieldValue(lessonRow, "[data-lesson-field='transcript']")
        };
      }).filter((lesson) => lesson.title || lessonMediaUrl(lesson));

      return {
        ...priorModule,
        id: moduleId,
        title: fieldValue(row, "[data-module-field='title']"),
        description: fieldValue(row, "[data-module-field='description']"),
        type: fieldValue(row, "[data-module-field='type']") || "Self-paced",
        order_index: Number(fieldValue(row, "[data-module-field='order_index']") || index + 1),
        reward_coins: Number(fieldValue(row, "[data-module-field='reward_coins']") || 0),
        lessons
      };
    }).filter((module) => module.title || module.description || module.lessons.length);
  }

  function courseRow(course) {
    const modules = courseModules(course);
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(course.title || "Course")}</strong>
          <small>${modules.length} modules · ${studentsForCourse(course.id).length} students</small>
        </div>
        <button class="ghost-btn" type="button" data-edit-course="${course.id}">Edit</button>
      </div>
    `;
  }

  function batchRow(batch) {
    const course = courseForBatch(batch);
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(batch.name || "Batch")}</strong>
          <small>${escapeHtml(course?.title || "No course")} · ${studentsForBatch(batch.id).length} students</small>
        </div>
        <button class="ghost-btn" type="button" data-open-batch="${batch.id}">Open</button>
      </div>
    `;
  }

  function studentProgressRow(student) {
    const progress = progressForStudent(student.id);
    const batch = findById(state.data.batches, student.batch_id);
    return `
      <div class="progress-row">
        <div>
          <strong>${escapeHtml(student.name || "Student")}</strong>
          <small>${escapeHtml(batch?.name || student.email || "")}</small>
        </div>
        <div class="progress-track"><span style="--progress:${progress}%"></span></div>
        <strong>${progress}%</strong>
      </div>
    `;
  }

  function scoreProgressRow(row, index) {
    return `
      <div class="score-row">
        <span class="score-rank">#${index + 1}</span>
        <div>
          <strong>${escapeHtml(row.student?.name || "Student")}</strong>
          <small>${escapeHtml(row.course?.title || "Course")}</small>
        </div>
        <div class="score-marks">
          <strong>${row.total}</strong>
          <small>Quiz ${row.quizScore} + Extra ${row.extraMarks}</small>
        </div>
      </div>
    `;
  }

  function messageRow(chat) {
    const sender = findById(state.data.users, chat.user_id);
    const own = sameId(chat.user_id, state.mentor?.id);
    return `
      <div class="message-row ${own ? "own" : ""}">
        <div>
          <strong>${escapeHtml(sender?.name || "User")}</strong>
          <small>${formatDateTime(chat.created_at)}${chat.parent_id ? " · reply" : ""}</small>
          <p>${escapeHtml(chat.message || "")}</p>
        </div>
        <button class="ghost-btn" type="button" data-reply-chat="${chat.id}">Reply</button>
      </div>
    `;
  }

  function announcementRow(item) {
    return `
      <div class="list-row">
        <div>
          <strong>${escapeHtml(item.title || "Announcement")}</strong>
          <small>${escapeHtml(announcementTargetLabel(item))} - ${formatDate(item.published_at || item.created_at)}</small>
        </div>
        <span class="badge ${announcementColor(item)}">${escapeHtml(item.priority || "normal")}</span>
      </div>
    `;
  }

  function announcementCard(item) {
    const own = isOwnAnnouncement(item);
    return `
      <article class="announcement-card ${escapeAttr(item.priority || "normal")}">
        <div class="announcement-topline">
          <span class="badge ${announcementColor(item)}">${escapeHtml(announcementAudienceLabel(item))}</span>
          <span class="badge gray">${escapeHtml(item.priority || "normal")}</span>
        </div>
        <h3>${escapeHtml(item.title || "Announcement")}</h3>
        <p>${escapeHtml(item.message || "")}</p>
        <div class="announcement-meta">
          <span>${escapeHtml(announcementTargetLabel(item))}</span>
          <span>${formatDate(item.published_at || item.created_at)}</span>
          <span>${escapeHtml(item.created_by_role === "admin" ? "Admin" : "Mentor")}</span>
        </div>
        ${own ? `
          <div class="card-actions">
            <button class="ghost-btn" type="button" data-edit-announcement="${escapeAttr(item.id)}">Edit</button>
            <button class="danger-btn" type="button" data-delete-announcement="${escapeAttr(item.id)}">Delete</button>
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderBatchFilterOptions() {
    const select = document.getElementById("taskBatchFilter");
    if (!select) return;
    const batches = scopedBatches();
    select.innerHTML = [
      `<option value="">All batches</option>`,
      ...batches.map((batch) => option(batch.id, state.selectedBatchId, batch.name))
    ].join("");
  }

  function normalizeUser(user) {
    return {
      ...user,
      id: user.id,
      name: user.name || user.username || user.email || "User",
      email: user.email || "",
      role: String(user.role || "student").toLowerCase(),
      expertise: parseJsonValue(user.expertise, user.expertise || [])
    };
  }

  function normalizeEnrollment(enrollment) {
    const userId = enrollment?.user_id || enrollment?.student_id || enrollment?.learner_id || "";
    const courseId = enrollment?.course_id || "";
    return {
      ...enrollment,
      user_id: userId,
      course_id: courseId,
      id: enrollment?.id || `${userId}:${courseId}`,
      _key: enrollment?.id || `${userId}:${courseId}`
    };
  }

  function isPendingReview(item) {
    const status = String(item.status || "pending").toLowerCase();
    return ["", "pending", "submitted", "review_pending"].includes(status);
  }

  function isPast(value) {
    if (!value) return false;
    return new Date(value).getTime() < Date.now();
  }

  function statusColor(status) {
    const value = String(status || "").toLowerCase();
    if (["published", "active", "approved", "completed", "live", "open"].includes(value)) return "green";
    if (["draft", "pending", "submitted", "review", "review_pending"].includes(value)) return "amber";
    if (["rejected", "archived", "changes_requested", "due"].includes(value)) return "red";
    return "gray";
  }

  function findById(list, id) {
    return (list || []).find((item) => sameId(item.id, id));
  }

  function sameId(a, b) {
    return String(a || "") === String(b || "");
  }

  function batchPeriod(batch) {
    const start = batch?.start_date ? formatDate(batch.start_date) : "";
    const end = batch?.end_date ? formatDate(batch.end_date) : "";
    if (start && end) return `${start} to ${end}`;
    return start || end || "-";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function matchesText(query, ...values) {
    const queries = (Array.isArray(query) ? query : [query])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    if (!queries.length) return true;
    return queries.every((item) => values.some((value) => String(value ?? "").toLowerCase().includes(item)));
  }

  function matchesCourse(course, query) {
    const moduleText = courseModules(course)
      .map((module) => [
        module.title,
        module.description,
        module.type,
        ...(module.lessons || []).map((lesson) => `${lesson.title || ""} ${lesson.duration || ""} ${lesson.transcript || ""}`)
      ].join(" "))
      .join(" ");
    return matchesText(
      query,
      course?.title,
      course?.description,
      course?.category,
      course?.status,
      course?.duration,
      course?.instructor_name,
      moduleText
    );
  }

  function matchesBatch(batch, query) {
    const course = courseForBatch(batch);
    return matchesText(
      query,
      batch?.name,
      batch?.status,
      batch?.start_date,
      batch?.end_date,
      course?.title,
      course?.category
    );
  }

  function matchesStudent(student, query) {
    const batch = findById(state.data.batches, student?.batch_id);
    const courses = enrolledCoursesForStudent(student?.id).map((course) => course.title).join(" ");
    const courseNames = Array.isArray(student?.courseNames)
      ? student.courseNames.join(" ")
      : String(student?.courseNames || "");
    const courseIds = parseJsonValue(student?.course_ids, student?.course_ids || []);
    const savedCourses = Array.isArray(courseIds) ? courseIds.join(" ") : String(courseIds || "");
    return matchesText(
      query,
      student?.name,
      student?.username,
      student?.email,
      student?.phone,
      batch?.name,
      courses,
      courseNames,
      savedCourses
    );
  }

  function matchesTask(task, query) {
    const batch = findById(state.data.batches, task?.batch_id);
    const course = findById(state.data.courses, batch?.course_id || task?.course_id);
    return matchesText(
      query,
      task?.title,
      task?.name,
      task?.description,
      task?.status,
      task?.deadline,
      task?.drive_link,
      batch?.name,
      course?.title
    );
  }

  function matchesSubmission(submission, query) {
    const task = findById(state.data.batchTasks, submission?.task_id || submission?.batch_task_id);
    const student = findById(state.data.users, submission?.student_id || submission?.user_id);
    return matchesText(
      query,
      submission?.title,
      submission?.status,
      submission?.submission_url,
      submission?.file_url,
      submission?.student_name,
      submission?.student_email,
      task?.title,
      task?.description,
      student?.name,
      student?.email
    );
  }

  function matchesProject(project, query) {
    const student = findById(state.data.users, project?.student_id || project?.user_id);
    const course = findById(state.data.courses, project?.course_id);
    const batch = findById(state.data.batches, project?.batch_id);
    return matchesText(
      query,
      project?.title,
      project?.description,
      project?.status,
      project?.project_url,
      project?.student_name,
      student?.name,
      student?.email,
      course?.title,
      batch?.name
    );
  }

  function matchesChat(chat, query) {
    const sender = findById(state.data.users, chat?.user_id);
    const batch = findById(state.data.batches, chat?.batch_id);
    const course = courseForBatch(batch);
    return matchesText(
      query,
      chat?.message,
      sender?.name,
      sender?.email,
      batch?.name,
      course?.title
    );
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
    if (audience === "batch") return "Batch students";
    if (audience === "course") return "Course students";
    if (audience === "students") return "Students";
    if (audience === "mentors") return "Mentors";
    return "Everyone";
  }

  function announcementTargetLabel(item) {
    const audience = String(item?.audience || "all").toLowerCase();
    if (audience === "batch") {
      const batch = findById(state.data.batches, item?.batch_id);
      return batch?.name || "Selected batch";
    }
    if (audience === "course") {
      const course = findById(state.data.courses, item?.course_id);
      return course?.title || course?.name || "Selected course";
    }
    return announcementAudienceLabel(item);
  }

  function announcementColor(item) {
    const priority = String(item?.priority || "normal").toLowerCase();
    if (priority === "urgent") return "red";
    if (priority === "important") return "amber";
    return "blue";
  }

  function isOwnAnnouncement(item) {
    return sameId(item?.created_by, state.mentor?.id);
  }

  function searchQuery(localInputId = "") {
    const localQuery = localInputId ? document.getElementById(localInputId)?.value.trim().toLowerCase() : "";
    return [state.globalQuery, localQuery].filter(Boolean);
  }

  function hasQuery(query) {
    return Array.isArray(query) ? query.length > 0 : Boolean(query);
  }

  function parseJsonValue(value, fallback) {
    if (Array.isArray(value) || (value && typeof value === "object")) return value;
    if (typeof value !== "string") return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function compactPayload(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  function randomId() {
    return window.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function fieldValue(root, selector) {
    return root.querySelector(selector)?.value?.trim() || "";
  }

  function valueOf(id) {
    return document.getElementById(id)?.value?.trim() || "";
  }

  function value(id, nextValue) {
    const element = document.getElementById(id);
    if (element) element.value = nextValue;
  }

  function text(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "";
  }

  function html(id, value) {
    const element = document.getElementById(id);
    if (element) element.innerHTML = value;
  }

  function on(id, event, handler) {
    document.getElementById(id)?.addEventListener(event, handler);
  }

  function option(value, selected, label = value) {
    return `<option value="${escapeAttr(value)}" ${sameId(value, selected) || String(value).toLowerCase() === String(selected || "").toLowerCase() ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function openModal(title, body) {
    if (!modal || !modalTitle || !modalBody) {
      showAlert("This action panel is not available on the page.", true);
      return;
    }
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-lock");
    modal.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.onclick = closeModal;
    });
    window.requestAnimationFrame(() => {
      modal.scrollTop = 0;
      modalBody.scrollTop = 0;
      modal.querySelector(".modal-card")?.scrollIntoView({ block: "start" });
      modal.querySelector("[data-close-modal]")?.focus({ preventScroll: true });
    });
  }

  function closeModal() {
    if (!modal || !modalBody) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modalBody.innerHTML = "";
    document.body.classList.remove("modal-lock");
  }

  function setLoading(visible) {
    loadingPanel?.classList.toggle("show", visible);
  }

  function showAlert(message, isError = false) {
    if (!alertBox) {
      if (isError) console.error(message);
      return;
    }
    alertBox.textContent = message || "";
    alertBox.classList.toggle("error", Boolean(isError));
    alertBox.classList.add("show");
    if (!isError) {
      window.clearTimeout(showAlert.timer);
      showAlert.timer = window.setTimeout(() => alertBox.classList.remove("show"), 3000);
    }
  }

  function setSyncStatus(message) {
    if (syncStatus) syncStatus.textContent = message;
    if (syncStatusMeta) syncStatusMeta.textContent = message;
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function initials(name) {
    return String(name || "M")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "M";
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function dateInputValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }

  function formatTableName(table) {
    return String(table || "LMS data").replaceAll("_", " ");
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
