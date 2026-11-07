/* Meeting advice and account manager signals. All figures come from the data;
   the thresholds are demo assumptions to agree with Lindström. */
(function (root) {
  const thresholds = { falling: -1, rising: 1, strongUse: 85 };
  const audiences = {
    cfo: {
      en: "CFO",
      fi: "Talousjohtaja (CFO)",
      areas: ["scorecard", "financial", "operations"],
      priority: "efficiency",
    },
    sustainability: {
      en: "Sustainability manager",
      fi: "Ympäristövastaava",
      areas: ["sustainability", "operations", "improvement"],
      priority: "emissions",
    },
    operations: {
      en: "Operations manager",
      fi: "Tuotantopäällikkö",
      areas: ["performance", "adoption", "operations"],
      priority: "circularity",
    },
    procurement: {
      en: "Procurement",
      fi: "Hankintapäällikkö",
      areas: ["scorecard", "performance", "financial"],
      priority: "efficiency",
    },
    ceo: {
      en: "CEO",
      fi: "Toimitusjohtaja",
      areas: ["scorecard", "experience", "future"],
      priority: "neutral",
    },
  };
  const number = (value, language, digits = 0) =>
    new Intl.NumberFormat(language === "fi" ? "fi-FI" : "en-GB", {
      maximumFractionDigits: digits,
    }).format(value);
  const signed = (value, language) => `${value > 0 ? "+" : ""}${number(value, language, 1)}`;
  function audienceAdvice(id, metrics, language) {
    const audience = audiences[id];
    if (!audience) return null;
    const fi = language === "fi";
    const say = (finnish, english) => (fi ? finnish : english);
    const n = (value, digits) => number(value, language, digits);
    const points = {
      cfo: [
        say(
          "Euromääräisiä säästöjä ei ole aineistossa. Ota mukaan asiakkaan omat kustannusluvut.",
          "Euro savings are not in the data. Bring the customer's own cost figures.",
        ),
        say(
          `${n(metrics.repairs)} korjausta piti tekstiilit käytössä, mikä on hyvä aloitus kustannuskeskusteluun.`,
          `${n(metrics.repairs)} repairs kept textiles in use, a good start for the cost discussion.`,
        ),
      ],
      sustainability: [
        say(
          `Vesi ${n(metrics.water / 1000)} m³ ja päästöt ${n(metrics.emissions / 1000, 1)} t CO₂e ovat laskennallisia arvioita. Kerro laskentatapa.`,
          `Water ${n(metrics.water / 1000)} m³ and emissions ${n(metrics.emissions / 1000, 1)} t CO₂e are calculated estimates. Explain the method.`,
        ),
        say(
          `${n(metrics.repairs)} korjausta tukee kiertotalouskeskustelua.`,
          `${n(metrics.repairs)} repairs support the circular economy discussion.`,
        ),
      ],
      operations: [
        say(
          `${n(metrics.washed)} pesua ${n(metrics.sites)} toimipaikassa: aloita toimitusvarmuudesta.`,
          `${n(metrics.washed)} washes across ${n(metrics.sites)} sites: start with service reliability.`,
        ),
        say(
          "Sopimuksen SLA-tavoitteet eivät ole aineistossa. Lisää ne sopimus-KPI:nä.",
          "Contract SLA targets are not in the data. Add them as contract KPIs.",
        ),
      ],
      procurement: [
        say(
          "Hinnat ja sopimusehdot eivät ole aineistossa. Ota sopimustiedot mukaan.",
          "Prices and contract terms are not in the data. Bring the contract details.",
        ),
        say(
          `${n(metrics.allocated)} tekstiiliä ja ${n(metrics.sites)} toimipaikkaa kertovat palvelun laajuuden.`,
          `${n(metrics.allocated)} textiles and ${n(metrics.sites)} sites show the scope of the service.`,
        ),
      ],
      ceo: [
        say(
          "Pidä esitys lyhyenä: kokonaiskuva, yhteistyö ja seuraavat askeleet.",
          "Keep it short: the overall picture, the partnership and the next steps.",
        ),
        say(
          `Palvelu kattaa ${n(metrics.sites)} toimipaikkaa ja ${n(metrics.allocated)} tekstiiliä.`,
          `The service covers ${n(metrics.sites)} sites and ${n(metrics.allocated)} textiles.`,
        ),
      ],
    }[id];
    return { label: audience[fi ? "fi" : "en"], areas: audience.areas, points };
  }
  function usageRead(pct, change) {
    if (change <= thresholds.falling) return "keep";
    if (change >= thresholds.rising || pct >= thresholds.strongUse) return "show";
    return "decide";
  }
  function salesSignals(data, selection, language) {
    const model = root.WorkspaceModel;
    const rows = model.select(data, selection);
    if (!rows.length) return null;
    const say = (finnish, english) => (language === "fi" ? finnish : english);
    const n = (value, digits) => number(value, language, digits);
    const months = [...new Set(rows.map((row) => row.month))].sort();
    const share = (month, list = rows) => {
      const snapshot = list.filter((row) => row.month === month);
      const allocated = snapshot.reduce((sum, row) => sum + row.allocated_pieces, 0);
      const scanned = snapshot.reduce((sum, row) => sum + row.active_assets_scanned, 0);
      return allocated ? { pct: (scanned / allocated) * 100, spare: allocated - scanned } : null;
    };
    const first = share(months[0]);
    const last = share(months.at(-1));
    if (!first || !last) return null;
    const change = last.pct - first.pct;
    const read = usageRead(last.pct, change);
    const lowest = [...new Set(rows.map((row) => row.site))]
      .map((site) => ({
        site,
        ...share(
          months.at(-1),
          rows.filter((row) => row.site === site),
        ),
      }))
      .filter((row) => row.pct != null)
      .sort((a, b) => a.pct - b.pct)[0];
    const siteName = data.sites.find((site) => site.site_id === lowest?.site)?.site_name;
    const customer = data.customers.find((row) => row.customer_id === selection.customer);
    const earlier = model.select(data, {
      ...selection,
      from: selection.from.replace(/^\d{4}/, "2024"),
      to: selection.to.replace(/^\d{4}/, "2024"),
    });
    const washes = (list) => list.reduce((sum, row) => sum + row.washed_pieces, 0);
    const volume = earlier.length ? (washes(rows) / washes(earlier) - 1) * 100 : null;
    const revenue = customer.mock_revenue_eur_2024
      ? (customer.mock_revenue_eur_2025 / customer.mock_revenue_eur_2024 - 1) * 100
      : null;
    const signals = [];
    if (volume != null)
      signals.push({
        id: "volume",
        label: say("Pesumäärä viime vuodesta", "Washes compared with last year"),
        value: `${signed(volume, language)} %`,
      });
    if (revenue != null)
      signals.push({
        id: "revenue",
        label: say("Asiakkaan liikevaihto, demoluku", "Customer revenue, demo figure"),
        value: `${signed(revenue, language)} %`,
      });
    if (siteName)
      signals.push({
        id: "site",
        label: say("Heikoin käyttö", "Lowest use"),
        value: `${siteName} ${n(lowest.pct, 1)} % · ${n(lowest.spare)} ${say("ilman skannausta", "without a scan")}`,
      });
    const advice = {
      show: [
        "Näytä luku: se todistaa, että palvelu on aktiivisessa käytössä.",
        "Show the figure: it proves the service is in active use.",
      ],
      keep: [
        "Pidä luku sisäisenä valmisteluna: laskeva käyttö voi johtaa pyyntöön pienentää sopimusta. Valmistele vaihtoehto ja vastaa rehellisesti, jos asiakas kysyy.",
        "Keep the figure for internal prep: falling use can lead to a request to reduce the contract. Prepare an option and answer honestly if the customer asks.",
      ],
      decide: [
        "Oma harkinta: käyttö on vakaa. Näytä, jos se tukee keskustelua, ja aloita heikoimmasta toimipaikasta.",
        "Your call: use is stable. Show it if it helps the discussion, and start with the lowest site.",
      ],
    }[read];
    return {
      usage: {
        pct: last.pct,
        change,
        read,
        value: `${n(last.pct, 1)} %`,
        trend: `${signed(change, language)} ${say("prosenttiyksikköä", "percentage points")}`,
        period: `${months[0]} – ${months.at(-1)}`,
        advice: say(...advice),
      },
      lowest: siteName ? { name: siteName, pct: lowest.pct } : null,
      signals,
    };
  }
  const searchable = (text) => text.toLocaleLowerCase("fi").normalize("NFD").replace(/\p{M}/gu, "");
  // Every typed word must match; names that start with the query come first.
  function matchCustomers(rows, query, limit = 8) {
    const words = searchable(query).split(/\s+/).filter(Boolean);
    const first = words[0] ?? "";
    return rows
      .filter((row) => {
        const text = searchable(`${row.name} ${row.industry} ${row.keywords ?? ""}`);
        return words.every((word) => text.includes(word));
      })
      .sort(
        (a, b) =>
          Number(searchable(b.name).startsWith(first)) -
            Number(searchable(a.name).startsWith(first)) || a.name.localeCompare(b.name, "fi"),
      )
      .slice(0, limit);
  }
  const roleQuestions = {
    cfo: [
      "Mitä tekstiilipalvelun kustannuksia haluaisit seurata paremmin ensi vuonna?",
      "Which textile service costs would you like to follow better next year?",
      "Avaa keskustelun kustannusraportoinnista ja sopimusmallista.",
      "Opens a discussion about cost reporting and the contract model.",
    ],
    sustainability: [
      "Mitä ympäristötietoja tarvitsette ensi vuoden raportointiin?",
      "What environmental data do you need for next year's reporting?",
      "Avaa keskustelun raportoinnista ja kiertotalouden ratkaisuista.",
      "Opens a discussion about reporting and circular solutions.",
    ],
    operations: [
      "Missä tekstiilien saatavuus tai toimitukset teettävät eniten työtä?",
      "Where do textile availability or deliveries cause the most work?",
      "Avaa keskustelun palvelutasosta ja lisäpalveluista.",
      "Opens a discussion about service levels and added services.",
    ],
    procurement: [
      "Mitä haluaisitte kehittää seuraavalla sopimuskaudella?",
      "What would you like to improve in the next contract period?",
      "Avaa keskustelun sopimuksen laajuudesta ennen uusintaa.",
      "Opens a discussion about contract scope before renewal.",
    ],
    ceo: [
      "Mitkä liiketoimintanne muutokset vaikuttavat ensi vuonna eniten?",
      "Which changes in your business will matter most next year?",
      "Kertoo, missä kasvu ja uudet tarpeet ovat.",
      "Shows where growth and new needs are.",
    ],
  };
  const usageQuestions = {
    show: [
      "Onko tekstiilejä riittänyt kaikissa toimipaikoissa myös ruuhka-aikoina?",
      "Have there been enough textiles at every site, also at peak times?",
      "Jos ei, lisätekstiilit tai uusi toimipaikka on asiakkaan oma tarve, ei tyrkytys.",
      "If not, more textiles or a new site comes from the customer's own need.",
    ],
    keep: [
      "Miten henkilöstömäärä ja tekstiilien tarve ovat muuttuneet toimipaikoillanne?",
      "How have staffing and textile needs changed at your sites?",
      "Kuulet ajoissa, jos tarve pienenee, ja voit tarjota sopivampaa mallia itse.",
      "You hear early if the need is falling, and can offer a better fit yourself.",
    ],
    decide: [
      "Onko suunnitteilla muutoksia toimipaikkoihin tai henkilöstöön?",
      "Are changes planned to your sites or staffing?",
      "Paljastaa kasvun tai muutoksen ennen kuin se näkyy luvuissa.",
      "Reveals growth or change before it shows in the figures.",
    ],
  };
  // Questions lead to a sale through the customer's own needs, not through a pitch.
  function conversation(id, signals, language) {
    const fi = language === "fi";
    const row = ([askFi, askEn, whyFi, whyEn]) => ({
      ask: fi ? askFi : askEn,
      why: fi ? whyFi : whyEn,
    });
    const opening = [
      "Mikä on teille ensi vuoden tärkein muutos?",
      "What is your most important change next year?",
      "Aloita asiakkaan tarpeista, älä tuotteista.",
      "Start from the customer's needs, not from products.",
    ];
    const questions = [row(roleQuestions[id] ?? opening)];
    if (signals) questions.push(row(usageQuestions[signals.usage.read]));
    if (signals?.lowest)
      questions.push({
        ask: fi
          ? `Miten palvelu toimii toimipaikassa ${signals.lowest.name}?`
          : `How is the service working at ${signals.lowest.name}?`,
        why: fi
          ? `Käyttö on siellä matalin (${number(signals.lowest.pct, language, 1)} %). Selvitä syy ennen kuin ehdotat muutosta.`
          : `Use is lowest there (${number(signals.lowest.pct, language, 1)}%). Find the reason before suggesting a change.`,
      });
    return questions;
  }
  root.SalesModel = {
    audiences,
    audienceAdvice,
    conversation,
    matchCustomers,
    salesSignals,
    thresholds,
    usageRead,
  };
})(globalThis);
