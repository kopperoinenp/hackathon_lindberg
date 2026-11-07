import { AsyncLocalStorage } from "node:async_hooks";
export const requestContext = new AsyncLocalStorage();

// Phase-one adapter for the existing synthetic analysis model. Never return hidden customers.
export function subsetDataset(data, customerIds) {
  const allowed = new Set(customerIds);
  return {
    source: data.source,
    status: data.status,
    year: data.year,
    baselines: data.baselines,
    products: data.products ?? [],
    customers: data.customers.filter((row) => allowed.has(row.customer_id)),
    sites: data.sites.filter((row) => allowed.has(row.customer_id)),
    records: data.records.filter((row) => allowed.has(row.customer)),
    ...(data.detail ? { detail: data.detail.filter((row) => allowed.has(row.customer)) } : {}),
    ...(data.cycleGroups
      ? { cycleGroups: data.cycleGroups.filter((row) => allowed.has(row.customer)) }
      : {}),
  };
}

export function combineCustomerDatasets(parts) {
  if (!parts.length) return null;
  return {
    ...parts[0],
    ...Object.fromEntries(
      ["customers", "sites", "records", "detail", "cycleGroups"].map((key) => [
        key,
        parts.flatMap((part) => part[key] ?? []),
      ]),
    ),
  };
}
