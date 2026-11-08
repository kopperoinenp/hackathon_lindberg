import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const importLimit = 8 * 1024 * 1024;
export const importFormats = ["csv", "xlsx", "json"];
const run = promisify(execFile);
const parser = fileURLToPath(new URL("../scripts/read-import.py", import.meta.url));
const venv = fileURLToPath(
  new URL(
    process.platform === "win32" ? "../.venv/Scripts/python.exe" : "../.venv/bin/python",
    import.meta.url,
  ),
);

export async function readImportFile(bytes, format) {
  if (!importFormats.includes(format)) throw new Error("Supported formats are CSV, XLSX and JSON.");
  if (!bytes.length || bytes.length > importLimit) throw new Error("Use a file up to 8 MiB.");
  let raw = bytes.toString("utf8");
  if (format !== "json") {
    const directory = await mkdtemp(path.join(tmpdir(), "lindberg-import-"));
    const file = path.join(directory, "source." + format);
    try {
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
      ({ stdout: raw } = await run(
        process.env.PYTHON || (existsSync(venv) ? venv : "python"),
        [parser, file],
        { timeout: 30000, maxBuffer: 24 * 1024 * 1024 },
      ));
    } catch {
      throw new Error("Could not read the file. Check its format and the server's Python setup.");
    } finally {
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      await rmdir(directory);
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Invalid table JSON.");
  }
  if (format !== "json" && typeof parsed?.importError === "string")
    throw new Error(parsed.importError.slice(0, 240));
  return parsed;
}
