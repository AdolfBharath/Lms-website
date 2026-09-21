import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const bases = [
  { name: "local", url: "http://127.0.0.1:4173" },
  { name: "hosted", url: "https://jenovate.in" }
];
const viewports = [
  { width: 390, height: 844 },
  { width: 320, height: 740 }
];

await mkdir("test-results", { recursive: true });

const browser = await chromium.launch();
const report = [];

for (const base of bases) {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const entry = { target: base.name, viewport: `${viewport.width}x${viewport.height}` };
    try {
      await page.goto(`${base.url}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      entry.homeOverflow = await hasHorizontalOverflow(page);
      await page.screenshot({ path: `test-results/${base.name}-home-${viewport.width}.png`, fullPage: true });
      await page.screenshot({ path: `test-results/${base.name}-home-viewport-${viewport.width}.png`, fullPage: false });

      await page.goto(`${base.url}/course-detail.html?course=artificial-intelligence`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);
      entry.detailOverflow = await hasHorizontalOverflow(page);

      const buy = page.locator("#masterclassEnroll, .primary-action").first();
      await buy.click({ timeout: 10000 });
      await page.locator(".purchase-modal.open").waitFor({ timeout: 12000 });
      await page.screenshot({ path: `test-results/${base.name}-purchase-account-${viewport.width}.png`, fullPage: true });
      await page.screenshot({ path: `test-results/${base.name}-purchase-account-viewport-${viewport.width}.png`, fullPage: false });
      entry.accountModalOverflow = await hasHorizontalOverflow(page);
      entry.accountModalVisible = await visibleInViewport(page, ".purchase-dialog");

      await page.locator('[data-purchase-mode="login"]').click({ timeout: 10000 });
      await page.locator('[data-purchase-panel="login"]:not([hidden])').waitFor({ timeout: 10000 });
      await page.screenshot({ path: `test-results/${base.name}-purchase-login-${viewport.width}.png`, fullPage: true });
      await page.screenshot({ path: `test-results/${base.name}-purchase-login-viewport-${viewport.width}.png`, fullPage: false });
      entry.loginModalOverflow = await hasHorizontalOverflow(page);
      entry.loginModalVisible = await visibleInViewport(page, ".purchase-dialog");
    } catch (error) {
      entry.error = error.message;
    } finally {
      report.push(entry);
      await page.close();
    }
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 2));

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const width = window.innerWidth;
    return Math.max(doc.scrollWidth, body?.scrollWidth || 0) > width + 2;
  });
}

async function visibleInViewport(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0
      && rect.height > 0
      && rect.left >= -2
      && rect.right <= window.innerWidth + 2
      && rect.top >= -2
      && rect.bottom <= window.innerHeight + 2;
  });
}
