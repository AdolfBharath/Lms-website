import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBrotliCompress, createGzip } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] || 4173);

const contentTypes = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp4", "video/mp4"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"]
]);

const compressedTypes = /^(application\/javascript|application\/json|image\/svg\+xml|text\/)/;

const blockedSegments = new Set([
  ".git",
  ".netlify",
  ".next",
  ".vercel",
  ".vscode",
  "app",
  "docs",
  "learnwith",
  "node_modules",
  "qa-artifacts",
  "qa-report",
  "scripts",
  "supabase",
  "test-results",
  "tests"
]);

function resolveRequestPath(url = "/") {
  const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith(".") || blockedSegments.has(segment))) return null;
  const absolutePath = path.resolve(root, ...segments);
  if (!absolutePath.startsWith(root + path.sep)) return null;
  if (!contentTypes.has(path.extname(absolutePath).toLowerCase())) return null;
  return absolutePath;
}

const server = http.createServer(async (request, response) => {
  const requestedPath = resolveRequestPath(request.url);
  const absolutePath = requestedPath ? await webpVariantPath(request, requestedPath) : null;
  if (!absolutePath) {
    response.writeHead(404, securityHeaders("text/plain; charset=utf-8"));
    response.end("Not found");
    return;
  }

  try {
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) throw new Error("Not a file");
    const extension = path.extname(absolutePath).toLowerCase();
    const contentType = contentTypes.get(extension) || "application/octet-stream";
    const etag = `"${fileStats.size.toString(16)}-${Math.floor(fileStats.mtimeMs).toString(16)}"`;
    const lastModified = fileStats.mtime.toUTCString();
    const baseHeaders = {
      ...securityHeaders(contentType),
      "Cache-Control": cacheControl(absolutePath),
      ETag: etag,
      "Last-Modified": lastModified,
      Vary: "Accept, Accept-Encoding"
    };

    if (request.headers["if-none-match"] === etag || isNotModifiedSince(request, fileStats.mtimeMs)) {
      response.writeHead(304, baseHeaders);
      response.end();
      return;
    }

    if (request.method === "HEAD") {
      response.writeHead(200, { ...baseHeaders, "Content-Length": fileStats.size });
      response.end();
      return;
    }

    const encoding = preferredEncoding(request, contentType, fileStats.size);
    if (encoding) {
      response.writeHead(200, { ...baseHeaders, "Content-Encoding": encoding });
      const compressor = encoding === "br" ? createBrotliCompress() : createGzip();
      createReadStream(absolutePath).pipe(compressor).pipe(response);
      return;
    }

    response.writeHead(200, {
      ...baseHeaders,
      "Cache-Control": cacheControl(absolutePath),
      "Content-Length": fileStats.size
    });
    createReadStream(absolutePath).pipe(response);
  } catch {
    response.writeHead(404, securityHeaders("text/plain; charset=utf-8"));
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Static LMS server running at http://${host}:${port}`);
});

function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
}

function cacheControl(absolutePath) {
  return /\.(css|js|png|jpe?g|webp|avif|svg|gif|ico|mp4|pdf|woff2?|ttf)$/i.test(absolutePath)
    ? "public, max-age=31536000, immutable"
    : "no-store";
}

function preferredEncoding(request, contentType, size) {
  if (!compressedTypes.test(contentType) || size < 1024) return "";
  const accept = String(request.headers["accept-encoding"] || "");
  if (/\bgzip\b/.test(accept)) return "gzip";
  if (/\bbr\b/.test(accept)) return "br";
  return "";
}

function isNotModifiedSince(request, mtimeMs) {
  const value = request.headers["if-modified-since"];
  if (!value) return false;
  const timestamp = new Date(String(value)).getTime();
  return Number.isFinite(timestamp) && timestamp >= Math.floor(mtimeMs);
}

async function webpVariantPath(request, absolutePath) {
  const accept = String(request.headers.accept || "");
  if (!accept.includes("image/webp") || !/\.(png|jpe?g)$/i.test(absolutePath)) return absolutePath;
  const parsed = path.parse(absolutePath);
  const candidate = path.join(parsed.dir, `${parsed.name}.webp`);
  try {
    await access(candidate);
    return candidate;
  } catch {
    return absolutePath;
  }
}
