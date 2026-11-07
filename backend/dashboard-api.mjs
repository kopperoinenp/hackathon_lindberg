import { randomUUID } from "node:crypto";
import { PresentationError } from "./presentation-model.mjs";
import { dashboardCalculationVersion as calculationVersion } from "./dashboard-model.mjs";

export const versionSql = "COALESCE(active_import_id::text,'bootstrap-'||updated_at::text)";
const fields = ["customer", "from", "to", "site", "country", "continent", "baseline"];
export const dashboardScopeKey = (scope) => JSON.stringify(fields.map((field) => scope[field]));
export function dashboardScope(customer, params) {
  const scope = {
    customer,
    from: params.get("from") ?? "2025-01",
    to: params.get("to") ?? "2025-12",
    site: params.get("site") ?? "all",
    country: params.get("country") ?? "all",
    continent: params.get("continent") ?? "all",
    baseline: params.get("baseline") ?? "B_LOCAL",
  };
  if (
    ![scope.from, scope.to].every((m) => /^2025-(0[1-9]|1[0-2])$/.test(m)) ||
    scope.from > scope.to ||
    !/^([A-Za-z0-9_-]{1,64})$/.test(scope.site) ||
    !["all", "Finland", "Sweden", "Poland"].includes(scope.country) ||
    !["all", "Europe"].includes(scope.continent) ||
    !["B_LOCAL", "B_HOME", "B_INHOUSE"].includes(scope.baseline)
  )
    throw new PresentationError("Invalid dashboard filters.");
  return scope;
}
export function dashboardApi(store, user) {
  return {
    snapshot: (id, scope) =>
      store.transaction(user, async (client) => {
        if (typeof id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
          throw new PresentationError("Load the dashboard metrics before continuing.", 409);
        const row = (
          await client.query(
            "SELECT id,customer_id,dataset_version,calculation_version,scope_key,result FROM dashboard_jobs WHERE id=$1 AND status='ready'",
            [id],
          )
        ).rows[0];
        if (
          !row ||
          row.customer_id !== scope.customer ||
          row.calculation_version !== calculationVersion ||
          row.scope_key !== dashboardScopeKey(scope)
        )
          throw new PresentationError(
            "Dashboard metrics do not match this selection. Reload the dashboard.",
            409,
          );
        return {
          id: row.id,
          datasetVersion: row.dataset_version,
          calculationVersion,
          metrics: row.result,
        };
      }),
    catalog: () =>
      store.transaction(user, async (c) => {
        const customers = (
          await c.query(
            "SELECT dataset->'customers'->0 AS customer FROM customer_datasets ORDER BY customer_id LIMIT 50",
          )
        ).rows.map((r) => r.customer);
        const first = (
          await c.query(
            "SELECT dataset->>'source' AS source,dataset->>'year' AS year,dataset->'baselines' AS baselines FROM customer_datasets ORDER BY customer_id LIMIT 1",
          )
        ).rows[0];
        return {
          ...first,
          customers,
          sites: [],
          products: [],
          records: [],
          detail: [],
          cycleGroups: [],
          status: "SYNTHETIC",
          months: Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`),
        };
      }),
    get: (customer, params, pinned = null) =>
      store.transaction(user, async (c) => {
        const scope = dashboardScope(customer, params);
        const current = (
          await c.query(
            `SELECT ${versionSql} AS version,dataset->'sites' AS sites FROM customer_datasets WHERE tenant_id=$1 AND customer_id=$2`,
            [user.tenant_id, customer],
          )
        ).rows[0];
        if (!current) throw new PresentationError("No access to this customer.", 403);
        const sites = pinned?.metrics.metadata.sites ?? current.sites;
        if (scope.site !== "all" && !sites.some((s) => s.site_id === scope.site))
          throw new PresentationError("Unknown customer site.");
        const version = params.get("version") ?? current.version;
        if (version.length > 100) throw new PresentationError("Invalid dataset version.");
        const key = dashboardScopeKey(scope);
        const args = [user.tenant_id, customer, version, calculationVersion, key];
        const find = async () =>
          (
            await c.query(
              "SELECT id,status,result,error,updated_at FROM dashboard_jobs WHERE tenant_id=$1 AND customer_id=$2 AND dataset_version=$3 AND calculation_version=$4 AND scope_key=$5",
              args,
            )
          ).rows[0];
        const receipt = (row) => ({
          status: row.status === "ready" ? 200 : row.status === "failed" ? 422 : 202,
          body: {
            id: row.id,
            status: row.status,
            datasetVersion: version,
            currentVersion: current.version,
            calculationVersion,
            updatedAt: row.updated_at,
            ...(row.status === "ready" ? { metrics: row.result } : {}),
            ...(row.error ? { error: row.error } : {}),
          },
        });
        const existing = await find();
        if (existing) return receipt(existing);
        const archivedPublication =
          pinned && pinned.datasetVersion === version && !version.startsWith("bootstrap-");
        if (version !== current.version && !archivedPublication)
          throw new PresentationError(
            "New customer data is available. Reload to use its metrics.",
            409,
          );
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [
          JSON.stringify([user.tenant_id, customer]),
        ]);
        const duplicate = await find();
        if (duplicate) return receipt(duplicate);
        const count = (
          await c.query(
            "SELECT count(*) FROM dashboard_jobs WHERE tenant_id=$1 AND customer_id=$2 AND status='queued'",
            [user.tenant_id, customer],
          )
        ).rows[0].count;
        if (Number(count) >= 20)
          throw new PresentationError(
            "Too many queued analyses. Wait for current calculations.",
            429,
          );
        const row = (
          await c.query(
            "INSERT INTO dashboard_jobs(id,tenant_id,customer_id,dataset_version,calculation_version,scope_key,scope,requested_by) VALUES($6,$1,$2,$3,$4,$5,$7,$8) RETURNING id,status,updated_at",
            [...args, randomUUID(), JSON.stringify(scope), user.id],
          )
        ).rows[0];
        return receipt(row);
      }),
  };
}
