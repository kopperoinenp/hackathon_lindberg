import { readFileSync, statSync } from "node:fs";
import "../frontend/mockups/kopperoinenp/dataset.js";
import { requestContext } from "./request-context.mjs";

const defaultSource = new URL("../frontend/mockups/kopperoinenp/data.js", import.meta.url);
const maxBytes = 16 * 1024 * 1024;
function loadSource(path) {
  try {
    const stats = statSync(path);
    if (!stats.isFile() || stats.size > maxBytes) return "";
    const bytes = readFileSync(path);
    return bytes.length <= maxBytes ? bytes.toString("utf8") : "";
  } catch {
    return "";
  }
}

export const datasetSource = loadSource(process.env.REVIEW_DATASET || defaultSource);
export const { data: fixtureDataset } = globalThis.ReviewDataset.inspect(datasetSource);
const emptyDataset = fixtureDataset
  ? { ...fixtureDataset, customers: [], sites: [], records: [], detail: [], cycleGroups: [] }
  : null;
// Existing calculation modules read this request-local, database-backed view in shared mode.
export const dataset = fixtureDataset
  ? new Proxy(fixtureDataset, {
      get(target, key) {
        const context = requestContext.getStore();
        return Reflect.get(context ? (context.data ?? emptyDataset) : target, key);
      },
    })
  : null;
