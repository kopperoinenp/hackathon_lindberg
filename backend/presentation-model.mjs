import "../frontend/mockups/kopperoinenp/language.js";
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
    throw new PresentationError("Invalid presentation request.");
  const scope = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    scope[key] = input.scope?.[key] ?? fallback;
    if (typeof scope[key] !== "string" || scope[key].length > 80)
      throw new PresentationError("Invalid filters.");
  }
  if (
    !data.customers.some((c) => c.customer_id === scope.customer) ||
    !data.baselines.some((b) => b.baseline_id === scope.baseline)
  )
    throw new PresentationError("Unknown customer or baseline.");
  if (
    ![scope.from, scope.to].every((m) => /^2025-(0[1-9]|1[0-2])$/.test(m)) ||
    scope.from > scope.to
  )
    throw new PresentationError("Check the presentation date range.");
  if (
    !["all", "Finland", "Sweden", "Poland"].includes(scope.country) ||
    !["all", "Europe"].includes(scope.continent) ||
    !["neutral", "water", "emissions", "circularity", "efficiency"].includes(scope.priority)
  )
    throw new PresentationError("Unknown filter.");
  if (
    scope.site !== "all" &&
    !data.sites.some((s) => s.site_id === scope.site && s.customer_id === scope.customer)
  )
    throw new PresentationError("The site does not belong to this customer.");
  const included = input.included ?? insightIds;
  if (
    !Array.isArray(included) ||
    !included.length ||
    included.length > 4 ||
    new Set(included).size !== included.length ||
    included.some((id) => !insightIds.includes(id))
  )
    throw new PresentationError("Select at least one available insight.");
  const note = input.note ?? "";
  if (typeof note !== "string" || note.length > 2000)
    throw new PresentationError("The note is too long.");
  const titleEdits = {};
  if (
    input.titleEdits != null &&
    (typeof input.titleEdits !== "object" || Array.isArray(input.titleEdits))
  )
    throw new PresentationError("Invalid slide titles.");
  for (const [id, title] of Object.entries(input.titleEdits || {})) {
    if (
      !["cover", "overview", ...insightIds, "plan", "sources", "limits"].includes(id) ||
      typeof title !== "string" ||
      title.length > 150
    )
      throw new PresentationError("Invalid slide title.");
    if (title.trim()) titleEdits[id] = title.trim();
  }
  const slideOrder = input.slideOrder ?? [];
  if (
    !Array.isArray(slideOrder) ||
    slideOrder.length > slideIds.length ||
    new Set(slideOrder).size !== slideOrder.length ||
    slideOrder.some((id) => !slideIds.includes(id))
  )
    throw new PresentationError("Invalid custom slide order.");
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
    language: input.language === "fi" ? "fi" : "en",
    cooperation,
    savings,
    managerTexts: { ...managerTexts },
  };
}
export function buildPresentation(input) {
  const request = validateRequest(input);
  const t = globalThis.ReviewLanguage.translator(request.language);
  const f = (value, digits = 0) =>
    new Intl.NumberFormat(t("en-GB"), { maximumFractionDigits: digits }).format(value);
  const ctx = globalThis.WorkspaceModel.buildContext(data, request.scope);
  const { metrics: m, compare: c, baseline: b, focus, customer } = ctx;
  if (!m.hasData) throw new PresentationError("No data matches the filters.");
  const period = `${request.scope.from} – ${request.scope.to}`;
  const baseline = {
    B_LOCAL: t("local outsourced laundry"),
    B_HOME: t("home laundering"),
    B_INHOUSE: t("in-house laundry"),
  }[request.scope.baseline];
  const scopeName =
    request.scope.site !== "all"
      ? focus.site_name
      : request.scope.country !== "all"
        ? t(globalThis.WorkspaceModel.countryNames[request.scope.country])
        : t("All sites");
  const footer = t`Synthetic data · ${scopeName} · ${period} · Baseline: ${baseline}`;
  const difference = (delta, pct) => `${delta >= 0 ? "−" : "+"}${f(Math.abs(pct))} %`;
  const slides = {
    cover: {
      id: "cover",
      kind: "cover",
      title: customer.customer_name,
      paragraphs: [
        t("Key results and shared priorities for 2026."),
        `${m.sites} ${t(m.sites === 1 ? "site" : "sites")}`,
        t("Water use, laundry and delivery emissions, textile care, and a proposed improvement."),
      ],
    },
    overview: {
      id: "overview",
      kind: "overview",
      title: t("Service use and care at a glance"),
      facts: [
        { label: t("Sites"), value: f(m.sites) },
        { label: t("Allocated textiles"), value: f(m.allocated) },
        { label: t("Actively scanned"), value: f(m.scanned) },
        { label: t("Kilograms washed"), value: f(m.kg) },
        { label: t("Repair events"), value: f(m.repairs) },
        {
          label: t("Scan coverage"),
          value: m.utilization == null ? t("Unavailable") : f(m.utilization, 1) + " %",
        },
      ],
      paragraphs: [
        t`Textile counts and scan coverage reflect ${m.snapshotMonth}. Washed weight and repairs cover the full period. Scan coverage helps identify where to investigate actual use.`,
        t(
          "For service and product breakdowns, see Explore data in the workspace. Unique wearer counts require person identifiers.",
        ),
      ],
      source: "Sites, Service_Activity, Repairs",
      boundary: t("Shared evidence · inventory snapshots and period totals"),
    },
    water: {
      id: "water",
      kind: "comparison",
      title:
        c.waterDifference >= 0
          ? t("Less water for the same wash volume")
          : t("Water consumption exceeds the baseline"),
      headlineOptions: [
        c.waterDifference >= 0
          ? t("Less water for the same wash volume")
          : t("Water consumption exceeds the baseline"),
        t("Water use in the selected period"),
      ],
      value: difference(c.waterDifference, c.waterPercent),
      paragraphs: [
        t`Allocated water consumption was ${f(m.water / 1000)} m³. The difference versus the baseline is ${f(Math.abs(c.waterDifference) / 1000)} m³.`,
      ],
      chart: {
        labels: ["Lindström", t("Baseline")],
        values: [m.water / 1000, c.baselineWater / 1000],
        unit: "m³",
      },
      source: "Customer_Impacts, Baselines",
      boundary: t("Calculated estimate · water used for washing"),
    },
    emissions: {
      id: "emissions",
      kind: "comparison",
      title:
        c.emissionsDifference >= 0
          ? t("Lower laundry and delivery footprint")
          : t("Laundry and delivery emissions exceed the baseline"),
      headlineOptions: [
        c.emissionsDifference >= 0
          ? t("Lower laundry and delivery footprint")
          : t("Laundry and delivery emissions exceed the baseline"),
        t("Climate impact of laundry and delivery"),
      ],
      value: difference(c.emissionsDifference, c.emissionsPercent),
      paragraphs: [
        t`Estimated laundry and delivery emissions were ${f(m.emissions / 1000, 1)} t CO₂e. The difference versus the baseline is ${f(Math.abs(c.emissionsDifference) / 1000, 1)} t CO₂e.`,
      ],
      chart: {
        labels: ["Lindström", t("Baseline")],
        values: [m.emissions / 1000, c.baselineEmissions / 1000],
        unit: "t CO₂e",
      },
      source: "Customer_Impacts, Baselines",
      boundary: t("Calculated estimate · laundry and delivery"),
    },
    repairs: {
      id: "repairs",
      kind: "repairs",
      title: t("Repairs help textiles last longer"),
      headlineOptions: [
        t("Repairs help textiles last longer"),
        t("Repair activity in the selected period"),
      ],
      value: f(m.repairs),
      paragraphs: [
        t(
          "The count shows recorded repairs. Avoided purchases and emissions require separate evidence.",
        ),
      ],
      chart: {
        labels: globalThis.WorkspaceModel.series(ctx, "repairs").map((p) => p.month.slice(5)),
        values: globalThis.WorkspaceModel.series(ctx, "repairs").map((p) => p.value),
        unit: "items",
      },
      source: "Repairs",
      boundary: t("Synthetic count of repair events"),
    },
    opportunity: {
      id: "opportunity",
      kind: "opportunity",
      title: t("Check actual textile demand"),
      headlineOptions: [
        t("Check actual textile demand"),
        t("Use scan coverage to guide a joint review"),
      ],
      paragraphs: [
        request.language === "fi"
          ? `${focus.site_name}: ${f(focus.utilization, 1)} % allokoiduista tekstiileistä skannattiin kuussa ${m.snapshotMonth}. Skannaamatta jäi ${f(focus.unscanned)} tekstiiliä.`
          : `${focus.site_name}: ${f(focus.utilization, 1)}% of allocated textiles had an active scan in ${m.snapshotMonth}. ${f(focus.unscanned)} textiles had no scan.`,
        t("Check reserve stock, seasonal demand and scan data coverage to understand actual use."),
      ],
      chart: {
        labels: [t("Scanned"), t("Unscanned")],
        values: [focus.scanned, focus.unscanned],
        unit: "items",
      },
      source: `Service_Activity, ${m.snapshotMonth}`,
      boundary: t("Snapshot for investigation"),
    },
    plan: {
      id: "plan",
      kind: "text",
      title: t("Shared priorities for 2026"),
      paragraphs: [
        t`Review ${focus.site_name} with the customer. Check reserve stock needs and scan coverage.`,
        t(
          "Agree on one improvement and assign an owner. Confirm demand before changing allocations.",
        ),
        t(
          "Review progress at the next meeting. Estimate potential savings once the inputs have been agreed.",
        ),
      ],
      boundary: t("Proposals for discussion."),
    },
    sources: {
      id: "sources",
      kind: "text",
      title: t("Sources and calculations"),
      paragraphs: [
        "Source: Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx. Customers, Sites, Service_Activity, Customer_Impacts, Repairs and Baselines.",
        t`Period totals sum activity across the selected months. Allocations and scans reflect the end of ${m.snapshotMonth}. Repairs count events.`,
        t`Water difference: ${f(m.kg, 1)} kg washed × ${f(b.water_l_per_kg, 2)} l/kg − ${f(m.water)} l = ${f(c.waterDifference)} l. Emissions difference: the same washed weight × ${f(b.process_kgco2e_per_kg + b.delivery_kgco2e_per_kg, 3)} kg CO₂e/kg − ${f(m.emissions)} kg CO₂e = ${f(c.emissionsDifference)} kg CO₂e.`,
      ],
    },
    limits: {
      id: "limits",
      kind: "text",
      title: t("Interpretation limits"),
      paragraphs: [
        t(
          "All customer figures are synthetic. Water and emissions are allocated estimates from laundry-level data. The baseline represents an illustrative laundry model.",
        ),
        t(
          "The comparison covers water used in washing and laundry and delivery emissions. Repair impact estimates are separate. Baseline factors are fixed for each scenario.",
        ),
        t(
          "Scan coverage guides investigation. Unique wearer counts and financial savings require more data. Industry focus is a discussion aid.",
        ),
      ],
    },
  };
  if (request.note) slides.plan.paragraphs.push(t`Account manager's note: ${request.note}`);
  if (request.savings !== null) {
    const estimate = t`Säästetty raha: ${f(request.savings)} € · KAM:in antama arvio, ei aineistosta laskettu tai todennettu säästö.`;
    slides.cover.paragraphs.unshift(estimate);
    slides.plan.paragraphs.push(estimate);
  }
  for (const [id, text] of Object.entries(request.managerTexts))
    if (text.trim()) slides[id].paragraphs.push(t`KAM:in lisäys: ${text}`);
  for (const id of insightIds)
    slides[id].relevance = globalThis.MeetingModel.relevance(
      id,
      request.scope.priority,
      false,
      request.language,
    );
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
      cooperation: {
        status: request.cooperation,
        ...cooperationStates[request.cooperation],
        label: t(cooperationStates[request.cooperation].label),
      },
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
    throw new PresentationError("The AI service returned an invalid slide order.", 502);
  const choices = new Map();
  for (const choice of plan.headlines) {
    if (
      !choice ||
      typeof choice !== "object" ||
      Object.keys(choice).some((key) => !["id", "choice"].includes(key))
    )
      throw new PresentationError("The AI service returned an invalid headline choice.", 502);
    const slide = deck.slides.find((s) => s.id === choice.id);
    if (
      !allowed.includes(choice.id) ||
      choices.has(choice.id) ||
      !Number.isInteger(choice.choice) ||
      !slide.headlineOptions[choice.choice]
    )
      throw new PresentationError("The AI service returned an unknown headline choice.", 502);
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
