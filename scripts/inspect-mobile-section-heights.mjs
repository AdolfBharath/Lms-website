import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://127.0.0.1:4173/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const sections = await page.evaluate(() => [...document.querySelectorAll("body > * , main > *")].map((el) => {
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || "",
    cls: String(el.className || "").slice(0, 90),
    top: Math.round(rect.top + window.scrollY),
    height: Math.round(rect.height),
    bottom: Math.round(rect.bottom + window.scrollY)
  };
}).filter((item) => item.height > 120).sort((a, b) => a.top - b.top));

console.log(JSON.stringify(sections, null, 2));

for (const [name, selector] of Object.entries({
  future: ".future-section",
  about: ".about-section",
  launchpad: ".home-plan-preview",
  subscribe: ".subscribe",
  journey: ".journey",
  news: ".news"
})) {
  const locator = page.locator(selector).first();
  if (await locator.count()) {
    await locator.screenshot({ path: `test-results/section-${name}-390.png` });
  }
}
await browser.close();
