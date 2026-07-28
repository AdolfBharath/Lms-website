import { access, readFile } from "node:fs/promises";
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

console.log(`Static build verification passed for ${requiredFiles.length} required files.`);
