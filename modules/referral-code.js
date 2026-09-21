export const REFERRAL_FORM_URL = "https://forms.gle/RGxPJsL4fcWsSBJp6";

const REFERRAL_FIELDS = [
  "referral_key",
  "referralKey",
  "referral_code",
  "referralCode",
  "referral",
  "invite_code",
  "inviteCode"
];

export function createReferralCode(profile = {}) {
  const storedCode = REFERRAL_FIELDS
    .map((field) => cleanCode(profile?.[field]))
    .find(Boolean);
  if (storedCode) return storedCode;

  const seed = [
    profile?.auth_user_id,
    profile?.id,
    profile?.email,
    profile?.phone,
    profile?.username,
    profile?.name
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (!seed) return "";

  return `JNV-${hashReferralSeed(seed)}`;
}

export function createReferralText(profile = {}) {
  const code = createReferralCode(profile);
  const name = referralDisplayName(profile);
  const link = String(profile.referral_link || "").trim() || REFERRAL_FORM_URL;
  return [
    `Hi, ${name} invited you to join Jenovate LMS.`,
    `Use referral code ${code} in the official enrollment form: ${link}`
  ].join("\n");
}

export function referralCodeFromProfile(profile = {}) {
  return createReferralCode(profile);
}

function cleanCode(value) {
  const code = String(value || "").trim();
  if (!code || /^jnv-?(?:0+|pending|account)$/i.test(code)) return "";
  return code.toUpperCase();
}

function hashReferralSeed(value) {
  let hash = 0x811c9dc5;
  const seed = String(value || "").toLowerCase();
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(-7);
}

function referralDisplayName(profile = {}) {
  const value = [
    profile.display_name,
    profile.full_name,
    profile.name,
    profile.username,
    profile.email
  ]
    .map((item) => String(item || "").trim())
    .find((item) => item && !/^(student|student user|learner|learner user|user)$/i.test(item));
  if (!value) return "I";
  return value.includes("@") ? value.split("@")[0] : value;
}
