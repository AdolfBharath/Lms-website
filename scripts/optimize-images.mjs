import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const excluded = new Set(["node_modules", ".next", ".git", "learnwith"]);
const sourceExtensions = new Set([".jpg", ".jpeg", ".png"]);
const maxWidth = 1920;
const quality = 82;
const minBytes = 180 * 1024;

async function walk(dir, output = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, output);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
      const stat = await fs.stat(full);
      if (stat.size >= minBytes) output.push({ full, size: stat.size });
    }
  }
  return output;
}

async function optimize(file) {
  const parsed = path.parse(file.full);
  const target = path.join(parsed.dir, `${parsed.name}.webp`);
  try {
    await fs.access(target);
    return { source: file.full, target, skipped: "exists" };
  } catch {
    // Create a sibling WebP and keep the original as backup/source of truth.
  }

  const image = sharp(file.full, { failOn: "none" });
  const metadata = await image.metadata();
  const pipeline = metadata.width && metadata.width > maxWidth
    ? image.resize({ width: maxWidth, withoutEnlargement: true })
    : image;
  await pipeline.webp({ quality, effort: 4 }).toFile(target);
  const outputStat = await fs.stat(target);
  return {
    source: path.relative(root, file.full),
    target: path.relative(root, target),
    before: file.size,
    after: outputStat.size,
    saved: file.size - outputStat.size
  };
}

const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 40);
const files = (await walk(root)).sort((a, b) => b.size - a.size).slice(0, limit);
const results = [];
for (const file of files) {
  results.push(await optimize(file));
}

const saved = results.reduce((sum, result) => sum + Math.max(0, result.saved || 0), 0);
console.log(JSON.stringify({ processed: results.length, saved, results }, null, 2));
