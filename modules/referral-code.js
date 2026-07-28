export const REFERRAL_FORM_URL = "https://forms.gle/RGxPJsL4fcWsSBJp6";

const REFERRAL_FIELDS = [
  "referral_code",
  "referralCode",
  "referral",
  "referral_key",
  "referralKey",
  "invite_code",
  "inviteCode"
];

export function createReferralCode(profile = {}) {
  const storedCode = REFERRAL_FIELDS
    .map((field) => cleanCode(profile?.[field]))
    .find(Boolean);
  if (storedCode) return storedCode;

  const seed = cleanCode(profile?.id || profile?.email || profile?.username || profile?.name);
  if (!seed) return "JNV-PENDING";

  const compact = seed.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `JNV-${compact.slice(-8).padStart(8, "0")}`;
}

export function createReferralText(profile = {}) {
  const code = createReferralCode(profile);
  const name = profile?.name || profile?.username || "I";
  return [
    `Hi, ${name} invited you to join Jenovate LMS.`,
    `Use referral code ${code} in the official enrollment form: ${REFERRAL_FORM_URL}`
  ].join("\n");
}

export function referralCodeFromProfile(profile = {}) {
  return createReferralCode(profile);
}

function cleanCode(value) {
  const code = String(value || "").trim();
  if (!code || /^jnv-?0+$/i.test(code)) return "";
  return code.toUpperCase();
}
