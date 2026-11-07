(function () {
  "use strict";
  const $ = (query) => document.querySelector(query);
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
  const f = (value) => new Intl.NumberFormat("fi-FI", { maximumFractionDigits: 1 }).format(value);
  let deck,
    index = 0;
  function chart(item) {
    if (!item.chart) return "";
    const { labels, values, unit } = item.chart,
      max = Math.max(...values, 1),
      monthly = item.kind === "repairs";
    const height = monthly ? 260 : 100 + labels.length * 70;
    let content;
    if (monthly) {
      const width = 490 / values.length;
      content = values
        .map((value, i) => {
          const h = (value / max) * 175,
            x = 20 + i * width;
          return `<rect x="${x}" y="${205 - h}" width="${width * 0.65}" height="${h}" fill="#7ab800"/><text x="${x + width * 0.32}" y="230" text-anchor="middle">${esc(labels[i])}</text>`;
        })
        .join("");
    } else
      content = values
        .map(
          (value, i) =>
            `<text x="20" y="${28 + i * 70}">${esc(labels[i])} · ${f(value)} ${esc(unit)}</text><rect x="20" y="${38 + i * 70}" width="${(value / max) * 470}" height="22" rx="2" fill="${i === 0 ? "#003f72" : "#a9c1d4"}"/>`,
        )
        .join("");
    return `<svg viewBox="0 0 520 ${height}" role="img" aria-label="${esc(labels.map((label, i) => `${label}: ${f(values[i])} ${unit}`).join(", "))}" style="font:14px Arial;fill:#003f72">${content}</svg>`;
  }
  function render() {
    const item = deck.slides[index];
    $("#slide-stage").innerHTML =
      `<article class="presentation-slide ${esc(item.kind)}"><div class="slide-brand"><img src="assets/lindstrom-logo.webp" alt="Lindström"></div><span class="chapter">ASIAKASKATSAUS</span>${item.cooperation ? `<div class="cooperation-badge"><i style="background:#${{ green: "578200", yellow: "F4C542", red: "E52330", unrated: "667580" }[item.cooperation.status] || "667580"}"></i><span>Yhteistyö: ${esc(item.cooperation.label)} · KAM:in arvio</span></div>` : ""}<h1>${esc(item.title)}</h1><div class="slide-body"><div>${item.value ? `<div class="slide-value">${esc(item.value)}</div>` : ""}${item.facts ? `<div class="fact-grid">${item.facts.map((fact) => `<div><span>${esc(fact.label)}</span><strong>${esc(fact.value)}</strong></div>`).join("")}</div>` : ""}${item.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</div>${item.chart ? `<div>${chart(item)}</div>` : ""}</div>${item.boundary || item.source ? `<p class="slide-source">${esc([item.boundary, item.source ? "Lähde: " + item.source : ""].filter(Boolean).join(" · "))}</p>` : ""}<p class="slide-footer">${esc(deck.footer)}</p></article>`;
    $("#page-number").textContent = `${index + 1} / ${deck.slides.length}`;
    $("#previous").disabled = index === 0;
    $("#next").disabled = index === deck.slides.length - 1;
  }
  function move(delta) {
    if (!deck) return;
    index = Math.max(0, Math.min(deck.slides.length - 1, index + delta));
    render();
  }
  function fail(message) {
    $("#loading").innerHTML = `<h1>Esitystä ei voitu avata</h1><p>${esc(message)}</p>`;
  }
  $("#previous").addEventListener("click", () => move(-1));
  $("#next").addEventListener("click", () => move(1));
  document.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.data?.type === "presentation-error")
      fail(event.data.message);
  });
  const query = new URLSearchParams(location.search);
  if (query.get("error")) {
    fail(query.get("error"));
    return;
  }
  const id = query.get("id");
  if (!id) return;
  if (!/^[a-f0-9-]{36}$/.test(id)) {
    fail("Avaa esitys uudelleen asiakaskatsauksesta.");
    return;
  }
  (async () => {
    try {
      const response = await fetch(`/api/presentations/${id}`);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Avaa esitys uudelleen asiakaskatsauksesta.");
      deck = result;
      document.title = `${deck.customer.name} · Asiakasesitys`;
      $("#customer-name").textContent = deck.customer.name;
      $("#save-presentation").href = deck.downloadUrl;
      $("#save-presentation").hidden = false;
      $("#loading").hidden = true;
      $("#slide-stage").hidden = false;
      $("#slide-navigation").hidden = false;
      render();
    } catch (error) {
      fail(error.message);
    }
  })();
})();
