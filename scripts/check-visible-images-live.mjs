import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const studentEmail = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const studentPassword = process.env.QA_STUDENT_PASSWORD || "12345678";
const outDir = path.resolve("other-than-working-files", "proof-screenshots");

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = [];

  await page.goto(`${baseURL}/course-detail.html?course=internet-of-things-iot`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500);
  results.push(await inspectPage(page, "course-detail", path.join(outDir, "course-detail-images-proof.png")));

  await page.goto(`${baseURL}/login.html`, { waitUntil: "load", timeout: 30000 });
  await page.fill("#email", studentEmail);
  await page.fill("#password", studentPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith("/student.html"), { timeout: 20000 }),
    page.locator(".submit-btn").click(),
  ]);
  await page.locator('.nav-item[data-view="batch"]').click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  results.push(await inspectPage(page, "student-batch", path.join(outDir, "student-batch-images-proof.png")));

  const broken = results.flatMap((item) => item.broken.map((image) => ({ page: item.page, ...image })));
  console.log(JSON.stringify({
    status: broken.length ? "FAIL" : "PASS",
    pagesChecked: results.map((item) => ({ page: item.page, visibleImages: item.visibleImages, screenshot: item.screenshot })),
    broken,
  }, null, 2));
} finally {
  await browser.close();
}

async function inspectPage(page, pageName, screenshot) {
  const broken = await page.evaluate(() => Array.from(document.images)
    .filter((img) => img.getClientRects().length && getComputedStyle(img).visibility !== "hidden")
    .map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.alt || "",
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }))
    .filter((img) => !img.naturalWidth || !img.naturalHeight));
  const visibleImages = await page.evaluate(() => Array.from(document.images)
    .filter((img) => img.getClientRects().length && getComputedStyle(img).visibility !== "hidden").length);
  await page.screenshot({ path: screenshot, fullPage: true });
  return { page: pageName, visibleImages, broken, screenshot };
}
