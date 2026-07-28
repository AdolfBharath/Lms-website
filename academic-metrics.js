(function academicMetricsModule(root, factory) {
  const service = factory();
  if (typeof module === "object" && module.exports) module.exports = service;
  if (root) root.JenovateAcademicMetrics = service;
})(typeof window !== "undefined" ? window : globalThis, function createAcademicMetrics() {
  "use strict";

  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));

  function percentage(score, maximum) {
    const earned = Number(score);
    const total = Number(maximum);
    if (!Number.isFinite(earned) || !Number.isFinite(total) || total <= 0) return null;
    return clamp((earned / total) * 100);
  }

  function averagePercent(values) {
    const valid = values.map(Number).filter(Number.isFinite);
    return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
  }

  function pooledPerformance(results) {
    const valid = results.filter((result) => (
      Number.isFinite(Number(result?.earned))
      && Number.isFinite(Number(result?.maximum))
      && Number(result.maximum) > 0
    ));
    const maximum = valid.reduce((sum, result) => sum + Number(result.maximum), 0);
    if (!maximum) return 0;
    return clamp((valid.reduce((sum, result) => sum + Number(result.earned), 0) / maximum) * 100);
  }

  function scaledPassMark(configuredPass, configuredMaximum, attemptMaximum, defaultRate = 0.6) {
    const attemptTotal = Number(attemptMaximum);
    if (!Number.isFinite(attemptTotal) || attemptTotal <= 0) return 0;
    const configuredTotal = Number(configuredMaximum);
    const pass = Number(configuredPass);
    const ratio = Number.isFinite(pass) && pass > 0 && Number.isFinite(configuredTotal) && configuredTotal > 0
      ? clamp(pass / configuredTotal, 0, 1)
      : clamp(defaultRate, 0, 1);
    return Math.ceil(attemptTotal * ratio);
  }

  function weightedScore(components) {
    const available = components.filter((component) => (
      component?.available !== false
      && Number.isFinite(Number(component?.weight))
      && Number(component.weight) > 0
    ));
    const weight = available.reduce((sum, component) => sum + Number(component.weight), 0);
    if (!weight) return 0;
    return clamp(available.reduce((sum, component) => (
      sum + clamp(component.value) * Number(component.weight)
    ), 0) / weight);
  }

  function courseProgress({ content, assignments, quizzes }) {
    return weightedScore([
      { value: content?.value, weight: 60, available: content?.available },
      { value: assignments?.value, weight: 20, available: assignments?.available },
      { value: quizzes?.value, weight: 20, available: quizzes?.available }
    ]);
  }

  return Object.freeze({ averagePercent, courseProgress, percentage, pooledPerformance, scaledPassMark, weightedScore });
});
