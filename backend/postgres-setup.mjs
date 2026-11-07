import { readFile } from "node:fs/promises";
import pg from "pg";
import { subsetDataset } from "./request-context.mjs";

export const prototypeProfiles = [
  {
    id: "demo-all",
    name: "Demo – kaikki asiakkaat",
    customers: ["CUST001", "CUST002", "CUST003"],
    write: true,
  },
  {
    id: "kam-a",
    name: "KAM A – NorthStar ja Apex",
    customers: ["CUST001", "CUST002"],
    write: true,
  },
  { id: "kam-b", name: "KAM B – Apex ja Mediora", customers: ["CUST002", "CUST003"], write: true },
  { id: "viewer", name: "Katselija – vain Apex", customers: ["CUST002"], write: false },
];

export async function setupPrototype(adminUrl, { data, password, role = "kam_prototype_app" }) {
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(role)) throw new Error("Invalid runtime role");
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      await readFile(new URL("./migrations/001_shared_prototype.sql", import.meta.url), "utf8"),
    );
    await client.query(
      await readFile(new URL("./migrations/002_fixture_imports.sql", import.meta.url), "utf8"),
    );
    await client.query(
      await readFile(new URL("./migrations/003_dashboard_metrics.sql", import.meta.url), "utf8"),
    );
    const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount;
    if (!exists)
      await client.query(
        `CREATE ROLE ${pg.escapeIdentifier(role)} LOGIN PASSWORD ${pg.escapeLiteral(password)}`,
      );
    await client.query(`GRANT USAGE ON SCHEMA public TO ${pg.escapeIdentifier(role)}`);
    await client.query(
      `GRANT SELECT ON prototype_users, customer_datasets, customer_access, customer_reviews TO ${pg.escapeIdentifier(role)}`,
    );
    await client.query(`GRANT INSERT, UPDATE ON customer_reviews TO ${pg.escapeIdentifier(role)}`);
    await client.query(`GRANT INSERT ON review_audit TO ${pg.escapeIdentifier(role)}`);
    await client.query(
      `GRANT USAGE ON SEQUENCE review_audit_id_seq TO ${pg.escapeIdentifier(role)}`,
    );
    await client.query(
      `GRANT SELECT ON source_customer_mapping, dataset_versions TO ${pg.escapeIdentifier(role)}`,
    );
    await client.query(
      `GRANT SELECT (id,sequence,tenant_id,customer_id,source_id,checksum,calculation_version,status,attempts,created_at,updated_at,report,error) ON data_imports TO ${pg.escapeIdentifier(role)}`,
    );
    await client.query(`GRANT INSERT ON data_imports TO ${pg.escapeIdentifier(role)}`);
    await client.query(`GRANT SELECT, INSERT ON dashboard_jobs TO ${pg.escapeIdentifier(role)}`);
    await client.query(
      `GRANT USAGE ON SEQUENCE data_imports_sequence_seq TO ${pg.escapeIdentifier(role)}`,
    );
    const workerRole = `${role}_worker`;
    const worker = pg.escapeIdentifier(workerRole);
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [workerRole])).rowCount)
      await client.query(
        `CREATE ROLE ${worker} LOGIN PASSWORD ${pg.escapeLiteral(password + "_worker")}`,
      );
    await client.query(`GRANT USAGE ON SCHEMA public TO ${worker}`);
    await client.query(`GRANT SELECT, UPDATE ON data_imports TO ${worker}`);
    await client.query(
      `GRANT SELECT ON customer_access, source_customer_mapping, customer_datasets TO ${worker}`,
    );
    await client.query(
      `GRANT UPDATE (dataset,name,updated_at,publication_sequence,active_import_id) ON customer_datasets TO ${worker}`,
    );
    await client.query(`GRANT SELECT, INSERT ON dataset_versions TO ${worker}`);
    await client.query(`GRANT SELECT, UPDATE ON dashboard_jobs TO ${worker}`);
    for (const table of [
      "data_imports",
      "customer_access",
      "source_customer_mapping",
      "customer_datasets",
      "dataset_versions",
      "dashboard_jobs",
    ]) {
      const policy = pg.escapeIdentifier(`${workerRole}_service`);
      await client.query(`DROP POLICY IF EXISTS ${policy} ON ${table}`);
      await client.query(
        `CREATE POLICY ${policy} ON ${table} TO ${worker} USING (true) WITH CHECK (true)`,
      );
    }
    for (const customer of data.customers) {
      await client.query(
        "INSERT INTO customer_datasets(tenant_id,customer_id,name,dataset) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [
          "demo",
          customer.customer_id,
          customer.customer_name,
          JSON.stringify(subsetDataset(data, [customer.customer_id])),
        ],
      );
      await client.query(
        "INSERT INTO source_customer_mapping(tenant_id,source_id,external_id,customer_id) VALUES('demo','project-fixture',$1,$1) ON CONFLICT DO NOTHING",
        [customer.customer_id],
      );
    }
    for (const profile of prototypeProfiles) {
      await client.query(
        "INSERT INTO prototype_users(id,tenant_id,display_name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [profile.id, "demo", profile.name],
      );
      for (const customer of profile.customers)
        await client.query(
          "INSERT INTO customer_access(tenant_id,user_id,customer_id,can_write) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          ["demo", profile.id, customer, profile.write],
        );
    }
    await client.query("COMMIT");
    const runtimeUrl = new URL(adminUrl);
    runtimeUrl.username = role;
    runtimeUrl.password = password;
    return runtimeUrl.toString();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}
