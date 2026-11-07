# Financial data for the Customer review (proposal)

Status: proposal from branch `feature/evidence-blocks`, waiting for the data owner.
The dashboard already reads this shape. Until the fixture contains it, the
Financial value block shows "To be agreed together" and no figures are invented.

## Expected fixture table

`REVIEW_DATA.financials` is a list of monthly rows:

| Field                  | Required | Meaning                                                         |
| ---------------------- | -------- | --------------------------------------------------------------- |
| `customer`             | yes      | Customer ID, e.g. `CUST001`.                                    |
| `month`                | yes      | `YYYY-MM`. Include the previous year for year-over-year change. |
| `site`                 | no       | Site ID. Without it the row counts for the whole customer.      |
| `invoiced_eur`         | yes      | Synthetic invoiced service cost in euros for that month.        |
| `verified_savings_eur` | no       | Savings agreed or verified with the customer.                   |

Rows follow the review filters: customer, period and, when `site` is present,
site and country. Field names are defined once in `financialFields` in
`frontend/mockups/kopperoinenp/app.js`, so they can follow the final workbook.

## What the review shows

- Headline: invoiced service cost in the selected period.
- Cost per washed kilogram (invoiced € / washed kg from `records`). This is the
  main comparison because it does not change with volume alone. A lower value
  versus the previous year is shown as an improvement.
- Verified savings when supplied, otherwise cost per textile per month (invoiced €
  / sum of monthly allocated textiles).
- Monthly invoiced trend with the previous year as a dashed line.

## Year-over-year comparisons (all blocks)

Previous-year values use the owner's `periodComparison(data, scope, "yoy")`: a
comparison appears only when the same site-months exist one year earlier. The
blocks then show the change, for example `↑ +1.2 pp vs 2024 · improved`, and the
previous year as a dashed line in monthly charts. Measures without previous-year
rows (currently service cycles and product details in 2024) show no change.
Direction words are used only where better is unambiguous (on-time share, scan
coverage, CO₂e per washed kg, cost per kg). Volumes stay neutral.
