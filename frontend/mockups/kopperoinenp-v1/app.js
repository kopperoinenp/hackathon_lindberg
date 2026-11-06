/* Local-only prototype; all figures come from the supplied synthetic workbook. */
(function () {
  "use strict";
  const data = globalThis.REVIEW_DATA;
  const { aggregate, comparison, rankedSites, escapeHtml: esc } = globalThis.ReviewModel;
  const $ = (selector) => document.querySelector(selector);
  const f = (value, digits = 0) =>
    value == null
      ? "Ei tietoa"
      : new Intl.NumberFormat("fi-FI", { maximumFractionDigits: digits }).format(value);
  const priorities = {
    all: "Kokonaiskuva",
    water: "Vesi",
    emissions: "Päästöt",
    circularity: "Kiertotalous",
    efficiency: "Käytön tehokkuus",
  };
  const state = {
    customer: "CUST001",
    site: "all",
    priority: "all",
    baseline: "B_LOCAL",
    view: "overview",
    selected: new Set(["water", "efficiency", "circularity"]),
    notes: {},
    actions: {},
    chat: [],
  };
  let toastTimer;
  function context() {
    const customer = data.customers.find((r) => r.customer_id === state.customer);
    const baseline = data.baselines.find((r) => r.baseline_id === state.baseline);
    const metrics = aggregate(data, state.customer, state.site);
    return {
      customer,
      baseline,
      m: metrics,
      c: comparison(metrics, baseline),
      sites: rankedSites(data, state.customer),
    };
  }
  function scopeName() {
    return state.site === "all"
      ? "Kaikki toimipaikat"
      : data.sites.find((r) => r.site_id === state.site).site_name;
  }
  function baselineName(id = state.baseline) {
    return {
      B_LOCAL: "Paikallinen ulkoistettu pesula",
      B_HOME: "Kotipesu",
      B_INHOUSE: "Asiakkaan oma pesula",
    }[id];
  }
  function toast(text) {
    $("#toast").textContent = text;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
  }
  function allInsights() {
    const { m, c, sites } = context();
    const low = state.site === "all" ? sites[0] : sites.find((r) => r.site_id === state.site);
    return [
      {
        id: "water",
        tag: "YMPÄRISTÖARVO",
        title: `Vedenkulutus on ${f(Math.abs(c.waterPercent), 1)} % ${c.waterDifference >= 0 ? "pienempi" : "suurempi"} kuin vertailumallissa`,
        text: `Ero on ${f(Math.abs(c.waterDifference) / 1000)} m³ vuodessa. Vertailuna ${baselineName().toLowerCase()} samalla pestyllä kilomäärällä. Tulos riippuu valitusta vertailusta.`,
        source: "water",
        kind: "Laskennallinen arvio",
      },
      {
        id: "efficiency",
        tag: "KEHITYSMAHDOLLISUUS",
        title: `${low.site_name.replace(/^(NorthStar|Apex|Mediora) /, "")}: ${f(low.utilization, 1)} % allokoiduista tekstiileistä skannattu`,
        text: `Joulukuussa ${f(low.unscanned)} allokoidulle tekstiilille ei näy aktiivista skannausta. Tarkistakaa varatekstiilit, sesonkitarve ja skannausten kattavuus ennen mitoituksen muuttamista.`,
        source: "efficiency",
        kind: "Selvitettävä havainto",
        amber: true,
      },
      {
        id: "circularity",
        tag: "KIERTOTALOUS",
        title: `${f(m.repairs)} korjausta tukee tekstiilien käyttöiän pidentämistä`,
        text: "Korjausmäärä osoittaa huoltoaktiivisuutta. Se ei yksin kerro vältettyjen hankintojen määrää tai toteutunutta päästövähennystä.",
        source: "repairs",
        kind: "Synteettinen tapahtumamäärä",
      },
      {
        id: "emissions",
        tag: "ILMASTOVAIKUTUS",
        title: `Pesun ja kuljetusten päästöero on ${f(Math.abs(c.emissionsDifference) / 1000, 1)} t CO₂e`,
        text: `Allokoitu pesu- ja toimitusjalanjälki on ${f(m.emissions / 1000, 1)} t CO₂e. Vertailumallin päästöt ovat ${c.emissionsDifference >= 0 ? "suuremmat" : "pienemmät"}. Rajaus ei sisällä tekstiilien koko elinkaarta.`,
        source: "emissions",
        kind: "Allokoitu arvio",
      },
    ];
  }
  function kpi(label, number, unit, footer, source) {
    return `<article class="kpi"><div class="kpi-label">${label}</div><strong>${number}<small>${unit}</small></strong><div class="kpi-footer"><span>${footer}</span><button class="tiny-link" data-source="${source}" aria-label="Näytä lähde: ${label}">Lähde ↗</button></div></article>`;
  }
  function insightCard(item) {
    return `<article class="insight"><div class="insight-top"><span class="label ${item.amber ? "amber" : ""}">${item.tag}</span><button class="select-insight" data-select="${item.id}" aria-pressed="${state.selected.has(item.id)}">${state.selected.has(item.id) ? "✓ Mukana katsauksessa" : "+ Lisää katsaukseen"}</button></div><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><div class="insight-bottom"><span>${item.kind}</span><button class="text-button" data-source="${item.source}">Katso perustelu ↗</button></div></article>`;
  }
  function comparisonPanel() {
    const { m, c } = context();
    const emissions = state.priority === "emissions";
    const actual = emissions ? m.emissions / 1000 : m.water / 1000;
    const alternative = emissions ? c.baselineEmissions / 1000 : c.baselineWater / 1000;
    const difference = emissions ? c.emissionsPercent : c.waterPercent;
    const max = Math.max(actual, alternative, 1),
      unit = emissions ? "t CO₂e" : "m³";
    return `<section class="panel"><div class="section-heading"><h2>${emissions ? "Päästöjen" : "Vedenkulutuksen"} vertailu</h2><span class="label neutral">ARVIO</span></div><label class="baseline-label" for="baseline">Vertailumalli<select id="baseline" class="baseline-select">${data.baselines.map((r) => `<option value="${r.baseline_id}" ${state.baseline === r.baseline_id ? "selected" : ""}>${baselineName(r.baseline_id)}</option>`).join("")}</select></label><div class="comparison-hero">${difference >= 0 ? "−" : "+"}${f(Math.abs(difference), 1)} %</div><p class="comparison-copy">${emissions ? "Pesun ja toimitusten allokoidut päästöt" : "Pesun allokoitu vedenkulutus"} suhteessa valittuun malliin.</p><div class="bar-label"><span>Lindströmin palvelumalli</span><strong>${f(actual)} ${unit}</strong></div><div class="bar-track"><div class="bar" style="width:${(actual / max) * 100}%"></div></div><div class="bar-label"><span>${baselineName()}</span><strong>${f(alternative)} ${unit}</strong></div><div class="bar-track"><div class="bar baseline" style="width:${(alternative / max) * 100}%"></div></div><p class="comparison-footnote">Sama pesty kilomäärä, eri oletukset. Kaikki luvut ovat synteettisiä. Vertailu ei kuvaa nimettyä kilpailijaa. <button class="text-button" data-source="${emissions ? "emissions" : "water"}">Näytä laskenta</button></p></section>`;
  }
  function sitesPanel() {
    const sites = context().sites;
    const shown =
      state.site === "all" ? sites.slice(0, 5) : sites.filter((r) => r.site_id === state.site);
    return `<section class="panel"><div class="section-heading"><h2>Mistä kannattaa keskustella?</h2><small>${state.site === "all" ? `5 pienintä skannausosuutta · ${sites.length} toimipaikkaa` : "Valittu toimipaikka"}</small></div><p class="panel-intro">Avaa toimipaikka tarkasteluun. Skannausosuus on selvityksen lähtökohta, ei suora mittari vajaakäytölle.</p><div class="table-wrap"><table class="site-table"><thead><tr><th>Toimipaikka</th><th>Skannausosuus, joulukuu</th><th>Allokoidut tekstiilit</th><th>Vesi / vuosi</th><th></th></tr></thead><tbody>${shown.map((s) => `<tr><td><button class="site-name" data-site="${s.site_id}">${esc(s.site_name)}</button></td><td><span class="meter"><i style="width:${Math.min(s.utilization || 0, 100)}%"></i></span>${f(s.utilization, 1)} %</td><td>${f(s.allocated)}</td><td>${f(s.water / 1000)} m³</td><td><button class="text-button" data-site="${s.site_id}" aria-label="Avaa ${esc(s.site_name)}">Avaa ↗</button></td></tr>`).join("")}</tbody></table></div></section>`;
  }
  function overview() {
    const { m } = context();
    const items = allInsights()
      .sort((a, b) => Number(b.id === state.priority) - Number(a.id === state.priority))
      .slice(0, 3);
    return `<div class="section-heading"><h2>Vuosi yhdellä silmäyksellä</h2><small>2025 · ${esc(scopeName())}</small></div><section class="kpis" aria-label="Vuoden tunnusluvut">${kpi("Tekstiilejä allokoitu", f(m.allocated), "kpl", "Joulukuun tilanne", "efficiency")}${kpi("Pesuun käytetty vesi", f(m.water / 1000), "m³", "Allokoitu vuosiarvio", "water")}${kpi("Korjauksia vuoden aikana", f(m.repairs), "kpl", "Synteettinen määrä", "repairs")}${kpi("Pesun ja toimitusten päästöt", f(m.emissions / 1000, 1), "t CO₂e", "Allokoitu vuosiarvio", "emissions")}</section><div class="dashboard-grid"><section class="panel insight-panel"><div class="section-heading"><h2>Nostot asiakaskeskusteluun</h2><span class="count">${state.selected.size} valittu</span></div><p class="panel-intro">Valitse asiakkaalle tärkeät havainnot mukaan katsaukseen.</p>${items.map(insightCard).join("")}</section><div>${comparisonPanel()}<section class="assistant-card"><div class="eyebrow">OMA NÄKÖKULMA, SAMA DATA</div><h3>Entä jos asiakasta kiinnostaa jokin muu?</h3><p>Kysy perusteluja, vaihda painopistettä tai pyydä keskustelukysymys ensi vuodelle.</p><button data-assistant>Avaa keskustelu ↗</button><small>Simuloitu apuri · Ei ulkoista AI-yhteyttä</small></section></div></div>${sitesPanel()}`;
  }
  function future() {
    const { sites, customer } = context();
    const low = state.site === "all" ? sites[0] : sites.find((r) => r.site_id === state.site);
    const plans = [
      [
        "Mitoitus",
        "Tarkistakaa tekstiilien todellinen tarve",
        `Aloittakaa toimipaikasta ${low.site_name}. Skannausosuus on ${f(low.utilization, 1)} %. Selvittäkää varatekstiilit, sesonkitarve ja skannausten kattavuus yhdessä asiakkaan kanssa.`,
      ],
      [
        "Vesi",
        "Sopikaa yhteinen vesitehokkuuden tavoite",
        "Tarkistakaa pesutiheys ja hygieniavaatimukset. Tavoite ja mahdollinen säästö arvioidaan yhdessä. Aineisto ei yksin osoita turvallista pesutiheyden muutosta.",
      ],
      [
        "Seuranta",
        "Tehkää vaikutukset näkyviksi",
        "Sopikaa vertailumalli ja tarvittavat tiedot kustannuksista sekä käyttäjistä. Seuratkaa korjauksia ja käyttöä ennen vältettyjen hankintojen arviointia.",
      ],
    ];
    return `<section class="plan-intro"><div class="eyebrow">YHTEINEN SUUNTA VUODELLE 2026</div><h2>Havainnoista sovituiksi teoiksi</h2><p>${esc(customer.customer_name)} · ${esc(scopeName())}. Nämä ovat keskusteluehdotuksia. Sopikaa vastuuhenkilö ja seuraava askel asiakkaan kanssa.</p></section><div class="plan-grid">${plans
      .map(([key, title, text], i) => {
        const action = state.actions[key] || {};
        return `<article class="panel"><div class="plan-number">0${i + 1}</div><span class="label ${i === 0 ? "amber" : ""}">${key.toUpperCase()}</span><h3 style="margin-top:15px">${title}</h3><p>${esc(text)}</p><label for="owner-${i}">Vastuuhenkilö</label><input id="owner-${i}" data-action="${key}" data-field="owner" value="${esc(action.owner || "")}" placeholder="Sovitaan palaverissa" maxlength="100" /><label for="next-${i}">Seuraava askel</label><textarea id="next-${i}" data-action="${key}" data-field="next" maxlength="800" placeholder="Kirjaa yhdessä sovittu toimenpide…">${esc(action.next || "")}</textarea></article>`;
      })
      .join(
        "",
      )}</div><div class="notice">Euromääräistä säästöpotentiaalia ei ole laskettu: hyväksytyt hinta-, työaika- ja hankintatiedot puuttuvat. Kirjaukset säilyvät tässä välilehdessä ja sisältyvät katsaukseen. Sivun päivitys tyhjentää ne.</div>`;
  }
  function sources() {
    return `<div class="section-heading"><h2>Jokaiselle nostolle on oltava perustelu</h2><span class="label amber">SYNTEETTINEN AINEISTO</span></div><p class="panel-intro">Luvut on laskettu annetusta Excel-paketista. Ne eivät ole Lindströmin tai asiakkaan todellisia, auditoituja tuloksia.</p><div class="source-grid"><section class="panel"><h3>Käytetyt aineistot</h3><div class="source-file">${esc(data.source)}</div><ul class="method-list"><li>Customers ja Sites: asiakkaat, toimiala ja toimipaikat.</li><li>Service_Activity: pestyt kilot, joulukuun allokointi ja aktiiviset skannaukset.</li><li>Customer_Impacts: veden ja päästöjen asiakaskohtaiset allokaatiot.</li><li>Repairs: korjausten määrä.</li><li>Baselines: kolme havainnollistavaa pesumallia.</li></ul></section><section class="panel"><h3>Laskenta ja rajaus</h3><ul class="method-list"><li>Vuosivirrat summataan tammi–joulukuulta 2025. Varantomäärät otetaan vain joulukuulta.</li><li>Vesi: Σ allocated_water_l. Päästöt: Σ allocated_process_kgco2e + allocated_delivery_kgco2e.</li><li>Vertailu: samat pestyt kilot × valitun mallin kerroin.</li><li>Skannausosuus: joulukuun aktiiviset skannaukset / allokointi. Ei varmennettu käyttöaste.</li><li>Korjaukset esitetään määränä. Niiden kädenjälkeä ei lisätä pesun ja kuljetusten päästöeroon.</li></ul></section><section class="panel"><h3>Mitä ei vielä tiedetä?</h3><ul class="method-list"><li>Yksilöllisten käyttäjien määrä: tuoterivejä ei voi luotettavasti deduplikoida.</li><li>Kustannus- ja työaikasäästöt: hyväksytyt lähtötiedot puuttuvat.</li><li>Kilpailijavertailu: ei nimettyjen kilpailijoiden todennettua dataa.</li><li>Skannaamatta jääneet tekstiilit voivat olla varalla, sesonkikäytössä tai puuttua skannausdatasta.</li><li>Vertailukertoimille ei ole tässä mockissa herkkyysmallia.</li></ul></section><section class="panel"><h3>Mockin toimintarajat</h3><ul class="method-list"><li>AI-apuri on paikallinen sääntöpohjainen simulaatio.</li><li>Kolme asiakasta ja 34 toimipaikkaa ovat kuvitteellisia.</li><li>Ei tiedostojen lähetystä, kirjautumista tai tallennuspalvelua.</li><li>Katsauksen voi tulostaa PDF:ksi tai ladata HTML:nä. PowerPoint-vientiä ei vielä ole.</li><li>Julkisia yritysfaktoja ei käytetä laskentakertoimina.</li></ul></section></div>`;
  }
  function render() {
    const { customer } = context();
    $("#industry").textContent = {
      "Food & Beverage": "Elintarviketeollisuus",
      Manufacturing: "Valmistava teollisuus",
      Healthcare: "Terveydenhuolto",
    }[customer.industry];
    $("#priorities").innerHTML = Object.entries(priorities)
      .map(
        ([key, label]) =>
          `<button class="chip ${state.priority === key ? "selected" : ""}" data-priority="${key}" aria-pressed="${state.priority === key}">${label}</button>`,
      )
      .join("");
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.view === state.view);
      if (tab.dataset.view === state.view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    $("#view").innerHTML = { overview, future, sources }[state.view]();
    $("#chat-context").textContent =
      `${customer.customer_name} · ${scopeName()} · 2025 · ${priorities[state.priority]}`;
  }
  function refreshSites() {
    $("#site").innerHTML =
      '<option value="all">Kaikki toimipaikat</option>' +
      data.sites
        .filter((r) => r.customer_id === state.customer)
        .map((r) => `<option value="${r.site_id}">${esc(r.site_name)}</option>`)
        .join("");
    $("#site").value = state.site;
  }
  function showSource(type) {
    const { m, baseline: b, c } = context();
    const details = {
      water: [
        "Vedenkulutus ja vertailu",
        `Customer_Impacts → allocated_water_l. Vuoden allokoitu kulutus on ${f(m.water)} litraa. Vertailu: ${baselineName()}.`,
        `${f(m.kg, 1)} kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l`,
        "Synteettinen allokoitu arvio. Pesulatason kulutus kohdistetaan pestyjen kilojen osuudella. Kerroin on havainnollistava, ei kilpailijan mitattu tulos. Rajaus: pesun vedenkulutus.",
      ],
      emissions: [
        "Pesun ja toimitusten päästöt",
        `Customer_Impacts → allocated_process_kgco2e + allocated_delivery_kgco2e. Summa ${f(m.emissions)} kg CO₂e.`,
        `${f(m.kg, 1)} kg × (${f(b.process_kgco2e_per_kg, 3)} + ${f(b.delivery_kgco2e_per_kg, 3)}) kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e`,
        "Synteettinen allokoitu arvio. Rajaus kattaa pesun ja toimitukset, ei valmistusta tai koko elinkaarta. Korjausten oletettu kädenjälki on jätetty pois päällekkäisten väitteiden välttämiseksi.",
      ],
      efficiency: [
        "Allokointi ja skannausosuus",
        "Service_Activity → allocated_pieces ja active_assets_scanned, vain joulukuu 2025. Tuoterivit summataan valitulle asiakkaalle ja toimipaikalle.",
        `${f(m.scanned)} aktiivista skannausta / ${f(m.allocated)} allokoitua tekstiiliä × 100 = ${f(m.utilization, 1)} %`,
        "Synteettinen johdettu osuus. Skannaamatta jäänyt tekstiili ei välttämättä ole tarpeeton. Puutteet ja varatekstiilit tarkistetaan ennen suositusta. Aktiivisia käyttäjiä ei summata ilman yksilöivää avainta.",
      ],
      repairs: [
        "Korjaustoiminta",
        "Repairs → repair_count. Kaikki korjaustyypit ja tuoterivit summataan vuodelta 2025.",
        `Σ repair_count = ${f(m.repairs)} korjausta`,
        "Synteettinen tapahtumamäärä, ei yksilöllisten korjattujen tekstiilien määrä. Oletus yhdestä vältetystä hankinnasta per korjaus on epävarma. Sitä ei käytetä mockin säästöväitteissä.",
      ],
    };
    const [title, description, formula, limitation] = details[type];
    $("#source-title").textContent = title;
    $("#source-content").innerHTML =
      `<span class="label amber">SYNTEETTINEN · ${esc(scopeName())}</span><p class="source-detail" style="margin-top:20px">${esc(description)}</p><div class="formula">${esc(formula)}</div><p class="source-detail">${esc(limitation)}</p><div class="source-file">${esc(data.source)}<br />${state.customer} · ${state.site} · 1.1.–31.12.2025</div>`;
    $("#source-dialog").showModal();
  }
  function chatReply(prompt) {
    const { m, c, sites } = context(),
      text = prompt.toLowerCase();
    if (/painota|keskity|korosta/.test(text)) {
      const key = /päästö|ilmasto/.test(text)
        ? "emissions"
        : /ve[st]|vesi/.test(text)
          ? "water"
          : /korj|kierto/.test(text)
            ? "circularity"
            : /käyt|teho/.test(text)
              ? "efficiency"
              : null;
      if (key) {
        state.priority = key;
        render();
        return `Vaihdoin painopisteeksi: ${priorities[key]}. Voit valita teeman noston katsaukseen. Lähdeluvut eivät muuttuneet.`;
      }
    }
    if (/ve[st]|vesi/.test(text))
      return `Vedenkulutus on ${f(m.water / 1000)} m³. Vertailussa (${baselineName()}) samat ${f(m.kg)} pestyä kiloa kerrotaan mallin l/kg-kertoimella. Ero on ${f(c.waterDifference / 1000)} m³. Lähteet: Customer_Impacts, Service_Activity ja Baselines. Kyseessä on synteettinen allokoitu arvio. Tarkka laskenta löytyy noston perustelusta.`;
    if (/päästö|ilmasto|co2|co₂/.test(text))
      return `Pesun ja toimitusten allokoidut päästöt: ${f(m.emissions / 1000, 1)} t CO₂e. Ero vertailuun: ${f(c.emissionsDifference / 1000, 1)} t CO₂e. Malli: ${baselineName()}. Lähde: Customer_Impacts ja Baselines. Tekstiilien valmistus ja korjausten oletettu kädenjälki eivät sisälly rajaukseen.`;
    if (/hinta|euro|kustan|kilpail/.test(text))
      return "Aineistossa ei ole hyväksyttyjä hinta- ja työaikatietoja eikä nimettyjen kilpailijoiden tuloksia. Niistä ei voi muodostaa säästöväitettä. Vertailumallit ovat synteettisiä pesuskenaarioita. Tarvitaan vastaavat kustannustiedot ja vertailun yhteinen rajaus.";
    if (/korja|kierto/.test(text))
      return `Korjauksia oli ${f(m.repairs)}. Lähde: Repairs.repair_count. Tämä ei ole yksilöllisten korjattujen tekstiilien määrä. Korjauksesta vältettyyn hankintaan tarvitaan erillinen oletus ja validointi. Siksi korjausten päästösäästöä ei tässä väitetä.`;
    if (/ensi|paran|käyt|teho|kysym|ehdot/.test(text)) {
      const low = state.site === "all" ? sites[0] : sites.find((r) => r.site_id === state.site);
      return `Keskusteluehdotus: miksi toimipaikan ${low.site_name} joulukuun skannausosuus on ${f(low.utilization, 1)} %? Tarkistakaa varatekstiilit, sesonkitarve ja datan kattavuus. Sopikaa vasta sen jälkeen mitoituksen mahdollinen muutos ja vastuuhenkilö. Tämä on selvitysehdotus, ei laskettu kustannussäästö.`;
    }
    return "Tämä apuri on rajattu mock. Voin perustella veden ja päästöjen laskentaa, kertoa korjauksista tai ehdottaa käytön tarkistusta. Kirjoita esimerkiksi ”painota päästöjä”. Ulkoista AI-palvelua ei ole kytketty.";
  }
  function renderChat() {
    $("#chat-messages").innerHTML = state.chat.length
      ? state.chat
          .map(
            (msg) =>
              `<p class="message ${msg.role === "user" ? "user" : ""}">${esc(msg.text)}</p>${msg.role === "assistant" ? `<button class="message-action" data-add-note="${msg.id}">Lisää katsauksen muistiinpanoksi</button>` : ""}`,
          )
          .join("")
      : '<p class="message">Käydään havainnot läpi. Kysy mistä luku muodostuu tai pyydä uusi painopiste.</p>';
    $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
  }
  function sendPrompt(prompt) {
    state.chat.push({ role: "user", text: prompt, id: state.chat.length });
    const reply = chatReply(prompt);
    state.chat.push({ role: "assistant", text: reply, id: state.chat.length });
    renderChat();
  }
  function openAssistant() {
    renderChat();
    $("#assistant-dialog").showModal();
  }
  function reviewHtml(editable = true) {
    const { customer, m } = context();
    const selected = allInsights().filter((r) => state.selected.has(r.id));
    let number = 1;
    const slide = (title, body) =>
      `<section class="slide"><div class="slide-label">LINDSTRÖM · ASIAKASKATSAUS 2025 · ${String(number++).padStart(2, "0")}</div><h3>${esc(title)}</h3>${body}<small>Synteettinen prototyyppi · ${esc(scopeName())} · Vertailu: ${baselineName()}</small></section>`;
    let html = slide(
      customer.customer_name,
      `<p>Vuosipalaveri 2025 ja yhteinen suunta vuodelle 2026</p><div class="slide-value">${f(m.sites)} toimipaikkaa</div><p>${f(m.allocated)} allokoitua tekstiiliä joulukuussa. ${f(m.repairs)} korjausta vuoden aikana.</p><small>Aineisto: ${esc(data.source)}. Havainnollistava asiakas.</small>`,
    );
    for (const item of selected)
      html += slide(
        item.title,
        `<p>${esc(item.text)}</p><small>${item.kind} · Lähde: ${item.source === "repairs" ? "Repairs" : item.source === "efficiency" ? "Service_Activity" : "Customer_Impacts, Service_Activity, Baselines"}</small>${editable ? `<label class="sr-only" for="note-${item.id}">Muistiinpano: ${esc(item.title)}</label><textarea id="note-${item.id}" data-note="${item.id}" placeholder="Lisää oma keskustelumuistiinpano…" maxlength="1600">${esc(state.notes[item.id] || "")}</textarea>` : `<p class="print-note">${esc(state.notes[item.id] || "")}</p>`}`,
      );
    const actions = Object.entries(state.actions).filter(([, a]) => a.owner || a.next);
    html += slide(
      "Yhteinen suunnitelma vuodelle 2026",
      actions.length
        ? actions
            .map(
              ([key, a]) =>
                `<p><strong>${esc(key)}</strong><br />${esc(a.next || "Seuraava askel sovitaan palaverissa.")}<br />Vastuuhenkilö: ${esc(a.owner || "Sovitaan")}</p>`,
            )
            .join("")
        : "<p>Tarkistetaan tekstiilien tarve ja skannausdatan kattavuus. Sovitaan tavoitteet, vastuuhenkilöt ja seuraava seurantapalaveri yhdessä.</p><small>Keskusteluehdotus. Toimenpiteitä ei ole vielä sovittu.</small>",
    );
    for (const [key, note] of Object.entries(state.notes))
      if (key.startsWith("chat-"))
        html += slide(
          "Account managerin keskustelumuistiinpano",
          `<p class="print-note">${esc(note)}</p><small>Simuloidun apurin ehdotus. Tarkistettava ennen asiakaskäyttöä.</small>`,
        );
    html += slide(
      "Lähteet ja tulkinnan rajat",
      `<p>${esc(data.source)}. Customers, Sites, Service_Activity, Repairs, Customer_Impacts ja Baselines. Jakso 1.1.–31.12.2025.</p><p>Virrat summataan koko vuodelta. Allokointi ja skannausosuus ovat joulukuun tilanne. Vesi ja päästöt ovat pesulatasolta allokoituja arvioita.</p><p>Vertailu: samat pestyt kilot × valitun pesumallin synteettinen kerroin. Ei nimettyä kilpailijaa. Päästörajaus on pesu ja toimitukset, ei koko elinkaari. Korjausten kädenjälkeä ei lisätä päästöeroon. Ei auditoituja asiakasväitteitä.</p><p>Skannausosuus ei todista vajaakäyttöä. Käyttäjämääriä, euromääräisiä säästöjä tai epävarmuusväliä ei lasketa.</p>`,
    );
    return html;
  }
  function openReview() {
    $("#review-content").innerHTML = reviewHtml();
    $("#review-dialog").showModal();
  }
  function downloadReview() {
    const title = context().customer.customer_name;
    const content = `<!doctype html><html lang="fi"><meta charset="utf-8"><title>${esc(title)} — vuosikatsaus</title><style>body{font:16px/1.7 Arial;color:#183340;background:#edf1ec}.slide{background:white;padding:5vw;margin:3vw;break-after:page}h3{font:32px Georgia}.slide-label,small{display:block;font-size:12px;color:#52766b}.slide-value{font-size:40px}.print-note{white-space:pre-wrap}@media print{.slide{margin:0;break-inside:avoid}.slide:last-child{break-after:auto}}@page{size:A4 landscape}</style>${reviewHtml(false)}</html>`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.customer}-katsaus-2025.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("HTML-katsaus ladattu.");
  }
  function clearScopeNotes() {
    state.chat = [];
    state.notes = {};
    state.actions = {};
  }
  $("#customer").innerHTML = data.customers
    .map((r) => `<option value="${r.customer_id}">${esc(r.customer_name)}</option>`)
    .join("");
  $("#customer").addEventListener("change", (e) => {
    state.customer = e.target.value;
    state.site = "all";
    clearScopeNotes();
    state.selected = new Set(["water", "efficiency", "circularity"]);
    refreshSites();
    render();
    toast("Asiakas vaihdettu. Keskustelu ja muistiinpanot aloitettiin uudelleen.");
  });
  $("#site").addEventListener("change", (e) => {
    state.site = e.target.value;
    clearScopeNotes();
    render();
  });
  $("#prepare-review").addEventListener("click", openReview);
  $("#open-assistant").addEventListener("click", openAssistant);
  $("#download-review").addEventListener("click", downloadReview);
  $("#print-review").addEventListener("click", () => {
    $("#review-content").innerHTML = reviewHtml(false);
    window.print();
    $("#review-content").innerHTML = reviewHtml();
  });
  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#chat-input");
    if (input.value.trim()) sendPrompt(input.value.trim());
    input.value = "";
  });
  document.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button.dataset.view) {
      state.view = button.dataset.view;
      render();
    }
    if (button.dataset.priority) {
      state.priority = button.dataset.priority;
      render();
    }
    if (button.dataset.source) showSource(button.dataset.source);
    if (button.dataset.select) {
      const key = button.dataset.select;
      if (state.selected.has(key)) state.selected.delete(key);
      else state.selected.add(key);
      render();
    }
    if (button.dataset.site) {
      state.site = button.dataset.site;
      clearScopeNotes();
      refreshSites();
      render();
    }
    if (button.hasAttribute("data-assistant")) openAssistant();
    if (button.dataset.close) document.getElementById(button.dataset.close).close();
    if (button.dataset.prompt) sendPrompt(button.dataset.prompt);
    if (button.hasAttribute("data-add-note")) {
      const msg = state.chat.find((r) => r.id === Number(button.dataset.addNote));
      state.notes[`chat-${msg.id}`] = msg.text;
      toast("Vastaus lisätty katsauksen muistiinpanoksi.");
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "baseline") {
      state.baseline = e.target.value;
      clearScopeNotes();
      render();
    }
  });
  document.addEventListener("input", (e) => {
    const field = e.target;
    if (field.dataset.note) state.notes[field.dataset.note] = field.value;
    if (field.dataset.action) {
      state.actions[field.dataset.action] ||= {};
      state.actions[field.dataset.action][field.dataset.field] = field.value;
    }
  });
  refreshSites();
  render();
})();
