/* One card template for the review page and the slide viewer. */
(function (root) {
  "use strict";
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  const colors = { ink: "#003f72", muted: "#647b8d", soft: "#dbe5ec", accent: "#7ab800" };
  function compare({ labels, values, unit }, f) {
    const max = Math.max(...values, 1);
    const bars = values
      .map((value, index) => {
        const y = 14 + index * 110;
        const width = Math.max((value / max) * 420, 6);
        return `<text x="0" y="${y + 12}" font-size="20" font-weight="600" fill="${colors.ink}">${esc(labels[index])}</text><rect x="0" y="${y + 24}" width="${width}" height="44" rx="10" fill="${index ? colors.soft : colors.ink}"/><text x="${width + 12}" y="${y + 54}" font-size="20" fill="${colors.ink}">${esc(f(value))} ${esc(unit)}</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 640 240" role="img" aria-label="${esc(labels.join(", "))}">${bars}</svg>`;
  }
  function columns({ labels, values }) {
    const max = Math.max(...values, 1);
    const top = values.indexOf(Math.max(...values));
    const width = 600 / values.length;
    const bars = values
      .map((value, index) => {
        const height = Math.max((value / max) * 190, 4);
        const x = index * width + 6;
        return `<rect x="${x}" y="${210 - height}" width="${width - 14}" height="${height}" rx="6" fill="${index === top ? colors.ink : colors.accent}"/><text x="${x + (width - 14) / 2}" y="236" text-anchor="middle" font-size="16" fill="${colors.muted}">${esc(labels[index])}</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 610 244" role="img" aria-label="${esc(labels.join(", "))}">${bars}</svg>`;
  }
  function donut({ labels, values }, f) {
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const share = values[0] / total;
    const radius = 84;
    const length = 2 * Math.PI * radius;
    return `<svg viewBox="0 0 520 240" role="img" aria-label="${esc(labels.join(", "))}"><circle cx="120" cy="120" r="${radius}" fill="none" stroke="${colors.soft}" stroke-width="32"/><circle cx="120" cy="120" r="${radius}" fill="none" stroke="${colors.ink}" stroke-width="32" stroke-dasharray="${share * length} ${length}" transform="rotate(-90 120 120)"/><rect x="262" y="84" width="18" height="18" rx="4" fill="${colors.ink}"/><text x="292" y="100" font-size="20" fill="${colors.ink}">${esc(labels[0])} ${esc(f(values[0]))}</text><rect x="262" y="128" width="18" height="18" rx="4" fill="${colors.soft}"/><text x="292" y="144" font-size="20" fill="${colors.ink}">${esc(labels[1])} ${esc(f(values[1]))}</text></svg>`;
  }
  function line({ labels, values, reference, name, referenceName }, f) {
    const present = [...values, ...(reference ?? [])].filter((value) => value != null);
    if (!present.length) return "";
    const low = Math.min(...present),
      high = Math.max(...present),
      span = high - low || 1;
    const x = (index) => 10 + (index / Math.max(values.length - 1, 1)) * 590;
    const y = (value) => 190 - ((value - low) / span) * 160;
    const points = (series) =>
      series.flatMap((value, index) => (value == null ? [] : [[x(index), y(value)]]));
    const path = (series) =>
      points(series)
        .map(([px, py]) => `${px},${py}`)
        .join(" ");
    const own = points(values);
    const area = `10,200 ${path(values)} ${own.at(-1)[0]},200`;
    const last = values.findLast((value) => value != null);
    return `<svg viewBox="0 0 640 262" role="img" aria-label="${esc(name)}"><polygon points="${area}" fill="${colors.ink}" opacity="0.08"/>${reference ? `<polyline points="${path(reference)}" fill="none" stroke="${colors.muted}" stroke-width="2.5" stroke-dasharray="7 7"/>` : ""}<polyline points="${path(values)}" fill="none" stroke="${colors.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="${own.at(-1)[0]}" cy="${own.at(-1)[1]}" r="7" fill="${colors.ink}"/><text x="${own.at(-1)[0]}" y="${own.at(-1)[1] - 16}" text-anchor="end" font-size="20" font-weight="700" fill="${colors.ink}">${esc(f(last))}</text><text x="10" y="226" font-size="16" fill="${colors.muted}">${esc(labels[0])}</text><text x="600" y="226" text-anchor="end" font-size="16" fill="${colors.muted}">${esc(labels.at(-1))}</text><text x="10" y="254" font-size="16" fill="${colors.ink}">${esc(name)}</text>${reference && referenceName ? `<text x="600" y="254" text-anchor="end" font-size="16" fill="${colors.muted}">- - ${esc(referenceName)}</text>` : ""}</svg>`;
  }
  function chart(item, t) {
    if (!item.chart) return "";
    const f = (value) =>
      new Intl.NumberFormat(t("en-GB"), { maximumFractionDigits: 1 }).format(value);
    const drawings = { compare, columns, donut, line };
    return (drawings[item.chart.type] ?? compare)(
      { ...item.chart, unit: item.chart.unit ? t(item.chart.unit) : "" },
      f,
    );
  }
  const change = (value) =>
    value?.delta
      ? `<span class="card-delta tone-${esc(value.tone ?? "neutral")}">${esc(value.delta)}</span>`
      : "";
  const tiles = (kpis = []) =>
    kpis.length
      ? `<dl class="card-kpis">${kpis.map((kpi) => `<div><dd>${esc(kpi.value)}</dd><dt>${esc(kpi.label)}${change(kpi)}</dt></div>`).join("")}</dl>`
      : "";
  function html(item, footer, t, { editableTitle = false } = {}) {
    const title = editableTitle
      ? `<h2 contenteditable="plaintext-only" spellcheck="false" data-slide-title="${esc(item.id)}">${esc(item.title)}</h2>`
      : `<h2>${esc(item.title)}</h2>`;
    const layout = item.layout ?? "notes";
    const head = `<header>${item.kicker ? `<span class="card-kicker">${esc(item.kicker)}</span>` : ""}${title}</header>`;
    const added = (item.added ?? [])
      .map((text) => `<p class="card-added">${esc(text)}</p>`)
      .join("");
    const context = item.boundary
      ? `<p class="card-context"><strong>${esc(t("Context"))}</strong><span>${esc(item.boundary)}</span></p>`
      : "";
    const archive =
      item.id === "prior-goals"
        ? `<div class="card-archive"><a href="assets/apex-review-2024.pptx" download>${esc(t("2024 PowerPoint"))}</a><a href="assets/apex-review-2024.pdf" download>${esc(t("2024 report (PDF)"))}</a></div>`
        : "";
    const bodies = {
      cover: () =>
        `${item.lead ? `<p class="card-lead">${esc(item.lead)}</p>` : ""}${tiles(item.kpis)}`,
      kpis: () => tiles(item.kpis),
      goals: () =>
        `<dl class="card-goals">${item.kpis
          .map(
            (goal) =>
              `<div><dt>${esc(goal.label)}</dt><dd><div><span>${esc(t("Target"))}</span><strong>${esc(goal.target)}</strong></div><div class="goal-difference tone-${esc(goal.tone)}"><span aria-hidden="true">→</span><strong>${esc(goal.delta)}</strong><small>${esc(t("vs target"))}</small></div><div><span>${esc(t("Actual"))}</span><strong>${esc(goal.value)}</strong><small class="tone-${esc(goal.tone)}">${esc(t(goal.tone === "better" ? "Target met" : "Target missed"))}</small></div></dd></div>`,
          )
          .join("")}</dl>`,
      hero: () =>
        `<div class="card-grid"><div>${item.hero ? `<strong class="card-hero">${esc(item.hero)}</strong>` : ""}${item.lead ? `<p class="card-lead">${esc(item.lead)}</p>` : ""}${change(item.trend)}${tiles(item.kpis)}</div>${item.chart ? `<div class="card-chart">${chart(item, t)}</div>` : ""}</div>`,
      steps: () =>
        `${item.lead ? `<div class="card-findings"><p class="card-lead">${esc(item.lead)}</p>${(item.fine ?? []).map((text) => `<p>${esc(text)}</p>`).join("")}</div><h3 class="card-steps-heading">${esc(t("Next steps"))}</h3>` : ""}<ol class="card-steps">${(item.steps ?? []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol>`,
      notes: () =>
        (item.fine ?? []).map((text) => `<p class="card-fine">${esc(text)}</p>`).join(""),
    };
    return `<article class="review-card layout-${esc(layout)}">${head}${(bodies[layout] ?? bodies.notes)()}${added}${context}${archive}</article>`;
  }
  root.SlideRender = { html };
})(globalThis);
