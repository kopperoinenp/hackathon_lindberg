import { setTimeout as wait } from "node:timers/promises";
import { dashboardScope, dashboardScopeKey } from "./dashboard-api.mjs";
import { PresentationError } from "./presentation-model.mjs";
import { requestContext } from "./request-context.mjs";

export async function withPreparedDashboard(input, run, { write = false } = {}) {
  const context = requestContext.getStore();
  if (!context?.dashboard) return run();
  const customer = input?.scope?.customer;
  if (!context.permissions.has(customer) || (write && !context.permissions.get(customer)))
    throw new PresentationError("No access to this customer.", 403);
  const scope = dashboardScope(customer, new URLSearchParams(input.scope));
  const snapshot = await context.dashboard.snapshot(input.dashboardSnapshotId, scope);
  const active = snapshot.metrics;
  const results = new Map([[dashboardScopeKey(scope), active]]);
  const reference = {
    id: snapshot.id,
    datasetVersion: snapshot.datasetVersion,
    calculationVersion: snapshot.calculationVersion,
  };
  const get = (selection) => {
    const result = results.get(dashboardScopeKey(selection));
    if (!result) throw new PresentationError("The selected dashboard metrics are not ready.", 409);
    return result;
  };
  const load = async (selection) => {
    if (selection.customer !== customer)
      throw new PresentationError("Switch to that customer before requesting its metrics.", 409);
    const key = dashboardScopeKey(selection);
    if (results.has(key)) return results.get(key);
    const params = new URLSearchParams({ ...selection, version: reference.datasetVersion });
    for (let attempt = 0; attempt < 40; attempt++) {
      const { status, body } = await context.dashboard.get(customer, params, snapshot);
      if (status === 200) {
        results.set(key, body.metrics);
        return body.metrics;
      }
      if (status !== 202)
        throw new PresentationError(body.error ?? "Dashboard calculation failed.", status);
      await wait(300);
    }
    throw new PresentationError(
      "Dashboard metrics are still being prepared. Try again shortly.",
      503,
    );
  };
  const data = {
    ...context.data,
    customers: context.data.customers.map((item) =>
      item.customer_id === customer ? active.overview.customer : item,
    ),
    sites: [
      ...context.data.sites.filter((site) => site.customer_id !== customer),
      ...active.metadata.sites,
    ],
    baselines: active.metadata.baselines,
    source: active.metadata.source,
  };
  return requestContext.run({ ...context, data, prepared: { get, load, reference } }, run);
}
