import { readFile } from "node:fs/promises";

const COURSE_PRICE = 5999;

const courseGroups = {
  "Technology & Software Development": [
    "Programming in Python",
    "Programming in Java",
    "DSA with Python",
    "Software Engineering",
    "Front-End Web Development",
    "Full-Stack Web Development",
    "Senior SDE Interview Prep",
    "Full Stack Developer Portfolio",
    "Android Development",
  ],
  "Artificial Intelligence & Data": [
    "Artificial Intelligence",
    "Artificial Intelligence and Machine Learning",
    "AI (Agentic & Generative)",
    "Machine Learning",
    "Data Science",
    "Data Engineering with SQL & Cloud",
    "Data Analytics with Power BI",
    "Data Analysis",
  ],
  "Cyber Security & Infrastructure": [
    "Cyber Security & Ethical Hacking",
    "Cloud Computing",
    "DevOps",
  ],
  "Engineering & Emerging Technologies": [
    "Internet of Things (IoT)",
    "IoT & Robotics",
    "Embedded Systems",
    "VLSI",
    "Robotics",
    "Hybrid Electric Vehicle",
    "Nanotechnology",
  ],
  "Business, Management & Finance": [
    "Digital Marketing",
    "Human Resource Management",
    "Finance",
    "Startup & Entrepreneurship",
    "Business Analysis",
    "Operation & Supply Chain Management",
    "E-Commerce Operations Management",
    "Product & Project Management",
    "Stock Marketing",
  ],
  "Design & Creative Arts": ["UI/UX", "Graphic Designing", "AutoCAD", "Car Design"],
  "Healthcare & Human Sciences": [
    "Medical Coding",
    "Clinical Trials & Research",
    "Psychology",
    "Counselling Psychology Practice",
    "Clinical Psychology Basics",
    "Rehabilitation Psychology",
  ],
};

const frontendTitleBySlug = new Map();
const categoryByTitle = new Map();
for (const [category, titles] of Object.entries(courseGroups)) {
  for (const title of titles) {
    frontendTitleBySlug.set(slugify(title), title);
    categoryByTitle.set(title, category);
  }
}

const pastedCourses = [
  ["Cloud Computing", "https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing"],
  ["UI & UX", "https://drive.google.com/drive/folders/11Yr3YAr08RGJO-jzLFj8HReSOBvWTZIl?usp=sharing"],
  ["DevOps", "https://drive.google.com/drive/folders/15gadcdvPYm49DqGitAjkhGFiHey3j-Mz?usp=sharing"],
  ["Software Engineering", "https://drive.google.com/drive/folders/15ledKjEvaQZejuPFCtyYT-mjVL0qbcvA?usp=sharing"],
  ["Machine Learning", "https://drive.google.com/drive/folders/16CWc_r-v_ULruaeDLAGJ1mR9UZUivR8F?usp=sharing"],
  ["Data Analysis", "https://drive.google.com/drive/folders/1BbFscYvRsVAd7hv9r5thNZfVO7ewrlEg?usp=sharing"],
  ["Programming in Java", "https://drive.google.com/drive/folders/1F3CrGVSqLXaqJ_sbq4ykEuX23cqa2TKI?usp=sharing"],
  ["Medical Coding", "https://drive.google.com/drive/folders/1JXWO2to6m2pvB3qiotvfPWKrEaJQeiZl?usp=sharing"],
  ["VLSI", "https://drive.google.com/drive/folders/1Jj_wJ0bsa2qbGmLh_LqSnPPYCB-pQgfb?usp=sharing"],
  ["Hybrid Electric Vehicle", "https://drive.google.com/drive/folders/1KuADy67y_nJ1tCkqwjQtxQAEdTXJLdd7?usp=sharing"],
  ["Finance", "https://drive.google.com/drive/folders/1LO8boETjLwr4FYaXsCaKuLgKhXKEKjk7?usp=sharing"],
  ["Artificial Intelligence", "https://drive.google.com/drive/folders/1NmgBLbRCLXrk35VreMAEgHoT6r84TVfS?usp=sharing"],
  ["Digital Marketing", "https://drive.google.com/drive/folders/1OZ-MjVMGc9whIpJQUvnPam0huZVkQ33h?usp=sharing"],
  ["Generative AI", "https://drive.google.com/drive/folders/1TeVRLfI8WwK8OxLTTi1A_1itAIkFfJpv?usp=sharing"],
  ["Stock Marketing 1", "https://drive.google.com/drive/folders/1XNAyp4votkjTjci5q0_wekq94umZlFPY?usp=sharing"],
  ["Programming in Python", "https://drive.google.com/drive/folders/1aSIqp5LjHQ2JzdFAk_8-hTfrG41qrA9L?usp=sharing"],
  ["Embedded System", "https://drive.google.com/drive/folders/1aiK0DfAYtpYfvscV4LUE1ktrleExBcX4?usp=sharing"],
  ["Business Analysis", "https://drive.google.com/drive/folders/1dFBfz7FMDdqVfTpYJSF_DBbaylVc4W_w?usp=sharing"],
  ["Artificial Intelligence and Machine Learning", "https://drive.google.com/drive/folders/1f0UAROvkvw8oFEgwOr9VPwHElhzWu-KX?usp=sharing"],
  ["Cyber Security", "https://drive.google.com/drive/folders/1k3NRENi0QoxXgR8t7vAW_lwG1ngXBUYv?usp=sharing"],
  ["Full Stack Web Development", "https://drive.google.com/drive/folders/1k8rcbzMrHlRNKc0mfMaztLUbb-0mVCi0?usp=sharing"],
  ["AutoCAD", "https://drive.google.com/drive/folders/1ocTBcRpXVEKnOBiHiO6NzTMhjkfTcKSG?usp=sharing"],
  ["Internet of Things", "https://drive.google.com/drive/folders/1pkW1Hb2BhnGsl0B8dBSXGzr51NxPVlix?usp=sharing"],
  ["Human Resource Management", "https://drive.google.com/drive/folders/1rWrwcCjQ0Ie8FXsvD-8zr7_DeLa_bKuj?usp=sharing"],
  ["Startup and Entrepreneurship", "https://drive.google.com/drive/folders/1rrTykQiciDU0dkgPyxFtp4XI7p2vWW7-?usp=sharing"],
  ["Data Structures & Algorithms", "https://drive.google.com/drive/folders/1ubOtVVM5v0QE_e_kjTptLuBQgEmXeFvb?usp=sharing"],
  ["Psychology", "https://drive.google.com/drive/folders/1w8Ca4LjrbvIaCW6FNV85FAykpUIwwdp8?usp=sharing"],
  ["IOT & Robotics", "https://drive.google.com/drive/folders/1xAHnYz7I_xppMvqgk2tnzKh8S19zLy3g?usp=sharing"],
  ["Front-End Web Development", "https://drive.google.com/drive/folders/1xxQ2b9FSzy_noq2k_z9rykPQEQ4lsbfU?usp=sharing"],
];

const aliasToFrontendTitle = new Map([
  ["ui-and-ux", "UI/UX"],
  ["stock-marketing-1", "Stock Marketing"],
  ["embedded-system", "Embedded Systems"],
  ["cyber-security", "Cyber Security & Ethical Hacking"],
  ["full-stack-web-development", "Full-Stack Web Development"],
  ["internet-of-things", "Internet of Things (IoT)"],
  ["startup-and-entrepreneurship", "Startup & Entrepreneurship"],
  ["data-structures-and-algorithms", "DSA with Python"],
  ["generative-ai", "AI (Agentic & Generative)"],
  ["iot-and-robotics", "IoT & Robotics"],
  ["artificial-intelligence-and-machine-learning", "Artificial Intelligence and Machine Learning"],
]);

const needsReview = new Set([]);

const env = await loadEnv();
const existingCourses = await request("courses?select=*&order=title.asc");
const report = { updated: [], created: [], unchanged: [], needsReview: [], duplicateFrontendRows: [] };

for (const [sourceTitle, folderUrl] of pastedCourses) {
  const sourceSlug = slugify(sourceTitle);
  if (needsReview.has(sourceSlug)) {
    report.needsReview.push({ sourceTitle, folderUrl, reason: "No single frontend course name matches this without duplicating AI or Machine Learning." });
    continue;
  }

  const frontendTitle = aliasToFrontendTitle.get(sourceSlug) || frontendTitleBySlug.get(sourceSlug);
  if (!frontendTitle) {
    report.needsReview.push({ sourceTitle, folderUrl, reason: "No frontend catalog match found." });
    continue;
  }

  const matches = existingCourses.filter((course) => courseMatches(course, frontendTitle, sourceTitle));
  if (matches.length > 1) report.duplicateFrontendRows.push({ frontendTitle, count: matches.length, ids: matches.map((course) => course.id) });
  const current = matches[0] || null;
  const payload = coursePayload(frontendTitle, sourceTitle, folderUrl, current);
  if (current && courseAlreadyMapped(current, payload, folderUrl)) {
    report.unchanged.push(frontendTitle);
    continue;
  }
  const saved = current
    ? await patchCourse(current.id, payload)
    : await postCourse({ ...payload, created_at: new Date().toISOString() });
  report[current ? "updated" : "created"].push({ title: frontendTitle, id: saved?.id || current?.id || null, sourceTitle });
}

console.log(JSON.stringify(report, null, 2));

function coursePayload(frontendTitle, sourceTitle, folderUrl, current = {}) {
  current ||= {};
  const category = categoryByTitle.get(frontendTitle) || current.category || "Jenovate Courses";
  const modules = defaultModules(frontendTitle, sourceTitle, folderUrl);
  const lessonCount = modules.reduce((sum, module) => sum + (module.lessons || []).length, 0);
  return {
    title: frontendTitle,
    description: current.description || `Build practical ${frontendTitle.toLowerCase()} skills with Jenovate's guided course resources, module checkpoints, and final assessment.`,
    category,
    duration: `${lessonCount} lessons / ${modules.length} modules`,
    module_type: "Drive lessons + module quizzes + final quiz",
    instructor_name: current.instructor_name || "Jenovate Mentor",
    price: COURSE_PRICE,
    difficulty: current.difficulty || "Beginner to Intermediate",
    modules,
    status: "active",
    deleted_at: null,
    is_featured: current.is_featured ?? true,
    is_my_course: current.is_my_course ?? false,
    created_by_admin: true,
    quiz_pass_score: 12,
    google_form_url: folderUrl,
    updated_at: new Date().toISOString(),
  };
}

function attachFolderToModules(modules, frontendTitle, sourceTitle, folderUrl) {
  const nextModules = JSON.parse(JSON.stringify(modules));
  const first = nextModules[0] || {};
  nextModules[0] = {
    ...first,
    source_title: first.source_title || sourceTitle,
    google_drive_link: folderUrl,
    drive_link: folderUrl,
    material_url: first.material_url || folderUrl,
    study_material_url: first.study_material_url || folderUrl,
    lessons: Array.isArray(first.lessons) && first.lessons.length
      ? first.lessons
      : defaultLessons(frontendTitle, sourceTitle, folderUrl),
  };
  if (!nextModules.some((module) => module.quiz?.questions?.length)) {
    nextModules[0].quiz = defaultQuiz(frontendTitle, false);
  }
  if (!nextModules.some((module) => String(module.type || module.title || "").toLowerCase().includes("final"))) {
    nextModules.push(finalModule(frontendTitle, nextModules.length + 1));
  }
  return nextModules;
}

function defaultModules(frontendTitle, sourceTitle, folderUrl) {
  const focus = moduleFocus(frontendTitle);
  const modules = focus.map((module, index) => ({
    id: `${slugify(frontendTitle)}-module-${index + 1}`,
    title: `Module ${index + 1}: ${module.title}`,
    description: module.description,
    type: "Recorded Lessons",
    order_index: index + 1,
    source_title: sourceTitle,
    google_drive_link: folderUrl,
    drive_link: folderUrl,
    material_url: folderUrl,
    study_material_url: folderUrl,
    lessons: module.lessons.map((lesson, lessonIndex) => ({
      id: `${slugify(frontendTitle)}-m${index + 1}-lesson-${lessonIndex + 1}`,
      title: `Lesson ${lessonIndex + 1}: ${lesson}`,
      description: `${lesson} for ${frontendTitle}, with guided practice from the official course folder.`,
      type: "video",
      content_type: "video",
      order_index: lessonIndex + 1,
      duration: `${18 + index * 3 + lessonIndex * 2} min`,
      drive_link: folderUrl,
      google_drive_link: folderUrl,
      video_drive_link: folderUrl,
      resource_url: folderUrl,
    })),
    quiz: defaultQuiz(frontendTitle, module.title, false),
  }));
  modules.push(finalModule(frontendTitle, modules.length + 1));
  return modules;
}

function defaultLessons(frontendTitle, sourceTitle, folderUrl) {
  return [{
    id: `${slugify(frontendTitle)}-drive-folder`,
    title: `${frontendTitle} Course Materials`,
    description: `Open the ${sourceTitle} Drive folder for the course lessons, notes, and practice resources.`,
    type: "resource",
    duration: "Self paced",
    drive_link: folderUrl,
    google_drive_link: folderUrl,
    resource_url: folderUrl,
  }];
}

function finalModule(frontendTitle, orderIndex) {
  return {
    id: `${slugify(frontendTitle)}-final-assessment`,
    title: `Module ${orderIndex}: Final Course Assessment`,
    description: `Final quiz to check the key ${frontendTitle} outcomes before course completion.`,
    type: "Final Course Quiz",
    order_index: orderIndex,
    lessons: [],
    quiz: defaultQuiz(frontendTitle, "Full Course Review", true),
  };
}

function defaultQuiz(frontendTitle, moduleTitle, finalQuiz) {
  return {
    id: `${slugify(frontendTitle)}-${finalQuiz ? "final" : slugify(moduleTitle)}-quiz`,
    title: finalQuiz ? `${frontendTitle} Final Course Quiz` : `${moduleTitle} Quiz`,
    pass_marks: 12,
    pass_score: 12,
    random_count: 15,
    timer_minutes: 20,
    max_attempts: 0,
    status: "published",
    questions: quizQuestions(frontendTitle, moduleTitle),
  };
}

function quizQuestions(frontendTitle, moduleTitle) {
  return [
    question(`What should you define first when starting ${moduleTitle} in ${frontendTitle}?`, "The learner goal and expected outcome"),
    question(`Which habit makes ${frontendTitle} practice stronger?`, "Practicing in stages and reviewing feedback"),
    question(`What makes a ${frontendTitle} portfolio task credible?`, "A clear problem, process, output, and reflection"),
    question(`How should you use the official Drive folder for ${frontendTitle}?`, "Follow lessons, notes, and practice resources in order"),
    question(`What should be checked before completing ${moduleTitle}?`, "Whether the result matches the objective"),
    question(`Why are module quizzes useful in ${frontendTitle}?`, "They confirm understanding before moving ahead"),
    question(`Which approach is best for learning ${frontendTitle}?`, "Build small working outputs and improve them"),
    question(`What should a learner document after a ${frontendTitle} task?`, "Steps taken, decisions made, and final result"),
    question(`What is the safest way to handle mistakes in ${frontendTitle}?`, "Review the cause and correct the workflow"),
    question(`What does completion readiness mean for ${moduleTitle}?`, "Lessons are reviewed and the quiz score meets the pass mark"),
    question(`How should feedback be used in ${frontendTitle}?`, "Apply it to improve the next version of the work"),
    question(`What makes a final course quiz different from casual revision?`, "It checks important outcomes across the course"),
    question(`Which score is required here to pass a 15-mark quiz?`, "At least 12 marks"),
    question(`What percentage does 12 out of 15 represent?`, "80 percent"),
    question(`Why is 12 out of 15 acceptable for the 75 percent rule?`, "It is higher than the minimum 75 percent requirement"),
  ];
}

function moduleFocus(frontendTitle) {
  const base = [
    ["Foundations and Setup", "Understand the core purpose, tools, and workflow before starting practice."],
    ["Core Concepts", "Learn the essential ideas and vocabulary used in real work."],
    ["Guided Practice", "Apply the concepts through structured examples and small tasks."],
    ["Project Workflow", "Connect the skill to a portfolio-ready project flow."],
    ["Review and Career Readiness", "Prepare the final output, review quality, and connect the learning to career use."],
  ];
  return base.map(([title, description], index) => ({
    title,
    description: `${description} Focus area: ${frontendTitle}.`,
    lessons: lessonNames(frontendTitle, title, index),
  }));
}

function lessonNames(frontendTitle, moduleTitle, index) {
  const compact = frontendTitle.replace(/\s+/g, " ").trim();
  const sets = [
    [`Introduction to ${compact}`, "Tools, access, and learning roadmap", "First guided practice"],
    [`${moduleTitle} concepts`, "Common terms and examples", "Checkpoint practice task"],
    ["Hands-on walkthrough", "Practice exercise with resources", "Review and improve your output"],
    ["Project planning", "Build the main course task", "Present and document the project"],
    ["Revision checklist", "Career use cases and interview talking points", "Final preparation"],
  ];
  return sets[index] || [`${compact} lesson`, "Practice task", "Review checkpoint"];
}

function question(prompt, answer) {
  return {
    question: prompt,
    marks: 1,
    options: [answer, "Skip the plan", "Only memorize names", "Ignore feedback"],
    answer,
  };
}

function courseMatches(course, frontendTitle, sourceTitle) {
  const slugs = new Set([frontendTitle, sourceTitle].map(slugify));
  slugs.add(slugify(course.title));
  return slugs.has(slugify(frontendTitle)) && (
    slugify(course.title) === slugify(frontendTitle)
    || slugify(course.title) === slugify(sourceTitle)
  );
}

function courseAlreadyMapped(course, payload, folderUrl) {
  return String(course.title || "") === payload.title
    && Number(String(course.price ?? "").replace(/[^0-9.]/g, "")) === COURSE_PRICE
    && String(course.status || "").toLowerCase() === "active"
    && !course.deleted_at
    && JSON.stringify(course.modules || []).includes(folderUrl);
}

async function loadEnv() {
  const source = await readFile(".env.local", "utf8");
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase URL or service-role key in .env.local");
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function request(path, options = {}) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function patchCourse(id, payload) {
  return writeCourse(`courses?id=eq.${encodeURIComponent(id)}&select=*`, "PATCH", payload);
}

async function postCourse(payload) {
  return writeCourse("courses?select=*", "POST", payload);
}

async function writeCourse(path, method, payload) {
  let body = { ...payload };
  const optionalKeys = ["module_type", "instructor_name", "difficulty", "is_featured", "is_my_course", "created_by_admin", "quiz_pass_score", "google_form_url", "updated_at", "created_at"];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const rows = await request(path, {
        method,
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      const missing = missingColumn(error);
      const key = missing || optionalKeys.find((item) => Object.hasOwn(body, item));
      if (!key) throw error;
      delete body[key];
    }
  }
  throw new Error("Unable to write course after removing optional columns.");
}

function missingColumn(error) {
  const message = String(error?.message || "");
  const quoted = message.match(/'([^']+)' column|column '([^']+)'|Could not find the '([^']+)' column/i);
  return quoted?.[1] || quoted?.[2] || quoted?.[3] || message.match(/column ([a-zA-Z0-9_]+) does not exist/i)?.[1] || "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\(iot\)/g, "iot")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
