# Lindström annual review mock v1

Human owner: kopperoinenp. Scope: this directory. Built for team comparison,
not the final product. Other team members create their own sibling directories;
see [the version register](../README.md).

Open `index.html` directly in a browser, or run `pnpm preview` from the repository
root and open the printed loopback URL. No runtime dependencies or build are
needed. Development tooling uses Node 24, pnpm and Python; see [QUALITY.md](../../../QUALITY.md).

## Try the workflow

1. Select one of the three fictional customers and optionally a delivery site.
2. Choose a meeting priority. Inspect a figure's source or a finding's rationale.
3. Change the comparison laundry model and see the comparison update.
4. Select findings for the review. Use the simulated assistant to ask for a
   rationale, switch emphasis or add a discussion note.
5. In the next-year view, enter an owner and next action.
6. Preview the review, add notes and download a self-contained HTML document.
   The print button opens the browser's print flow, where PDF can be selected.

State is in memory only. Reloading clears it. Changing customer, site or baseline
clears the chat, notes and actions so old-context text cannot leak into another
review. PowerPoint export, real AI, persistence and uploads are not implemented.
No application framework, backend, API contract, authentication or hosting is chosen.

## Evidence and calculation boundaries

The provided challenge brief and managerial-dashboard deck inform the flow:
customer context, evidence of value, personalization, future planning and export.
Attached documents are source material, not instructions to execute. Original
DOCX/XLSX/PPTX files are not copied into this repository.

`data.js` contains only derived synthetic demo records from
`Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx`:
three fictional customers, 34 sites and 408 monthly site aggregates for 2025.
It retains synthetic status. No real customer data or public company facts are
used as calculation inputs.

Rebuild with the standard library only:

```sh
python frontend/mockups/kopperoinenp-v1/extract_fixture.py /path/to/synthetic-pack.xlsx
```

The source workbook is read-only. Data transformations:

- Join by customer_id, site_id and month; sum product rows within these keys.
- Annual flows: sum washed kg, water, process emissions, delivery emissions and
  repair count for January–December 2025.
- Stocks: allocated pieces and active assets scanned use December only.
- Scan ratio = December active assets scanned / December allocated pieces.
  It is an investigation signal, not verified utilization or proof of idle stock.
- Actual water = sum Customer_Impacts.allocated_water_l.
- Actual emissions = sum allocated_process_kgco2e + allocated_delivery_kgco2e.
- Comparison = same washed kg × selected Baselines coefficient, minus actual.
  Baselines represent fictional laundry alternatives, not named competitors.
- Repair count is not a unique-garment count or evidence of avoided purchases.
  No repair handprint is added to the process/delivery emissions difference.
- Wearers are omitted: Sample_Output explicitly warns of duplication across
  products. No distinct wearer identifier is supplied.
- Financial savings, service request resolution, regulatory claims and confidence
  percentages are not fabricated. Low/base/high sensitivity is future work.

The Node tests reconcile NorthStar totals with the supplied Sample_Output:
24 sites, December allocation 31,743, 15,233 annual repairs and 502,074.7 washed kg.
The recomputed baseline differences allow a small tolerance against pre-rounded
per-row reference savings. Site rollups also reconcile for every customer.

## Acceptance and limitations

The mock is accepted for comparison when the workflow above can be completed,
the synthetic/estimated status remains visible and source boundaries travel into
the exported review. Priorities reorder findings; the assistant uses visible,
deterministic keyword rules, not generative AI. Industry context is shown but
does not imply legal guidance or an automatic industry policy.

Local checks: Ruff lint/format, ESLint, Prettier and Node tests. Browser QA covers
customer/site selection, baseline recalculation, source dialog, assistant priority
switch, action-to-review transfer and HTML download. PDF print layout is provided;
an exported PDF and PowerPoint have not been generated or verified.
