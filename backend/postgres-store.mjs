import pg from "pg";
import { combineCustomerDatasets } from "./request-context.mjs";
import { normalizeWorkspace } from "./review-chat.mjs";
import { PresentationError } from "./presentation-model.mjs";

export function createPostgresStore(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  pool.on("error", () => {}); // Idle connection loss is surfaced on the next request, not an uncaught process error.
  async function checkRole() {
    const { rows } = await pool.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
    );
    if (rows[0]?.rolsuper || rows[0]?.rolbypassrls)
      throw new Error("Use a restricted database account for the prototype API.");
  }
  const ready = checkRole();
  ready.catch(() => {}); // Requests report an unavailable database without falling back to local files.
  async function transaction(user, run) {
    await ready;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.tenant',$1,true), set_config('app.user',$2,true)",
        [user.tenant_id, user.id],
      );
      const value = await run(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async function users() {
    await ready;
    return (await pool.query("SELECT id, display_name FROM prototype_users ORDER BY id")).rows;
  }
  async function context(id, { metadataOnly = false } = {}) {
    await ready;
    const user = (
      await pool.query("SELECT id, tenant_id, display_name FROM prototype_users WHERE id=$1", [id])
    ).rows[0];
    if (!user) throw new PresentationError("Unknown prototype user.", 403);
    return transaction(user, async (client) => {
      const { rows } = await client.query(
        `SELECT d.customer_id, ${metadataOnly ? "NULL" : "d.dataset"} AS dataset, a.can_write FROM customer_datasets d JOIN customer_access a USING (tenant_id,customer_id) ORDER BY d.customer_id`,
      );
      const permissions = new Map(rows.map((row) => [row.customer_id, row.can_write]));
      return {
        user,
        permissions,
        data: metadataOnly ? null : combineCustomerDatasets(rows.map((row) => row.dataset)),
      };
    });
  }
  async function access(client, user, customer, write = false) {
    const { rows } = await client.query(
      "SELECT can_write FROM customer_access WHERE tenant_id=$1 AND user_id=$2 AND customer_id=$3",
      [user.tenant_id, user.id, customer],
    );
    if (!rows.length || (write && !rows[0].can_write))
      throw new PresentationError("No access to this customer.", 403);
  }
  function reviews(user) {
    return {
      read: (customer) =>
        transaction(user, async (client) => {
          await access(client, user, customer);
          const { rows } = await client.query(
            "SELECT revision, workspace, updated_at FROM customer_reviews WHERE tenant_id=$1 AND customer_id=$2 AND owner_id=$3",
            [user.tenant_id, customer, user.id],
          );
          const row = rows[0];
          return {
            customer,
            revision: row?.revision ?? 0,
            workspace: row ? normalizeWorkspace(row.workspace, { allowEmpty: true }) : null,
            updatedAt: row?.updated_at.toISOString() ?? null,
          };
        }),
      save: (customer, input) =>
        transaction(user, async (client) => {
          await access(client, user, customer, true);
          if (!Number.isSafeInteger(input?.revision) || input.revision < 0)
            throw new PresentationError("Invalid review revision.");
          const workspace = normalizeWorkspace(input.workspace, { allowEmpty: true });
          if (workspace.scope.customer !== customer)
            throw new PresentationError("Customer mismatch.");
          const sql =
            input.revision === 0
              ? "INSERT INTO customer_reviews(tenant_id,customer_id,owner_id,revision,workspace) VALUES($1,$2,$3,$4::int+1,$5::jsonb) ON CONFLICT DO NOTHING RETURNING revision,updated_at"
              : "UPDATE customer_reviews SET revision=revision+1,workspace=$5::jsonb,updated_at=now() WHERE tenant_id=$1 AND customer_id=$2 AND owner_id=$3 AND revision=$4 RETURNING revision,updated_at";
          const row = (
            await client.query(sql, [
              user.tenant_id,
              customer,
              user.id,
              input.revision,
              JSON.stringify(workspace),
            ])
          ).rows[0];
          if (!row)
            throw new PresentationError(
              "This review was changed in another window. Reload before saving.",
              409,
            );
          await client.query(
            "INSERT INTO review_audit(tenant_id,customer_id,user_id,revision) VALUES($1,$2,$3,$4)",
            [user.tenant_id, customer, user.id, row.revision],
          );
          return {
            customer,
            revision: row.revision,
            workspace,
            updatedAt: row.updated_at.toISOString(),
          };
        }),
    };
  }
  return { context, users, reviews, transaction, close: () => pool.end() };
}
