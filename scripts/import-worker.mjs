import { setTimeout } from "node:timers/promises";
import { createImportWorker } from "../backend/import-worker.mjs";
if (!process.env.IMPORT_DATABASE_URL) throw new Error("IMPORT_DATABASE_URL is required.");
const worker = createImportWorker(process.env.IMPORT_DATABASE_URL);
let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
try {
  while (!stopping) {
    try {
      if (await worker.runOnce()) continue;
    } catch {
      console.error("Import worker is waiting for the database; queued jobs are retained.");
    }
    await setTimeout(1000);
  }
} finally {
  await worker.close();
}
