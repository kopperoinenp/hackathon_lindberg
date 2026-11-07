# Source datasets

The workbook in this directory is the original synthetic source for 2025. Its
customer and operational figures are fictional. The fixture generator adds
simulated 2024 site-month summaries for year-over-year comparisons. Keep real
customer data out of this demo.

## Automatic validation

The workspace checks the active dataset before it shows results, and the
analysis service checks the same snapshot before it can create presentations
or call the AI editing provider. If the input fails, the workspace explains the
first issue and the service returns a controlled error. The page stays available.

Preview uses the packaged fixture by default. To activate a different prepared
dataset, set `REVIEW_DATASET` in the existing preview environment to its path,
then restart preview and reopen the workspace. The app checks it as part of
startup. The input is a JSON object in the same shape as the packaged fixture.
The existing generated `globalThis.REVIEW_DATA = …;` wrapper is also accepted
and is read as data. The runtime does not import raw Excel workbooks. The server
limits the source file to 16 MiB and serves the same snapshot to the browser.

## Compatibility rules

- The current demo profile is synthetic calendar year 2025, with Finland,
  Sweden and Poland supported. Source name, customer/site metadata, default
  customer `CUST001` and baselines `B_LOCAL`, `B_HOME` and `B_INHOUSE` are required.
- Each customer needs a site. IDs must be unique, use letters, digits,
  underscores or hyphens, and start with a letter or digit. Each site needs
  one monthly record for every month. A record's customer must own its site.
  Optional 2024 summary rows are used only for historical comparisons.
- Required quantities are finite, nonnegative numbers. Counts must be whole
  numbers, and scan counts cannot exceed allocated items. Blank values are
  rejected for required measures.
- Product details, when supplied, must reconcile with site-month totals.
  Waste routes must add up to allocated waste and postponed replacements
  cannot exceed recorded repairs. Supplied service cycles must match their
  reporting scope, with valid durations and late counts.
- Older summary-only datasets can omit detailed tables. The detailed view
  shows unavailable measures without inventing values.

The validator checks structure, compatibility and internal consistency.
Before activation, the data owner still needs to confirm that the named units
and reporting definitions match the source and that underlying product rows
were included. Recorded service cycles, estimated impacts and synthetic
comparisons have separate scopes.
