import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["--test", "tests/shared-prototype.test.mjs"], {
  env: { ...process.env, RUN_POSTGRES_TESTS: "1" },
  stdio: "inherit",
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
