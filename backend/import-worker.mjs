import pg from "pg";
import { validateImport, importCalculationVersion } from "./fixture-import.mjs";
import { runDashboardJob } from "./dashboard-worker.mjs";

// A row lock is the lease: process death rolls back the entire attempt and releases the job.
// SKIP LOCKED supports multiple workers; publication and job completion commit together.
export function createImportWorker(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
  });
  pool.on("error", () => {});
  async function runOnce() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = (
        await client.query(
          "SELECT * FROM data_imports WHERE status='queued' AND available_at<=now() ORDER BY sequence FOR UPDATE SKIP LOCKED LIMIT 1",
        )
      ).rows[0];
      if (!job) {
        const analyzed = await runDashboardJob(client);
        await client.query("COMMIT");
        return analyzed;
      }
      // Serialize per customer, including independently enqueued versions.
      const lock = (
        await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked", [
          JSON.stringify([job.tenant_id, job.customer_id]),
        ])
      ).rows[0].locked;
      if (!lock) {
        await client.query("ROLLBACK");
        return false;
      }
      await client.query(
        "UPDATE data_imports SET attempts=attempts+1,updated_at=now() WHERE id=$1",
        [job.id],
      );
      await client.query("SAVEPOINT processing");
      try {
        const access = (
          await client.query(
            "SELECT 1 FROM customer_access WHERE tenant_id=$1 AND customer_id=$2 AND user_id=$3 AND can_write",
            [job.tenant_id, job.customer_id, job.requested_by],
          )
        ).rowCount;
        const mapped = (
          await client.query(
            "SELECT 1 FROM source_customer_mapping WHERE tenant_id=$1 AND customer_id=$2 AND source_id=$3 AND external_id=$2",
            [job.tenant_id, job.customer_id, job.source_id],
          )
        ).rowCount;
        if (!access || !mapped)
          throw new Error("Import permission or source mapping is no longer valid.");
        if (job.calculation_version !== importCalculationVersion)
          throw new Error("Unsupported calculation version.");
        const report = validateImport(job);
        const publication = await client.query(
          "UPDATE customer_datasets SET dataset=$1,name=$2,updated_at=now(),publication_sequence=$3,active_import_id=$4 WHERE tenant_id=$5 AND customer_id=$6 AND publication_sequence<$3",
          [
            JSON.stringify(job.payload),
            job.payload.customers[0].customer_name,
            job.sequence,
            job.id,
            job.tenant_id,
            job.customer_id,
          ],
        );
        if (publication.rowCount)
          await client.query(
            "INSERT INTO dataset_versions(tenant_id,customer_id,import_id,report) VALUES($1,$2,$3,$4)",
            [job.tenant_id, job.customer_id, job.id, JSON.stringify(report)],
          );
        await client.query(
          "UPDATE data_imports SET status=$2,report=$3,error=NULL,updated_at=now() WHERE id=$1",
          [job.id, publication.rowCount ? "ready" : "superseded", JSON.stringify(report)],
        );
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT processing");
        const transient = /^(08|40|53|57)/.test(error.code ?? "");
        const retry = transient && job.attempts < 2;
        const safeError = error.code
          ? { message: "Database processing failed.", code: error.code }
          : { message: error.message, field: error.field };
        await client.query(
          "UPDATE data_imports SET status=$2,error=$3,updated_at=now(),available_at=now()+interval '2 seconds' WHERE id=$1",
          [job.id, retry ? "queued" : "failed", JSON.stringify(safeError)],
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return { runOnce, close: () => pool.end() };
}
