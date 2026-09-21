import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const statePath = path.join(root, "test-results", "playwright-webserver.json");

export default async function globalTeardown() {
  let state = null;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return;
  } finally {
    await rm(statePath, { force: true });
  }

  if (!state?.managed || !state.pid) return;
  await killProcessTree(Number(state.pid));
}

function killProcessTree(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return Promise.resolve();
  if (process.platform === "win32") {
    return run("C:\\Windows\\System32\\taskkill.exe", ["/PID", String(pid), "/T", "/F"])
      .then(() => {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // taskkill may already have removed it.
        }
      });
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // The process may already be gone.
    }
  }
  return Promise.resolve();
}

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", resolve);
    child.on("exit", resolve);
  });
}
