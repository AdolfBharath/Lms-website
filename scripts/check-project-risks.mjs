import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const lineBudgets = new Map([
  ["admin.js", 5900],
  ["mentor.js", 4700],
  ["student.js", 6700],
  ["student.css", 4050],
  ["student-learning-dashboard-split.css", 4900],
  ["student-batch-support-split.css", 3900],
  ["student-premium-shell-split.css", 2550],
  ["student-referral-profile-split.css", 2150],
  ["student-batch-profile-shop-split.css", 2050],
  ["student-tasks-split.css", 1700],
  ["student-discussions-tasks-split.css", 1500],
  ["student-referral-support-split.css", 1350],
  ["student-mycourses-learning-split.css", 1200],
  ["student-courses-split.css", 1250],
  ["student-support-split.css", 650],
  ["styles.css", 11400]
]);

const requiredDeployIgnores = [
  ".env",
  ".env.*",
  "docs",
  "learnwith",
  "node_modules",
  "scripts",
  "supabase",
  "test-results",
  "tests"
];

const browserExtensions = new Set([".css", ".html", ".js", ".json"]);
const browserSkipDirs = new Set([
  ".agents",
  ".git",
  ".netlify",
  ".vercel",
  ".vscode",
  "docs",
  "form-engine/node_modules",
  "learnwith",
  "node_modules",
  "scripts",
  "supabase",
  "test-results",
  "tests"
]);

const findings = [];

await checkLineBudgets();
await checkDeployIgnores(".netlifyignore");
await checkDeployIgnores(".vercelignore");
await checkSecretLeaks();

if (findings.length) {
  console.error("Project risk checks failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log("Project risk checks passed.");

async function checkLineBudgets() {
  for (const [relativePath, maxLines] of lineBudgets) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    const lines = source.split(/\r?\n/).length;
    if (lines > maxLines) {
      findings.push(`${relativePath} has ${lines} lines, above the ${maxLines} line budget. Extract shared code before adding more.`);
    }
  }
}

async function checkDeployIgnores(file) {
  const source = await readFile(path.join(root, file), "utf8");
  const entries = new Set(source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  for (const entry of requiredDeployIgnores) {
    if (!entries.has(entry)) {
      findings.push(`${file} must exclude ${entry} from static deployments.`);
    }
  }
}

async function checkSecretLeaks() {
  const files = await listBrowserDeliveredFiles(root);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativePath = path.relative(root, file).replaceAll(path.sep, "/");
    if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(?!replace-with)/i.test(source)) {
      findings.push(`${relativePath} appears to assign a SUPABASE_SERVICE_ROLE_KEY in browser-delivered source.`);
    }
    if (/(service_role|supabase_service_role_key)["']?\s*[:=]\s*["'][^"']{20,}/i.test(source)) {
      findings.push(`${relativePath} appears to contain service-role key material in browser-delivered source.`);
    }
    if (/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/.test(source)) {
      findings.push(`${relativePath} contains a JWT-shaped value. Keep service-role and user tokens out of static files.`);
    }
  }
}

async function listBrowserDeliveredFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      if (browserSkipDirs.has(relativePath) || browserSkipDirs.has(entry.name)) continue;
      files.push(...await listBrowserDeliveredFiles(absolutePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const fileStats = await stat(absolutePath);
    if (fileStats.size > 2 * 1024 * 1024) continue;
    if (browserExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolutePath);
  }
  return files;
}
