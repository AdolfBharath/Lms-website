import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const LOCAL_URL = process.env.LOCAL_URL || "http://127.0.0.1:4173";
const EXPECTED_PRICE = 5999;

const env = await loadEnv();
const backendCourses = await requestRest("courses?select=id,title,price,status,deleted_at&order=title.asc");
const activeCourses = backendCourses.filter((course) => !course.deleted_at && !/archived|deleted|removed/i.test(String(course.status || "")));
const backendBySlug = new Map(activeCourses.map((course) => [slugify(course.title), course]));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`${LOCAL_URL}/index.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".course-card", { timeout: 15000 });

const cards = await page.$$eval(".course-card", (nodes) => nodes.map((card) => ({
  title: card.querySelector("h3")?.textContent?.trim() || "",
  slug: card.getAttribute("data-course-slug") || "",
  href: card.querySelector("[data-course-enroll]")?.getAttribute("href") || "",
  priceText: card.querySelector("[data-course-price]")?.textContent?.trim() || "",
})));

const failures = [];
const seenCardSlugs = new Set();
const purchaseChecks = [];

for (const card of cards) {
  const cardSlug = card.slug || slugify(card.title);
  seenCardSlugs.add(cardSlug);
  const backendCourse = backendBySlug.get(cardSlug);
  const cardPrice = parseMoney(card.priceText);
  if (!backendCourse) {
    failures.push(`Front-end card is missing in backend: ${card.title} (${cardSlug})`);
    continue;
  }
  if (String(backendCourse.title) !== card.title) failures.push(`Title mismatch for ${cardSlug}: card "${card.title}", backend "${backendCourse.title}"`);
  if (Number(backendCourse.price) !== EXPECTED_PRICE) failures.push(`Backend price mismatch for ${backendCourse.title}: ${backendCourse.price}`);
  if (cardPrice !== EXPECTED_PRICE) failures.push(`Front-end price mismatch for ${card.title}: ${card.priceText}`);
  if (!card.href.includes(`course=${encodeURIComponent(cardSlug)}`)) failures.push(`Card link does not preserve slug for ${card.title}: ${card.href}`);

  const purchaseCourse = await requestFunction("course", { course_slug: cardSlug });
  const amount = Number(purchaseCourse?.course?.final_amount ?? purchaseCourse?.course?.amount ?? 0);
  purchaseChecks.push({ slug: cardSlug, title: purchaseCourse?.course?.title || "", amount });
  if (purchaseCourse?.course?.title !== backendCourse.title) failures.push(`Purchase lookup mismatch for ${cardSlug}: got "${purchaseCourse?.course?.title || "none"}"`);
  if (amount !== EXPECTED_PRICE) failures.push(`Purchase lookup price mismatch for ${backendCourse.title}: ${amount}`);
}

for (const course of activeCourses) {
  const slug = slugify(course.title);
  if (!seenCardSlugs.has(slug)) failures.push(`Backend course has no front-end card: ${course.title} (${slug})`);
}

const spotChecks = [];
for (const [slug, expectedTitle] of [
  ["psychology", "Psychology"],
  ["medical-coding", "Medical Coding"],
  ["internet-of-things-iot", "Internet of Things (IoT)"],
  ["iot-and-robotics", "IoT & Robotics"],
]) {
  await page.goto(`${LOCAL_URL}/course-detail.html?course=${encodeURIComponent(slug)}`, { waitUntil: "domcontentloaded" });
  const title = (await page.locator("#courseTitle").textContent()).trim();
  const price = (await page.locator("#coursePrice").textContent()).trim();
  spotChecks.push({ slug, expectedTitle, title, price });
  if (title !== expectedTitle) failures.push(`Detail page mismatch for ${slug}: expected "${expectedTitle}", got "${title}"`);
  if (parseMoney(price) !== EXPECTED_PRICE) failures.push(`Detail page price mismatch for ${slug}: ${price}`);
}

await browser.close();

console.log(JSON.stringify({
  frontendCards: cards.length,
  backendCourses: activeCourses.length,
  purchaseLookupChecks: purchaseChecks.length,
  failures,
  spotChecks,
}, null, 2));

if (failures.length) process.exit(1);

async function loadEnv() {
  const source = await readFile(".env.local", "utf8");
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  const url = values.SUPABASE_URL || values.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = values.SUPABASE_ANON_KEY
    || values.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || values.SUPABASE_PUBLISHABLE_KEY
    || values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase URL, anon key, or service key in .env.local");
  return { url: url.replace(/\/$/, ""), anonKey, serviceKey };
}

async function requestRest(path) {
  const response = await fetch(`${env.url}/rest/v1/${path}`, {
    headers: {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase REST request failed: ${response.status}`);
  return response.json();
}

async function requestFunction(action, body = {}) {
  const response = await fetch(`${env.url}/functions/v1/course-purchase`, {
    method: "POST",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...body }),
  });
  if (!response.ok) throw new Error(`course-purchase ${action} failed: ${response.status}`);
  return response.json();
}

function parseMoney(value) {
  const numeric = String(value || "").replace(/[^0-9.]/g, "");
  return Number(numeric || 0);
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
