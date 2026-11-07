import "../frontend/mockups/kopperoinenp/language.js";
import "../frontend/mockups/kopperoinenp/model.js";
import "../frontend/mockups/kopperoinenp/story-model.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";
import "../frontend/mockups/kopperoinenp/analysis-tools.js";
import "../frontend/mockups/kopperoinenp/summary-charts.js";
import "../frontend/mockups/kopperoinenp/upsell-model.js";
import "../frontend/mockups/kopperoinenp/sales-model.js";

export const dashboardCalculationVersion = "dashboard-v2";
const model = globalThis.WorkspaceModel;
const tools = globalThis.ReviewAnalysisTools;

function monthlyEvidence(data, scope) {
  const ctx = model.buildContext(data, scope);
  const months = [...new Set(ctx.rows.map((r) => r.month))].sort();
  const cycles = model.select(data, scope, data.cycleGroups ?? []);
  const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
  return {
    performance: months.map((month) => {
      const rows = cycles.filter((r) => r.month === month);
      const count = rows.reduce((n, r) => n + r.hours.length, 0);
      return { month, value: count ? (1 - sum(rows, "late") / count) * 100 : null };
    }),
    adoption: months.map((month) => {
      const rows = ctx.rows.filter((r) => r.month === month);
      const allocated = sum(rows, "allocated_pieces");
      return {
        month,
        value: allocated ? (sum(rows, "active_assets_scanned") / allocated) * 100 : null,
      };
    }),
    operations: months.map((month) => ({
      month,
      value: sum(
        ctx.rows.filter((r) => r.month === month),
        "repair_count",
      ),
    })),
    sustainability: globalThis.SummaryCharts.comparisonPoints(ctx, "emissions").map((p) => ({
      month: p.month,
      value: p.actual / 1000,
      reference: p.baseline == null ? null : p.baseline / 1000,
    })),
  };
}

// This function runs only in a worker. No raw rows, product events or cycle samples leave it.
export function calculateDashboard(data, scope) {
  const overview = model.customerOverview(data, scope.customer);
  const cleanContext = (selection) => {
    const ctx = model.buildContext(data, selection);
    const { rows, ...summary } = ctx;
    return {
      ...summary,
      recordCount: rows.length,
      scope: selection,
      series: Object.fromEntries(
        ["water", "emissions", "repairs"].map((key) => [key, model.series(ctx, key)]),
      ),
      countries: Object.fromEntries(
        ["water", "emissions", "repairs"].map((key) => [key, model.countries(data, ctx, key)]),
      ),
      comparisonPoints: Object.fromEntries(
        ["water", "emissions", "repairs"].map((key) => [
          key,
          globalThis.SummaryCharts.comparisonPoints(ctx, key),
        ]),
      ),
    };
  };
  const yoy = tools.periodComparison(data, scope, "yoy");
  const previousScope = yoy ? { ...scope, ...yoy.previousPeriod } : null;
  return {
    scope,
    calculationVersion: dashboardCalculationVersion,
    contexts: Object.fromEntries(
      ["neutral", "water", "emissions", "efficiency", "circularity"].map((priority) => [
        priority,
        cleanContext({ ...scope, priority }),
      ]),
    ),
    detail: model.analyzeDetails(data, scope),
    lateCount: model
      .select(data, scope, data.cycleGroups ?? [])
      .reduce((count, group) => count + group.late, 0),
    tools: tools.run(
      data,
      scope,
      tools.catalog.map((t) => t.id),
    ),
    comparisons: { yoy, period: tools.periodComparison(data, scope) },
    finding: model.serviceCycleFinding(data, scope),
    usage: model.usageFindings(data, scope),
    overview,
    basics: customerBasics(data, scope.customer, overview),
    serviceScope: {
      laundries: new Set(overview.sites.map((s) => s.primary_laundry_id)).size,
      months: [
        ...new Set(
          (data.detail ?? []).filter((r) => r.customer === scope.customer).map((r) => r.month),
        ),
      ].sort(),
    },
    monthly: monthlyEvidence(data, scope),
    previous: previousScope
      ? {
          scope: previousScope,
          ctx: cleanContext(previousScope),
          detail: model.analyzeDetails(data, previousScope),
          monthly: monthlyEvidence(data, previousScope),
          label:
            previousScope.from.endsWith("-01") && previousScope.to.endsWith("-12")
              ? previousScope.from.slice(0, 4)
              : `${previousScope.from}–${previousScope.to}`,
        }
      : null,
    proposals: Object.fromEntries(
      ["fi", "en"].map((lang) => [lang, globalThis.UpsellModel.proposals(data, scope, lang)]),
    ),
    sales: Object.fromEntries(
      ["fi", "en"].map((lang) => [lang, globalThis.SalesModel.salesSignals(data, scope, lang)]),
    ),
    financial: null,
  };
}

// Customer-year volumes and product/site breakdowns are independent of review filters.
function customerBasics(data, customer, overview) {
  const mine = (rows) => (rows ?? []).filter((r) => r.customer === customer);
  const inYear = (rows, year) => rows.filter((r) => r.month.startsWith(year));
  const all = mine(data.records);
  const year =
    all
      .map((r) => r.month.slice(0, 4))
      .sort()
      .at(-1) ?? "";
  const before = String(Number(year) - 1);
  const records = inYear(all, year),
    detail = inYear(mine(data.detail), year),
    cycles = inYear(mine(data.cycleGroups), year);
  const previous = {
    records: inYear(all, before),
    detail: inYear(mine(data.detail), before),
    cycles: inYear(mine(data.cycleGroups), before),
  };
  const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0);
  const count = (rows) => rows.reduce((n, r) => n + r.hours.length, 0);
  const earlier = (table, fn) => (previous[table].length ? fn(previous[table]) : null);
  const volumes = [
    [
      sum(records, "washed_pieces"),
      "washes",
      0,
      earlier("records", (r) => sum(r, "washed_pieces")),
    ],
    [
      sum(records, "customer_washed_kg") / 1000,
      "tonnes of textiles washed",
      0,
      earlier("records", (r) => sum(r, "customer_washed_kg") / 1000),
    ],
    [count(cycles), "pickup and return cycles", 0, earlier("cycles", count)],
    [sum(records, "repair_count"), "repairs", 0, earlier("records", (r) => sum(r, "repair_count"))],
    [
      sum(detail, "service_requests"),
      "service requests",
      0,
      earlier("detail", (r) => sum(r, "service_requests")),
    ],
  ];
  const siteTypes = [
    ...overview.sites.reduce(
      (map, s) => map.set(s.site_type, (map.get(s.site_type) ?? 0) + 1),
      new Map(),
    ),
  ].sort((a, b) => b[1] - a[1]);
  const countries = overview.countries.map((country) => {
    const sites = overview.sites.filter((s) => s.country === country);
    return {
      country,
      sites: sites.length,
      allocated: sites.every((s) => s.allocated != null)
        ? sites.reduce((n, s) => n + s.allocated, 0)
        : null,
    };
  });
  const snapshot = detail.filter((r) => r.month === overview.snapshotMonth);
  const products = data.products
    .map((p) => ({
      ...p,
      allocated: sum(
        snapshot.filter((r) => r.product === p.product_id),
        "allocated_pieces",
      ),
    }))
    .filter((p) => p.allocated > 0)
    .sort((a, b) => b.allocated - a.allocated);
  return {
    year,
    before,
    volumes,
    siteTypes,
    countries,
    products,
    perSite:
      overview.allocated != null && overview.sites.length
        ? overview.allocated / overview.sites.length
        : null,
  };
}
