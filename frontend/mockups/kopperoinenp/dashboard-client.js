/* PostgreSQL mode: read prepared metrics only. No source-row fallback. */
(function (root) {
  "use strict";
  const fields = ["customer", "from", "to", "site", "country", "continent", "baseline"];
  const key = (s) =>
    JSON.stringify(
      fields.map(
        (f) =>
          s[f] ??
          {
            site: "all",
            country: "all",
            continent: "all",
            baseline: "B_LOCAL",
            from: "2025-01",
            to: "2025-12",
          }[f],
      ),
    );
  function create(data) {
    const cache = new Map(),
      pending = new Map(),
      versions = new Map();
    const read = (scope) => {
      const value = cache.get(key(scope));
      if (!value) throw new Error("Dashboard metrics have not loaded for this selection.");
      return value;
    };
    const ready = (scope) => cache.has(key(scope));
    async function ensure(scope) {
      const id = key(scope);
      if (cache.has(id)) return cache.get(id);
      if (pending.has(id)) return pending.get(id);
      const promise = (async () => {
        const params = new URLSearchParams(
          Object.fromEntries(
            fields
              .filter((f) => f !== "customer")
              .map((f) => [
                f,
                scope[f] ??
                  { site: "all", country: "all", continent: "all", baseline: "B_LOCAL" }[f],
              ]),
          ),
        );
        if (versions.has(scope.customer)) params.set("version", versions.get(scope.customer));
        for (let attempt = 0; attempt < 90; attempt++) {
          const response = await fetch(
            `/api/v1/customers/${encodeURIComponent(scope.customer)}/dashboard?${params}`,
            { signal: AbortSignal.timeout(15000), cache: "no-store" },
          );
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Could not load dashboard metrics.");
          if (!versions.has(scope.customer)) {
            versions.set(scope.customer, body.datasetVersion);
            params.set("version", body.datasetVersion);
          }
          if (response.status === 200 && body.status === "ready") {
            if (body.datasetVersion !== versions.get(scope.customer))
              throw new Error("Dashboard dataset version changed. Reload the page.");
            cache.set(id, body.metrics);
            data.sites = [
              ...data.sites.filter((s) => s.customer_id !== scope.customer),
              ...body.metrics.metadata.sites,
            ];
            data.months = body.metrics.metadata.months;
            return body.metrics;
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
        throw new Error("Background analysis is still running. Try again shortly.");
      })().finally(() => pending.delete(id));
      pending.set(id, promise);
      return promise;
    }
    const model = root.WorkspaceModel;
    model.buildContext = (_data, scope) =>
      read(scope).contexts[scope.priority ?? "neutral"] ?? read(scope).contexts.neutral;
    model.analyzeDetails = (_data, scope) => read(scope).detail;
    model.serviceCycleFinding = (_data, scope) => read(scope).finding;
    model.usageFindings = (_data, scope) => read(scope).usage;
    model.customerOverview = (_data, customer) => {
      const result = [...cache.values()].find((s) => s.scope.customer === customer);
      if (!result) throw new Error("Customer metrics not ready.");
      return result.overview;
    };
    model.series = (ctx, metric) => ctx.series[metric];
    model.countries = (_data, ctx, metric) => ctx.countries[metric];
    model.select = () => {
      throw new Error("Raw-data analysis is unavailable in the dashboard browser.");
    };
    model.summarize = () => {
      throw new Error("Raw-data aggregation must run in the background.");
    };
    root.ReviewAnalysisTools.run = (_data, scope, ids) =>
      ids.map((id) => read(scope).tools.find((tool) => tool.id === id));
    root.ReviewAnalysisTools.periodComparison = (_data, scope, kind = "period") =>
      read(scope).comparisons[kind];
    root.UpsellModel.proposals = (_data, scope, language = "en") => read(scope).proposals[language];
    root.SalesModel.salesSignals = (_data, scope, language = "en") => read(scope).sales[language];
    return { ensure, ready, read };
  }
  root.DashboardClient = { create };
})(globalThis);
