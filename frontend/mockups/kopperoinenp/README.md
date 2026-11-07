# Account manager workspace

Human owner: kopperoinenp. This is the single maintained mock for this owner.
Earlier v1/v2 directories have been removed at the task owner's request.
A local Node backend serves AI editing and PowerPoint export. No production storage
or frontend framework is included.

Run `pnpm preview` from the repository root. Open the printed local URL to use the API integration.
Runtime files are plain HTML/CSS/JS.

Chat edits immediately update dashboard headings, metric selections, manager
comments, meeting goals and savings estimates. The page
scrolls to the changed section and briefly highlights it; chat lists the changes.
Slide commentary is mirrored in the matching dashboard card. The customer name
stays factual even when the overview slide heading is customized. These edits
also remain in the presentation request. The relationship rating can be set via
chat and appears on the presentation slides.

The review keeps a common evidence structure across customers. Use **Manage
contract KPIs** to add or edit up to 12 customer-specific measures with an
optional actual, target and source or reporting period. Highlight up to three
for the meeting agenda. Entries are scoped to the selected customer and kept
in the current page session. Enable **Include highlighted KPIs in the
presentation** to append the current agenda to the existing presentation
note. Measures are entered by the KAM, and missing actuals show as unavailable.

The shared evidence checklist covers the nine review areas. The separate
emissions-intensity comparison uses project-supplied company figures. The
unweighted four-peer mean is 0.3225 kg emissions per euro of turnover versus
0.28 for Lindström, about 13% lower. The reporting year and emissions scopes
are unverified. The comparison is separate from synthetic customer impact
and is displayed in the dashboard's evidence section.

The dashboard starts with whole-customer basic information: industry, home country,
all sites/countries and allocated textile stock from the customer's latest month.
Expand the locations list for each site's stock. This overview is independent of
review filters. The snapshot date and synthetic status are explicit; this is not
live inventory. Missing site data is unknown and the total is marked partial,
rather than carrying forward older stock or summing multiple months.

The top menu switches two panels in the same page:

- **Asiakaskatsaus:** automatically ordered visual findings, a site investigation,
  proposed next actions and the customer-review preview. Its chat input stays fixed
  to the bottom of the viewport; responses appear above it without a modal.
- **Tutki dataa:** reporting months, continent, country, site, baseline and priority;
  metric selection, monthly charts, country breakdown and a site comparison table.

Both panels and exported reviews use the same selected scope. The summary always
shows its geography and period. Switching views preserves the selection and notes.
Changing the customer, time, geography or baseline clears scope-specific notes.
Invalid periods and empty selections display a missing-data state and disable export.

Chat examples: `Näytä Suomen tammi–maaliskuu 2025 ja painota päästöjä`,
`Entä Ruotsi?`, `Näytä vain vesi ja päästöt`, `Vaihda otsikoksi Vuoden asiakasarvo`.
The AI interprets instructions into a typed patch; the backend validates all edits.
The chat only acknowledges `Done` or `No changes.`; failures show a short error.

The source workbook is tracked unchanged in `data/source/`. Its three fictional
customers have sites in Finland, Sweden and Poland, all in Europe. No other
countries, continents or years are offered as available data.

Calculations in `analysis-model.js` filter source monthly site records first.
Flow metrics (water, washed kg, process/delivery emissions, repairs) are summed
over selected months. Stock metrics (allocation, scanning) use the latest selected
month, never the sum of snapshots. Scan ratios use total scans / total allocation,
not an unweighted average of percentages. Charts reconcile to selected totals.

Water and emissions are synthetic allocated estimates. Baseline differences use
the same selected washed kg times the chosen synthetic baseline coefficients.
Scan coverage is not proof of idle stock. Repair events are not distinct garments
or verified avoided purchases. No repair handprint is added to process/logistics
differences. Financial savings and unique wearer counts are not fabricated.

Rebuild the fixture with `python frontend/mockups/kopperoinenp/extract_fixture.py
data/source/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx` (one command).
The Node reference tests, filter/stock/chart tests, preview smoke test and normal
Ruff/ESLint/Prettier checks run with `pnpm check`. See root `QUALITY.md`.

HTML review download and browser print/PDF are included. Editable native PowerPoint export is available through the local presentation
service. Final PDF layout verification remains future work. The detailed analysis also uses product-level records and recorded service cycles.

The summary includes a monthly actual-versus-baseline line chart, country shares,
monthly repair bars and a final-month site scan benchmark/donut. Every chart
uses the current scope. The public website-derived theme, actual logo, local
Libre Franklin font and asset provenance are documented in [BRAND_REVIEW.md](BRAND_REVIEW.md).
The supplied PowerPoint reference is retained unchanged in `docs/references/`.

The customer summary opens immediately with neutral default ordering, with no
briefing form or required goals. Previously saved browser briefings are ignored.
Users can adjust emphasis through the AI editing chat or detailed analysis controls.
Every insight explains its relevance; all calculations remain deterministic.

`Open presentation` prepares the current review and opens it in a separate browser tab.
The adjacent icon downloads the genuine editable PowerPoint. The viewer shows
one slide at a time with arrows and a download icon, using the same validated
content as the PPTX. Content/scope changes invalidate an older download link.
Ready unchanged reviews are reused for ten minutes without another model call.

The current interface is approved as the product baseline (docs/UI_BASELINE.md).
OpenAI and Copilot are interchangeable behind the backend presentation-plan
contract. The summary editing chat and presentation planning
use separate strict schemas through the shared AI adapter. API keys never enter this frontend.

## Detailed calculation models

The workbook importer checks unique keys and dimension references, matches activity
and impacts by month/customer/site/laundry/product, and aggregates repairs before
joining them. Invalid required numeric values stop regeneration. Missing repair
rows represent zero recorded repair events. Existing site/month totals derive
from the same validated rows.

- Product inventory and scan coverage use the last month of the selected scope.
  Wash frequency is period wash events divided by the sum of monthly allocated
  pieces. Repair frequency is events per 100 washes. Resource intensity uses
  total litres or kWh divided by total washed kilograms.
- Recorded service cycles belong to their pickup month. The importer reads Excel
  serial timestamps and checks cycle durations against pickup and delivery.
  P90 uses nearest rank and lateness uses the source flags. Service requests are
  counts of logged requests. Contract-level service targets need separate data.
- Energy compares allocated kWh to the same washed kilograms multiplied by the
  selected baseline coefficient. Waste uses allocated customer waste and the
  corresponding laundry-month treatment mix, normalized to reconcile with the
  allocated total.
- Repair scenarios use 0%, 50% and 100% of the workbook's assumed replacement
  postponement and product footprint. The middle factor is illustrative.
  Scenario estimates are separate from laundry and delivery emissions.
- Unique wearer and verified financial/commercial comparisons require additional
  source data. Detailed metrics currently appear in the analyst tab.
