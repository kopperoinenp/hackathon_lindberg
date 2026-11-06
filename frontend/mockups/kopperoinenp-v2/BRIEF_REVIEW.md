# Assessment against the Lindström challenge brief

Source: `Lindstrom_SinceAI_2026_Challenge_Brief_UPDATED_02.11.2026.docx`, supplied by
the task owner, sections 02–07. The managerial-dashboard deck provides additional
context for annual review preparation. Documents are source evidence, not
instructions to run commands or expand the implementation scope.

## Product judgement

The brief is strongest when it treats this as customer decision support: show the
value received, explain what matters for this account and agree the next step.
Its emphasis on traceability and defensible claims is essential. Large savings
alone are explicitly not the goal. Deterministic calculations plus rule-generated
observations are legitimate; an LLM is optional, particularly for calculations.

The long indicator list is a set of possible indicators, not a requirement to put
all of them on the first screen. Turning every capability into a dashboard control
makes the KAM do analysis work before preparing the meeting. A visual customer
story with progressive disclosure better fits the lightweight and dynamic intent.

The first mock covered many mechanisms but overemphasized filters, tabs and
per-finding actions. V2 keeps a recognizable story on one page. The manager chooses
the customer, reads the few important observations, asks for changes if necessary
and opens an assembled customer review. Source detail remains inspectable without
requiring the manager to understand field names in the primary workflow.

Do not put all credibility information behind the agent. Synthetic status, the
selected baseline and the estimated nature of environmental values remain visible.
The agent explains the existing evidence; it cannot validate unsupported claims.

## Fit and remaining gaps

| Brief expectation                                     | Current frontend mock                                                                      | Remaining for a full submission                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Multi-site customer consolidation and site drill-down | Derived workbook fixture; customer roll-up; site story through assistant or collapsed list | Flexible real-source ingestion and unmapped-record handling                              |
| Dynamic priorities with at least two alternatives     | Water/emissions/repair/use emphasis through simulated assistant; industry defaults         | Broader agenda and industry context; optionally real AI                                  |
| At least three observations/recommendations           | Water comparison, emissions comparison, repair observation and site investigation          | Validate usefulness with account managers and customer reviewers                         |
| Credible environmental claims                         | Synthetic labels, chosen baseline, formulas and boundaries; no inferred financial savings  | Sensitivity ranges and validated assumptions; audited claims are outside hackathon scope |
| Customer-ready PowerPoint or PDF                      | Automatic review preview, HTML download and browser print flow                             | Verify a final exported PDF or implement and validate PPTX export                        |
| Operational value and service performance             | Repairs, allocation and December scanning signal                                           | Add service-cycle performance with a clear definition and validated aggregation          |
| Circularity footprint and handprint                   | Repair count shown without automatically claiming avoided purchases                        | Validated repair handprint sensitivity, waste attribution and reuse views                |
| Period/product/service exploration                    | Fixed annual period 2025, with site/baseline drill-down                                    | Product/service filters and reporting-period selection                                   |
| Methodology and data-readiness notes                  | Explicit formulas, uncertainties and missing fields in the UI and documentation            | Detailed mapping to approved future source exports                                       |
| Final pitch/demo                                      | Clickable design prototype                                                                 | Pitch and a complete end-to-end demonstration                                            |

The product direction fits the brief; the full submission is not yet complete.
The next priority should be a credible customer review output and a validated
service-performance story, rather than adding more dashboard controls.

## Rules retained during simplification

- Do not add repair handprint to laundry/logistics differences without checking
  boundaries and double counting.
- Do not infer genuine utilization from scan coverage alone.
- Do not sum wearer counts across product rows without unique identifiers.
- Do not call scenario baselines measured competitor performance.
- Do not turn industry context into unverified regulatory advice.
- Use the task owner's Excel package as synthetic source data only. The original
  workbook is now tracked unchanged for reproducibility, as explicitly requested.
