// Explicit opt-in: sends synthetic KAM scenarios to the configured backend provider.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
if (!process.argv.includes("--live"))
  throw new Error("Use --live to run paid provider evaluations.");
if (existsSync(".env")) process.loadEnvFile(".env");
const { runReviewChat } = await import("../backend/review-chat.mjs");
const { generateStructured, providerConfig } = await import("../backend/ai-provider.mjs");
if (!providerConfig().configured || providerConfig().provider === "deterministic")
  throw new Error("Configure an AI provider before running live evaluations.");
const { kamCases, initialWorkspace } = await import("../tests/kam-cases.mjs");
const repeat = Number(process.argv.find((a) => a.startsWith("--repeat="))?.split("=")[1] ?? 1);
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 3) throw new Error("Repeat must be 1–3");
const selected = process.argv
  .find((a) => a.startsWith("--cases="))
  ?.split("=")[1]
  ?.split(",");
if (selected?.some((id) => !kamCases.some((c) => c.id === id)))
  throw new Error("Unknown case ID; see tests/kam-cases.mjs");
const results = [];
const directory = path.resolve("work/kam-evaluation");
await mkdir(directory, { recursive: true });
const report = path.join(directory, `live-${Date.now()}.json`);
for (let run = 1; run <= repeat; run++) {
  for (const scenario of kamCases.filter((c) => !selected || selected.includes(c.id))) {
    const workspace = scenario.seed?.() ?? initialWorkspace();
    const started = Date.now();
    let response,
      passed = false,
      error;
    const generations = [];
    try {
      response = await runReviewChat(
        { message: scenario.message, workspace, history: scenario.history ?? [] },
        {
          generate: async (request, options) => {
            const output = await generateStructured(request, options);
            generations.push({ name: request.name, output });
            return output;
          },
        },
      );
      if (!scenario.check) throw new Error("Expected input validation error");
      scenario.check(response, workspace);
      passed = true;
    } catch (failure) {
      if (scenario.error?.includes(failure.status)) passed = true;
      else error = failure.message;
    }
    const row = {
      id: scenario.id,
      run,
      passed,
      milliseconds: Date.now() - started,
      error,
      response,
      generations,
    };
    results.push(row);
    await writeFile(
      report,
      JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2),
    );
    console.log(
      `${passed ? "PASS" : "FAIL"} ${scenario.id} (${row.milliseconds} ms)${error ? `: ${error}` : ""}`,
    );
  }
}
console.log(`Results: ${results.filter((r) => r.passed).length}/${results.length}; ${report}`);
process.exitCode = results.every((r) => r.passed) ? 0 : 1;
