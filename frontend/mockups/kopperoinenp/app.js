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
    cooperationDescription: "",
    cooperationReason: "",
    savings: null,
    managerTexts: {},
    dashboardLayout: globalThis.WorkspaceModel.defaultDashboardLayout(),
    // Evidence blocks: null means the customer's default areas.
    evidenceAreas: null,
    // Customer basics shown before the figures; null means the full set.
    customerBasics: null,
    // Private notes from the meeting; never shown to the customer.
    meetingNotes: "",
    // Who the account manager is meeting, and usage figures kept out of the customer view.
    audience: "",
    hideUsage: false,
    // Next steps written by the KAM for section 03: {title, owner, due}.
    nextSteps: [],
    areaTitles: {},
    areaNotes: {},
    chat: [],
    contractKpis: [],
    includeContractAgenda: false,
    approvedUpsells: [],
    chatTool: "data",
    lastQuery: null,
    queryResult: null,
    promptsOpen: false,
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
  // home = today's customers, prepare = the manager's view, present = what the customer sees.
  let mode = "home";
  let presentationJob = null;
  let deckTimer;
  let deckRequest = "";
  let deckSlides = [];
  let deckFooter = "";
  let approvedRequest = null;
  let searchIndex = 0;
  let storageMessage;
  const reviewSignature = (workspace) => JSON.stringify({ ...workspace, view: undefined });
  function storageStatus(fi, en) {
    storageMessage = { fi, en };
    $("#review-storage-status").textContent = language === "fi" ? fi : en;
  }
  function scheduleReviewSave() {
    if (storageLoading || !storageReady || storageBlocked) return;
    clearTimeout(saveTimer);
    if (reviewSignature(chatWorkspace()) === savedSignature) return;
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
      const signature = reviewSignature(workspace);
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
    $("#customer-load-status").textContent = "";
    state.chatRevision += 1;
    toggleChatMenu(false);
    $("#workspace").inert = true;
    $("#composer").inert = true;
    storageStatus("Ladataan katsausta…", "Loading review…");
    try {
      const response = await fetch(`/api/reviews/${encodeURIComponent(customer)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const record = await response.json();
      if (!response.ok) throw new Error(record.error || "Load failed");
      if (record.workspace && record.workspace.scope.customer !== customer)
        throw new Error("Review belongs to another customer.");
      const revision = state.chatRevision;
      openAreas.clear();
      $("#data-import-form").reset();
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
          "cooperationDescription",
          "cooperationReason",
          "savings",
          "managerTexts",
          "dashboardLayout",
          "contractKpis",
          "includeContractAgenda",
          "approvedUpsells",
          "audience",
          "hideUsage",
          "meetingNotes",
        ])
          state[key] = record.workspace[key];
        // Evidence blocks, customer basics and next steps, when the backend stores them.
        applyChatAreas(record.workspace);
      }
      savedRevision = record.revision;
      savedSignature = reviewSignature(chatWorkspace());
      storageReady = true;
      storageBlocked = false;
      sessionStorage.setItem("lindstrom-review-customer", customer);
      storageStatus(
        record.workspace
          ? "Tallennettu katsaus ladattu"
          : "Muutokset tallennetaan automaattisesti.",
        record.workspace ? "Saved review loaded" : "Edits are saved automatically.",
      );
      return true;
    } catch {
      storageStatus(
        "Valitun asiakkaan katsausta ei voitu ladata. Kokeile toista asiakasta.",
        "Could not load the selected review. Try another customer.",
      );
      $("#customer-load-status").textContent = $("#review-storage-status").textContent;
      return false;
    } finally {
      storageLoading = false;
      $("#workspace").inert = false;
      $("#composer").inert = false;
      render();
      renderChat();
    }
  }
  window.addEventListener("pagehide", () => {
    flushReviewSave().catch(() => {});
  });
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
  const analysisTools = globalThis.ReviewAnalysisTools;
  const { companies: peers, lindstromIntensity, peerAverage, lowerPct } = analysisTools.benchmark;
  // Evidence blocks: the KAM chooses which areas matter to this customer.
  const areaQuestions = {
    scorecard: "Are we delivering successfully overall?",
    experience: "Are our users and stakeholders satisfied?",
    performance: "Is the service reliable?",
    adoption: "Are we actually using the service effectively?",
    operations: "Is the service making operations better?",
    financial: "Are we getting value for what we spend?",
    sustainability: "What environmental value are we creating together?",
    improvement: "Are the issues we raise actually being solved?",
    future: "What should we work on next?",
  };
  const topicAreas = {
    "Water efficiency": "sustainability",
    "Scope 3 evidence": "sustainability",
    Hygiene: "performance",
    "Service continuity": "performance",
    "Service reliability": "performance",
    Compliance: "performance",
    Safety: "performance",
    "Cost optimization": "financial",
    "Garment utilization": "adoption",
    Traceability: "adoption",
    Repair: "operations",
  };
  // Customer basics the KAM can show or hide, e.g. less for a customer who knows the service.
  const basicsSections = [
    ["scope", "What the service covers"],
    ["year", "The service in numbers"],
    ["siteTypes", "Sites by type"],
    ["countries", "Countries"],
    ["products", "Textiles in the service"],
    ["locations", "List of all locations"],
  ];
  const basicsPresets = [
    ["brief", "Brief", "Customer knows the service", []],
    ["standard", "Standard", "Regular review", ["scope", "year"]],
    ["full", "Full", "First review or new contacts", basicsSections.map(([id]) => id)],
  ];
  const customerBasics = () => state.customerBasics ?? basicsPresets[0][3];
  function applyBasicsSelection() {
    const chosen = customerBasics();
    const overview = $("#customer-overview");
    for (const [id] of basicsSections) {
      const element =
        id === "locations"
          ? overview.querySelector(".customer-locations")
          : overview.querySelector(`[data-basics="${id}"]`);
      if (element) element.hidden = !chosen.includes(id);
    }
    const cards = overview.querySelector(".customer-basics");
    if (cards)
      cards.hidden = !["siteTypes", "countries", "products"].some((id) => chosen.includes(id));
  }
  function basicsPickerHtml() {
    const chosen = customerBasics();
    const same = (ids) => ids.length === chosen.length && ids.every((id) => chosen.includes(id));
    return `<fieldset class="area-picker basics-picker"><legend>${t("Customer basics before the figures")}</legend><div class="basics-presets">${basicsPresets
      .map(
        ([id, label, hint, ids]) =>
          `<button type="button" class="basics-preset" data-basics-preset="${id}" aria-pressed="${same(ids)}"><strong>${t(label)}</strong><span>${t(hint)}</span></button>`,
      )
      .join("")}</div>${basicsSections
      .map(
        ([id, label]) =>
          `<label class="family-summary"><input type="checkbox" data-basics-toggle="${id}" ${chosen.includes(id) ? "checked" : ""} />${t(label)}</label>`,
      )
      .join(
        "",
      )}<p class="quiet">${t("Name, industry, textiles, sites and countries are always shown.")}</p></fieldset>`;
  }
  // Which block actually evidences a customer priority. Unlike topicAreas (default
  // block selection), topics without a direct measure in the data map to nothing.
  const topicEvidence = {
    "Water efficiency": "sustainability",
    "Scope 3 evidence": "sustainability",
    "Service continuity": "performance",
    "Service reliability": "performance",
    "Garment utilization": "adoption",
    Traceability: "adoption",
    Repair: "operations",
    "Cost optimization": "financial",
  };
  const insightAreas = [
    ["water", "sustainability"],
    ["emissions", "sustainability"],
    ["repairs", "operations"],
  ];
  const openAreas = new Set();
  let editedKpi = -1;
  let formCustomer;
  let statusTimer;
  const context = () => storyContext(data, state);
  const baselineName = (id = state.baseline) =>
    ({
      B_LOCAL: t("local outsourced laundry"),
      B_HOME: t("home laundering"),
      B_INHOUSE: t("in-house laundry"),
    })[id];
  const scopeName = () => scopeLabel();
  function periodName() {
    return state.from === "2025-01" && state.to === "2025-12"
      ? "2025"
      : `${state.from} – ${state.to}`;
  }
  function snapshotName() {
    return context().metrics.snapshotMonth || state.to;
  }
  function historicalComparison() {
    return (
      analysisTools.periodComparison(data, state, "yoy") ??
      analysisTools.periodComparison(data, state)
    );
  }
  function comparisonLabel(comparison) {
    const { from, to } = comparison.previousPeriod;
    return (
      t(comparison.kind === "yoy" ? "Same period last year" : "Preceding period") +
      " · " +
      (from === to ? from : from + "–" + to)
    );
  }
  function kpiComparison(comparison, metric) {
    if (!comparison) return "";
    const change = comparison.relativeChangePct[metric];
    const value =
      change == null
        ? t("Previous value: 0")
        : new Intl.NumberFormat(t("en-GB"), {
            maximumFractionDigits: 1,
            signDisplay: "exceptZero",
          }).format(change) + " %";
    return `<small>${esc(t("Historical change") + " · " + value + " · " + comparisonLabel(comparison))}</small>`;
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
    const [baselineResult, driverResult, laundryResult, actionResult] = analysisTools.run(
      data,
      presentationRequest(false).scope,
      ["baselines", "drivers", "laundry", "actions"],
    );
    const period = historicalComparison();
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
        <h2>${t("Period comparison")}</h2>
        ${
          period
            ? table(
                [t("Metric"), t("Previous period"), t("Selected period"), t("Change")],
                [
                  [t("Washed kg"), "washedKg", "kg"],
                  [t("Allocated textiles"), "allocatedPieces", ""],
                  [t("Water"), "waterLitres", "l"],
                  [t("Emissions"), "emissionsKgCo2e", "kg CO₂e"],
                  [t("Repairs"), "repairs", ""],
                  [t("Scan coverage"), "scanPct", "%"],
                ].map(([label, key, unit]) => [
                  label,
                  number(period.before[key], unit),
                  number(period.after[key], unit),
                  number(period.delta[key], key === "scanPct" ? t("percentage points") : unit),
                ]),
              ) +
              `<p class="quiet">${esc(comparisonLabel(period))} · ${esc(t("Stock and scan coverage use period-end snapshots. Both periods cover the same sites and months in scope."))}</p>`
            : `<p>${t("No comparable historical period is available for this selection.")}</p>`
        }
      </section>
      <section class="analysis-card">
        <h2>${t("Laundry baseline scenarios")}</h2>
        ${table(
          [t("Baseline"), t("Water difference"), t("Energy difference"), t("Emissions difference")],
          baselineResult.values.scenarios.map((scenario) => [
            baselineName(scenario.id),
            number(scenario.waterDifferenceLitres, "l"),
            number(scenario.energyDifferenceKwh, "kWh"),
            number(scenario.emissionsDifferenceKgCo2e, "kg CO₂e"),
          ]),
        )}
        <p class="quiet">${t("Each scenario uses the same washed weight. Differences are baseline minus actual.")}</p>
      </section>
      <section class="analysis-card">
        <h2>${t("Largest site contributions to emissions")}</h2>
        ${table(
          [t("Site"), t("Washed kg"), t("Emissions"), t("Share"), t("Emissions / kg washed")],
          driverResult.values.sitesByEmissions.map((site) => [
            site.name,
            number(site.washedKg, "kg"),
            number(site.emissionsKgCo2e, "kg CO₂e"),
            number(site.sharePct, "%"),
            number(site.emissionsKgCo2ePerKg, "kg CO₂e/kg", 3),
          ]),
        )}
        <p class="quiet">${t("Shows up to six sites. Absolute emissions also reflect service volume. Source: Customer_Impacts.")}</p>
      </section>
      <section class="analysis-card">
        <h2>${t("Customer footprint by laundry")}</h2>
        ${
          laundryResult.values
            ? table(
                [t("Laundry ID"), t("Washed kg"), t("Water / kg"), t("Emissions / kg washed")],
                laundryResult.values.byWashedKg.map((laundry) => [
                  laundry.id,
                  number(laundry.washedKg, "kg"),
                  number(laundry.waterLitresPerKg, "l/kg", 2),
                  number(laundry.emissionsKgCo2ePerKg, "kg CO₂e/kg", 3),
                ]),
              )
            : `<p>${t("Unavailable")}</p>`
        }
        <p class="quiet">${t("Customer-allocated figures for up to six laundries, sorted by washed weight. Source: Customer_Impacts.")}</p>
      </section>
      <section class="analysis-card">
        <h2>${t("Questions for the customer review")}</h2>
        <ul>${actionResult.values
          .map(
            (action) =>
              `<li><strong>${esc(action.site)}</strong> · ${esc(action.scanPct == null ? number(action.p90Hours, "h P90") : number(action.scanPct, "%"))}. ${esc(t(action.question))}</li>`,
          )
          .join("")}</ul>
        <p class="quiet">${t("These are questions for discussion. SLA, unique wearers and verified savings require separate evidence.")}</p>
      </section>
      <section class="analysis-card">
        <h2>${t("Textile use by product")}</h2>
        <p class="quiet">${t("Allocation and scan coverage for")} ${esc(detail.snapshotMonth ?? "–")}.
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
            number(product.allocated, t("items"), 0),
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
      repairs: { label: t("Repairs"), unit: t("items"), divisor: 1 },
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
        [t("Repairs"), f(m.repairs) + " " + t("items")],
        [t("Allocated textiles"), f(m.allocated) + " " + t("items")],
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
    $("#customer").value = state.customer;
    invalidatePowerPoint();
    const ctx = context();
    const months = [...new Set(data.records.map((row) => row.month))]
      .filter((month) => month.startsWith(data.year + "-"))
      .sort();
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
    const preparing = mode === "prepare";
    const analyzing = preparing && state.view === "analysis";
    $(".view-tabs").hidden = !preparing;
    $("#summary-panel").hidden = !preparing || analyzing;
    $("#analysis-panel").hidden = !analyzing;
    $("#deck").hidden = !preparing || analyzing;
    document.body.dataset.mode = mode;
    $("#today").hidden = mode !== "home";
    $(".toolbar").hidden = !preparing;
    $("#review-editor").hidden = !preparing;
    $("#workspace").classList.toggle("editing", preparing);
    if (!preparing) toggleChatMenu(false);
    $("#composer").hidden = !preparing;
    renderQueryResult();
    renderDataImport();
    for (const view of ["summary", "analysis"]) {
      const tab = $("#" + view + "-tab");
      tab.setAttribute("aria-selected", String(state.view === view));
      tab.tabIndex = state.view === view ? 0 : -1;
    }
    $("#open-review").disabled = !ctx.metrics.hasData || state.generating || !state.included.length;
    $("#summary-panel").before($("#customer-overview"));
    $("#customer-overview").hidden = !analyzing;
    renderCustomerOverview();
    renderReviewEvidence();
    renderRelationship();
    renderReviewContent();
    renderStory();
    renderUpsells();
    renderDashboardEdits();
    renderDashboardLayout();
    if (state.view === "analysis") renderAnalysis();
    $("#composer").inert = switchingReview || storageLoading || !storageReady;
    if (mode === "home") renderToday();
    scheduleReviewSave();
    scheduleDeck();
  }
  let assessingRelationship = false;
  function renderRelationship() {
    $("#relationship-description").value = state.cooperationDescription;
    $("#relationship-status").value = state.cooperation;
    $("#relationship-result").textContent = state.cooperationReason;
    $("#relationship-status").style.borderLeft =
      `8px solid ${{ green: "#578200", yellow: "#F4C542", red: "#E52330", unrated: "#667580" }[state.cooperation]}`;
    $("#assess-relationship").disabled =
      assessingRelationship || !state.cooperationDescription.trim();
  }
  $("#relationship-description").addEventListener("input", (event) => {
    state.cooperationDescription = event.target.value;
    state.cooperationReason = "";
    $("#relationship-result").textContent = "";
    $("#assess-relationship").disabled = assessingRelationship || !event.target.value.trim();
    scheduleReviewSave();
  });
  $("#relationship-status").addEventListener("change", (event) => {
    state.cooperation = event.target.value;
    state.cooperationReason = "";
    render();
  });
  $("#assess-relationship").addEventListener("click", async () => {
    if (assessingRelationship) return;
    const customer = state.customer,
      description = state.cooperationDescription,
      previous = state.cooperation;
    assessingRelationship = true;
    renderRelationship();
    try {
      const response = await fetch("/api/cooperation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, language }),
        signal: AbortSignal.timeout(95000),
      });
      const result = await response.json();
      if (
        customer !== state.customer ||
        description !== state.cooperationDescription ||
        previous !== state.cooperation
      )
        return;
      if (!response.ok) throw new Error(result.error || t("The assistant request failed."));
      state.cooperation = result.status;
      state.cooperationReason = result.reason;
      render();
    } catch (error) {
      if (
        customer === state.customer &&
        description === state.cooperationDescription &&
        previous === state.cooperation
      )
        $("#relationship-result").textContent = error.message;
    } finally {
      assessingRelationship = false;
      // Preserve an error message until the next edit.
      $("#assess-relationship").disabled = !state.cooperationDescription.trim();
    }
  });
  function renderUpsells() {
    const proposals = globalThis.UpsellModel.proposals(data, state, language);
    const accepted = globalThis.UpsellModel.approved(proposals, state.approvedUpsells);
    const stale = state.approvedUpsells.length - accepted.length;
    $("#upsell-proposals").innerHTML =
      `<span class="section-kicker">${esc(t("NEXT OPPORTUNITIES"))}</span><h2 id="upsell-title">${esc(t("Customer-specific service opportunities"))}</h2><p>${esc(t("Approve proposals for the end of the presentation. Approvals are saved for this customer. Changed source data or filters require a new approval."))}</p><p role="status">${esc(t("Approved for this presentation"))}: ${accepted.length}${stale ? ` · ${esc(t("Saved approvals outside the current evidence"))}: ${stale}` : ""}</p><div class="upsell-grid">${proposals.map((proposal) => `<article class="upsell-card"><h3>${esc(proposal.title)}</h3><p><strong>${esc(t("Observation"))}:</strong> ${esc(proposal.observation)}</p><p><strong>${esc(t("Sites"))}:</strong> ${esc(proposal.siteSummary)}</p><p><strong>${esc(t("Potential benefit"))}:</strong> ${esc(proposal.benefit)}</p><p><strong>${esc(t("Next step"))}:</strong> ${esc(proposal.nextStep)}</p><p class="quiet">${esc(proposal.boundary)}</p><details><summary>${esc(t("Source"))}</summary><p class="quiet">${esc(proposal.source)}</p><p>${esc(proposal.sites)}</p></details><label class="kpi-checkbox"><input type="checkbox" data-upsell-id="${esc(proposal.id)}" aria-label="${esc(t("Include at the end of the presentation"))}: ${esc(proposal.title)}" ${accepted.some((item) => item.id === proposal.id) ? "checked" : ""} ${state.asking || state.generating ? "disabled" : ""}/><span>${esc(t("Include at the end of the presentation"))}</span></label></article>`).join("")}</div>${!proposals.length ? `<p>${esc(t("No service proposals are supported by the selected data."))}</p>` : ""}${state.approvedUpsells.length ? `<button type="button" id="clear-upsell-approvals" class="text-button">${esc(t("Clear all opportunity approvals for this customer"))}</button>` : ""}`;
  }
  $("#upsell-proposals").addEventListener("change", (event) => {
    const id = event.target.dataset.upsellId;
    if (!id || state.asking || state.generating) return;
    const proposal = globalThis.UpsellModel.proposals(data, state, language).find(
      (row) => row.id === id,
    );
    if (!proposal) return;
    state.approvedUpsells = state.approvedUpsells.filter((row) => row.id !== id);
    if (event.target.checked) state.approvedUpsells.push({ id, evidenceKey: proposal.evidenceKey });
    render();
  });
  $("#upsell-proposals").addEventListener("click", (event) => {
    if (event.target.id !== "clear-upsell-approvals" || state.asking || state.generating) return;
    state.approvedUpsells = [];
    render();
  });
  function customerKpis() {
    return state.contractKpis;
  }
  const imports = new Map();
  let activeImport = null;
  function renderDataImport() {
    const entries = imports.get(state.customer) ?? [];
    $("#data-import-submit").disabled = activeImport !== null;
    const status = $("#data-import-status");
    status.textContent =
      activeImport?.customer === state.customer
        ? t("Analyzing files…") + " " + f(activeImport.completed) + " / " + f(activeImport.total)
        : entries.length
          ? f(entries.length) +
            " " +
            t("files processed. See Imported files in the customer review.")
          : "";
    status.hidden = !status.textContent;
    $("#data-import-reports").hidden = !entries.length;
    $("#data-import-result").innerHTML = entries
      .map(
        (entry) =>
          "<details " +
          (entries.length === 1 ? "open" : "") +
          "><summary>" +
          esc(entry.name) +
          (entry.error ? " · " + t("Import failed") : "") +
          "</summary>" +
          importReportHtml(entry) +
          "</details>",
      )
      .join("");
  }
  function importReportHtml(entry) {
    if (entry.error) return "<p>" + esc(t(entry.error)) + "</p>";
    const { report } = entry;
    const descriptions = {
      profile_only: "Local quality report ready.",
      no_eligible_data: "The file contains no eligible data for new tools.",
      no_valid_tools: "The proposed tools did not pass validation.",
      provider_unavailable: "AI is unavailable. The local quality report is ready.",
      invalid_tool_list: "AI returned an invalid tool list. The local quality report is ready.",
      validated: "Analysis ready.",
    };
    const quality = report.quality
      .map((table) => {
        const issues = table.columns.filter((column) => column.missing || column.kind === "mixed");
        return `<li><strong>${esc(table.name)}</strong> · ${f(table.rows)} ${t("rows")} · ${f(table.duplicates)} ${t("duplicate rows")} · ${f(issues.length)} ${t("columns with missing or mixed data")}${issues.length ? `<br /><small>${esc(issues.map(({ column }) => column).join(", "))}</small>` : ""}</li>`;
      })
      .join("");
    const suggestions = report.suggestions
      .map(
        ({ metric, unit, comparison, source, action }) =>
          `<li><strong>${esc(metric)}</strong> · ${f(comparison.before, 2)} → ${f(comparison.after, 2)} ${esc(unit)}<br /><small>${esc(source.table)} · ${esc(comparison.previousPeriods.join(", "))} → ${esc(comparison.periods.join(", "))}</small><br />${esc(t(action))}</li>`,
      )
      .join("");
    const tools = report.tools
      .map(
        ({ definition, result, comparisonStatus }) =>
          `<li>${esc(definition.name)} · ${f(result, 2)} ${esc(definition.unit)}${comparisonStatus === "incomplete_or_sparse_prior_year" ? ` · ${t("Prior-year coverage is incomplete.")}` : ""}</li>`,
      )
      .join("");
    const customerCheck =
      report.customerMatch === "matched"
        ? t("The customer identifier matches the selected customer.")
        : t(
            "The file could not be matched to a customer. Check that it belongs to the selected customer.",
          );
    return `<p>${esc(t(descriptions[report.status]))} ${esc(customerCheck)}</p><h4>${t("Data quality")}</h4><ul>${quality}</ul>${tools ? `<h4>${t("Validated tools")}</h4><ul>${tools}</ul>` : ""}${report.rejected.length ? `<p>${f(report.rejected.length)} ${t("tools rejected by quality checks")}</p>` : ""}${suggestions ? `<h4>${t("Suggested follow-ups")}</h4><ul>${suggestions}</ul>` : ""}`;
  }

  $("#data-import-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (activeImport !== null) return;
    const files = [...$("#data-import-file").files];
    if (!files.length) return;
    if (files.length > 50) {
      status(t("Choose up to 50 files at a time."));
      return;
    }
    const customer = state.customer;
    const shareSchema = $("#data-import-share").checked ? "1" : "0";
    const entries = [];
    imports.set(customer, entries);
    activeImport = { customer, completed: 0, total: files.length };
    event.currentTarget.reset();

    $("#data-import-reports").open = true;
    renderDataImport();
    try {
      for (const file of files) {
        entries.push(await uploadImport(file, customer, shareSchema));
        activeImport.completed += 1;
        renderDataImport();
      }
    } finally {
      activeImport = null;
      renderDataImport();
    }
  });
  async function uploadImport(file, customer, shareSchema) {
    const format = file.name.split(".").at(-1).toLowerCase();
    if (
      !["csv", "xlsx", "json"].includes(format) ||
      file.size === 0 ||
      file.size > 8 * 1024 * 1024
    ) {
      return { name: file.name, error: "Choose a nonempty CSV, XLSX or JSON file up to 8 MiB." };
    }
    const query = new URLSearchParams({ format, shareSchema });
    try {
      const response = await fetch("/api/imports/" + encodeURIComponent(customer) + "?" + query, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        signal: AbortSignal.timeout(125000),
      });
      const report = await response.json();
      if (!response.ok) throw new Error(report.error);
      return { name: file.name, report };
    } catch (error) {
      return { name: file.name, error: error.message || "The file could not be analyzed." };
    }
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
    includeAgenda.checked = agenda.length > 0 && state.includeContractAgenda;

    const difference = f(lowerPct);
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
    state.contractKpis = kpis;
    resetKpiForm();
    render();
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
      render();
      status(t("Contract KPI removed."));
    }
    kpiForm.elements.label.focus();
  });
  $("#include-contract-agenda").addEventListener("change", (event) => {
    state.includeContractAgenda = event.target.checked;
    scheduleReviewSave();
    invalidatePowerPoint();
  });
  // Whole-customer basics for the full data year. Independent of review filters, like the overview.
  function customerBasicsHtml(overview) {
    // Latest data year only, compared with the year before when that year has data.
    const mine = (rows) => (rows ?? []).filter((row) => row.customer === state.customer);
    const inYear = (rows, wanted) => rows.filter((row) => row.month.startsWith(wanted));
    const allRecords = mine(data.records);
    const year =
      allRecords
        .map((row) => row.month.slice(0, 4))
        .sort()
        .at(-1) ?? "";
    const before = String(Number(year) - 1);
    const records = inYear(allRecords, year);
    const detail = inYear(mine(data.detail), year);
    const cycles = inYear(mine(data.cycleGroups), year);
    const sumOf = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
    const cycleCount = (rows) => rows.reduce((total, row) => total + row.hours.length, 0);
    const previous = {
      records: inYear(allRecords, before),
      detail: inYear(mine(data.detail), before),
      cycles: inYear(mine(data.cycleGroups), before),
    };
    // A previous value is shown only when that table has rows for the previous year.
    const earlier = (table, value) => (previous[table].length ? value(previous[table]) : null);
    const volumes = [
      [
        sumOf(records, "washed_pieces"),
        "washes",
        0,
        earlier("records", (rows) => sumOf(rows, "washed_pieces")),
      ],
      [
        sumOf(records, "customer_washed_kg") / 1000,
        "tonnes of textiles washed",
        0,
        earlier("records", (rows) => sumOf(rows, "customer_washed_kg") / 1000),
      ],
      [cycleCount(cycles), "pickup and return cycles", 0, earlier("cycles", cycleCount)],
      [
        sumOf(records, "repair_count"),
        "repairs",
        0,
        earlier("records", (rows) => sumOf(rows, "repair_count")),
      ],
      [
        sumOf(detail, "service_requests"),
        "service requests",
        0,
        earlier("detail", (rows) => sumOf(rows, "service_requests")),
      ],
    ];
    const counts = (values) =>
      [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map())].sort(
        (a, b) => b[1] - a[1],
      );
    const siteTypes = counts(overview.sites.map((site) => site.site_type));
    const countries = overview.countries.map((country) => {
      const sites = overview.sites.filter((site) => site.country === country);
      return {
        country,
        sites: sites.length,
        allocated: sites.every((site) => site.allocated != null)
          ? sites.reduce((total, site) => total + site.allocated, 0)
          : null,
      };
    });
    const snapshot = detail.filter((row) => row.month === overview.snapshotMonth);
    const products = data.products
      .map((product) => ({
        ...product,
        allocated: sumOf(
          snapshot.filter((row) => row.product === product.product_id),
          "allocated_pieces",
        ),
      }))
      .filter((product) => product.allocated > 0)
      .sort((a, b) => b.allocated - a.allocated);
    const perSite =
      overview.allocated != null && overview.sites.length
        ? overview.allocated / overview.sites.length
        : null;
    const row = (label, value) => `<li><span>${label}</span><strong>${value}</strong></li>`;
    return `<section class="customer-year" data-basics="year" aria-labelledby="customer-year-title"><h3 id="customer-year-title">${t("The service in")} ${esc(year)}</h3><div class="customer-year-stats">${volumes
      .map(
        ([number, label, digits, prior]) =>
          `<div><strong>${f(number, digits ?? 0)}</strong><span>${t(label)}</span>${yoyHtml(number, prior, before)}</div>`,
      )
      .join(
        "",
      )}</div></section><div class="customer-basics"><section data-basics="siteTypes"><h3>${t("Sites by type")}</h3><ul class="evidence-list">${siteTypes
      .map(([type, count]) => row(esc(t(type)), f(count)))
      .join(
        "",
      )}</ul><p class="quiet">${perSite == null ? "" : `${t("On average")} ${f(perSite)} ${t("textiles per site")}`}</p></section><section data-basics="countries"><h3>${t("Countries")}</h3><ul class="evidence-list">${countries
      .map((item) =>
        row(
          esc(countryName(item.country)),
          `${f(item.sites)} ${t(item.sites === 1 ? "site" : "sites")} · ${item.allocated == null ? t("Unavailable") : f(item.allocated) + " " + t("textiles")}`,
        ),
      )
      .join(
        "",
      )}</ul></section><section data-basics="products"><h3>${t("Textiles in the service")}</h3><ul class="evidence-list">${products
      .map((product) =>
        row(
          `${esc(t(product.product_name))}<small>${esc(t(product.product_group))}</small>`,
          f(product.allocated),
        ),
      )
      .join(
        "",
      )}</ul><p class="quiet">${t("Allocated textiles in")} ${esc(overview.snapshotMonth ?? "")}</p></section></div>`;
  }
  // Broad customer basics shown before any figures, so the customer knows what the service covers.
  function serviceScopeHtml(overview) {
    const customerRows = (data.detail ?? []).filter((row) => row.customer === state.customer);
    const laundries = new Set(overview.sites.map((site) => site.primary_laundry_id));
    const months = [...new Set(customerRows.map((row) => row.month))].sort();
    const item = (label, value) => `<div><dt>${t(label)}</dt><dd>${value}</dd></div>`;
    return `<section class="service-scope" data-basics="scope" aria-labelledby="service-scope-title"><h3 id="service-scope-title">${t("What the service covers")}</h3><p>${t("Lindström provides workwear as a service: textiles are supplied, picked up, washed, repaired and returned to each site.")}</p><dl>${[
      item("Serving laundries", f(laundries.size)),
      item(
        "Data period",
        months.length ? `${esc(months[0])} – ${esc(months.at(-1))}` : t("Unavailable"),
      ),
    ].join("")}</dl></section>`;
  }
  function industryName(industry) {
    return (
      {
        "Food & Beverage": t("Elintarviketeollisuus"),
        Manufacturing: t("Teollisuus"),
        Healthcare: t("Terveydenhuolto"),
      }[industry] || industry
    );
  }
  function renderCustomerOverview() {
    const overview = globalThis.WorkspaceModel.customerOverview(data, state.customer);
    const industry = industryName(overview.customer.industry);
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
    $("#customer-overview .customer-overview-kpis").insertAdjacentHTML(
      "afterend",
      serviceScopeHtml(overview) + customerBasicsHtml(overview),
    );
    applyBasicsSelection();
    // Customer-facing: no internal customer ID or KAM notes in the overview.
    const heading = $("#customer-overview .customer-overview-heading p");
    if (heading) heading.textContent = heading.textContent.replace(` · ${state.customer}`, "");
    $("#customer-overview > p.quiet")?.remove();
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
    const { scope } = presentationRequest(false);
    const [result] = analysisTools.run(data, scope, ["actions"]);
    const { wash, stock, repair } = globalThis.WorkspaceModel.usageFindings(data, scope);
    const proposals = [];
    if (wash) {
      proposals.push([
        t("Investigate lower wash frequency") + " · " + wash.product,
        `${wash.site}: ${f(wash.rate, 2)} · ${wash.peer}: ${f(wash.peerRate, 2)} ` +
          t("washes per allocated item per month") +
          ` · ${wash.from}–${wash.to} · ` +
          t`Difference repeated in ${wash.lowerMonths} of ${wash.months} matched months.`,
        t(
          "Compare shift patterns, change routines and reserve stock before piloting a change to allocations. Track garment availability during the pilot.",
        ),
      ]);
    }
    if (stock) {
      proposals.push([
        t("Check stock against lower wash volumes") + " · " + stock.site + " · " + stock.product,
        `${stock.before.from}–${stock.before.to} → ${stock.after.from}–${stock.after.to} · ` +
          t("Average washes per month") +
          ` ${f(stock.beforeWashes, 1)} → ${f(stock.afterWashes, 1)} · ` +
          t("Average allocated items") +
          ` ${f(stock.beforeStock, 1)} → ${f(stock.afterStock, 1)}`,
        t(
          "Check whether lower demand is seasonal. Agree on stock levels for quiet and peak months, then track garment availability.",
        ),
      ]);
    }
    if (repair) {
      proposals.push([
        t("Investigate higher repair frequency") + " · " + repair.product,
        `${repair.site}: ${f(repair.rate, 2)} (${f(repair.washes)}) · ${repair.peer}: ${f(repair.peerRate, 2)} (${f(repair.peerWashes)}) · ` +
          t("Repairs per 100 washes (total washes)") +
          ` · ${repair.from}–${repair.to} · ` +
          t`${repair.months} matched months`,
        t(
          "Check whether tasks, garment suitability or repair practices explain the gap. Test one change and compare repairs per 100 washes at the next review.",
        ),
      ]);
    }
    const serviceProposals = (result.values ?? []).map((action) =>
      action.scanPct != null
        ? [
            t("Review textile stock and scanning together") + " · " + action.site,
            t`Scan coverage was ${f(action.scanPct, 1)}% in ${result.snapshotMonth}.`,
            t(
              "Compare local stock and scanning records together before changing allocations. Repeat the coverage check after the next inventory count.",
            ),
          ]
        : [
            t("Investigate the longest service cycles together") + " · " + action.site,
            t`At least 90% of recorded cycles finished within ${f(action.p90Hours, 1)} hours (${f(action.recordedCycles)} records, ${periodName()}).`,
            t(
              "Review handoffs and delays together, agree on one change, and compare cycle times at the next review.",
            ),
          ],
    );
    const allProposals = [...proposals, ...serviceProposals];
    return allProposals.length
      ? allProposals.slice(0, 3)
      : [[t("There is insufficient data for a proposal in this selection.")]];
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
  function defaultAreas() {
    return priorityAreas().map(({ id }) => id);
  }
  // The few areas that matter most: who the manager is meeting, then what the customer cares about.
  function priorityAreas() {
    const audience = globalThis.SalesModel.audiences[state.audience];
    const found = new Map();
    const add = (id, reason) => {
      if (id && !found.has(id) && !(state.hideUsage && id === "adoption")) found.set(id, reason);
    };
    if (audience)
      for (const id of audience.areas) add(id, audience[language === "fi" ? "fi" : "en"]);
    else add("scorecard", t("Overall picture"));
    for (const topic of (context().customer.priority_topics || "").split("|"))
      add(topicAreas[topic], `${t("Customer priority")}: ${t(topic)}`);
    if (!audience) add("future", t("Next steps"));
    return [...found].slice(0, 4).map(([id, reason]) => ({ id, reason }));
  }
  function customerAreas() {
    const areas = state.evidenceAreas ?? defaultAreas();
    return state.hideUsage ? areas.filter((id) => id !== "adoption") : areas;
  }
  function areaOrder(ids) {
    const rank = [...priorityAreas().map(({ id }) => id), ...evidenceAreas.map(([id]) => id)];
    return [...new Set(rank)].filter((id) => ids.has(id));
  }
  const areaFamilies = {
    scorecard: "summary",
    experience: "relationship",
    performance: "service",
    adoption: "service",
    operations: "value",
    financial: "value",
    sustainability: "sustainability",
    improvement: "relationship",
    future: "relationship",
  };
  function sparkline(points, options) {
    const values = points
      .flatMap((point) => [point.value, point.reference])
      .filter((value) => value != null && Number.isFinite(value));
    if (points.length < 2 || !values.length)
      return `<p class="quiet">${t("A trend needs at least two months of data.")}</p>`;
    // Percent charts use a fixed 0–100 style ceiling with a minimum span, so small
    // month-to-month changes are not visually exaggerated. Other charts start at zero.
    const width = 300,
      height = 100;
    let min = Math.min(...values),
      max = Math.max(...values);
    if (options.ceiling != null) {
      max = options.ceiling;
      min = Math.min(min, options.ceiling - options.span);
    } else {
      min = Math.min(0, min);
      max = max || 1;
    }
    const x = (index) => (index * width) / (points.length - 1);
    const y = (value) => 4 + (1 - (value - min) / (max - min)) * (height - 8);
    const line = (key) =>
      points
        .map((point, index) =>
          point[key] == null ? null : `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`,
        )
        .filter(Boolean)
        .join(" ");
    const last = points.at(-1);
    const hasReference = points.some((point) => point.reference != null);
    const label = `${options.label}: ${points.map((point) => `${point.month} ${options.format(point.value)}`).join(", ")}`;
    return `<figure class="evidence-chart"><div class="spark-plot"><span class="spark-axis spark-max">${esc(options.format(max))}</span><span class="spark-axis spark-min">${esc(options.format(min))}</span><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${hasReference ? `<polyline class="spark-reference" points="${line("reference")}" />` : ""}<polyline class="spark-line" points="${line("value")}" /></svg></div><div class="spark-months"><span>${esc(points[0].month)}</span><span>${esc(last.month)}</span></div><figcaption><span><i class="legend-line"></i>${esc(options.label)}</span>${hasReference ? `<span><i class="legend-reference"></i>${esc(options.referenceLabel)}</span>` : ""}</figcaption></figure>`;
  }
  // Same months one year earlier, only when the owner's comparison finds matching
  // site-months. Values are computed with the same model as the current period.
  function previousYear() {
    const comparison = analysisTools.periodComparison(data, state, "yoy");
    if (!comparison) return null;
    const scope = { ...state, ...comparison.previousPeriod };
    const { from, to } = comparison.previousPeriod;
    const fullYear =
      from.endsWith("-01") && to.endsWith("-12") && from.slice(0, 4) === to.slice(0, 4);
    return {
      scope,
      ctx: storyContext(data, scope),
      detail: globalThis.WorkspaceModel.analyzeDetails(data, scope),
      monthly: monthlyEvidence(scope),
      label: fullYear ? from.slice(0, 4) : `${from}–${to}`,
    };
  }
  // Change versus the previous year. "better" says which direction is an improvement;
  // null keeps the wording neutral (e.g. volumes that follow the customer's activity).
  function yoyHtml(current, previous, label, { points = false, better = null, digits = 1 } = {}) {
    if (current == null || previous == null || !label) return "";
    const change = points
      ? current - previous
      : previous
        ? ((current - previous) / previous) * 100
        : null;
    if (change == null) return "";
    const rounded = Number(change.toFixed(digits));
    const tone =
      rounded === 0 || !better
        ? "neutral"
        : rounded > 0 === (better === "higher")
          ? "better"
          : "worse";
    const arrow = rounded > 0 ? "↑" : rounded < 0 ? "↓" : "→";
    const amount = new Intl.NumberFormat(t("en-GB"), {
      maximumFractionDigits: digits,
      signDisplay: "exceptZero",
    }).format(rounded);
    const word = { better: t("improved"), worse: t("weakened"), neutral: "" }[tone];
    return `<small class="yoy yoy-${tone}">${arrow} ${amount} ${points ? t("pp") : "%"} ${t("vs")} ${esc(label)}${word ? ` · ${word}` : ""}</small>`;
  }
  // Financial data is expected as data.financials rows (see docs/FINANCIAL_DATA.md).
  // Field names live here so they can follow the final workbook columns.
  const financialFields = {
    table: "financials",
    invoiced: "invoiced_eur",
    savings: "verified_savings_eur",
  };
  function financialRows(selection) {
    const from = selection.from,
      to = selection.to;
    return (data[financialFields.table] ?? []).filter(
      (row) =>
        row.customer === selection.customer &&
        row.month >= from &&
        row.month <= to &&
        (selection.site === "all" || !row.site || row.site === selection.site) &&
        (selection.country === "all" ||
          !row.site ||
          data.sites.find((site) => site.site_id === row.site)?.country === selection.country),
    );
  }
  function financialEvidence(prev, metrics) {
    const rows = financialRows(state);
    if (!rows.length) return null;
    const sumOf = (list, key) => list.reduce((total, row) => total + (Number(row[key]) || 0), 0);
    const hasSavings = rows.some((row) => row[financialFields.savings] != null);
    const invoiced = sumOf(rows, financialFields.invoiced);
    const savings = hasSavings ? sumOf(rows, financialFields.savings) : null;
    const perKg = metrics.kg ? invoiced / metrics.kg : null;
    const prevRows = prev ? financialRows(prev.scope) : [];
    const prevInvoiced = prevRows.length ? sumOf(prevRows, financialFields.invoiced) : null;
    const prevPerKg =
      prevInvoiced != null && prev.ctx.metrics.kg ? prevInvoiced / prev.ctx.metrics.kg : null;
    // Cost per textile and month: invoiced / sum of monthly allocated textiles.
    const textileMonths = (ctx) => ctx.rows.reduce((total, row) => total + row.allocated_pieces, 0);
    const perTextile = invoiced / (textileMonths(context()) || NaN);
    const prevPerTextile =
      prevInvoiced != null ? prevInvoiced / (textileMonths(prev.ctx) || NaN) : null;
    const months = [...new Set(rows.map((row) => row.month))].sort();
    const series = months.map((month) => ({
      month,
      value: sumOf(
        rows.filter((row) => row.month === month),
        financialFields.invoiced,
      ),
      reference: prevRows.length
        ? sumOf(
            prevRows.filter(
              (row) => row.month === `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`,
            ),
            financialFields.invoiced,
          )
        : null,
    }));
    const euros = (number, digits = 0) => `${f(number, digits)} €`;
    return {
      headline: `${euros(invoiced)} ${t("service cost in the period")}`,
      stats: [
        [
          perKg == null ? t("Unavailable") : euros(perKg, 2),
          t("per washed kg"),
          yoyHtml(perKg, prevPerKg, prev?.label, { better: "lower" }),
        ],
        savings == null
          ? [
              Number.isFinite(perTextile) ? euros(perTextile, 2) : t("Unavailable"),
              t("per textile per month"),
              yoyHtml(
                Number.isFinite(perTextile) ? perTextile : null,
                Number.isFinite(prevPerTextile) ? prevPerTextile : null,
                prev?.label,
                { better: "lower" },
              ),
            ]
          : [euros(savings), t("verified savings")],
      ],
      chart: sparkline(series, {
        label: t("Invoiced, € per month"),
        referenceLabel: prev?.label,
        format: (number) => euros(number),
      }),
      text: t("Synthetic invoicing data. Cost per washed kilogram makes years comparable."),
    };
  }
  function monthlyEvidence(selection = state) {
    const ctx = storyContext(data, selection);
    const months = [...new Set(ctx.rows.map((row) => row.month))].sort();
    const sumOf = (rows, key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
    const inMonth = (rows, month) => rows.filter((row) => row.month === month);
    const cycles = globalThis.WorkspaceModel.select(data, selection, data.cycleGroups ?? []);
    const emissions = globalThis.SummaryCharts.comparisonPoints(ctx, "emissions");
    return {
      performance: months.map((month) => {
        const rows = inMonth(cycles, month);
        const count = rows.reduce((total, row) => total + row.hours.length, 0);
        return { month, value: count ? (1 - sumOf(rows, "late") / count) * 100 : null };
      }),
      adoption: months.map((month) => {
        const rows = inMonth(ctx.rows, month);
        const allocated = sumOf(rows, "allocated_pieces");
        return {
          month,
          value: allocated ? (sumOf(rows, "active_assets_scanned") / allocated) * 100 : null,
        };
      }),
      operations: months.map((month) => ({
        month,
        value: sumOf(inMonth(ctx.rows, month), "repair_count"),
      })),
      sustainability: emissions.map((point) => ({
        month: point.month,
        value: point.actual / 1000,
        reference: point.baseline == null ? null : point.baseline / 1000,
      })),
    };
  }
  function areaEvidence() {
    const { metrics: m, compare: c, sites } = context();
    const detail = globalThis.WorkspaceModel.analyzeDetails(data, state);
    const monthly = monthlyEvidence();
    const { service } = detail;
    const prev = previousYear();
    const pm = prev?.ctx.metrics;
    const pc = prev?.ctx.compare;
    const ps = prev?.detail.service;
    const year = prev?.label;
    const prevOnTime = ps?.latePct == null ? null : 100 - ps.latePct;
    // Previous year's months as a dashed reference line, aligned month by month.
    const withPrevious = (key) =>
      monthly[key].map((point, index) => ({
        ...point,
        reference: prev?.monthly[key][index]?.value ?? null,
      }));
    const perHundred = (metrics) =>
      metrics?.washed ? (metrics.repairs / metrics.washed) * 100 : null;
    const value = (number, unit = "", digits = 1) =>
      number == null ? t("Unavailable") : [f(number, digits), unit].filter(Boolean).join(" ");
    const signed = (difference, percent) =>
      `${difference >= 0 ? "−" : "+"}${f(Math.abs(percent), 0)} %`;
    const list = (rows) =>
      `<ul class="evidence-list">${rows.map(([label, text]) => `<li><span>${esc(label)}</span><strong>${esc(text)}</strong></li>`).join("")}</ul>`;
    const onTime = service.latePct == null ? null : 100 - service.latePct;
    const lateSites = [...detail.serviceBySite]
      .filter((site) => site.latePct != null)
      .sort((a, b) => b.latePct - a.latePct)
      .slice(0, 3);
    const lowSites = sites.filter((site) => site.utilization != null).slice(0, 3);
    const routeNames = {
      reuse_kg: t("Reuse"),
      recycling_kg: t("Recycling"),
      energy_recovery_kg: t("Energy recovery"),
      incineration_kg: t("Incineration"),
    };
    const recovered = detail.wasteRoutes.some((route) => route.share != null)
      ? detail.wasteRoutes
          .filter((route) => ["reuse_kg", "recycling_kg"].includes(route.key))
          .reduce((total, route) => total + (route.share ?? 0), 0) * 100
      : null;
    const lower = c.emissionsDifference >= 0;
    // Customer-facing text stays neutral; the KAM hint is shown only in the review settings.
    const noData = (hint) => ({
      headline: t("To be agreed together"),
      text: t("Measures for this area will be agreed with you and followed in future reviews."),
      hint: t(hint),
      missing: true,
    });
    return {
      experience: noData(
        "No customer experience data yet. Add CSAT, NPS or customer feedback as a contract KPI.",
      ),
      financial:
        financialEvidence(prev, m) ??
        noData(
          "No cost or invoice data yet. Add agreed savings or cost development as a contract KPI.",
        ),
      improvement: noData(
        "No action tracking yet. Add open actions or recurring issues as a contract KPI.",
      ),
      performance: {
        headline:
          onTime == null
            ? t("No recorded service cycles in the selection")
            : `${f(onTime, 1)} % ${t("of service cycles were completed on time")}`,
        stats: [
          [
            value(onTime, "%"),
            t("on time"),
            yoyHtml(onTime, prevOnTime, year, { points: true, better: "higher" }),
          ],
          [
            value(service.medianHours, "h", 0),
            t("typical turnaround"),
            yoyHtml(service.medianHours, ps?.medianHours, year, { better: "lower" }),
          ],
        ],
        chart: sparkline(withPrevious("performance"), {
          referenceLabel: year,
          label: t("On time, % per month"),
          format: (number) => value(number, "%"),
          ceiling: 100,
          span: 10,
        }),
        more:
          list([
            [t("Recorded cycles"), value(service.count, "", 0)],
            [t("90% of cycles within"), value(service.p90Hours, "h", 0)],
            [t("Service requests"), value(service.requests, "", 0)],
            ...lateSites.map((site) => [site.name, value(site.latePct, "% " + t("late"))]),
          ]) +
          `<p class="quiet">${t("Late flags come from the source data. Contract SLA targets are not in the dataset.")}</p>`,
      },
      adoption: {
        headline: `${value(m.utilization, "%")} ${t("of textiles in service were scanned in")} ${snapshotName()}`,
        stats: [
          [
            value(m.utilization, "%"),
            t("scanned"),
            yoyHtml(m.utilization, pm?.utilization, year, { points: true, better: "higher" }),
          ],
          [f(m.allocated), t("textiles in service"), yoyHtml(m.allocated, pm?.allocated, year)],
        ],
        chart: sparkline(withPrevious("adoption"), {
          referenceLabel: year,
          label: t("Scanned, % per month"),
          format: (number) => value(number, "%"),
          ceiling: 100,
          span: 30,
        }),
        more:
          list([
            [t("Textiles without a scan"), f(m.unscanned)],
            ...lowSites.map((site) => [site.site_name, value(site.utilization, "%")]),
          ]) +
          `<p class="quiet">${t("Scan coverage shows where to investigate. It is not proof of unused textiles.")}</p>`,
      },
      operations: {
        headline: `${f(m.repairs)} ${t("repairs kept textiles in use")}`,
        stats: [
          [f(m.repairs), t("repairs"), yoyHtml(m.repairs, pm?.repairs, year)],
          [
            value(perHundred(m), "", 1),
            t("repairs / 100 washes"),
            yoyHtml(perHundred(m), perHundred(pm), year),
          ],
        ],
        chart: sparkline(withPrevious("operations"), {
          referenceLabel: year,
          label: t("Repairs per month"),
          format: (number) => f(number),
        }),
        more:
          list(
            detail.products.map((product) => [
              product.name,
              `${value(product.washesPerPieceMonth)} ${t("washes / item / month")} · ${value(product.repairsPerHundredWashes)} ${t("repairs / 100 washes")}`,
            ]),
          ) +
          `<p class="quiet">${t("Repairs keep textiles in use. Avoided purchases need separate evidence.")} ${t("Energy")}: ${value(detail.energyPerKg, t("kWh / kg washed"), 2)}</p>`,
      },
      sustainability: {
        headline: `${f(Math.abs(c.emissionsPercent), 0)} % ${t(lower ? "lower laundry and delivery emissions than" : "higher laundry and delivery emissions than")} ${baselineName()}`,
        // Absolute amounts first: these are what a sustainability report uses.
        stats: [
          [
            `${f(Math.abs(c.emissionsDifference) / 1000, 0)} t`,
            t(lower ? "less CO₂e" : "more CO₂e"),
            yoyHtml(c.emissionsDifference, pc?.emissionsDifference, year, { better: "higher" }),
          ],
          [
            `${f(Math.abs(c.waterDifference) / 1000, 0)} m³`,
            t(c.waterDifference >= 0 ? "less water" : "more water"),
            yoyHtml(c.waterDifference, pc?.waterDifference, year, { better: "higher" }),
          ],
        ],
        // Own footprint per washed kilogram: comparable across years regardless of volume.
        yoyNote:
          pm?.kg && m.kg
            ? `<p class="quiet">${t("Laundry and delivery CO₂e per washed kg")}: ${f((m.emissions / m.kg) * 1000, 0)} g ${yoyHtml(m.emissions / m.kg, pm.emissions / pm.kg, year, { better: "lower" })}</p>`
            : "",
        text: `${t("Comparison: the same wash volume washed at")} ${baselineName()} (${signed(c.emissionsDifference, c.emissionsPercent)} CO₂e, ${signed(c.waterDifference, c.waterPercent)} ${t("water")}).`,
        extra: `<p class="evidence-benchmark"><strong>${f((1 - lindstromIntensity / peerAverage) * 100)} %</strong> ${t("lower emissions intensity for Lindström Group than the average of four industry peers. Company-level figure, indicative and unverified.")}</p>`,
        chart: sparkline(monthly.sustainability, {
          label: t("Lindström, t CO₂e per month"),
          referenceLabel: baselineName(),
          format: (number) => value(number, "t", 1),
        }),
        more: list([
          [t("Textile waste reused or recycled"), value(recovered, "%", 0)],
          ...detail.wasteRoutes.map((route) => [
            routeNames[route.key],
            value(route.share == null ? null : route.share * 100, "%"),
          ]),
        ]),
      },
      future: {
        headline: t("Your priorities and where they are covered"),
        priorities: (context().customer.priority_topics || "").split("|").filter(Boolean),
        text: t("Agree next steps in section 03 below."),
      },
    };
  }
  // What the manager approves is what the file contains: each chosen area becomes a slide.
  function reviewAreas() {
    if (!context().metrics.hasData) return [];
    const evidence = areaEvidence();
    const monthly = monthlyEvidence();
    const previous = previousYear();
    const kpis = customerKpis();
    const plain = (value) =>
      String(value)
        .replace(/<[^>]*>/g, "")
        .trim();
    return customerAreas()
      .filter((id) => id !== "scorecard")
      .filter((id) => !evidence[id]?.missing || kpis.some((kpi) => kpi.area === id && kpi.actual))
      .map((id) => {
        const block = evidence[id] ?? {};
        const kpi = kpis.find((item) => item.area === id && item.actual);
        const stats = (block.stats ?? []).slice(0, 3).map(([value, label]) => ({
          value: plain(value).slice(0, 40),
          label: plain(label).slice(0, 80),
        }));
        return {
          id,
          title: (state.areaTitles[id] || t(evidenceAreas.find(([area]) => area === id)[1])).slice(
            0,
            160,
          ),
          headline: plain(
            block.missing && kpi ? `${kpi.label}: ${kpi.actual}` : (block.headline ?? ""),
          ).slice(0, 400),
          points: (block.stats ?? [])
            .slice(0, 4)
            .map(([value, label]) => plain(`${value} ${label}`).slice(0, 160)),
          stats:
            block.missing && kpi
              ? [{ value: kpi.actual.slice(0, 40), label: kpi.label.slice(0, 80) }]
              : stats,
          note: (state.areaNotes[id] ?? "").slice(0, 2000),
          chart: areaChart(id, monthly, previous),
        };
      });
  }
  // The same monthly series the review draws, as data the slide and PowerPoint can both use.
  function areaChart(id, monthly, previous) {
    const names = {
      performance: "On time, % per month",
      adoption: "Scanned, % per month",
      operations: "Repairs per month",
      sustainability: "Lindström, t CO₂e per month",
    };
    if (!names[id] || !monthly[id]?.length) return null;
    const round = (value) => (value == null ? null : Math.round(value * 10) / 10);
    const points = monthly[id];
    const baseline = id === "sustainability";
    const reference = baseline
      ? points.map((point) => round(point.reference))
      : previous?.monthly[id]?.map((point) => round(point.value));
    const usable = reference?.length === points.length && reference.some((value) => value != null);
    return {
      type: "line",
      name: t(names[id]),
      labels: points.map((point) => (point.month ?? point.label ?? "").slice(-2)),
      values: points.map((point) => round(point.value)),
      reference: usable ? reference : null,
      referenceName: usable ? (baseline ? baselineName() : previous.label) : null,
    };
  }
  function scheduleDeck() {
    clearTimeout(deckTimer);
    if (mode !== "prepare") return;
    deckTimer = setTimeout(refreshDeck, 150);
  }
  async function refreshDeck() {
    if (!context().metrics.hasData) {
      deckRequest = "";
      $("#deck").innerHTML = `<p class="quiet">${t("No data matches the filters.")}</p>`;
      return;
    }
    const request = JSON.stringify(presentationRequest());
    if (request === deckRequest) return;
    deckRequest = request;
    try {
      const response = await fetch(`/api/presentations/preview?lang=${language}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: request,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (request !== deckRequest) return;
      deckSlides = result.slides;
      deckFooter = result.footer;
      renderDeck();
    } catch (error) {
      if (request === deckRequest) {
        deckRequest = "";
        status(error.message || t("Could not create the presentation. Try again."));
      }
    }
  }
  const fixedSlides = ["cover", "sources", "limits"];
  function slideKind(id) {
    if (id.startsWith("area-")) return "area";
    if (id.startsWith("upsell-")) return "upsell";
    return "main";
  }
  function slideNote(id) {
    return slideKind(id) === "area"
      ? (state.areaNotes[id.slice(5)] ?? "")
      : (state.managerTexts[id] ?? "");
  }
  function renderDeck() {
    const { insightIds } = globalThis.MeetingModel;
    const main = deckSlides.filter((slide) => slideKind(slide.id) === "main").map(({ id }) => id);
    const removable = (id) =>
      slideKind(id) !== "main" || (insightIds.includes(id) && state.included.length > 1);
    const movable = (id) => slideKind(id) === "main" && !fixedSlides.includes(id);
    const hidden = insightIds.filter((id) => !state.included.includes(id));
    const open = new Set(
      [...document.querySelectorAll(".slide-note:not([hidden])")].map(
        (note) => note.dataset.slideNote,
      ),
    );
    $("#deck").innerHTML =
      deckSlides
        .map((slide) => {
          const { id } = slide;
          const position = main.indexOf(id);
          const titled = slideKind(id) !== "upsell";
          const noted = slideKind(id) !== "upsell";
          return `<div class="deck-item" data-slide="${esc(id)}">${globalThis.SlideRender.html(slide, deckFooter, t, { editableTitle: titled })}<div class="deck-actions">${noted ? `<button type="button" data-slide-action="note">${t("Add text")}</button>` : ""}<button type="button" data-slide-action="ask">${t("Ask the assistant")}</button>${movable(id) && movable(main[position - 1] ?? "cover") ? `<button type="button" data-slide-action="up" aria-label="${t("Move up")}">↑</button>` : ""}${movable(id) && movable(main[position + 1] ?? "limits") ? `<button type="button" data-slide-action="down" aria-label="${t("Move down")}">↓</button>` : ""}${removable(id) ? `<button type="button" data-slide-action="remove">${t("Remove slide")}</button>` : ""}</div>${noted ? `<textarea class="slide-note" data-slide-note="${esc(id)}" maxlength="2000" aria-label="${t("Add text")}" ${open.has(id) ? "" : "hidden"}>${esc(slideNote(id))}</textarea>` : ""}</div>`;
        })
        .join("") +
      (hidden.length
        ? `<p class="deck-hidden">${t("Removed slides")}: ${hidden.map((id) => `<button type="button" class="text-button" data-slide-restore="${id}">${t("Restore")} ${esc(t(id))}</button>`).join(" ")}</p>`
        : "");
  }
  function slideChanged() {
    state.chatRevision += 1;
    render();
  }
  function commitTitle(element) {
    const id = element.dataset.slideTitle;
    const title = element.textContent.trim();
    if (!title || title === deckSlides.find((slide) => slide.id === id)?.title) return;
    if (slideKind(id) === "area") state.areaTitles[id.slice(5)] = title.slice(0, 150);
    else state.titleEdits[id] = title.slice(0, 150);
    slideChanged();
  }
  document.addEventListener("focusout", (event) => {
    if (event.target.dataset?.slideTitle) commitTitle(event.target);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target.dataset?.slideTitle) {
      event.preventDefault();
      event.target.blur();
    }
  });
  document.addEventListener("change", (event) => {
    const id = event.target.dataset?.slideNote;
    if (!id) return;
    const text = event.target.value;
    if (slideKind(id) === "area") state.areaNotes[id.slice(5)] = text;
    else state.managerTexts[id] = text;
    slideChanged();
  });
  document.addEventListener("click", (event) => {
    const restore = event.target.closest("[data-slide-restore]");
    if (restore) {
      state.included = [...state.included, restore.dataset.slideRestore];
      slideChanged();
      return;
    }
    const button = event.target.closest("[data-slide-action]");
    if (!button) return;
    const item = button.closest("[data-slide]");
    const id = item.dataset.slide;
    const action = button.dataset.slideAction;
    if (action === "note") {
      const note = item.querySelector(".slide-note");
      note.hidden = !note.hidden;
      if (!note.hidden) note.focus();
    }
    if (action === "ask") {
      const index = deckSlides.findIndex((slide) => slide.id === id);
      openChatTool("dashboard");
      $("#question").value = `${deckSlides[index].title}: `;
      $("#question").focus();
    }
    if (action === "remove") {
      if (slideKind(id) === "area") {
        state.evidenceAreas = customerAreas().filter((area) => area !== id.slice(5));
      } else if (slideKind(id) === "upsell") {
        state.approvedUpsells = state.approvedUpsells.filter((row) => `upsell-${row.id}` !== id);
      } else state.included = state.included.filter((slide) => slide !== id);
      slideChanged();
    }
    if (action === "up" || action === "down") {
      const order = deckSlides
        .filter((slide) => slideKind(slide.id) === "main")
        .map((row) => row.id);
      const at = order.indexOf(id);
      const to = at + (action === "up" ? -1 : 1);
      [order[at], order[to]] = [order[to], order[at]];
      state.slideOrder = order;
      slideChanged();
    }
  });
  function evidenceBlocks() {
    const chosen = customerAreas();
    const evidence = areaEvidence();
    const kpis = customerKpis();
    const name = (id) => t(evidenceAreas.find(([area]) => area === id)[1]);
    const kpiList = (id) => {
      const rows = kpis.filter((kpi) => kpi.area === id);
      return rows.length
        ? `<ul class="evidence-kpis">${rows.map((kpi) => `<li><strong>${esc(kpi.label)}</strong><span>${esc(kpiDescription(kpi))}</span></li>`).join("")}</ul>`
        : "";
    };
    const headlineOf = (id) => {
      const kpi = kpis.find((item) => item.area === id && item.actual);
      if (evidence[id].missing && kpi) return `${kpi.label}: ${kpi.actual}`;
      return evidence[id].headline;
    };
    const summary = () =>
      `<ul class="evidence-messages">${chosen
        .filter((id) => !["scorecard", "future"].includes(id))
        .map(
          (id) =>
            `<li class="family-${areaFamilies[id]}"><span>${name(id)}</span><strong>${esc(headlineOf(id))}</strong>${evidence[id].stats?.[0]?.[2] ?? ""}</li>`,
        )
        .join(
          "",
        )}</ul><p class="evidence-decision"><strong>${t("For discussion today")}</strong> ${t("Agree one improvement, an owner and a follow-up date (section 03).")}</p>`;
    // Each customer priority points to the block that shows evidence for it, or says
    // honestly that a measure still has to be agreed.
    const covered = (area) =>
      area &&
      chosen.includes(area) &&
      (!evidence[area]?.missing || kpis.some((kpi) => kpi.area === area && kpi.actual));
    const priorityMap = (topics) =>
      `<ul class="priority-map">${topics
        .map((topic) => {
          const area = topicEvidence[topic];
          return `<li class="${covered(area) ? "is-covered" : "is-open"}"><span>${esc(t(topic))}</span>${covered(area) ? `<a href="#evidence-${area}">${t("See")}: ${name(area)}</a>` : `<strong>${t("Measure to be agreed together")}</strong>`}</li>`;
        })
        .join("")}</ul>`;
    const blocks = chosen
      .map((id) => {
        const block = evidence[id] ?? {};
        const missing = block.missing && !kpis.some((kpi) => kpi.area === id && kpi.actual);
        const body =
          id === "scorecard"
            ? summary()
            : `<p class="evidence-headline">${esc(headlineOf(id))}</p>${block.stats ? `<div class="evidence-stats">${block.stats.map(([number, label, yoy]) => `<div><strong>${esc(number)}</strong><span>${esc(label)}</span>${yoy ?? ""}</div>`).join("")}</div>` : ""}${block.chart ?? ""}${block.priorities ? priorityMap(block.priorities) : ""}${block.text && (missing || !block.missing) ? `<p class="${block.missing ? "evidence-missing" : "quiet"}">${esc(block.text)}</p>` : ""}${block.yoyNote ?? ""}${block.extra ?? ""}${kpiList(id)}`;
        const more = block.more
          ? `<details class="evidence-more" data-area-more="${id}" ${openAreas.has(id) ? "open" : ""}><summary>${t("Show more")}</summary>${block.more}<div class="evidence-detail-slot" data-detail-slot="${id}"></div></details>`
          : "";
        return `<article class="evidence-block family-${areaFamilies[id]}${missing ? " is-missing" : ""}${id === "scorecard" ? " is-wide" : ""}" data-area="${id}" id="evidence-${id}"><span class="evidence-area">${name(id)}</span><h3>${state.areaTitles[id] ? esc(state.areaTitles[id]) : t(areaQuestions[id])}</h3>${body}${state.areaNotes[id] ? t`<div class="kam-dashboard-note"><strong>KAM:in näkökulma</strong><p>${esc(state.areaNotes[id])}</p></div>` : ""}${more}</article>`;
      })
      .join("");
    return `<div class="evidence-blocks-wrap"><div class="evidence-blocks">${blocks}</div><p class="quiet">${t("All figures are based on synthetic demo data.")}</p></div>`;
  }
  // Section 03 shows only next steps the KAM has written; suggestions stay in Explore data.
  const stepLimits = { title: 160, owner: 80, due: 40 };
  const agreedSteps = () => state.nextSteps.filter((step) => step.title.trim());
  function stepText(step) {
    return [
      step.title.trim(),
      step.owner.trim() && `${t("Owner")}: ${step.owner.trim()}`,
      step.due.trim() && `${t("Timeline")}: ${step.due.trim()}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  // The review opening is shown to the customer: no "preparation" label or KAM agenda,
  // and the comparison point is explained in plain words.
  function renderIntroForCustomer() {
    const intro = $("#story .intro");
    if (!intro) return;
    const kicker = intro.querySelector(".section-kicker");
    if (kicker) kicker.textContent = `${t("ANNUAL REVIEW")} ${periodName()}`;
    const opening = intro.querySelector(":scope > p");
    if (opening)
      opening.textContent = t(
        "How the service performed, the value we created together, and what we propose to work on next.",
      );
    const scope = intro.querySelector(".scope");
    const { metrics: m } = context();
    if (scope)
      scope.innerHTML = `<strong>${esc(scopeName())}</strong> · ${f(m.sites)} ${t(m.sites === 1 ? "site" : "sites")} · ${t("Compared with")} ${esc(baselineName())} ${t("at the same wash volume")}`;
  }
  // Section 02 is shown to the customer: neutral wording, no KAM instructions or
  // filter links (site filtering lives in More settings).
  function renderOpportunityForCustomer() {
    const section = $("#opportunity-title")?.closest("section");
    const { focus } = context();
    if (!section || !focus) return;
    const finding = section.querySelector(".opportunity > div:first-child > p");
    if (finding)
      finding.textContent = `${f(focus.unscanned)} ${t("textiles allocated to this site had no active scan in")} ${snapshotName()}.`;
    const relevance = section.querySelector(":scope > p.relevance");
    if (relevance)
      relevance.textContent = t(
        "This site has the lowest scan coverage in the selection, so it is a natural place to start a joint review.",
      );
    for (const link of section.querySelectorAll(".site-details .site-link"))
      link.replaceWith(document.createTextNode(link.textContent));
    section.querySelector(".site-details > p.quiet")?.remove();
  }
  function renderNextSteps() {
    const section = $("#next-title")?.closest("section");
    if (!section) return;
    const steps = agreedSteps();
    const list = section.querySelector(".next-steps");
    list.innerHTML = steps
      .map((step) => {
        const meta = [
          step.owner.trim() && `${t("Owner")}: ${step.owner.trim()}`,
          step.due.trim() && `${t("Timeline")}: ${step.due.trim()}`,
        ]
          .filter(Boolean)
          .join(" · ");
        return `<li>${esc(step.title.trim())}${meta ? `<small>${esc(meta)}</small>` : ""}</li>`;
      })
      .join("");
    list.hidden = !steps.length;
    const intro = section.querySelector(".next-chapter > div > p");
    if (intro)
      intro.textContent = steps.length
        ? t("Next steps agreed for the coming period, each with an owner and a timeline.")
        : t("Next steps will be agreed together in this meeting.");
  }
  function nextStepsEditorHtml() {
    const suggestions = plan().filter((item) => item.length > 1);
    const preview = suggestions
      .map(
        ([title, ...details]) =>
          `<p><strong>${esc(title)}</strong><br />${esc(details.join(" "))}</p>`,
      )
      .join("");
    const rows = state.nextSteps
      .map(
        (step, index) =>
          `<li><label>${t("Action")}<input data-step="${index}" data-step-field="title" maxlength="${stepLimits.title}" value="${esc(step.title)}" /></label><label>${t("Owner")}<input data-step="${index}" data-step-field="owner" maxlength="${stepLimits.owner}" value="${esc(step.owner)}" /></label><label>${t("Timeline")}<input data-step="${index}" data-step-field="due" maxlength="${stepLimits.due}" value="${esc(step.due)}" placeholder="${t("E.g. Q2 2026")}" /></label><button type="button" class="text-button" data-step-remove="${index}">${t("Remove")}</button></li>`,
      )
      .join("");
    return `<fieldset class="area-picker next-steps-editor"><legend>${t("Agreed next steps")}</legend><p class="quiet">${t("Only the steps written here are shown to the customer. Keep to one to three.")}</p><ol>${rows}</ol>${preview ? `<details><summary>${t("Data-based suggestions")}</summary>${preview}</details>` : ""}<div class="kpi-actions">${state.nextSteps.length < 5 ? `<button type="button" class="secondary" data-step-add>${t("Add step")}</button>` : ""}${state.nextSteps.length || !suggestions.length ? "" : `<button type="button" class="text-button" data-step-suggest>${t("Start from suggestions")}</button>`}</div></fieldset>`;
  }
  // KAM controls for the customer-facing review live in the review settings panel.
  const openPanels = new Set();
  const panelOpen = (id) => (openPanels.has(id) ? "open" : "");
  document.addEventListener(
    "toggle",
    (event) => {
      const id = event.target.dataset?.panel;
      if (!id) return;
      if (event.target.open) openPanels.add(id);
      else openPanels.delete(id);
    },
    true,
  );
  const reads = { show: "Show", keep: "Keep internal", decide: "Your call" };
  // A manager may search in Finnish or English, whatever the page language is.
  const industryKeywords = {
    "Food & Beverage": "Elintarviketeollisuus ruoka",
    Manufacturing: "Teollisuus",
    Healthcare: "Terveydenhuolto",
  };
  function renderToday() {
    const query = $("#customer-search").value;
    const rows = data.customers.map((customer) => ({
      id: customer.customer_id,
      name: customer.customer_name,
      industry: industryName(customer.industry),
      keywords: `${customer.industry} ${industryKeywords[customer.industry] ?? ""}`,
    }));
    const found = globalThis.SalesModel.matchCustomers(rows, query, rows.length);
    searchIndex = Math.min(searchIndex, Math.max(found.length - 1, 0));
    $("#today-label").textContent = query.trim()
      ? found.length
        ? ""
        : t("No customers found")
      : t("Customers");
    $("#today-list").innerHTML = found
      .map(
        ({ id, name, industry }, index) =>
          `<button type="button" id="customer-option-${index}" class="customer-option" role="option" aria-selected="${index === searchIndex}" data-open-customer="${esc(id)}"><strong>${esc(name)}</strong><small>${esc(industry)}</small></button>`,
      )
      .join("");
    $("#customer-search").setAttribute(
      "aria-activedescendant",
      found.length ? `customer-option-${searchIndex}` : "",
    );
  }
  $("#customer-search").addEventListener("input", () => {
    searchIndex = 0;
    renderToday();
  });
  $("#customer-search").addEventListener("keydown", (event) => {
    const options = [...document.querySelectorAll(".customer-option")];
    if (event.key === "Enter") {
      event.preventDefault();
      options.at(searchIndex)?.click();
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key) || !options.length) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    searchIndex = (searchIndex + step + options.length) % options.length;
    renderToday();
  });
  function setMode(next) {
    mode = next;
    render();
    renderChat();
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-open-customer]");
    if (!card) return;
    const customer = card.dataset.openCustomer;
    void openCustomer(customer);
  });
  function renderMeetingAdvice() {
    const sales = globalThis.SalesModel;
    const { metrics } = context();
    const advice = sales.audienceAdvice(state.audience, metrics, language);
    const signals = metrics.hasData ? sales.salesSignals(data, selectionScope(), language) : null;
    const roles = Object.entries(sales.audiences)
      .map(
        ([id, audience]) =>
          `<option value="${id}" ${state.audience === id ? "selected" : ""}>${esc(audience[language === "fi" ? "fi" : "en"])}</option>`,
      )
      .join("");
    const questions = sales
      .conversation(state.audience, signals, language)
      .map(({ ask, why }) => `<li><strong>${esc(ask)}</strong><small>${esc(why)}</small></li>`)
      .join("");
    $("#meeting-advice").innerHTML =
      `<fieldset class="area-picker meeting-advice"><legend>${t("Who are you meeting?")}</legend><select id="audience" aria-label="${t("Who are you meeting?")}"><option value="">${t("Choose a role")}</option>${roles}</select>${advice ? `<p>${esc(advice.points[0])}</p>` : ""}${state.audience ? `<h3>${t("Ask in the meeting")}</h3><ol>${questions}</ol>` : ""}</fieldset>`;
    const rows = (signals?.signals ?? [])
      .map((signal) => `<div><dt>${esc(signal.label)}</dt><dd>${esc(signal.value)}</dd></div>`)
      .join("");
    $("#sales-signals").innerHTML = signals
      ? `<details class="sales-signals" data-panel="sales" ${panelOpen("sales")}><summary><span>${t("For you only")}</span><em class="sales-read read-${signals.usage.read}">${t(reads[signals.usage.read])}</em></summary><div class="sales-usage"><div><span>${t("Textiles in active use")}</span><strong>${esc(signals.usage.value)}</strong><small>${esc(signals.usage.trend)} · ${esc(signals.usage.period)}</small></div></div><p>${esc(signals.usage.advice)}</p><button type="button" class="secondary" data-usage-toggle>${t(state.hideUsage ? "Show usage to the customer" : "Hide usage from the customer")}</button><p class="quiet">${t(state.hideUsage ? "Usage figures are hidden from the review and presentation." : "Usage figures are visible to the customer.")}</p><dl>${rows}</dl><p class="quiet">${t("This is the share of textiles scanned, the closest figure to capacity use in the data. The thresholds are demo assumptions to agree with Lindström.")}</p></details>`
      : "";
  }
  function selectionScope() {
    const { customer, from, to, country, continent, site } = state;
    return { customer, from, to, country, continent, site };
  }
  document.addEventListener("change", (event) => {
    if (event.target.id !== "audience") return;
    state.audience = event.target.value;
    state.evidenceAreas = null;
    state.priority = globalThis.SalesModel.audiences[state.audience]?.priority ?? "neutral";
    state.chatRevision += 1;
    render();
    $("#audience")?.focus();
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-usage-toggle]")) {
      state.hideUsage = !state.hideUsage;
      if (!state.hideUsage) {
        state.evidenceAreas = areaOrder(new Set([...customerAreas(), "adoption"]));
        if (!state.visibleInsights.includes("opportunity"))
          state.visibleInsights.push("opportunity");
      }
      invalidatePowerPoint(true);
      state.chatRevision += 1;
      render();
      $("[data-usage-toggle]")?.focus();
    }
  });
  function renderReviewContent() {
    renderMeetingAdvice();
    const meetingNotes = $("#kam-notes");
    if (meetingNotes !== document.activeElement) meetingNotes.value = state.meetingNotes;
    const editor = $("#review-next-steps");
    if (
      !editor.contains(document.activeElement) ||
      editor.querySelectorAll("li").length !== state.nextSteps.length
    )
      editor.innerHTML = nextStepsEditorHtml();
    $("#review-basics-picker").innerHTML = basicsPickerHtml();
    const chosen = customerAreas();
    const priorities = priorityAreas();
    const areaRow = (id, reason) =>
      `<label><input type="checkbox" data-area-toggle="${id}" ${chosen.includes(id) ? "checked" : ""} /><span>${t(evidenceAreas.find(([area]) => area === id)[1])}${reason ? `<small>${esc(reason)}</small>` : ""}</span></label>`;
    const others = evidenceAreas.filter(([id]) => !priorities.some((row) => row.id === id));
    $("#review-area-picker").innerHTML =
      `<fieldset class="area-picker simple-areas"><legend>${t("What to show this customer")}</legend>${priorities
        .map(({ id, reason }) => areaRow(id, reason))
        .join(
          "",
        )}<details data-panel="other-areas" ${panelOpen("other-areas")}><summary>${t("Other areas")}</summary>${others
        .map(([id]) => areaRow(id))
        .join(
          "",
        )}</details><button type="button" class="text-button" data-area-reset>${t("Use suggested areas")}</button></fieldset>`;
    const evidence = context().metrics.hasData ? areaEvidence() : {};
    const kpis = customerKpis();
    const gaps = chosen.filter(
      (id) => evidence[id]?.missing && !kpis.some((kpi) => kpi.area === id && kpi.actual),
    );
    $("#review-area-gaps").innerHTML = gaps.length
      ? `<div class="area-gaps"><strong>${t("Needs a figure before it can appear:")}</strong><ul>${gaps
          .map(
            (id) =>
              `<li><span>${t(evidenceAreas.find(([area]) => area === id)[1])}</span> ${esc(evidence[id].hint)}</li>`,
          )
          .join("")}</ul></div>`
      : "";
    const note = $("#meeting-note");
    if (document.activeElement !== note) note.value = state.note;
  }
  function renderStory() {
    const { metrics: m, focus, sites, order, customer } = context();
    if (!m.hasData) {
      $("#story").innerHTML =
        t`<section class="intro"><h1>No data matches the filters.</h1><p>${context().invalidPeriod ? t("The start month is after the end month.") : t("Choose another date range or location in More settings.")}</p></section>`;
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
    const history = historicalComparison();
    const comparable = { water: "waterLitres", emissions: "emissionsKgCo2e", repairs: "repairs" };
    const visibleOrder = order.filter(
      (id) => state.visibleInsights.includes(id) && !(state.hideUsage && id === "opportunity"),
    );
    const title =
      state.heading || state.titleEdits.cover
        ? esc(state.heading || state.titleEdits.cover)
        : t`${esc(displayName)} · ${periodName()}<br />What did we achieve?`;

    $("#story").innerHTML =
      t`<section class="intro"><span class="section-kicker">ANNUAL REVIEW PREPARATION</span><h1>${title}</h1><p>${opening()}</p><div class="scope"><strong>${esc(scopeName())}</strong> · ${m.sites} ${t(m.sites === 1 ? "site" : "sites")} · Baseline: ${baselineName()}</div></section><section class="story-section" aria-labelledby="results-title"${visibleOrder.length ? "" : " hidden"}><div class="section-heading"><span class="section-number">01</span><h2 id="results-title">Key results for the period</h2></div><div class="results">${visibleOrder
        .map((key) => {
          const card = cards[key];
          return t`<article class="result" data-insight="${key}"><div class="result-name">${card.name}</div><div class="result-value">${card.value}</div><span class="result-unit">${card.unit}</span>${card.visual}<h3>${card.title}</h3><p>${card.text}</p><div class="relevance"><strong>Why this matters</strong><p>${esc(globalThis.MeetingModel.relevance(key, state.priority, false, language))}</p></div><small>${card.boundary}</small>${kpiComparison(history, comparable[key])}</article>`;
        })
        .join(
          "",
        )}</div><p class="quiet">Synthetic data. The baseline models an alternative laundry service at the same wash volume.</p>${summaryGraphics()}</section><section class="story-section" aria-labelledby="opportunity-title"${state.visibleInsights.includes("opportunity") ? "" : " hidden"}><div class="section-heading"><span class="section-number">02</span><h2 id="opportunity-title">A good place to start together</h2></div><div class="opportunity"><div><span class="section-kicker">${esc(focus.site_name)}</span><h3>Do textile allocations match demand?</h3><p>${f(focus.unscanned)} allocated textiles had no active scan in ${snapshotName()}. Start by reviewing this site with the customer.</p></div><div class="opportunity-visual">${snapshotGraphic(focus)}</div></div><p class="relevance">${esc(globalThis.MeetingModel.relevance("opportunity", state.priority, false, language))}</p>${siteBenchmark()}<details class="site-details"><summary>See other sites</summary><div class="table-wrap"><table><thead><tr><th>Site</th><th>Scanned ${snapshotName()}</th><th>Allocated textiles</th></tr></thead><tbody>${sites.map((site) => t`<tr><td><button class="site-link" data-site="${site.site_id}">${esc(site.site_name)}</button></td><td>${f(site.utilization, 1)} %</td><td>${f(site.allocated)}</td></tr>`).join("")}</tbody></table></div><p class="quiet">Open a site to see its review. Ask the assistant to “show all sites” to return to the full review.</p></details></section><section class="story-section" aria-labelledby="next-title"><div class="section-heading"><span class="section-number">03</span><h2 id="next-title">Next year's priorities</h2></div><div class="next-chapter"><div><h3>One improvement<br />at a time</h3><p>Use these proposals to start a discussion and agree on next steps with the customer.</p></div><ol class="next-steps">${plan()
        .map(
          ([title, ...details]) =>
            `<li>${esc(title)}${details.map((detail) => `<small>${esc(detail)}</small>`).join("")}</li>`,
        )
        .join(
          "",
        )}</ol></div><details class="notes-details" ${state.note ? "open" : ""}><summary>Add a note to the presentation</summary><label for="meeting-note" class="sr-only">Meeting note</label><textarea id="meeting-note" maxlength="2000" placeholder="E.g. a customer goal or an agreed next step…">${esc(state.note)}</textarea><p class="quiet">The note stays in this tab until you change the customer, site or baseline.</p></details></section>`;
    // The note editor is in More settings; the review shows the note in its opening.
    $("#story .notes-details")?.remove();
    renderNextSteps();
    renderOpportunityForCustomer();
    if (state.hideUsage) $("#opportunity-title")?.closest("section")?.remove();
    renderIntroForCustomer();
    const resultsSection = $("#results-title").closest("section");
    resultsSection.hidden = false;
    resultsSection
      .querySelector(".section-heading")
      .insertAdjacentHTML("afterend", evidenceBlocks());
    // The original result cards and charts move into the matching block's "Show more".
    // They keep their data-insight ids so chat edits and KAM notes still land on them.
    const slot = (area) => resultsSection.querySelector(`[data-detail-slot="${area}"]`);
    for (const [insight, area] of insightAreas) {
      const card = resultsSection.querySelector(`.results [data-insight="${insight}"]`);
      if (!card) continue;
      if (slot(area)) slot(area).append(card);
      else card.hidden = true;
    }
    const graphics = resultsSection.querySelector(".summary-graphics");
    if (graphics) {
      const target = slot("sustainability") || slot("operations");
      graphics.dataset.inBlock = "true";
      graphics.hidden = !target || !state.dashboardLayout.sections.includes("charts");
      if (target) target.append(graphics);
    }
    const note = resultsSection.querySelector(".results + p.quiet");
    if (note && slot("sustainability")) slot("sustainability").append(note);
    else note?.remove();
    resultsSection.querySelector(".results")?.remove();
  }
  // Open the block a chat edit applies to, so the change is visible straight away.
  function revealChatEdits(before) {
    const edited = new Set();
    for (const key of ["areaTitles", "areaNotes"])
      for (const [id, text] of Object.entries(state[key]))
        if (before[key][id] !== text) edited.add(id);
    for (const [insight, area] of insightAreas) {
      if (
        (state.titleEdits[insight] && state.titleEdits[insight] !== before.titleEdits[insight]) ||
        (state.managerTexts[insight] &&
          state.managerTexts[insight] !== before.managerTexts[insight])
      )
        edited.add(area);
    }
    for (const area of edited) openAreas.add(area);
    const chosen = customerAreas();
    if ([...edited].some((area) => !chosen.includes(area)))
      state.evidenceAreas = areaOrder(new Set([...chosen, ...edited]));
  }
  // Accept the optional chat fields only when they are valid; otherwise keep the current state.
  function applyChatAreas(next) {
    const known = evidenceAreas.map(([id]) => id);
    if (
      Array.isArray(next.nextSteps) &&
      next.nextSteps.length <= 5 &&
      next.nextSteps.every(
        (step) =>
          step &&
          Object.entries(stepLimits).every(
            ([field, limit]) => typeof step[field] === "string" && step[field].length <= limit,
          ),
      )
    )
      state.nextSteps = next.nextSteps.map(({ title, owner, due }) => ({ title, owner, due }));
    const basics = basicsSections.map(([id]) => id);
    if (
      Array.isArray(next.customerBasics) &&
      new Set(next.customerBasics).size === next.customerBasics.length &&
      next.customerBasics.every((id) => basics.includes(id))
    )
      state.customerBasics = basics.filter((id) => next.customerBasics.includes(id));
    if (
      Array.isArray(next.evidenceAreas) &&
      next.evidenceAreas.length &&
      next.evidenceAreas.every((id) => known.includes(id))
    )
      state.evidenceAreas = areaOrder(new Set(next.evidenceAreas));
    for (const key of ["areaTitles", "areaNotes"]) {
      const value = next[key];
      if (
        value &&
        typeof value === "object" &&
        Object.entries(value).every(
          ([id, text]) => known.includes(id) && typeof text === "string" && text.length <= 2000,
        )
      )
        state[key] = { ...value };
    }
  }
  document.addEventListener("change", (event) => {
    const id = event.target.dataset?.basicsToggle;
    if (!id) return;
    const chosen = new Set(customerBasics());
    if (event.target.checked) chosen.add(id);
    else chosen.delete(id);
    state.customerBasics = basicsSections.map(([key]) => key).filter((key) => chosen.has(key));
    state.chatRevision += 1;
    render();
    $(`[data-basics-toggle="${id}"]`)?.focus();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-basics-preset]");
    if (!button) return;
    state.customerBasics = [...basicsPresets.find(([id]) => id === button.dataset.basicsPreset)[3]];
    state.chatRevision += 1;
    render();
    $(`[data-basics-preset="${button.dataset.basicsPreset}"]`)?.focus();
  });
  document.addEventListener("input", (event) => {
    const field = event.target.dataset?.stepField;
    if (!field) return;
    state.nextSteps[Number(event.target.dataset.step)][field] = event.target.value.slice(
      0,
      stepLimits[field],
    );
    invalidatePowerPoint();
    scheduleReviewSave();
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset?.stepField) render();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step-add], [data-step-remove], [data-step-suggest]");
    if (!button) return;
    if (button.dataset.stepRemove !== undefined)
      state.nextSteps.splice(Number(button.dataset.stepRemove), 1);
    else if (button.dataset.stepSuggest !== undefined)
      state.nextSteps = plan()
        .filter((item) => item.length > 1)
        .map(([title]) => ({ title: title.slice(0, stepLimits.title), owner: "", due: "" }));
    else state.nextSteps.push({ title: "", owner: "", due: "" });
    state.chatRevision += 1;
    render();
    const inputs = $("#review-next-steps").querySelectorAll('[data-step-field="title"]');
    (button.dataset.stepAdd !== undefined ? inputs[inputs.length - 1] : inputs[0])?.focus();
  });
  // Show the finished note in the review once the KAM leaves the field.
  document.addEventListener("change", (event) => {
    if (event.target.id === "meeting-note") render();
  });
  document.addEventListener("change", (event) => {
    const area = event.target.dataset?.areaToggle;
    if (!area) return;
    const chosen = new Set(customerAreas());
    if (event.target.checked) chosen.add(area);
    else chosen.delete(area);
    if (area === "adoption" && event.target.checked) state.hideUsage = false;
    state.evidenceAreas = areaOrder(chosen);
    state.chatRevision += 1;
    render();
    $(`[data-area-toggle="${area}"]`)?.focus();
  });
  document.addEventListener(
    "toggle",
    (event) => {
      const area = event.target.dataset?.areaMore;
      if (!area) return;
      if (event.target.open) openAreas.add(area);
      else openAreas.delete(area);
    },
    true,
  );
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-area-reset]")) return;
    state.evidenceAreas = null;
    state.chatRevision += 1;
    render();
  });
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
    const history = historicalComparison();
    const comparable = {
      allocated: "allocatedPieces",
      sites: "sites",
      scanned: "scannedPieces",
      unscanned: "unscannedPieces",
      washed: "washEvents",
      water: "waterLitres",
      emissions: "emissionsKgCo2e",
      repairs: "repairs",
    };
    metrics.innerHTML = t`<h2>Valitsemasi tiedot</h2><div class="dashboard-metric-grid">${state.dashboardLayout.metrics
      .filter((id) => !state.hideUsage || !["scanned", "unscanned"].includes(id))
      .map((id) => {
        const [label, value, scope] = definitions[id];
        return `<article><span>${label}</span><strong>${value}</strong><small>${esc(scope)}</small>${kpiComparison(history, comparable[id])}</article>`;
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
      charts: $("#story .summary-graphics:not([data-in-block])"),
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
  function queryChart(result) {
    const peak = Math.max(...result.rows.map((row) => row.value ?? 0), 0);
    const size = (row) => (peak > 0 && row.value !== null ? (row.value / peak) * 100 : 0);
    if (result.kind === "facts")
      return `<dl class="query-facts">${result.rows
        .map(
          (row) =>
            `<div><dt>${esc(row.label)}</dt><dd>${esc(row.display)}</dd>${row.note ? `<small>${esc(row.note)}</small>` : ""}</div>`,
        )
        .join("")}</dl>`;
    return result.kind === "single"
      ? `<p class="query-single">${esc(result.rows[0].display)}</p>`
      : result.kind === "columns"
        ? `<div class="query-columns ${result.rows.length > 6 ? "dense" : ""}" role="img" aria-label="${esc(result.title)}">${result.rows
            .map(
              (row) =>
                `<div class="${row.accent ? "accent" : ""}"><strong>${esc(row.display)}</strong><span><i style="height:${size(row)}%"></i></span><small>${esc(row.label)}</small></div>`,
            )
            .join("")}</div>`
        : `<div class="query-bars" role="img" aria-label="${esc(result.title)}">${result.rows
            .map(
              (row) =>
                `<div class="${row.accent ? "accent" : ""}"><span>${esc(row.label)}</span><div><i style="width:${size(row)}%"></i></div><strong>${esc(row.display)}</strong></div>`,
            )
            .join("")}</div>`;
  }
  function chatResult(result) {
    return `<div class="chat-result"><strong>${esc(result.title)}</strong><small>${esc(result.subtitle)}</small>${queryChart(result)}${result.more ? `<small>${esc(result.more)}</small>` : ""}<em>${esc(result.status)} ${esc(t("Source"))}: ${esc(result.source)}</em></div>`;
  }
  function renderQueryResult() {
    const box = $("#query-result");
    const result = state.queryResult;
    const visible = Boolean(result) && result.language === language && state.view === "summary";
    box.hidden = !visible;
    if (!visible) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `<header><div><span class="section-kicker">${esc(t("Assistant search"))}</span><h2>${esc(result.title)}</h2><p>${esc(result.subtitle)}</p></div><button type="button" id="query-close" aria-label="${esc(t("Close result"))}">×</button></header><div class="query-body"><div class="query-chart">${queryChart(result)}${result.more ? `<p class="quiet">${esc(result.more)}</p>` : ""}</div>${result.highlights.length ? `<div class="query-highlights">${result.highlights.map((item) => `<article><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><small>${esc(item.name)}</small></article>`).join("")}</div>` : ""}</div><footer><em>${esc(result.status)}</em><span>${esc(t("Source"))}: ${esc(result.source)}</span></footer>`;
  }
  function clearScope() {
    // KAM material belongs to the customer; browsing filters must not delete it.
    state.queryResult = null;
    state.lastQuery = null;
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
      contractKpis: state.contractKpis,
      cooperationDescription: state.cooperationDescription,
      cooperationReason: state.cooperationReason,
      includeContractAgenda: state.includeContractAgenda,
      audience: state.audience,
      meetingNotes: state.meetingNotes,
      evidenceAreas: customerAreas(),
      customerBasics: customerBasics(),
      nextSteps: state.nextSteps,
      areaTitles: state.areaTitles,
      areaNotes: state.areaNotes,
    };
  }
  function renderChat() {
    $("#chat").innerHTML =
      state.chat
        .map(
          (msg) =>
            `<div class="message ${msg.user ? "user" : ""}"><p>${esc(msg.text)}</p>${msg.view ? chatResult(msg.view) : ""}${msg.followUps?.length && msg === state.chat.at(-1) ? `<div class="chat-followups">${msg.followUps.map((text) => `<button type="button" data-chat-prompt>${esc(text)}</button>`).join("")}</div>` : ""}</div>`,
        )
        .join("") +
      (state.asking
        ? `<p class="message pending">${t(state.chatTool === "data" ? "Analyzing data…" : "Applying changes…")}</p>`
        : "");
    $("#chat").scrollTop = $("#chat").scrollHeight;
    $("#chat").dataset.empty = t(
      state.chatTool === "data"
        ? "Ask about this customer's figures."
        : "Tell me what you want to change in the review.",
    );
    $("#question").placeholder = t(
      state.chatTool === "data"
        ? "E.g. compare water by quarter"
        : "E.g. focus on emissions or show the Turku site",
    );
    const hasPrompts = $("#chat-prompts").children.length > 0;
    const started = state.chat.length > 0;
    $("#chat-prompts").hidden = started && !state.promptsOpen;
    $("#chat-prompts-toggle").hidden = !hasPrompts || !started;
    $("#chat-prompts-toggle").textContent = t(
      state.promptsOpen ? "Hide suggestions" : "Show suggestions",
    );
    $("#question").disabled = state.asking;
    $("#ask-form button[type=submit]").disabled = state.asking;
    $("#ask-form").setAttribute("aria-busy", String(state.asking));
  }
  async function ask(question) {
    if (state.asking || storageLoading || switchingReview || !storageReady) return;
    const workspace = chatWorkspace(),
      snapshot = JSON.stringify(workspace),
      revision = state.chatRevision,
      chatTool = state.chatTool;
    const history = state.chat
      .slice(-6)
      .map((msg) => ({ role: msg.user ? "user" : "assistant", content: msg.text.slice(0, 1800) }));
    state.chat.push({ user: true, text: question });
    state.promptsOpen = false;
    state.asking = true;
    $("#chat").hidden = false;
    renderChat();
    updateChatToggle();
    try {
      const response = await fetch(`/api/chat?lang=${language}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history, workspace, lastQuery: state.lastQuery }),
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
      if (chatTool === "data") {
        if (result.query !== undefined) state.lastQuery = result.query;
        state.chat.push({
          user: false,
          text: result.changed.length
            ? t("Find data is read-only. Use Change the dashboard to make edits.")
            : (result.answer ?? result.message ?? t("No changes.")),
          view: result.view,
          followUps: result.followUps ?? [],
        });
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
        "cooperationDescription",
        "cooperationReason",
        "savings",
        "managerTexts",
        "dashboardLayout",
        "contractKpis",
        "includeContractAgenda",
        "approvedUpsells",
      ])
        state[key] = next[key];
      if (result.query !== undefined) state.lastQuery = result.query;
      else if (result.changed.some((key) => key.startsWith("scope."))) state.lastQuery = null;
      const onDashboard =
        Boolean(result.view) && chatTool === "dashboard" && state.view === "summary";
      state.queryResult = onDashboard
        ? result.view
        : result.changed.length
          ? null
          : state.queryResult;
      applyChatAreas(next);
      if (result.changed.some((key) => /^(titleEdits|managerTexts|areaTitles|areaNotes)/.test(key)))
        revealChatEdits(workspace);
      render();
      if (result.changed.length) await flushReviewSave();
      state.chat.push({
        user: false,
        text: onDashboard
          ? `${t("The comparison is on the dashboard.")} ${result.answer}`
          : (result.answer ??
            result.message ??
            (result.changed.length ? t("Done") : t("No changes."))),
        view: onDashboard ? null : result.view,
        followUps: result.followUps ?? [],
      });
      if (onDashboard) $("#query-result").scrollIntoView({ behavior: "smooth", block: "start" });
      if (result.changed.length && !result.view) {
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
  const chatTools = {
    data: {
      title: "Find and compare data",
      hint: "Figures, quarters, sites and products",
      prompts: [
        "What should we raise in the meeting?",
        "Compare water by quarter",
        "Which products need the most repairs?",
        "Compare emissions by country",
        "Which sites have the most late cycles?",
      ],
    },
    dashboard: {
      title: "Change the dashboard",
      hint: "Period, focus and visible content",
      prompts: [
        "Show Q2",
        "Compare water by quarter",
        "Focus on emissions",
        "Restore the default dashboard",
      ],
    },
    upload: {
      title: "Upload files",
      hint: "Analyze CSV, XLSX or JSON files",
    },
  };
  function toggleChatMenu(open) {
    $("#chat-menu").hidden = !open;
    $("#composer").classList.toggle("menu-open", open);
  }
  function renderChatMenu() {
    $("#chat-menu").innerHTML = Object.entries(chatTools)
      .map(
        ([id, tool]) =>
          `<button type="button" data-chat-tool="${id}"><strong>${esc(t(tool.title))}</strong><small>${esc(t(tool.hint))}</small></button>`,
      )
      .join("");
  }
  function openChatTool(id) {
    if (storageLoading || switchingReview) return;
    const uploading = id === "upload";
    if (!uploading) state.chatTool = id;
    state.promptsOpen = true;
    $("#chat-data-import").hidden = !uploading;
    $("#toggle-chat").setAttribute("aria-controls", uploading ? "chat-data-import" : "chat");
    $("#chat-prompts").innerHTML = (chatTools[id].prompts ?? [])
      .map((text) => `<button type="button" data-chat-prompt>${esc(t(text))}</button>`)
      .join("");
    toggleChatMenu(false);
    $("#chat").hidden = false;
    updateChatToggle();
    renderChat();
    $(uploading ? "#data-import-file" : "#question").focus();
  }
  $("#toggle-chat").addEventListener("click", () => {
    if ($("#chat").hidden) {
      renderChatMenu();
      toggleChatMenu($("#chat-menu").hidden);
      return;
    }
    $("#chat-data-import").hidden = true;
    $("#chat").hidden = true;
    $("#toggle-chat").setAttribute("aria-controls", "chat");
    updateChatToggle();
  });
  $("#query-result").addEventListener("click", (event) => {
    if (!event.target.closest("#query-close")) return;
    state.queryResult = null;
    renderQueryResult();
  });
  $("#chat-menu").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-tool]");
    if (button) openChatTool(button.dataset.chatTool);
  });
  $("#chat-prompts-toggle").addEventListener("click", () => {
    state.promptsOpen = !state.promptsOpen;
    renderChat();
  });
  $("#chat").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-prompt]");
    if (button) ask(button.textContent);
  });
  $("#chat-prompts").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-prompt]");
    if (button) ask(button.textContent);
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
      scheduleReviewSave();
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
  async function openCustomer(customer) {
    $("#customer").value = state.customer;
    if (switchingReview) return;
    switchingReview = true;
    $("#workspace").inert = true;
    $("#composer").inert = true;
    try {
      await flushReviewSave();
      if (await loadCustomerReview(customer)) setMode("prepare");
    } catch {
      /* The persistent save status explains the error. */
    } finally {
      switchingReview = false;
      $("#workspace").inert = false;
      $("#composer").inert = !storageReady;
      render();
    }
  }
  $("#customer").addEventListener("change", (event) => void openCustomer(event.target.value));
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
    if (event.target.id === "kam-notes") {
      state.meetingNotes = event.target.value;
      scheduleReviewSave();
    }
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
  $("#back-today").addEventListener("click", () => {
    flushReviewSave().catch(() => {});
    setMode("home");
    $("#customer-search").value = "";
    searchIndex = 0;
    renderToday();
    $("#customer-search").focus();
  });
  $("#copy-summary").addEventListener("click", async () => {
    const steps = agreedSteps();
    if (!steps.length) {
      $("#copy-status").textContent = t("Add an agreed next step first.");
      return;
    }
    const { customer } = context();
    const summary = [
      `${customer.customer_name} · ${t("Agreed next steps")}`,
      ...steps.map((step) => `• ${stepText(step)}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      $("#copy-status").textContent = t("Summary copied.");
    } catch {
      $("#copy-status").textContent = summary;
    }
  });
  $("#open-evidence").addEventListener("click", () => {
    $("#evidence-content").innerHTML = evidenceHtml();
    $("#evidence").showModal();
  });
  $("#reset-dashboard").addEventListener("click", () => {
    if (
      !window.confirm(t("Replace this customer's saved dashboard layout with the original layout?"))
    )
      return;
    state.dashboardLayout = globalThis.WorkspaceModel.defaultDashboardLayout();
    state.evidenceAreas = null;
    state.customerBasics = null;
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
    ) {
      const link = $("#download-powerpoint");
      link.href = ready.downloadUrl;
      link.setAttribute("aria-disabled", "false");
      link.title = t("Download PowerPoint");
      renderApproval();
      return;
    }
    state.readyPresentation = null;
    const link = $("#download-powerpoint");
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
    link.title = t("Generate the presentation first");
    renderApproval();
  }
  // Any edit after approval takes the review back to approval, so the file always matches it.
  function renderApproval() {
    const approved =
      Boolean(approvedRequest) && state.readyPresentation?.request === approvedRequest;
    $("#approve-review").hidden = approved;
    $("#approved-status").hidden = !approved;
    $("#download-powerpoint").hidden = !approved;
    $("#open-review").hidden = !approved;
  }
  $("#approve-review").addEventListener("click", async () => {
    const button = $("#approve-review");
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = t("Creating PowerPoint…");
    try {
      await flushReviewSave().catch(() => {});
      const ready = await startPresentation();
      if (!ready) throw new Error(t("Could not create the presentation. Try again."));
      approvedRequest = ready.request;
      status(t("Approved. The PowerPoint is ready."));
    } catch (error) {
      status(error.message || t("Could not create the presentation. Try again."));
    } finally {
      button.disabled = false;
      button.textContent = t("Approve and create PowerPoint");
      renderApproval();
    }
  });
  function presentationRequest(includeAgenda = true) {
    const scope = Object.fromEntries(
      ["customer", "from", "to", "country", "continent", "site", "baseline", "priority"].map(
        (key) => [key, state[key]],
      ),
    );
    const agenda =
      includeAgenda && state.includeContractAgenda
        ? customerKpis().filter((kpi) => kpi.priority)
        : [];
    const steps = includeAgenda ? agreedSteps() : [];
    const stepsNote = steps.length
      ? [t("Agreed next steps"), ...steps.map((step) => `• ${stepText(step)}`)].join("\n")
      : "";
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
      note: [state.note, stepsNote, agendaNote].filter(Boolean).join("\n\n"),
      cooperation: state.cooperation,
      savings: state.savings,
      managerTexts: state.managerTexts,
      approvedUpsells: state.approvedUpsells,
      slideOrder: state.slideOrder,
      hideUsage: state.hideUsage,
      reviewAreas: includeAgenda ? reviewAreas() : [],
      language,
    };
  }
  function startPresentation() {
    const payload = presentationRequest();
    const request = JSON.stringify(payload);
    if (payload.note.length > 2000) return Promise.resolve(null);
    if (state.readyPresentation?.request === request)
      return Promise.resolve(state.readyPresentation);
    if (presentationJob?.request === request) return presentationJob.promise;
    const promise = (async () => {
      // Locked: the file is built exactly like the slides on the page, with no AI changes.
      const response = await fetch(`/api/presentations?lang=${language}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locked: true }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || t("Could not create the presentation. Try again."));
      if (request !== JSON.stringify(presentationRequest())) return null;
      const viewUrl = `/kopperoinenp/presentation.html?id=${encodeURIComponent(result.id)}&lang=${language}`;
      state.readyPresentation = {
        id: result.id,
        downloadUrl: result.downloadUrl,
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
      renderApproval();
      return state.readyPresentation;
    })().finally(() => {
      if (presentationJob?.promise === promise) presentationJob = null;
    });
    presentationJob = { request, promise };
    return promise;
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
      const ready = await startPresentation();
      if (!ready)
        throw new Error(
          t(
            "The review changed during preparation. Open the presentation again with the current selection.",
          ),
        );
      if (!viewer.closed) viewer.location.replace(ready.viewUrl);
    } catch (error) {
      const message = error.message || t("Could not create the presentation. Try again.");
      status(message);
      if (!viewer.closed)
        viewer.location.replace(
          `/kopperoinenp/presentation.html?lang=${language}&error=${encodeURIComponent(message)}`,
        );
    } finally {
      state.generating = false;
      button.textContent = t("Open slideshow");
      button.disabled = !context().metrics.hasData || !state.included.length;
    }
  });
  function applyLanguage() {
    updateLanguage();
    if (storageMessage) storageStatus(storageMessage.fi, storageMessage.en);
    updateChatToggle();
    render();
    $("#download-powerpoint").title = t(
      state.readyPresentation ? "Download PowerPoint" : "Generate the presentation first",
    );
  }
  bindLanguageControls(applyLanguage);
  applyLanguage();
  const previousCustomer =
    sessionStorage.getItem("lindstrom-review-customer") ||
    localStorage.getItem("lindstrom-review-customer");
  loadCustomerReview(
    data.customers.some((row) => row.customer_id === previousCustomer)
      ? previousCustomer
      : state.customer,
  ).then(() => $("#customer-search").focus());
})();
