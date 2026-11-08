import { access, mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { PresentationError } from "./presentation-model.mjs";

export async function openPowerPoint(file) {
  if (process.platform !== "win32")
    throw new PresentationError("Use Download PowerPoint to open this file on your device.", 501);
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean);
  const candidates = roots.flatMap((root) => [
    path.join(root, "Microsoft Office", "root", "Office16", "POWERPNT.EXE"),
    path.join(root, "Microsoft Office", "Office16", "POWERPNT.EXE"),
  ]);
  let executable;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executable = candidate;
      break;
    } catch {
      // Check the other standard Office installation paths.
    }
  }
  if (!executable)
    throw new PresentationError(
      "PowerPoint was not found. Use Download PowerPoint to save the file.",
      503,
    );
  if (!file.localPath) {
    const directory = await mkdtemp(path.join(tmpdir(), "lindstrom-presentation-"));
    const localPath = path.join(directory, file.name);
    await writeFile(localPath, file.bytes, { flag: "wx" });
    file.localPath = localPath;
  }
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(executable, [file.localPath], {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } catch {
    throw new PresentationError(
      "PowerPoint could not start. Use Download PowerPoint to save the file.",
      503,
    );
  }
}
