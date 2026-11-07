import { dataset as data } from "./dataset.mjs";
import { requestContext } from "./request-context.mjs";
import "../frontend/mockups/kopperoinenp/language.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";

/* Read-only tool. The model picks a topic and filters; only this code produces figures. */
const model = globalThis.WorkspaceModel;
const quarters = {
  Q1: ["2025-01", "2025-03"],
  Q2: ["2025-04", "2025-06"],
  Q3: ["2025-07", "2025-09"],
  Q4: ["2025-10", "2025-12"],
};
const ratio = (value, base, scale = 1) =>
  value != null && base > 0 ? (value / base) * scale : null;
const topics = {
  water: {
    fi: "Vesi",
    en: "Water",
    unit: "l/kg",
    digits: 2,
    source: "Customer_Impacts",
    estimate: true,
    read: ({ m }) => ratio(m.water, m.kg),
    product: (p) => p.waterPerKg,
  },
  emissions: {
    fi: "Pesun ja toimitusten päästöt",
    en: "Laundry and delivery emissions",
    unit: "kg CO₂e/kg",
    digits: 3,
    source: "Customer_Impacts",
    estimate: true,
    read: ({ m }) => ratio(m.emissions, m.kg),
  },
  repairs: {
    fi: "Korjaukset",
    en: "Repairs",
    unit: "/ 100 pesua",
    unitEn: "/ 100 washes",
    digits: 2,
    source: "Repairs, Service_Activity",
    read: ({ m }) => ratio(m.repairs, m.washed, 100),
    product: (p) => p.repairsPerHundredWashes,
  },
  washed: {
    fi: "Pesty määrä",
    en: "Washed volume",
    unit: "kg",
    digits: 0,
    source: "Service_Activity",
    read: ({ m }) => m.kg,
  },
  scan: {
    fi: "Skannausosuus",
    en: "Scan share",
    unit: "%",
    digits: 1,
    source: "Service_Activity",
    read: ({ m }) => m.utilization,
    product: (p) => p.scannedPct,
  },
  late: {
    fi: "Myöhästyneet kierrot",
    en: "Late cycles",
    unit: "%",
    digits: 1,
    source: "Service_Cycles",
    read: ({ d }) => d.service.latePct,
  },
  requests: {
    fi: "Palvelupyynnöt",
    en: "Service requests",
    unit: "kpl",
    unitEn: "requests",
    digits: 0,
    source: "Service_Activity",
    read: ({ d }) => d.service.requests,
  },
  energy: {
    fi: "Energia",
    en: "Energy",
    unit: "kWh/kg",
    digits: 2,
    source: "Customer_Impacts",
    estimate: true,
    read: ({ d }) => d.energyPerKg,
    product: (p) => p.energyPerKg,
  },
  waste: {
    fi: "Tekstiilijäte",
    en: "Textile waste",
    unit: "kg/kg",
    digits: 3,
    source: "Customer_Impacts, Waste_Circularity",
    estimate: true,
    read: ({ d }) => d.wastePerKg,
  },
};
const totals = {
  water: { read: ({ m }) => m.water / 1000, unit: "m³", digits: 0 },
  emissions: { read: ({ m }) => m.emissions / 1000, unit: "t CO₂e", digits: 1 },
  repairs: { read: ({ m }) => m.repairs, unit: "kpl", unitEn: "repairs", digits: 0 },
  late: { read: ({ late }) => late, unit: "kpl", unitEn: "late cycles", digits: 0 },
  energy: { read: ({ d }) => d.energy, unit: "kWh", digits: 0 },
  waste: { read: ({ d }) => d.waste, unit: "kg", digits: 0 },
};
const words = {
  water: ["vettä", "water"],
  emissions: ["päästöjä", "emissions"],
  repairs: ["korjauksia", "repairs"],
  washed: ["pesumäärää", "washed volume"],
  scan: ["skannausosuutta", "scan share"],
  late: ["myöhästymisiä", "late cycles"],
  requests: ["palvelupyyntöjä", "service requests"],
  energy: ["energiaa", "energy"],
  waste: ["jätettä", "waste"],
};
const explanations = {
  water: [
    "Luku kertoo, kuinka monta litraa vettä kului yhtä pestyä kiloa kohti. Se on laskettu pesulatasolta ja kohdistettu asiakkaalle pestyjen kilojen osuudella, joten se on arvio. Pienempi luku tarkoittaa vähemmän vettä samaa pesumäärää kohti.",
    "This shows how many litres of water were used per washed kilo. It is calculated at laundry level and allocated by the customer's share of washed kilos, so it is an estimate. A lower figure means less water for the same volume.",
  ],
  emissions: [
    "Luku kertoo pesun ja toimitusten päästöt yhtä pestyä kiloa kohti. Tekstiilien valmistus ei kuulu lukuun. Se on allokoitu arvio, ja maiden erot johtuvat pesuloista, eivät asiakkaan toiminnasta.",
    "This shows laundry and delivery emissions per washed kilo. Textile manufacturing is not included. It is an allocated estimate, and differences between countries come from the laundries, not from the customer.",
  ],
  repairs: [
    "Suhdeluku kertoo, kuinka monta korjausta tehtiin sataa pesua kohti, joten erikokoisia toimipaikkoja voi verrata keskenään. Esimerkiksi 2 tarkoittaa noin kahta korjausta sadasta pesusta. Luku ei kerro yksittäisten tekstiilien määrää eikä todistettuja vältettyjä hankintoja.",
    "The rate shows how many repairs were made per 100 washes, so sites of different sizes can be compared. For example, 2 means about two repairs per 100 washes. It does not show individual garments or proven avoided purchases.",
  ],
  washed: [
    "Luku kertoo asiakkaan pestyt kilot valitulla jaksolla. Määrä vaihtelee kausittain, joten kokonaismääriä ei kannata verrata tehokkuutena.",
    "This is the customer's washed kilos in the selected period. Volume varies by season, so totals do not measure efficiency.",
  ],
  scan: [
    "Skannausosuus kertoo, kuinka suuri osa allokoiduista tekstiileistä näkyi aktiivisissa skannauksissa. Pieni osuus on tarkistettava havainto, koska varatekstiilit ja sesonki voivat selittää sen. Se ei todista vajaakäyttöä.",
    "Scan share shows how many allocated textiles appeared in active scans. A low share should be checked, because spare stock and seasons can explain it. It does not prove underuse.",
  ],
  late: [
    "Luku kertoo, kuinka suuri osa pesukierroista merkittiin myöhästyneiksi. Aineisto ei kerro myöhästymisen syytä.",
    "This shows the share of wash cycles marked as late. The data does not show why a cycle was late.",
  ],
  requests: [
    "Luku kertoo asiakkaan tekemät palvelupyynnöt. Aineisto ei kerro niiden syytä eikä ratkaisuaikaa.",
    "This counts the customer's service requests. The data does not show their cause or resolution time.",
  ],
  energy: [
    "Luku kertoo pesun energiankulutuksen yhtä pestyä kiloa kohti. Se on pesulatasolta kohdistettu arvio.",
    "This shows laundry energy use per washed kilo. It is an estimate allocated from laundry level.",
  ],
  waste: [
    "Luku kertoo tekstiilijätteen määrän pestyä kiloa kohti. Jäte on mitattu pesulatasolla ja kohdistettu asiakkaalle arviona.",
    "This shows textile waste per washed kilo. Waste is recorded at laundry level and allocated to the customer as an estimate.",
  ],
  overview: [
    "Yhteenveto kokoaa valitun asiakkaan tai toimipaikan tärkeimmät luvut. Tekstiilit ja skannausosuus ovat viimeisimmän kuukauden tilanne, muut luvut koskevat koko jaksoa.",
    "The overview collects the main figures for the selected customer or site. Textiles and scan share are the latest month; the other figures cover the whole period.",
  ],
  meeting: [
    "Nämä ovat keskustelun avauksia. Vesi näyttää Lindströmin ja vertailumallin kulutuksen litroina pestyä kiloa kohti. Toimitusvarmuus kertoo, kuinka moni kierto oli ajallaan. Korjaukset on jakson kokonaismäärä. Kysymykset auttavat selvittämään, mikä näistä on asiakkaalle tärkeää.",
    "These are conversation starters. Water shows Lindström against the baseline in litres per washed kilo. On-time cycles show how many cycles were on time. Repairs is the total for the period. The questions help find out what matters to the customer.",
  ],
  baseline: [
    "Vertailumalli on havainnollistava vaihtoehto, kuten paikallinen pesula tai kotipesu, samalla pestyllä määrällä. Se ei ole nimetty kilpailija eikä mitattu tulos.",
    "The baseline is an illustrative alternative, such as a local laundry or home washing, at the same washed volume. It is not a named competitor or a measured result.",
  ],
  synthetic: [
    "Synteettinen tarkoittaa, että luku on hackathonia varten tehty kuvitteellinen tieto. Sitä ei saa esittää todellisena tai auditoituna.",
    "Synthetic means the figure is fictional data made for the hackathon. It must not be presented as real or audited.",
  ],
  allocated: [
    "Allokoitu arvio tarkoittaa, että luku on laskettu pesulatasolla ja jaettu asiakkaalle pestyjen kilojen osuuden mukaan. Se ei ole asiakkaalta mitattu luku.",
    "An allocated estimate is calculated at laundry level and shared to the customer by washed kilos. It is not measured at the customer.",
  ],
};
export const queryTopics = [...Object.keys(topics), "overview", "meeting", "explain", "unknown"];
export const queryComparisons = [
  "none",
  "month",
  "quarter",
  "country",
  "site",
  "product",
  "baseline",
];
export const queryReasons = ["none", "cause_not_in_data", "not_in_data", "off_topic"];
const countries = ["Finland", "Sweden", "Poland"];
const monthIds = Array.from(
  { length: 12 },
  (_, index) => `2025-${String(index + 1).padStart(2, "0")}`,
);
const nullable = (values) => ({ type: ["string", "null"], enum: [...values, null] });
const customerIds = data?.customers.map((row) => row.customer_id) ?? [];
const siteIds = data?.sites.map((row) => row.site_id) ?? [];
const fields = {
  topic: { type: "string", enum: queryTopics },
  compareBy: { type: "string", enum: queryComparisons },
  measure: { type: "string", enum: ["auto", "total", "rate"] },
  rank: { type: "string", enum: ["highest", "lowest"] },
  limit: { type: ["integer", "null"], minimum: 1, maximum: 10 },
  customer: nullable(customerIds),
  country: nullable(countries),
  site: nullable(siteIds),
  quarter: nullable(Object.keys(quarters)),
  from: nullable(monthIds),
  to: nullable(monthIds),
  lastMonths: { type: ["integer", "null"], minimum: 1, maximum: 12 },
  only: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
  subject: nullable(Object.keys(explanations)),
  clarify: { type: ["string", "null"] },
  reason: { type: "string", enum: queryReasons },
};
export const dataQuerySchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      required: Object.keys(fields),
      properties: fields,
    },
    { type: "null" },
  ],
};
/* A query from the browser is untrusted, so only known values survive. */
export function cleanQuery(value) {
  if (!value || typeof value !== "object" || !queryTopics.includes(value.topic)) return null;
  const clean = { topic: value.topic };
  const allowed = {
    compareBy: queryComparisons,
    measure: ["auto", "total", "rate"],
    customer: data?.customers.map((row) => row.customer_id) ?? [],
    country: countries,
    site: data?.sites.map((row) => row.site_id) ?? [],
    quarter: Object.keys(quarters),
    from: monthIds,
    to: monthIds,
  };
  for (const [key, list] of Object.entries(allowed))
    if (list.includes(value[key])) clean[key] = value[key];
  if (Number.isInteger(value.lastMonths) && value.lastMonths >= 1 && value.lastMonths <= 12)
    clean.lastMonths = value.lastMonths;
  return clean;
}
const sumOf = (rows, field) => rows.reduce((total, row) => total + (row[field] || 0), 0);
const preparedMetrics = (scope) => requestContext.getStore()?.prepared?.get(scope);

function measure(metric, selection) {
  const prepared = preparedMetrics(selection);
  if (prepared)
    return prepared.contexts.neutral.metrics.hasData
      ? metric.read({
          m: prepared.contexts.neutral.metrics,
          d: prepared.detail,
          late: prepared.lateCount,
        })
      : null;
  const rows = model.select(data, selection);
  if (!rows.length) return null;
  return metric.read({
    m: model.summarize(rows),
    d: model.analyzeDetails(data, selection),
    late: sumOf(model.select(data, selection, data.cycleGroups ?? []), "late"),
  });
}
function monthLabel(month, fi) {
  return new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", {
    month: "short",
    timeZone: "UTC",
  })
    .format(new Date(`${month}-01T00:00:00Z`))
    .replace("kuuta", "")
    .replace(".", "");
}
function breakdown(query, scope, language) {
  const translated = (value) => globalThis.ReviewLanguage.translate(language, value);
  if (query.compareBy === "month")
    return monthIds
      .filter((month) => month >= scope.from && month <= scope.to)
      .map((month) => ({
        key: month,
        label: monthLabel(month, language === "fi"),
        scope: { ...scope, from: month, to: month },
      }));
  if (query.compareBy === "quarter")
    return Object.entries(quarters).map(([key, [from, to]]) => ({
      key,
      label: key,
      scope: { ...scope, from, to },
    }));
  const sites = data.sites.filter((site) => site.customer_id === scope.customer);
  if (query.compareBy === "country")
    return [...new Set(sites.map((site) => site.country))].map((country) => ({
      key: country,
      label: translated(country),
      scope: { ...scope, country, site: "all" },
    }));
  if (query.compareBy === "site")
    return sites
      .filter((site) => scope.country === "all" || site.country === scope.country)
      .map((site) => ({
        key: site.site_id,
        label: site.site_name,
        scope: { ...scope, site: site.site_id },
      }));
  return null;
}
function comparison(query, metric, scope, language) {
  const translated = (value) => globalThis.ReviewLanguage.translate(language, value);
  const selections = breakdown(query, scope, language);
  if (selections) {
    const rows = selections.map(({ key, label, scope }) => ({
      key,
      label,
      value: measure(metric, scope),
    }));
    return query.compareBy === "site"
      ? rows.filter((row) => row.value !== null).sort((a, b) => b.value - a.value)
      : rows;
  }
  if (query.compareBy === "product") {
    if (!metric.product || metric.total) return null;
    return (preparedMetrics(scope)?.detail ?? model.analyzeDetails(data, scope)).products
      .map((product) => ({
        key: product.name,
        label: product.name,
        value: metric.product(product),
      }))
      .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  }
  if (query.compareBy === "baseline") {
    const field = {
      water: ["water_l_per_kg"],
      emissions: ["process_kgco2e_per_kg", "delivery_kgco2e_per_kg"],
    }[query.topic];
    if (!field || metric.total) return null;
    return [
      { key: "Lindström", label: "Lindström", value: measure(metric, scope) },
      ...data.baselines.map((baseline) => ({
        key: baseline.baseline_id,
        label: translated(baseline.baseline_name),
        value: field.reduce((total, key) => total + baseline[key], 0),
      })),
    ];
  }
  return [{ key: null, label: null, value: measure(metric, scope) }];
}
const counts = {
  yhden: 1,
  kahden: 2,
  kolmen: 3,
  neljän: 4,
  viiden: 5,
  kuuden: 6,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};
// The model can miss these, and each would give a confident answer to the wrong question.
export function refineQuery(query, message, lastQuery = null) {
  const text = message.toLocaleLowerCase("fi");
  if (/euro|€|\beur\b|\brahaa?\b|\bmoney\b/u.test(text))
    return { ...query, topic: "unknown", reason: "not_in_data" };
  if (/(mitä|mita|what).*(tarkoit|merkits|mean)|selitä|selittää|explain/u.test(text))
    return {
      ...query,
      topic: "explain",
      subject: query.subject ?? (lastQuery?.topic in explanations ? lastQuery.topic : null),
    };
  const next = { ...query };
  // Filters must come from the question or the previous search, never from the model alone.
  const named = {
    country: [
      ["Finland", /suom|finland/u],
      ["Sweden", /ruots|sweden/u],
      ["Poland", /puol|poland/u],
    ].some(([country, pattern]) => country === next.country && pattern.test(text)),
    quarter: Boolean(next.quarter) && text.includes(next.quarter.toLowerCase()),
    site: (() => {
      const site = data.sites.find((row) => row.site_id === next.site);
      if (!site) return false;
      const city = site.city.toLocaleLowerCase("fi");
      const stems = [city.slice(0, 4), { turku: "turu", lahti: "lahde", warsaw: "varso" }[city]];
      return stems.some((stem) => stem && text.includes(stem));
    })(),
    customer: (() => {
      const row = data.customers.find((item) => item.customer_id === next.customer);
      return (
        Boolean(row) && text.includes(row.customer_name.split(" ")[0].toLowerCase().slice(0, 4))
      );
    })(),
  };
  for (const key of ["country", "quarter", "site", "customer"])
    if (next[key] && !named[key] && next[key] !== lastQuery?.[key]) next[key] = null;
  // Totals follow volume, so comparisons use rates unless a total was asked for.
  const wantsTotal =
    /\bsum|\bsome the|total|yhteen|summa|paljonko|montako|kuinka monta|how many|how much/u.test(
      text,
    ) ||
    (lastQuery?.measure === "total" && lastQuery.topic === next.topic);
  next.measure = wantsTotal
    ? "total"
    : next.compareBy === "none"
      ? (next.measure ?? "auto")
      : "rate";
  const last = text.match(/(?:viime|viimeis\w*|last|past)\s+(\d+|\p{L}+)\s+(?:kuukau|month)/u);
  if (last && !next.lastMonths) {
    const value = Number(last[1]) || counts[last[1]];
    if (value >= 1 && value <= 12) next.lastMonths = value;
  }
  if (next.compareBy === "country" && !next.only) {
    const named = [
      ["Finland", /suom|finland/u],
      ["Sweden", /ruots|sweden/u],
      ["Poland", /puol|poland/u],
    ]
      .filter(([, pattern]) => pattern.test(text))
      .map(([country]) => country);
    if (named.length >= 2) next.only = named;
  }
  return next;
}
function scopeFor(query, workspace) {
  const scope = { ...workspace.scope };
  if (query.customer && query.customer !== scope.customer)
    Object.assign(scope, {
      customer: query.customer,
      country: "all",
      continent: "all",
      site: "all",
    });
  if (query.country) Object.assign(scope, { country: query.country, site: "all" });
  if (query.site) Object.assign(scope, { site: query.site, country: "all", continent: "all" });
  if (query.quarter) [scope.from, scope.to] = quarters[query.quarter];
  if (query.from) scope.from = query.from;
  if (query.to) scope.to = query.to;
  if (query.lastMonths) {
    const end = monthIds.indexOf(scope.to);
    scope.from = monthIds[Math.max(0, end - query.lastMonths + 1)];
  }
  return scope;
}
function followUps(query, fi) {
  const pick = (finnish, english) => (fi ? finnish : english);
  const meaning = pick("Mitä tämä tarkoittaa?", "What does this mean?");
  if (query.topic === "overview")
    return [
      pick("Mistä palaverissa kannattaa puhua?", "What should we raise in the meeting?"),
      pick("Vertaa vettä kvartaaleittain", "Compare water by quarter"),
    ];
  if (query.topic === "meeting")
    return [
      meaning,
      pick("Vertaa korjauksia kvartaaleittain", "Compare repairs by quarter"),
      pick(
        "Millä toimipaikoilla on eniten myöhästymisiä?",
        "Which sites have the most late cycles?",
      ),
    ];
  const word = words[query.topic];
  if (!word) return [];
  const [part, english] = word;
  const options = [
    ["month", `Näytä ${part} kuukausittain`, `Show ${english} by month`],
    ["quarter", `Vertaa ${part} kvartaaleittain`, `Compare ${english} by quarter`],
    ["country", `Vertaa ${part} maittain`, `Compare ${english} by country`],
    ["site", `Vertaa ${part} toimipaikoittain`, `Compare ${english} by site`],
  ]
    .filter(([key]) => key !== query.compareBy)
    .map(([, finnish, englishText]) => pick(finnish, englishText));
  return [meaning, ...options.slice(0, 2)];
}
// Prepare any comparison scopes through the same versioned queue before formatting the answer.
export async function prepareDataQuery(query, workspace, lastQuery = null) {
  const prepared = requestContext.getStore()?.prepared;
  if (!prepared) return;
  const selection =
    query.topic === "explain"
      ? lastQuery?.topic === (query.subject ?? lastQuery?.topic)
        ? lastQuery
        : null
      : query;
  if (
    !selection ||
    (!topics[selection.topic] && !["overview", "meeting"].includes(selection.topic))
  )
    return;
  const scope = scopeFor(selection, workspace);
  const site = data.sites.find((row) => row.site_id === scope.site);
  if (site && site.customer_id !== scope.customer) return;
  const result = await prepared.load(scope);
  if (!result.contexts.neutral.metrics.hasData || !topics[selection.topic]) return;
  const scopes = breakdown(selection, scope, workspace.language) ?? [];
  for (let index = 0; index < scopes.length; index += 5)
    await Promise.all(scopes.slice(index, index + 5).map(({ scope }) => prepared.load(scope)));
}
export function runDataQuery(query, workspace, lastQuery = null) {
  const language = workspace.language;
  const fi = language === "fi";
  const say = (finnish, english) => (fi ? finnish : english);
  const refuse = (text) => ({ text, source: null, followUps: [] });
  const known = say(
    "Voin hakea vettä, päästöjä, korjauksia, pesumääriä, skannausosuutta, myöhästymisiä, palvelupyyntöjä, energiaa ja jätettä.",
    "I can look up water, emissions, repairs, washed volume, scan share, late cycles, service requests, energy and waste.",
  );
  if (query?.topic === "explain") {
    const subject = query.subject ?? lastQuery?.topic;
    const entry = explanations[subject];
    if (!entry)
      return refuse(
        say(
          "Mitä lukua tarkoitat? Kysy esimerkiksi: Mitä skannausosuus tarkoittaa?",
          "Which figure do you mean? Try: What does scan share mean?",
        ),
      );
    const text =
      lastQuery?.measure === "total" && lastQuery.topic === subject
        ? `${say("Luku on valitun jakson kokonaismäärä.", "This is the total for the selected period.")} ${entry[fi ? 0 : 1]}`
        : entry[fi ? 0 : 1];
    const previous = lastQuery?.topic === subject ? runDataQuery(lastQuery, workspace) : null;
    const single = previous?.view?.kind === "single" ? previous.view.rows[0].display : null;
    return {
      text: single ? `${say("Edellinen luku", "The previous figure")}: ${single}. ${text}` : text,
      source: null,
      followUps: followUps({ topic: subject, compareBy: "none" }, fi).slice(1),
    };
  }
  if (query?.topic === "unknown" || !query?.topic) {
    if (query?.reason === "cause_not_in_data")
      return refuse(
        say(
          "Aineisto näyttää luvut, mutta ei syitä. Syy pitää selvittää pesulalta tai asiakkaalta.",
          "The data shows figures, not causes. The cause has to be checked with the laundry or the customer.",
        ),
      );
    if (query?.reason === "not_in_data")
      return refuse(
        say(
          `Tätä tietoa ei ole aineistossa, enkä arvaa sitä. ${known}`,
          `This is not in the data, and I will not guess it. ${known}`,
        ),
      );
    return refuse(say(`En osaa vastata tähän. ${known}`, `I cannot answer that. ${known}`));
  }
  const special = ["overview", "meeting"].includes(query.topic);
  const topic = topics[query.topic];
  if ((!topic && !special) || !queryComparisons.includes(query.compareBy ?? "none"))
    return refuse(say("En voi hakea tätä tietoa.", "I cannot look up this data."));
  const scope = scopeFor(query, workspace);
  const site = data.sites.find((row) => row.site_id === scope.site);
  if (site && site.customer_id !== scope.customer)
    return refuse(
      say(
        "Tätä toimipaikkaa ei ole tällä asiakkaalla.",
        "This site does not belong to this customer.",
      ),
    );
  const prepared = preparedMetrics(scope);
  if (!(prepared ? prepared.contexts.neutral.metrics.hasData : model.select(data, scope).length))
    return refuse(say("Tällä rajauksella ei ole dataa.", "This selection has no data."));
  const customer = data.customers.find((row) => row.customer_id === scope.customer);
  const place = site
    ? site.site_name
    : scope.country !== "all"
      ? globalThis.ReviewLanguage.translate(language, scope.country)
      : customer.customer_name;
  const fullYear = scope.from === "2025-01" && scope.to === "2025-12";
  const quarter = Object.entries(quarters).find(
    ([, [from, to]]) => from === scope.from && to === scope.to,
  )?.[0];
  const monthName = (month) =>
    new Intl.DateTimeFormat(fi ? "fi-FI" : "en-GB", { month: "long", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    );
  const period =
    query.compareBy === "quarter" || fullYear
      ? "2025"
      : quarter
        ? `${quarter} 2025`
        : scope.from === scope.to
          ? `${monthName(scope.from)} 2025`
          : `${monthName(scope.from)}–${monthName(scope.to)} 2025`;
  const subtitle = site || scope.country !== "all" ? `${customer.customer_name} · ${place}` : place;
  const number = (value, digits = 1) =>
    value === null || value === undefined
      ? say("Ei tietoa", "No data")
      : new Intl.NumberFormat(fi ? "fi-FI" : "en-GB", { maximumFractionDigits: digits }).format(
          value,
        );
  if (special) {
    const m = prepared?.contexts.neutral.metrics ?? model.summarize(model.select(data, scope));
    const d = prepared?.detail ?? model.analyzeDetails(data, scope);
    const onTime = d.service.latePct === null ? null : 100 - d.service.latePct;
    const baseline = data.baselines.find((row) => row.baseline_id === scope.baseline);
    const repairs = ratio(m.repairs, m.washed, 100);
    const base = { language, kind: "facts", subtitle: `${subtitle} · ${period}`, highlights: [] };
    const status = say(
      "Synteettinen aineisto. Vesi on allokoitu arvio.",
      "Synthetic data. Water is an allocated estimate.",
    );
    if (query.topic === "overview") {
      const rows = [
        ...(site ? [] : [[say("Toimipaikat", "Sites"), number(m.sites, 0)]]),
        [say("Tekstiilit, viimeisin kuukausi", "Textiles, latest month"), number(m.allocated, 0)],
        [say("Toimitusvarmuus", "On-time cycles"), `${number(onTime)} %`],
        [
          say("Skannausosuus, viimeisin kuukausi", "Scan share, latest month"),
          `${number(m.utilization)} %`,
        ],
        [say("Vesi", "Water"), `${number(ratio(m.water, m.kg), 2)} l/kg`],
        [
          say("Korjaukset", "Repairs"),
          `${number(repairs, 2)} ${say("/ 100 pesua", "/ 100 washes")}`,
        ],
        [say("Palvelupyynnöt", "Service requests"), number(d.service.requests, 0)],
      ];
      const title = say("Yhteenveto", "Overview");
      return {
        text: `${title}, ${subtitle}`,
        source: "Service_Activity, Service_Cycles, Customer_Impacts",
        followUps: followUps(query, fi),
        summary: site
          ? say(`Yhteenveto: ${site.site_name}.`, `Overview: ${site.site_name}.`)
          : say(
              `${place}: ${number(m.sites, 0)} toimipaikkaa.`,
              `${place}: ${number(m.sites, 0)} sites.`,
            ),
        view: {
          ...base,
          title,
          rows: rows.map(([label, display]) => ({ label, display, value: null, accent: false })),
          more: "",
          status,
          source: "Service_Activity, Service_Cycles, Customer_Impacts",
        },
      };
    }
    const title = say("Palaverin aiheet", "Meeting topics");
    const rows = [
      [
        say("Vesi vertailumalliin", "Water against the baseline"),
        `${number(ratio(m.water, m.kg))} / ${number(baseline.water_l_per_kg)} l/kg`,
        say(
          "Onko asiakkaalla vesitavoite, johon tämä kannattaa kytkeä?",
          "Does the customer have a water target this should support?",
        ),
      ],
      [
        say("Toimitusvarmuus", "On-time cycles"),
        `${number(onTime)} %`,
        say("Vastaako tämä asiakkaan kokemusta?", "Does this match the customer's experience?"),
      ],
      [
        say("Korjaukset", "Repairs"),
        number(m.repairs, 0),
        say(
          "Näkyykö korjaustarve tietyissä tehtävissä?",
          "Is the repair need tied to specific tasks?",
        ),
      ],
    ];
    return {
      text: `${title}, ${subtitle}`,
      source: "Customer_Impacts, Service_Cycles, Repairs",
      followUps: followUps(query, fi),
      summary: say(
        "Nämä kolme kannattaa ottaa esiin. Ne ovat ehdotuksia, joten tarkista ne ennen palaveria.",
        "These three are worth raising. They are suggestions, so review them before the meeting.",
      ),
      view: {
        ...base,
        title,
        rows: rows.map(([label, display, question]) => ({
          label,
          display,
          note: question,
          value: null,
          accent: false,
        })),
        more: "",
        status: say(
          "Synteettinen aineisto. Vertailumalli on havainnollistava.",
          "Synthetic data. The baseline is illustrative.",
        ),
        source: "Customer_Impacts, Service_Cycles, Repairs",
      },
    };
  }
  const compareBy = query.compareBy ?? "none";
  const total = query.measure === "total" ? totals[query.topic] : null;
  const metric = total ? { ...topic, ...total, total: true } : topic;
  const all = comparison({ ...query, compareBy }, metric, scope, language);
  if (!all)
    return refuse(
      say(
        "Tätä vertailua ei voi tehdä kokonaismäärillä tai tällä mittarilla.",
        "This comparison is not available for totals or this metric.",
      ),
    );
  const picked = Array.isArray(query.only) && query.only.length ? query.only : null;
  const rows = picked ? all.filter((row) => picked.includes(row.key)) : all;
  const base = rows.length >= 2 || !picked ? rows : all;
  const lowest = query.rank === "lowest" && ["site", "product"].includes(compareBy);
  const list = lowest ? [...base].reverse() : base;
  const unit = fi ? metric.unit : (metric.unitEn ?? metric.unit);
  const shown = (value) =>
    value === null ? say("Ei tietoa", "No data") : `${number(value, metric.digits)} ${unit}`;
  const title = fi ? topic.fi : topic.en;
  const limit = compareBy === "site" ? (query.limit ?? 6) : (query.limit ?? list.length);
  const lines = list
    .slice(0, limit)
    .map((row) => (row.label ? `• ${row.label}: ${shown(row.value)}` : shown(row.value)));
  const hidden = list.length - limit;
  const more = hidden > 0 ? say(`… ja ${hidden} muuta`, `… and ${hidden} more`) : "";
  const status = topic.estimate
    ? say("Synteettinen allokoitu arvio.", "Synthetic allocated estimate.")
    : say("Synteettinen aineisto.", "Synthetic data.");
  const ranked = list.filter((row) => row.value !== null).sort((a, b) => b.value - a.value);
  const single = compareBy === "none";
  const trimmed = hidden > 0 && ["site", "product"].includes(compareBy);
  const highlights =
    single || trimmed || ranked.length < 2
      ? []
      : [
          {
            label: say("Korkein", "Highest"),
            name: ranked[0].label,
            value: shown(ranked[0].value),
          },
          {
            label: say("Matalin", "Lowest"),
            name: ranked.at(-1).label,
            value: shown(ranked.at(-1).value),
          },
        ];
  const accent = compareBy === "baseline" ? "Lindström" : ranked[0]?.label;
  const cause =
    query.reason === "cause_not_in_data"
      ? say(
          " Aineisto ei kerro syytä, joten se pitää selvittää pesulalta tai asiakkaalta.",
          " The data does not show the cause, so check it with the laundry or the customer.",
        )
      : "";
  const listed = list
    .slice(0, limit)
    .map((row) => `${row.label} ${shown(row.value)}`)
    .join(", ");
  const summary = single
    ? `${title}, ${place}: ${shown(list[0].value)} (${period}).${cause}`
    : trimmed
      ? `${lowest ? say("Pienimmät", "Lowest") : say("Suurimmat", "Highest")} ${Math.min(limit, list.length)}: ${listed}.${cause}`
      : `${highlights.map((item) => `${item.label}: ${item.name}, ${item.value}.`).join(" ")}${cause}`;
  return {
    text: `${title}, ${subtitle}, ${period}\n${lines.join("\n")}${more ? `\n${more}` : ""}\n\n${status} ${say("Lähde", "Source")}: ${topic.source}.`,
    source: topic.source,
    summary,
    followUps: followUps({ ...query, compareBy }, fi),
    view: {
      language,
      kind: single ? "single" : ["quarter", "month"].includes(compareBy) ? "columns" : "bars",
      title,
      subtitle: `${subtitle} · ${period}`,
      rows: list.slice(0, limit).map((row) => ({
        label: row.label ?? title,
        value: row.value,
        display: shown(row.value),
        accent: row.label === accent,
      })),
      highlights,
      more,
      status,
      source: topic.source,
    },
  };
}
