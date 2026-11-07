import "../frontend/mockups/kopperoinenp/data.js";
import "../frontend/mockups/kopperoinenp/model.js";
import "../frontend/mockups/kopperoinenp/story-model.js";
import "../frontend/mockups/kopperoinenp/analysis-model.js";
import "../frontend/mockups/kopperoinenp/meeting-model.js";

export class PresentationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const data = globalThis.REVIEW_DATA;
const f = (value, digits = 0) =>
  new Intl.NumberFormat("fi-FI", { maximumFractionDigits: digits }).format(value);
export const evidenceIds = ["water", "emissions", "repairs"];
export const insightIds = [...evidenceIds, "opportunity"];
export const slideIds = ["cover", "overview", ...insightIds, "plan", "sources", "limits"];
export const storyVersion = "customer-value-story-v2";
export const cooperationStates = {
  unrated: { label: "Ei arvioitu", color: "667580" },
  green: { label: "Vihreä – yhteistyö sujuu hyvin", color: "578200" },
  yellow: { label: "Keltainen – vaatii huomiota", color: "F4C542" },
  red: { label: "Punainen – vaatii toimenpiteitä", color: "E52330" },
};
const defaults = {
  customer: "CUST001",
  from: "2025-01",
  to: "2025-12",
  country: "all",
  continent: "all",
  site: "all",
  baseline: "B_LOCAL",
  priority: "neutral",
};
export function validateRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PresentationError("Virheellinen esityspyyntö.");
  const scope = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    scope[key] = input.scope?.[key] ?? fallback;
    if (typeof scope[key] !== "string" || scope[key].length > 80)
      throw new PresentationError("Virheellinen rajaus.");
  }
  if (
    !data.customers.some((c) => c.customer_id === scope.customer) ||
    !data.baselines.some((b) => b.baseline_id === scope.baseline)
  )
    throw new PresentationError("Tuntematon asiakas tai vertailumalli.");
  if (
    ![scope.from, scope.to].every((m) => /^2025-(0[1-9]|1[0-2])$/.test(m)) ||
    scope.from > scope.to
  )
    throw new PresentationError("Tarkista esityksen ajanjakso.");
  if (
    !["all", "Finland", "Sweden", "Poland"].includes(scope.country) ||
    !["all", "Europe"].includes(scope.continent) ||
    !["neutral", "water", "emissions", "circularity", "efficiency"].includes(scope.priority)
  )
    throw new PresentationError("Tuntematon rajaus.");
  if (
    scope.site !== "all" &&
    !data.sites.some((s) => s.site_id === scope.site && s.customer_id === scope.customer)
  )
    throw new PresentationError("Toimipaikka ei kuulu asiakkaalle.");
  const included = input.included ?? insightIds;
  if (
    !Array.isArray(included) ||
    !included.length ||
    included.length > 4 ||
    new Set(included).size !== included.length ||
    included.some((id) => !insightIds.includes(id))
  )
    throw new PresentationError("Valitse vähintään yksi tunnettu nosto.");
  const note = input.note ?? "";
  if (typeof note !== "string" || note.length > 2000)
    throw new PresentationError("Muistiinpano on liian pitkä.");
  const titleEdits = {};
  if (
    input.titleEdits != null &&
    (typeof input.titleEdits !== "object" || Array.isArray(input.titleEdits))
  )
    throw new PresentationError("Virheelliset diaotsikot.");
  for (const [id, title] of Object.entries(input.titleEdits || {})) {
    if (
      !["cover", "overview", ...insightIds, "plan", "sources", "limits"].includes(id) ||
      typeof title !== "string" ||
      title.length > 150
    )
      throw new PresentationError("Virheellinen diaotsikko.");
    if (title.trim()) titleEdits[id] = title.trim();
  }
  const slideOrder = input.slideOrder ?? [];
  if (
    !Array.isArray(slideOrder) ||
    slideOrder.length > slideIds.length ||
    new Set(slideOrder).size !== slideOrder.length ||
    slideOrder.some((id) => !slideIds.includes(id))
  )
    throw new PresentationError("Virheellinen managerin diajärjestys.");
  const cooperation = input.cooperation ?? "unrated";
  if (typeof cooperation !== "string" || !Object.hasOwn(cooperationStates, cooperation))
    throw new PresentationError("Tuntematon yhteistyön tila.");
  const savings = input.savings ?? null;
  if (
    savings !== null &&
    (typeof savings !== "number" || !Number.isFinite(savings) || savings < 0 || savings > 1e12)
  )
    throw new PresentationError("Virheellinen KAM:in säästöarvio.");
  const managerTexts = input.managerTexts ?? {};
  if (
    !managerTexts ||
    typeof managerTexts !== "object" ||
    Array.isArray(managerTexts) ||
    Object.entries(managerTexts).some(
      ([id, text]) => !slideIds.includes(id) || typeof text !== "string" || text.length > 2000,
    )
  )
    throw new PresentationError("Virheellinen KAM:in diateksti.");
  return {
    scope,
    included,
    note,
    titleEdits,
    slideOrder: [...slideOrder],
    cooperation,
    savings,
    managerTexts: { ...managerTexts },
  };
}
export function buildPresentation(input) {
  const request = validateRequest(input);
  const ctx = globalThis.WorkspaceModel.buildContext(data, request.scope);
  const { metrics: m, compare: c, baseline: b, focus, customer } = ctx;
  if (!m.hasData) throw new PresentationError("Nykyisellä rajauksella ei ole dataa.");
  const period = `${request.scope.from} – ${request.scope.to}`;
  const baseline = {
    B_LOCAL: "paikallinen ulkoistettu pesula",
    B_HOME: "kotipesu",
    B_INHOUSE: "asiakkaan oma pesula",
  }[request.scope.baseline];
  const scopeName =
    request.scope.site !== "all"
      ? focus.site_name
      : request.scope.country !== "all"
        ? globalThis.WorkspaceModel.countryNames[request.scope.country]
        : "Kaikki toimipaikat";
  const footer = `Synteettinen aineisto · ${scopeName} · ${period} · Vertailu: ${baseline}`;
  const difference = (delta, pct) => `${delta >= 0 ? "−" : "+"}${f(Math.abs(pct))} %`;
  const slides = {
    cover: {
      id: "cover",
      kind: "cover",
      title: customer.customer_name,
      paragraphs: [
        "Jakson tärkeimmät tulokset ja yhteinen suunta vuodelle 2026.",
        `${m.sites} ${m.sites === 1 ? "toimipaikka" : "toimipaikkaa"}`,
        "Vedenkäyttö, pesun ja toimitusten päästöt, tekstiilien huolto sekä yhteinen kehitysehdotus.",
      ],
    },
    overview: {
      id: "overview",
      kind: "overview",
      title: "Palvelun käyttö ja huolto yhdellä silmäyksellä",
      facts: [
        { label: "Toimipaikkoja", value: f(m.sites) },
        { label: "Allokoituja tekstiilejä", value: f(m.allocated) },
        { label: "Aktiivisessa skannauksessa", value: f(m.scanned) },
        { label: "Pestyjä kiloja", value: f(m.kg) },
        { label: "Korjaustapahtumia", value: f(m.repairs) },
        {
          label: "Skannausosuus",
          value: m.utilization == null ? "Ei tietoa" : f(m.utilization, 1) + " %",
        },
      ],
      paragraphs: [
        `Tekstiilimäärät ja skannausosuus: tilanne ${m.snapshotMonth}. Pestyt kilot ja korjaukset: koko valittu jakso. Skannausosuus ei yksin osoita todellista käyttöastetta.`,
        "Yksilöllinen käyttäjämäärä, palvelutaso ja tuotekohtainen erittely eivät kuulu tähän esitysversioon.",
      ],
      source: "Sites, Service_Activity, Repairs",
      boundary: "Yhteinen tietopohja · varannot ja tapahtumamäärät eroteltu",
    },
    water: {
      id: "water",
      kind: "comparison",
      title:
        c.waterDifference >= 0
          ? "Vähemmän vettä samaan pesumäärään"
          : "Vedenkulutus ylittää vertailumallin",
      headlineOptions: [
        c.waterDifference >= 0
          ? "Vähemmän vettä samaan pesumäärään"
          : "Vedenkulutus ylittää vertailumallin",
        "Vedenkäyttö valitulla jaksolla",
      ],
      value: difference(c.waterDifference, c.waterPercent),
      paragraphs: [
        `Pesuun kohdistettu vedenkulutus oli ${f(m.water / 1000)} m³. Ero valittuun vaihtoehtoon on ${f(Math.abs(c.waterDifference) / 1000)} m³.`,
      ],
      chart: {
        labels: ["Lindström", "Vertailumalli"],
        values: [m.water / 1000, c.baselineWater / 1000],
        unit: "m³",
      },
      source: "Customer_Impacts, Baselines",
      boundary: "Laskennallinen arvio · pesun vedenkulutus",
    },
    emissions: {
      id: "emissions",
      kind: "comparison",
      title:
        c.emissionsDifference >= 0
          ? "Pienempi pesun ja toimitusten jalanjälki"
          : "Pesun ja toimitusten päästöt ylittävät vertailun",
      headlineOptions: [
        c.emissionsDifference >= 0
          ? "Pienempi pesun ja toimitusten jalanjälki"
          : "Pesun ja toimitusten päästöt ylittävät vertailun",
        "Pesun ja toimitusten ilmastovaikutus",
      ],
      value: difference(c.emissionsDifference, c.emissionsPercent),
      paragraphs: [
        `Pesun ja toimitusten päästöarvio on ${f(m.emissions / 1000, 1)} t CO₂e. Ero vertailumalliin on ${f(Math.abs(c.emissionsDifference) / 1000, 1)} t CO₂e.`,
      ],
      chart: {
        labels: ["Lindström", "Vertailumalli"],
        values: [m.emissions / 1000, c.baselineEmissions / 1000],
        unit: "t CO₂e",
      },
      source: "Customer_Impacts, Baselines",
      boundary: "Laskennallinen arvio · pesu ja toimitukset",
    },
    repairs: {
      id: "repairs",
      kind: "repairs",
      title: "Korjaaminen tukee pidempää käyttöä",
      headlineOptions: [
        "Korjaaminen tukee pidempää käyttöä",
        "Tekstiilien korjaustoiminta valitulla jaksolla",
      ],
      value: f(m.repairs),
      paragraphs: [
        "Tekstiilejä huollettiin korjaamalla. Määrä kertoo korjaustoiminnasta; vältettyjä hankintoja tai päästöjä siitä ei suoraan päätellä.",
      ],
      chart: {
        labels: globalThis.WorkspaceModel.series(ctx, "repairs").map((p) => p.month.slice(5)),
        values: globalThis.WorkspaceModel.series(ctx, "repairs").map((p) => p.value),
        unit: "kpl",
      },
      source: "Repairs",
      boundary: "Synteettinen tapahtumamäärä · ei yksilöllisiä tekstiilejä",
    },
    opportunity: {
      id: "opportunity",
      kind: "opportunity",
      title: "Tarkistetaan tekstiilien todellinen tarve",
      headlineOptions: [
        "Tarkistetaan tekstiilien todellinen tarve",
        "Skannausosuus on yhteisen selvityksen lähtökohta",
      ],
      paragraphs: [
        `${focus.site_name}: ${f(focus.utilization, 1)} % ${m.snapshotMonth} tilanteen allokoiduista tekstiileistä näkyy aktiivisissa skannauksissa. ${f(focus.unscanned)} tekstiiliä jää ilman skannausta.`,
        "Selvitetään varatekstiilien ja sesongin tarve sekä skannausdatan kattavuus. Havainto ei yksin todista vajaakäyttöä.",
      ],
      chart: {
        labels: ["Skannattu", "Ilman skannausta"],
        values: [focus.scanned, focus.unscanned],
        unit: "kpl",
      },
      source: `Service_Activity, ${m.snapshotMonth}`,
      boundary: "Tilannekuva, ei todistettu vajaakäyttö",
    },
    plan: {
      id: "plan",
      kind: "text",
      title: "Yhteinen suunta vuodelle 2026",
      paragraphs: [
        `Tarkistetaan ${focus.site_name} yhdessä asiakkaan kanssa. Varmistetaan varatekstiilien tarve ja skannausten kattavuus.`,
        "Sovitaan yksi konkreettinen parannus ja sen vastuuhenkilö. Mitoitusta muutetaan vasta tarkistetun tarpeen perusteella.",
        "Palataan tuloksiin seuraavassa seurantapalaverissa. Mahdollinen säästö arvioidaan vasta hyväksytyillä lähtötiedoilla.",
      ],
      boundary: "Keskusteluehdotuksia, eivät vielä sovittuja toimenpiteitä.",
    },
    sources: {
      id: "sources",
      kind: "text",
      title: "Mihin luvut perustuvat?",
      paragraphs: [
        "Lähde: Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx. Customers, Sites, Service_Activity, Customer_Impacts, Repairs ja Baselines.",
        `Virrat summataan valitulta jaksolta. Allokointi ja aktiiviset skannaukset ovat ${m.snapshotMonth} lopun tilanne. Korjausten määrä ei tarkoita yksilöllisiä korjattuja tekstiilejä.`,
        `Vesiero: ${f(m.kg, 1)} pestyä kg × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l. Päästöero: samat pestyt kilot × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e.`,
      ],
    },
    limits: {
      id: "limits",
      kind: "text",
      title: "Tulkinnan rajat",
      paragraphs: [
        "Kaikki asiakasluvut ovat synteettisiä. Vesi ja päästöt ovat lisäksi pesulatasolta allokoituja arvioita. Vertailumalli on havainnollistava vaihtoehto, ei nimetty kilpailija.",
        "Rajaus kattaa pesun vedenkulutuksen sekä pesun ja toimitusten päästöt, ei koko elinkaarta. Korjausten oletettua kädenjälkeä ei lisätä päästöeroon. Herkkyysväliä ei vielä lasketa.",
        "Skannausosuus ei todista vajaakäyttöä. Käyttäjämääriä tai euromääräisiä säästöjä ei lasketa puutteellisista lähtötiedoista. Toimialapainotus ei ole compliance-arvio.",
      ],
    },
  };
  if (request.note) slides.plan.paragraphs.push(`Account managerin muistiinpano: ${request.note}`);
  if (request.savings !== null) {
    const estimate = `Säästetty raha: ${f(request.savings)} € · KAM:in antama arvio, ei aineistosta laskettu tai todennettu säästö.`;
    slides.cover.paragraphs.unshift(estimate);
    slides.plan.paragraphs.push(estimate);
  }
  for (const [id, text] of Object.entries(request.managerTexts))
    if (text.trim()) slides[id].paragraphs.push(`KAM:in lisäys: ${text}`);
  for (const id of insightIds)
    slides[id].relevance = globalThis.MeetingModel.relevance(id, request.scope.priority, false);
  const order = orderedSlides(
    globalThis.MeetingModel.slideIds(ctx.order, request.included),
    request.slideOrder,
  );
  return {
    request,
    customer: { name: customer.customer_name, industry: customer.industry },
    period,
    footer,
    slides: order.map((id) => ({
      ...slides[id],
      cooperation: { status: request.cooperation, ...cooperationStates[request.cooperation] },
    })),
  };
}
function orderedSlides(defaultIds, override = []) {
  return [
    ...override.filter((id) => defaultIds.includes(id)),
    ...defaultIds.filter((id) => !override.includes(id)),
  ];
}
export function applyPlan(deck, plan) {
  const allowed = deck.slides.filter((s) => insightIds.includes(s.id)).map((s) => s.id);
  const evidence = allowed.filter((id) => evidenceIds.includes(id));
  if (
    !plan ||
    Object.keys(plan).some((key) => !["order", "headlines"].includes(key)) ||
    !Array.isArray(plan.order) ||
    plan.order.length !== evidence.length ||
    new Set(plan.order).size !== evidence.length ||
    plan.order.some((id) => !evidence.includes(id)) ||
    !Array.isArray(plan.headlines) ||
    plan.headlines.length !== allowed.length
  )
    throw new PresentationError("AI palautti virheellisen diajärjestyksen.", 502);
  const choices = new Map();
  for (const choice of plan.headlines) {
    if (
      !choice ||
      typeof choice !== "object" ||
      Object.keys(choice).some((key) => !["id", "choice"].includes(key))
    )
      throw new PresentationError("AI palautti virheellisen otsikkovalinnan.", 502);
    const slide = deck.slides.find((s) => s.id === choice.id);
    if (
      !allowed.includes(choice.id) ||
      choices.has(choice.id) ||
      !Number.isInteger(choice.choice) ||
      !slide.headlineOptions[choice.choice]
    )
      throw new PresentationError("AI palautti tuntemattoman otsikkovalinnan.", 502);
    choices.set(choice.id, choice.choice);
  }
  const byId = new Map(deck.slides.map((s) => [s.id, s]));
  // Overview and evidence remain compulsory; only approved insight slides are ranked.
  const ids = [
    "cover",
    "overview",
    ...plan.order,
    ...(allowed.includes("opportunity") ? ["opportunity"] : []),
    "plan",
    "sources",
    "limits",
  ];
  return {
    ...deck,
    slides: orderedSlides(ids, deck.request.slideOrder).map((id) => {
      const slide = byId.get(id);
      return {
        ...slide,
        title:
          deck.request.titleEdits[id] ||
          (choices.has(id) ? slide.headlineOptions[choices.get(id)] : slide.title),
      };
    }),
  };
}
export function defaultPlan(deck) {
  const slides = deck.slides.filter((s) => insightIds.includes(s.id));
  return {
    order: slides.filter((s) => evidenceIds.includes(s.id)).map((s) => s.id),
    headlines: slides.map((s) => ({ id: s.id, choice: 0 })),
  };
}
