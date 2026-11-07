// Local-only prototype launcher. Does not provision a login or alter the existing .env.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startPrototypeDatabase } from "./postgres-prototype.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const db = await startPrototypeDatabase({
  directory: process.env.PROTOTYPE_DB_DIR || path.join(root, ".local/shared-prototype"),
  port: Number(process.env.PROTOTYPE_PG_PORT || 54339),
});
console.log("PostgreSQL prototype ready. Profiles are selectable; there is no authentication.");
const child = spawn(process.execPath, ["scripts/preview.mjs"], {
  cwd: root,
  env: { ...process.env, REVIEW_STORE: "postgres", DATABASE_URL: db.runtimeUrl },
  stdio: "inherit",
});
const worker = spawn(process.execPath, ["scripts/import-worker.mjs"], {
  cwd: root,
  env: { ...process.env, IMPORT_DATABASE_URL: db.workerUrl },
  stdio: "inherit",
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill();
  worker.kill();
  await db.stop();
}
process.on("SIGINT", () => {
  stop().catch(() => {});
});
process.on("SIGTERM", () => {
  stop().catch(() => {});
});
child.on("error", async () => {
  await stop();
  process.exitCode = 1;
});
worker.on("error", async () => {
  await stop();
  process.exitCode = 1;
});
worker.on("exit", async () => {
  if (!stopping) {
    await stop();
    process.exitCode = 1;
  }
});
child.on("exit", async (code) => {
  await stop();
  process.exitCode = code ?? 0;
});
