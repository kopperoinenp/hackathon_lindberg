/* Readable SVG charts from the same selected source rows as the summary. */
(function (root) {
  "use strict";
  const esc = root.ReviewModel.escapeHtml;
  const t = (...args) =>
    (
      root.ReviewLanguage?.translator(root.document?.documentElement.lang) ??
      ((text, ...values) =>
        typeof text === "string" ? text : String.raw({ raw: text }, ...values))
    )(...args);
  const f = (n, digits = 0) =>
    new Intl.NumberFormat(t("en-GB"), { maximumFractionDigits: digits }).format(n);
  const definitions = {
    water: { label: "Water use", unit: "m³", divisor: 1000 },
    emissions: { label: "Laundry and delivery emissions", unit: "t CO₂e", divisor: 1000 },
    repairs: { label: "Repairs", unit: "items", divisor: 1 },
  };
  function comparisonPoints(ctx, metric) {
    if (ctx.comparisonPoints) return ctx.comparisonPoints[metric];
    const actual = root.WorkspaceModel.series(ctx, metric);
    const factor =
      metric === "water"
        ? ctx.baseline.water_l_per_kg
        : metric === "emissions"
          ? ctx.baseline.process_kgco2e_per_kg + ctx.baseline.delivery_kgco2e_per_kg
          : null;
    return actual.map((point) => ({
      month: point.month,
      actual: point.value,
      baseline:
        factor === null
          ? null
          : ctx.rows
              .filter((row) => row.month === point.month)
              .reduce((sum, row) => sum + row.customer_washed_kg, 0) * factor,
    }));
  }
  function lineChart(ctx, metric, id = "summary-trend") {
    const points = comparisonPoints(ctx, metric),
      def = definitions[metric];
    if (!points.length) return t('<p class="quiet">No chart data for the selected period.</p>');
    const rawMax = Math.max(
      ...points.flatMap((point) => [
        point.actual / def.divisor,
        (point.baseline || 0) / def.divisor,
      ]),
      1,
    );
    const magnitude = 10 ** Math.floor(Math.log10(rawMax));
    const max = Math.ceil(rawMax / magnitude) * magnitude;
    const x = (index) => (points.length === 1 ? 360 : 62 + (index / (points.length - 1)) * 590);
    const y = (value) => 232 - (value / def.divisor / max) * 202;
    const coords = (key) => points.map((point, index) => `${x(index)},${y(point[key])}`).join(" ");
    const description = points
      .map(
        (point) =>
          `${point.month}: Lindström ${f(point.actual / def.divisor, 1)} ${def.unit}${point.baseline === null ? "" : t`, baseline ${f(point.baseline / def.divisor, 1)} ${def.unit}`}`,
      )
      .join(". ");
    return t`<svg class="summary-line-chart" viewBox="0 0 680 280" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${def.label} by month (${def.unit})</title><desc id="${id}-desc">${esc(description)}</desc><defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#003f72" stop-opacity="0.16"/><stop offset="100%" stop-color="#003f72" stop-opacity="0.01"/></linearGradient></defs>${Array.from(
      { length: 5 },
      (_, index) => {
        const value = (max * index) / 4,
          py = 232 - (value / max) * 202;
        return `<line x1="62" y1="${py}" x2="652" y2="${py}" class="chart-gridline"/><text x="50" y="${py + 4}" text-anchor="end" class="chart-axis">${f(value, max < 10 ? 1 : 0)}</text>`;
      },
    ).join(
      "",
    )}<text x="62" y="14" class="chart-axis">${def.unit}</text><polygon points="${x(0)},232 ${coords("actual")} ${x(points.length - 1)},232" fill="url(#${id}-fill)"/>${points[0].baseline === null ? "" : t`<polyline points="${coords("baseline")}" class="chart-baseline"/>`}<polyline points="${coords("actual")}" class="chart-actual"/>${points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.actual)}" r="4" class="chart-point"><title>${esc(description.split(". ")[index] || `${point.month}: ${f(point.actual / def.divisor, 1)} ${def.unit}`)}</title></circle><text x="${x(index)}" y="258" text-anchor="middle" class="chart-axis">${point.month.slice(5)}</text>`).join("")}</svg>`;
  }
  function repairBars(ctx) {
    const points = root.WorkspaceModel.series(ctx, "repairs");
    const max = Math.max(...points.map((point) => point.value), 1);
    return t`<div class="repair-bars" role="img" aria-label="Monthly repairs: ${points.map((point) => t`${point.month} ${f(point.value)} items`).join(", ")}">${points.map((point) => `<div><span style="height:${(point.value / max) * 100}%"><i>${f(point.value)}</i></span><small>${point.month.slice(5)}</small></div>`).join("")}</div>`;
  }
  function countryShares(data, ctx, metric) {
    const countries = root.WorkspaceModel.countries(data, ctx, metric);
    const total = countries.reduce((sum, point) => sum + point.value, 0);
    return countries.map((point) => ({ ...point, share: total ? point.value / total : 0 }));
  }
  root.SummaryCharts = { comparisonPoints, lineChart, repairBars, countryShares, definitions };
})(globalThis);
