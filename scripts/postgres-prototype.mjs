import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fixtureDataset } from "../backend/dataset.mjs";
import { setupPrototype } from "../backend/postgres-setup.mjs";

export async function startPrototypeDatabase({ directory, port = 54339 }) {
  directory = path.resolve(directory);
  await mkdir(directory, { recursive: true });
  const configPath = path.join(directory, "credentials.json");
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    config = {
      adminPassword: randomBytes(32).toString("hex"),
      appPassword: randomBytes(32).toString("hex"),
    };
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  }
  const databaseDir = path.join(directory, "data");
  let startupLog = "";
  const database = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: config.adminPassword,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    autoRehydrateSymlinks: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: (message) => {
      startupLog = (startupLog + String(message)).slice(-3000);
    },
    onError: () => {},
  });
  try {
    if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await database.initialise();
    await database.start();
  } catch {
    throw new Error(`Local PostgreSQL startup failed. ${startupLog.trim()}`);
  }
  try {
    const adminUrl = new URL(`postgresql://postgres@127.0.0.1:${port}/postgres`);
    adminUrl.password = config.adminPassword;
    const runtimeUrl = await setupPrototype(adminUrl.toString(), {
      data: fixtureDataset,
      password: config.appPassword,
    });
    const workerUrl = new URL(runtimeUrl);
    workerUrl.username += "_worker";
    workerUrl.password = config.appPassword + "_worker";
    return {
      runtimeUrl,
      workerUrl: workerUrl.toString(),
      adminUrl: adminUrl.toString(),
      stop: () => database.stop(),
    };
  } catch (error) {
    await database.stop();
    throw error;
  }
}
