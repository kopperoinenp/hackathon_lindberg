(async function () {
  "use strict";
  const { escapeHtml: esc } = globalThis.ReviewModel;
  const { storyContext } = globalThis.StoryModel;
  const $ = (query) => document.querySelector(query);
  let language = localStorage.getItem("lindstrom-language") === "fi" ? "fi" : "en";
  let translate = globalThis.ReviewLanguage.translator(language);
  const t = (...args) => translate(...args);
  const localizePage = globalThis.ReviewLanguage.page();
  function updateLanguage() {
    translate = globalThis.ReviewLanguage.translator(language);
    localizePage(language);
    for (const button of document.querySelectorAll("[data-language]"))
      button.setAttribute("aria-pressed", String(button.dataset.language === language));
  }
  function bindLanguageControls(update) {
    for (const button of document.querySelectorAll("[data-language]"))
      button.addEventListener("click", () => {
        language = button.dataset.language;
        localStorage.setItem("lindstrom-language", language);
        update();
      });
  }
  updateLanguage();
  let source;
  try {
    const response = await fetch("data.js", { signal: AbortSignal.timeout(10000) });
    if (response.ok) source = await response.text();
  } catch {
    // An unavailable source is handled like an empty dataset file.
  }
  const { data, issue } = globalThis.ReviewDataset.inspect(source);
  if (issue) {
    function showDatasetIssue() {
      updateLanguage();
      $("#dataset-title").textContent = t("Analysis unavailable");
      $("#dataset-issue").textContent = [t(issue.message), issue.field].filter(Boolean).join(" · ");
      $("#dataset-recovery").hidden = false;
    }
    bindLanguageControls(showDatasetIssue);
    showDatasetIssue();
    return;
  }
  $("#dataset-status").hidden = true;
  $("#workspace").hidden = false;
  $(".view-tabs").hidden = false;
  const countryName = (country) => t(globalThis.WorkspaceModel.countryNames[country]);
  const f = (number, digits = 0) =>
    new Intl.NumberFormat(t("en-GB"), { maximumFractionDigits: digits }).format(number);
  const state = {
    customer: "CUST001",
    from: "2025-01",
    to: "2025-12",
    country: "all",
    continent: "all",
    metric: "water",
    summaryMetric: "auto",
    visibleInsights: [...globalThis.MeetingModel.insightIds],
    heading: "",
    asking: false,
    chatRevision: 0,
    view: "summary",
    site: "all",
    baseline: "B_LOCAL",
    priority: "neutral",
    included: [...globalThis.MeetingModel.insightIds],
    titleEdits: {},
    slideOrder: [],
    generating: false,
    readyPresentation: null,
    note: "",
    cooperation: "unrated",
    savings: null,
    managerTexts: {},
    dashboardLayout: globalThis.WorkspaceModel.defaultDashboardLayout(),
    chat: [],
  };
  const defaultReviewState = structuredClone(state);
  let storageLoading = true,
    storageReady = false,
    storageBlocked = false;
  let savedSignature = "",
    savedRevision = 0,
    saveTimer;
  let saveQueue = Promise.resolve();
  let switchingReview = false;
  function storageStatus(fi, en) {
    $("#review-storage-status").textContent = language === "fi" ? fi : en;
  }
  function scheduleReviewSave() {
    if (storageLoading || !storageReady || storageBlocked) return;
    clearTimeout(saveTimer);
    if (JSON.stringify(chatWorkspace()) === savedSignature) return;
    storageStatus("Tallennetaan…", "Saving…");
    saveTimer = setTimeout(() => {
      flushReviewSave().catch(() => {});
    }, 250);
  }
  function flushReviewSave() {
    clearTimeout(saveTimer);
    if (storageBlocked) return Promise.reject(new Error("Reload the page before saving."));
    if (storageLoading || !storageReady) return saveQueue;
    const workspace = structuredClone(chatWorkspace());
    const operation = saveQueue.then(async () => {
      const signature = JSON.stringify(workspace);
      if (signature === savedSignature) return;
      if (storageBlocked) throw new Error("Reload the page before saving.");
      try {
        const response = await fetch(
          `/api/reviews/${encodeURIComponent(workspace.scope.customer)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ revision: savedRevision, workspace }),
            keepalive: true,
            signal: AbortSignal.timeout(10000),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) storageBlocked = true;
          throw new Error(result.error || "Save failed");
        }
        savedRevision = result.revision;
        savedSignature = signature;
        storageStatus("Tallennettu", "Saved");
      } catch (error) {
        storageStatus(
          storageBlocked
            ? "Tallennusristiriita – lataa sivu uudelleen."
            : "Tallennus epäonnistui. Muutokset ovat vain tällä sivulla.",
          storageBlocked
            ? "Save conflict – reload this page."
            : "Save failed. Changes are only on this page.",
        );
        throw error;
      }
    });
    saveQueue = operation.catch(() => {});
    return operation;
  }
  async function loadCustomerReview(customer) {
    storageLoading = true;
    storageReady = false;
    state.chatRevision += 1;
    $("main").inert = true;
    $("#composer").inert = true;
    storageStatus("Ladataan katsausta…", "Loading review…");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(customer)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const record = await response.json();
      if (!response.ok) throw new Error(record.error || "Load failed");
      const revision = state.chatRevision;
      Object.assign(state, structuredClone(defaultReviewState), {
        customer,
        chatRevision: revision,
      });
      if (record.workspace) {
        Object.assign(state, record.workspace.scope);
        for (const key of [
          "view",
          "metric",
          "summaryMetric",
          "visibleInsights",
          "included",
          "note",
          "heading",
          "titleEdits",
          "slideOrder",
          "cooperation",
          "savings",
          "managerTexts",
          "dashboardLayout",
        ])
          state[key] = record.workspace[key];
      }
      savedRevision = record.revision;
      savedSignature = JSON.stringify(chatWorkspace());
      storageReady = true;
      storageBlocked = false;
      localStorage.setItem("lindstrom-review-customer", customer);
      storageStatus(
        record.workspace ? "Tallennettu katsaus ladattu" : "Uusi asiakaskohtainen katsaus",
        record.workspace ? "Saved review loaded" : "New customer review",
      );
      return true;
    } catch {
      storageStatus(
        "Katsausta ei voitu ladata. Tallennus estetty; lataa sivu uudelleen.",
        "Could not load review. Saving is disabled; reload this page.",
      );
      return false;
    } finally {
      storageLoading = false;
      $("main").inert = false;
      $("#composer").inert = false;
      render();
      renderChat();
    }
  }
  window.addEventListener("pagehide", () => {
    flushReviewSave().catch(() => {});
  });
  const contractKpis = new Map();
  const includedAgendas = new Set();
  const kpiForm = $("#contract-kpi-form");
  const evidenceAreas = [
    ["scorecard", "Customer success scorecard", "Review the overall picture with the customer."],
    ["experience", "Customer experience", "CSAT, NPS or feedback supplied by the customer."],
    [
      "performance",
      "Service performance",
      "Contract SLA, delivery reliability, requests or garment availability.",
    ],
    ["adoption", "Service adoption", "Active sites and textile scans from the workspace."],
    ["operations", "Operational value", "Repair events and textile use from the workspace."],
    [
      "financial",
      "Financial value",
      "Cost, savings or avoided cost supported by customer records.",
    ],
    [
      "sustainability",
      "Sustainability value",
      "Laundry and delivery emissions, water and circularity.",
    ],
    ["improvement", "Improvement", "Open actions, recurring issues and progress."],
    [
      "future",
      "Relationship and future",
      "Customer priorities, opportunities and agreed next actions.",
    ],
  ];
  const peers = [
    ["Elis", 0.4],
    ["Cintas", 0.2],
    ["Salesianer", 0.31],
    ["Johnson Service Group", 0.38],
  ];
  const lindstromIntensity = 0.28;
  const peerAverage = peers.reduce((sum, [, intensity]) => sum + intensity, 0) / peers.length;
  let editedKpi = -1;
  let formCustomer;
  let statusTimer;
  const context = () => storyContext(data, state);
  const baselineName = () =>
    ({
      B_LOCAL: t("local outsourced laundry"),
      B_HOME: t("home laundering"),
      B_INHOUSE: t("in-house laundry"),
    })[state.baseline];
  const scopeName = () => scopeLabel();
  function periodName() {
    return state.from === "2025-01" && state.to === "2025-12"
      ? "2025"
      : `${state.from} – ${state.to}`;
  }
  function snapshotName() {
    return context().metrics.snapshotMonth || state.to;
  }
  function scopeLabel() {
    const site = data.sites.find((row) => row.site_id === state.site);
    return [
      site ? site.site_name : t("All sites"),
      state.country !== "all" ? countryName(state.country) : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function updateChatToggle() {
    $("#toggle-chat").textContent = $("#chat").hidden
      ? t("Show conversation")
      : t("Hide conversation");
    $("#toggle-chat").setAttribute("aria-expanded", String(!$("#chat").hidden));
  }
  function detailedAnalysis() {
    const detail = globalThis.WorkspaceModel.analyzeDetails(data, state);
    const number = (value, unit = "", digits = 1) =>
      value == null ? t("Unavailable") : [f(value, digits), unit].filter(Boolean).join(" ");
    const table = (headings, rows) =>
      `<div class="table-wrap"><table><thead><tr>${headings
        .map((heading) => `<th scope="col">${heading}</th>`)
        .join("")}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody></table></div>`;
    const { service } = detail;
    const routeNames = {
      reuse_kg: t("Reuse"),
      recycling_kg: t("Recycling"),
      energy_recovery_kg: t("Energy recovery"),
      incineration_kg: t("Incineration"),
    };
    return t`
      <section class="analysis-card">
        <h2>Textile use by product</h2>
        <p class="quiet">Allocation and scan coverage for ${esc(detail.snapshotMonth ?? "–")}.
        Wash frequency divides washes in the period by the sum of monthly allocations.
        Repair frequency counts events per 100 washes. Sources: Service_Activity, Products, Repairs and Customer_Impacts.</p>
        ${table(
          [
            t("Product"),
            t("Allocated"),
            t("Scanned"),
            t("Washes"),
            t("Washes / item / month"),
            t("Repairs / 100 washes"),
            t("Water / kg"),
            t("Energy / kg"),
          ],
          detail.products.map((product) => [
            product.name,
            number(product.allocated, "items", 0),
            number(product.scannedPct, "%"),
            number(product.washed, "", 0),
            number(product.washesPerPieceMonth),
            number(product.repairsPerHundredWashes),
            number(product.waterPerKg, "l", 2),
            number(product.energyPerKg, "kWh", 2),
          ]),
        )}
      </section>
      <section class="analysis-card">
        <h2>Service cycles</h2>
        <p><strong>${number(service.count, t("recorded cycles"), 0)}</strong> ·
        Median ${number(service.medianHours, "h")} · 90% of cycles within ${number(service.p90Hours, "h")} ·
        Flagged late ${number(service.latePct, "%")} · Service requests ${number(service.requests, "", 0)}</p>
        <p class="quiet">Cycles are grouped by pickup month. Late flags come from the source data.
        The figures cover recorded synthetic cycles. Service requests count contacts.
        Sources: Service_Cycles and Service_Activity.</p>
        ${
          service.count
            ? table(
                [t("Site"), t("Cycles"), t("Median"), "P90", t("Late")],
                detail.serviceBySite.map((site) => [
                  site.name,
                  number(site.count, "", 0),
                  number(site.medianHours, "h"),
                  number(site.p90Hours, "h"),
                  number(site.latePct, "%"),
                ]),
              )
            : t("<p>No recorded service cycles match the filters.</p>")
        }
      </section>
      <section class="analysis-card">
        <h2>Energy and textile circularity</h2>
        <p >Energy ${number(detail.energy, "kWh", 0)} · ${number(detail.energyPerKg, t("kWh / kg washed"), 2)} ·
        Selected baseline ${number(detail.baselineEnergy, "kWh", 0)} ·
        Baseline minus Lindström ${number(detail.energyDifference, "kWh", 0)}</p>
        <p>Allocated textile waste ${number(detail.waste, "kg")} · ${number(detail.wastePerKg, t("kg / kg washed"), 3)}</p>
        ${table(
          [t("Treatment route"), t("Allocated amount"), t("Share")],
          detail.wasteRoutes.map((route) => [
            routeNames[route.key],
            number(route.kg, "kg"),
            number(route.share == null ? null : route.share * 100, "%"),
          ]),
        )}
        <p class="quiet">Synthetic allocated estimates. The comparison uses the same washed weight.
        Waste follows the laundry's monthly treatment mix.
        Sources: Customer_Impacts, Baselines and Waste_Circularity.</p>
      </section>
      <section class="analysis-card">
        <h2>Repair impact scenarios</h2>
        ${table(
          [
            t("Assumed share of repairs that delay replacement"),
            t("Estimated delayed replacements"),
            t("Estimated product footprint"),
          ],
          detail.repairScenarios.map((scenario) => [
            number(scenario.factor * 100, "%", 0),
            number(scenario.replacements),
            number(scenario.emissions == null ? null : scenario.emissions / 1000, "t CO₂e", 2),
          ]),
        )}
        <p class="quiet">The scenarios use the source assumption that one repair may delay one replacement.
        The product footprint estimate is separate from laundry and delivery emissions. Sources: Repairs and Assumptions.</p>
      </section>`;
  }
  function renderAnalysis() {
    const ctx = context(),
      m = ctx.metrics;
    if (!m.hasData) {
      $("#analysis-content").innerHTML =
        `<section class="empty-state"><h2>${ctx.invalidPeriod ? t("Check the date range") : t("No data matches the filters")}</h2><p>${ctx.invalidPeriod ? t("The start month must be on or before the end month.") : t("Choose another country, site or date range.")}</p></section>`;
      return;
    }
    const definitions = {
      water: { label: t("Water consumption"), unit: "m³", divisor: 1000 },
      emissions: { label: t("Laundry and delivery emissions"), unit: "t CO₂e", divisor: 1000 },
      repairs: { label: t("Repairs"), unit: "items", divisor: 1 },
    };
    const def = definitions[state.metric],
      points = globalThis.WorkspaceModel.series(ctx, state.metric),
      countries = globalThis.WorkspaceModel.countries(data, ctx, state.metric);
    const max = Math.max(...points.map((point) => point.value), 1),
      countryMax = Math.max(...countries.map((point) => point.value), 1);
    $("#analysis-content").innerHTML =
      t`<div class="analysis-scope"><strong>${esc(scopeLabel())}</strong><span>${periodName()} · ${ctx.rows.length} monthly site records</span></div><div class="analysis-kpis">${[
        [t("Water used for washing"), f(m.water / 1000) + " m³"],
        [t("Laundry and delivery"), f(m.emissions / 1000, 1) + " t CO₂e"],
        [t("Repairs"), f(m.repairs) + " items"],
        [t("Allocated textiles"), f(m.allocated) + " items"],
      ]
        .map(
          ([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`,
        )
        .join(
          "",
        )}</div><div class="analysis-charts"><section class="analysis-card"><div class="chart-heading"><h2>Monthly trend</h2><label for="metric" class="sr-only">Chart metric</label><select id="metric">${Object.entries(
        definitions,
      )
        .map(
          ([key, definition]) =>
            `<option value="${key}" ${state.metric === key ? "selected" : ""}>${definition.label}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="trend-chart" style="grid-template-columns:repeat(${points.length}, minmax(0,1fr))" role="img" aria-label="${t(def.label)}: ${points.map((point) => `${point.month} ${f(point.value / def.divisor, 1)} ${def.unit}`).join(", ")}">${points.map((point) => `<div class="trend-column"><span>${f(point.value / def.divisor)}</span><div class="trend-track"><i style="height:${(point.value / max) * 100}%"></i></div><small>${point.month.slice(5)}</small></div>`).join("")}</div><p class="quiet">${t(def.label)} (${def.unit}) · Synthetic ${state.metric === "repairs" ? t("event count") : t("allocated estimate")}. Monthly totals reflect service volume.</p></section><section class="analysis-card"><h2>Breakdown by country</h2>${countries.map((point) => `<div class="country-row"><div><span>${countryName(point.country)}</span><strong>${f(point.value / def.divisor, 1)} ${def.unit}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(point.value / countryMax) * 100}%"></div></div></div>`).join("")}<p class="quiet">${t(def.label)} for the selected period. Country totals reflect service volume.</p></section></div><section class="analysis-card"><h2>Sites and textile use</h2><p class="quiet">Snapshot for ${snapshotName()}. Scan coverage flags where to investigate. Water and repairs cover the full period.</p><div class="table-wrap"><table><thead><tr><th>Site</th><th>Country</th><th>Scanned</th><th>Allocated</th><th>Water, m³</th><th>Repairs</th></tr></thead><tbody>${ctx.sites.map((site) => t`<tr><td><button class="site-link" data-site="${site.site_id}">${esc(site.site_name)}</button></td><td>${countryName(site.country)}</td><td>${site.utilization == null ? t("Unavailable") : f(site.utilization, 1) + " %"}</td><td>${f(site.allocated)}</td><td>${f(site.water / 1000)}</td><td>${f(site.repairs)}</td></tr>`).join("")}</tbody></table></div></section>${detailedAnalysis()}`;
  }
  function render() {
    const customerOverview = $("#customer-overview");
    if (customerOverview) {
      customerOverview.hidden = false;
      $("#summary-panel").before(customerOverview);
    }
    $("#customer").value = state.customer;
    invalidatePowerPoint();
    const ctx = context();
    const months = [...new Set(data.records.map((row) => row.month))].sort();
    for (const id of ["from", "to"]) {
      $("#" + id).innerHTML = months
        .map((month) => `<option value="${month}">${month}</option>`)
        .join("");
      $("#" + id).value = state[id];
    }
    const available = data.sites.filter((row) => row.customer_id === state.customer);
    $("#country").innerHTML =
      t('<option value="all">All countries</option>') +
      [...new Set(available.map((row) => row.country))]
        .map((country) => `<option value="${country}">${countryName(country)}</option>`)
        .join("");
    $("#site").innerHTML =
      t('<option value="all">All sites</option>') +
      available
        .filter((row) => state.country === "all" || row.country === state.country)
        .map((row) => `<option value="${row.site_id}">${esc(row.site_name)}</option>`)
        .join("");
    for (const id of ["site", "baseline", "priority", "country", "continent"])
      $("#" + id).value = state[id];
    $("#summary-panel").hidden = state.view !== "summary";
    $("#analysis-panel").hidden = state.view !== "analysis";
    $("#composer").hidden = state.view !== "summary";
    for (const view of ["summary", "analysis"]) {
      const tab = $("#" + view + "-tab");
      tab.setAttribute("aria-selected", String(state.view === view));
      tab.tabIndex = state.view === view ? 0 : -1;
    }
    $("#open-review").disabled = !ctx.metrics.hasData || state.generating || !state.included.length;
    $("#summary-panel").before($("#customer-overview"));
    $("#customer-overview").hidden = false;
    renderCustomerOverview();
    renderReviewEvidence();
    renderStory();
    renderDashboardEdits();
    renderDashboardLayout();
    if (state.view === "analysis") renderAnalysis();
    scheduleReviewSave();
  }
  function customerKpis() {
    return contractKpis.get(state.customer) ?? [];
  }
  function kpiDescription(kpi) {
    return [
      t("Actual") + ": " + (kpi.actual || t("Unavailable")),
      kpi.target && t("Target") + ": " + kpi.target,
      kpi.source || t("KAM input without source"),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function resetKpiForm() {
    editedKpi = -1;
    kpiForm.reset();
    $("#cancel-contract-kpi").hidden = true;
  }
  function renderReviewEvidence() {
    if (formCustomer !== state.customer) {
      formCustomer = state.customer;
      resetKpiForm();
    }
    const area = kpiForm.elements.area;
    const selectedArea = area.value;
    area.innerHTML = evidenceAreas
      .map(([id, label]) => `<option value="${id}">${t(label)}</option>`)
      .join("");
    if (selectedArea) area.value = selectedArea;
    $("#review-evidence-areas").innerHTML = evidenceAreas
      .map(([, label, evidence]) => `<li><strong>${t(label)}</strong> · ${t(evidence)}</li>`)
      .join("");
    const kpis = customerKpis();
    const agenda = kpis.filter((kpi) => kpi.priority);
    $("#contract-agenda").innerHTML = agenda.length
      ? `<ul class="contract-kpi-list">${agenda
          .map((kpi) => `<li><strong>${esc(kpi.label)}</strong> · ${esc(kpiDescription(kpi))}</li>`)
          .join("")}</ul>`
      : `<p class="quiet">${t("No contract KPIs are highlighted for this customer.")}</p>`;
    $("#contract-kpi-list").innerHTML = kpis
      .map((kpi, index) => {
        const label = evidenceAreas.find(([id]) => id === kpi.area)[1];
        return `<li><strong>${esc(kpi.label)}</strong> · ${t(label)}<br />${esc(kpiDescription(kpi))}<div class="kpi-actions"><button type="button" class="text-button" data-edit-kpi="${index}">${t("Edit KPI")}</button><button type="button" class="text-button" data-remove-kpi="${index}">${t("Remove KPI")}</button></div></li>`;
      })
      .join("");
    const includeAgenda = $("#include-contract-agenda");
    includeAgenda.disabled = agenda.length === 0;
    includeAgenda.checked = agenda.length > 0 && includedAgendas.has(state.customer);

    const difference = f((1 - lindstromIntensity / peerAverage) * 100);
    $("#industry-benchmark-summary").textContent =
      `${difference} % · ${t("Lower emissions intensity than the four-peer average (illustrative)")}`;
    const benchmarkRows = [
      ...peers,
      [t("Four-peer average"), peerAverage],
      ["Lindström Group", lindstromIntensity],
    ];
    $("#industry-benchmark").innerHTML =
      `<table><thead><tr><th scope="col">${t("Company")}</th><th scope="col">${t("kg emissions / € turnover")}</th></tr></thead><tbody>${benchmarkRows.map(([name, intensity]) => `<tr><th scope="row">${name}</th><td>${f(intensity, 4)}</td></tr>`).join("")}</tbody></table><p class="quiet">${t("Source: supplied project figures. The average is unweighted and excludes Lindström. This company comparison is separate from the customer's laundry and delivery estimates.")}</p>`;
  }
  kpiForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(kpiForm);
    const kpi = Object.fromEntries(fields);
    for (const field of ["label", "actual", "target", "source"]) kpi[field] = kpi[field].trim();
    if (!kpi.label) {
      status(t("Enter a KPI name."));
      kpiForm.elements.label.focus();
      return;
    }
    kpi.priority = fields.has("priority");
    const kpis = customerKpis();
    if (editedKpi < 0 && kpis.length >= 12) {
      status(t("This customer can have up to 12 contract KPIs."));
      return;
    }
    if (
      kpi.priority &&
      kpis.filter((item, index) => item.priority && index !== editedKpi).length >= 3
    ) {
      status(t("Highlight up to three KPIs. Unmark another KPI first."));
      return;
    }
    kpis[editedKpi < 0 ? kpis.length : editedKpi] = kpi;
    contractKpis.set(state.customer, kpis);
    resetKpiForm();
    renderReviewEvidence();
    invalidatePowerPoint();
    status(t("Contract KPI saved."));
  });
  $("#cancel-contract-kpi").addEventListener("click", () => {
    resetKpiForm();
    kpiForm.elements.label.focus();
  });
  $("#contract-kpi-list").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const kpis = customerKpis();
    if (button.dataset.editKpi !== undefined) {
      editedKpi = Number(button.dataset.editKpi);
      const kpi = kpis[editedKpi];
      for (const field of ["label", "area", "actual", "target", "source"])
        kpiForm.elements[field].value = kpi[field];
      kpiForm.elements.priority.checked = kpi.priority;
      $("#cancel-contract-kpi").hidden = false;
    } else {
      kpis.splice(Number(button.dataset.removeKpi), 1);
      resetKpiForm();
      renderReviewEvidence();
      invalidatePowerPoint();
      status(t("Contract KPI removed."));
    }
    kpiForm.elements.label.focus();
  });
  $("#include-contract-agenda").addEventListener("change", (event) => {
    if (event.target.checked) includedAgendas.add(state.customer);
    else includedAgendas.delete(state.customer);
    invalidatePowerPoint();
  });
  function renderCustomerOverview() {
    const overview = globalThis.WorkspaceModel.customerOverview(data, state.customer);
    const industry =
      {
        "Food & Beverage": t("Elintarviketeollisuus"),
        Manufacturing: t("Teollisuus"),
        Healthcare: t("Terveydenhuolto"),
      }[overview.customer.industry] || overview.customer.industry;
    $("#customer-overview").innerHTML = t`
      <div class="customer-overview-heading"><div><span class="section-kicker">ASIAKKAAN PERUSTIEDOT</span>
      <h2>${esc(overview.customer.customer_name)}</h2>
      <p>${esc(industry)} · Kotimaa ${esc(countryName(overview.customer.hq_country))} · ${esc(state.customer)}</p></div>
      <span class="customer-snapshot">Viimeisin aineisto: ${esc(overview.snapshotMonth || t("Ei tietoa"))}</span></div>
      <div class="customer-overview-kpis">
      <div><strong>${overview.allocated === null ? t("Ei tietoa") : f(overview.allocated)}</strong><span>asiakkaalle kohdistettua tekstiiliä${overview.complete ? "" : t(" (osittainen tieto)")}</span></div>
      <div><strong>${overview.sites.length}</strong><span>toimipaikkaa</span></div>
      <div><strong>${overview.countries.length}</strong><span>maata · ${esc(overview.countries.map(countryName).join(", "))}</span></div></div>
      <details class="customer-locations"><summary>Kaikki sijainnit ja tekstiilimäärät (${overview.sites.length})</summary>
      <ul>${overview.sites.map((site) => `<li><div><strong>${esc(site.site_name)}</strong><span>${esc(site.city)} · ${esc(countryName(site.country))}</span></div><span>${site.allocated === null ? t("Ei tietoa") : f(site.allocated) + t(" kpl")}</span></li>`).join("")}</ul></details>
      <p class="quiet">Koko asiakkuus, riippumatta katsauksen rajauksesta. Tekstiilimäärä kuvaa viimeisimmän aineistokuukauden kohdistettua kantaa, ei pesumääriä tai reaaliaikaista varastoa. Synteettinen aineisto.</p>`;
    if (state.savings !== null)
      $("#customer-overview").insertAdjacentHTML(
        "beforeend",
        t`<article class="kam-savings"><span>Säästetty raha · KAM:in arvio</span><strong>${f(state.savings, 2)} €</strong><small>KAM:in antama arvio. Summaa ei ole laskettu tai todennettu tämän aineiston perusteella.</small></article>`,
      );
  }
  function status(text) {
    $("#status").textContent = text;
    $("#status").classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => $("#status").classList.remove("visible"), 4000);
  }
  function chart(actual, alternative, unit) {
    const maximum = Math.max(actual, alternative, 1);
    return t`<div class="mini-chart" role="img" aria-label="Lindström ${f(actual)} ${unit}, baseline ${f(alternative)} ${unit}"><div class="bar-label"><span>Lindström</span><span>${f(actual)} ${unit}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(actual / maximum) * 100}%"></div></div><div class="bar-label"><span>Baseline</span><span>${f(alternative)} ${unit}</span></div><div class="bar-track"><div class="bar-fill alt" style="width:${(alternative / maximum) * 100}%"></div></div></div>`;
  }
  function results() {
    const { metrics: m, compare: c } = context();
    return {
      water: {
        name: t("Water"),
        value: `${c.waterDifference >= 0 ? "−" : "+"}${f(Math.abs(c.waterPercent), 0)} %`,
        unit: t("versus baseline"),
        title:
          c.waterDifference >= 0
            ? t("Less water for the same wash volume")
            : t("Water consumption exceeds the baseline"),
        text: t`Allocated water consumption was ${f(m.water / 1000)} m³. The difference versus the baseline is ${f(Math.abs(c.waterDifference) / 1000)} m³.`,
        visual: chart(m.water / 1000, c.baselineWater / 1000, "m³"),
        source: "Customer_Impacts, Baselines",
        boundary: t("Calculated estimate · water used for washing"),
      },
      emissions: {
        name: t("Climate impact"),
        value: `${c.emissionsDifference >= 0 ? "−" : "+"}${f(Math.abs(c.emissionsPercent), 0)} %`,
        unit: t("versus baseline"),
        title:
          c.emissionsDifference >= 0
            ? t("Lower laundry and delivery footprint")
            : t("Laundry and delivery emissions exceed the baseline"),
        text: t`Estimated laundry and delivery emissions were ${f(m.emissions / 1000, 1)} t CO₂e. The difference versus the baseline is ${f(Math.abs(c.emissionsDifference) / 1000, 1)} t CO₂e.`,
        visual: chart(m.emissions / 1000, c.baselineEmissions / 1000, "t CO₂e"),
        source: "Customer_Impacts, Baselines",
        boundary: t("Calculated estimate · laundry and delivery"),
      },
      repairs: {
        name: t("Textile care"),
        value: f(m.repairs),
        unit: t("repairs in the selected period"),
        title: t("Repairs help textiles last longer"),
        text: t(
          "The count shows recorded repairs. Avoided purchases and emissions require separate evidence.",
        ),
        visual: globalThis.SummaryCharts.repairBars(context()),
        source: t("Repairs"),
        boundary: t("Synthetic count of repair events"),
      },
    };
  }
  function opening() {
    return {
      neutral: t(
        "Review water use, laundry and delivery emissions, and repairs. End with a proposed improvement to discuss together.",
      ),
      water:
        context().customer.industry === "Food & Beverage"
          ? t(
              "For this food and beverage customer, the review highlights water use and textile care.",
            )
          : t(
              "This review focuses on water use, starting with the results and ending with a proposed improvement.",
            ),
      efficiency: t("This review focuses on textile care and checks how allocations match demand."),
      circularity: t(
        "This review looks at repairs and continued textile use, including where more evidence is needed.",
      ),
      emissions: t(
        "This review focuses on laundry and delivery emissions, with the comparison scope and assumptions shown alongside the results.",
      ),
    }[state.priority];
  }
  function plan() {
    const { focus } = context();
    return [
      [
        t`Review ${focus.site_name} with the customer.`,
        t("Check reserve stock needs and scan coverage."),
      ],
      [
        t("Agree on one improvement and assign an owner."),
        t("Confirm demand before changing allocations."),
      ],
      [
        t("Review progress at the next meeting."),
        t("Estimate potential savings once the inputs have been agreed."),
      ],
    ];
  }
  function summaryGraphics() {
    const ctx = context();
    const preferredMetric =
      state.summaryMetric !== "auto"
        ? state.summaryMetric
        : state.priority === "emissions"
          ? "emissions"
          : ["circularity", "efficiency"].includes(state.priority)
            ? "repairs"
            : "water";
    const metric = state.visibleInsights.includes(preferredMetric)
      ? preferredMetric
      : ["water", "emissions", "repairs"].find((id) => state.visibleInsights.includes(id));
    if (!metric) return "";
    const def = globalThis.SummaryCharts.definitions[metric];
    const points = globalThis.SummaryCharts.comparisonPoints(ctx, metric);
    const peak = points.reduce(
      (best, point) => (point.actual > best.actual ? point : best),
      points[0],
    );
    const shares = globalThis.SummaryCharts.countryShares(data, ctx, metric);
    const colors = ["#003f72", "#006f86", "#578200"];
    let end = 0;
    const stops = shares
      .map((point, index) => {
        const start = end;
        end += point.share * 100;
        return `${colors[index % colors.length]} ${start}% ${end}%`;
      })
      .join(", ");
    const total = shares.reduce((sum, point) => sum + point.value, 0);
    return t`<div class="summary-graphics"><section class="summary-chart-card"><div class="graphic-heading"><div><span class="section-kicker">TRENDS OVER THE PERIOD</span><h3>${metric === "repairs" ? t("Monthly repair activity") : t(def.label) + t(" versus baseline")}</h3></div><span class="chart-period">${esc(periodName())}</span></div><div class="chart-legend"><span><i class="legend-actual"></i>Lindström</span>${metric === "repairs" ? "" : t('<span><i class="legend-baseline"></i>Selected baseline</span>')}</div>${globalThis.SummaryCharts.lineChart(ctx, metric)}<div class="chart-takeaway"><strong>Highest monthly total: ${peak.month}</strong><span>${f(peak.actual / def.divisor, 1)} ${def.unit}</span></div><p class="quiet">${metric === "repairs" ? t("Synthetic count of recorded repair events.") : t("Calculated estimate using the same washed weight in both models. Monthly totals reflect service volume.")}</p></section><section class="summary-chart-card geography-card"><span class="section-kicker">WHERE DOES THE TOTAL COME FROM?</span><h3>${metric === "water" ? t("Water use") : metric === "emissions" ? t("Emissions") : t("Repairs")} by country</h3><div class="country-donut" style="background:conic-gradient(${total ? stops : "#e4e9ed 0% 100%"})" role="img" aria-label="${shares.map((point) => t`${countryName(point.country)} ${f(point.share * 100, 1)} percent`).join(", ")}"><div><strong>${f(total / def.divisor)}</strong><span>${def.unit} total</span></div></div><div class="country-legend">${shares.map((point, index) => `<div><i style="background:${colors[index % colors.length]}"></i><span>${countryName(point.country)}</span><strong>${f(point.share * 100, 1)} %</strong></div>`).join("")}</div><p class="quiet">Shares of the selected period total reflect the number of sites and service volume.</p></section></div>`;
  }
  function snapshotGraphic(site) {
    const ratio = Math.max(0, Math.min(site.utilization || 0, 100));
    return t`<div class="snapshot-ring" style="--scan-angle:${ratio * 3.6}deg" role="img" aria-label="Scanned ${f(site.scanned)} textiles, unscanned ${f(site.unscanned)}, allocated total ${f(site.allocated)}"><div><strong>${f(site.utilization, 1)} %</strong><span>scan coverage</span></div></div><div class="snapshot-counts"><span><i></i>${f(site.scanned)} scanned</span><span><i></i>${f(site.unscanned)} unscanned</span></div><p class="ratio-caption">Snapshot for ${snapshotName()}. Check reserve stock, seasonal demand and data coverage before changing allocations.</p>`;
  }
  function siteBenchmark() {
    const ctx = context(),
      shown = ctx.sites.filter((site) => site.utilization !== null).slice(0, 5);
    return t`<div class="site-benchmark"><div><h3>${shown.length === 1 ? t("Scan coverage at the selected site") : shown.length + t(" sites with the lowest scan coverage")}</h3><p class="quiet">${snapshotName()} · Starting point for a joint review.</p></div><div class="site-ranking">${shown.map((site) => `<div><span>${esc(site.site_name)}</span><div><i style="width:${Math.min(site.utilization, 100)}%"></i></div><strong>${f(site.utilization, 1)} %</strong></div>`).join("")}</div></div>`;
  }
  function renderStory() {
    const { metrics: m, focus, sites, order, customer } = context();
    if (!m.hasData) {
      $("#story").innerHTML =
        t`<section class="intro"><h1>No data matches the filters.</h1><p>${context().invalidPeriod ? t("The start month is after the end month.") : t("Choose another date range or location in Explore data.")}</p></section>`;
      return;
    }
    const shortNames = {
      "NorthStar Foods Group": "NorthStar",
      "Apex Industrial Systems": "Apex",
      "Mediora Health Network": "Mediora",
    };
    const displayName = Object.hasOwn(shortNames, customer.customer_name)
      ? shortNames[customer.customer_name]
      : customer.customer_name;
    const cards = results();
    const visibleOrder = order.filter((id) => state.visibleInsights.includes(id));
    const title =
      state.heading || state.titleEdits.cover
        ? esc(state.heading || state.titleEdits.cover)
        : t`${esc(displayName)} · ${periodName()}<br />What did we achieve?`;

    $("#story").innerHTML =
      t`<section class="intro"><span class="section-kicker">ANNUAL REVIEW PREPARATION</span><h1>${title}</h1><p>${opening()}</p><div class="scope"><strong>${esc(scopeName())}</strong> · ${m.sites} ${t(m.sites === 1 ? "site" : "sites")} · Baseline: ${baselineName()}</div></section><section class="story-section" aria-labelledby="results-title"${visibleOrder.length ? "" : " hidden"}><div class="section-heading"><span class="section-number">01</span><h2 id="results-title">Key results for the period</h2></div><div class="results">${visibleOrder
        .map((key) => {
          const card = cards[key];
          return t`<article class="result" data-insight="${key}"><div class="result-name">${card.name}</div><div class="result-value">${card.value}</div><span class="result-unit">${card.unit}</span>${card.visual}<h3>${card.title}</h3><p>${card.text}</p><div class="relevance"><strong>Why this matters</strong><p>${esc(globalThis.MeetingModel.relevance(key, state.priority, false, language))}</p></div><small>${card.boundary}</small></article>`;
        })
        .join(
          "",
        )}</div><p class="quiet">Synthetic data. The baseline models an alternative laundry service at the same wash volume.</p>${summaryGraphics()}</section><section class="story-section" aria-labelledby="opportunity-title"${state.visibleInsights.includes("opportunity") ? "" : " hidden"}><div class="section-heading"><span class="section-number">02</span><h2 id="opportunity-title">What to investigate first</h2></div><div class="opportunity"><div><span class="section-kicker">${esc(focus.site_name)}</span><h3>Do textile allocations match demand?</h3><p>${f(focus.unscanned)} allocated textiles had no active scan in ${snapshotName()}. Start by reviewing this site with the customer.</p></div><div class="opportunity-visual">${snapshotGraphic(focus)}</div></div><p class="relevance">${esc(globalThis.MeetingModel.relevance("opportunity", state.priority, false, language))}</p>${siteBenchmark()}<details class="site-details"><summary>See other sites</summary><div class="table-wrap"><table><thead><tr><th>Site</th><th>Scanned ${snapshotName()}</th><th>Allocated textiles</th></tr></thead><tbody>${sites.map((site) => t`<tr><td><button class="site-link" data-site="${site.site_id}">${esc(site.site_name)}</button></td><td>${f(site.utilization, 1)} %</td><td>${f(site.allocated)}</td></tr>`).join("")}</tbody></table></div><p class="quiet">Open a site to see its review. Ask the assistant to “show all sites” to return to the full review.</p></details></section><section class="story-section" aria-labelledby="next-title"><div class="section-heading"><span class="section-number">03</span><h2 id="next-title">Next year's priorities</h2></div><div class="next-chapter"><div><h3>One improvement<br />at a time</h3><p>Use these proposals to start a discussion and agree on next steps with the customer.</p></div><ol class="next-steps">${plan()
        .map(([title, note]) => `<li>${esc(title)}<small>${esc(note)}</small></li>`)
        .join(
          "",
        )}</ol></div><details class="notes-details" ${state.note ? "open" : ""}><summary>Add a note to the presentation</summary><label for="meeting-note" class="sr-only">Meeting note</label><textarea id="meeting-note" maxlength="2000" placeholder="E.g. a customer goal or an agreed next step…">${esc(state.note)}</textarea><p class="quiet">The note stays in this tab until you change the customer, site or baseline.</p></details></section>`;
  }
  function renderDashboardEdits() {
    const targets = {
      cover: $("#story .intro"),
      overview: $("#customer-overview"),
      water: $("[data-insight=water]"),
      emissions: $("[data-insight=emissions]"),
      repairs: $("[data-insight=repairs]"),
      opportunity: $("#story .opportunity"),
      plan: $("#next-title")?.closest("section"),
    };
    for (const [id, target] of Object.entries(targets)) {
      if (!target) continue;
      if (id === "overview" && state.titleEdits[id]) {
        target
          .querySelector(".customer-overview-heading")
          .insertAdjacentHTML("afterend", `<h3>${esc(state.titleEdits[id])}</h3>`);
      } else if (id !== "cover" && state.titleEdits[id]) {
        const heading = target.querySelector("h3, h2");
        if (heading) heading.textContent = state.titleEdits[id];
      }
      if (state.managerTexts[id])
        target.insertAdjacentHTML(
          "beforeend",
          t`<div class="kam-dashboard-note"><strong>KAM:in näkökulma</strong><p>${esc(state.managerTexts[id])}</p></div>`,
        );
    }
    if (state.note)
      $("#story .intro")?.insertAdjacentHTML(
        "beforeend",
        t`<div class="kam-dashboard-note"><strong>Palaverin tavoite · KAM</strong><p>${esc(state.note)}</p></div>`,
      );
  }
  function renderDashboardLayout() {
    if (state.view !== "summary" || !context().metrics.hasData) return;
    const story = $("#story"),
      m = context().metrics;
    const definitions = {
      allocated: [
        t("Tekstiilejä asiakkaalla"),
        f(m.allocated) + t(" kpl"),
        t("Tilanne ") + snapshotName(),
      ],
      sites: [t("Toimipaikkoja"), f(m.sites), t("Valittu rajaus")],
      scanned: [
        t("Skannattuja tekstiilejä"),
        f(m.scanned) + t(" kpl"),
        t("Tilanne ") + snapshotName(),
      ],
      unscanned: [
        t("Ilman skannausta"),
        f(m.unscanned) + t(" kpl"),
        t("Tilanne ") + snapshotName() + t(" · ei todiste vajaakäytöstä"),
      ],
      washed: [
        t("Pestyjä tekstiilejä"),
        f(m.washed) + t(" kpl"),
        periodName() + t(" · tapahtumamäärä"),
      ],
      water: [
        t("Vedenkäyttö"),
        f(m.water / 1000) + " m³",
        periodName() + t(" · laskennallinen arvio"),
      ],
      emissions: [
        t("Pesun ja toimitusten päästöt"),
        f(m.emissions / 1000, 1) + " t CO₂e",
        periodName() + t(" · laskennallinen arvio"),
      ],
      repairs: [t("Korjaukset"), f(m.repairs) + t(" kpl"), periodName() + t(" · tapahtumamäärä")],
    };
    const metrics = document.createElement("section");
    metrics.className = "dashboard-metrics";
    metrics.innerHTML = t`<h2>Valitsemasi tiedot</h2><div class="dashboard-metric-grid">${state.dashboardLayout.metrics
      .map((id) => {
        const [label, value, scope] = definitions[id];
        return `<article><span>${label}</span><strong>${value}</strong><small>${esc(scope)}</small></article>`;
      })
      .join("")}</div><p class="quiet">${esc(scopeName())} · Synteettinen aineisto</p>`;
    const savings = $(".kam-savings") || document.createElement("section");
    if (!savings.textContent)
      savings.innerHTML = t(
        "<h2>Säästöarvio</h2><p>Säästöarviota ei ole annettu. Kerro apurille summa euroina.</p>",
      );
    const modules = {
      overview: $("#customer-overview"),
      intro: $("#story .intro"),
      savings,
      metrics,
      results: $("#results-title")?.closest("section"),
      charts: $("#story .summary-graphics"),
      opportunity: $("#opportunity-title")?.closest("section"),
      plan: $("#next-title")?.closest("section"),
    };
    const selected = state.dashboardLayout.sections;
    for (const id of [
      ...selected,
      ...Object.keys(modules).filter((id) => !selected.includes(id)),
    ]) {
      const module = modules[id];
      if (!module) continue;
      module.dataset.dashboardModule = id;
      module.hidden =
        !selected.includes(id) ||
        (id === "savings" && state.savings === null && selected.includes("overview"));
      story.append(module);
    }
  }
  function evidenceHtml() {
    if (!context().metrics.hasData)
      return t("<p>No data matches the filters. Adjust them to view the calculation.</p>");
    const { metrics: m, compare: c, baseline: b, customer } = context();
    return t`<p class="quiet">${esc(customer.customer_name)} · ${esc(scopeName())} · ${periodName()}</p><p class="quiet">All customer figures are synthetic. Water and emissions are calculated estimates allocated from laundry-level data.</p><section class="method-section"><h3>Baseline: ${baselineName()}</h3><p>The baselines apply different water and emissions factors to the same washed weight. They represent illustrative laundry models.</p><div class="formula">Water difference: ${f(m.kg, 1)} kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l<br />Emissions difference: ${f(m.kg, 1)} kg × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e</div><p>The scope covers water used in washing and laundry and delivery emissions. Figures in the review are rounded.</p></section><section class="method-section"><h3>Sources and calculations</h3><p>${esc(data.source)}</p><ul><li>Customers and Sites: synthetic customer and site records.</li><li>Service_Activity: washed kilograms in the period and allocations and scans for ${snapshotName()}.</li><li>Customer_Impacts: allocated_water_l, allocated_process_kgco2e and allocated_delivery_kgco2e, summed over the period.</li><li>Repairs: number of repair events in the selected period.</li><li>Baselines: factors for the selected comparison.</li></ul></section><section class="method-section"><h3>Interpretation limits</h3><ul><li>Scan coverage highlights where to investigate actual textile use.</li><li>Repair scenarios depend on assumptions about delayed purchases. Their estimated impact is shown separately from laundry emissions.</li><li>Unique wearer counts require person identifiers.</li><li>Cost savings, request resolution and regulatory claims require further evidence.</li><li>Industry focus is an editable suggestion.</li></ul></section>`;
  }
  function clearScope() {
    state.note = "";
    state.savings = null;
    state.managerTexts = {};
    state.titleEdits = {};
    state.slideOrder = [];
    state.chat = [];
    state.heading = "";
    state.chatRevision += 1;
  }
  function chatWorkspace() {
    return {
      ...presentationRequest(false),
      view: state.view,
      metric: state.metric,
      summaryMetric: state.summaryMetric,
      visibleInsights: state.visibleInsights,
      heading: state.heading,
      dashboardLayout: state.dashboardLayout,
    };
  }
  function renderChat() {
    $("#chat").innerHTML =
      state.chat
        .map((msg) => `<p class="message ${msg.user ? "user" : ""}">${esc(msg.text)}</p>`)
        .join("") + (state.asking ? t('<p class="message pending">Applying changes…</p>') : "");
    $("#chat").scrollTop = $("#chat").scrollHeight;
    $("#question").disabled = state.asking;
    $("#ask-form button[type=submit]").disabled = state.asking;
    $("#ask-form").setAttribute("aria-busy", String(state.asking));
  }
  async function ask(question) {
    if (state.asking) return;
    const workspace = chatWorkspace(),
      snapshot = JSON.stringify(workspace),
      revision = state.chatRevision;
    const history = state.chat
      .slice(-6)
      .map((msg) => ({ role: msg.user ? "user" : "assistant", content: msg.text.slice(0, 1800) }));
    state.chat.push({ user: true, text: question });
    state.asking = true;
    $("#chat").hidden = false;
    renderChat();
    updateChatToggle();
    try {
      const response = await fetch(`/api/chat?lang=${language}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history, workspace }),
        signal: AbortSignal.timeout(95000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("The assistant request failed."));
      if (revision !== state.chatRevision || snapshot !== JSON.stringify(chatWorkspace())) {
        status(
          t(
            "The review changed while the request was running. Send a new request for the current review.",
          ),
        );
        return;
      }
      const next = result.workspace;
      const customerChanged = state.customer !== next.scope.customer;
      if (customerChanged) {
        await flushReviewSave();
        if (await loadCustomerReview(next.scope.customer))
          status(
            language === "fi"
              ? "Asiakkaan tallennettu katsaus ladattu. Anna mahdolliset lisämuutokset tähän katsaukseen."
              : "Customer review loaded. Apply further edits to this review.",
          );
        return;
      }
      for (const key of [
        "customer",
        "from",
        "to",
        "country",
        "continent",
        "site",
        "baseline",
        "priority",
      ])
        state[key] = next.scope[key];
      for (const key of [
        "view",
        "metric",
        "summaryMetric",
        "visibleInsights",
        "included",
        "note",
        "heading",
        "titleEdits",
        "slideOrder",
        "cooperation",
        "savings",
        "managerTexts",
        "dashboardLayout",
      ])
        state[key] = next[key];
      render();
      await flushReviewSave();
      state.chat.push({ user: false, text: result.changed.length ? t("Done") : t("No changes.") });
      if (result.changed.length) {
        status(t("Done"));

        const target = $(
          !$("#customer-overview").hidden && result.changed.includes("savings")
            ? "#customer-overview"
            : "#story",
        );
        target.classList.remove("dashboard-updated");
        requestAnimationFrame(() => target.classList.add("dashboard-updated"));
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      if (revision !== state.chatRevision || snapshot !== JSON.stringify(chatWorkspace())) {
        status(t("The review changed. Send a new request for the current filters."));
        return;
      }
      const text =
        error.name === "TimeoutError"
          ? t("The request timed out. Try again.")
          : error.name === "TypeError"
            ? t("Could not reach the assistant. Try again shortly.")
            : error.message;
      state.chat.push({ user: false, text: text });
    } finally {
      state.asking = false;
      renderChat();
      updateChatToggle();
    }
  }
  $("#toggle-chat").addEventListener("click", () => {
    $("#chat").hidden = !$("#chat").hidden;
    updateChatToggle();
  });
  $("#reset").addEventListener("click", () => {
    Object.assign(state, {
      from: "2025-01",
      to: "2025-12",
      country: "all",
      continent: "all",
      site: "all",
      baseline: "B_LOCAL",
    });
    clearScope();
    render();
    renderChat();
  });
  $("#filters").addEventListener("submit", (event) => event.preventDefault());
  document.addEventListener("change", (event) => {
    if (event.target.id === "metric") {
      state.metric = event.target.value;
      renderAnalysis();
    }
  });
  document.querySelector(".view-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    state.view =
      event.key === "Home"
        ? "summary"
        : event.key === "End"
          ? "analysis"
          : state.view === "summary"
            ? "analysis"
            : "summary";
    render();
    $("#" + state.view + "-tab").focus();
  });
  $("#customer").innerHTML = data.customers
    .map((r) => `<option value="${r.customer_id}">${esc(r.customer_name)}</option>`)
    .join("");
  $("#customer").addEventListener("change", async (event) => {
    const customer = event.target.value;
    $("#customer").value = state.customer;
    if (switchingReview) return;
    switchingReview = true;
    $("main").inert = true;
    $("#composer").inert = true;
    try {
      await flushReviewSave();
      if (!storageBlocked && storageReady) await loadCustomerReview(customer);
    } catch {
      /* The persistent save status explains the error. */
    } finally {
      switchingReview = false;
      $("main").inert = false;
      $("#composer").inert = false;
    }
  });
  for (const id of ["site", "baseline", "priority", "from", "to", "country", "continent"])
    $("#" + id).addEventListener("change", (event) => {
      state[id] = event.target.value;
      if (["country", "continent"].includes(id)) state.site = "all";
      if (id !== "priority") clearScope();
      render();
      renderChat();
      status(t("Review updated."));
    });
  for (const [form, input] of [["ask-form", "question"]])
    $("#" + form).addEventListener("submit", (event) => {
      event.preventDefault();
      const field = $("#" + input);
      if (field.value.trim()) ask(field.value.trim());
      field.value = "";
    });
  document.addEventListener("input", (event) => {
    if (event.target.id === "meeting-note") {
      state.note = event.target.value;
      invalidatePowerPoint();
      scheduleReviewSave();
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.view) {
      state.view = button.dataset.view;
      render();
    }
    if (button.dataset.close) $("#" + button.dataset.close).close();
    if (button.dataset.site) {
      state.site = button.dataset.site;
      state.view = "summary";
      clearScope();
      render();
      status("Review filtered to " + scopeName());
    }
  });
  $("#open-evidence").addEventListener("click", () => {
    $("#evidence-content").innerHTML = evidenceHtml();
    $("#evidence").showModal();
  });
  $("#reset-dashboard").addEventListener("click", () => {
    state.dashboardLayout = globalThis.WorkspaceModel.defaultDashboardLayout();
    state.chatRevision += 1;
    render();
    status("Dashboardin oletusrakenne palautettu.");
  });
  function invalidatePowerPoint(force = false) {
    const ready = state.readyPresentation;
    if (
      !force &&
      ready &&
      ready.request === JSON.stringify(presentationRequest()) &&
      Date.now() < ready.expires
    )
      return;
    state.readyPresentation = null;
    const link = $("#download-powerpoint");
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
    link.title = t("Generate the presentation first");
  }
  function presentationRequest(includeAgenda = true) {
    const scope = Object.fromEntries(
      ["customer", "from", "to", "country", "continent", "site", "baseline", "priority"].map(
        (key) => [key, state[key]],
      ),
    );
    const agenda =
      includeAgenda && includedAgendas.has(state.customer)
        ? customerKpis().filter((kpi) => kpi.priority)
        : [];
    const agendaNote = agenda.length
      ? [
          t("Contract KPIs for discussion"),
          ...agenda.map((kpi) => `• ${kpi.label} · ${kpiDescription(kpi)}`),
        ].join("\n")
      : "";
    return {
      scope,
      included: state.included,
      titleEdits: state.titleEdits,
      note: [state.note, agendaNote].filter(Boolean).join("\n\n"),
      cooperation: state.cooperation,
      savings: state.savings,
      managerTexts: state.managerTexts,
      slideOrder: state.slideOrder,
      language,
    };
  }
  $("#open-review").addEventListener("click", async () => {
    if (state.generating) return;
    const payload = presentationRequest();
    if (payload.note.length > 2000) {
      status(t("Shorten the presentation note or exclude the KPI agenda."));
      return;
    }
    invalidatePowerPoint();
    const viewer = window.open(`/kopperoinenp/presentation.html?lang=${language}`, "_blank");
    if (!viewer) {
      status(t("Allow the presentation to open in a new tab and try again."));
      return;
    }
    viewer.opener = null;
    const request = JSON.stringify(payload);
    const button = $("#open-review");
    state.generating = true;
    button.disabled = true;
    button.textContent = t("Preparing…");
    try {
      if (state.readyPresentation) {
        const available = await fetch(`/api/presentations/${state.readyPresentation.id}`);
        if (available.ok) {
          if (!viewer.closed) viewer.location.replace(state.readyPresentation.viewUrl);
          return;
        }
        invalidatePowerPoint(true);
      }
      const response = await fetch(`/api/presentations?lang=${language}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: request,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t("Could not create the presentation. Try again."));
      if (request !== JSON.stringify(presentationRequest()))
        throw new Error(
          t(
            "The review changed during preparation. Open the presentation again with the current selection.",
          ),
        );
      state.slideOrder = result.slides.map((slide) => slide.id);
      const viewUrl = `/kopperoinenp/presentation.html?id=${encodeURIComponent(result.id)}&lang=${language}`;
      state.readyPresentation = {
        id: result.id,
        viewUrl,
        request: JSON.stringify(presentationRequest()),
        expires: Date.now() + result.expiresInSeconds * 1000,
      };
      const link = $("#download-powerpoint");
      link.href = result.downloadUrl;
      link.setAttribute("aria-disabled", "false");
      link.title = t("Download PowerPoint");
      setTimeout(
        () => {
          if (state.readyPresentation?.id === result.id) invalidatePowerPoint();
        },
        result.expiresInSeconds * 1000 + 100,
      );
      if (!viewer.closed) viewer.location.replace(viewUrl);
    } catch (error) {
      const message = error.message || t("Could not create the presentation. Try again.");
      status(message);
      if (!viewer.closed)
        viewer.location.replace(
          `/kopperoinenp/presentation.html?lang=${language}&error=${encodeURIComponent(message)}`,
        );
    } finally {
      state.generating = false;
      button.innerHTML = 'Open presentation <span aria-hidden="true">↗</span>';
      button.disabled = !context().metrics.hasData || !state.included.length;
    }
  });
  function applyLanguage() {
    updateLanguage();
    updateChatToggle();
    render();
    $("#download-powerpoint").title = t(
      state.readyPresentation ? "Download PowerPoint" : "Generate the presentation first",
    );
  }
  bindLanguageControls(applyLanguage);
  applyLanguage();
  const previousCustomer = localStorage.getItem("lindstrom-review-customer");
  loadCustomerReview(
    data.customers.some((row) => row.customer_id === previousCustomer)
      ? previousCustomer
      : state.customer,
  );
})();
