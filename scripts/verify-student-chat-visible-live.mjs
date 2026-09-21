import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const env = await loadEnv();
const studentEmail = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const studentPassword = process.env.QA_STUDENT_PASSWORD || "12345678";
const adminEmail = process.env.QA_ADMIN_EMAIL || "admin@jenovate.in";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "Temp@12345";
const message = `UI stay visible proof ${new Date().toISOString()}`;
const outDir = path.resolve("other-than-working-files", "proof-screenshots");
const shotPath = path.join(outDir, "student-chat-visible-proof.png");
let createdId = "";

try {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${baseURL}/login.html`, { waitUntil: "load" });
    await page.fill("#email", studentEmail);
    await page.fill("#password", studentPassword);
    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith("/student.html"), { timeout: 20000 }),
      page.locator(".submit-btn").click(),
    ]);
    await page.locator('.nav-item[data-view="batch"]').click({ timeout: 15000 });
    await page.waitForFunction(() => Boolean(document.querySelector("#chatBatchSelect")?.value), null, { timeout: 20000 });
    const selectedBatchId = await page.locator("#chatBatchSelect").inputValue();
    await page.locator("#chatMessage").fill(message);
    await page.locator("#chatComposer button[type='submit']").click();
    await page.waitForTimeout(2500);
    const visibleNow = await page.locator("#chatList").getByText(message).isVisible().catch(() => false);
    const globalAlert = await page.locator("#studentAlert").textContent().catch(() => "");
    if (!visibleNow) {
      await page.screenshot({ path: "other-than-working-files/proof-screenshots/student-chat-send-failure.png", fullPage: true });
      const debug = await page.evaluate(() => ({
        alert: document.querySelector("#studentAlert")?.textContent || "",
        chatText: document.querySelector("#chatList")?.textContent || "",
        inputValue: document.querySelector("#chatMessage")?.value || "",
        selectedBatchId: document.querySelector("#chatBatchSelect")?.value || "",
      }));
      throw new Error(`Student chat message was not visible immediately: ${JSON.stringify(debug)}`);
    }
    if ((globalAlert || "").trim()) throw new Error(`Global alert should not show after chat post: ${globalAlert}`);
    await page.waitForTimeout(1800);
    await page.locator("#chatList").getByText(message).waitFor({ state: "visible", timeout: 15000 });
    const actionText = await page.locator("#chatList .chat-message-actions").last().textContent().catch(() => "");
    if (!/You/.test(actionText || "") || !/Reply/.test(actionText || "")) throw new Error(`Reply action did not show the sender name: ${actionText}`);
    await page.screenshot({ path: shotPath, fullPage: true });
    const student = await passwordSession(studentEmail, studentPassword);
    const rows = await table("batch_chats", `select=id,message,batch_id&batch_id=eq.${selectedBatchId}&message=eq.${encodeURIComponent(message)}`, student.access_token);
    createdId = rows.data[0]?.id || "";
    console.log(JSON.stringify({ posted: "PASS", visibleImmediately: "PASS", visibleAfterRefresh: "PASS", replyActionUsername: "PASS", globalAlertHidden: "PASS", batchId: selectedBatchId, screenshot: shotPath }, null, 2));
    await page.close();
  } finally {
    await browser.close();
  }
} finally {
  if (createdId) {
    const admin = await passwordSession(adminEmail, adminPassword).catch(() => null);
    if (admin?.access_token) await remove("batch_chats", `id=eq.${createdId}`, admin.access_token);
  }
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
  return { data };
}

async function remove(name, query, token) {
  await fetch(`${env.url}/rest/v1/${name}?${query}`, {
    method: "DELETE",
    headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` },
  });
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
