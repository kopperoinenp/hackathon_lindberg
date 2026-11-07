import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeImport } from "../backend/import-analysis.mjs";
import { importLimit, readImportFile } from "../backend/import-file.mjs";

const [customer, input, ...flags] = process.argv.slice(2);
try {
  if (!customer || !input || flags.length > 1 || flags.some((flag) => flag !== "--share-schema"))
    throw new Error("Usage: node scripts/analyze-import.mjs CUSTOMER FILE [--share-schema]");
  const source = await stat(input);
  if (!source.isFile() || source.size > importLimit) throw new Error("Import limit is 8 MiB.");
  const format = path.extname(input).slice(1).toLowerCase();
  const report = await analyzeImport(await readImportFile(await readFile(input), format), {
    customer,
    allowSchemaSharing: flags.includes("--share-schema"),
  });
  const directory = path.resolve(".local", "imports", customer);
  await mkdir(directory, { recursive: true });
  const destination = path.join(directory, report.datasetVersion + ".json");
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8" });
  console.log(
    `${report.status}: ${report.tools.length} tools, ${report.suggestions.length} suggestions`,
  );
  console.log(destination);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
