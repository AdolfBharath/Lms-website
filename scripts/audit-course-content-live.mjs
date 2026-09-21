import { readFile } from "node:fs/promises";

const EXPECTED_COURSES = 29;
const REQUIRED_PASS_PERCENT = 75;

const env = await loadEnv();
const rows = await request("courses?select=title,price,status,deleted_at,modules,quiz_pass_score&order=title.asc");
const activeRows = rows.filter((row) => !row.deleted_at && !/archived|deleted|removed/i.test(String(row.status || "")));

const courseReports = activeRows.map((course) => {
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const learningModules = modules.filter((module) => Array.isArray(module.lessons) && module.lessons.length > 0);
  const lessons = learningModules.flatMap((module) => Array.isArray(module.lessons) ? module.lessons : []);
  const videoLessons = lessons.filter((lesson) => /video/i.test(String(lesson.content_type || lesson.type || "")));
  const folderVideoLinks = videoLessons.filter((lesson) => /drive\.google\.com\/drive\/folders\//i.test([
    lesson.video_drive_link,
    lesson.video_url,
    lesson.drive_link,
    lesson.google_drive_link,
  ].join(" ")));
  const fileVideoLinks = videoLessons.filter((lesson) => /drive\.google\.com\/file\/d\//i.test([
    lesson.video_drive_link,
    lesson.video_url,
    lesson.drive_link,
    lesson.google_drive_link,
  ].join(" ")));
  const lessonsMissingDescription = lessons.filter((lesson) => String(lesson.description || "").trim().length < 40);
  const lessonsMissingTitle = lessons.filter((lesson) => !String(lesson.title || "").trim());
  const estimatedDurations = lessons.filter((lesson) => /estimated/i.test(String(lesson.duration_status || lesson.durationStatus || "")));
  const quizzes = modules
    .map((module) => module.quiz)
    .filter((quiz) => Array.isArray(quiz?.questions) && quiz.questions.length > 0);
  const finalQuiz = quizzes.find((quiz) => /final/i.test(String(quiz.title || "")));
  const quizReports = quizzes.map((quiz) => {
    const totalMarks = quiz.questions.reduce((sum, question) => sum + Number(question.marks || 1), 0);
    const passMarks = Number(quiz.pass_marks ?? quiz.pass_score ?? course.quiz_pass_score ?? 0);
    const passPercent = totalMarks > 0 ? Math.round((passMarks / totalMarks) * 100) : 0;
    return { title: quiz.title, questions: quiz.questions.length, passMarks, totalMarks, passPercent };
  });
  return {
    title: course.title,
    price: Number(course.price || 0),
    modules: modules.length,
    learningModules: learningModules.length,
    lessons: lessons.length,
    videoLessons: videoLessons.length,
    fileVideoLinks: fileVideoLinks.length,
    folderVideoLinks: folderVideoLinks.length,
    lessonsMissingTitle: lessonsMissingTitle.length,
    lessonsMissingDescription: lessonsMissingDescription.length,
    estimatedDurations: estimatedDurations.length,
    quizzes: quizzes.length,
    finalQuiz: Boolean(finalQuiz),
    quizzesWithFifteenQuestions: quizReports.filter((quiz) => quiz.questions >= 15).length,
    minimumPassPercent: Math.min(...quizReports.map((quiz) => quiz.passPercent)),
    allQuizzesPass75: quizReports.every((quiz) => quiz.passPercent >= REQUIRED_PASS_PERCENT),
    errors: [
      activeRows.length !== EXPECTED_COURSES ? `Expected ${EXPECTED_COURSES} active courses, found ${activeRows.length}` : "",
      Number(course.price || 0) !== 5999 ? "Price is not INR 5,999" : "",
      modules.length < 2 ? "Course has fewer than two modules" : "",
      learningModules.length < 1 ? "Course has no learning module with lessons" : "",
      lessons.length < 1 ? "Course has no lessons" : "",
      videoLessons.length !== fileVideoLinks.length ? "Not every video lesson has a Drive file link" : "",
      folderVideoLinks.length ? "One or more video lessons still point to a Drive folder" : "",
      lessonsMissingTitle.length ? "One or more lessons are missing a title" : "",
      lessonsMissingDescription.length ? "One or more lessons are missing a meaningful description" : "",
      estimatedDurations.length ? "One or more lessons still use estimated duration" : "",
      quizzes.length < modules.length ? "One or more modules are missing a quiz" : "",
      quizReports.some((quiz) => quiz.questions < 15) ? "One or more quizzes have fewer than 15 questions" : "",
      !finalQuiz ? "Final course quiz is missing" : "",
      !quizReports.length || !quizReports.every((quiz) => quiz.passPercent >= REQUIRED_PASS_PERCENT) ? "One or more quizzes require less than 75 percent to pass" : "",
    ].filter(Boolean),
  };
});

const failures = courseReports.filter((course) => course.errors.length);

console.log(JSON.stringify({
  active_courses: activeRows.length,
  expected_courses: EXPECTED_COURSES,
  content_failures: failures,
  summary: courseReports.map((course) => ({
    title: course.title,
    price: course.price,
    modules: course.modules,
    learningModules: course.learningModules,
    lessons: course.lessons,
    videoLessons: course.videoLessons,
    fileVideoLinks: course.fileVideoLinks,
    estimatedDurations: course.estimatedDurations,
    quizzes: course.quizzes,
    finalQuiz: course.finalQuiz,
    minimumPassPercent: course.minimumPassPercent,
  })),
}, null, 2));

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

async function request(path) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
