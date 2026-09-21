import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const outDir = path.resolve("other-than-working-files", "proof-screenshots");
const env = await loadEnv();
const accounts = {
  student: { email: process.env.QA_STUDENT_EMAIL || "student1@gmail.com", password: process.env.QA_STUDENT_PASSWORD || "12345678" },
  mentor: { email: process.env.QA_MENTOR_EMAIL || "mentor1@gmail.com", password: process.env.QA_MENTOR_PASSWORD || "12345678" },
  admin: { email: process.env.QA_ADMIN_EMAIL || "admin@jenovate.in", password: process.env.QA_ADMIN_PASSWORD || "Temp@12345" },
};
const stamp = `Proof ${new Date().toISOString().replace(/[:.]/g, "-")}`;
const cleanup = { chats: [], questions: [], tickets: [] };

await mkdir(outDir, { recursive: true });

try {
  const proof = await seedProofData();
  const browser = await chromium.launch();
  const shots = {};
  try {
    const mentorPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await loginUi(mentorPage, accounts.mentor.email, accounts.mentor.password, "mentor.html");
    await openView(mentorPage, "chat");
    await mentorPage.locator("#chatFeed").waitFor({ state: "visible", timeout: 15000 });
    await mentorPage.locator(`[data-chat-batch="${proof.batchId}"]`).click({ timeout: 15000 }).catch(() => {});
    await mentorPage.locator("#chatFeed").getByText(proof.chatMessage).waitFor({ state: "visible", timeout: 15000 });
    shots.mentorChat = path.join(outDir, "mentor-batch-chat-proof.png");
    await mentorPage.screenshot({ path: shots.mentorChat, fullPage: true });

    await openView(mentorPage, "questions");
    await mentorPage.locator("#questionsList").getByText(proof.questionTitle).waitFor({ state: "visible", timeout: 15000 });
    shots.mentorQuestions = path.join(outDir, "mentor-questions-proof.png");
    await mentorPage.screenshot({ path: shots.mentorQuestions, fullPage: true });

    await openView(mentorPage, "support");
    shots.mentorSupport = path.join(outDir, "mentor-support-isolation-proof.png");
    await mentorPage.screenshot({ path: shots.mentorSupport, fullPage: true });
    await mentorPage.close();

    const studentPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await loginUi(studentPage, accounts.student.email, accounts.student.password, "student.html");
    await openView(studentPage, "batch");
    await studentPage.locator("#chatList").getByText(proof.chatMessage).waitFor({ state: "visible", timeout: 15000 });
    shots.studentBatch = path.join(outDir, "student-batch-chat-proof.png");
    await studentPage.screenshot({ path: shots.studentBatch, fullPage: true });

    await openView(studentPage, "questions");
    await studentPage.getByText(proof.questionTitle).waitFor({ state: "visible", timeout: 15000 });
    await studentPage.getByText(proof.questionReply).waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    shots.studentQuestions = path.join(outDir, "student-questions-proof.png");
    await studentPage.screenshot({ path: shots.studentQuestions, fullPage: true });

    await openView(studentPage, "support");
    await studentPage.getByText(proof.ticketSubject).waitFor({ state: "visible", timeout: 15000 });
    shots.studentSupport = path.join(outDir, "student-support-ticket-proof.png");
    await studentPage.screenshot({ path: shots.studentSupport, fullPage: true });
    await studentPage.close();
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ status: "PASS", screenshots: shots, proof }, null, 2));
} finally {
  await cleanupRows().catch((error) => console.warn(`Cleanup warning: ${error.message}`));
}

async function seedProofData() {
  const studentSession = await passwordSession(accounts.student.email, accounts.student.password);
  const mentorSession = await passwordSession(accounts.mentor.email, accounts.mentor.password);
  const student = await ownUser(studentSession.access_token, accounts.student.email);
  const mentor = await ownUser(mentorSession.access_token, accounts.mentor.email);
  const studentBatches = await table("batches", "select=id,name,course_id,status,deleted_at", studentSession.access_token);
  const mentorBatches = await table("batches", "select=id,name,course_id,status,deleted_at", mentorSession.access_token);
  const sharedBatch = studentBatches.data.find((batch) =>
    isActive(batch) && mentorBatches.data.some((mentorBatch) => mentorBatch.id === batch.id && isActive(mentorBatch))
  );
  if (!sharedBatch) throw new Error("No active shared batch found for screenshot proof.");

  const chatMessage = `${stamp} student message`;
  const chat = await insert("batch_chats", {
    batch_id: sharedBatch.id,
    user_id: student.id,
    message: chatMessage,
    created_at: new Date().toISOString(),
  }, studentSession.access_token);
  cleanup.chats.push(chat.data.id);

  const chatReply = `${stamp} mentor reply`;
  const reply = await insert("batch_chats", {
    batch_id: sharedBatch.id,
    user_id: mentor.id,
    parent_id: chat.data.id,
    message: chatReply,
    created_at: new Date().toISOString(),
  }, mentorSession.access_token);
  cleanup.chats.push(reply.data.id);

  const studentCourses = await table("user_courses", `select=course_id,status,deleted_at&user_id=eq.${student.id}`, studentSession.access_token);
  const courseId = studentCourses.data.find(isActive)?.course_id;
  if (!courseId) throw new Error("No active course assignment found for screenshot proof.");

  const questionTitle = `${stamp} question`;
  const questionReply = `${stamp} mentor answer`;
  const question = await rpc("lms_submit_student_question", {
    target_user_id: student.id,
    target_course_id: courseId,
    question_title: questionTitle,
    question_description: "Screenshot proof question for mentor visibility.",
    question_link: "",
  }, studentSession.access_token);
  cleanup.questions.push(question.data.id);
  await rpc("lms_mentor_reply_student_question", {
    actor_user_id: mentor.id,
    target_question_id: question.data.id,
    reply_text: questionReply,
    reply_status: "answered",
  }, mentorSession.access_token);

  const ticketSubject = `${stamp} support ticket`;
  const ticket = await rpc("lms_support_create_ticket", {
    requester_user_id: student.id,
    requester_role: "student",
    ticket_category: "technical",
    ticket_subject: ticketSubject,
    ticket_message: "Screenshot proof support ticket.",
    ticket_attachment_url: "",
  }, studentSession.access_token);
  cleanup.tickets.push(ticket.data.id);
  return { batchId: sharedBatch.id, batchName: sharedBatch.name, chatMessage, chatReply, questionTitle, questionReply, ticketSubject };
}

async function loginUi(page, email, password, expectedPage) {
  await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith(`/${expectedPage}`), { timeout: 20000 }),
    page.locator(".submit-btn").click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1200);
}

async function openView(page, view) {
  const button = page.locator(`.nav-item[data-view="${view}"], .mentor-context-item[data-view="${view}"]`).first();
  await button.click({ timeout: 10000 });
  await page.waitForTimeout(1200);
}

async function cleanupRows() {
  const adminSession = await passwordSession(accounts.admin.email, accounts.admin.password);
  for (const id of cleanup.questions.filter(Boolean)) await remove("projects", `id=eq.${id}`, adminSession.access_token);
  for (const id of cleanup.tickets.filter(Boolean)) await remove("support_tickets", `id=eq.${id}`, adminSession.access_token);
  for (const id of cleanup.chats.filter(Boolean)) await remove("batch_chats", `id=eq.${id}`, adminSession.access_token);
}

function isActive(row) {
  return row && !row.deleted_at && !["archived", "deleted", "inactive", "cancelled", "removed", "disabled"].includes(String(row.status || "active").toLowerCase());
}

async function ownUser(token, email) {
  const result = await table("users", `select=id,email,role&email=eq.${encodeURIComponent(email)}`, token);
  const user = result.data[0];
  if (!user?.id) throw new Error(`Could not read signed-in user profile for ${email}.`);
  return user;
}

async function passwordSession(email, password) {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Login failed for ${email} with HTTP ${response.status}`);
  return data;
}

async function table(name, query, token) {
  const response = await fetch(`${env.url}/rest/v1/${name}?${query}`, {
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(`${name} read failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  return { ok: true, data };
}

async function insert(name, body, token) {
  const response = await fetch(`${env.url}/rest/v1/${name}?select=*`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${name} insert failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  return { ok: true, data: Array.isArray(data) ? data[0] : data };
}

async function remove(name, query, token) {
  await fetch(`${env.url}/rest/v1/${name}?${query}`, {
    method: "DELETE",
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
  });
}

async function rpc(name, body, token) {
  const response = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}: ${JSON.stringify(data)}`);
  return { ok: true, data };
}

async function loadEnv() {
  const source = existsSync(".env.local") ? await readFile(".env.local", "utf8") : "";
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = values.SUPABASE_ANON_KEY || values.NEXT_PUBLIC_SUPABASE_ANON_KEY || values.SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase URL or publishable key in .env.local");
  return { url: url.replace(/\/$/, ""), anonKey };
}
