const SUPABASE_URL = "https://agrzjwnsapbanbvgbwkh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jrJRXGYEYpixwOAUS6kIWA_ccT4jZs6";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@jenovate.in";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STUDENT_EMAIL = process.env.STUDENT_EMAIL || "student1@gmail.com";
const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD;
const MENTOR_EMAIL = process.env.MENTOR_EMAIL || "mentor1@gmail.com";

if (!ADMIN_PASSWORD || !STUDENT_PASSWORD) {
  throw new Error("Set ADMIN_PASSWORD and STUDENT_PASSWORD before running this script.");
}

const drive = {
  material1: "https://drive.google.com/file/d/1tZ_olucaMw7Jb1YQ7mHZp7WoWUqzE_Eg/view?usp=sharing",
  material2: "https://drive.google.com/file/d/10y3LbAOD77VXeo8oi6QrrqrYTGjZ32Gg/view?usp=sharing",
  material3: "https://drive.google.com/file/d/1phW2oFwPgd0T7rTj2KjFvU1Y7eP-E8-E/view?usp=sharing",
  lectures: {
    1: "https://drive.google.com/file/d/1BXEMwjjF1xdFRcjx-ihz6D90OhuXeYGy/view?usp=sharing",
    2: "https://drive.google.com/file/d/1mCChcID7DymCEuUXYl5Qfmf6kLR_CHXs/view?usp=sharing",
    3: "https://drive.google.com/file/d/1VulAhYnUbq3FXxttL8A5v_9f0eG1UG-m/view?usp=sharing",
    4: "https://drive.google.com/file/d/1-TJUghWACdEGMoLUKwwOlopihJHxjkbK/view?usp=sharing",
    5: "https://drive.google.com/file/d/1yXBXcesi-8bdXQ8t4IkZnzvfiFDw5VgA/view?usp=sharing",
    6: "https://drive.google.com/file/d/1OC9WeRnrdwFjocBpwKhoukiDvWefq7l6/view?usp=sharing",
    7: "https://drive.google.com/file/d/1xkEVK5S4jqr03kj6bZM4_dawvZ9AUd40/view?usp=sharing",
    8: "https://drive.google.com/file/d/1Yn55jWDQh88U82YUiQVjZg5YZN08Y6z2/view?usp=sharing",
    9: "https://drive.google.com/file/d/1OhkQAN0c99NA_6HEB5pb92j7UHUyOkkM/view?usp=sharing",
    10: "https://drive.google.com/file/d/1PnGExDacksWX4NrY0IiRHKj5A4ZVttGp/view?usp=sharing",
    11: "https://drive.google.com/file/d/1OimGKiZ9Env-Pn18G_VnxwC78IpwhBwt/view?usp=sharing"
  }
};

function nowIso() {
  return new Date().toISOString();
}

function uuid() {
  return globalThis.crypto.randomUUID();
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""));
}

function missingColumn(error) {
  const message = String(error?.message || "");
  const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1] || quoted[2] || quoted[3] || "";
  return message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
}

function stripKey(payload, key) {
  const next = { ...payload };
  delete next[key];
  return next;
}

function authHeaders(token = "") {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json"
  };
}

async function fetchSupabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || response.statusText);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function login(email, password) {
  const data = await fetchSupabase("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password })
  });
  return data.access_token;
}

function filterEq(column, value) {
  return `${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`;
}

async function selectRows(token, table, query = "", select = "*") {
  const sep = query ? `&${query}` : "";
  return fetchSupabase(`/rest/v1/${table}?select=${encodeURIComponent(select)}${sep}`, {
    headers: authHeaders(token)
  });
}

async function writeFirstWorking(token, table, payload, id = "", select = "*", optionalKeys = []) {
  let writePayload = compact(payload);
  let keys = [...optionalKeys];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const path = id
        ? `/rest/v1/${table}?${filterEq("id", id)}&select=${encodeURIComponent(select)}`
        : `/rest/v1/${table}?select=${encodeURIComponent(select)}`;
      const method = id ? "PATCH" : "POST";
      const data = await fetchSupabase(path, {
        method,
        headers: { ...authHeaders(token), Prefer: "return=representation" },
        body: JSON.stringify(writePayload)
      });
      return Array.isArray(data) ? data[0] : data;
    } catch (error) {
      const missing = missingColumn(error);
      const key = missing || keys.find((item) => Object.hasOwn(writePayload, item));
      if (!key) throw error;
      writePayload = stripKey(writePayload, key);
      keys = keys.filter((item) => item !== key);
    }
  }
  throw new Error(`Unable to write ${table}.`);
}

function question(moduleKey, index, text, options, answer = "A") {
  return {
    id: `${moduleKey}-q${String(index).padStart(2, "0")}`,
    text,
    option_a: options[0],
    option_b: options[1],
    option_c: options[2],
    option_d: options[3],
    answer,
    marks: 1
  };
}

function quiz(moduleKey, title, questions) {
  return {
    id: `${moduleKey}-quiz`,
    title,
    status: "published",
    pass_marks: 4,
    max_attempts: 0,
    timer_minutes: 10,
    random_count: 7,
    questions
  };
}

const quizBank = {
  module1: [
    question("module1", 1, "What is the primary goal of cyber security?", ["Protect digital systems and data", "Increase screen brightness", "Replace programming languages", "Remove all passwords"]),
    question("module1", 2, "Which principle gives users only the access they need?", ["Least privilege", "Open access", "Public sharing", "Unlimited trust"]),
    question("module1", 3, "What does ethical hacking require before testing a system?", ["Written permission", "A faster laptop", "Anonymous posting", "Removing logs"]),
    question("module1", 4, "Which item is a common security asset?", ["Customer database", "Keyboard shortcut", "Wallpaper", "Font family"]),
    question("module1", 5, "What does MFA add to authentication?", ["An extra verification factor", "A public password list", "Automatic sharing", "No login checks"]),
    question("module1", 6, "Which is a strong password practice?", ["Use unique long passwords", "Reuse one password", "Share passwords in chat", "Use only birthdays"]),
    question("module1", 7, "What is social engineering?", ["Manipulating people to reveal information", "Formatting web pages", "Compressing files", "Installing updates"]),
    question("module1", 8, "What should a beginner hacking lab use?", ["Isolated legal test systems", "Random public websites", "Bank servers", "Unknown Wi-Fi networks"]),
    question("module1", 9, "Which concept means data is not changed without authorization?", ["Integrity", "Brightness", "Latency", "Branding"]),
    question("module1", 10, "Which concept keeps systems usable when needed?", ["Availability", "Obfuscation only", "Decoration", "Color contrast"]),
    question("module1", 11, "What is reconnaissance in security testing?", ["Gathering information about a target", "Deleting backups", "Changing passwords randomly", "Writing invoices"]),
    question("module1", 12, "Which activity is defensive?", ["Applying security patches", "Publishing secrets", "Disabling logs", "Ignoring alerts"]),
    question("module1", 13, "What is a vulnerability?", ["A weakness that can be exploited", "A finished certificate", "A course title", "A support reply"]),
    question("module1", 14, "What is a threat?", ["A possible cause of harm", "A verified backup", "A safe coding rule", "A mentor profile"]),
    question("module1", 15, "What should be documented in ethical hacking?", ["Scope, permission, findings, and remediation", "Only jokes", "Private passwords", "Unrelated browsing history"])
  ],
  module2: [
    question("module2", 1, "What is phishing?", ["A deceptive attempt to steal information", "A secure backup method", "A password manager", "A firewall rule"]),
    question("module2", 2, "What does malware mean?", ["Malicious software", "Healthy software", "A design template", "A course batch"]),
    question("module2", 3, "What is ransomware known for?", ["Encrypting data and demanding payment", "Improving uptime", "Fixing vulnerabilities", "Writing documentation"]),
    question("module2", 4, "What can reduce phishing risk?", ["User awareness and MFA", "Sharing OTPs", "Clicking unknown links", "Disabling email filters"]),
    question("module2", 5, "What does a firewall help control?", ["Network traffic", "PDF page count", "Quiz colors", "Screen size"]),
    question("module2", 6, "Which is a sign of a suspicious link?", ["Unexpected domain or spelling changes", "HTTPS always means safe", "Known sender with context", "Internal training page"]),
    question("module2", 7, "What is vulnerability scanning used for?", ["Finding known weaknesses", "Changing mentor names", "Buying domains", "Designing logos"]),
    question("module2", 8, "What is patch management?", ["Keeping software updated against known issues", "Making passwords shorter", "Removing backups", "Hiding alerts"]),
    question("module2", 9, "Why are logs useful?", ["They help investigate activity", "They replace authentication", "They publish secrets", "They slow all users"]),
    question("module2", 10, "What is network segmentation?", ["Separating networks to limit impact", "Making one flat network", "Deleting routers", "Renaming a batch"]),
    question("module2", 11, "Which is safer on public Wi-Fi?", ["Use trusted VPN and avoid sensitive actions", "Disable all passwords", "Share files openly", "Ignore certificates"]),
    question("module2", 12, "What is incident response?", ["Structured handling of security events", "A course thumbnail", "A lecture title", "A chat emoji"]),
    question("module2", 13, "What is a brute-force attack?", ["Trying many passwords repeatedly", "Encrypting backups", "Changing UI colors", "Submitting a ticket"]),
    question("module2", 14, "Which control helps detect unusual behavior?", ["Monitoring and alerts", "Public credentials", "Old software", "Shared accounts"]),
    question("module2", 15, "What should a security report include?", ["Risk, evidence, impact, and remediation", "Only the tester name", "No reproduction steps", "Private keys"])
  ],
  module3: [
    question("module3", 1, "Which habit protects accounts best?", ["Unique passwords with MFA", "One password everywhere", "Shared OTPs", "No recovery email"]),
    question("module3", 2, "What should backups be tested for?", ["Successful restoration", "Logo quality", "Chat speed", "Font size"]),
    question("module3", 3, "What is secure coding focused on?", ["Preventing flaws in software", "Only visual styling", "Skipping validation", "Hardcoding secrets"]),
    question("module3", 4, "What is input validation?", ["Checking data before processing it", "Trusting all input", "Removing forms", "Making fields invisible"]),
    question("module3", 5, "Why should secrets not be committed to code?", ["They can be exposed and abused", "They improve build speed", "They replace login", "They style the page"]),
    question("module3", 6, "What does encryption protect?", ["Data confidentiality", "Button alignment", "Course order only", "Profile pictures only"]),
    question("module3", 7, "What is a security policy?", ["Rules for protecting systems and data", "A video file", "A random quiz option", "A Drive folder name"]),
    question("module3", 8, "What is the safest response to a suspected breach?", ["Report quickly and follow the incident plan", "Hide the issue", "Delete all evidence", "Post passwords"]),
    question("module3", 9, "Which is a good device security practice?", ["Lock screen and keep OS updated", "Disable updates forever", "Install unknown tools", "Share admin access"]),
    question("module3", 10, "Why is awareness training repeated?", ["Threats and habits change over time", "It replaces backups", "It removes all risk", "It makes passwords public"]),
    question("module3", 11, "What is risk assessment?", ["Estimating likelihood and impact", "Choosing only colors", "Deleting users", "Skipping tests"]),
    question("module3", 12, "What does zero trust assume?", ["Verify explicitly and limit trust", "Trust every network", "No need for identity", "All users are admins"]),
    question("module3", 13, "Which action protects cloud files?", ["Use access controls and sharing reviews", "Make every folder public", "Disable audit logs", "Share edit links widely"]),
    question("module3", 14, "What is responsible disclosure?", ["Reporting vulnerabilities through an approved process", "Publishing exploits first", "Selling credentials", "Ignoring scope"]),
    question("module3", 15, "What should learners do after the course?", ["Practice legally and keep improving defenses", "Attack unknown systems", "Reuse old passwords", "Skip documentation"])
  ]
};

function lesson(number, order, title) {
  return {
    id: `cyber-lecture-${number}`,
    title: `Lecture ${number}: ${title}`,
    description: `Cyber Security & Ethical Hacking lecture ${number} with guided examples and review notes.`,
    content_type: "video",
    order_index: order,
    drive_link: drive.lectures[number],
    video_drive_link: drive.lectures[number],
    video_url: drive.lectures[number],
    duration: "Recorded lecture"
  };
}

const modules = [
  {
    id: "cyber-module-1",
    title: "Module 1: Cyber Security Foundations and Ethical Hacking Setup",
    description: "Introduces the cyber security mindset, ethical hacking boundaries, core CIA principles, lab safety, and foundational security vocabulary.",
    order_index: 1,
    study_material_url: drive.material1,
    material_url: drive.material1,
    lessons: [
      lesson(1, 1, "Cyber Security orientation"),
      lesson(2, 2, "Ethical hacking scope and permissions"),
      lesson(3, 3, "Assets, threats, vulnerabilities, and risk"),
      lesson(4, 4, "Authentication, MFA, and safe lab practice")
    ],
    quiz: quiz("module1", "Module 1 Foundations Quiz", quizBank.module1)
  },
  {
    id: "cyber-module-2",
    title: "Module 2: Threats, Reconnaissance and Defensive Controls",
    description: "Covers phishing, malware, scanning concepts, defensive controls, logging, patching, and incident response basics.",
    order_index: 2,
    study_material_url: drive.material2,
    material_url: drive.material2,
    lessons: [
      lesson(4, 1, "Review: security basics applied to threat scenarios"),
      lesson(5, 2, "Phishing and social engineering patterns"),
      lesson(6, 3, "Malware, ransomware, and endpoint defense"),
      lesson(7, 4, "Reconnaissance and vulnerability scanning"),
      lesson(8, 5, "Firewalls, logs, monitoring, and patching")
    ],
    quiz: quiz("module2", "Module 2 Threats and Defense Quiz", quizBank.module2)
  },
  {
    id: "cyber-module-3",
    title: "Module 3: Practical Security Best Practices and Final Review",
    description: "Focuses on secure habits, backups, secure coding basics, cloud file protection, responsible disclosure, and final practice review.",
    order_index: 3,
    study_material_url: drive.material3,
    material_url: drive.material3,
    lessons: [
      lesson(9, 1, "Secure account and device practices"),
      lesson(10, 2, "Secure coding, secrets, and cloud file hygiene"),
      lesson(11, 3, "Risk assessment, reporting, and responsible practice")
    ],
    quiz: quiz("module3", "Module 3 Best Practices Quiz", quizBank.module3)
  }
];

async function rpc(token, name, body) {
  return fetchSupabase(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body)
  });
}

async function main() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const studentToken = await login(STUDENT_EMAIL, STUDENT_PASSWORD);

  const [student] = await selectRows(adminToken, "users", filterEq("email", STUDENT_EMAIL), "*");
  const [mentor] = await selectRows(adminToken, "users", filterEq("email", MENTOR_EMAIL), "*");
  const [admin] = await selectRows(adminToken, "users", filterEq("email", ADMIN_EMAIL), "*");
  if (!student?.id) throw new Error(`Student not found: ${STUDENT_EMAIL}`);
  if (!mentor?.id) throw new Error(`Mentor not found: ${MENTOR_EMAIL}`);
  if (!admin?.id) throw new Error(`Admin profile not found: ${ADMIN_EMAIL}`);

  const coursePayload = {
    title: "Cyber Security & Ethical Hacking",
    description: "A practical cyber security course covering ethical hacking boundaries, common threats, reconnaissance concepts, defensive controls, secure habits, and responsible reporting. The course includes 11 Drive-hosted lectures, three PDF study materials, and module quizzes with 15-question banks.",
    category: "Cyber Security",
    duration: "11 lectures / 3 modules",
    module_type: "Video + PDF + Quiz",
    instructor_name: mentor.name || mentor.email || "mentor1",
    status: "Published",
    price: 0,
    difficulty: "Beginner to Intermediate",
    modules,
    is_featured: true,
    is_my_course: false,
    created_by_admin: true,
    quiz_pass_score: 4,
    mentor_id: mentor.id,
    updated_at: nowIso()
  };

  const existingCourses = await selectRows(adminToken, "courses", filterEq("title", coursePayload.title), "*");
  const course = await writeFirstWorking(
    adminToken,
    "courses",
    coursePayload,
    existingCourses[0]?.id || "",
    "*",
    ["image_url", "thumbnail_url", "mentor_id", "created_by_admin", "updated_at", "difficulty", "module_type", "is_featured", "is_my_course", "quiz_pass_score"]
  );

  const batchPayload = {
    name: "cyber",
    course_id: course.id,
    mentor_id: mentor.id,
    capacity: 35,
    enroll_limit: 35,
    smart_waitlist: true,
    status: "active",
    start_date: new Date().toISOString().slice(0, 10),
    progress: 0,
    enrolled_count: 1
  };
  const existingBatches = await selectRows(adminToken, "batches", filterEq("name", "cyber"), "*");
  const batch = await writeFirstWorking(
    adminToken,
    "batches",
    batchPayload,
    existingBatches[0]?.id || "",
    "*",
    ["enroll_limit", "smart_waitlist", "progress", "enrolled_count", "start_date"]
  );

  async function enroll(user, role) {
    const rows = await selectRows(
      adminToken,
      "user_courses",
      `${filterEq("user_id", user.id)}&${filterEq("course_id", course.id)}`,
      "*"
    );
    const enrollment = await writeFirstWorking(
      adminToken,
      "user_courses",
      {
        user_id: user.id,
        student_id: user.id,
        learner_id: user.id,
        course_id: course.id,
        batch_id: batch.id,
        status: "active",
        created_at: nowIso()
      },
      rows[0]?.id || "",
      "*",
      ["student_id", "learner_id", "batch_id", "status", "created_at"]
    );
    const courseIds = Array.isArray(user.course_ids) ? user.course_ids : [];
    const nextCourseIds = [...new Set([...courseIds.map(String), String(course.id)])];
    await writeFirstWorking(
      adminToken,
      "users",
      {
        batch_id: role === "student" ? batch.id : user.batch_id || null,
        course_ids: nextCourseIds
      },
      user.id,
      "*",
      ["course_ids", "batch_id"]
    );
    return enrollment;
  }

  await enroll(student, "student");
  await enroll(mentor, "mentor");

  const adminChat = await writeFirstWorking(adminToken, "batch_chats", {
    batch_id: batch.id,
    user_id: admin.id,
    message: "Welcome to the Cyber Security batch. Lectures, PDFs, and module quizzes are now assigned.",
    created_at: nowIso()
  }, "", "*", ["created_at", "parent_id"]);

  const studentChat = await writeFirstWorking(studentToken, "batch_chats", {
    batch_id: batch.id,
    user_id: student.id,
    message: "Student test message: I can see the Cyber Security batch and study materials.",
    created_at: nowIso()
  }, "", "*", ["created_at", "parent_id"]);

  const announcement = await writeFirstWorking(adminToken, "announcements", {
    title: "Cyber Security batch is live",
    message: "Mentor1 has been assigned to the Cyber batch. Please review the Drive lectures, PDFs, and quizzes for all three modules.",
    audience: "mentors",
    priority: "important",
    course_id: course.id,
    batch_id: batch.id,
    created_by: admin.id,
    created_by_role: "admin",
    status: "published",
    published_at: nowIso(),
    updated_at: nowIso()
  }, "", "*", ["updated_at", "course_id", "batch_id", "created_by_role"]);

  const adminTicket = await writeFirstWorking(adminToken, "support_tickets", {
    user_id: admin.id,
    user_role: "admin",
    category: "course setup",
    subject: "Cyber course admin-side test ticket",
    message: "Admin test ticket after creating the Cyber Security course, batch, and assignments.",
    status: "open",
    priority: "normal",
    created_at: nowIso(),
    updated_at: nowIso()
  }, "", "*", ["created_at", "updated_at", "priority", "ticket_id"]);

  const studentTicket = await rpc(studentToken, "lms_support_create_ticket", {
    requester_user_id: student.id,
    requester_role: "student",
    ticket_category: "course access",
    ticket_subject: "Cyber course student-side test ticket",
    ticket_message: "Student test ticket: Cyber Security lectures and PDFs are assigned and need verification.",
    ticket_attachment_url: null
  });

  const question = await rpc(studentToken, "lms_submit_student_question", {
    target_user_id: student.id,
    target_course_id: course.id,
    question_title: "Cyber module study material question",
    question_description: "Student test message to mentor: please confirm the Module 1 PDF and Lecture 1 video are visible.",
    question_link: drive.material1
  });

  const selectedQuestions = quizBank.module1.slice(0, 6);
  const answers = Object.fromEntries(selectedQuestions.map((item) => [item.id, item.answer]));
  const quizAttempt = await writeFirstWorking(studentToken, "student_quiz_attempts", {
    student_id: student.id,
    course_id: course.id,
    module_id: "cyber-module-1",
    module_order: 1,
    module_title: "Module 1: Cyber Security Foundations and Ethical Hacking Setup",
    quiz_id: "module1-quiz",
    score: 6,
    total: 6,
    pass_score: 4,
    max_score: 6,
    passed: true,
    attempt_number: 1,
    answers,
    time_taken_seconds: 142,
    duration_seconds: 142,
    question_count: selectedQuestions.length,
    selected_question_ids: selectedQuestions.map((item) => item.id),
    submitted_at: nowIso(),
    created_at: nowIso()
  }, "", "*", ["module_order", "module_title", "quiz_id", "max_score", "answers", "time_taken_seconds", "duration_seconds", "question_count", "selected_question_ids", "submitted_at", "created_at"]);

  const verify = {
    course: { id: course.id, title: course.title, modules: modules.length, quizQuestionsPerModule: modules.map((item) => item.quiz.questions.length) },
    batch: { id: batch.id, name: batch.name, course_id: batch.course_id, mentor_id: batch.mentor_id },
    assigned: { student: student.email, mentor: mentor.email },
    created: {
      adminChat: Boolean(adminChat?.id),
      studentChat: Boolean(studentChat?.id),
      mentorAnnouncement: Boolean(announcement?.id),
      adminTicket: Boolean(adminTicket?.id),
      studentTicket: Boolean(studentTicket?.id),
      studentQuestionToMentor: Boolean(question?.id),
      quizAttempt: Boolean(quizAttempt?.id),
      quizAttemptQuestionCount: quizAttempt?.question_count || selectedQuestions.length,
      quizAttemptTimeSeconds: quizAttempt?.time_taken_seconds || 142
    }
  };
  console.log(JSON.stringify(verify, null, 2));
}

main().catch((error) => {
  console.error(error.details || error);
  process.exitCode = 1;
});
