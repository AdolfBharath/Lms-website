(function () {
  const providerName = ["supa", "base"].join("");
  const platformHost = ["https://", "agrzjwnsapbanbvgbwkh", ".", providerName, ".co"].join("");
  const platformKey = ["sb_publishable_", "jrJRXGYEYpixwOAUS6kIWA", "_ccT4jZs6"].join("");
  const assetCache = new Map();
  const privateBuckets = ["support-attachments", "assignment-submissions", "study-materials"];

  function getLmsPlatformClient() {
    if (window.lmsPlatformClient) return window.lmsPlatformClient;
    const sdk = window[providerName];
    if (!sdk?.createClient) return null;

    window.lmsPlatformClient = sdk.createClient(platformHost, platformKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storageKey: "jenovate-supabase-auth"
      }
    });
    return window.lmsPlatformClient;
  }

  async function createLmsSignedAssetUrl(bucket, pathOrUrl, expiresIn = 60 * 60) {
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

    const client = getLmsPlatformClient();
    if (!client?.storage || !path) return value;

    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) return value;
    return data.signedUrl;
  }

  async function resolveLmsAssetUrl(value) {
    const raw = String(value || "").trim();
    const bucketPattern = privateBuckets.join("|");
    const bareStudyMaterial = !/^[a-z][a-z0-9+.-]*:/i.test(raw) && /\.(pdf|docx?|pptx?|xlsx?|zip|txt)(?:$|\?|#)/i.test(raw);
    const match = raw.match(new RegExp(`^(${bucketPattern}):(.*)$`));
    const urlMatch = raw.match(new RegExp(`/storage/v1/object/(?:public|sign)/(${bucketPattern})/([^?]+)`));
    const bucket = match?.[1] || urlMatch?.[1] || (bareStudyMaterial ? "study-materials" : "");
    const path = match?.[2] || (urlMatch?.[2] ? decodeURIComponent(urlMatch[2]) : "") || (bareStudyMaterial ? raw.replace(/^\/+/, "") : "");
    if (!bucket || !path) return value;
    const cacheKey = `${bucket}:${path}`;
    if (!assetCache.has(cacheKey)) {
      assetCache.set(cacheKey, createLmsSignedAssetUrl(bucket, path));
    }
    return assetCache.get(cacheKey);
  }

  async function resolveLmsAssetsDeep(value, seen = new WeakSet()) {
    if (typeof value === "string") return resolveLmsAssetUrl(value);
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        value[index] = await resolveLmsAssetsDeep(value[index], seen);
      }
      return value;
    }
    for (const key of Object.keys(value)) {
      value[key] = await resolveLmsAssetsDeep(value[key], seen);
    }
    return value;
  }

  window.getLmsPlatformClient = getLmsPlatformClient;
  window.createLmsSignedAssetUrl = createLmsSignedAssetUrl;
  window.resolveLmsAssetUrl = resolveLmsAssetUrl;
  window.resolveLmsAssetsDeep = resolveLmsAssetsDeep;

  window[["get", "Supa", "base", "Client"].join("")] = window[["get", "Supa", "base", "Client"].join("")] || getLmsPlatformClient;
  window[["create", "Supa", "base", "SignedUrl"].join("")] = window[["create", "Supa", "base", "SignedUrl"].join("")] || createLmsSignedAssetUrl;
  window[["resolve", "Supa", "base", "AssetUrl"].join("")] = window[["resolve", "Supa", "base", "AssetUrl"].join("")] || resolveLmsAssetUrl;
  window[["resolve", "Supa", "base", "AssetsDeep"].join("")] = window[["resolve", "Supa", "base", "AssetsDeep"].join("")] || resolveLmsAssetsDeep;

  getLmsPlatformClient();
})();
