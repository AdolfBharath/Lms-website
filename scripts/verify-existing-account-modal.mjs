import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:4173/course-detail.html?course=ai-agentic-and-generative#checkout", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);

const before = await visiblePanel();
await page.locator('[data-purchase-mode="login"]').click();
await page.waitForTimeout(200);
const after = await visiblePanel();
await page.goto("http://127.0.0.1:4173/course-detail.html?course=ai-agentic-and-generative", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  sessionStorage.setItem("jenovateStudentSession", JSON.stringify({ role: "student", email: "student1@gmail.com" }));
});
await page.goto("http://127.0.0.1:4173/course-detail.html?course=ai-agentic-and-generative", { waitUntil: "domcontentloaded" });
await page.locator("#masterclassEnroll").click();
await page.waitForTimeout(3500);
const remembered = await visiblePanel();
const rememberedEmail = await page.locator("#purchaseLoginEmail").inputValue();

console.log(JSON.stringify({ before, after, remembered, rememberedEmail }, null, 2));
await browser.close();

async function visiblePanel() {
  return page.$$eval("[data-purchase-panel]", (panels) => panels
    .filter((panel) => panel.closest(".purchase-modal.open") && !panel.hidden)
    .map((panel) => ({
      panel: panel.dataset.purchasePanel,
      heading: panel.querySelector("h3")?.textContent?.trim() || "",
    })));
}
