/* Deterministic discovery proposals; no inferred contracts or financial benefits. */
(function (root) {
  "use strict";
  const kinds = ["allocation", "repair", "hygiene", "wipers"];
  function proposals(data, scope, language = "en") {
    const customer = data.customers.find((row) => row.customer_id === scope.customer);
    if (!customer) return [];
    const rows = root.WorkspaceModel.select(data, scope);
    if (!rows.length) return [];
    const metrics = root.WorkspaceModel.summarize(rows);
    const sites = data.sites.filter((site) => rows.some((row) => row.site === site.site_id));
    const fi = language === "fi";
    const text = (en, finnish) => (fi ? finnish : en);
    const f = (n) =>
      new Intl.NumberFormat(fi ? "fi-FI" : "en-GB", { maximumFractionDigits: 1 }).format(n);
    const period = `${scope.from} – ${scope.to}`;
    const common = {
      sites: sites.map((site) => site.site_name).join(", "),
      siteSummary: `${sites
        .slice(0, 3)
        .map((site) => site.site_name)
        .join(
          ", ",
        )}${sites.length > 3 ? text(` + ${sites.length - 3} other sites`, ` + ${sites.length - 3} muuta toimipistettä`) : ""}`,
      source: `${data.source} · Customers, Sites, Service_Activity, Repairs · ${period}`,
      boundary: text(
        "Synthetic data. Confirm need, existing contract coverage, local availability and pricing before proposing a purchase. Benefits have not been verified.",
        "Synteettinen aineisto. Varmista tarve, nykyinen sopimus, paikallinen saatavuus ja hinnoittelu ennen ostoehdotusta. Hyötyjä ei ole todennettu.",
      ),
    };
    const result = [];
    function add(kind, title, observation, benefit, nextStep, evidence) {
      // Bind approval to customer, scope and the actual supporting data, independent of language.
      const evidenceKey = JSON.stringify([
        scope.customer,
        scope.from,
        scope.to,
        scope.country ?? "all",
        scope.continent ?? "all",
        scope.site ?? "all",
        customer.industry,
        sites.map((s) => [s.site_id, s.site_name]),
        evidence,
      ]);
      result.push({
        ...common,
        id: `${scope.customer}:${kind}`,
        title,
        observation,
        benefit,
        nextStep,
        evidenceKey,
      });
    }
    if (metrics.allocated > 0 && metrics.utilization < 85) {
      add(
        "allocation",
        text("Textile allocation assessment", "Tekstiilimitoituksen kartoitus"),
        text(
          `${f(metrics.unscanned)} of ${f(metrics.allocated)} allocated textiles had no active scan in ${metrics.snapshotMonth} (${f(metrics.utilization)}% scanned).`,
          `${f(metrics.unscanned)} / ${f(metrics.allocated)} allokoidulla tekstiilillä ei ollut aktiivista skannausta kuukaudella ${metrics.snapshotMonth} (skannausosuus ${f(metrics.utilization)} %).`,
        ),
        text(
          "Assess whether textile allocation and replenishment match demand.",
          "Selvitetään, vastaavatko tekstiilimäärät ja täydennykset tarvetta.",
        ),
        text(
          "Review reserve stock, seasonality and scan completeness. Agree the scope and price of an assessment before changing allocations.",
          "Tarkista varavaatteet, kausivaihtelu ja skannaustietojen kattavuus. Sovi kartoituksen laajuus ja hinta ennen määrien muuttamista.",
        ),
        [metrics.snapshotMonth, metrics.allocated, metrics.scanned],
      );
    }
    if (metrics.repairs > 0) {
      add(
        "repair",
        text("Assess repair service expansion", "Korjauspalvelun laajennuksen kartoitus"),
        text(
          `${f(metrics.repairs)} repair events were recorded during ${period} across ${sites.length} sites.`,
          `Jaksolla ${period} kirjattiin ${f(metrics.repairs)} korjaustapahtumaa ${sites.length} toimipisteessä.`,
        ),
        text(
          "Explore whether repair coverage could be extended to more garments or sites.",
          "Selvitetään, voisiko korjauspalvelua laajentaa uusiin vaateryhmiin tai toimipisteisiin.",
        ),
        text(
          "Review current repair coverage and unmet needs with the customer; agree a pilot only if an additional need exists.",
          "Käy nykyinen korjauspalvelu ja kattamatta jäävät tarpeet läpi asiakkaan kanssa. Sovi pilotti vain todettuun lisätarpeeseen.",
        ),
        [metrics.repairs],
      );
    }
    if (["Food & Beverage", "Healthcare", "Manufacturing"].includes(customer.industry)) {
      const industrial = customer.industry === "Manufacturing";
      add(
        industrial ? "wipers" : "hygiene",
        industrial
          ? text("Industrial wiper needs assessment", "Teollisuuspyyhkeiden tarvekartoitus")
          : text("Hygiene service needs assessment", "Hygieniapalvelujen tarvekartoitus"),
        text(
          `Customer industry: ${customer.industry}. The selected workwear data covers ${sites.length} sites.`,
          `Asiakkaan toimiala: ${customer.industry}. Valittu työvaateaineisto kattaa ${sites.length} toimipistettä.`,
        ),
        industrial
          ? text(
              "Investigate reusable industrial wipers if the customer's processes require wiping.",
              "Selvitetään uudelleenkäytettävien teollisuuspyyhkeiden soveltuvuus, jos asiakkaan prosesseissa tarvitaan pyyhintää.",
            )
          : text(
              "Investigate whether the sites have unmet WC hygiene service needs.",
              "Selvitetään, onko toimipisteissä kattamattomia WC-hygieniapalvelujen tarpeita.",
            ),
        text(
          "Industry is a discovery signal, not proof of need. Confirm current supplier, actual use and local service availability, then agree a site assessment.",
          "Toimiala on kartoitussignaali, ei todiste tarpeesta. Varmista nykyinen toimittaja, todellinen käyttötarve ja paikallinen saatavuus. Sovi sitten toimipistekartoitus.",
        ),
        sites.map((site) => site.site_id),
      );
    }
    return result;
  }
  function approved(proposals, approvals = []) {
    return proposals.filter((proposal) =>
      approvals.some(
        (approval) => approval.id === proposal.id && approval.evidenceKey === proposal.evidenceKey,
      ),
    );
  }
  function validApprovals(approvals, customer) {
    return (
      Array.isArray(approvals) &&
      approvals.length <= kinds.length &&
      new Set(approvals.map((a) => a?.id)).size === approvals.length &&
      approvals.every(
        (a) =>
          a &&
          typeof a === "object" &&
          Object.keys(a).every((k) => ["id", "evidenceKey"].includes(k)) &&
          kinds.some((kind) => a.id === `${customer}:${kind}`) &&
          typeof a.evidenceKey === "string" &&
          a.evidenceKey.length <= 4000,
      )
    );
  }
  root.UpsellModel = { proposals, approved, validApprovals };
})(globalThis);
