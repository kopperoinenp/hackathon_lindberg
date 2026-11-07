import { readFileSync, statSync } from "node:fs";
import "../frontend/mockups/kopperoinenp/dataset.js";

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
export const { data: dataset } = globalThis.ReviewDataset.inspect(datasetSource);
