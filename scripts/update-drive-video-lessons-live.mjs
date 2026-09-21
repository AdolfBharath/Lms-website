import { readFile } from "node:fs/promises";

const COURSE_VIDEO_FILES = {
  "Cloud Computing": [
    ["LECTURE 1 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1H1h4sR8voA1XumX0lL8F7p01bMbVUgMS/view?usp=drivesdk", 169186722],
    ["LECTURE 2 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1SOmp372TIkXQVSrn2P_Ff1NfGj5tHjGd/view?usp=drivesdk", 115133665],
    ["LECTURE 3 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1hroyMwetGKhaT2IcFMUyQdDFw8AsUMoF/view?usp=drivesdk", 175981519],
    ["LECTURE 4 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1j4-6503St8TaZ1fr61mLaE7-J_9SGJ9Z/view?usp=drivesdk", 153192083],
    ["LECTURE 5 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1ficRFPvqs0-AZevkKZt2sDcgd9ADIP1j/view?usp=drivesdk", 96020951],
    ["LECTURE 6 - Cloud Computing November.mp4", "https://drive.google.com/file/d/18E0K4Zi05lNV_YFRBIeTaJOukOHVDhko/view?usp=drivesdk", 125544848],
    ["LECTURE 7 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1UTEjFp3Zxtw2aBfvnUTgqzYwbgHCPwI_/view?usp=drivesdk", 120359466],
    ["LECTURE 8 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1m53ABy7Qv1MzEaezFVSwoJItcPsa73Ba/view?usp=drivesdk", 99327541],
    ["LECTURE 9 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1VtybVR5ao4UrRoy9w5DjGNnuq-bduVQ9/view?usp=drivesdk", 102458004],
    ["LECTURE 10 - Cloud Computing November.mp4", "https://drive.google.com/file/d/123e3DycMpVdjv4XrGEjV11znWj-pBcGQ/view?usp=drivesdk", 88419349],
    ["LECTURE 11 - Cloud Computing November.mp4", "https://drive.google.com/file/d/19scz7WuJdGTeHFmCRxFOK_25OR9GFMbl/view?usp=drivesdk", 94149255],
    ["LECTURE 12 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1zc7QzXLRzoI69jUhXllPdHnxJ1ksEfc9/view?usp=drivesdk", 77447307],
    ["LECTURE 13 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1f1jHlcUTOsve_l84MAge3puC04ZMfP9_/view?usp=drivesdk", 58072974],
    ["LECTURE 14A - Cloud Computing November.mp4", "https://drive.google.com/file/d/1v_MC_md4gQuq1hkip07LyPRCPWLQ2Qbl/view?usp=drivesdk", 6681311],
    ["LECTURE 14B - Cloud Computing November.mp4", "https://drive.google.com/file/d/1xneU2ntUKpcJMXk-iycD5E0wDmiaaMKk/view?usp=drivesdk", 85055085],
    ["LECTURE 16 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1H6cZy8hsO4OjMdkCjUx3le_LfYhhXKL6/view?usp=drivesdk", 120945275],
    ["LECTURE 17 - Cloud Computing November.mp4", "https://drive.google.com/file/d/1mWyd48Zkg_70WRdBpHPc9nOJiKs0glE3/view?usp=drivesdk", 92616147],
  ],
  "UI/UX": [
    ["LECTURE 1 - UI-UX.mp4", "https://drive.google.com/file/d/1D28Vt0CwC78Pwnq6g3mYKrpgxw7Xe4sB/view?usp=drivesdk", 84866592],
    ["LECTURE 2 - UI-UX.mp4", "https://drive.google.com/file/d/12kobeuylgBqGrasLpkS6UWiLXVNxONMN/view?usp=drivesdk", 90163078],
    ["LECTURE 3 - UI-UX.mp4", "https://drive.google.com/file/d/1BpQ2qxthCTIlDLPCQ01i9UX8DFZ6JNYf/view?usp=drivesdk", 104922521],
    ["LECTURE 4 - UI-UX.mp4", "https://drive.google.com/file/d/16n2i0BVkNKrfmqiFiM6d7iYA9Ij4Djpo/view?usp=drivesdk", 115246524],
    ["LECTURE 5 - UI-UX.mp4", "https://drive.google.com/file/d/1e-V769gu-lc1wd-e8P8WmL8PzilIZj8s/view?usp=drivesdk", 51344799],
    ["LECTURE 7 - UI-UX.mp4", "https://drive.google.com/file/d/1OjkU34ri7e36xn_yuvsp1Yew1l1c3DVR/view?usp=drivesdk", 121997054],
    ["LECTURE 8 - UI-UX.mp4", "https://drive.google.com/file/d/1XbHRux-xnr8LWfucFkBdIE9u4DLIwX-T/view?usp=drivesdk", 89853537],
    ["LECTURE 9 - UI-UX.mp4", "https://drive.google.com/file/d/1GSHn2SREX607-PM1qjQUTd1CXjy7ee_k/view?usp=drivesdk", 69964798],
    ["LECTURE 10 - UI-UX.mp4", "https://drive.google.com/file/d/15nxMQZy3cRP03YOT-5cdM2aR5A-oHKiq/view?usp=drivesdk", 117133454],
    ["LECTURE 11 - UI-UX.mp4", "https://drive.google.com/file/d/1EdQcnVppZpkX4zzceLON93qJKw0g-VFS/view?usp=drivesdk", 58410495],
    ["LECTURE 12 - UI-UX.mp4", "https://drive.google.com/file/d/1jvX_Gso6w0FcU51P9Q0bvVmbSWtj8Ppy/view?usp=drivesdk", 64720079],
    ["LECTURE 13 - UI-UX.mp4", "https://drive.google.com/file/d/1hGXTF4ZYbds6OuKe4klZgxWqGIV5SOIz/view?usp=drivesdk", 75547206],
    ["LECTURE 14 - UI-UX.mp4", "https://drive.google.com/file/d/1Z-EcPKuGJr99Ujd7zBxpziSDisGzmPQT/view?usp=drivesdk", 114299992],
    ["LECTURE 15 - UI-UX.mp4", "https://drive.google.com/file/d/1gDQrTRSMHnLT42KZ6FnCHi9fRmJZzwGV/view?usp=drivesdk", 98790285],
    ["LECTURE 16 - UI-UX.mp4", "https://drive.google.com/file/d/1YnbXNZL9kS6FHc8V9IVGl9Toox8Es1gW/view?usp=drivesdk", 98790285],
    ["LECTURE 17 - UI-UX.mp4", "https://drive.google.com/file/d/1jBayrjVuAyvy-bm4sZvz-QPR20GaORwK/view?usp=drivesdk", 71230925],
  ],
  "VLSI": [
    ["LECTURE 1 - VLSI May.mp4", "https://drive.google.com/file/d/1Lw84d3Bw1k5-Uc95Hv66fw5AJa5_Xs0E/view?usp=drivesdk", 60734881],
    ["LECTURE 2 - VLSI May.mp4", "https://drive.google.com/file/d/1nuHuj1EtYklK6N6-Wy_nssa_BjAlZiHW/view?usp=drivesdk", 55395902],
    ["LECTURE 3 - VLSI May.mp4", "https://drive.google.com/file/d/12BEpHyvMRBeocMh2Uob194DsP5MhE0k6/view?usp=drivesdk", 54406465],
    ["LECTURE 4 - VLSI May.mp4", "https://drive.google.com/file/d/1DrLpxoJVyGVKz2IllNAPsYa1AFR8dCo8/view?usp=drivesdk", 71202582],
    ["LECTURE 5 - VLSI May.mp4", "https://drive.google.com/file/d/1zGGTW_BMqhEl2UOZpRSKVc4IJiHNzfB7/view?usp=drivesdk", 68146042],
    ["LECTURE 6 - VLSI April.mp4", "https://drive.google.com/file/d/1SHnb7oy1g04n90-RbWqpI3jq3zcJcg0O/view?usp=drivesdk", 69731544],
    ["LECTURE 7 - VLSI May.mp4", "https://drive.google.com/file/d/1XDv0xrfnp32xlGBhHyGguZz7bcKHQT9K/view?usp=drivesdk", 127130242],
    ["LECTURE 8 - VLSI May.mp4", "https://drive.google.com/file/d/1KRv5w6kbqTo3c7mZvkom6lGpDPO5I5sq/view?usp=drivesdk", 103173368],
    ["LECTURE 9 - VLSI May.mp4", "https://drive.google.com/file/d/1uEyPZXASYRNFlI2DvpuA6itbz2WAfs1B/view?usp=drivesdk", 68919292],
    ["LECTURE 10 - VLSI May.mp4", "https://drive.google.com/file/d/1Zoe54OZVgHlvWb-JDtIhAMfjn8qJ0pAV/view?usp=drivesdk", 62102368],
    ["LECTURE 11 - VLSI May.mp4", "https://drive.google.com/file/d/1hHkNBy-3ApkFoOGKrnBtaVxOnzAh72cm/view?usp=drivesdk", 61651384],
    ["LECTURE 12 - VLSI May.mp4", "https://drive.google.com/file/d/1s1FBBXbGo06X_qspUl82UthdeDIDPrB6/view?usp=drivesdk", 51588576],
    ["LECTURE 13 - VLSI May.mp4", "https://drive.google.com/file/d/19WwK-f2IuB0-yOvTayFy4xDHXnGuV95B/view?usp=drivesdk", 53020430],
    ["LECTURE 14 - VLSI May.mp4", "https://drive.google.com/file/d/1HLXqd4z-7CHZFbcCmmvDdJsckjVHDMry/view?usp=drivesdk", 50363593],
    ["LECTURE 15 - VLSI May.mp4", "https://drive.google.com/file/d/1arK9vIwT4eXexk9OU0wGXTIuGO3E8hpd/view?usp=drivesdk", 53081774],
    ["LECTURE 16 - VLSI May.mp4", "https://drive.google.com/file/d/1otSBPBBwPyxlljT2Y_FRf24TD8idPv9r/view?usp=drivesdk", 53473296],
    ["LECTURE 17 - VLSI May.mp4", "https://drive.google.com/file/d/18jHIiSQaLtntr1tyskR2CpL5ID9RPYkV/view?usp=drivesdk", 38244950],
    ["LECTURE 18 - VLSI May.mp4", "https://drive.google.com/file/d/1sO7VXmIb8AZR_K4SOzCWESrDzSEGPPvV/view?usp=drivesdk", 65682818],
    ["LECTURE 19 - VLSI May.mp4", "https://drive.google.com/file/d/1H2R21FpjAbgJdZyhiPMJlTurWDEwj0gp/view?usp=drivesdk", 56985139],
  ],
  "Psychology": [
    ["Program Intro.mp4", "https://drive.google.com/file/d/1hgwRrMnqIbjkyxzh0M14s2pmcPe46wN9/view?usp=drivesdk", 9394597],
    ["S1-Introduction to Psychology By Suvidha.m4v", "https://drive.google.com/file/d/1uU8JZdoiWAusAi9rOPbw_QL0l_MW-orA/view?usp=drivesdk", 310880464],
    ["S2-Role of sleep in Mental Health by Archana.m4v", "https://drive.google.com/file/d/11kKAJl-g-WAD_LkSRKDSQBMGgxvRKIae/view?usp=drivesdk", 220707140],
    ["S3 - criminology by Suvidha.mp4", "https://drive.google.com/file/d/1fDclD2O7H5BmCQyALubu1U_tCSxDdBcW/view?usp=drivesdk", 256522005],
    ["S5-Cognitive Distortions and Student Mental Health By Archana_.mp4", "https://drive.google.com/file/d/1hFdq_hWennwrpGtOAHHeNN-xk0VTvWpx/view?usp=drivesdk", 316661869],
    ["S6.Psychology of Marketing by Suvidha.m4v", "https://drive.google.com/file/d/1KtBTTEWndsz3s0j5ox7okf1K6_Ksje33/view?usp=drivesdk", 388503733],
    ["S7-Psychosis By Suvidha.m4v", "https://drive.google.com/file/d/1QuQ4lMxbCdQ6Lip4xLfr4Iua8BGekqeH/view?usp=drivesdk", 521129340],
    ["S9-Personality Disorders By Suvidha.m4v", "https://drive.google.com/file/d/12WdBBNH_wQEQYT_yJZBqQiSgkSnu5qIp/view?usp=drivesdk", 158324836],
    ["S10-ADHD by Muskan.mp4", "https://drive.google.com/file/d/10ZzC2YmgEFf68kZerfV5Z_o3DHCxgLy5/view?usp=drivesdk", 86495906],
    ["S10-ADHD by Muskan_2.mp4", "https://drive.google.com/file/d/1uckIedFYT8I7Gm-5qQ_93gWBeYt4O2D-/view?usp=drivesdk", 86495906],
    ["S11-Emotional Regulation by Archana.m4v", "https://drive.google.com/file/d/1lz84i2-2SleHqwkcDyBizYgL4XxxdjHn/view?usp=drivesdk", 345645033],
    ["S12-Colour Psychology By Muskan.mp4", "https://drive.google.com/file/d/1ov4Vx66VuiPSybxrI6f6uhPPt2NH0DbO/view?usp=drivesdk", 81059800],
    ["S13- Conflict Resolution _ Negotiation by Muskan.mp4", "https://drive.google.com/file/d/1J_P_u1OOizP__hgMA9yKOtnQ_eB02ZP0/view?usp=drivesdk", 96387276],
    ["S14-Anxiety _ Overthinking by Muskan.m4v", "https://drive.google.com/file/d/1jgZBU-_BrhuoGX7MnA5xvuBCb7nYYXJN/view?usp=drivesdk", 317732847],
    ["S15-Substance Abuse By Muskan.m4v", "https://drive.google.com/file/d/12xx8EnsDereZKYsR-ooT-xZfjLkld40p/view?usp=drivesdk", 305949665],
    ["S16-Attachments _ boundaries by Muskan .m4v", "https://drive.google.com/file/d/1mlRU4D59p_AAO4IUoakoj572V-pQ7TgA/view?usp=drivesdk", 341864850],
    ["S17-Psychomatic Disorders by Muskan.m4v", "https://drive.google.com/file/d/17DhJxSaqFn-srGqtGnn5cNh8IIm00LUV/view?usp=drivesdk", 227025811],
    ["S18 Suicide Prevention By Muskan.m4v", "https://drive.google.com/file/d/1Iz2g7Y5jGaneLoLIQmZ6FZUa0WzL_-OB/view?usp=drivesdk", 294306163],
    ["Autism Spectrem Disorder.m4v", "https://drive.google.com/file/d/1go-w6niT45V8cWNclA4tkldxte2Jcfz_/view?usp=drivesdk", 272635658],
  ],
};

const COURSE_MODULES = {
  "Psychology": [
    "Psychology Foundations",
    "Mental Health and Cognitive Patterns",
    "Clinical Disorders and Symptoms",
    "Behavior, Relationships, and Communication",
    "Wellbeing, Risk, and Support",
  ],
};

const env = await loadEnv();
const updated = [];

for (const [title, files] of Object.entries(COURSE_VIDEO_FILES)) {
  const [course] = await request(`courses?select=*&title=eq.${encodeURIComponent(title)}&deleted_at=is.null`);
  if (!course) throw new Error(`Course not found: ${title}`);
  const modules = buildModules(title, files);
  await request(`courses?id=eq.${encodeURIComponent(course.id)}&select=id,title`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      modules,
      duration: `${files.length} video lessons / ${modules.length} modules`,
      module_type: "Drive video lessons + module quizzes + final quiz",
      quiz_pass_score: 12,
      updated_at: new Date().toISOString(),
    }),
  });
  updated.push({
    title,
    lessons: files.length,
    modules: modules.length,
    quizzes: modules.filter((module) => module.quiz?.questions?.length).length,
  });
}

console.log(JSON.stringify({ updated }, null, 2));

function buildModules(courseTitle, files) {
  const learningModules = COURSE_MODULES[courseTitle] || [
    "Foundations and Setup",
    "Core Concepts",
    "Guided Practice",
    "Applied Workflow",
    "Project and Review",
  ];
  const buckets = distribute(files, learningModules.length);
  const modules = learningModules.map((name, index) => ({
    id: `${slugify(courseTitle)}-module-${index + 1}`,
    title: `Module ${index + 1}: ${name}`,
    description: moduleDescription(courseTitle, name),
    type: "Recorded Video Lessons",
    order_index: index + 1,
    lessons: buckets[index].map(([fileName, url, size], lessonIndex) => ({
      id: `${slugify(courseTitle)}-m${index + 1}-lesson-${lessonIndex + 1}`,
      title: lessonTitle(fileName),
      description: lessonDescription(courseTitle, fileName, name),
      type: "video",
      content_type: "video",
      order_index: lessonIndex + 1,
      duration: estimateDuration(size),
      video_drive_link: url,
      video_url: url,
      drive_link: url,
      google_drive_link: url,
      resource_url: url,
    })),
    quiz: quizFor(courseTitle, name, false),
  }));
  modules.push({
    id: `${slugify(courseTitle)}-final-course-quiz`,
    title: `Module ${modules.length + 1}: Final Course Assessment`,
    description: `Final quiz covering the complete ${courseTitle} course.`,
    type: "Final Course Quiz",
    order_index: modules.length + 1,
    lessons: [],
    quiz: quizFor(courseTitle, "Full Course Review", true),
  });
  return modules;
}

function distribute(files, count) {
  const buckets = Array.from({ length: Math.min(count, files.length) }, () => []);
  files.forEach((file, index) => buckets[index % buckets.length].push(file));
  return buckets;
}

function lessonTitle(fileName) {
  const cleaned = String(fileName || "Lesson")
    .replace(/\.(mp4|mov|webm|mkv)$/i, "")
    .replace(/^S(\d+)\s*[-._]?\s*/i, "")
    .replace(/\s+by\s+[a-z ]+$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^LECTURE/i, "Lecture");
  return titleCase(cleaned)
    .replace(/\bUi-Ux\b/g, "UI/UX")
    .replace(/\bAdhd\b/g, "ADHD")
    .replace(/\bPsychomatic\b/g, "Psychosomatic")
    .replace(/\bSpectrem\b/g, "Spectrum");
}

function lessonDescription(courseTitle, fileName, moduleName) {
  const title = lessonTitle(fileName);
  return `${title} introduces the key ideas signalled by the original course video title and places them inside the ${moduleName.toLowerCase()} module. Learners should watch this lesson to understand the main concept, note important terminology, and connect the topic to the surrounding ${courseTitle} lessons. This description is generated from Drive metadata only; the video was not downloaded.`;
}

function moduleDescription(courseTitle, moduleName) {
  return `${moduleName} lessons for ${courseTitle}, grouped from the available Drive video sequence and followed by a quiz to check understanding before moving ahead.`;
}

function quizFor(courseTitle, moduleName, finalQuiz) {
  const topic = finalQuiz ? `${courseTitle} full course` : `${courseTitle} ${moduleName}`;
  return {
    id: `${slugify(courseTitle)}-${finalQuiz ? "final" : slugify(moduleName)}-quiz`,
    title: finalQuiz ? `${courseTitle} Final Course Quiz` : `${moduleName} Quiz`,
    pass_marks: 12,
    pass_score: 12,
    random_count: 15,
    max_attempts: 0,
    timer_minutes: finalQuiz ? 25 : 20,
    status: "published",
    questions: Array.from({ length: 15 }, (_, index) => ({
      id: `${slugify(courseTitle)}-${finalQuiz ? "final" : slugify(moduleName)}-q${index + 1}`,
      question: questionText(topic, index),
      option_a: "Review the lesson goal, apply the concept, and validate the result",
      option_b: "Skip the lesson and only attempt the final quiz",
      option_c: "Memorize terms without practice or review",
      option_d: "Ignore mistakes and continue without checking",
      answer: "A",
      marks: 1,
    })),
  };
}

function questionText(topic, index) {
  const stems = [
    `What is the best first step when learning ${topic}?`,
    `Which habit shows strong understanding of ${topic}?`,
    `How should a learner handle mistakes while practicing ${topic}?`,
    `What makes ${topic} useful in a real project?`,
    `Why should learners review examples from ${topic}?`,
  ];
  return stems[index % stems.length];
}

function estimateDuration(size) {
  const minutes = Math.max(12, Math.min(45, Math.round(Number(size || 0) / 4_500_000)));
  return `${minutes} min`;
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

function slugify(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function titleCase(value) {
  return String(value || "").replace(/\w\S*/g, (word) => {
    if (/^(AI|UI|UX|VLSI|ADHD|IoT)$/i.test(word)) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}
