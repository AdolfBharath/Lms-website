import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseURL = "http://127.0.0.1:4173";
const statePath = path.join(root, "test-results", "playwright-webserver.json");

export default async function globalSetup() {
  await mkdir(path.dirname(statePath), { recursive: true });

  if (await isServerAvailable()) {
    await writeFile(statePath, JSON.stringify({ managed: false }, null, 2));
    return;
  }

  const child = spawn(process.execPath, ["scripts/static-server.mjs"], {
    cwd: root,
    detached: false,
    env: { ...process.env, FORCE_COLOR: "", NO_COLOR: "1" },
    stdio: "ignore"
  });
  child.unref();
  await writeFile(statePath, JSON.stringify({ managed: true, pid: child.pid }, null, 2));
  await waitForServer();
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isServerAvailable()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Static LMS server did not start at ${baseURL}`);
}

async function isServerAvailable() {
  try {
    const response = await fetch(baseURL, { method: "HEAD" });
    return response.status < 500;
  } catch {
    return false;
  }
}
