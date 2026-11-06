/* Meeting intent and slide selection never alter the numerical evidence. */
(function (root) {
  "use strict";
  const insightIds = ["water", "emissions", "repairs", "opportunity"];
  function goalFocus(goal, fallback) {
    const text = goal.toLocaleLowerCase("fi");
    const priority = /vesi|veden|vettä/.test(text)
      ? "water"
      : /päästö|ilmasto|hiili/.test(text)
        ? "emissions"
        : /korja|kierto|käyttöikä/.test(text)
          ? "circularity"
          : /käyt|mitoit|kustann|euro/.test(text)
            ? "efficiency"
            : fallback;
    const gap = /kustann|euro|hinta/.test(text)
      ? "Euromääräisiä säästöjä ei voida osoittaa nykyisillä lähtötiedoilla. Tarkastelemme käytön ja mitoituksen havaintoja."
      : /toimitusvarmu|palvelutaso|hygienia/.test(text)
        ? "Palvelutason tai hygienian toteutumista ei mitata tässä mockissa. Ne vaativat lisää lähtötietoja."
        : "";
    return { priority, gap };
  }
  function relevance(id, priority, hasGoal) {
    const lead = hasGoal
      ? "Palaverin tavoitteen ja valitun painotuksen perusteella"
      : "Asiakkaan nykyisen painotuksen perusteella";
    return {
      water:
        priority === "water"
          ? `${lead} vedenkäytön vertailu on keskeinen keskustelukohta. Sama pesty määrä tekee vertailun rajauksesta ymmärrettävän.`
          : "Vedenkäyttö täydentää asiakkaan saaman ympäristöarvon kuvaa. Vertailumallin oletukset on hyvä käydä yhdessä läpi.",
      emissions:
        priority === "emissions"
          ? `${lead} pesun ja toimitusten ilmastovaikutus nostetaan esiin ensin. Tuloksen rajaus auttaa välttämään liian laajoja päästöväitteitä.`
          : "Pesun ja toimitusten päästöt tuovat toisen näkökulman ympäristöarvoon. Tulos koskee tätä rajausta, ei koko tekstiilin elinkaarta.",
      repairs: ["circularity", "efficiency"].includes(priority)
        ? `${lead} korjaustoiminta tekee tekstiilien huollon näkyväksi. Se tukee keskustelua käyttöiästä ilman oletusta vältetyistä hankinnoista.`
        : "Korjaukset näyttävät konkreettista huoltotoimintaa ympäristöarvioiden rinnalla. Määrä kannattaa yhdistää keskusteluun tekstiilien jatkokäytöstä.",
      opportunity:
        "Tällä toimipaikalla on rajauksen pienin skannausosuus. Siksi siitä kannattaa aloittaa tarpeen ja datan kattavuuden yhteinen tarkistus.",
    }[id];
  }
  function slideIds(order, included) {
    const selected = new Set(included.filter((id) => insightIds.includes(id)));
    return [
      "cover",
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
  root.MeetingModel = { insightIds, goalFocus, relevance, slideIds, selectionCommand };
})(globalThis);
