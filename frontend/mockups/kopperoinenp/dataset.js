(function (root) {
  "use strict";
  const months = Array.from(
    { length: 12 },
    (_, index) => "2025-" + String(index + 1).padStart(2, "0"),
  );
  const countries = ["Finland", "Sweden", "Poland"];
  const baselineIds = ["B_LOCAL", "B_HOME", "B_INHOUSE"];
  const countFields = [
    "allocated_pieces",
    "active_assets_scanned",
    "washed_pieces",
    "repair_count",
  ];
  const impactFields = [
    "customer_washed_kg",
    "allocated_water_l",
    "allocated_process_kgco2e",
    "allocated_delivery_kgco2e",
  ];
  const recordFields = [...countFields, ...impactFields];
  const wasteRoutes = ["reuse_kg", "recycling_kg", "energy_recovery_kg", "incineration_kg"];
  const object = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const id = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
  const quantity = (value) => Number.isFinite(value) && value >= 0 && value <= 1e12;
  const close = (left, right) => Math.abs(left - right) <= Math.max(1e-6, Math.abs(right) * 1e-12);
  const rowKey = (row) => [row.customer, row.site, row.month].join("/");
  const fileIssue = { message: "The dataset file is missing or could not be read." };

  function requireValid(condition, message, field) {
    if (!condition) throw Object.assign(new Error(message), { field });
  }

  function indexed(rows, key, name) {
    requireValid(Array.isArray(rows), "A required table is missing or invalid.", name);
    const entries = new Map();
    rows.forEach((row, index) => {
      const field = name + "[" + index + "]." + key;
      requireValid(object(row) && id(row[key]), "A dataset identifier is invalid.", field);
      requireValid(!entries.has(row[key]), "The dataset contains duplicate records.", field);
      entries.set(row[key], row);
    });
    return entries;
  }

  function validate(data) {
    requireValid(
      object(data) && text(data.source),
      "Dataset source information is missing.",
      "source",
    );
    requireValid(
      data.year === "2025" && data.status === "SYNTHETIC",
      "This workspace supports synthetic datasets for 2025.",
      "year / status",
    );
    const customers = indexed(data.customers, "customer_id", "customers");
    const sites = indexed(data.sites, "site_id", "sites");
    const baselines = indexed(data.baselines, "baseline_id", "baselines");
    const products = indexed(data.products ?? [], "product_id", "products");
    requireValid(customers.has("CUST001"), "The default customer is missing.", "customers");
    for (const [key, row] of customers) {
      requireValid(
        text(row.customer_name) && text(row.industry) && countries.includes(row.hq_country),
        "Customer metadata or country is invalid.",
        "customers." + key,
      );
    }
    const customerSites = new Set();
    for (const [key, row] of sites) {
      requireValid(
        customers.has(row.customer_id) &&
          text(row.site_name) &&
          text(row.city) &&
          countries.includes(row.country),
        "Site metadata or customer reference is invalid.",
        "sites." + key,
      );
      customerSites.add(row.customer_id);
    }
    requireValid(
      customerSites.size === customers.size,
      "Each customer needs at least one site.",
      "sites",
    );
    requireValid(
      baselines.size === baselineIds.length && baselineIds.every((key) => baselines.has(key)),
      "Required comparison baselines are missing or unsupported.",
      "baselines",
    );
    for (const [key, row] of baselines) {
      for (const field of [
        "water_l_per_kg",
        "energy_kwh_per_kg",
        "process_kgco2e_per_kg",
        "delivery_kgco2e_per_kg",
      ])
        requireValid(
          quantity(row[field]),
          "A numeric value is missing or invalid.",
          "baselines." + key + "." + field,
        );
    }
    for (const [key, row] of products)
      requireValid(text(row.product_name), "A product name is missing.", "products." + key);

    function checkScope(row, location) {
      requireValid(
        object(row) &&
          sites.has(row.site) &&
          sites.get(row.site).customer_id === row.customer &&
          months.includes(row.month),
        "A record has an invalid customer, site or month.",
        location,
      );
    }
    function checkQuantities(row, location) {
      for (const field of recordFields) {
        const value = row[field];
        requireValid(
          quantity(value) && (!countFields.includes(field) || Number.isSafeInteger(value)),
          "A numeric value is missing or invalid.",
          location + "." + field,
        );
      }
      requireValid(
        row.active_assets_scanned <= row.allocated_pieces,
        "Scanned items exceed allocated items.",
        location,
      );
    }
    requireValid(Array.isArray(data.records), "A required table is missing or invalid.", "records");
    const records = new Map();
    data.records.forEach((row, index) => {
      const location = "records[" + index + "]";
      checkScope(row, location);
      checkQuantities(row, location);
      const key = rowKey(row);
      requireValid(!records.has(key), "The dataset contains duplicate records.", location);
      records.set(key, row);
    });
    requireValid(
      records.size === sites.size * months.length,
      "Monthly site coverage is incomplete.",
      "records",
    );
    for (const field of countFields)
      requireValid(
        Number.isSafeInteger(data.records.reduce((sum, row) => sum + row[field], 0)),
        "A numeric value is missing or invalid.",
        "records / " + field,
      );

    const details = new Map();
    if (data.detail !== undefined) {
      requireValid(Array.isArray(data.detail), "A required table is missing or invalid.", "detail");
      const sums = new Map();
      data.detail.forEach((row, index) => {
        const location = "detail[" + index + "]";
        checkScope(row, location);
        checkQuantities(row, location);
        const key = rowKey(row);
        const detailKey = key + "/" + row.product;
        requireValid(
          products.has(row.product) && id(row.laundry),
          "A product or laundry reference is invalid.",
          location,
        );
        requireValid(!details.has(detailKey), "The dataset contains duplicate records.", location);
        details.set(detailKey, row.laundry);
        for (const field of [
          "service_requests",
          "allocated_energy_kwh",
          "allocated_textile_waste_kg",
          "estimated_replacements_postponed",
          "estimated_avoided_product_kgco2e",
        ]) {
          requireValid(
            quantity(row[field]) &&
              (field !== "service_requests" || Number.isSafeInteger(row[field])),
            "A numeric value is missing or invalid.",
            location + "." + field,
          );
        }
        requireValid(
          object(row.wasteRoutes) &&
            wasteRoutes.every((field) => quantity(row.wasteRoutes[field])) &&
            close(
              wasteRoutes.reduce((sum, field) => sum + row.wasteRoutes[field], 0),
              row.allocated_textile_waste_kg,
            ) &&
            row.estimated_replacements_postponed <= row.repair_count,
          "Waste or repair detail does not reconcile.",
          location,
        );
        if (!sums.has(key))
          sums.set(key, Object.fromEntries(recordFields.map((field) => [field, 0])));
        const total = sums.get(key);
        for (const field of recordFields) total[field] += row[field];
      });
      for (const [key, row] of records) {
        const total = sums.get(key);
        requireValid(
          total &&
            recordFields.every((field) =>
              countFields.includes(field)
                ? total[field] === row[field]
                : close(total[field], row[field]),
            ),
          "Product detail does not match the monthly site totals.",
          "detail / " + key,
        );
      }
    }
    if (data.cycleGroups !== undefined) {
      requireValid(
        Array.isArray(data.cycleGroups),
        "A required table is missing or invalid.",
        "cycleGroups",
      );
      const cycles = new Set();
      data.cycleGroups.forEach((row, index) => {
        const location = "cycleGroups[" + index + "]";
        checkScope(row, location);
        const detailKey = rowKey(row) + "/" + row.product;
        const key = detailKey + "/" + row.laundry;
        requireValid(
          products.has(row.product) &&
            id(row.laundry) &&
            (data.detail === undefined || details.get(detailKey) === row.laundry) &&
            Array.isArray(row.hours) &&
            row.hours.every(quantity) &&
            Number.isSafeInteger(row.late) &&
            row.late >= 0 &&
            row.late <= row.hours.length,
          "Service-cycle data is invalid or has no matching activity.",
          location,
        );
        requireValid(!cycles.has(key), "The dataset contains duplicate records.", location);
        cycles.add(key);
      });
    }
  }

  function inspect(source) {
    if (typeof source !== "string" || !source.trim()) return { data: null, issue: fileIssue };
    let data;
    try {
      const json = source
        .trim()
        .replace(/^(?:\/\/[^\r\n]*\r?\n)?globalThis\.REVIEW_DATA\s*=\s*([\s\S]*);$/, "$1");
      data = JSON.parse(json);
    } catch {
      return { data: null, issue: { message: "The dataset file is not valid JSON." } };
    }
    try {
      validate(data);
      return { data, issue: null };
    } catch (error) {
      return { data: null, issue: { message: error.message, field: error.field } };
    }
  }

  root.ReviewDataset = { inspect };
})(globalThis);
