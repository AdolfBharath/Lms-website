// ==========================================
// SUPABASE CONFIGURATION
// ==========================================
// Replace these values with the ones from your Supabase Dashboard
// (Go to Project Settings -> API)

window.SUPABASE_URL = 'https://agrzjwnsapbanbvgbwkh.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_jrJRXGYEYpixwOAUS6kIWA_ccT4jZs6';

window.getSupabaseClient = function getSupabaseClient() {
  if (window.supabaseClient) {
    return window.supabaseClient;
  }

  if (!window.supabase?.createClient) {
    return null;
  }

  window.supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "jenovate-supabase-auth"
      }
    }
  );

  return window.supabaseClient;
};

window.createSupabaseSignedUrl = async function createSupabaseSignedUrl(bucket, pathOrUrl, expiresIn = 60 * 60) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";

  const marker = `/storage/v1/object/public/${bucket}/`;
  let path = "";
  if (value.includes(marker)) {
    path = decodeURIComponent(value.split(marker)[1].split("?")[0] || "");
  } else if (/^https?:\/\//i.test(value)) {
    return value;
  } else {
    path = value.replace(new RegExp(`^${bucket}:`), "");
  }

  const client = window.getSupabaseClient?.();
  if (!client?.storage || !path) return value;

  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return value;
  return data.signedUrl;
};

const supabaseAssetCache = new Map();

window.resolveSupabaseAssetUrl = async function resolveSupabaseAssetUrl(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(support-attachments|assignment-submissions|study-materials):(.*)$/);
  if (!match) return value;
  if (!supabaseAssetCache.has(raw)) {
    supabaseAssetCache.set(raw, window.createSupabaseSignedUrl(match[1], match[2]));
  }
  return supabaseAssetCache.get(raw);
};

window.resolveSupabaseAssetsDeep = async function resolveSupabaseAssetsDeep(value, seen = new WeakSet()) {
  if (typeof value === "string") return window.resolveSupabaseAssetUrl(value);
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = await window.resolveSupabaseAssetsDeep(value[index], seen);
    }
    return value;
  }
  for (const key of Object.keys(value)) {
    value[key] = await window.resolveSupabaseAssetsDeep(value[key], seen);
  }
  return value;
};

window.getSupabaseClient();
