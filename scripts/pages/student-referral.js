import { REFERRAL_FORM_URL, createReferralCode, createReferralText } from "./modules/referral-code.js";

const STUDENT_SESSION_KEYS = ["jenovateStudentSession", "jenovateCurrentUser"];

function readStudentSession() {
  for (const key of STUDENT_SESSION_KEYS) {
    try {
      const profile = JSON.parse(sessionStorage.getItem(key) || "null");
      if (String(profile?.role || "").toLowerCase() === "student") return profile;
    } catch (error) {
      sessionStorage.removeItem(key);
    }
  }
  return null;
}

function renderStudentReferral(profile = readStudentSession()) {
  const view = document.getElementById("referralView");
  if (!view || !profile) return;

  const code = createReferralCode(profile);
  const referralText = createReferralText(profile);
  const name = profile.name || profile.username || "Student";
  const email = profile.email || "";

  setText("referralStudentName", name);
  setText("referralStudentEmail", email);
  setText("referralAvatar", initials(name || email));
  setText("referralCodeText", code);
  setValue("referralCodeValue", code);
  setValue("referralShareText", referralText);
  setText("referralFormUrl", REFERRAL_FORM_URL);
  setText("referralCoinsEarned", formatCoins(profile.coins || profile.coin_balance || 0));
  setText("referralInviteCount", String(profile.referral_count || profile.referrals || 12));
  setupReferralStepper();
}

async function copyReferralCode() {
  const code = document.getElementById("referralCodeValue")?.value || "";
  if (!code) return;
  await copyText(code);
  announceReferralStatus("Referral code copied.");
}

async function copyReferralText() {
  const text = document.getElementById("referralShareText")?.value || "";
  if (!text) return;
  await copyText(text);
  announceReferralStatus("Referral message copied.");
}

function openReferralForm() {
  window.open(REFERRAL_FORM_URL, "_blank", "noopener,noreferrer");
  copyReferralCode().catch(() => announceReferralStatus("Form opened. Copy the code before submitting."));
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function announceReferralStatus(message) {
  const status = document.getElementById("referralStatus");
  if (!status) return;
  status.textContent = message;
  window.clearTimeout(announceReferralStatus.timer);
  announceReferralStatus.timer = window.setTimeout(() => {
    status.textContent = "";
  }, 2500);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function initials(value) {
  return String(value || "Student")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

function formatCoins(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "0";
}

function setupReferralStepper() {
  const stepper = document.querySelector("[data-referral-stepper]");
  if (!stepper || stepper.dataset.wired === "true") return;
  stepper.dataset.wired = "true";

  const indicators = Array.from(stepper.querySelectorAll("[data-referral-step]"));
  const panels = Array.from(stepper.querySelectorAll("[data-referral-panel]"));
  const previous = stepper.querySelector("[data-referral-prev]");
  const next = stepper.querySelector("[data-referral-next]");
  let currentStep = 1;

  const render = () => {
    indicators.forEach((button) => {
      const step = Number(button.dataset.referralStep || 1);
      button.classList.toggle("active", step === currentStep);
      button.classList.toggle("complete", step < currentStep);
      button.setAttribute("aria-current", step === currentStep ? "step" : "false");
    });

    panels.forEach((panel) => {
      panel.classList.toggle("active", Number(panel.dataset.referralPanel || 1) === currentStep);
    });

    if (previous) previous.disabled = currentStep === 1;
    if (next) next.textContent = currentStep === panels.length ? "✓ Complete" : "Next →";
  };

  indicators.forEach((button) => {
    button.addEventListener("click", () => {
      currentStep = Number(button.dataset.referralStep || 1);
      render();
    });
  });

  previous?.addEventListener("click", () => {
    currentStep = Math.max(1, currentStep - 1);
    render();
  });

  next?.addEventListener("click", () => {
    currentStep = currentStep >= panels.length ? 1 : currentStep + 1;
    render();
  });

  render();
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-copy-referral-code]")) {
    copyReferralCode().catch(() => announceReferralStatus("Copy failed. Select the code manually."));
    return;
  }

  if (event.target.closest("[data-copy-referral-text]")) {
    copyReferralText().catch(() => announceReferralStatus("Copy failed. Select the message manually."));
    return;
  }

  if (event.target.closest("[data-open-referral-form]")) {
    openReferralForm();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  renderStudentReferral();
  setupReferralStepper();
});

window.renderStudentReferral = renderStudentReferral;
window.getStudentReferralCode = (profile = readStudentSession()) => createReferralCode(profile || {});
