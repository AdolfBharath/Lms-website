const assert = require("node:assert/strict");
const test = require("node:test");
const metrics = require("../academic-metrics.js");

test("normalizes marks and handles empty totals", () => {
  assert.equal(metrics.percentage(18, 20), 90);
  assert.equal(metrics.percentage(10, 0), null);
  assert.equal(metrics.averagePercent([]), 0);
});

test("uses pooled marks for assignment and quiz performance", () => {
  assert.equal(metrics.pooledPerformance([
    { earned: 45, maximum: 50 },
    { earned: 16, maximum: 20 }
  ]), 61 / 70 * 100);
});

test("uses the approved 40/40/20 overall performance weights", () => {
  assert.equal(metrics.weightedScore([
    { value: 80, weight: 40 },
    { value: 90, weight: 40 },
    { value: 50, weight: 20 }
  ]), 78);
});

test("redistributes missing course components", () => {
  assert.equal(metrics.courseProgress({
    content: { value: 50, available: true },
    assignments: { value: 100, available: false },
    quizzes: { value: 100, available: false }
  }), 50);
  assert.equal(metrics.courseProgress({
    content: { value: 50, available: true },
    assignments: { value: 100, available: true },
    quizzes: { value: 0, available: true }
  }), 50);
});

test("scales quiz pass marks to the randomized attempt size", () => {
  assert.equal(metrics.scaledPassMark(12, 20, 5), 3);
  assert.equal(metrics.scaledPassMark(null, 20, 5), 3);
});
