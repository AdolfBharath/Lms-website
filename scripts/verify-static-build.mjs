import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "index.html",
  "login.html",
  "admin.html",
  "mentor.html",
  "student.html",
  "join-form.html",
  "supabase-config.js",
  "auth-session.js",
  "modules/portal-data.js",
  "modules/dom-utils.js",
  "modules/portal-utils.js",
  "assets/vendor/supabase-2.49.4.js"
];

for (const file of requiredFiles) {
  await access(path.join(root, file));
}

for (const file of ["index.html", "login.html", "admin.html", "mentor.html", "student.html"]) {
  const source = await readFile(path.join(root, file), "utf8");
  if (/\/api\/legacy-static|_next\/|next\//i.test(source)) {
    throw new Error(`${file} still references the removed Next compatibility layer.`);
  }
}

await runNodeScript("scripts/check-project-risks.mjs");

console.log(`Static build verification passed for ${requiredFiles.length} required files.`);

function runNodeScript(relativePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, relativePath)], {
      cwd: root,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${relativePath} failed with exit code ${code}.`));
    });
  });
}
