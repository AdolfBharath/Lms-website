import { readFile } from "node:fs/promises";

const QUIZ_PATH = "course/7. Healthcare & Human Sciences/psychology-video-quiz-questions.md";
const COURSE_TITLE = "Psychology";

const env = await loadEnv();
const markdown = await readFile(QUIZ_PATH, "utf8");
const quizSections = parseQuizMarkdown(markdown);

const [course] = await request(`courses?select=*&title=eq.${encodeURIComponent(COURSE_TITLE)}&deleted_at=is.null`);
if (!course) throw new Error(`Course not found: ${COURSE_TITLE}`);

const modules = Array.isArray(course.modules) ? structuredClone(course.modules) : [];
if (!modules.length) throw new Error(`${COURSE_TITLE} has no modules to update.`);

const moduleQuizSections = quizSections.filter((section) => /^Module\s+\d+:/i.test(section.heading));
const finalQuizSection = quizSections.find((section) => /^Final\b/i.test(section.heading));
const learningModules = modules.filter((module) => Array.isArray(module.lessons) && module.lessons.length > 0);
const finalModule = modules.find((module) => /final/i.test(`${module.title || ""} ${module.type || ""}`));

moduleQuizSections.forEach((section, index) => {
  const target = learningModules[index] || modules[index];
  if (!target) return;
  target.quiz = buildQuiz(section, false, index + 1);
});

if (finalQuizSection) {
  const target = finalModule || modules[modules.length - 1];
  target.quiz = buildQuiz(finalQuizSection, true, modules.indexOf(target) + 1);
  target.title = target.title || `Module ${modules.indexOf(target) + 1}: Final Course Assessment`;
  target.type = target.type || "Final Course Quiz";
  target.lessons = Array.isArray(target.lessons) ? target.lessons : [];
}

await request(`courses?id=eq.${encodeURIComponent(course.id)}&select=id,title`, {
  method: "PATCH",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    modules,
    module_type: "Drive video lessons + module quizzes + final quiz",
    quiz_pass_score: 12,
    updated_at: new Date().toISOString(),
  }),
});

const quizSummary = modules
  .map((module) => ({
    module: module.title,
    questions: module.quiz?.questions?.length || 0,
    quiz: module.quiz?.title || null,
  }))
  .filter((row) => row.questions > 0);

console.log(JSON.stringify({
  updated: true,
  course: { id: course.id, title: course.title },
  quizzesApplied: quizSummary.length,
  totalQuestions: quizSummary.reduce((sum, row) => sum + row.questions, 0),
  quizSummary,
}, null, 2));

function parseQuizMarkdown(source) {
  const sections = [];
  const headingPattern = /^##\s+(.+)$/gm;
  const headings = [...source.matchAll(headingPattern)];

  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    const body = source.slice(start, end);
    const questions = parseQuestions(body, slugify(heading[1]));
    if (questions.length) sections.push({ heading: heading[1].trim(), questions });
  });

  return sections;
}

function parseQuestions(body, sectionSlug) {
  const blocks = [];
  const questionPattern = /^\s*(\d+)\.\s+([\s\S]*?)(?=^\s*\d+\.\s+|\s*$)/gm;
  for (const match of body.matchAll(questionPattern)) {
    const number = Number(match[1]);
    const block = match[2].trim();
    const lines = block.split(/\r?\n/);
    const question = lines[0].trim();
    const option = (letter) => {
      const found = block.match(new RegExp(`^\\s*-\\s*${letter}\\.\\s*(.+)$`, "mi"));
      return found?.[1]?.trim() || "";
    };
    const answer = block.match(/^\s*-\s*Answer:\s*([A-D])/mi)?.[1] || "A";
    if (!question || !option("A")) continue;
    blocks.push({
      id: `${sectionSlug}-q${String(number).padStart(2, "0")}`,
      question,
      option_a: option("A"),
      option_b: option("B"),
      option_c: option("C"),
      option_d: option("D"),
      answer,
      marks: 1,
    });
  }
  return blocks;
}

function buildQuiz(section, finalQuiz, moduleIndex) {
  return {
    id: finalQuiz ? "psychology-final-course-quiz" : `psychology-module-${moduleIndex}-quiz`,
    title: finalQuiz ? "Psychology Final Course Quiz" : `${section.heading.replace(/^Module\s+\d+:\s*/i, "")} Quiz`,
    pass_marks: 12,
    pass_score: 12,
    pass_percent: 75,
    random_count: Math.min(15, section.questions.length),
    max_attempts: 0,
    timer_minutes: finalQuiz ? 25 : 20,
    status: "published",
    questions: section.questions,
  };
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
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
