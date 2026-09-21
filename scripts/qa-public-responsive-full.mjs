import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";
const runId = process.env.PROOF_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(process.env.PROOF_OUT_DIR || path.join("other-than-working-files", "proof-screenshots", "public-responsive", runId));

const viewports = [
  { name: "phone-320", width: 320, height: 800 },
  { name: "phone-360", width: 360, height: 800 },
  { name: "phone-375", width: 375, height: 812 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-414", width: 414, height: 896 },
  { name: "phone-430", width: 430, height: 932 },
  { name: "phone-landscape-640", width: 640, height: 360 },
  { name: "phone-landscape-800", width: 800, height: 360 },
  { name: "phone-landscape-896", width: 896, height: 414 },
  { name: "tablet-600", width: 600, height: 960 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "tablet-834", width: 834, height: 1194 },
  { name: "tablet-1024", width: 1024, height: 1366 },
  { name: "tablet-landscape-1024", width: 1024, height: 768 },
  { name: "tablet-landscape-1180", width: 1180, height: 820 },
  { name: "tablet-landscape-1194", width: 1194, height: 834 },
  { name: "tablet-landscape-1366", width: 1366, height: 1024 },
];

const expectedSections = [
  ["header", ".site-header"],
  ["hero", "#home.hero"],
  ["dream-journey", ".dream-journey-strip"],
  ["future", ".future-section"],
  ["about", ".about-section"],
  ["categories", ".categories-section"],
  ["courses", ".courses-section"],
  ["launchpad", ".launchpad-section, .home-plan-preview"],
  ["whatsapp-guidance", ".subscribe"],
  ["mentors", ".instructors, .mentor-showcase"],
  ["statistics", ".stats"],
  ["testimonials", ".home-testimonials"],
  ["faq", ".faq"],
  ["journey", ".journey"],
  ["news", ".news"],
  ["footer", "footer, .simple-footer"],
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const results = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseURL}/index.html`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    const audit = await auditLanding(page, viewport);
    const screenshot = path.join(outDir, `${viewport.name}-landing.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const status = audit.failures.length ? "FAIL" : "PASS";
    results.push({ viewport: `${viewport.width}x${viewport.height}`, status, screenshot, ...audit });
    await page.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => result.status !== "PASS");
const report = {
  status: failures.length ? "FAIL" : "PASS",
  outDir,
  viewports: results.map((result) => ({
    viewport: result.viewport,
    status: result.status,
    screenshot: result.screenshot,
    failures: result.failures,
    pageWidth: result.pageWidth,
    pageHeight: result.pageHeight,
    courseCards: result.courseCards,
    testimonials: result.testimonials,
    sections: result.sections.map((section) => ({
      name: section.name,
      status: section.status,
      height: section.height,
      textLength: section.textLength,
    })),
  })),
};
console.log(JSON.stringify(process.env.QA_VERBOSE === "1" ? { status: report.status, outDir, results } : report, null, 2));
if (failures.length) process.exitCode = 1;

async function auditLanding(page, viewport) {
  return page.evaluate(({ expectedSections, viewport }) => {
    const failures = [];
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const documentWidth = document.documentElement.scrollWidth;
    const ignoredOverflowClass = /pcat-(track|wrap|overflow-mask)|category-track|flying-review-row|about-feature-track/;
    const visibleRect = (rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth;

    const sections = expectedSections.map(([name, selector]) => {
      const node = document.querySelector(selector);
      if (!node) return { name, selector, status: "MISSING" };
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const text = node.textContent.replace(/\s+/g, " ").trim();
      const mediaCount = node.querySelectorAll("img, picture, video, canvas, svg").length;
      const interactiveCount = node.querySelectorAll("a, button, input, select, textarea").length;
      const hidden = style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width <= 0 || rect.height <= 0;
      const status = hidden ? "HIDDEN" : "VISIBLE";
      const childRects = Array.from(node.children)
        .filter((child) => {
          const childStyle = getComputedStyle(child);
          const childRect = child.getBoundingClientRect();
          return childStyle.display !== "none" && childStyle.visibility !== "hidden" && childRect.width > 0 && childRect.height > 0;
        })
        .map((child) => child.getBoundingClientRect());
      const contentTop = childRects.length ? Math.min(...childRects.map((childRect) => childRect.top)) - rect.top : 0;
      const contentBottom = childRects.length ? rect.bottom - Math.max(...childRects.map((childRect) => childRect.bottom)) : 0;
      const contentHeight = childRects.length
        ? Math.max(...childRects.map((childRect) => childRect.bottom)) - Math.min(...childRects.map((childRect) => childRect.top))
        : 0;
      return {
        name,
        selector,
        status,
        top: Math.round(rect.top + window.scrollY),
        height: Math.round(rect.height),
        textLength: text.length,
        mediaCount,
        interactiveCount,
        contentHeight: Math.round(contentHeight),
        internalTopSpace: Math.max(0, Math.round(contentTop)),
        internalBottomSpace: Math.max(0, Math.round(contentBottom)),
      };
    });

    for (const section of sections) {
      if (section.status !== "VISIBLE") failures.push(`${section.name}:${section.status}`);
      if (section.status === "VISIBLE" && section.height > viewport.height * 1.8 && section.textLength < 80 && section.mediaCount === 0) failures.push(`${section.name}:blank-large-section`);
      if (section.status === "VISIBLE" && section.height > 400 && section.contentHeight < section.height * 0.42 && section.internalTopSpace > 160 && section.internalBottomSpace > 160) {
        failures.push(`${section.name}:excessive-internal-whitespace`);
      }
    }
    const visibleSections = sections.filter((section) => section.status === "VISIBLE").sort((a, b) => a.top - b.top);
    const sectionOverlaps = [];
    for (let index = 1; index < visibleSections.length; index += 1) {
      const previous = visibleSections[index - 1];
      const current = visibleSections[index];
      const overlap = previous.top + previous.height - current.top;
      if (overlap > 24) sectionOverlaps.push(`${previous.name}->${current.name}:${overlap}`);
    }
    if (sectionOverlaps.length) failures.push("section-overlap");

    const overflow = Array.from(document.querySelectorAll("body *")).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (ignoredOverflowClass.test(String(el.className || ""))) return false;
      if (el.closest(".pcat-overflow-mask, .category-carousel, .course-tab-shell, .flying-reviews")) return false;
      return visibleRect(rect) && (rect.left < -2 || rect.right > viewportWidth + 2);
    }).slice(0, 10).map((el) => ({
      tag: el.tagName.toLowerCase(),
      className: String(el.className || "").slice(0, 90),
      text: String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      left: Math.round(el.getBoundingClientRect().left),
      right: Math.round(el.getBoundingClientRect().right),
    }));
    if (documentWidth > viewportWidth + 2) failures.push(`page-overflow:${documentWidth}`);
    if (overflow.length) failures.push("visible-overflow");

    const brokenImages = Array.from(document.images).filter((img) => {
      const rect = img.getBoundingClientRect();
      return visibleRect(rect) && (!img.naturalWidth || !img.naturalHeight);
    }).map((img) => img.currentSrc || img.src);
    if (brokenImages.length) failures.push("visible-broken-images");

    const courseCards = Array.from(document.querySelectorAll(".course-card"));
    const visibleCourseCards = courseCards.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(card).display !== "none";
    }).length;
    if (!visibleCourseCards) failures.push("courses:no-visible-cards");

    const testimonials = Array.from(document.querySelectorAll(".flying-review-card, .testimonial-card, [data-testimonial]"));
    const visibleTestimonials = testimonials.filter((card) => {
      const rect = card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(card).display !== "none";
    }).length;
    if (!visibleTestimonials) failures.push("testimonials:no-visible-cards");

    const blankBands = [];
    const step = Math.max(160, Math.floor(viewportHeight / 5));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      const elements = document.elementsFromPoint(Math.floor(viewportWidth / 2), Math.min(viewportHeight - 4, Math.max(4, y - window.scrollY)));
      const meaningful = elements.some((el) => {
        if (!el || ["HTML", "BODY"].includes(el.tagName)) return false;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const text = String(el.textContent || "").trim();
        return text.length > 3 || ["IMG", "VIDEO", "CANVAS", "SVG", "A", "BUTTON", "INPUT"].includes(el.tagName);
      });
      if (!meaningful) blankBands.push(y);
    }

    return {
      failures,
      sections,
      overflow,
      brokenImages,
      courseCards: { total: courseCards.length, visible: visibleCourseCards },
      testimonials: { total: testimonials.length, visible: visibleTestimonials },
      sectionOverlaps,
      pageWidth: documentWidth,
      pageHeight: document.documentElement.scrollHeight,
      viewport: viewportWidth,
      blankBandSamples: blankBands.slice(0, 8),
    };
  }, { expectedSections, viewport });
}
