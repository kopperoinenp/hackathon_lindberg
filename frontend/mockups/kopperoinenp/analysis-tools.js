(function (root) {
  "use strict";
  const peerCompanies = [
    ["Elis", 0.4],
    ["Cintas", 0.2],
    ["Salesianer", 0.31],
    ["Johnson Service Group", 0.38],
  ];
  const lindstromIntensity = 0.28;
  const peerAverage =
    peerCompanies.reduce((sum, [, intensity]) => sum + intensity, 0) / peerCompanies.length;
  const benchmark = {
    companies: peerCompanies,
    lindstromIntensity,
    peerAverage,
    lowerPct: (1 - lindstromIntensity / peerAverage) * 100,
  };
  const definitions = {
    coverage: [
      "Source coverage and unavailable evidence",
      ["Customers", "Sites", "Data_Quality"],
      "Synthetic data; coverage is checked for the selected scope.",
    ],
    adoption: [
      "Inventory, scan coverage and product usage",
      ["Service_Activity", "Products"],
      "Inventory is a last-month snapshot. Scans do not measure unique wearers or prove unused garments.",
    ],
    service: [
      "Service-cycle turnaround, late flags and requests",
      ["Service_Cycles", "Service_Activity"],
      "Recorded cycles are grouped by pickup month. Late flags are source flags. Requests are contacts, not resolutions or contractual SLA.",
    ],
    operations: [
      "Washes, repair frequency and repair scenarios",
      ["Service_Activity", "Repairs", "Assumptions"],
      "Repairs are events. Delayed replacements and product footprint are illustrative scenarios, separate from laundry emissions.",
    ],
    footprint: [
      "Water, energy, emissions split and waste routes",
      ["Customer_Impacts", "Waste_Circularity"],
      "Allocated synthetic estimates; laundry and delivery boundaries. Waste routes follow the laundry-month treatment mix.",
    ],
    baselines: [
      "All laundry baseline scenarios at equal washed weight",
      ["Customer_Impacts", "Baselines"],
      "Scenario differences are baseline minus actual. Negative differences indicate higher actual usage; factors do not represent observed competitors.",
    ],
    period: [
      "Compare with the preceding equal-length period",
      ["Service_Activity", "Customer_Impacts", "Repairs"],
      "Same customer, sites and geography. Stock is compared at each period end. Requires both periods in the dataset.",
    ],
    drivers: [
      "Monthly and country totals, plus site contributions",
      ["Sites", "Service_Activity", "Customer_Impacts", "Repairs"],
      "Absolute contributions reflect service volume. Rates divide by washed kg. Rankings do not establish causes.",
    ],
    laundry: [
      "Customer-attributed footprint and volume by laundry",
      ["Service_Activity", "Customer_Impacts"],
      "This is the scoped customer's allocated footprint by servicing laundry. It does not describe total laundry performance.",
    ],
    actions: [
      "Evidence-backed questions for the review agenda",
      ["Service_Activity", "Service_Cycles", "Customer_Impacts"],
      "These are investigation candidates. No target, commitment, owner or cause is inferred.",
    ],
    peer: [
      "Illustrative company-level emissions intensity",
      ["Project-supplied peer figures"],
      "Unweighted mean of four peers. Reporting year and emissions scopes are unverified. Company turnover is the denominator; this is separate from customer footprint.",
    ],
  };
  const catalog = Object.entries(definitions).map(([id, [description]]) => ({ id, description }));
  const ratio = (value, denominator) =>
    value != null && denominator > 0 ? value / denominator : null;
  const pct = (value, reference) =>
    reference > 0 ? ((value - reference) / reference) * 100 : null;
  const totals = (m) => ({
    washedKg: m.kg,
    washEvents: m.washed,
    waterLitres: m.water,
    emissionsKgCo2e: m.emissions,
    repairs: m.repairs,
    allocatedPieces: m.allocated,
    scanPct: m.utilization,
  });

  function periodComparison(data, scope, current) {
    const from = Number(scope.from.slice(5));
    const to = Number(scope.to.slice(5));
    const start = from - (to - from + 1);
    if (start < 1) return null;
    const month = (value) => scope.from.slice(0, 5) + String(value).padStart(2, "0");
    const previousScope = { ...scope, from: month(start), to: month(from - 1) };
    const previous = root.WorkspaceModel.summarize(root.WorkspaceModel.select(data, previousScope));
    if (!previous.hasData || !current.hasData) return null;
    const before = totals(previous);
    const after = totals(current);
    return {
      previousPeriod: { from: previousScope.from, to: previousScope.to },
      previousSnapshotMonth: previous.snapshotMonth,
      currentSnapshotMonth: current.snapshotMonth,
      before,
      after,
      delta: Object.fromEntries(
        Object.keys(after).map((key) => [
          key,
          after[key] == null || before[key] == null ? null : after[key] - before[key],
        ]),
      ),
      relativeChangePct: Object.fromEntries(
        Object.keys(after)
          .filter((key) => key !== "scanPct")
          .map((key) => [key, pct(after[key], before[key])]),
      ),
    };
  }

  function baselineScenarios(data, metrics, detail) {
    return data.baselines.map((baseline) => {
      const comparison = root.ReviewModel.comparison(metrics, baseline);
      const energy = detail.energy == null ? null : metrics.kg * baseline.energy_kwh_per_kg;
      return {
        id: baseline.baseline_id,
        baselineWaterLitres: comparison.baselineWater,
        waterDifferenceLitres: comparison.waterDifference,
        baselineEmissionsKgCo2e: comparison.baselineEmissions,
        emissionsDifferenceKgCo2e: comparison.emissionsDifference,
        baselineEnergyKwh: energy,
        energyDifferenceKwh: energy == null ? null : energy - detail.energy,
      };
    });
  }

  function run(data, scope, ids, limit = 6) {
    const model = root.WorkspaceModel;
    const ctx = model.buildContext(data, scope);
    const { metrics: m, sites, rows } = ctx;
    let detail;
    const getDetail = () => (detail ??= model.analyzeDetails(data, scope));
    const handlers = {
      coverage: () => ({
        siteMonthRows: rows.length,
        sites: sites.length,
        snapshotMonth: m.snapshotMonth,
        hasProductDetail: getDetail().products.length > 0,
        recordedCycles: getDetail().service.count,
        unavailable: [
          "Unique wearers",
          "CSAT / NPS",
          "Contract SLA targets and compliance",
          "Complaint resolution and request-free days",
          "Verified financial savings",
          "Garment availability against orders",
          "Compliance certification",
          "Customer-approved account health and agreed actions",
        ],
      }),
      adoption: () => ({
        allocatedPieces: m.allocated,
        scannedPieces: m.scanned,
        unscannedPieces: m.unscanned,
        scanPct: m.utilization,
        productCount: getDetail().products.length,
        products: getDetail().products.slice(0, limit),
      }),
      service: () => ({
        ...getDetail().service,
        reportingSites: getDetail().serviceBySite.length,
        slowestSitesByP90: getDetail().serviceBySite.slice(0, limit),
      }),
      operations: () => ({
        washedKg: m.kg,
        washEvents: m.washed,
        repairEvents: m.repairs,
        repairsPer100Washes: ratio(m.repairs * 100, m.washed),
        replacementScenarios: getDetail().repairScenarios,
      }),
      footprint: () => ({
        waterLitres: m.water,
        waterLitresPerKg: ratio(m.water, m.kg),
        energyKwh: getDetail().energy,
        energyKwhPerKg: getDetail().energyPerKg,
        emissionsKgCo2e: m.emissions,
        processKgCo2e: rows.reduce((sum, row) => sum + row.allocated_process_kgco2e, 0),
        deliveryKgCo2e: rows.reduce((sum, row) => sum + row.allocated_delivery_kgco2e, 0),
        emissionsKgCo2ePerKg: ratio(m.emissions, m.kg),
        allocatedWasteKg: getDetail().waste,
        wasteKgPerKgWashed: getDetail().wastePerKg,
        wasteRoutes: getDetail().wasteRoutes,
      }),
      baselines: () => ({ washedKg: m.kg, scenarios: baselineScenarios(data, m, getDetail()) }),
      period: () => periodComparison(data, scope, m),
      drivers: () => ({
        monthly: model.series(ctx, "emissions").map(({ month, value }) => ({
          month,
          emissionsKgCo2e: value,
        })),
        waterByCountryLitres: model.countries(data, ctx, "water"),
        emissionsByCountryKgCo2e: model.countries(data, ctx, "emissions"),
        repairEventsByCountry: model.countries(data, ctx, "repairs"),
        rankedSiteCount: sites.length,
        sitesByEmissions: [...sites]
          .sort((a, b) => b.emissions - a.emissions)
          .slice(0, limit)
          .map((site) => ({
            id: site.site_id,
            name: site.site_name,
            washedKg: site.kg,
            emissionsKgCo2e: site.emissions,
            sharePct: ratio(site.emissions * 100, m.emissions),
            emissionsKgCo2ePerKg: ratio(site.emissions, site.kg),
            scanPct: site.utilization,
          })),
      }),
      laundry: () => {
        const detailRows = model.select(data, scope, data.detail ?? []);
        if (!detailRows.length) return null;
        const laundries = Object.groupBy(detailRows, (row) => row.laundry);
        return {
          laundryCount: Object.keys(laundries).length,
          byWashedKg: Object.entries(laundries)
            .map(([id, group]) => {
              const metrics = model.summarize(group);
              return {
                id,
                washedKg: metrics.kg,
                waterLitres: metrics.water,
                emissionsKgCo2e: metrics.emissions,
                waterLitresPerKg: ratio(metrics.water, metrics.kg),
                emissionsKgCo2ePerKg: ratio(metrics.emissions, metrics.kg),
              };
            })
            .sort((a, b) => b.washedKg - a.washedKg)
            .slice(0, limit),
        };
      },
      actions: () => {
        const lowScan = sites.find((site) => site.unscanned > 0 && site.utilization !== null);
        const slowCycle = getDetail().serviceBySite[0];
        const candidates = [];
        if (lowScan)
          candidates.push({
            site: lowScan.site_name,
            scanPct: lowScan.utilization,
            question: "Can we reconcile the scan gap with local stock and scanning practices?",
          });
        if (slowCycle)
          candidates.push({
            site: slowCycle.name,
            p90Hours: slowCycle.p90Hours,
            recordedCycles: slowCycle.count,
            question:
              "Which steps explain the longer recorded cycles, and what target has been agreed?",
          });
        return candidates;
      },
      peer: () => ({ ...benchmark, unit: "kg emissions / EUR turnover" }),
    };
    return ids.map((id) => {
      const [, tables, boundary] = definitions[id];
      const peer = id === "peer";
      const values = peer || id === "coverage" || m.hasData ? handlers[id]() : null;
      return {
        id,
        status:
          values === null ? "unavailable" : peer ? "unverified_project_comparison" : "synthetic",
        source: peer ? null : data.source,
        tables,
        scope: peer ? null : scope,
        snapshotMonth: peer ? null : m.snapshotMonth,
        boundary,
        values,
      };
    });
  }

  root.ReviewAnalysisTools = { catalog, run, benchmark, periodComparison, baselineScenarios };
})(globalThis);
