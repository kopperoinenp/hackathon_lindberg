/* Shared scope for the presentation and analyst views. No estimated trend data. */
(function (root) {
  "use strict";
  const countryNames = { Finland: "Suomi", Sweden: "Ruotsi", Poland: "Puola" };
  const continentOf = (country) => (Object.hasOwn(countryNames, country) ? "Europe" : "Unknown");
  const sum = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
  const value = (row, metric) =>
    metric === "emissions"
      ? row.allocated_process_kgco2e + row.allocated_delivery_kgco2e
      : row[metric === "repairs" ? "repair_count" : "allocated_water_l"];
  function summarize(rows) {
    const snapshotMonth = rows.length
      ? rows
          .map((row) => row.month)
          .sort()
          .at(-1)
      : null;
    const snapshot = rows.filter((row) => row.month === snapshotMonth);
    const allocated = sum(snapshot, "allocated_pieces");
    const scanned = sum(snapshot, "active_assets_scanned");
    return {
      hasData: rows.length > 0,
      snapshotMonth,
      kg: sum(rows, "customer_washed_kg"),
      water: sum(rows, "allocated_water_l"),
      emissions: sum(rows, "allocated_process_kgco2e") + sum(rows, "allocated_delivery_kgco2e"),
      repairs: sum(rows, "repair_count"),
      washed: sum(rows, "washed_pieces"),
      allocated,
      scanned,
      unscanned: Math.max(0, allocated - scanned),
      utilization: allocated ? (scanned / allocated) * 100 : null,
      sites: new Set(rows.map((row) => row.site)).size,
    };
  }
  function select(data, selection) {
    const from = selection.from || "2025-01",
      to = selection.to || "2025-12";
    const metadata = new Map(data.sites.map((site) => [site.site_id, site]));
    if (from > to) return [];
    return data.records.filter((row) => {
      const site = metadata.get(row.site);
      return (
        row.customer === selection.customer &&
        row.month >= from &&
        row.month <= to &&
        (!selection.site || selection.site === "all" || row.site === selection.site) &&
        (!selection.country || selection.country === "all" || site.country === selection.country) &&
        (!selection.continent ||
          selection.continent === "all" ||
          continentOf(site.country) === selection.continent)
      );
    });
  }
  function buildContext(data, selection) {
    const rows = select(data, selection);
    const customer = data.customers.find((row) => row.customer_id === selection.customer);
    const baseline = data.baselines.find((row) => row.baseline_id === selection.baseline);
    const metrics = summarize(rows);
    const sites = data.sites
      .filter((site) => rows.some((row) => row.site === site.site_id))
      .map((site) => ({ ...site, ...summarize(rows.filter((row) => row.site === site.site_id)) }))
      .sort((a, b) => (a.utilization ?? Infinity) - (b.utilization ?? Infinity));
    const priority = selection.priority || root.StoryModel.defaultPriority(customer);
    const order =
      priority === "emissions"
        ? ["emissions", "water", "repairs"]
        : priority === "water"
          ? ["water", "repairs", "emissions"]
          : ["repairs", "water", "emissions"];
    return {
      customer,
      baseline,
      metrics,
      sites,
      focus: sites[0] || null,
      compare: root.ReviewModel.comparison(metrics, baseline),
      priority,
      order,
      rows,
      invalidPeriod: (selection.from || "2025-01") > (selection.to || "2025-12"),
    };
  }
  function series(context, metric) {
    return [...new Set(context.rows.map((row) => row.month))].sort().map((month) => ({
      month,
      value: context.rows
        .filter((row) => row.month === month)
        .reduce((total, row) => total + value(row, metric), 0),
    }));
  }
  function countries(data, context, metric) {
    return [...new Set(context.sites.map((site) => site.country))].map((country) => {
      const ids = new Set(
        data.sites.filter((site) => site.country === country).map((site) => site.site_id),
      );
      return {
        country,
        value: context.rows
          .filter((row) => ids.has(row.site))
          .reduce((total, row) => total + value(row, metric), 0),
      };
    });
  }
  root.WorkspaceModel = {
    select,
    summarize,
    buildContext,
    series,
    countries,
    countryNames,
    continentOf,
  };
})(globalThis);
