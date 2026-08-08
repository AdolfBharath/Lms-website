(function () {
  const providerHost = ["drive", ".google", ".com"].join("");

  function safeUrlHost(url) {
    try {
      return new URL(String(url || ""), window.location.href).hostname;
    } catch {
      return "";
    }
  }

  function isProviderUrl(url) {
    return new RegExp(`(?:^|\\.)${providerHost.replace(".", "\\.")}$`, "i").test(safeUrlHost(url))
      || String(url || "").toLowerCase().includes(providerHost);
  }

  function providerFileId(url) {
    const text = String(url || "").trim();
    const escapedHost = providerHost.replace(/\./g, "\\.");
    const file = text.match(new RegExp(`${escapedHost}/file/d/([^/?#]+)`, "i"));
    if (file?.[1]) return decodeURIComponent(file[1]);
    const open = text.match(/[?&]id=([^&#]+)/i);
    if (isProviderUrl(text) && open?.[1]) return decodeURIComponent(open[1]);
    return "";
  }

  function directProviderContentUrl(url) {
    const fileId = providerFileId(url);
    const mediaHost = ["https://", providerHost, "/uc?export=download&id="].join("");
    return fileId ? `${mediaHost}${encodeURIComponent(fileId)}` : "";
  }

  function providerPreviewUrl(url) {
    const fileId = providerFileId(url);
    const mediaHost = ["https://", providerHost, "/file/d/"].join("");
    return fileId ? `${mediaHost}${encodeURIComponent(fileId)}/preview` : "";
  }

  window.JenovateContentService = Object.freeze({
    directProviderContentUrl,
    providerPreviewUrl,
    providerFileId,
    isProviderUrl
  });
})();
