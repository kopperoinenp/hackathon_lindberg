(function () {
  "use strict";
  const data = globalThis.REVIEW_DATA;
  const { escapeHtml: esc } = globalThis.ReviewModel;
  const { storyContext } = globalThis.StoryModel;
  const $ = (query) => document.querySelector(query);
  const f = (number, digits = 0) =>
    new Intl.NumberFormat("fi-FI", { maximumFractionDigits: digits }).format(number);
  const state = {
    customer: "CUST001",
    from: "2025-01",
    to: "2025-12",
    country: "all",
    continent: "all",
    metric: "water",
    view: "summary",
    site: "all",
    baseline: "B_LOCAL",
    priority: "neutral",
    initialized: false,
    goal: "",
    briefingContext: "",
    included: [...globalThis.MeetingModel.insightIds],
    titleEdits: {},
    slideIndex: 0,
    note: "",
    chat: [],
  };
  let statusTimer;
  const briefKey = () => `lindstrom-meeting-brief-v1:${state.customer}`;
  function restoreBrief() {
    let saved = null;
    try {
      saved = globalThis.MeetingModel.parseBrief(localStorage.getItem(briefKey()));
    } catch {
      /* Storage may be unavailable. */
    }
    state.initialized = Boolean(saved);
    state.goal = saved?.goal || "";
    state.briefingContext = saved?.context || "";
    state.priority = globalThis.MeetingModel.goalFocus(state.goal, "neutral").priority;
  }
  function saveBrief() {
    try {
      localStorage.setItem(
        briefKey(),
        JSON.stringify({ completed: true, goal: state.goal, context: state.briefingContext }),
      );
    } catch {
      status(
        "Katsaus avattiin. Selain ei salli aloituksen tallennusta, joten sitä kysytään uudelleen sivun päivityksen jälkeen.",
      );
    }
  }
  const context = () => storyContext(data, state);
  const baselineName = () =>
    ({
      B_LOCAL: "paikallinen ulkoistettu pesula",
      B_HOME: "kotipesu",
      B_INHOUSE: "asiakkaan oma pesula",
    })[state.baseline];
  const scopeName = () => scopeLabel();
  function periodName() {
    return state.from === "2025-01" && state.to === "2025-12"
      ? "vuosi 2025"
      : `${state.from} – ${state.to}`;
  }
  function snapshotName() {
    return context().metrics.snapshotMonth || state.to;
  }
  function scopeLabel() {
    const site = data.sites.find((row) => row.site_id === state.site);
    return [
      site ? site.site_name : "Kaikki toimipaikat",
      state.country !== "all" ? globalThis.WorkspaceModel.countryNames[state.country] : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function updateChatToggle() {
    $("#toggle-chat").textContent = $("#chat").hidden ? "Näytä keskustelu" : "Piilota keskustelu";
    $("#toggle-chat").setAttribute("aria-expanded", String(!$("#chat").hidden));
  }
  function renderAnalysis() {
    const ctx = context(),
      m = ctx.metrics;
    if (!m.hasData) {
      $("#analysis-content").innerHTML =
        `<section class="empty-state"><h2>${ctx.invalidPeriod ? "Tarkista ajanjakso" : "Rajauksella ei ole dataa"}</h2><p>${ctx.invalidPeriod ? "Alkukuukausi ei voi olla loppukuukauden jälkeen." : "Vaihda maata, toimipaikkaa tai ajanjaksoa."}</p></section>`;
      return;
    }
    const definitions = {
      water: { label: "Vedenkulutus", unit: "m³", divisor: 1000 },
      emissions: { label: "Pesun ja toimitusten päästöt", unit: "t CO₂e", divisor: 1000 },
      repairs: { label: "Korjaukset", unit: "kpl", divisor: 1 },
    };
    const def = definitions[state.metric],
      points = globalThis.WorkspaceModel.series(ctx, state.metric),
      countries = globalThis.WorkspaceModel.countries(data, ctx, state.metric);
    const max = Math.max(...points.map((point) => point.value), 1),
      countryMax = Math.max(...countries.map((point) => point.value), 1);
    $("#analysis-content").innerHTML =
      `<div class="analysis-scope"><strong>${esc(scopeLabel())}</strong><span>${periodName()} · ${ctx.rows.length} kuukausittaista toimipaikkariviä</span></div><div class="analysis-kpis">${[
        ["Pesuun käytetty vesi", f(m.water / 1000) + " m³"],
        ["Pesu ja toimitukset", f(m.emissions / 1000, 1) + " t CO₂e"],
        ["Korjaukset", f(m.repairs) + " kpl"],
        ["Allokoidut tekstiilit", f(m.allocated) + " kpl"],
      ]
        .map(
          ([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`,
        )
        .join(
          "",
        )}</div><div class="analysis-charts"><section class="analysis-card"><div class="chart-heading"><h2>Kehitys kuukausittain</h2><label for="metric" class="sr-only">Kaavioiden mittari</label><select id="metric">${Object.entries(
        definitions,
      )
        .map(
          ([key, definition]) =>
            `<option value="${key}" ${state.metric === key ? "selected" : ""}>${definition.label}</option>`,
        )
        .join(
          "",
        )}</select></div><div class="trend-chart" style="grid-template-columns:repeat(${points.length}, minmax(0,1fr))" role="img" aria-label="${def.label}: ${points.map((point) => `${point.month} ${f(point.value / def.divisor, 1)} ${def.unit}`).join(", ")}">${points.map((point) => `<div class="trend-column"><span>${f(point.value / def.divisor)}</span><div class="trend-track"><i style="height:${(point.value / max) * 100}%"></i></div><small>${point.month.slice(5)}</small></div>`).join("")}</div><p class="quiet">${def.label} (${def.unit}) · Synteettinen ${state.metric === "repairs" ? "tapahtumamäärä" : "allokoitu arvio"}. Kuukausien kokonaismäärät, ei tehokkuusvertailu.</p></section><section class="analysis-card"><h2>Jakauma maittain</h2>${countries.map((point) => `<div class="country-row"><div><span>${globalThis.WorkspaceModel.countryNames[point.country]}</span><strong>${f(point.value / def.divisor, 1)} ${def.unit}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(point.value / countryMax) * 100}%"></div></div></div>`).join("")}<p class="quiet">${def.label} valitulta ajalta. Maakohtainen kokonaismäärä riippuu myös palvelun laajuudesta.</p></section></div><section class="analysis-card"><h2>Toimipaikat ja tekstiilien käyttö</h2><p class="quiet">Tilanne ${snapshotName()}. Skannausosuus ei yksin osoita vajaakäyttöä. Vesi ja korjaukset ovat koko valitulta jaksolta.</p><div class="table-wrap"><table><thead><tr><th>Toimipaikka</th><th>Maa</th><th>Skannattu</th><th>Allokoitu</th><th>Vesi, m³</th><th>Korjaukset</th></tr></thead><tbody>${ctx.sites.map((site) => `<tr><td><button class="site-link" data-site="${site.site_id}">${esc(site.site_name)}</button></td><td>${globalThis.WorkspaceModel.countryNames[site.country]}</td><td>${site.utilization == null ? "Ei tietoa" : f(site.utilization, 1) + " %"}</td><td>${f(site.allocated)}</td><td>${f(site.water / 1000)}</td><td>${f(site.repairs)}</td></tr>`).join("")}</tbody></table></div></section>`;
  }
  function render() {
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
      '<option value="all">Kaikki maat</option>' +
      [...new Set(available.map((row) => row.country))]
        .map(
          (country) =>
            `<option value="${country}">${globalThis.WorkspaceModel.countryNames[country]}</option>`,
        )
        .join("");
    $("#site").innerHTML =
      '<option value="all">Kaikki toimipaikat</option>' +
      available
        .filter((row) => state.country === "all" || row.country === state.country)
        .map((row) => `<option value="${row.site_id}">${esc(row.site_name)}</option>`)
        .join("");
    for (const id of ["site", "baseline", "priority", "country", "continent"])
      $("#" + id).value = state[id];
    $("#summary-panel").hidden = state.view !== "summary";
    $("#analysis-panel").hidden = state.view !== "analysis";
    $("#composer").hidden = state.view !== "summary" || !state.initialized;
    $("#onboarding").hidden = state.initialized;
    $("#goal-form").hidden = !state.initialized;
    $("#story").hidden = !state.initialized;
    $("#open-review").hidden = !state.initialized;
    for (const view of ["summary", "analysis"]) {
      const tab = $("#" + view + "-tab");
      tab.setAttribute("aria-selected", String(state.view === view));
      tab.tabIndex = state.view === view ? 0 : -1;
    }
    $("#open-review").disabled = !ctx.metrics.hasData;
    $("#meeting-goal").value = state.goal;
    $("#meeting-context").value = state.briefingContext;
    const goalInfo = globalThis.MeetingModel.goalFocus(state.goal, state.priority);
    $("#goal-status").textContent = state.goal
      ? "Tavoite ohjaa nostojen painotusta tässä sääntöpohjaisessa mockissa. " + goalInfo.gap
      : "Yleiskatsaus ilman erillistä painotusta. Voit täydentää palaverin tavoitetta milloin tahansa.";
    renderStory();
    renderAnalysis();
  }
  function status(text) {
    $("#status").textContent = text;
    $("#status").classList.add("visible");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => $("#status").classList.remove("visible"), 4000);
  }
  function chart(actual, alternative, unit) {
    const maximum = Math.max(actual, alternative, 1);
    return `<div class="mini-chart" role="img" aria-label="Lindström ${f(actual)} ${unit}, vertailumalli ${f(alternative)} ${unit}"><div class="bar-label"><span>Lindström</span><span>${f(actual)} ${unit}</span></div><div class="bar-track"><div class="bar-fill" style="width:${(actual / maximum) * 100}%"></div></div><div class="bar-label"><span>Vertailumalli</span><span>${f(alternative)} ${unit}</span></div><div class="bar-track"><div class="bar-fill alt" style="width:${(alternative / maximum) * 100}%"></div></div></div>`;
  }
  function results() {
    const { metrics: m, compare: c } = context();
    return {
      water: {
        name: "Vesi",
        value: `${c.waterDifference >= 0 ? "−" : "+"}${f(Math.abs(c.waterPercent), 0)} %`,
        unit: "vertailumalliin nähden",
        title:
          c.waterDifference >= 0
            ? "Vähemmän vettä samaan pesumäärään"
            : "Vedenkulutus ylittää vertailumallin",
        text: `Pesuun kohdistettu vedenkulutus oli ${f(m.water / 1000)} m³. Ero valittuun vaihtoehtoon on ${f(Math.abs(c.waterDifference) / 1000)} m³.`,
        visual: chart(m.water / 1000, c.baselineWater / 1000, "m³"),
        source: "Customer_Impacts, Baselines",
        boundary: "Laskennallinen arvio · pesun vedenkulutus",
      },
      emissions: {
        name: "Ilmastovaikutus",
        value: `${c.emissionsDifference >= 0 ? "−" : "+"}${f(Math.abs(c.emissionsPercent), 0)} %`,
        unit: "vertailumalliin nähden",
        title:
          c.emissionsDifference >= 0
            ? "Pienempi pesun ja toimitusten jalanjälki"
            : "Pesun ja toimitusten päästöt ylittävät vertailun",
        text: `Pesun ja toimitusten päästöarvio on ${f(m.emissions / 1000, 1)} t CO₂e. Ero vertailumalliin on ${f(Math.abs(c.emissionsDifference) / 1000, 1)} t CO₂e.`,
        visual: chart(m.emissions / 1000, c.baselineEmissions / 1000, "t CO₂e"),
        source: "Customer_Impacts, Baselines",
        boundary: "Laskennallinen arvio · pesu ja toimitukset",
      },
      repairs: {
        name: "Tekstiilien huolto",
        value: f(m.repairs),
        unit: "korjausta valitulla jaksolla",
        title: "Korjaaminen tukee pidempää käyttöä",
        text: "Tekstiilejä huollettiin korjaamalla. Määrä kertoo korjaustoiminnasta; vältettyjä hankintoja tai päästöjä siitä ei suoraan päätellä.",
        visual: globalThis.SummaryCharts.repairBars(context()),
        source: "Repairs",
        boundary: "Synteettinen tapahtumamäärä · ei yksilöllisiä tekstiilejä",
      },
    };
  }
  function opening() {
    return {
      neutral:
        "Tässä yleiskatsauksessa tarkastelemme vedenkäyttöä, pesun ja toimitusten päästöjä sekä korjaustoimintaa ilman erillistä painotusta. Lopuksi käymme läpi yhteisen kehitysehdotuksen.",
      water:
        context().customer.industry === "Food & Beverage"
          ? "Elintarvikeasiakkaan katsaukseen nostamme vedenkäytön ja tekstiilien huollon. Tässä näkyvät vuoden tärkeimmät havainnot."
          : "Tässä katsauksessa korostuu vedenkäyttö. Käydään ensin läpi vuoden tärkeimmät tulokset ja sitten yhteinen kehitysehdotus.",
      efficiency:
        "Tässä katsauksessa korostuvat tekstiilien huolto ja todellinen tarve. Käydään ensin läpi vuoden tulokset ja sitten mitoituksen tarkistus.",
      circularity:
        "Asiakkaan katsauksessa korostuvat tekstiilien huolto ja käytön jatkuvuus. Korjaustoiminnan rinnalla tarkistetaan, mistä tarvitaan vielä lisätietoa.",
      emissions:
        "Tässä katsauksessa keskitymme pesun ja toimitusten ilmastovaikutukseen. Vertailun rajaus ja oletukset kulkevat tulosten mukana.",
    }[state.priority];
  }
  function plan() {
    const { focus } = context();
    return [
      [
        `Tarkistetaan ${focus.site_name} yhdessä asiakkaan kanssa.`,
        "Varmistetaan varatekstiilien tarve ja skannausten kattavuus.",
      ],
      [
        "Sovitaan yksi konkreettinen parannus ja sen vastuuhenkilö.",
        "Mitoitusta muutetaan vasta tarkistetun tarpeen perusteella.",
      ],
      [
        "Palataan tuloksiin seuraavassa seurantapalaverissa.",
        "Mahdollinen säästö arvioidaan vasta hyväksytyillä lähtötiedoilla.",
      ],
    ];
  }
  function summaryGraphics() {
    const ctx = context();
    const metric =
      state.priority === "emissions"
        ? "emissions"
        : ["circularity", "efficiency"].includes(state.priority)
          ? "repairs"
          : "water";
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
    return `<div class="summary-graphics"><section class="summary-chart-card"><div class="graphic-heading"><div><span class="section-kicker">KEHITYS VALITULLA JAKSOLLA</span><h3>${metric === "repairs" ? "Korjaustoiminta kuukausittain" : def.label + " vertailumalliin nähden"}</h3></div><span class="chart-period">${esc(periodName())}</span></div><div class="chart-legend"><span><i class="legend-actual"></i>Lindström</span>${metric === "repairs" ? "" : '<span><i class="legend-baseline"></i>Valittu vertailumalli</span>'}</div>${globalThis.SummaryCharts.lineChart(ctx, metric)}<div class="chart-takeaway"><strong>Suurin kuukausimäärä: ${peak.month}</strong><span>${f(peak.actual / def.divisor, 1)} ${def.unit}</span></div><p class="quiet">${metric === "repairs" ? "Synteettiset korjaustapahtumat. Määrä ei ole yksilöllisten tekstiilien määrä." : "Laskennallinen arvio. Molemmissa malleissa on sama pesty kilomäärä. Kuukausien kokonaismäärät eivät yksin osoita tehokkuutta."}</p></section><section class="summary-chart-card geography-card"><span class="section-kicker">MISTÄ KOKONAISUUS MUODOSTUU?</span><h3>${metric === "water" ? "Vedenkäyttö" : metric === "emissions" ? "Päästöt" : "Korjaukset"} maittain</h3><div class="country-donut" style="background:conic-gradient(${total ? stops : "#e4e9ed 0% 100%"})" role="img" aria-label="${shares.map((point) => `${globalThis.WorkspaceModel.countryNames[point.country]} ${f(point.share * 100, 1)} prosenttia`).join(", ")}"><div><strong>${f(total / def.divisor)}</strong><span>${def.unit} yhteensä</span></div></div><div class="country-legend">${shares.map((point, index) => `<div><i style="background:${colors[index % colors.length]}"></i><span>${globalThis.WorkspaceModel.countryNames[point.country]}</span><strong>${f(point.share * 100, 1)} %</strong></div>`).join("")}</div><p class="quiet">Osuudet valitun jakson kokonaismäärästä. Toimipaikkojen määrä ja palvelun laajuus vaikuttavat jakaumaan.</p></section></div>`;
  }
  function snapshotGraphic(site) {
    const ratio = Math.max(0, Math.min(site.utilization || 0, 100));
    return `<div class="snapshot-ring" style="--scan-angle:${ratio * 3.6}deg" role="img" aria-label="Skannattu ${f(site.scanned)} tekstiiliä, ilman skannausta ${f(site.unscanned)}, allokoitu yhteensä ${f(site.allocated)}"><div><strong>${f(site.utilization, 1)} %</strong><span>skannausosuus</span></div></div><div class="snapshot-counts"><span><i></i>${f(site.scanned)} skannattu</span><span><i></i>${f(site.unscanned)} ilman skannausta</span></div><p class="ratio-caption">Tilanne ${snapshotName()}. Osuus kertoo skannaustiedosta; varatekstiilit, sesonki ja datan puutteet tarkistetaan ennen mitoituksen muutosta.</p>`;
  }
  function siteBenchmark() {
    const ctx = context(),
      shown = ctx.sites.filter((site) => site.utilization !== null).slice(0, 5);
    return `<div class="site-benchmark"><div><h3>${shown.length === 1 ? "Valitun toimipaikan skannausosuus" : shown.length + " pienintä toimipaikan skannausosuutta"}</h3><p class="quiet">${snapshotName()} · Selvityksen lähtökohta, ei todistettu vajaakäyttö.</p></div><div class="site-ranking">${shown.map((site) => `<div><span>${esc(site.site_name)}</span><div><i style="width:${Math.min(site.utilization, 100)}%"></i></div><strong>${f(site.utilization, 1)} %</strong></div>`).join("")}</div></div>`;
  }
  function renderStory() {
    const { metrics: m, focus, sites, order } = context();
    if (!m.hasData) {
      $("#story").innerHTML =
        `<section class="intro"><h1>Tällä rajauksella ei ole dataa.</h1><p>${context().invalidPeriod ? "Alkukuukausi on loppukuukauden jälkeen." : "Valitse toinen ajanjakso tai maantieteellinen rajaus Tutki dataa -näkymässä."}</p></section>`;
      return;
    }
    const shortName = { CUST001: "NorthStarin", CUST002: "Apexin", CUST003: "Medioran" }[
      state.customer
    ];
    const cards = results();
    $("#story").innerHTML =
      `<section class="intro"><span class="section-kicker">VUOSIPALAVERIN VALMISTELU</span><h1>${shortName} ${periodName()}.<br />Mitä saatiin aikaan?</h1><p>${opening()}</p><div class="scope"><strong>${esc(scopeName())}</strong> · ${m.sites} ${m.sites === 1 ? "toimipaikka" : "toimipaikkaa"} · Vertailu: ${baselineName()}</div></section><section class="story-section" aria-labelledby="results-title"><div class="section-heading"><span class="section-number">01</span><h2 id="results-title">Jakson tärkeimmät tulokset</h2></div><div class="results">${order
        .map((key) => {
          const card = cards[key];
          return `<article class="result"><div class="result-name">${card.name}</div><div class="result-value">${card.value}</div><span class="result-unit">${card.unit}</span>${card.visual}<h3>${card.title}</h3><p>${card.text}</p><div class="relevance"><strong>Miksi tämä nostetaan?</strong><p>${esc(globalThis.MeetingModel.relevance(key, state.priority, Boolean(state.goal)))}</p></div><small>${card.boundary}</small></article>`;
        })
        .join(
          "",
        )}</div><p class="quiet">Synteettinen aineisto. Vertailu kuvaa vaihtoehtoista pesumallia samalla pestyllä määrällä, ei nimettyä kilpailijaa.</p>${summaryGraphics()}</section><section class="story-section" aria-labelledby="opportunity-title"><div class="section-heading"><span class="section-number">02</span><h2 id="opportunity-title">Tärkein asia selvitettäväksi</h2></div><div class="opportunity"><div><span class="section-kicker">${esc(focus.site_name)}</span><h3>Vastaako tekstiilien määrä todellista tarvetta?</h3><p>${f(focus.unscanned)} allokoidulle tekstiilille ei näy aktiivista skannausta ${snapshotName()}. Aloitetaan tästä toimipaikasta ja tarkistetaan tilanne yhdessä asiakkaan kanssa.</p></div><div class="opportunity-visual">${snapshotGraphic(focus)}</div></div><p class="relevance">${esc(globalThis.MeetingModel.relevance("opportunity", state.priority, Boolean(state.goal)))}</p>${siteBenchmark()}<details class="site-details"><summary>Katso myös muut toimipaikat</summary><div class="table-wrap"><table><thead><tr><th>Toimipaikka</th><th>Skannattu ${snapshotName()}</th><th>Allokoituja tekstiilejä</th></tr></thead><tbody>${sites.map((site) => `<tr><td><button class="site-link" data-site="${site.site_id}">${esc(site.site_name)}</button></td><td>${f(site.utilization, 1)} %</td><td>${f(site.allocated)}</td></tr>`).join("")}</tbody></table></div><p class="quiet">Avaa toimipaikka nähdäksesi sen oman katsauksen. Palaa kokonaisuuteen pyytämällä apurilta ”näytä kaikki toimipaikat”.</p></details></section><section class="story-section" aria-labelledby="next-title"><div class="section-heading"><span class="section-number">03</span><h2 id="next-title">Yhteinen suunta ensi vuodelle</h2></div><div class="next-chapter"><div><h3>Yksi hyvä parannus<br />kerrallaan.</h3><p>Ota palaveriin mukaan selkeä keskustelunavaus. Nämä ovat ehdotuksia, joista sovitaan asiakkaan kanssa.</p></div><ol class="next-steps">${plan()
        .map(([title, note]) => `<li>${esc(title)}<small>${esc(note)}</small></li>`)
        .join(
          "",
        )}</ol></div><details class="notes-details" ${state.note ? "open" : ""}><summary>Lisää oma muistiinpano esitykseen</summary><label for="meeting-note" class="sr-only">Oma palaverimuistiinpano</label><textarea id="meeting-note" maxlength="2000" placeholder="Esimerkiksi asiakkaan tavoite tai palaverissa sovittu seuraava askel…">${esc(state.note)}</textarea><p class="quiet">Muistiinpano säilyy tässä välilehdessä. Asiakkaan, toimipaikan tai vertailun vaihtaminen tyhjentää sen.</p></details></section>`;
  }
  function evidenceHtml() {
    if (!context().metrics.hasData)
      return "<p>Nykyisellä rajauksella ei ole dataa. Korjaa rajaus ennen laskennan tarkastelua.</p>";
    const { metrics: m, compare: c, baseline: b, customer } = context();
    return `<p class="quiet">${esc(customer.customer_name)} · ${esc(scopeName())} · ${periodName()}</p><p class="quiet">Kaikki asiakasluvut ovat synteettisiä. Veden ja päästöjen luvut ovat lisäksi laskennallisia, pesulatasolta kohdistettuja arvioita.</p><section class="method-section"><h3>Vertailu: ${baselineName()}</h3><p>Sama pesty kilomäärä, eri vedenkulutus- ja päästökertoimet. Vaihtoehdot ovat havainnollistavia pesumalleja, eivät nimettyjen kilpailijoiden mitattuja tuloksia.</p><div class="formula">Vesiero: ${f(m.kg, 1)} kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l<br />Päästöero: ${f(m.kg, 1)} kg × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e</div><p>Rajaus on pesun vedenkulutus sekä pesun ja toimitusten päästöt, ei tekstiilien koko elinkaari. Pyöristetyt luvut näytetään katsauksessa. Vertailukertoimien herkkyysvaihtelut eivät vielä sisälly mockiin.</p></section><section class="method-section"><h3>Lähteet ja laskenta</h3><p>Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx, repositorion data/source-kansiossa.</p><ul><li>Customers ja Sites: kuvitteellinen asiakkuus ja toimipaikat.</li><li>Service_Activity: valitun jakson pestyt kilot sekä ${snapshotName()} tilanteen allokointi ja skannaukset.</li><li>Customer_Impacts: allocated_water_l, allocated_process_kgco2e ja allocated_delivery_kgco2e, summat valitulta jaksolta.</li><li>Repairs: korjaustapahtumien summa valitulta jaksolta. Ei yksilöllisten tekstiilien määrä.</li><li>Baselines: valitun vertailumallin kertoimet.</li></ul></section><section class="method-section"><h3>Mitä tuloksista ei voi päätellä?</h3><ul><li>Skannausosuus ei osoita tekstiilien todellista vajaakäyttöä. Se on tarkistettava havainto.</li><li>Korjaus ei automaattisesti tarkoita vältettyä hankintaa. Korjausten oletettua päästökädenjälkeä ei lasketa yhteen pesun päästöeron kanssa.</li><li>Käyttäjiä ei summata tuoteriveiltä ilman yksilöivää avainta.</li><li>Kustannussäästöihin, palvelupyyntöjen ratkaisuun ja sääntelyväitteisiin ei ole tässä riittäviä lähtötietoja.</li><li>Toimialan mukainen painotus on muokattava ehdotus, ei compliance-arvio.</li></ul></section>`;
  }
  function clearScope() {
    state.note = "";
    state.titleEdits = {};
    state.slideIndex = 0;
    state.chat = [];
  }
  function reply(question) {
    const text = question.toLocaleLowerCase("fi");
    const selection = globalThis.MeetingModel.selectionCommand(question);
    if (selection) {
      state.included = selection.include
        ? [...new Set([...state.included, selection.id])]
        : state.included.filter((id) => id !== selection.id);
      return selection.include
        ? "Nosto on mukana nykyisessä esityksessä. Avaa esitys tarkistaaksesi kokonaisuuden."
        : "Poistin noston esityksestä. Se säilyy katsauksen taustatietona. Lähteet ja tulkinnan rajat pysyvät mukana.";
    }
    let change = "";
    if (/lisää (esitykseen|katsaukseen|muistiinpano)/.test(text)) {
      state.note = question.replace(
        /^.*?lisää (?:esitykseen|katsaukseen|muistiinpano(?:ksi)?)[\s:]+/i,
        "",
      );
      render();
      return "Lisäsin tekstin esityksen muistiinpanoksi. Se näkyy Yhteinen suunta ensi vuodelle -osiossa ja esityksen esikatselussa.";
    }
    if (/näytä|keskity|painota|vaihda|vertaa|tarkastele|rajaa/.test(text)) {
      const country = /suomi|suomen|suomeen/.test(text)
        ? "Finland"
        : /ruotsi|ruotsin|ruotsiin/.test(text)
          ? "Sweden"
          : /puola|puolan|puolaan/.test(text)
            ? "Poland"
            : null;
      if (country) {
        if (
          !data.sites.some((row) => row.customer_id === state.customer && row.country === country)
        )
          return "Tällä asiakkaalla ei ole toimipaikkoja pyydetyssä maassa. En muuttanut rajausta.";
        state.country = country;
        state.site = "all";
        clearScope();
        change = `Rajasin katsauksen maahan ${globalThis.WorkspaceModel.countryNames[country]}.`;
      }
      const months = text.match(/2025-(?:0[1-9]|1[0-2])/g);
      if (months) {
        state.from = months[0];
        state.to = months[1] || months[0];
        clearScope();
        change += ` Valittu jakso on ${periodName()}.`;
      }
      const placeText = text
        .replace(/turun/g, "turku")
        .replace(/helsingin/g, "helsinki")
        .replace(/tampereen/g, "tampere");
      const site = data.sites
        .filter((r) => r.customer_id === state.customer)
        .find(
          (r) =>
            placeText.includes(r.site_name.toLowerCase()) ||
            placeText.includes(r.city.toLowerCase()),
        );
      if (/kaikki toimipaikat|koko asiak/.test(text)) {
        state.site = "all";
        state.country = "all";
        state.continent = "all";
        clearScope();
        change = "Näytän jälleen koko asiakkuuden.";
      } else if (site) {
        state.site = site.site_id;
        state.country = "all";
        state.continent = "all";
        clearScope();
        change = `Rajasin katsauksen toimipaikkaan ${site.site_name}.`;
      }
      const baseline = /kotipes/.test(text)
        ? "B_HOME"
        : /omaan pesul|oma pesul|omaa pesul|sisäi/.test(text)
          ? "B_INHOUSE"
          : /paikalli/.test(text)
            ? "B_LOCAL"
            : null;
      if (baseline) {
        state.baseline = baseline;
        clearScope();
        change += ` Vertailuna on nyt ${baselineName()}.`;
      }
      const priority = /päästö|ilmasto/.test(text)
        ? "emissions"
        : /vesi|veteen|veden|vettä/.test(text)
          ? "water"
          : /käyt|tehok|mitoit/.test(text)
            ? "efficiency"
            : /korj|kierto/.test(text)
              ? "circularity"
              : null;
      if (priority) {
        state.priority = priority;
        change += " Muutin katsauksen painotusta ja esityksen nostojen järjestystä.";
      }
      if (change) {
        render();
        return (
          change.trim() +
          " Katsauksen lähtöluvut perustuvat samaan synteettiseen aineistoon. Rajauksen vaihto tyhjentää aiemman rajauksen muistiinpanot."
        );
      }
    }
    const { metrics: m, compare: c, focus } = context();
    if (!m.hasData)
      return "Nykyisellä rajauksella ei ole dataa. Korjaa ajanjakso tai alue Tutki dataa -näkymässä.";
    if (/vesi|veden|vesis|veteen/.test(text))
      return `Pesuun kohdistettu vedenkulutus on ${f(m.water / 1000)} m³. Samat ${f(m.kg)} pestyä kiloa kerrotaan vertailumallin l/kg-kertoimella. Ero on ${f(c.waterDifference / 1000)} m³. Vertailu: ${baselineName()}. Tämä on synteettinen arvio. Lähteet: Service_Activity, Customer_Impacts ja Baselines.`;
    if (/päästö|ilmasto/.test(text))
      return `Pesun ja toimitusten päästöarvio on ${f(m.emissions / 1000, 1)} t CO₂e. Ero vertailumalliin on ${f(c.emissionsDifference / 1000, 1)} t CO₂e. Lähteet: Customer_Impacts ja Baselines. Tekstiilien valmistus ja korjausten oletettu kädenjälki eivät sisälly rajaukseen.`;
    if (/korj|kierto/.test(text))
      return `Aineistossa on ${f(m.repairs)} korjaustapahtumaa. Lähde: Repairs.repair_count. Määrä ei kerro yksilöllisiä korjattuja tekstiilejä eikä sellaisenaan vältettyjä hankintoja. Siksi korjausten päästösäästöä ei tässä väitetä.`;
    if (/käyt|paran|ensi|mitoit|skann/.test(text))
      return `${focus.site_name}: ${snapshotName()} ${f(focus.utilization, 1)} % allokoiduista tekstiileistä näkyy aktiivisissa skannauksissa. ${f(focus.unscanned)} tekstiiliä jää ilman skannausta. Tarkistakaa varatekstiilit, sesonkitarve ja datan kattavuus. Vasta tämän jälkeen voidaan ehdottaa mitoituksen muutosta. Lähde: Service_Activity.`;
    if (/kilpail|kustan|euro|säästö/.test(text))
      return "Aineisto ei sisällä nimettyjen kilpailijoiden todennettuja tietoja tai hyväksyttyjä kustannus- ja työaikatietoja. En muodosta niistä säästöväitettä. Voimme verrata synteettisiä pesumalleja samalla pestyllä kilomäärällä.";
    return "Tässä mockissa voin selittää vesi-, päästö- ja korjauslukuja tai tekstiilien käytön tarkistusta. Kokeile esimerkiksi ”keskity päästöihin”, ”näytä Turku”, ”näytä kaikki toimipaikat” tai ”vertaa kotipesuun”. Voit myös pyytää ”lisää esitykseen: asiakkaan tavoite on…”. Muut kysymykset vaativat myöhemmin oikean AI-yhteyden.";
  }
  function renderChat() {
    $("#chat").innerHTML = state.chat
      .map((msg) => `<p class="message ${msg.user ? "user" : ""}">${esc(msg.text)}</p>`)
      .join("");
    $("#chat").scrollTop = $("#chat").scrollHeight;
  }
  function ask(question) {
    const response = reply(question);
    state.chat.push({ user: true, text: question }, { user: false, text: response });
    renderChat();
    $("#chat").hidden = false;
    updateChatToggle();
  }
  function reviewHtml() {
    const { customer, metrics: m, focus, order } = context();
    const cards = results();
    let number = 0;
    const selected = globalThis.MeetingModel.slideIds(order, state.included);
    const slide = (id, title, content) =>
      !selected.includes(id)
        ? ""
        : `<section class="slide" data-slide-id="${id}"><div class="slide-number">LINDSTRÖM · ASIAKASKATSAUS · ${esc(periodName())} · ${++number}</div><h3>${esc(state.titleEdits[id] || title)}</h3>${content}<small>Synteettinen aineisto · ${esc(scopeName())} · ${esc(periodName())} · Vertailu: ${baselineName()}</small></section>`;
    let html = slide(
      "cover",
      customer.customer_name,
      `<p>Jakson tärkeimmät tulokset ja yhteinen suunta vuodelle 2026.</p><div class="slide-value">${m.sites} ${m.sites === 1 ? "toimipaikka" : "toimipaikkaa"}</div><p>${opening()}</p>${state.briefingContext ? `<p class="note-text"><strong>Palaverin lähtötiedot:</strong> ${esc(state.briefingContext)}</p>` : ""}${state.goal ? `<p class="note-text"><strong>Palaverin tavoite:</strong> ${esc(state.goal)}</p>` : ""}`,
    );
    for (const key of order) {
      const card = cards[key];
      html += slide(
        key,
        card.title,
        `<div class="slide-value">${card.value}</div><p>${card.text}</p>${card.visual}<p class="relevance">${esc(globalThis.MeetingModel.relevance(key, state.priority, Boolean(state.goal)))}</p><small>${card.boundary}. Lähde: ${card.source}.</small>`,
      );
    }
    html += slide(
      "opportunity",
      "Tarkistetaan tekstiilien todellinen tarve",
      `<p>${esc(focus.site_name)}: ${f(focus.utilization, 1)} % ${snapshotName()} tilanteen allokoiduista tekstiileistä näkyy aktiivisissa skannauksissa. ${f(focus.unscanned)} tekstiiliä jää ilman skannausta.</p><p>Selvitetään varatekstiilien ja sesongin tarve sekä skannausdatan kattavuus. Havainto ei yksin todista vajaakäyttöä.</p><small>Lähde: Service_Activity, ${snapshotName()}.</small>`,
    );
    html += slide(
      "plan",
      "Yhteinen suunta vuodelle 2026",
      `<ol>${plan()
        .map(([title, note]) => `<li><p>${esc(title)} ${esc(note)}</p></li>`)
        .join(
          "",
        )}</ol>${state.note ? `<p class="note-text">Account managerin muistiinpano: ${esc(state.note)}</p>` : ""}<small>Keskusteluehdotuksia, eivät vielä sovittuja toimenpiteitä.</small>`,
    );
    const { baseline: b, compare: c } = context();
    html += slide(
      "sources",
      "Mihin luvut perustuvat?",
      `<p>Lähde: Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx. Customers, Sites, Service_Activity, Customer_Impacts, Repairs ja Baselines. Jakso ${periodName()}.</p><p>Virrat summataan valitulta jaksolta. Allokointi ja aktiiviset skannaukset ovat ${snapshotName()} lopun tilanne. Korjausten määrä ei tarkoita yksilöllisiä korjattuja tekstiilejä.</p><p>Vesiero: ${f(m.kg, 1)} pestyä kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l. Päästöero: samat pestyt kilot × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e.</p>`,
    );
    html += slide(
      "limits",
      "Tulkinnan rajat",
      "<p>Kaikki asiakasluvut ovat synteettisiä. Vesi ja päästöt ovat lisäksi pesulatasolta allokoituja arvioita. Vertailumalli on havainnollistava vaihtoehto, ei nimetty kilpailija.</p><p>Rajaus kattaa pesun vedenkulutuksen sekä pesun ja toimitusten päästöt, ei koko elinkaarta. Korjausten oletettua kädenjälkeä ei lisätä päästöeroon. Herkkyysväliä ei vielä lasketa.</p><p>Skannausosuus ei todista vajaakäyttöä. Käyttäjämääriä tai euromääräisiä säästöjä ei lasketa puutteellisista lähtötiedoista. Toimialapainotus ei ole compliance-arvio.</p>",
    );
    return html;
  }
  function renderDeck() {
    $("#slides").innerHTML = reviewHtml();
    const slides = [...document.querySelectorAll("#slides .slide")];
    state.slideIndex = Math.max(0, Math.min(state.slideIndex, slides.length - 1));
    slides.forEach((slide, index) => {
      slide.hidden = index !== state.slideIndex;
    });
    const current = slides[state.slideIndex];
    $("#slide-counter").textContent = `Dia ${state.slideIndex + 1} / ${slides.length}`;
    $("#previous-slide").disabled = state.slideIndex === 0;
    $("#next-slide").disabled = state.slideIndex === slides.length - 1;
    $("#edit-slide-title").value = current.querySelector("h3").textContent;
    $("#deck-note").value = state.note;
    $("#slide-outline").innerHTML = slides
      .map(
        (slide, index) =>
          `<button data-slide-index="${index}" aria-current="${index === state.slideIndex ? "step" : "false"}">${index + 1}. ${esc(slide.querySelector("h3").textContent)}</button>`,
      )
      .join("");
    const labels = {
      water: "Vedenkäyttö",
      emissions: "Ilmastovaikutus",
      repairs: "Tekstiilien huolto",
      opportunity: "Kehitysehdotus",
    };
    $("#insight-picker").innerHTML = globalThis.MeetingModel.insightIds
      .map(
        (id) =>
          `<label><input type="checkbox" data-insight="${id}" ${state.included.includes(id) ? "checked" : ""} />${labels[id]}</label>`,
      )
      .join("");
    const empty = state.included.length === 0;
    $("#deck-warning").textContent = empty
      ? "Valitse vähintään yksi nosto ennen vientiä."
      : "Muutokset säilyvät tässä välilehdessä. Otsikoiden muokkaus ei muuta laskettuja lukuja.";
    $("#print").disabled = empty;
    $("#download").disabled = empty;
  }
  $("#goal-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.goal = $("#meeting-goal").value.trim();
    state.briefingContext = $("#meeting-context").value.trim();
    state.priority = globalThis.MeetingModel.goalFocus(state.goal, "neutral").priority;
    saveBrief();
    render();
    status("Katsaus päivitetty palaverin tavoitteen mukaan.");
  });
  function startReview(useDefaults) {
    state.goal = useDefaults ? "" : $("#onboarding-brief").value.trim();
    state.briefingContext = useDefaults ? "" : $("#onboarding-context").value.trim();
    state.priority = globalThis.MeetingModel.goalFocus(state.goal, "neutral").priority;
    state.initialized = true;
    state.view = "summary";
    saveBrief();
    render();
    $("#story h1").tabIndex = -1;
    $("#story h1").focus();
  }
  $("#onboarding-form").addEventListener("submit", (event) => {
    event.preventDefault();
    startReview(false);
  });
  $("#default-review").addEventListener("click", () => startReview(true));
  $("#insight-picker").addEventListener("change", (event) => {
    const id = event.target.dataset.insight;
    if (!id) return;
    state.included = event.target.checked
      ? [...new Set([...state.included, id])]
      : state.included.filter((key) => key !== id);
    renderDeck();
  });
  $("#edit-slide-title").addEventListener("input", (event) => {
    const current = $("#slides .slide:not([hidden])");
    state.titleEdits[current.dataset.slideId] = event.target.value.trim();
    current.querySelector("h3").textContent = event.target.value;
  });
  $("#edit-slide-title").addEventListener("change", renderDeck);
  $("#deck-note").addEventListener("input", (event) => {
    state.note = event.target.value;
    $("#slides").innerHTML = reviewHtml();
    document.querySelectorAll("#slides .slide").forEach((slide, index) => {
      slide.hidden = index !== state.slideIndex;
    });
    const note = $("#meeting-note");
    if (note) note.value = state.note;
  });
  function moveSlide(delta) {
    state.slideIndex += delta;
    renderDeck();
  }
  $("#previous-slide").addEventListener("click", () => moveSlide(-1));
  $("#next-slide").addEventListener("click", () => moveSlide(1));
  $("#slide-outline").addEventListener("click", (event) => {
    const button = event.target.closest("[data-slide-index]");
    if (button) {
      state.slideIndex = Number(button.dataset.slideIndex);
      renderDeck();
    }
  });
  $("#review").addEventListener("keydown", (event) => {
    if (
      event.target.matches("input,textarea,select") ||
      !["ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    moveSlide(event.key === "ArrowRight" ? 1 : -1);
  });
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
  $("#customer").addEventListener("change", (event) => {
    state.customer = event.target.value;
    $("#onboarding-brief").value = "";
    $("#onboarding-context").value = "";
    state.included = [...globalThis.MeetingModel.insightIds];
    state.site = "all";
    state.country = "all";
    state.continent = "all";
    restoreBrief();
    clearScope();
    render();
    status(
      state.initialized
        ? "Avattiin asiakkaan aiemmin aloitettu katsaus."
        : "Kerro ensin palaverin lähtötiedot tai luo oletuskatsaus.",
    );
  });
  for (const id of ["site", "baseline", "priority", "from", "to", "country", "continent"])
    $("#" + id).addEventListener("change", (event) => {
      state[id] = event.target.value;
      if (["country", "continent"].includes(id)) state.site = "all";
      if (id !== "priority") clearScope();
      render();
      renderChat();
      status("Katsaus päivitetty.");
    });
  for (const [form, input] of [["ask-form", "question"]])
    $("#" + form).addEventListener("submit", (event) => {
      event.preventDefault();
      const field = $("#" + input);
      if (field.value.trim()) ask(field.value.trim());
      field.value = "";
    });
  document.addEventListener("input", (event) => {
    if (event.target.id === "meeting-note") state.note = event.target.value;
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
      status("Katsaus rajattu toimipaikkaan " + scopeName());
    }
  });
  $("#open-evidence").addEventListener("click", () => {
    $("#evidence-content").innerHTML = evidenceHtml();
    $("#evidence").showModal();
  });
  $("#open-review").addEventListener("click", () => {
    renderDeck();
    $("#review").showModal();
  });
  $("#print").addEventListener("click", () => window.print());
  $("#download").addEventListener("click", () => {
    const content = `<!doctype html><html lang="fi"><meta charset="utf-8"><title>Asiakkaan vuosikatsaus 2025</title><style>body{font:15px/1.8 Arial;color:#222222}.slide{padding:5vw;margin:3vw;background:#f4f4f4;break-after:page}h3{font:bold 30px Arial}.slide-value{font-size:40px;color:#003f72}small{display:block;font-size:11px;color:#61776f}.note-text{white-space:pre-wrap}.mini-chart{max-width:460px;margin:20px 0}.bar-label{display:flex;justify-content:space-between;font-size:11px}.bar-track{height:9px;background:#e0e8d9;margin:5px 0 12px}.bar-fill{background:#003f72;height:100%}.bar-fill.alt{background:#a9c1d4}.repair-picture{display:none}.repair-bars{display:flex;height:100px;gap:5px;max-width:460px;padding:10px 0 22px}.repair-bars>div{position:relative;flex:1;display:flex;align-items:flex-end}.repair-bars>div>span{display:block;width:100%;background:#578200}.repair-bars small{position:absolute;bottom:-20px;font-size:9px}.repair-bars i{display:none}@media print{.slide{margin:0}.slide:last-child{break-after:auto}}@page{size:A4 landscape}</style>${reviewHtml()}</html>`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.customer}-vuosikatsaus-2025.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("HTML-katsaus ladattu.");
  });
  restoreBrief();
  render();
})();
