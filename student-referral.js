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

document.addEventListener("DOMContentLoaded", () => renderStudentReferral());

window.renderStudentReferral = renderStudentReferral;
window.getStudentReferralCode = (profile = readStudentSession()) => createReferralCode(profile || {});
