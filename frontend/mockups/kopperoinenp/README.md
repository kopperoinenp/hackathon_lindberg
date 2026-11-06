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

HTML review download and browser print/PDF are included. Native PowerPoint and
final PDF layout verification remain future work. The current monthly fixture
does not support product drill-down; add a source dimension before offering it.

The summary includes a monthly actual-versus-baseline line chart, country shares,
monthly repair bars and a final-month site scan benchmark/donut. Every chart
uses the current scope. The public website-derived theme, actual logo, local
Libre Franklin font and asset provenance are documented in [BRAND_REVIEW.md](BRAND_REVIEW.md).
The supplied PowerPoint reference is retained unchanged in `docs/references/`.

The meeting goal above the summary changes emphasis using explicit keyword rules,
with neutral ordering for unmatched goals and missing-data notices for unsupported
financial/service goals. Every insight explains its relevance. No generative AI
service is called.

Each customer's first summary visit starts with a chat-style briefing screen.
Submit meeting context/goals or explicitly choose the unweighted default review.
Only then are the summary, charts, composer and presentation action shown. The
completed briefing and goal are stored per customer in browser localStorage and
restored on later visits; they are not shared between browsers or users. Technical
data exploration remains independently accessible. Storage failure falls back to
the current page session with a visible notice.

`Avaa esitys` opens the current HTML slide draft in the browser without downloading.
Navigate with arrows, keyboard arrow keys or the slide outline. Select insights,
edit slide headings and add a meeting note before export. Evidence and limitations
remain mandatory. Preview, HTML download and print/PDF use the same selected content.
Draft edits remain in memory while this page is open; a reload clears them. Scope
changes clear headings and notes, and a customer change also clears the goal and
resets insight selections. Native `.pptx` generation remains future work. Browser
print/PDF page layout has not been visually verified for every possible text length.
