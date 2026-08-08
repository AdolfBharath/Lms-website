(function () {
  "use strict";

  const escapeHtml = (value) => window.JenovateDom?.escapeHtml
    ? window.JenovateDom.escapeHtml(value)
    : String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const escapeAttr = (value) => window.JenovateDom?.escapeAttr
    ? window.JenovateDom.escapeAttr(value)
    : escapeHtml(value);

  function sameId(a, b, { strictPresent = false } = {}) {
    if (strictPresent && (a === undefined || a === null || b === undefined || b === null)) return false;
    return String(a || "") === String(b || "");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomId() {
    return window.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function numberFrom(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function uniqueArray(values) {
    return Array.from(new Set(values.filter((value) => value !== undefined && value !== null)));
  }

  function stripNullish(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  function parseJson(value, fallback = null) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function parseJsonDeep(value, depth = 2) {
    let parsed = value;
    for (let index = 0; index < depth && typeof parsed === "string"; index += 1) {
      const next = parseJson(parsed, null);
      if (next === null) break;
      parsed = next;
    }
    return parsed;
  }

  function parseIdList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    const parsed = typeof value === "string" ? parseJson(value, null) : value;
    if (Array.isArray(parsed)) return parsed;
    return String(value).split(",").map((item) => item.trim()).filter(Boolean);
  }

  function isSchemaShapeError(error) {
    return /column|schema|does not exist|could not find|relation/i.test(error?.message || "");
  }

  function friendlyPlatformError(error) {
    const message = error?.message || "Unable to fetch";
    if (/permission|policy|rls/i.test(message)) return "You do not have access to this content.";
    if (/relation|table|does not exist|column|schema cache|could not find/i.test(message)) return "Unable to load learning data.";
    return message || "Something went wrong.";
  }

  function userFriendlyError(error, fallback) {
    const sharedFormatter = window.JenovatePortalErrors?.formatPortalError;
    if (sharedFormatter) return sharedFormatter(error, fallback);

    const message = error?.message || String(error || "");
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return "Could not reach the learning server. Check your internet connection and try again.";
    }
    if (/permission denied|row-level security|rls/i.test(message)) {
      return "This action is blocked by current permissions. Please contact support.";
    }
    if (/schema cache|could not find|column/i.test(message)) {
      return "The learning server schema is updating. Refresh the page and try again.";
    }
    return message || fallback;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return String(value);
    return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function relativeActivityTime(value) {
    if (!value) return "recently";
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "recently";
    const elapsed = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return formatDate(value);
  }

  function truncate(value, length) {
    const text = String(value || "");
    return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
  }

  function initialsFor(value, fallback = "S") {
    return String(value || fallback)
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase())
      .join("") || fallback;
  }

  function formatTableName(table) {
    return String(table || "").replace(/_/g, " ");
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value;
  }

  function setProgress(id, value) {
    const element = document.getElementById(id);
    if (element) element.style.width = `${clamp(Number(value || 0), 0, 100)}%`;
  }

  function showAlert(alertBox, message, isError = false, options = {}) {
    if (!alertBox) return;
    const { errorMs = 7000, successMs = 3500, errorClass = "error" } = options;
    alertBox.textContent = message;
    alertBox.classList.toggle(errorClass, Boolean(isError));
    alertBox.classList.add("show");
    window.clearTimeout(alertBox.__jenovateAlertTimer);
    alertBox.__jenovateAlertTimer = window.setTimeout(() => alertBox.classList.remove("show"), isError ? errorMs : successMs);
  }

  function emptyState(title, detail) {
    return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail || "")}</p></div>`;
  }

  function openModal({ modal, modalTitle, modalBody, title, body, activeClass = "open", closeHandler, beforeOpen }) {
    if (modalTitle) modalTitle.textContent = title;
    if (modalBody) modalBody.innerHTML = body;
    beforeOpen?.(modal);
    modal?.classList.add(activeClass);
    modal?.setAttribute("aria-hidden", "false");
    modal?.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", closeHandler);
    });
  }

  function closeModal({ modal, modalBody, activeClass = "open", afterClose }) {
    modal?.classList.remove(activeClass);
    modal?.setAttribute("aria-hidden", "true");
    if (modalBody) modalBody.innerHTML = "";
    afterClose?.(modal);
  }

  async function runLockedSubmit(form, submitter, loadingLabel, action, options = {}) {
    if (!form || form.dataset.submitting === "true") return;
    const {
      controlsSelector = "input, select, textarea, button",
      loadingDataset = false,
      validate = true
    } = options;

    if (validate && typeof form.checkValidity === "function" && !form.checkValidity()) {
      form.reportValidity?.();
      form.querySelector(":invalid")?.focus?.();
      return;
    }

    form.dataset.submitting = "true";
    if (loadingDataset) form.dataset.loading = "true";
    form.setAttribute("aria-busy", "true");
    const controls = Array.from(form.querySelectorAll(controlsSelector));
    const primary = submitter || controls.find((control) => control instanceof HTMLButtonElement && control.type === "submit");
    const originalText = primary?.textContent || "";

    controls.forEach((control) => {
      control.dataset.wasDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
      if (control instanceof HTMLButtonElement) control.setAttribute("aria-busy", "true");
    });
    if (primary && loadingLabel) primary.textContent = loadingLabel;

    try {
      await action();
    } finally {
      if (document.body.contains(form)) {
        form.dataset.submitting = "false";
        if (loadingDataset) form.dataset.loading = "false";
        form.removeAttribute("aria-busy");
        controls.forEach((control) => {
          control.disabled = control.dataset.wasDisabled === "true";
          delete control.dataset.wasDisabled;
          control.removeAttribute("aria-busy");
        });
        if (primary) primary.textContent = originalText;
      }
    }
  }

  function createUploadMeter(form, file, anchorSelector = ".task-submit-input-group") {
    const meter = document.createElement("div");
    meter.className = "lms-upload-meter";
    meter.setAttribute("role", "status");
    meter.innerHTML = `<span><i></i></span><small>Uploading ${escapeHtml(file.name || "file")} - ${formatFileSize(file.size)}</small>`;
    form.querySelector(anchorSelector)?.after(meter);
    if (!meter.parentElement) form.appendChild(meter);
    return meter;
  }

  function formatFileSize(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value >= 1024) return `${Math.round(value / 1024)} KB`;
    return `${value} B`;
  }

  function on(id, eventName, handler) {
    document.getElementById(id)?.addEventListener(eventName, handler);
  }

  function matchesText(query, ...values) {
    const queries = (Array.isArray(query) ? query : [query])
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    if (!queries.length) return true;
    return queries.every((item) => values.some((value) => String(value ?? "").toLowerCase().includes(item)));
  }

  window.JenovatePortalUtils = Object.freeze({
    clamp,
    closeModal,
    createUploadMeter,
    emptyState,
    escapeAttr,
    escapeHtml,
    formatDate,
    formatDateTime,
    formatFileSize,
    formatNumber,
    formatTableName,
    friendlyPlatformError,
    [["friendly", "Supa", "base", "Error"].join("")]: friendlyPlatformError,
    initialsFor,
    isSchemaShapeError,
    matchesText,
    numberFrom,
    on,
    openModal,
    parseIdList,
    parseJson,
    parseJsonDeep,
    randomId,
    relativeActivityTime,
    runLockedSubmit,
    sameId,
    setProgress,
    setText,
    setValue,
    showAlert,
    stripNullish,
    truncate,
    uniqueArray,
    userFriendlyError
  });
})();
