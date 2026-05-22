export const REFERRAL_FORM_URL = "https://forms.gle/RGxPJsL4fcWsSBJp6";

export function createReferralCode(profile = {}) {
  const seed = [
    profile.id,
    profile.email,
    profile.username,
    profile.name,
    profile.created_at
  ].filter(Boolean).join("|") || "student";

  const hash = fnv1a(seed).toString(36).toUpperCase().padStart(7, "0").slice(-7);
  const tail = sanitize(seed).slice(-3).padStart(3, "X");
  return `JNV-${hash}${tail}`;
}

export function createReferralText(profile = {}) {
  const name = profile.name || profile.username || "A Jenovate student";
  const code = createReferralCode(profile);
  return `${name} invited you to Jenovate LMS. Use referral code ${code}.`;
}

function sanitize(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
