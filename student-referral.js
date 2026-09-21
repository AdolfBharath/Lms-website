import { REFERRAL_FORM_URL, createReferralCode, createReferralText } from "./modules/referral-code.js";

const STUDENT_SESSION_KEYS = ["jenovateStudentSession", "jenovateCurrentUser"];

function readStudentSession() {
  let fallback = null;
  for (const key of STUDENT_SESSION_KEYS) {
    try {
      const profile = JSON.parse(sessionStorage.getItem(key) || "null");
      if (String(profile?.role || "").toLowerCase() === "student") return profile;
      if (!fallback && profile?.id) fallback = profile;
    } catch (error) {
      sessionStorage.removeItem(key);
    }
  }
  return fallback;
}

function renderStudentReferral(profile = readStudentSession()) {
  const view = document.getElementById("referralView");
  if (!view) return;
  if (!profile) {
    hydrateStudentReferral().catch(() => announceReferralStatus("We couldn't load your referral information."));
    return;
  }

  const code = referralKeyForDisplay(profile);
  const referralText = code ? createReferralText({ ...profile, referral_key: code, referral_link: referralLink(code) }) : "";
  const name = studentDisplayName(profile);
  const email = profile.email || "";

  setText("referralStudentName", name);
  setText("referralStudentEmail", email);
  setText("referralAvatar", initials(name || email));
  setText("referralCodeText", code || "Loading...");
  const codeBox = document.querySelector(".referral-code-box");
  codeBox?.classList.toggle("is-pending", !code);
  setValue("referralCodeValue", code);
  setValue("referralShareText", code ? referralText : "Loading your referral link...");
  setText("referralFormUrl", code ? referralLink(code) : "Loading...");
  setText("referralCoinsEarned", profile.referral_coins_earned === undefined ? "Loading..." : formatCoins(profile.referral_coins_earned || 0));
  setText("referralInviteCount", profile.referral_count === undefined && profile.referrals === undefined ? "Loading..." : String(Number(profile.referral_count || profile.referrals || 0)));
  loadStudentReferralSummary(profile, code).catch(() => announceReferralStatus("We couldn't load your referral information."));
  hydrateStudentReferral(profile).catch(() => {});
  setupReferralStepper();
}

async function hydrateStudentReferral(baseProfile = readStudentSession()) {
  const client = window.getLmsPlatformClient?.();
  const authUser = await currentAuthUser(client);
  const liveProfile = await fetchStudentProfile(client, baseProfile, authUser);
  const profile = mergeProfiles(baseProfile, authUser, liveProfile);
  if (!profile) return null;
  persistStudentProfile(profile);
  renderStudentReferralProfile(profile);
  return profile;
}

function renderStudentReferralProfile(profile) {
  const code = referralKeyForDisplay(profile);
  const name = studentDisplayName(profile);
  const email = profile.email || "";
  setText("referralStudentName", name);
  setText("referralStudentEmail", email);
  setText("referralAvatar", initials(name || email));
  setText("referralCodeText", code || "Loading...");
  setValue("referralCodeValue", code);
  document.querySelector(".referral-code-box")?.classList.toggle("is-pending", !code);
  setValue("referralShareText", code ? createReferralText({ ...profile, referral_key: code, referral_link: referralLink(code) }) : "Loading your referral link...");
  setText("referralFormUrl", code ? referralLink(code) : "Loading...");
}

async function currentAuthUser(client) {
  try {
    const { data } = await client?.auth?.getUser?.();
    return data?.user || null;
  } catch {
    return null;
  }
}

async function fetchStudentProfile(client, baseProfile, authUser) {
  if (!client?.from) return null;
  const selectors = [
    authUser?.id ? ["auth_user_id", authUser.id] : null,
    baseProfile?.auth_user_id ? ["auth_user_id", baseProfile.auth_user_id] : null,
    baseProfile?.id ? ["id", baseProfile.id] : null,
    authUser?.email ? ["email", authUser.email] : null,
    baseProfile?.email ? ["email", baseProfile.email] : null
  ].filter(Boolean);

  for (const [column, value] of selectors) {
    try {
      const query = client.from("users")
        .select("id,auth_user_id,name,full_name,display_name,email,role,username,phone,coins,coin_balance,referral,referral_key,referral_count,referral_coins_earned")
        .eq(column, value)
        .limit(1);
      const { data, error } = await query;
      if (error) continue;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) return row;
    } catch {
      // Older SDK/query combinations can fail differently; try the next identifier.
    }
  }
  return null;
}

function mergeProfiles(baseProfile, authUser, liveProfile) {
  const merged = {
    ...(baseProfile || {}),
    ...(authUser ? { auth_user_id: authUser.id, email: authUser.email } : {}),
    ...(liveProfile || {})
  };
  return Object.values(merged).some(Boolean) ? merged : null;
}

function persistStudentProfile(profile) {
  for (const key of STUDENT_SESSION_KEYS) {
    sessionStorage.setItem(key, JSON.stringify(profile));
  }
}

async function loadStudentReferralSummary(profile, fallbackCode) {
  const client = window.getLmsPlatformClient?.();
  if (!client?.rpc) return;
  const { data, error } = await client.rpc("lms_student_wallet_summary");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return;
  const code = referralKeyForDisplay({ ...profile, referral_key: row.referral_key || fallbackCode, referral_code: row.referral_code });
  setText("referralCodeText", code || "Loading...");
  document.querySelector(".referral-code-box")?.classList.toggle("is-pending", !code);
  setValue("referralCodeValue", code);
  setValue("referralShareText", code ? createReferralText({ ...profile, referral_key: code, referral_link: referralLink(code) }) : "Loading your referral link...");
  setText("referralFormUrl", code ? referralLink(code) : "Loading...");
  setText("referralInviteCount", String(Number(row.referral_count || 0)));
  setText("referralCoinsEarned", formatCoins(row.referral_coins_earned || 0));
}

async function copyReferralCode() {
  const code = document.getElementById("referralCodeValue")?.value || "";
  if (!code) return;
  await copyText(code);
  announceReferralStatus("Refer Key copied");
}

async function copyReferralText() {
  const text = document.getElementById("referralShareText")?.value || "";
  if (!text) return;
  await copyText(text);
  announceReferralStatus("Referral message copied.");
}

function openReferralForm() {
  const code = document.getElementById("referralCodeValue")?.value || "";
  window.open(code ? referralLink(code) : REFERRAL_FORM_URL, "_blank", "noopener,noreferrer");
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

function studentDisplayName(profile = {}) {
  const value = [
    profile.display_name,
    profile.full_name,
    profile.name,
    profile.username,
    profile.email
  ]
    .map((item) => String(item || "").trim())
    .find((item) => item && !/^(student|student user|learner|learner user|user)$/i.test(item));
  if (!value) return "Student";
  return value.includes("@") ? value.split("@")[0] : value;
}

function formatCoins(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "0";
}

function databaseReferralKey(profile = {}) {
  const code = String(profile.referral_key || profile.referralKey || "").trim();
  if (!code || /^jnv-?(?:0+|pending|account)$/i.test(code)) return "";
  return code.toUpperCase();
}

function referralKeyForDisplay(profile = {}) {
  return databaseReferralKey(profile) || createReferralCode(profile);
}

function referralLink(code) {
  const value = encodeURIComponent(code);
  return `${window.location.origin}/form-engine/index.html?category=student_registration&ref=${value}`;
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
window.hydrateStudentReferral = hydrateStudentReferral;
