import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const localPython = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const python = process.env.PYTHON || (existsSync(localPython) ? localPython : "python");
const node = process.execPath;
const steps = [
  [python, ["-m", "ruff", "check", "."]],
  [python, ["-m", "ruff", "format", "--check", "."]],
  [
    node,
    [
      "node_modules/eslint/bin/eslint.js",
      "frontend/mockups",
      "backend",
      "scripts",
      "tests",
      "eslint.config.mjs",
    ],
  ],
  [
    node,
    [
      "node_modules/prettier/bin/prettier.cjs",
      "--check",
      "frontend/mockups",
      "backend",
      "scripts",
      "tests",
      "package.json",
      "eslint.config.mjs",
      ".prettierrc.json",
      ".github/workflows/quality.yml",
    ],
  ],
  [node, ["--test", "tests/*.test.mjs"]],
];
for (const [command, args] of steps) {
  console.log(`Checking: ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("All quality checks passed.");
