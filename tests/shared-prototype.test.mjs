import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import pg from "pg";
import JSZip from "jszip";
import { fixtureDataset, dataset } from "../backend/dataset.mjs";
import { requestContext, subsetDataset } from "../backend/request-context.mjs";
import { createPostgresStore } from "../backend/postgres-store.mjs";
import { sharedPrototype } from "../backend/shared-prototype.mjs";
import { setupPrototype } from "../backend/postgres-setup.mjs";
import { runReviewChat, chatSchema } from "../backend/review-chat.mjs";
import { startPrototypeDatabase } from "../scripts/postgres-prototype.mjs";
import { createImportWorker } from "../backend/import-worker.mjs";
import { fixtureImports, checksum, importControls } from "../backend/fixture-import.mjs";

test("customer subset includes only authorized customer rows and remains valid without CUST001", () => {
  const filtered = subsetDataset(fixtureDataset, ["CUST002"]);
  assert.equal(
    subsetDataset(
      { ...fixtureDataset, unmappedCustomerTable: [{ customer: "CUST001", private: true }] },
      ["CUST002"],
    ).unmappedCustomerTable,
    undefined,
  );
  assert.deepEqual(
    filtered.customers.map((c) => c.customer_id),
    ["CUST002"],
  );
  for (const key of ["records", "detail", "cycleGroups"])
    assert.ok(filtered[key].every((r) => r.customer === "CUST002"));
  assert.equal(
    globalThis.ReviewDataset.inspect(`globalThis.REVIEW_DATA = ${JSON.stringify(filtered)};`).issue,
    null,
  );
});
test("parallel request contexts cannot share customer data", async () => {
  const values = await Promise.all(
    ["CUST001", "CUST002"].map((customer) =>
      requestContext.run({ data: subsetDataset(fixtureDataset, [customer]) }, async () => {
        await Promise.resolve();
        return dataset.customers.map((c) => c.customer_id);
      }),
    ),
  );
  assert.deepEqual(values, [["CUST001"], ["CUST002"]]);
  assert.equal(dataset.customers.length, fixtureDataset.customers.length);
});
test("selectable prototype profiles are refused in production", () => {
  assert.throws(
    () => sharedPrototype({ REVIEW_STORE: "postgres", NODE_ENV: "production" }),
    /cannot run in production/,
  );
  assert.equal(sharedPrototype({}), null);
});

async function preview(t, runtimeUrl) {
  const child = spawn(process.execPath, ["scripts/preview.mjs"], {
    env: {
      ...process.env,
      PORT: "0",
      REVIEW_STORE: "postgres",
      DATABASE_URL: runtimeUrl,
      PRESENTATION_PROVIDER: "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error("Shared preview did not start")), 15000);
    child.on("error", reject);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.on("exit", () => {
      clearTimeout(timeout);
      reject(new Error("Shared preview exited early"));
    });
  });
}

test(
  "real PostgreSQL: shared customer data, personal reviews, RLS, HTTP isolation and exports",
  { skip: process.env.RUN_POSTGRES_TESTS !== "1", timeout: 180000 },
  async (t) => {
    let runtimeUrl, adminUrl;
    const suffix = randomUUID().replaceAll("-", "");
    if (process.env.TEST_DATABASE_ADMIN_URL) {
      const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_ADMIN_URL });
      await admin.connect();
      const databaseName = `kam_shared_test_${suffix}`;
      const role = `kam_test_${suffix}`;
      await admin.query(
        `CREATE DATABASE ${pg.escapeIdentifier(databaseName)} ENCODING 'UTF8' TEMPLATE template0`,
      );
      const url = new URL(process.env.TEST_DATABASE_ADMIN_URL);
      url.pathname = `/${databaseName}`;
      adminUrl = url.toString();
      t.after(async () => {
        await admin.query(`DROP DATABASE ${pg.escapeIdentifier(databaseName)} WITH (FORCE)`);
        await admin.query(`DROP ROLE IF EXISTS ${pg.escapeIdentifier(role)}`);
        await admin.query(`DROP ROLE IF EXISTS ${pg.escapeIdentifier(role + "_worker")}`);
        await admin.end();
      });
      runtimeUrl = await setupPrototype(adminUrl, { data: fixtureDataset, password: suffix, role });
    } else {
      await mkdir("work", { recursive: true });
      const directory = await mkdtemp(path.resolve("work/pg-test-"));
      const db = await startPrototypeDatabase({
        directory,
        port: Number(process.env.TEST_PG_PORT || 54340),
      });
      ({ runtimeUrl, adminUrl } = db);
      t.after(() => db.stop());
    }
    const store = createPostgresStore(runtimeUrl);
    t.after(() => store.close());
    const a = await store.context("kam-a"),
      b = await store.context("kam-b"),
      viewer = await store.context("viewer");
    const under = (context, fn) => requestContext.run(context, fn);
    const workspace = { scope: { customer: "CUST002" }, savings: 40000, note: "Only KAM A" };
    await t.test(
      "the assistant receives only allowed customer names and schema identifiers",
      async () => {
        await under(b, () =>
          runReviewChat(
            { workspace: { scope: { customer: "CUST002" } }, message: "Näytä katsaus" },
            {
              generate: async (request) => {
                assert.ok(!request.input.includes("NorthStar"));
                assert.ok(!JSON.stringify(request.schema).includes('"CUST001"'));
                return {
                  ...Object.fromEntries(chatSchema.required.map((key) => [key, null])),
                  scope: Object.fromEntries(
                    chatSchema.properties.scope.required.map((key) => [key, null]),
                  ),
                  supported: true,
                  analysisTools: null,
                };
              },
            },
          ),
        );
      },
    );
    await t.test("database row policies filter customer lists", async () => {
      assert.deepEqual(
        a.data.customers.map((c) => c.customer_id),
        ["CUST001", "CUST002"],
      );
      assert.deepEqual(
        b.data.customers.map((c) => c.customer_id),
        ["CUST002", "CUST003"],
      );
      const rows = await store.transaction(
        b.user,
        async (client) =>
          (await client.query("SELECT customer_id FROM customer_datasets ORDER BY customer_id"))
            .rows,
      );
      assert.deepEqual(
        rows.map((r) => r.customer_id),
        ["CUST002", "CUST003"],
      );
    });
    await t.test("identical customer IDs in different organizations cannot mix data", async () => {
      const admin = new pg.Client({ connectionString: adminUrl });
      await admin.connect();
      try {
        const other = subsetDataset(fixtureDataset, ["CUST002"]);
        other.customers[0] = { ...other.customers[0], customer_name: "Foreign tenant Apex" };
        await admin.query(
          "INSERT INTO prototype_users(id,tenant_id,display_name) VALUES('other-tenant','other','Other organization')",
        );
        await admin.query(
          "INSERT INTO customer_datasets(tenant_id,customer_id,name,dataset) VALUES('other','CUST002','Foreign tenant Apex',$1)",
          [JSON.stringify(other)],
        );
        await admin.query(
          "INSERT INTO customer_access(tenant_id,user_id,customer_id) VALUES('other','other-tenant','CUST002')",
        );
      } finally {
        await admin.end();
      }
      const other = await store.context("other-tenant");
      assert.equal(other.data.customers[0].customer_name, "Foreign tenant Apex");
      assert.ok(
        !(await store.context("kam-a")).data.customers.some(
          (c) => c.customer_name === "Foreign tenant Apex",
        ),
      );
    });
    await t.test("two users share facts and keep personal KAM changes separate", async () => {
      assert.deepEqual(
        a.data.records.filter((r) => r.customer === "CUST002"),
        b.data.records.filter((r) => r.customer === "CUST002"),
      );
      await under(a, () => store.reviews(a.user).save("CUST002", { revision: 0, workspace }));
      assert.equal((await under(b, () => store.reviews(b.user).read("CUST002"))).workspace, null);
      assert.equal(
        (await under(a, () => store.reviews(a.user).read("CUST002"))).workspace.savings,
        40000,
      );
      await assert.rejects(
        under(b, () => store.reviews(b.user).read("CUST001")),
        (e) => e.status === 403,
      );
    });
    await t.test(
      "separate pools retain saved reviews and reject concurrent stale writes",
      async () => {
        const second = createPostgresStore(runtimeUrl);
        try {
          assert.equal(
            (await under(a, () => second.reviews(a.user).read("CUST002"))).workspace.note,
            "Only KAM A",
          );
          const results = await under(a, () =>
            Promise.allSettled(
              [store, second].map((s) =>
                s.reviews(a.user).save("CUST002", { revision: 1, workspace }),
              ),
            ),
          );
          assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
          assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
        } finally {
          await second.close();
        }
      },
    );
    await t.test("read-only grants block API storage and direct SQL writes", async () => {
      await assert.rejects(
        under(viewer, () => store.reviews(viewer.user).save("CUST002", { revision: 0, workspace })),
        (e) => e.status === 403,
      );
      await assert.rejects(
        store.transaction(viewer.user, (c) =>
          c.query(
            "INSERT INTO customer_reviews(tenant_id,customer_id,owner_id,revision,workspace) VALUES('demo','CUST002','viewer',1,$1)",
            [JSON.stringify(workspace)],
          ),
        ),
        (e) => e.code === "42501",
      );
    });
    await t.test(
      "a shared dataset update is visible to both users without changing reviews",
      async () => {
        const admin = new pg.Client({ connectionString: adminUrl });
        await admin.connect();
        try {
          await admin.query(
            "UPDATE customer_datasets SET dataset=jsonb_set(dataset,'{customers,0,customer_name}','\"Apex shared update\"'::jsonb) WHERE tenant_id='demo' AND customer_id='CUST002'",
          );
        } finally {
          await admin.end();
        }
        assert.equal(
          (await store.context("kam-a")).data.customers.find((c) => c.customer_id === "CUST002")
            .customer_name,
          "Apex shared update",
        );
        assert.equal(
          (await store.context("kam-b")).data.customers.find((c) => c.customer_id === "CUST002")
            .customer_name,
          "Apex shared update",
        );
        assert.equal(
          (await under(a, () => store.reviews(a.user).read("CUST002"))).workspace.savings,
          40000,
        );
      },
    );
    const origin = await preview(t, runtimeUrl);
    const call = (user, url, body) =>
      fetch(origin + url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: `demo_user=${user}`,
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    await t.test("browser dataset and encoded aliases cannot expose hidden customers", async () => {
      const paths = ["/kopperoinenp/data.js", "/kopperoinenp/%64ata.js", "/kopperoinenp//data.js"];
      if (process.platform === "win32") paths.push("/KOPPEROINENP/DATA.JS");
      for (const url of paths) {
        const response = await call("kam-b", url);
        assert.equal(response.status, 410);
        const source = await response.text();
        assert.ok(!source.includes("NorthStar"));
        assert.ok(!source.includes("washed_pieces"));
      }
      assert.equal((await call("kam-b", "/api/reviews/CUST001")).status, 403);
      assert.equal((await call("unknown", "/api/demo/session")).status, 403);
    });
    await t.test(
      "presentation previews and downloads enforce selected customer and owner",
      async (t) => {
        const forbidden = await call("kam-b", "/api/presentations/preview", {
          scope: { customer: "CUST001" },
        });
        assert.equal(forbidden.status, 403);
        const workerUrl = new URL(runtimeUrl);
        workerUrl.username += "_worker";
        workerUrl.password += "_worker";
        const worker = createImportWorker(workerUrl.toString());
        t.after(() => worker.close());
        const dashboardUrl = "/api/v1/customers/CUST002/dashboard";
        assert.equal((await call("kam-a", dashboardUrl)).status, 202);
        await worker.runOnce();
        const snapshot = await (await call("kam-a", dashboardUrl)).json();
        const input = { ...workspace, dashboardSnapshotId: snapshot.id, locked: true };
        const created = await call("kam-a", "/api/presentations", input);
        assert.equal(created.status, 201);
        const receipt = await created.json();
        assert.equal((await call("kam-b", receipt.downloadUrl)).status, 403);
        assert.equal((await call("kam-a", receipt.downloadUrl)).status, 200);
        const own = await call("kam-b", "/api/presentations", input);
        assert.equal(own.status, 201);
        assert.notEqual((await own.json()).id, receipt.id);
      },
    );
    await t.test(
      "profile selection sets a demo cookie and rejects foreign-origin changes",
      async () => {
        const selected = await call("kam-a", "/api/demo/user", { user: "kam-b" });
        assert.equal(selected.status, 200);
        assert.match(
          selected.headers.get("set-cookie"),
          /demo_user=kam-b; HttpOnly; SameSite=Strict/,
        );
        const foreign = await fetch(origin + "/api/demo/user", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://example.com" },
          body: '{"user":"kam-b"}',
        });
        assert.equal(foreign.status, 403);
      },
    );
    await t.test(
      "durable fixture imports validate and publish atomically without changing KAM notes",
      async (t) => {
        const workerUrl = new URL(runtimeUrl);
        workerUrl.username += "_worker";
        workerUrl.password += "_worker";
        const imports = fixtureImports(store, a.user);
        const staged = await imports.enqueue("CUST002");
        assert.equal(staged.job.status, "queued");
        assert.equal(staged.job.payload, undefined);
        assert.equal((await imports.enqueue("CUST002")).job.id, staged.job.id);
        assert.equal((await fixtureImports(store, b.user).enqueue("CUST002")).duplicate, true);
        await assert.rejects(
          fixtureImports(store, viewer.user).enqueue("CUST002"),
          (e) => e.status === 403,
        );
        await assert.rejects(
          fixtureImports(store, b.user).enqueue("CUST001"),
          (e) => e.status === 403,
        );
        assert.equal(
          (await call("viewer", "/api/v1/customers/CUST002/imports", undefined)).status,
          200,
        );
        assert.equal(
          (
            await fetch(origin + "/api/v1/customers/CUST002/imports", {
              method: "POST",
              headers: { Cookie: "demo_user=viewer" },
            })
          ).status,
          403,
        );
        const before = (await store.context("kam-a")).data.customers.find(
          (c) => c.customer_id === "CUST002",
        ).customer_name;
        assert.equal(before, "Apex shared update");
        // A queued import survives disposal of the API connection pool before a worker starts.
        const otherStore = createPostgresStore(runtimeUrl);
        assert.equal(
          (await fixtureImports(otherStore, a.user).get(staged.job.id)).status,
          "queued",
        );
        await otherStore.close();
        const workers = [
          createImportWorker(workerUrl.toString()),
          createImportWorker(workerUrl.toString()),
        ];
        t.after(async () => {
          await Promise.all(workers.map((w) => w.close()));
        });
        const interrupted = new pg.Client({ connectionString: workerUrl.toString() });
        await interrupted.connect();
        await interrupted.query("BEGIN");
        await interrupted.query("UPDATE data_imports SET attempts=attempts+1 WHERE id=$1", [
          staged.job.id,
        ]);
        assert.equal(await workers[0].runOnce(), false); // Locked work is skipped, never double-processed.
        await interrupted.end(); // Connection loss rolls the attempt back and makes the queued job recoverable.
        await Promise.all(workers.map((w) => w.runOnce()));
        assert.equal((await imports.get(staged.job.id)).status, "ready");
        assert.equal((await imports.list("CUST002")).activeVersion, staged.job.id);
        assert.equal(
          (await under(a, () => store.reviews(a.user).read("CUST002"))).workspace.savings,
          40000,
        );
        assert.equal(
          (await store.context("kam-b")).data.customers.find((c) => c.customer_id === "CUST002")
            .customer_name,
          "Apex Industrial Systems",
        );
        assert.equal(
          (await imports.get(staged.job.id)).report.controls.repairs,
          importControls(subsetDataset(fixtureDataset, ["CUST002"])).repairs,
        );
        const admin = new pg.Client({ connectionString: adminUrl });
        await admin.connect();
        t.after(() => admin.end());
        const versions = await admin.query(
          "SELECT count(*) FROM dataset_versions WHERE import_id=$1",
          [staged.job.id],
        );
        assert.equal(Number(versions.rows[0].count), 1);
        await assert.rejects(
          store.transaction(a.user, (c) => c.query("SELECT payload FROM data_imports")),
          (e) => e.code === "42501",
        );
        await assert.rejects(
          store.transaction(a.user, (c) =>
            c.query("UPDATE customer_datasets SET publication_sequence=999"),
          ),
          (e) => e.code === "42501",
        );
        // Connector contract stays fixed: seed staged versions through the admin test fixture only.
        async function stage(mutator, options = {}) {
          const payload = structuredClone(subsetDataset(fixtureDataset, ["CUST002"]));
          payload.customers[0].customer_name += " " + randomUUID();
          mutator(payload);
          const id = randomUUID();
          await admin.query(
            "INSERT INTO data_imports(id,tenant_id,customer_id,requested_by,source_id,checksum,calculation_version,payload,expected_controls,available_at) VALUES($1,'demo','CUST002','kam-a','project-fixture',$2,'fixture-controls-v1',$3,$4,now()+$5::interval)",
            [
              id,
              options.badHash ? "bad-checksum" : checksum(payload),
              JSON.stringify(payload),
              JSON.stringify(options.badControls ? {} : importControls(payload)),
              options.delay ?? "0 seconds",
            ],
          );
          return id;
        }
        for (const options of [{ badHash: true }, { badControls: true }, { invalid: true }]) {
          const id = await stage((d) => {
            if (options.invalid) d.records[0].site = "FOREIGN_SITE";
          }, options);
          await workers[0].runOnce();
          assert.equal((await imports.get(id)).status, "failed");
          assert.equal((await imports.list("CUST002")).activeVersion, staged.job.id);
        }
        const older = await stage(() => {}, { delay: "1 hour" });
        const newer = await stage(() => {});
        await workers[0].runOnce();
        assert.equal((await imports.get(newer)).status, "ready");
        await admin.query("UPDATE data_imports SET available_at=now() WHERE id=$1", [older]);
        await workers[1].runOnce();
        assert.equal((await imports.get(older)).status, "superseded");
        assert.equal((await imports.list("CUST002")).activeVersion, newer);
        const hidden = await fixtureImports(store, a.user).enqueue("CUST001");
        assert.equal((await call("kam-b", `/api/v1/jobs/${hidden.job.id}`)).status, 404);
        assert.equal((await call("kam-b", "/api/v1/customers/CUST001/imports")).status, 403);
        const response = await fetch(origin + "/api/v1/customers/CUST002/imports", {
          method: "POST",
          headers: { Cookie: "demo_user=kam-a" },
        });
        assert.equal(response.status, 200); // Same checksum returns the existing job, never a new publication.
        assert.equal((await response.json()).duplicate, true);
      },
    );
    await t.test(
      "dashboard requests enqueue scoped background work and return only versioned read models",
      async (t) => {
        const workerUrl = new URL(runtimeUrl);
        workerUrl.username += "_worker";
        workerUrl.password += "_worker";
        const worker = createImportWorker(workerUrl.toString());
        t.after(() => worker.close());
        const catalog = await (await call("kam-b", "/api/v1/customers")).json();
        assert.deepEqual(
          catalog.customers.map((c) => c.customer_id),
          ["CUST002", "CUST003"],
        );
        assert.equal(catalog.records.length, 0);
        assert.equal(catalog.cycleGroups.length, 0);
        assert.equal(catalog.sites.length, 0);
        const base = "/api/v1/customers/CUST002/dashboard";
        assert.equal((await call("kam-b", "/api/v1/customers/CUST001/dashboard")).status, 403);
        assert.equal((await call("kam-a", base + "?from=2025-12&to=2025-01")).status, 400);
        assert.equal((await call("kam-a", base + "?site=NOT_THIS_CUSTOMER")).status, 400);
        const first = await call("kam-a", base);
        assert.equal(first.status, 202);
        const pending = await first.json();
        assert.equal(pending.metrics, undefined);
        assert.equal((await (await call("kam-b", base)).json()).id, pending.id);
        for (let i = 0; i < 5; i++) await worker.runOnce();
        const response = await call("kam-a", base);
        assert.equal(response.status, 200);
        const ready = await response.json();
        assert.equal(
          ready.metrics.contexts.neutral.metrics.repairs,
          importControls(subsetDataset(fixtureDataset, ["CUST002"])).repairs,
        );
        assert.equal(ready.metrics.contexts.neutral.rows, undefined);
        assert.ok(Buffer.byteLength(JSON.stringify(ready)) < 200 * 1024);
        assert.equal((await (await call("viewer", base)).json()).id, ready.id);
        const second = await call("viewer", base + "?from=2025-01&to=2025-03");
        assert.equal(second.status, 202);
        await worker.runOnce();
        const quarter = await (await call("viewer", base + "?from=2025-01&to=2025-03")).json();
        assert.equal(quarter.status, "ready");
        assert.equal(quarter.metrics.contexts.neutral.recordCount, 18);
        assert.equal(quarter.datasetVersion, ready.datasetVersion);
        await assert.rejects(
          store.transaction(a.user, (c) => c.query("UPDATE dashboard_jobs SET result='{}'::jsonb")),
          (e) => e.code === "42501",
        );
        // Connection loss during calculation makes the unfinished request available again.
        const locked = await (await call("kam-a", base + "?from=2025-04&to=2025-06")).json();
        const connection = new pg.Client({ connectionString: workerUrl.toString() });
        await connection.connect();
        await connection.query("BEGIN");
        await connection.query("SELECT 1 FROM dashboard_jobs WHERE id=$1 FOR UPDATE", [locked.id]);
        assert.equal(await worker.runOnce(), false);
        await connection.end();
        await worker.runOnce();
        assert.equal(
          (await (await call("kam-a", base + "?from=2025-04&to=2025-06")).json()).status,
          "ready",
        );
        const admin = new pg.Client({ connectionString: adminUrl });
        await admin.connect();
        try {
          const payload = structuredClone(subsetDataset(fixtureDataset, ["CUST002"]));
          payload.customers[0].customer_name = "Apex new published version";
          for (const row of [...payload.records, ...payload.detail]) row.allocated_water_l *= 1.1;
          await admin.query(
            "INSERT INTO data_imports(id,tenant_id,customer_id,requested_by,source_id,checksum,calculation_version,payload,expected_controls) VALUES($1,'demo','CUST002','kam-a','project-fixture',$2,'fixture-controls-v1',$3,$4)",
            [
              randomUUID(),
              checksum(payload),
              JSON.stringify(payload),
              JSON.stringify(importControls(payload)),
            ],
          );
          await worker.runOnce();
          const pinned = await (
            await call("kam-a", base + "?version=" + encodeURIComponent(ready.datasetVersion))
          ).json();
          assert.equal(pinned.id, ready.id);
          assert.equal(
            (
              await call(
                "kam-a",
                base +
                  "?from=2025-07&to=2025-09&version=" +
                  encodeURIComponent(ready.datasetVersion),
              )
            ).status,
            409,
          );
          assert.equal((await call("kam-a", base)).status, 202);
          await worker.runOnce();
          const next = await (await call("kam-a", base)).json();
          assert.notEqual(next.datasetVersion, ready.datasetVersion);
          assert.equal(next.metrics.overview.customer.customer_name, "Apex new published version");
          assert.notEqual(
            next.metrics.contexts.neutral.metrics.water,
            ready.metrics.contexts.neutral.metrics.water,
          );

          const input = { ...workspace, dashboardSnapshotId: ready.id, locked: true };
          const reference = {
            id: ready.id,
            datasetVersion: ready.datasetVersion,
            calculationVersion: ready.calculationVersion,
          };
          const preview = await call("kam-a", "/api/presentations/preview", input);
          assert.equal(preview.status, 200);
          const deck = await preview.json();
          assert.deepEqual(deck.dashboard, reference);
          assert.equal((await call("kam-a", "/api/presentations/preview", workspace)).status, 409);
          assert.equal(
            (
              await call("kam-a", "/api/presentations/preview", {
                ...input,
                scope: quarter.metrics.scope,
              })
            ).status,
            409,
          );
          const refreshed = await (
            await call("kam-a", "/api/presentations/preview", {
              ...input,
              dashboardSnapshotId: next.id,
            })
          ).json();
          assert.notEqual(
            deck.slides.find((slide) => slide.id === "water").value,
            refreshed.slides.find((slide) => slide.id === "water").value,
          );
          const created = await call("kam-a", "/api/presentations", input);
          assert.equal(created.status, 201);
          const receipt = await created.json();
          assert.deepEqual(receipt.dashboard, reference);
          const viewerDeck = await (await call("kam-a", "/api/presentations/" + receipt.id)).json();
          assert.deepEqual(viewerDeck.slides, deck.slides);
          assert.deepEqual(viewerDeck.dashboard, reference);
          const download = await call("kam-a", receipt.downloadUrl);
          const zip = await JSZip.loadAsync(await download.arrayBuffer());
          const notes = await zip.file("ppt/notesSlides/notesSlide1.xml").async("string");
          assert.ok(notes.includes(ready.datasetVersion));
          const chat = await call("kam-a", "/api/chat", {
            workspace: input,
            message: "What should we raise in the meeting?",
          });
          assert.equal(chat.status, 200);
          const answer = await chat.json();
          assert.deepEqual(answer.dashboard, reference);
          const expectedWater =
            ready.metrics.contexts.neutral.metrics.water /
            ready.metrics.contexts.neutral.metrics.kg;
          assert.ok(
            answer.view.rows[0].display.startsWith(
              new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(expectedWater) +
                " / ",
            ),
          );
          // An archived publication can still supply a comparison that had never been calculated.
          let completed = false;
          const comparing = call("kam-a", "/api/chat", {
            workspace: input,
            message: "Compare water by quarter",
          }).finally(() => {
            completed = true;
          });
          const work = async () => {
            while (!completed) {
              await worker.runOnce();
              await wait(50);
            }
          };
          const [response] = await Promise.all([comparing, work()]);
          assert.equal(response.status, 200);
          const comparison = await response.json();
          assert.deepEqual(comparison.dashboard, reference);
          assert.equal(comparison.view.rows.length, 4);
        } finally {
          await admin.end();
        }
      },
    );
    await t.test("database failure never falls back to filesystem customer data", async () => {
      const badUrl = new URL(runtimeUrl);
      badUrl.password = "wrong-test-password";
      const unavailable = await preview(t, badUrl.toString());
      for (const endpoint of ["/api/reviews/CUST002", "/kopperoinenp/data.js"]) {
        const response = await fetch(unavailable + endpoint, {
          headers: { Cookie: "demo_user=kam-b" },
        });
        assert.equal(response.status, 503);
        assert.ok(!(await response.text()).includes("NorthStar"));
      }
    });
  },
);
