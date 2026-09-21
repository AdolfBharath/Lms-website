import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const env = await loadEnv();
const studentEmail = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const studentPassword = process.env.QA_STUDENT_PASSWORD || "12345678";
const mentorEmail = process.env.QA_MENTOR_EMAIL || "mentor1@gmail.com";
const mentorPassword = process.env.QA_MENTOR_PASSWORD || "12345678";
const stamp = `QA ${new Date().toISOString()}`;
const cleanup = { chats: [], questions: [], tickets: [] };

try {
  const studentSession = await passwordSession(studentEmail, studentPassword);
  const mentorSession = await passwordSession(mentorEmail, mentorPassword);
  const student = await ownUser(studentSession.access_token, studentEmail);
  const mentor = await ownUser(mentorSession.access_token, mentorEmail);
  const studentBatches = await table("batches", "select=id,name,course_id,status,deleted_at", studentSession.access_token);
  const mentorBatches = await table("batches", "select=id,name,course_id,status,deleted_at", mentorSession.access_token);
  const sharedBatch = studentBatches.data.find((batch) =>
    isActive(batch) && mentorBatches.data.some((mentorBatch) => mentorBatch.id === batch.id && isActive(mentorBatch))
  );
  if (!sharedBatch) throw new Error("No active batch is visible to both the QA student and QA mentor.");

  const studentChat = await insert("batch_chats", {
    batch_id: sharedBatch.id,
    user_id: student.id,
    message: `${stamp} student batch chat`,
    created_at: new Date().toISOString(),
  }, studentSession.access_token);
  cleanup.chats.push(studentChat.data.id);

  const mentorSawChat = await table("batch_chats", `select=id,message&batch_id=eq.${sharedBatch.id}&id=eq.${studentChat.data.id}`, mentorSession.access_token);
  if (!mentorSawChat.data.length) throw new Error("Mentor cannot see the student's batch chat message.");

  const mentorReply = await insert("batch_chats", {
    batch_id: sharedBatch.id,
    user_id: mentor.id,
    parent_id: studentChat.data.id,
    message: `${stamp} mentor reply`,
    created_at: new Date().toISOString(),
  }, mentorSession.access_token);
  cleanup.chats.push(mentorReply.data.id);

  const studentSawReply = await table("batch_chats", `select=id,message,parent_id&batch_id=eq.${sharedBatch.id}&id=eq.${mentorReply.data.id}`, studentSession.access_token);
  if (!studentSawReply.data.length) throw new Error("Student cannot see the mentor reply.");

  const deleteResult = await rpc("lms_mentor_delete_batch_chat", {
    actor_user_id: mentor.id,
    target_message_id: studentChat.data.id,
  }, mentorSession.access_token);
  if (deleteResult.data !== true) throw new Error("Mentor delete RPC did not confirm deletion.");

  const deletedRows = await table("batch_chats", `select=id&batch_id=eq.${sharedBatch.id}&id=in.(${cleanup.chats.join(",")})`, mentorSession.access_token);
  if (deletedRows.data.length) throw new Error("Deleted chat message or reply is still visible.");
  cleanup.chats.length = 0;

  const studentCourses = await table("user_courses", `select=course_id,batch_id,status,deleted_at&user_id=eq.${student.id}`, studentSession.access_token);
  const activeCourseIds = [...new Set(studentCourses.data.filter(isActive).map((row) => row.course_id).filter(Boolean))];
  if (!activeCourseIds.length) throw new Error("QA student has no active course assignment.");

  const question = await rpc("lms_submit_student_question", {
    target_user_id: student.id,
    target_course_id: activeCourseIds[0],
    question_title: `${stamp} mentor visibility`,
    question_description: "Live QA question to verify mentor receives student questions.",
    question_link: "",
  }, studentSession.access_token);
  cleanup.questions.push(question.data.id);

  const mentorSawQuestion = await table("projects", `select=id,title,course_id,batch_id,status,type&id=eq.${question.data.id}`, mentorSession.access_token);
  if (!mentorSawQuestion.data.length) throw new Error("Mentor cannot see the submitted student question.");

  await rpc("lms_mentor_reply_student_question", {
    actor_user_id: mentor.id,
    target_question_id: question.data.id,
    reply_text: "Mentor QA reply received.",
    reply_status: "answered",
  }, mentorSession.access_token);

  const studentSawQuestionReply = await table("projects", `select=id,feedback,status&id=eq.${question.data.id}`, studentSession.access_token);
  if (studentSawQuestionReply.data[0]?.feedback !== "Mentor QA reply received.") {
    throw new Error("Student cannot see the mentor's question reply.");
  }

  const ticket = await rpc("lms_support_create_ticket", {
    requester_user_id: student.id,
    requester_role: "student",
    ticket_category: "technical",
    ticket_subject: `${stamp} support ticket`,
    ticket_message: "Live QA ticket to verify student support flow.",
    ticket_attachment_url: "",
  }, studentSession.access_token);
  cleanup.tickets.push(ticket.data.ticket?.id || ticket.data.id);

  const studentSawTicket = await table("support_tickets", `select=id,subject,status&subject=eq.${encodeURIComponent(`${stamp} support ticket`)}`, studentSession.access_token);
  if (!studentSawTicket.data.length) throw new Error("Student cannot see the newly created support ticket.");

  const mentorTicketLeak = await table("support_tickets", `select=id,subject&subject=eq.${encodeURIComponent(`${stamp} support ticket`)}`, mentorSession.access_token);
  if (mentorTicketLeak.data.length) throw new Error("Mentor can see a student-owned support ticket without assignment.");

  console.log(JSON.stringify({
    batchChat: "PASS",
    mentorSeesChat: "PASS",
    mentorReply: "PASS",
    mentorDelete: "PASS",
    studentQuestion: "PASS",
    mentorGetsQuestion: "PASS",
    questionReply: "PASS",
    supportTicket: "PASS",
    supportTicketIsolation: "PASS",
    batchName: sharedBatch.name,
  }, null, 2));
} finally {
  await cleanupRows().catch((error) => console.warn(`Cleanup warning: ${error.message}`));
}

async function cleanupRows() {
  const adminSession = await passwordSession(process.env.QA_ADMIN_EMAIL || "admin@jenovate.in", process.env.QA_ADMIN_PASSWORD || "Temp@12345");
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
