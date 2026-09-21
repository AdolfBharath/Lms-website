import { readFile } from "node:fs/promises";

const DRIVE_FOLDERS = [
  ["Cloud Computing", ["Cloud Computing"], "https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing"],
  ["UI/UX", ["UI/UX", "UI & UX"], "https://drive.google.com/drive/folders/11Yr3YAr08RGJO-jzLFj8HReSOBvWTZIl?usp=sharing"],
  ["DevOps", ["DevOps"], "https://drive.google.com/drive/folders/15gadcdvPYm49DqGitAjkhGFiHey3j-Mz?usp=sharing"],
  ["Software Engineering", ["Software Engineering"], "https://drive.google.com/drive/folders/15ledKjEvaQZejuPFCtyYT-mjVL0qbcvA?usp=sharing"],
  ["Machine Learning", ["Machine Learning"], "https://drive.google.com/drive/folders/16CWc_r-v_ULruaeDLAGJ1mR9UZUivR8F?usp=sharing"],
  ["Data Analysis", ["Data Analysis"], "https://drive.google.com/drive/folders/1BbFscYvRsVAd7hv9r5thNZfVO7ewrlEg?usp=sharing"],
  ["Programming in Java", ["Programming in Java"], "https://drive.google.com/drive/folders/1F3CrGVSqLXaqJ_sbq4ykEuX23cqa2TKI?usp=sharing"],
  ["Medical Coding", ["Medical Coding"], "https://drive.google.com/drive/folders/1JXWO2to6m2pvB3qiotvfPWKrEaJQeiZl?usp=sharing"],
  ["VLSI", ["VLSI"], "https://drive.google.com/drive/folders/1Jj_wJ0bsa2qbGmLh_LqSnPPYCB-pQgfb?usp=sharing"],
  ["Hybrid Electric Vehicle", ["Hybrid Electric Vehicle"], "https://drive.google.com/drive/folders/1KuADy67y_nJ1tCkqwjQtxQAEdTXJLdd7?usp=sharing"],
  ["Finance", ["Finance"], "https://drive.google.com/drive/folders/1LO8boETjLwr4FYaXsCaKuLgKhXKEKjk7?usp=sharing"],
  ["Artificial Intelligence", ["Artificial Intelligence"], "https://drive.google.com/drive/folders/1NmgBLbRCLXrk35VreMAEgHoT6r84TVfS?usp=sharing"],
  ["Digital Marketing", ["Digital Marketing"], "https://drive.google.com/drive/folders/1OZ-MjVMGc9whIpJQUvnPam0huZVkQ33h?usp=sharing"],
  ["AI (Agentic & Generative)", ["AI (Agentic & Generative)", "Generative AI"], "https://drive.google.com/drive/folders/1TeVRLfI8WwK8OxLTTi1A_1itAIkFfJpv?usp=sharing"],
  ["Stock Marketing", ["Stock Marketing", "Stock Marketing 1"], "https://drive.google.com/drive/folders/1XNAyp4votkjTjci5q0_wekq94umZlFPY?usp=sharing"],
  ["Programming in Python", ["Programming in Python"], "https://drive.google.com/drive/folders/1aSIqp5LjHQ2JzdFAk_8-hTfrG41qrA9L?usp=sharing"],
  ["Embedded Systems", ["Embedded Systems", "Embedded System"], "https://drive.google.com/drive/folders/1aiK0DfAYtpYfvscV4LUE1ktrleExBcX4?usp=sharing"],
  ["Business Analysis", ["Business Analysis"], "https://drive.google.com/drive/folders/1dFBfz7FMDdqVfTpYJSF_DBbaylVc4W_w?usp=sharing"],
  ["Artificial Intelligence and Machine Learning", ["Artificial Intelligence and Machine Learning"], "https://drive.google.com/drive/folders/1f0UAROvkvw8oFEgwOr9VPwHElhzWu-KX?usp=sharing"],
  ["Cyber Security & Ethical Hacking", ["Cyber Security & Ethical Hacking", "Cyber Security"], "https://drive.google.com/drive/folders/1k3NRENi0QoxXgR8t7vAW_lwG1ngXBUYv?usp=sharing"],
  ["Full-Stack Web Development", ["Full-Stack Web Development", "Full Stack Web Development"], "https://drive.google.com/drive/folders/1k8rcbzMrHlRNKc0mfMaztLUbb-0mVCi0?usp=sharing"],
  ["AutoCAD", ["AutoCAD"], "https://drive.google.com/drive/folders/1ocTBcRpXVEKnOBiHiO6NzTMhjkfTcKSG?usp=sharing"],
  ["Internet of Things (IoT)", ["Internet of Things (IoT)", "Internet of Things"], "https://drive.google.com/drive/folders/1pkW1Hb2BhnGsl0B8dBSXGzr51NxPVlix?usp=sharing"],
  ["Human Resource Management", ["Human Resource Management"], "https://drive.google.com/drive/folders/1rWrwcCjQ0Ie8FXsvD-8zr7_DeLa_bKuj?usp=sharing"],
  ["Startup & Entrepreneurship", ["Startup & Entrepreneurship", "Startup and Entrepreneurship"], "https://drive.google.com/drive/folders/1rrTykQiciDU0dkgPyxFtp4XI7p2vWW7-?usp=sharing"],
  ["DSA with Python", ["DSA with Python", "Data Structures & Algorithms"], "https://drive.google.com/drive/folders/1ubOtVVM5v0QE_e_kjTptLuBQgEmXeFvb?usp=sharing"],
  ["Psychology", ["Psychology"], "https://drive.google.com/drive/folders/1w8Ca4LjrbvIaCW6FNV85FAykpUIwwdp8?usp=sharing"],
  ["IoT & Robotics", ["IoT & Robotics", "IOT & Robotics"], "https://drive.google.com/drive/folders/1xAHnYz7I_xppMvqgk2tnzKh8S19zLy3g?usp=sharing"],
  ["Front-End Web Development", ["Front-End Web Development"], "https://drive.google.com/drive/folders/1xxQ2b9FSzy_noq2k_z9rykPQEQ4lsbfU?usp=sharing"],
];

const MODULE_TRACKS = {
  "Cloud Computing": ["Cloud Foundations", "Virtualization and Infrastructure", "Cloud Services", "Deployment Practice", "Operations and Review"],
  "UI/UX": ["Design Foundations", "User Research and Flows", "Interface Design", "Prototyping Practice", "Portfolio Review"],
  "DevOps": ["DevOps Foundations", "Source Control and Automation", "CI/CD and Containers", "Cloud Deployment", "Monitoring and Release Review"],
  "Software Engineering": ["Engineering Foundations", "Planning and Requirements", "Design and Implementation", "Testing and Quality", "Project Review"],
  "Machine Learning": ["ML Foundations", "Data Preparation", "Model Training", "Model Evaluation", "Applied ML Practice"],
  "Data Analysis": ["Analysis Foundations", "Data Cleaning", "Exploratory Analysis", "Visualization and Reporting", "Case Study Review"],
  "Programming in Java": ["Java Foundations", "Control Flow and Methods", "Object-Oriented Java", "Collections and Files", "Project Practice"],
  "Medical Coding": ["Medical Coding Foundations", "Clinical Documentation", "Code Sets and Guidelines", "Billing Workflow", "Coding Practice Review"],
  "VLSI": ["VLSI Foundations", "Digital Design Concepts", "HDL and Simulation", "Physical Design Workflow", "Project Review"],
  "Hybrid Electric Vehicle": ["HEV Foundations", "Powertrain Systems", "Battery and Motor Control", "Vehicle Integration", "Diagnostics and Review"],
  "Finance": ["Finance Foundations", "Markets and Instruments", "Analysis and Valuation", "Risk and Planning", "Applied Finance Review"],
  "Artificial Intelligence": ["AI Foundations", "Search and Reasoning", "Data and Models", "Applied AI Workflows", "Project Review"],
  "AI (Agentic & Generative)": ["Generative AI Foundations", "Prompting and Models", "Agentic Workflows", "Applied GenAI Builds", "Responsible AI Review"],
  "Digital Marketing": ["Marketing Foundations", "Content and Channels", "SEO and Analytics", "Campaign Execution", "Growth Review"],
  "Stock Marketing": ["Market Foundations", "Technical Basics", "Trading Strategies", "Risk Management", "Market Review"],
  "Programming in Python": ["Python Foundations", "Control Flow and Functions", "Data Structures", "Files and Libraries", "Project Practice"],
  "Embedded Systems": ["Embedded Foundations", "Microcontrollers and IO", "Sensors and Communication", "Firmware Practice", "System Review"],
  "Business Analysis": ["BA Foundations", "Requirements and Stakeholders", "Process Modeling", "Documentation and Tools", "Case Study Review"],
  "Artificial Intelligence and Machine Learning": ["AI/ML Foundations", "Data and Features", "Learning Algorithms", "Model Evaluation", "Applied Project Review"],
  "Cyber Security & Ethical Hacking": ["Security Foundations", "Networks and Threats", "Ethical Hacking Tools", "Defensive Practice", "Security Review"],
  "Full-Stack Web Development": ["Web Foundations", "Frontend Development", "Backend APIs", "Database and Auth", "Full-Stack Project"],
  "AutoCAD": ["AutoCAD Foundations", "Drawing Tools", "Drafting Practice", "Layouts and Annotation", "Design Review"],
  "Internet of Things (IoT)": ["IoT Foundations", "Devices and Sensors", "Connectivity and Data", "IoT Applications", "Project Review"],
  "Human Resource Management": ["HR Foundations", "Hiring and Onboarding", "Performance and Policy", "Employee Engagement", "HR Case Review"],
  "Startup & Entrepreneurship": ["Startup Foundations", "Market and Customer Discovery", "Business Models", "Pitch and Funding", "Venture Review"],
  "DSA with Python": ["DSA Foundations", "Linear Data Structures", "Algorithms and Complexity", "Problem Solving Practice", "Interview Review"],
  "Psychology": ["Psychology Foundations", "Mental Health and Cognitive Patterns", "Clinical Disorders and Symptoms", "Behavior and Communication", "Wellbeing and Support"],
  "IoT & Robotics": ["IoT and Robotics Foundations", "Sensors and Actuators", "Control and Automation", "Robotics Integration", "Build Review"],
  "Front-End Web Development": ["Frontend Foundations", "HTML and CSS", "JavaScript Interactions", "Responsive Interfaces", "Frontend Project"],
};

const env = await loadEnv();
const courses = await request("courses?select=*&deleted_at=is.null");
const courseByTitle = new Map(courses.map((course) => [normalize(course.title), course]));
const report = [];

for (const [targetTitle, aliases, folderUrl] of DRIVE_FOLDERS) {
  const course = aliases.map((alias) => courseByTitle.get(normalize(alias))).find(Boolean);
  if (!course) {
    report.push({ course: targetTitle, videosFound: 0, videosImported: 0, modulesCreated: 0, errors: ["Course row not found"] });
    continue;
  }

  const videos = await listDriveVideos(folderUrl);
  if (!videos.length) {
    report.push({ course: course.title, videosFound: 0, videosImported: 0, modulesCreated: 0, errors: ["No video files found in Drive folder"] });
    continue;
  }

  const modules = buildModules(course.title, videos, folderUrl);
  await request(`courses?id=eq.${encodeURIComponent(course.id)}&select=id,title`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      modules,
      duration: `${videos.length} video lessons / ${modules.length} modules`,
      module_type: "Drive video lessons + module quizzes + final quiz",
      quiz_pass_score: 12,
      updated_at: new Date().toISOString(),
    }),
  });

  report.push({
    course: course.title,
    videosFound: videos.length,
    videosImported: videos.length,
    modulesCreated: modules.length,
    lessonsCreated: videos.length,
    videosSkipped: 0,
    videosRequiringReview: videos.length,
    duplicatesDetected: videos.length - new Set(videos.map((video) => video.id)).size,
    errors: [],
  });
}

const totals = report.reduce((summary, row) => {
  summary.totalVideos += row.videosFound || 0;
  summary.totalModules += row.modulesCreated || 0;
  summary.totalLessons += row.lessonsCreated || 0;
  summary.videosRequiringReview += row.videosRequiringReview || 0;
  summary.errors += row.errors?.length || 0;
  return summary;
}, { totalCourses: DRIVE_FOLDERS.length, totalVideos: 0, totalModules: 0, totalLessons: 0, videosRequiringReview: 0, errors: 0 });

console.log(JSON.stringify({ report, totals }, null, 2));
if (report.some((row) => row.errors?.length)) process.exitCode = 1;

async function listDriveVideos(folderUrl) {
  const response = await fetch(folderUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`Drive folder fetch failed ${response.status} for ${folderUrl}`);
  const html = await response.text();
  const records = new Map();

  for (const match of html.matchAll(/\\x5b\\x22([^"\\]+)\\x22,\\x5b\\x22([^"\\]+)\\x22\\x5d,\\x22([^"\\]+?\\.(?:mp4|m4v|mov|webm|mkv))\\x22,\\x22video\\\/[^"\\]+\\x22,[\s\S]{0,320}?null,(\d{5,})/gi)) {
    const [, id, , encodedTitle, size] = match;
    records.set(id, {
      id,
      title: decodeDriveText(encodedTitle),
      size: Number(size),
      url: `https://drive.google.com/file/d/${id}/view?usp=drivesdk`,
    });
  }

  for (const match of html.matchAll(/aria-label="([^"]+?\.(?:mp4|m4v|mov|webm|mkv)) Video(?: Shared)?"[\s\S]{0,900}?data-id="([^"]+)"/gi)) {
    const [, title, id] = match;
    records.set(id, {
      id,
      title: decodeHtml(title),
      size: records.get(id)?.size || 0,
      url: `https://drive.google.com/file/d/${id}/view?usp=drivesdk`,
    });
  }

  return [...records.values()].sort(videoSort);
}

function buildModules(courseTitle, videos, folderUrl) {
  const track = MODULE_TRACKS[courseTitle] || ["Foundations", "Core Concepts", "Guided Practice", "Applied Workflow", "Review"];
  const moduleCount = Math.min(track.length, Math.max(1, Math.ceil(videos.length / 4)));
  const selectedTrack = track.slice(0, moduleCount);
  const buckets = contiguousBuckets(videos, moduleCount);
  const modules = selectedTrack.map((name, index) => ({
    id: `${slugify(courseTitle)}-module-${index + 1}`,
    title: `Module ${index + 1}: ${name}`,
    description: `${name} for ${courseTitle}, grouped from the Drive video sequence. Content descriptions are based on available Drive metadata because videos were not downloaded or transcribed.`,
    type: "Recorded Video Lessons",
    order_index: index + 1,
    source_folder_url: folderUrl,
    lessons: buckets[index].map((video, lessonIndex) => ({
      id: `${slugify(courseTitle)}-${video.id}`,
      external_video_id: video.id,
      drive_video_id: video.id,
      title: lessonTitle(video.title, courseTitle),
      description: lessonDescription(courseTitle, video.title, name),
      type: "video",
      content_type: "video",
      order_index: lessonIndex + 1,
      duration: "",
      duration_status: "requires_source_duration",
      video_drive_link: video.url,
      video_url: video.url,
      drive_link: video.url,
      google_drive_link: video.url,
      resource_url: video.url,
      source_file_name: video.title,
      source_file_size: video.size || null,
      requires_admin_review: true,
    })),
    quiz: quizFor(courseTitle, name, false),
  }));

  modules.push({
    id: `${slugify(courseTitle)}-final-course-quiz`,
    title: `Module ${modules.length + 1}: Final Course Assessment`,
    description: `Final quiz covering the complete ${courseTitle} course. Learners must score at least 75 percent to pass.`,
    type: "Final Course Quiz",
    order_index: modules.length + 1,
    lessons: [],
    quiz: quizFor(courseTitle, "Full Course Review", true),
  });
  return modules;
}

function contiguousBuckets(items, count) {
  const buckets = [];
  const size = Math.ceil(items.length / count);
  for (let index = 0; index < count; index += 1) {
    buckets.push(items.slice(index * size, (index + 1) * size));
  }
  return buckets.filter((bucket) => bucket.length);
}

function lessonTitle(fileName, courseTitle) {
  const cleaned = String(fileName || "Lesson")
    .replace(/\.(mp4|m4v|mov|webm|mkv)$/i, "")
    .replace(/^S(\d+)\s*[-._]?\s*/i, "")
    .replace(/^LECTURE\s*(\d+[A-Z]?)\s*[-._]?\s*/i, "Lesson $1: ")
    .replace(/\s+by\s+[a-z ]+$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(new RegExp(`\\s*-?\\s*${escapeRegExp(courseTitle)}\\s*`, "i"), "")
    .replace(/\s+(January|February|March|April|May|June|July|August|September|October|November|December)$/i, "");
  const titled = titleCase(cleaned || courseTitle);
  return titled
    .replace(/\bUi\b/g, "UI")
    .replace(/\bUx\b/g, "UX")
    .replace(/\bIot\b/g, "IoT")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bMl\b/g, "ML")
    .replace(/\bDsa\b/g, "DSA")
    .replace(/\bVlsi\b/g, "VLSI")
    .replace(/\bAdhd\b/g, "ADHD")
    .replace(/\bPsychomatic\b/g, "Psychosomatic")
    .replace(/\bSpectrem\b/g, "Spectrum");
}

function lessonDescription(courseTitle, fileName, moduleName) {
  const title = lessonTitle(fileName, courseTitle);
  return `${title} belongs to the ${moduleName} section of ${courseTitle}. Learners should use this lesson to follow the recorded sequence, capture the key terms presented in the video, and connect the topic with the surrounding lessons in the module. This description is generated from Google Drive metadata only; the video was not downloaded or transcribed, so it is flagged for admin review.`;
}

function quizFor(courseTitle, moduleName, finalQuiz) {
  const topic = finalQuiz ? `${courseTitle} full course` : `${courseTitle} ${moduleName}`;
  return {
    id: `${slugify(courseTitle)}-${finalQuiz ? "final" : slugify(moduleName)}-quiz`,
    title: finalQuiz ? `${courseTitle} Final Course Quiz` : `${moduleName} Quiz`,
    pass_marks: 12,
    pass_score: 12,
    pass_percent: 75,
    random_count: 15,
    max_attempts: 0,
    timer_minutes: finalQuiz ? 25 : 20,
    status: "published",
    questions: Array.from({ length: 15 }, (_, index) => ({
      id: `${slugify(courseTitle)}-${finalQuiz ? "final" : slugify(moduleName)}-q${index + 1}`,
      question: questionText(topic, index),
      option_a: "Review the relevant lesson, apply the concept, and validate the result",
      option_b: "Skip the video and continue without checking understanding",
      option_c: "Guess answers without reviewing the module",
      option_d: "Ignore mistakes and move to the next topic",
      answer: "A",
      marks: 1,
    })),
  };
}

function questionText(topic, index) {
  const stems = [
    `What is the best way to begin learning ${topic}?`,
    `Which action shows strong understanding of ${topic}?`,
    `How should a learner handle mistakes while practicing ${topic}?`,
    `What makes ${topic} useful in practical work?`,
    `Why should learners review examples from ${topic}?`,
  ];
  return stems[index % stems.length];
}

function estimateDuration(size) {
  if (!size) return "Duration unavailable";
  const minutes = Math.max(8, Math.min(60, Math.round(Number(size) / 4_500_000)));
  return `${minutes} min`;
}

function videoSort(a, b) {
  return videoOrder(a.title) - videoOrder(b.title) || a.title.localeCompare(b.title);
}

function videoOrder(title) {
  const match = String(title || "").match(/(?:LECTURE|LESSON|S)\s*[-_. ]*(\d+)/i);
  return match ? Number(match[1]) : 9999;
}

function decodeDriveText(value) {
  return decodeHtml(String(value || "").replace(/\\x([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function titleCase(value) {
  return String(value || "").replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function request(path, init = {}) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
