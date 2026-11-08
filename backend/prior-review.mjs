// Fixed archive snapshot from the 2024 synthetic fixture. The targets are demo assumptions.
export const priorReview = {
  customerId: "CUST002",
  customerName: "Apex Industrial Systems",
  year: 2024,
  goals: [
    {
      metric: "water",
      label: "Water per kg washed",
      actual: 6.938476,
      target: 7,
      unit: "L/kg",
      digits: 2,
      lower: true,
    },
    {
      metric: "emissions",
      label: "Emissions per kg washed",
      actual: 0.085601,
      target: 0.08,
      unit: "kg CO₂e/kg",
      digits: 4,
      lower: true,
    },
    { label: "Recorded repairs", actual: 5556, target: 5500, unit: "", digits: 0, lower: false },
  ],
};

export function priorGoalsSlide(customerId, t) {
  if (customerId !== priorReview.customerId) return null;
  const kpis = priorReview.goals.map(({ label, actual, target, unit, digits, lower }) => {
    const number = new Intl.NumberFormat(t("en-GB"), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    const format = (value) => [number.format(value), unit].filter(Boolean).join(" ");
    const met = lower ? actual <= target : actual >= target;
    const difference = new Intl.NumberFormat(t("en-GB"), {
      style: "percent",
      signDisplay: "exceptZero",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format((actual - target) / target);
    return {
      label: t(label),
      target: `${lower ? "≤" : "≥"} ${format(target)}`,
      value: format(actual),
      delta: difference,
      tone: met ? "better" : "worse",
    };
  });
  return {
    id: "prior-goals",
    kind: "text",
    layout: "goals",
    kicker: t`A look back at the ${priorReview.year} goals`,
    title: t("Goals and results"),
    boundary: t("The figures cover all Apex sites in 2024. The targets are fictional examples."),
    kpis,
    paragraphs: kpis.map(
      ({ label, target, value, delta, tone }) =>
        `${label} · ${t("Target")} ${target} · ${t("Actual")} ${value} · ${delta} ${t("vs target")} · ${t(tone === "better" ? "Target met" : "Target missed")}`,
    ),
  };
}
