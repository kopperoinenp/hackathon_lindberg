import { createHash, randomUUID } from "node:crypto";
import { fixtureDataset } from "./dataset.mjs";
import { subsetDataset } from "./request-context.mjs";
import { PresentationError } from "./presentation-model.mjs";
import "../frontend/mockups/kopperoinenp/model.js";

export const importCalculationVersion = "fixture-controls-v1";
export const importColumns =
  "id, customer_id, source_id, checksum, calculation_version, status, attempts, created_at, updated_at, report, error";
// JSONB changes object key order. Hash canonical data rather than its serialization order.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export const checksum = (data) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(data)))
    .digest("hex");

export function importControls(data) {
  const rows = data.records.filter((row) => row.month.startsWith(data.year + "-"));
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  return {
    customers: data.customers.length,
    sites: data.sites.length,
    records: data.records.length,
    analysisRecords: rows.length,
    detail: data.detail?.length ?? 0,
    cycles: data.cycleGroups?.length ?? 0,
    washedPieces: sum("washed_pieces"),
    repairs: sum("repair_count"),
    waterLitres: sum("allocated_water_l"),
    washedKg: sum("customer_washed_kg"),
  };
}

export function validateImport(job) {
  const data = job.payload;
  const inspected = globalThis.ReviewDataset.inspect(JSON.stringify(data));
  if (inspected.issue)
    throw Object.assign(new Error(inspected.issue.message), { field: inspected.issue.field });
  if (data.customers.length !== 1 || data.customers[0].customer_id !== job.customer_id)
    throw new Error("Source customer does not match the import customer.");
  if (checksum(data) !== job.checksum) throw new Error("Source checksum mismatch.");
  const controls = importControls(data);
  if (checksum(controls) !== checksum(job.expected_controls))
    throw new Error("Source control totals do not match.");
  const metrics = globalThis.ReviewModel.aggregate(data, job.customer_id);
  if (
    Math.abs(metrics.water - controls.waterLitres) > 0.001 ||
    metrics.repairs !== controls.repairs
  )
    throw new Error("Calculated metrics do not match the source control totals.");
  return {
    controls,
    metrics,
    calculationVersion: job.calculation_version,
    source: job.source_id,
    synthetic: true,
  };
}

export function fixtureImports(store, user) {
  async function permitted(client, customer, write = false) {
    const { rows } = await client.query(
      "SELECT can_write FROM customer_access WHERE tenant_id=$1 AND user_id=$2 AND customer_id=$3",
      [user.tenant_id, user.id, customer],
    );
    if (!rows.length || (write && !rows[0].can_write))
      throw new PresentationError("No access to this customer.", 403);
  }
  return {
    list: (customer) =>
      store.transaction(user, async (client) => {
        await permitted(client, customer);
        const jobs = (
          await client.query(
            `SELECT ${importColumns} FROM data_imports WHERE tenant_id=$1 AND customer_id=$2 ORDER BY sequence DESC LIMIT 20`,
            [user.tenant_id, customer],
          )
        ).rows;
        const active = (
          await client.query(
            "SELECT active_import_id,updated_at FROM customer_datasets WHERE tenant_id=$1 AND customer_id=$2",
            [user.tenant_id, customer],
          )
        ).rows[0];
        return { jobs, activeVersion: active.active_import_id, updatedAt: active.updated_at };
      }),
    get: (id) =>
      store.transaction(user, async (client) => {
        const row = (
          await client.query(`SELECT ${importColumns} FROM data_imports WHERE id=$1`, [id])
        ).rows[0];
        if (!row) throw new PresentationError("Import not found.", 404);
        return row;
      }),
    enqueue: (customer) =>
      store.transaction(user, async (client) => {
        await permitted(client, customer, true);
        const mapping = (
          await client.query(
            "SELECT external_id FROM source_customer_mapping WHERE tenant_id=$1 AND source_id='project-fixture' AND customer_id=$2",
            [user.tenant_id, customer],
          )
        ).rows[0];
        if (
          !mapping ||
          !fixtureDataset?.customers.some((c) => c.customer_id === mapping.external_id)
        )
          throw new PresentationError("No project fixture mapping for this customer.", 400);
        const payload = subsetDataset(fixtureDataset, [mapping.external_id]);
        // This connector has an explicit identity mapping; unknown/mismatched source IDs are never guessed.
        if (mapping.external_id !== customer)
          throw new PresentationError("Fixture mapping needs review.", 400);
        const hash = checksum(payload);
        const params = [
          user.tenant_id,
          customer,
          "project-fixture",
          hash,
          importCalculationVersion,
        ];
        const inserted = await client.query(
          `INSERT INTO data_imports(id,tenant_id,customer_id,source_id,checksum,calculation_version,requested_by,payload,expected_controls) VALUES($6,$1,$2,$3,$4,$5,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING ${importColumns}`,
          [
            ...params,
            randomUUID(),
            user.id,
            JSON.stringify(payload),
            JSON.stringify(importControls(payload)),
          ],
        );
        const job =
          inserted.rows[0] ??
          (
            await client.query(
              `SELECT ${importColumns} FROM data_imports WHERE tenant_id=$1 AND customer_id=$2 AND source_id=$3 AND checksum=$4 AND calculation_version=$5`,
              params,
            )
          ).rows[0];
        return { job, duplicate: !inserted.rowCount };
      }),
  };
}
