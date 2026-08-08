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

window.getLmsPlatformClient = window.getLmsPlatformClient || window.getSupabaseClient;

window.createSupabaseSignedUrl = async function createSupabaseSignedUrl(bucket, pathOrUrl, expiresIn = 60 * 60) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";

  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  let path = "";
  if (value.includes(publicMarker)) {
    path = decodeURIComponent(value.split(publicMarker)[1].split("?")[0] || "");
  } else if (value.includes(signedMarker)) {
    path = decodeURIComponent(value.split(signedMarker)[1].split("?")[0] || "");
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
  const urlMatch = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/(support-attachments|assignment-submissions|study-materials)\/([^?]+)/);
  const bucket = match?.[1] || urlMatch?.[1] || "";
  const path = match?.[2] || (urlMatch?.[2] ? decodeURIComponent(urlMatch[2]) : "");
  if (!bucket || !path) return value;
  const cacheKey = `${bucket}:${path}`;
  if (!supabaseAssetCache.has(cacheKey)) {
    supabaseAssetCache.set(cacheKey, window.createSupabaseSignedUrl(bucket, path));
  }
  return supabaseAssetCache.get(cacheKey);
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
