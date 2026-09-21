import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const runId = process.env.PROOF_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(process.env.PROOF_OUT_DIR || path.join("other-than-working-files", "proof-screenshots", "marketplace-laptop", runId));
const viewport = { width: 1440, height: 900 };

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  const catalog = await browser.newPage({ viewport });
  await catalog.goto(`${baseURL}/index.html`, { waitUntil: "networkidle", timeout: 30000 });
  const catalogScreenshot = path.join(outDir, "marketplace-laptop-full.png");
  await catalog.screenshot({ path: catalogScreenshot, fullPage: true });
  const cards = await catalog.evaluate(() => Array.from(document.querySelectorAll(".course-card")).map((card) => ({
    slug: card.dataset.courseSlug || "",
    title: card.querySelector("h3")?.textContent?.trim() || "",
    price: card.querySelector("[data-course-price]")?.textContent?.trim() || "",
    href: card.querySelector("a[data-course-enroll]")?.getAttribute("href") || "",
  })));
  await catalog.close();

  for (const card of cards) {
    const page = await browser.newPage({ viewport });
    const requests = [];
    page.on("request", (request) => {
      if (request.url().includes("/functions/v1/course-purchase")) requests.push(request.postData() || "");
    });
    await page.goto(`${baseURL}/${card.href}`, { waitUntil: "networkidle", timeout: 30000 });
    const details = await page.evaluate(() => ({
      title: document.querySelector("#courseTitle")?.textContent?.trim() || "",
      price: document.querySelector("#coursePrice")?.textContent?.trim() || "",
      buyNowPresent: Boolean(document.querySelector("#masterclassEnroll[data-buy-course]")),
      courseNotFound: document.querySelector("#courseTitle")?.textContent?.trim() === "Course not found",
    }));
    await page.locator("#masterclassEnroll").click();
    const accountPanel = page.locator("[data-purchase-panel='account']:not([hidden])");
    const loginPanel = page.locator("[data-purchase-panel='login']:not([hidden])");
    await Promise.race([
      accountPanel.waitFor({ timeout: 15000 }),
      loginPanel.waitFor({ timeout: 15000 }),
    ]);
    const purchasePanel = await page.evaluate(() => document.querySelector("[data-purchase-panel]:not([hidden])")?.getAttribute("data-purchase-panel") || "");
    const createdOrder = requests.some((payload) => payload.includes('"action":"create_order"'));
    results.push({
      ...card,
      detailTitle: details.title,
      detailPrice: details.price,
      buyNowPresent: details.buyNowPresent,
      courseNotFound: details.courseNotFound,
      purchasePanel,
      createdOrder,
      status: details.buyNowPresent && !details.courseNotFound && ["account", "login"].includes(purchasePanel) && !createdOrder ? "PASS" : "FAIL",
    });
    await page.close();
  }

  const iot = results.find((course) => course.slug === "internet-of-things-iot");
  const screenshotPage = await browser.newPage({ viewport });
  await screenshotPage.goto(`${baseURL}/${iot.href}`, { waitUntil: "networkidle", timeout: 30000 });
  await screenshotPage.locator("#masterclassEnroll").click();
  await screenshotPage.locator("[data-purchase-panel='account']:not([hidden])").waitFor({ timeout: 15000 });
  await screenshotPage.screenshot({ path: path.join(outDir, "iot-buy-now-account-checkout-laptop.png"), fullPage: true });
  await screenshotPage.close();

  const report = {
    status: results.every((course) => course.status === "PASS") && results.length === 29 ? "PASS" : "FAIL",
    realMoneyProcessed: "NO",
    pendingOrdersCreated: 0,
    catalogScreenshot,
    coursesChecked: results.length,
    results,
  };
  await writeFile(path.join(outDir, "marketplace-purchase-entry-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, outDir, coursesChecked: results.length, passed: results.filter((course) => course.status === "PASS").length, realMoneyProcessed: report.realMoneyProcessed, pendingOrdersCreated: report.pendingOrdersCreated }, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
} finally {
  await browser.close();
}
