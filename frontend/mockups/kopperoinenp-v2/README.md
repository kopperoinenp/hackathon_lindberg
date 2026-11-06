# Customer story mock v2

Human owner: kopperoinenp. Local frontend mock only, not an approved production stack.
The first version remains intact for comparison. Run `pnpm preview` from the root;
v2 is the default. Both versions can also be opened directly as HTML files.

The main view is intentionally one page:

1. The customer's year: three visual results with brief interpretations.
2. One investigation worth discussing: a site with a low December scan ratio.
3. A proposed next-year conversation, with optional meeting notes.

Only customer choice and review preparation are prominent controls. Site and
baseline drill-down, explanation and priorities are available through the
simulated assistant. Manual controls are tucked into the assistant as an
accessible fallback. Source methodology is one link at the foot of the story;
synthetic status and the chosen baseline remain visible on the story itself.

Try: `keskity päästöihin`, `näytä Turku`, `näytä kaikki toimipaikat`,
`vertaa kotipesuun`, or `lisää esitykseen: Tarkistetaan varatekstiilit asiakkaan kanssa`.
Only the documented keyword commands are implemented. Other questions get an
honest limitation message. There is no external AI, backend, account login or
remote storage. Changing customer/site/baseline clears scope-specific notes.

Industry sets a starting emphasis (food: water, manufacturing: use/repair,
healthcare: repair/continuity); the manager can override it. These are presentation
defaults, not compliance guidance or proof that an industry should reduce washes.

The shared `../kopperoinenp-v1/data.js` and `model.js` hold the same source fixture
and calculations as v1. The unchanged source workbook is in `data/source/`.
See v1's README for formulas, stock-versus-flow handling and reference checks.
Shared data/calculation code is reused to keep the two visual alternatives
comparable; v2 does not overwrite a teammate's directory.

The customer review is assembled automatically in the visible priority order.
HTML download and browser print/PDF flow are available. There is no PPTX export;
PDF page layout still needs export verification before presentation use.

See [BRIEF_REVIEW.md](BRIEF_REVIEW.md) for the assessment against the supplied brief
and the remaining full-hackathon gaps. This remains a frontend design prototype.
