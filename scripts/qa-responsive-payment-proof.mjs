import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const localURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const hostedURL = process.env.PAYMENT_BASE_URL || "https://jenovate.in";
const email = process.env.QA_STUDENT_EMAIL || "student1@gmail.com";
const password = process.env.QA_STUDENT_PASSWORD || "12345678";
const paymentEmail = process.env.PAYMENT_TEST_EMAIL || "murugankishore498@gmail.com";
const paymentPassword = process.env.PAYMENT_TEST_PASSWORD || "123456789";
const runId = process.env.PROOF_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(process.env.PROOF_OUT_DIR || path.join("other-than-working-files", "proof-screenshots", "responsive", runId));
const sizes = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await checkPublicPage(page, `${localURL}/index.html`, `home-${size.name}`, size);
    await checkPublicPage(page, `${localURL}/course-detail.html?course=internet-of-things-iot`, `course-iot-${size.name}`, size);
    await checkStudentBatch(page, size);
    await page.close();
  }
  await checkPaymentGateway();
} finally {
  await browser.close();
}

const failures = results.filter((item) => item.status !== "PASS");
console.log(JSON.stringify({ status: failures.length ? "FAIL" : "PASS", results, realMoneyProcessed: "NO" }, null, 2));
if (failures.length) process.exitCode = 1;

async function checkPublicPage(page, url, label, size) {
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1200);
  await capture(page, label, size);
}

async function checkStudentBatch(page, size) {
  await page.goto(`${localURL}/login.html`, { waitUntil: "load", timeout: 30000 });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith("/student.html"), { timeout: 25000 }),
    page.locator(".submit-btn").click(),
  ]);
  if (size.width <= 760) await page.locator("#studentMenuBtn").click({ timeout: 10000 });
  await page.locator('.nav-item[data-view="batch"]').click({ timeout: 15000 });
  await page.waitForTimeout(1800);
  await capture(page, `student-batch-${size.name}`, size);
}

async function checkPaymentGateway() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${hostedURL}/course-detail.html?course=internet-of-things-iot&checkout=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("[data-purchase-mode='login']").click({ timeout: 15000 });
  await page.fill("#purchaseLoginEmail", paymentEmail);
  await page.fill("#purchaseLoginPassword", paymentPassword);
  await page.locator("#purchaseLoginForm button[type='submit']").click();
  await page.locator("[data-purchase-panel='checkout']:not([hidden])").waitFor({ timeout: 30000 });
  const checkout = await page.evaluate(() => ({
    title: document.querySelector("#purchaseCheckoutTitle")?.textContent?.trim() || "",
    total: document.querySelector("#purchaseCheckoutTotal")?.textContent?.trim() || "",
    button: document.querySelector("#purchaseCheckoutPayButton")?.textContent?.trim() || "",
    disabled: document.querySelector("#purchaseCheckoutPayButton")?.hasAttribute("disabled") || false,
  }));
  if (!checkout.disabled) await page.locator("#purchaseCheckoutPayButton").click();
  await page.waitForTimeout(8000);
  const proof = await page.evaluate(() => ({
    iframeCount: document.querySelectorAll("iframe").length,
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
  }));
  const screenshot = path.join(outDir, "payment-gateway-mobile.png");
  await page.screenshot({ path: screenshot, fullPage: true });
  results.push({ label: "payment-gateway-mobile", status: proof.iframeCount ? "PASS" : "FAIL", screenshot, checkout, proof });
  await page.close();
}

async function capture(page, label, size) {
  const screenshot = path.join(outDir, `${label}.png`);
  const audit = await page.evaluate(() => {
    const isVisibleInViewport = (rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    const ignoredOverflowClass = /pcat-(track|wrap|overflow-mask)|category-track|student-sidebar|student-shell|student-nav|student-side-panel|side-panel-/;
    const overflow = Array.from(document.querySelectorAll("body *")).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (ignoredOverflowClass.test(String(el.className || ""))) return false;
      if (el.closest(".student-side-panel, .student-sidebar, .student-nav")) return false;
      return isVisibleInViewport(rect) && style.display !== "none" && style.visibility !== "hidden" && (rect.right > window.innerWidth + 2 || rect.left < -2);
    }).slice(0, 8).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: String(el.className || "").slice(0, 90),
      text: String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
      left: Math.round(el.getBoundingClientRect().left),
      right: Math.round(el.getBoundingClientRect().right),
    }));
    const brokenImages = Array.from(document.images).filter((img) => {
      const rect = img.getBoundingClientRect();
      return isVisibleInViewport(rect) && (!img.naturalWidth || !img.naturalHeight);
    }).map((img) => img.currentSrc || img.src);
    return { overflow, brokenImages, pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth };
  });
  await page.screenshot({ path: screenshot, fullPage: true });
  const status = audit.overflow.length || audit.brokenImages.length || audit.pageWidth > size.width + 2 ? "FAIL" : "PASS";
  results.push({ label, viewport: `${size.width}x${size.height}`, status, screenshot, audit });
}
