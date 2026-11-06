# Account manager workspace

Human owner: kopperoinenp. This is the single maintained mock for this owner.
Earlier v1/v2 directories have been removed at the task owner's request.
No backend, external AI, production storage or framework is included.

Run `pnpm preview` from the repository root. Open the printed local URL, or open
this directory's `index.html` directly. Runtime files are plain HTML/CSS/JS.

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

Supported simulated chat examples: `keskity päästöihin`, `näytä Turun tilanne`,
`rajaa Suomeen 2025-01 2025-03`, `näytä kaikki toimipaikat`, `vertaa kotipesuun`,
`lisää esitykseen: sovitaan seuranta asiakkaan kanssa`.
Other requests receive a limitation message rather than an invented analysis.

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
service. Final PDF layout verification remains future work. The current monthly fixture
does not support product drill-down; add a source dimension before offering it.

The summary includes a monthly actual-versus-baseline line chart, country shares,
monthly repair bars and a final-month site scan benchmark/donut. Every chart
uses the current scope. The public website-derived theme, actual logo, local
Libre Franklin font and asset provenance are documented in [BRAND_REVIEW.md](BRAND_REVIEW.md).
The supplied PowerPoint reference is retained unchanged in `docs/references/`.

The customer summary opens immediately with neutral default ordering, with no
briefing form or required goals. Previously saved browser briefings are ignored.
Users can adjust emphasis through the simulated chat or detailed analysis controls.
Every insight explains its relevance. No generative AI service is called.

`Avaa esitys` prepares the current review and opens it in a separate browser tab.
The adjacent icon downloads the genuine editable PowerPoint. The viewer shows
one slide at a time with arrows and a download icon, using the same validated
content as the PPTX. Content/scope changes invalidate an older download link.
Ready unchanged reviews are reused for ten minutes without another model call.

The current interface is approved as the product baseline (docs/UI_BASELINE.md).
OpenAI and Copilot are interchangeable behind the backend presentation-plan
contract. The main summary chat remains simulated; only presentation planning
is connected to AI in this first integration. API keys never enter this frontend.
