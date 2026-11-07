/* Shared scope for the presentation and analyst views. No estimated trend data. */
(function (root) {
  "use strict";
  const countryNames = { Finland: "Finland", Sweden: "Sweden", Poland: "Poland" };
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
  function select(data, selection, rows = data.records) {
    const from = selection.from || "2025-01",
      to = selection.to || "2025-12";
    const metadata = new Map(data.sites.map((site) => [site.site_id, site]));
    if (from > to) return [];
    return rows.filter((row) => {
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
      priority === "neutral"
        ? ["water", "emissions", "repairs"]
        : priority === "emissions"
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
  const ratio = (total, denominator) =>
    total != null && denominator > 0 ? total / denominator : null;
  const total = (rows, field) =>
    rows.length && rows.every((row) => Number.isFinite(row[field])) ? sum(rows, field) : null;
  function serviceMetrics(groups) {
    const hours = groups.flatMap((group) => group.hours).sort((a, b) => a - b);
    const count = hours.length;
    const middle = Math.floor(count / 2);
    return {
      count,
      medianHours: count ? (hours[middle] + hours[Math.floor((count - 1) / 2)]) / 2 : null,
      p90Hours: count ? hours[Math.ceil(count * 0.9) - 1] : null,
      latePct: ratio(sum(groups, "late") * 100, count),
    };
  }
  function analyzeDetails(data, selection) {
    const rows = select(data, selection, data.detail ?? []);
    const cycles = select(data, selection, data.cycleGroups ?? []);
    const snapshotMonth = [...new Set(rows.map((row) => row.month))].sort().at(-1) ?? null;
    const kg = total(rows, "customer_washed_kg");
    const energy = total(rows, "allocated_energy_kwh");
    const baseline = data.baselines.find((row) => row.baseline_id === selection.baseline);
    const baselineEnergy = kg != null && baseline ? kg * baseline.energy_kwh_per_kg : null;
    const waste = total(rows, "allocated_textile_waste_kg");
    return {
      snapshotMonth,
      service: { ...serviceMetrics(cycles), requests: total(rows, "service_requests") },
      serviceBySite: data.sites
        .map((site) => ({
          name: site.site_name,
          ...serviceMetrics(cycles.filter((group) => group.site === site.site_id)),
        }))
        .filter((site) => site.count)
        .sort((a, b) => b.p90Hours - a.p90Hours),
      energy,
      energyPerKg: ratio(energy, kg),
      baselineEnergy,
      energyDifference: baselineEnergy != null && energy != null ? baselineEnergy - energy : null,
      waste,
      wastePerKg: ratio(waste, kg),
      wasteRoutes: ["reuse_kg", "recycling_kg", "energy_recovery_kg", "incineration_kg"].map(
        (key) => {
          const routeKg = total(
            rows.map((row) => row.wasteRoutes),
            key,
          );
          return { key, kg: routeKg, share: ratio(routeKg, waste) };
        },
      ),
      repairScenarios: [0, 0.5, 1].map((factor) => {
        const replacements = total(rows, "estimated_replacements_postponed");
        const emissions = total(rows, "estimated_avoided_product_kgco2e");
        return {
          factor,
          replacements: replacements == null ? null : replacements * factor,
          emissions: emissions == null ? null : emissions * factor,
        };
      }),
      products: (data.products ?? []).flatMap((product) => {
        const id = product.product_id;
        const productRows = rows.filter((row) => row.product === id);
        if (!productRows.length) return [];
        const snapshot = productRows.filter((row) => row.month === snapshotMonth);
        const allocated = total(snapshot, "allocated_pieces");
        const scanned = total(snapshot, "active_assets_scanned");
        const washed = total(productRows, "washed_pieces");
        const allocationMonths = total(productRows, "allocated_pieces");
        const repairs = total(productRows, "repair_count");
        const productKg = total(productRows, "customer_washed_kg");
        return [
          {
            name: product.product_name,
            allocated,
            scannedPct: ratio(scanned == null ? null : scanned * 100, allocated),
            washed,
            washesPerPieceMonth: ratio(washed, allocationMonths),
            repairs,
            repairsPerHundredWashes: ratio(repairs == null ? null : repairs * 100, washed),
            waterPerKg: ratio(total(productRows, "allocated_water_l"), productKg),
            energyPerKg: ratio(total(productRows, "allocated_energy_kwh"), productKg),
          },
        ];
      }),
    };
  }
  root.WorkspaceModel = {
    select,
    analyzeDetails,
    summarize,
    buildContext,
    series,
    countries,
    countryNames,
    continentOf,
  };
})(globalThis);
