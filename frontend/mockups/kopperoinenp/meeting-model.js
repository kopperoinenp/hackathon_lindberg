/* Meeting intent and slide selection never alter the numerical evidence. */
(function (root) {
  "use strict";
  const insightIds = ["water", "emissions", "repairs", "opportunity"];
  function relevance(id, priority, hasGoal, language = "en") {
    const t =
      root.ReviewLanguage?.translator(language) ??
      ((text, ...values) =>
        typeof text === "string" ? text : String.raw({ raw: text }, ...values));
    const lead = hasGoal
      ? t("Given the meeting goal and chosen focus,")
      : t("Given the current focus,");
    return {
      water:
        priority === "water"
          ? t`${lead} water use is a key discussion point. The comparison uses the same washed weight.`
          : t(
              "Water use adds context to the environmental results. Review the baseline assumptions together.",
            ),
      emissions:
        priority === "emissions"
          ? t`${lead} laundry and delivery emissions come first. Use the comparison scope when discussing the results.`
          : t(
              "Laundry and delivery emissions add another view of environmental impact within the selected scope.",
            ),
      repairs: ["circularity", "efficiency"].includes(priority)
        ? t`${lead} repair activity shows how textiles are maintained and supports a discussion about service life.`
        : t(
            "Repair counts show maintenance activity alongside environmental estimates and help discuss continued use.",
          ),
      opportunity: t(
        "This site has the lowest scan coverage in the selection. Start here when checking garment availability and data coverage.",
      ),
    }[id];
  }
  function slideIds(order, included) {
    const selected = new Set(included.filter((id) => insightIds.includes(id)));
    return [
      "cover",
      "overview",
      ...order.filter((id) => selected.has(id)),
      ...(selected.has("opportunity") ? ["opportunity"] : []),
      "plan",
      "sources",
      "limits",
    ];
  }
  function selectionCommand(text) {
    const lower = text.toLocaleLowerCase("fi");
    if (/lisää (esitykseen|katsaukseen|muistiinpano(?:ksi)?)\s*:/.test(lower)) return null;
    const id = /päästö|ilmasto/.test(lower)
      ? "emissions"
      : /vesi|veden/.test(lower)
        ? "water"
        : /korja|kierto/.test(lower)
          ? "repairs"
          : /kehitys|mitoit|toimipaikan havainto/.test(lower)
            ? "opportunity"
            : null;
    if (!id || !/esit|dia|katsau/.test(lower)) return null;
    if (/poista|jätä.*pois/.test(lower)) return { id, include: false };
    if (/lisää|ota.*mukaan/.test(lower)) return { id, include: true };
    return null;
  }
  root.MeetingModel = { insightIds, relevance, slideIds, selectionCommand };
})(globalThis);
