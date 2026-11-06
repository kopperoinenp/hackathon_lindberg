/* Pure calculations shared by the UI and Node's built-in tests. No dependencies. */
(function (root) {
  "use strict";
  function aggregate(data, customer, site = "all") {
    const records = data.records.filter(
      (row) => row.customer === customer && (site === "all" || row.site === site),
    );
    const sum = (field) => records.reduce((total, row) => total + (row[field] || 0), 0);
    const december = records.filter((row) => row.month === "2025-12");
    const snapshot = (field) => december.reduce((total, row) => total + (row[field] || 0), 0);
    const allocated = snapshot("allocated_pieces");
    const scanned = snapshot("active_assets_scanned");
    return {
      kg: sum("customer_washed_kg"),
      water: sum("allocated_water_l"),
      emissions: sum("allocated_process_kgco2e") + sum("allocated_delivery_kgco2e"),
      repairs: sum("repair_count"),
      washed: sum("washed_pieces"),
      allocated,
      scanned,
      utilization: allocated ? (scanned / allocated) * 100 : null,
      unscanned: Math.max(0, allocated - scanned),
      sites: new Set(records.map((row) => row.site)).size,
      monthly: Array.from({ length: 12 }, (_, index) => {
        const month = `2025-${String(index + 1).padStart(2, "0")}`;
        return records
          .filter((row) => row.month === month)
          .reduce((total, row) => total + row.allocated_water_l, 0);
      }),
    };
  }
  function comparison(metrics, baseline) {
    const baselineWater = metrics.kg * baseline.water_l_per_kg;
    const baselineEmissions =
      metrics.kg * (baseline.process_kgco2e_per_kg + baseline.delivery_kgco2e_per_kg);
    return {
      baselineWater,
      baselineEmissions,
      waterDifference: baselineWater - metrics.water,
      emissionsDifference: baselineEmissions - metrics.emissions,
      waterPercent: baselineWater ? ((baselineWater - metrics.water) / baselineWater) * 100 : null,
      emissionsPercent: baselineEmissions
        ? ((baselineEmissions - metrics.emissions) / baselineEmissions) * 100
        : null,
    };
  }
  function rankedSites(data, customer) {
    return data.sites
      .filter((site) => site.customer_id === customer)
      .map((site) => ({ ...site, ...aggregate(data, customer, site.site_id) }))
      .sort((a, b) => (a.utilization ?? Infinity) - (b.utilization ?? Infinity));
  }
  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }
  root.ReviewModel = { aggregate, comparison, rankedSites, escapeHtml };
})(globalThis);
