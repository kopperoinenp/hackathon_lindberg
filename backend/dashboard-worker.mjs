import { calculateDashboard, dashboardCalculationVersion } from "./dashboard-model.mjs";
import { versionSql } from "./dashboard-api.mjs";

export async function runDashboardJob(client) {
  const job = (
    await client.query(
      "SELECT * FROM dashboard_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
    )
  ).rows[0];
  if (!job) return false;
  await client.query("SAVEPOINT analysis");
  try {
    const allowed = (
      await client.query(
        "SELECT 1 FROM customer_access WHERE tenant_id=$1 AND customer_id=$2 AND user_id=$3",
        [job.tenant_id, job.customer_id, job.requested_by],
      )
    ).rowCount;
    if (!allowed) throw new Error("The requesting profile no longer has access to this customer.");
    if (job.calculation_version !== dashboardCalculationVersion)
      throw new Error("Unsupported dashboard calculation version.");
    let data;
    if (job.dataset_version.startsWith("bootstrap-")) {
      data = (
        await client.query(
          `SELECT dataset FROM customer_datasets WHERE tenant_id=$1 AND customer_id=$2 AND ${versionSql}=$3`,
          [job.tenant_id, job.customer_id, job.dataset_version],
        )
      ).rows[0]?.dataset;
    } else {
      data = (
        await client.query(
          "SELECT i.payload FROM data_imports i JOIN dataset_versions v ON v.tenant_id=i.tenant_id AND v.customer_id=i.customer_id AND v.import_id=i.id WHERE i.tenant_id=$1 AND i.customer_id=$2 AND i.id::text=$3",
          [job.tenant_id, job.customer_id, job.dataset_version],
        )
      ).rows[0]?.payload;
    }
    if (!data) throw new Error("This dataset version is no longer available. Reload the customer.");
    const result = calculateDashboard(data, job.scope);
    result.metadata = {
      sites: data.sites,
      baselines: data.baselines,
      source: data.source,
      months: [
        ...new Set(
          data.records.filter((r) => r.month.startsWith(data.year + "-")).map((r) => r.month),
        ),
      ].sort(),
    };
    const encoded = JSON.stringify(result);
    if (Buffer.byteLength(encoded) > 200 * 1024)
      throw new Error("Dashboard response exceeds the prototype size limit.");
    await client.query(
      "UPDATE dashboard_jobs SET status='ready',result=$2,error=NULL,updated_at=now() WHERE id=$1",
      [job.id, encoded],
    );
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT analysis");
    if (error.code) throw error; // A database interruption rolls the job back into the durable queue.
    await client.query(
      "UPDATE dashboard_jobs SET status='failed',error=$2,updated_at=now() WHERE id=$1",
      [job.id, error.message],
    );
  }
  return true;
}
