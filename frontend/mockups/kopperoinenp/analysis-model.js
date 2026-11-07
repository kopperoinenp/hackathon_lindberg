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
      // The site with the most textiles without a scan is where a review changes the most.
      .sort(
        (a, b) =>
          (b.unscanned ?? -Infinity) - (a.unscanned ?? -Infinity) ||
          (a.utilization ?? Infinity) - (b.utilization ?? Infinity),
      );
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
  function serviceCycleFinding(data, selection) {
    const groups = select(data, selection, data.cycleGroups ?? []);
    const bySite = Map.groupBy(groups, ({ site }) => site);
    const months = [...new Set(groups.map(({ month }) => month))].sort();
    if (months.length < 2) return null;
    // Compare sites over the same observed months, with enough cycles to compute P90.
    const sites = [...bySite].flatMap(([id, cycles]) => {
      const byMonth = Map.groupBy(cycles, ({ month }) => month);
      const monthly = months.map((month) => serviceMetrics(byMonth.get(month) ?? []));
      const total = serviceMetrics(cycles);
      return total.count >= 30 && monthly.every(({ count }) => count >= 5)
        ? [{ id, monthly, total }]
        : [];
    });
    if (sites.length < 2) return null;
    const median = (values) => {
      const sorted = values.toSorted((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return (sorted[middle] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2;
    };
    const candidates = sites.map((site) => {
      const peers = sites.filter(({ id }) => id !== site.id);
      const reference = median(peers.map(({ total }) => total.p90Hours));
      const monthly = months.map((month, index) => ({
        month,
        actual: site.monthly[index].p90Hours,
        reference: median(peers.map((peer) => peer.monthly[index].p90Hours)),
      }));
      return {
        site: data.sites.find(({ site_id }) => site_id === site.id).site_name,
        count: site.total.count,
        actual: site.total.p90Hours,
        reference,
        gap: site.total.p90Hours - reference,
        peerCount: peers.length,
        monthsAbove: monthly.filter((point) => point.actual > point.reference).length,
        monthly,
      };
    });
    return (
      candidates
        // A small or occasional gap is ordinary variation, not a finding to raise with a customer.
        .filter(
          ({ gap, monthsAbove }) =>
            gap >= 5 && monthsAbove >= 2 && monthsAbove * 2 >= months.length,
        )
        .sort((a, b) => b.gap - a.gap || b.monthsAbove - a.monthsAbove || b.count - a.count)[0] ??
      null
    );
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
  function usageFindings(data, selection) {
    const rows = select(data, selection, data.detail ?? []);
    const byProduct = Map.groupBy(rows, (row) => row.product);
    const sites = new Map(data.sites.map((site) => [site.site_id, site.site_name]));
    const findings = {};
    const washRate = (rows) => ratio(sum(rows, "washed_pieces"), sum(rows, "allocated_pieces"));
    const repairRate = (rows) => ratio(sum(rows, "repair_count") * 100, sum(rows, "washed_pieces"));
    const period = (rows) => ({ from: rows[0].month, to: rows.at(-1).month });
    const monthIndex = (month) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5));
    function keep(kind, score, finding) {
      if (!findings[kind] || score > findings[kind].score) findings[kind] = { ...finding, score };
    }
    for (const [id, productRows] of byProduct) {
      const product = data.products.find((product) => product.product_id === id).product_name;
      const groups = [...Map.groupBy(productRows, (row) => row.site)];
      for (const [siteId, siteRows] of groups) {
        const site = sites.get(siteId);
        const months = [...siteRows].sort((a, b) => a.month.localeCompare(b.month));
        const recent = months.slice(-6);
        if (
          recent.length === 6 &&
          recent.every((row, i) => monthIndex(row.month) === monthIndex(recent[0].month) + i) &&
          recent.every((row) => row.allocated_pieces > 0)
        ) {
          const before = recent.slice(0, 3);
          const after = recent.slice(3);
          const beforeStock = sum(before, "allocated_pieces") / 3;
          const afterStock = sum(after, "allocated_pieces") / 3;
          const beforeWashes = sum(before, "washed_pieces") / 3;
          const afterWashes = sum(after, "washed_pieces") / 3;
          if (
            beforeWashes >= 30 &&
            Math.abs(afterStock / beforeStock - 1) <= 0.05 &&
            after.every((row) => row.washed_pieces <= beforeWashes * 0.8)
          )
            keep("stock", 1 - afterWashes / beforeWashes, {
              product,
              site,
              beforeWashes,
              afterWashes,
              beforeStock,
              afterStock,
              before: period(before),
              after: period(after),
            });
        }
        for (const [peerId, peerRows] of groups) {
          if (siteId === peerId) continue;
          const peerMonths = new Map(peerRows.map((row) => [row.month, row]));
          const shared = months.filter(
            (row) => row.allocated_pieces > 0 && peerMonths.get(row.month)?.allocated_pieces > 0,
          );
          if (shared.length < 3) continue;
          const comparison = shared.map((row) => peerMonths.get(row.month));
          const peer = sites.get(peerId);
          const evidence = { product, site, peer, ...period(shared), months: shared.length };
          const rate = washRate(shared);
          const peerRate = washRate(comparison);
          const lowerMonths = shared.filter(
            (row, i) =>
              comparison[i].washed_pieces > 0 && washRate([row]) <= washRate([comparison[i]]) * 0.8,
          ).length;
          if (
            peerRate > 0 &&
            rate <= peerRate * 0.8 &&
            lowerMonths >= Math.max(3, Math.ceil(shared.length / 2))
          )
            keep("wash", 1 - rate / peerRate, { ...evidence, rate, peerRate, lowerMonths });
          const washes = sum(shared, "washed_pieces");
          const peerWashes = sum(comparison, "washed_pieces");
          const repairs = repairRate(shared);
          const peerRepairs = repairRate(comparison);
          if (
            washes >= 100 &&
            peerWashes >= 100 &&
            sum(shared, "repair_count") >= 5 &&
            repairs >= peerRepairs * 1.25 &&
            repairs - peerRepairs >= 1
          )
            keep("repair", repairs - peerRepairs, {
              ...evidence,
              rate: repairs,
              peerRate: peerRepairs,
              washes,
              peerWashes,
            });
        }
      }
    }
    return findings;
  }
  function customerOverview(data, customerId) {
    const customer = data.customers.find((row) => row.customer_id === customerId);
    const rows = data.records.filter((row) => row.customer === customerId);
    const snapshotMonth =
      rows
        .map((row) => row.month)
        .sort()
        .at(-1) || null;
    const snapshot = rows.filter((row) => row.month === snapshotMonth);
    const sites = data.sites
      .filter((site) => site.customer_id === customerId)
      .map((site) => {
        const records = snapshot.filter((row) => row.site === site.site_id);
        return { ...site, allocated: records.length ? sum(records, "allocated_pieces") : null };
      })
      .sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city, "fi"));
    return {
      customer,
      snapshotMonth,
      allocated: snapshot.length ? sum(snapshot, "allocated_pieces") : null,
      complete: sites.every((site) => site.allocated !== null),
      sites,
      countries: [...new Set(sites.map((site) => site.country))],
    };
  }
  root.WorkspaceModel = {
    dashboardSections: [
      "overview",
      "intro",
      "savings",
      "metrics",
      "results",
      "charts",
      "opportunity",
      "plan",
    ],
    dashboardMetrics: [
      "allocated",
      "sites",
      "scanned",
      "unscanned",
      "washed",
      "water",
      "emissions",
      "repairs",
    ],
    defaultDashboardLayout: () => ({
      sections: ["overview", "intro", "savings", "results", "charts", "opportunity", "plan"],
      metrics: ["allocated", "sites", "water", "emissions"],
    }),
    customerOverview,
    select,
    analyzeDetails,
    serviceCycleFinding,
    usageFindings,
    summarize,
    buildContext,
    series,
    countries,
    countryNames,
    continentOf,
  };
})(globalThis);
