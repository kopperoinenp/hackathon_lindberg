(function () {
  "use strict";
  const data = globalThis.REVIEW_DATA;
  const { escapeHtml: esc } = globalThis.ReviewModel;
  const { storyContext, defaultPriority } = globalThis.StoryModel;
  const $ = (query) => document.querySelector(query);
  const f = (number, digits = 0) =>
    new Intl.NumberFormat("fi-FI", { maximumFractionDigits: digits }).format(number);
  const state = {
    customer: "CUST001",
    site: "all",
    baseline: "B_LOCAL",
    priority: "water",
    note: "",
    chat: [],
  };
  let statusTimer;
  const context = () => storyContext(data, state);
  const baselineName = () =>
    ({
      B_LOCAL: "paikallinen ulkoistettu pesula",
      B_HOME: "kotipesu",
      B_INHOUSE: "asiakkaan oma pesula",
    })[state.baseline];
  const scopeName = () => (state.site === "all" ? "Kaikki toimipaikat" : context().focus.site_name);
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
        unit: "korjausta vuoden aikana",
        title: "Korjaaminen tukee pidempää käyttöä",
        text: "Tekstiilejä huollettiin korjaamalla. Määrä kertoo korjaustoiminnasta; vältettyjä hankintoja tai päästöjä siitä ei suoraan päätellä.",
        visual: `<div class="repair-picture" aria-hidden="true">${"<span></span>".repeat(6)}</div>`,
        source: "Repairs",
        boundary: "Synteettinen tapahtumamäärä · ei yksilöllisiä tekstiilejä",
      },
    };
  }
  function opening() {
    return {
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
  function render() {
    const { customer, metrics: m, focus, sites, order } = context();
    const shortName = { CUST001: "NorthStarin", CUST002: "Apexin", CUST003: "Medioran" }[
      state.customer
    ];
    const cards = results();
    $("#story").innerHTML =
      `<section class="intro"><span class="section-kicker">VUOSIPALAVERIN VALMISTELU</span><h1>${shortName} vuosi 2025.<br />Mitä saatiin aikaan?</h1><p>${opening()}</p><div class="scope"><strong>${esc(scopeName())}</strong> · ${m.sites} ${m.sites === 1 ? "toimipaikka" : "toimipaikkaa"} · Vertailu: ${baselineName()}</div></section><section class="story-section" aria-labelledby="results-title"><div class="section-heading"><span class="section-number">01</span><h2 id="results-title">Vuoden tärkeimmät tulokset</h2></div><div class="results">${order
        .map((key) => {
          const card = cards[key];
          return `<article class="result"><div class="result-name">${card.name}</div><div class="result-value">${card.value}</div><span class="result-unit">${card.unit}</span>${card.visual}<h3>${card.title}</h3><p>${card.text}</p><small>${card.boundary}</small></article>`;
        })
        .join(
          "",
        )}</div><p class="quiet">Synteettinen aineisto. Vertailu kuvaa vaihtoehtoista pesumallia samalla pestyllä määrällä, ei nimettyä kilpailijaa.</p></section><section class="story-section" aria-labelledby="opportunity-title"><div class="section-heading"><span class="section-number">02</span><h2 id="opportunity-title">Tärkein asia selvitettäväksi</h2></div><div class="opportunity"><div><span class="section-kicker">${esc(focus.site_name)}</span><h3>Vastaako tekstiilien määrä todellista tarvetta?</h3><p>${f(focus.unscanned)} allokoidulle tekstiilille ei näy aktiivista skannausta joulukuussa. Aloitetaan tästä toimipaikasta ja tarkistetaan tilanne yhdessä asiakkaan kanssa.</p></div><div class="opportunity-visual"><div class="ratio">${f(focus.utilization, 0)} %<span>tekstiileistä skannattu</span></div><div class="ratio-track" role="img" aria-label="${f(focus.utilization, 1)} prosenttia joulukuun allokoiduista tekstiileistä skannattu"><span style="width:${Math.min(focus.utilization, 100)}%"></span></div><div class="ratio-legend"><small>${f(focus.scanned)} skannattu</small><small>${f(focus.unscanned)} ilman skannausta</small></div><div class="ratio-caption">Skannaustieto ei yksin osoita vajaakäyttöä. Taustalla voi olla esimerkiksi varatekstiilejä, sesonkitarvetta tai puuttuvaa dataa.</div></div></div><details class="site-details"><summary>Katso myös muut toimipaikat</summary><div class="table-wrap"><table><thead><tr><th>Toimipaikka</th><th>Skannattu joulukuussa</th><th>Allokoituja tekstiilejä</th></tr></thead><tbody>${sites.map((site) => `<tr><td><button class="site-link" data-site="${site.site_id}">${esc(site.site_name)}</button></td><td>${f(site.utilization, 1)} %</td><td>${f(site.allocated)}</td></tr>`).join("")}</tbody></table></div><p class="quiet">Avaa toimipaikka nähdäksesi sen oman katsauksen. Palaa kokonaisuuteen pyytämällä apurilta ”näytä kaikki toimipaikat”.</p></details></section><section class="story-section" aria-labelledby="next-title"><div class="section-heading"><span class="section-number">03</span><h2 id="next-title">Yhteinen suunta ensi vuodelle</h2></div><div class="next-chapter"><div><h3>Yksi hyvä parannus<br />kerrallaan.</h3><p>Ota palaveriin mukaan selkeä keskustelunavaus. Nämä ovat ehdotuksia, joista sovitaan asiakkaan kanssa.</p></div><ol class="next-steps">${plan()
        .map(([title, note]) => `<li>${esc(title)}<small>${esc(note)}</small></li>`)
        .join(
          "",
        )}</ol></div><details class="notes-details" ${state.note ? "open" : ""}><summary>Lisää oma muistiinpano esitykseen</summary><label for="meeting-note" class="sr-only">Oma palaverimuistiinpano</label><textarea id="meeting-note" maxlength="2000" placeholder="Esimerkiksi asiakkaan tavoite tai palaverissa sovittu seuraava askel…">${esc(state.note)}</textarea><p class="quiet">Muistiinpano säilyy tässä välilehdessä. Asiakkaan, toimipaikan tai vertailun vaihtaminen tyhjentää sen.</p></details></section>`;
    // Keep the manual fallback inside the assistant, away from the main story.
    $("#site").innerHTML =
      '<option value="all">Kaikki toimipaikat</option>' +
      data.sites
        .filter((r) => r.customer_id === state.customer)
        .map((r) => `<option value="${r.site_id}">${esc(r.site_name)}</option>`)
        .join("");
    $("#site").value = state.site;
    $("#baseline").value = state.baseline;
    $("#priority").value = state.priority;
    $("#customer").value = customer.customer_id;
  }
  function evidenceHtml() {
    const { metrics: m, compare: c, baseline: b, customer } = context();
    return `<p class="quiet">${esc(customer.customer_name)} · ${esc(scopeName())} · 1.1.–31.12.2025</p><p class="quiet">Kaikki asiakasluvut ovat synteettisiä. Veden ja päästöjen luvut ovat lisäksi laskennallisia, pesulatasolta kohdistettuja arvioita.</p><section class="method-section"><h3>Vertailu: ${baselineName()}</h3><p>Sama pesty kilomäärä, eri vedenkulutus- ja päästökertoimet. Vaihtoehdot ovat havainnollistavia pesumalleja, eivät nimettyjen kilpailijoiden mitattuja tuloksia.</p><div class="formula">Vesiero: ${f(m.kg, 1)} kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l<br />Päästöero: ${f(m.kg, 1)} kg × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e</div><p>Rajaus on pesun vedenkulutus sekä pesun ja toimitusten päästöt, ei tekstiilien koko elinkaari. Pyöristetyt luvut näytetään katsauksessa. Vertailukertoimien herkkyysvaihtelut eivät vielä sisälly mockiin.</p></section><section class="method-section"><h3>Lähteet ja laskenta</h3><p>Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx, repositorion data/source-kansiossa.</p><ul><li>Customers ja Sites: kuvitteellinen asiakkuus ja toimipaikat.</li><li>Service_Activity: vuosittaiset pestyt kilot sekä joulukuun allokointi ja skannaukset.</li><li>Customer_Impacts: allocated_water_l, allocated_process_kgco2e ja allocated_delivery_kgco2e, summat koko vuodelta.</li><li>Repairs: korjaustapahtumien summa koko vuodelta. Ei yksilöllisten tekstiilien määrä.</li><li>Baselines: valitun vertailumallin kertoimet.</li></ul></section><section class="method-section"><h3>Mitä tuloksista ei voi päätellä?</h3><ul><li>Skannausosuus ei osoita tekstiilien todellista vajaakäyttöä. Se on tarkistettava havainto.</li><li>Korjaus ei automaattisesti tarkoita vältettyä hankintaa. Korjausten oletettua päästökädenjälkeä ei lasketa yhteen pesun päästöeron kanssa.</li><li>Käyttäjiä ei summata tuoteriveiltä ilman yksilöivää avainta.</li><li>Kustannussäästöihin, palvelupyyntöjen ratkaisuun ja sääntelyväitteisiin ei ole tässä riittäviä lähtötietoja.</li><li>Toimialan mukainen painotus on muokattava ehdotus, ei compliance-arvio.</li></ul></section>`;
  }
  function clearScope() {
    state.note = "";
    state.chat = [];
  }
  function reply(question) {
    const text = question.toLocaleLowerCase("fi");
    let change = "";
    if (/lisää (esitykseen|katsaukseen|muistiinpano)/.test(text)) {
      state.note = question.replace(
        /^.*?lisää (?:esitykseen|katsaukseen|muistiinpano(?:ksi)?)[\s:]+/i,
        "",
      );
      render();
      return "Lisäsin tekstin esityksen muistiinpanoksi. Se näkyy Yhteinen suunta ensi vuodelle -osiossa ja esityksen esikatselussa.";
    }
    if (/näytä|keskity|painota|vaihda|vertaa|tarkastele/.test(text)) {
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
        clearScope();
        change = "Näytän jälleen koko asiakkuuden.";
      } else if (site) {
        state.site = site.site_id;
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
    if (/vesi|veden|vesis|veteen/.test(text))
      return `Pesuun kohdistettu vedenkulutus on ${f(m.water / 1000)} m³. Samat ${f(m.kg)} pestyä kiloa kerrotaan vertailumallin l/kg-kertoimella. Ero on ${f(c.waterDifference / 1000)} m³. Vertailu: ${baselineName()}. Tämä on synteettinen arvio. Lähteet: Service_Activity, Customer_Impacts ja Baselines.`;
    if (/päästö|ilmasto/.test(text))
      return `Pesun ja toimitusten päästöarvio on ${f(m.emissions / 1000, 1)} t CO₂e. Ero vertailumalliin on ${f(c.emissionsDifference / 1000, 1)} t CO₂e. Lähteet: Customer_Impacts ja Baselines. Tekstiilien valmistus ja korjausten oletettu kädenjälki eivät sisälly rajaukseen.`;
    if (/korj|kierto/.test(text))
      return `Aineistossa on ${f(m.repairs)} korjaustapahtumaa. Lähde: Repairs.repair_count. Määrä ei kerro yksilöllisiä korjattuja tekstiilejä eikä sellaisenaan vältettyjä hankintoja. Siksi korjausten päästösäästöä ei tässä väitetä.`;
    if (/käyt|paran|ensi|mitoit|skann/.test(text))
      return `${focus.site_name}: joulukuussa ${f(focus.utilization, 1)} % allokoiduista tekstiileistä näkyy aktiivisissa skannauksissa. ${f(focus.unscanned)} tekstiiliä jää ilman skannausta. Tarkistakaa varatekstiilit, sesonkitarve ja datan kattavuus. Vasta tämän jälkeen voidaan ehdottaa mitoituksen muutosta. Lähde: Service_Activity.`;
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
    if (!$("#assistant").open) $("#assistant").showModal();
  }
  function reviewHtml() {
    const { customer, metrics: m, focus, order } = context();
    const cards = results();
    let number = 0;
    const slide = (title, content) =>
      `<section class="slide"><div class="slide-number">LINDSTRÖM · VUOSIKATSAUS 2025 · ${++number}</div><h3>${esc(title)}</h3>${content}<small>Synteettinen aineisto · ${esc(scopeName())} · Vertailu: ${baselineName()}</small></section>`;
    let html = slide(
      customer.customer_name,
      `<p>Vuoden tärkeimmät tulokset ja yhteinen suunta vuodelle 2026.</p><div class="slide-value">${m.sites} ${m.sites === 1 ? "toimipaikka" : "toimipaikkaa"}</div><p>${opening()}</p>`,
    );
    for (const key of order) {
      const card = cards[key];
      html += slide(
        card.title,
        `<div class="slide-value">${card.value}</div><p>${card.text}</p>${card.visual}<small>${card.boundary}. Lähde: ${card.source}.</small>`,
      );
    }
    html += slide(
      "Tarkistetaan tekstiilien todellinen tarve",
      `<p>${esc(focus.site_name)}: ${f(focus.utilization, 1)} % joulukuun allokoiduista tekstiileistä näkyy aktiivisissa skannauksissa. ${f(focus.unscanned)} tekstiiliä jää ilman skannausta.</p><p>Selvitetään varatekstiilien ja sesongin tarve sekä skannausdatan kattavuus. Havainto ei yksin todista vajaakäyttöä.</p><small>Lähde: Service_Activity, joulukuu 2025.</small>`,
    );
    html += slide(
      "Yhteinen suunta vuodelle 2026",
      `<ol>${plan()
        .map(([title, note]) => `<li><p>${esc(title)} ${esc(note)}</p></li>`)
        .join(
          "",
        )}</ol>${state.note ? `<p class="note-text">Account managerin muistiinpano: ${esc(state.note)}</p>` : ""}<small>Keskusteluehdotuksia, eivät vielä sovittuja toimenpiteitä.</small>`,
    );
    const { baseline: b, compare: c } = context();
    html += slide(
      "Mihin luvut perustuvat?",
      `<p>Lähde: Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx. Customers, Sites, Service_Activity, Customer_Impacts, Repairs ja Baselines. Jakso 1.1.–31.12.2025.</p><p>Virrat summataan koko vuodelta. Allokointi ja aktiiviset skannaukset ovat joulukuun tilanne. Korjausten määrä ei tarkoita yksilöllisiä korjattuja tekstiilejä.</p><p>Vesiero: ${f(m.kg, 1)} pestyä kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l. Päästöero: samat pestyt kilot × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e.</p>`,
    );
    html += slide(
      "Tulkinnan rajat",
      "<p>Kaikki asiakasluvut ovat synteettisiä. Vesi ja päästöt ovat lisäksi pesulatasolta allokoituja arvioita. Vertailumalli on havainnollistava vaihtoehto, ei nimetty kilpailija.</p><p>Rajaus kattaa pesun vedenkulutuksen sekä pesun ja toimitusten päästöt, ei koko elinkaarta. Korjausten oletettua kädenjälkeä ei lisätä päästöeroon. Herkkyysväliä ei vielä lasketa.</p><p>Skannausosuus ei todista vajaakäyttöä. Käyttäjämääriä tai euromääräisiä säästöjä ei lasketa puutteellisista lähtötiedoista. Toimialapainotus ei ole compliance-arvio.</p>",
    );
    return html;
  }
  $("#customer").innerHTML = data.customers
    .map((r) => `<option value="${r.customer_id}">${esc(r.customer_name)}</option>`)
    .join("");
  $("#customer").addEventListener("change", (event) => {
    state.customer = event.target.value;
    state.site = "all";
    state.priority = defaultPriority(context().customer);
    clearScope();
    render();
    status("Asiakkaan oma katsaus on valmis. Aiemmat muistiinpanot tyhjennettiin.");
  });
  for (const id of ["site", "baseline", "priority"])
    $("#" + id).addEventListener("change", (event) => {
      state[id] = event.target.value;
      if (id !== "priority") clearScope();
      render();
      renderChat();
      status("Katsaus päivitetty.");
    });
  for (const [form, input] of [
    ["ask-form", "question"],
    ["followup-form", "followup"],
  ])
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
    if (button.dataset.close) $("#" + button.dataset.close).close();
    if (button.dataset.site) {
      state.site = button.dataset.site;
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
    $("#slides").innerHTML = reviewHtml();
    $("#review").showModal();
  });
  $("#print").addEventListener("click", () => window.print());
  $("#download").addEventListener("click", () => {
    const content = `<!doctype html><html lang="fi"><meta charset="utf-8"><title>Asiakkaan vuosikatsaus 2025</title><style>body{font:15px/1.8 Arial;color:#173c43}.slide{padding:5vw;margin:3vw;background:#f7f8f4;break-after:page}h3{font:30px Georgia}.slide-value{font-size:40px;color:#176f54}small{display:block;font-size:11px;color:#61776f}.note-text{white-space:pre-wrap}.mini-chart{max-width:460px;margin:20px 0}.bar-label{display:flex;justify-content:space-between;font-size:11px}.bar-track{height:9px;background:#e0e8d9;margin:5px 0 12px}.bar-fill{background:#71a28a;height:100%}.bar-fill.alt{background:#bdceb1}.repair-picture{display:none}@media print{.slide{margin:0}.slide:last-child{break-after:auto}}@page{size:A4 landscape}</style>${reviewHtml()}</html>`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.customer}-vuosikatsaus-2025.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("HTML-katsaus ladattu.");
  });
  render();
})();
