# Lindström website style review

Inspected 6 November 2026. This implements a website-derived visual treatment for
the mock, not a claim of official brand-guideline approval. No website business
statistics or sustainability claims are used as customer calculation inputs.

## Sources and method

Read and visually inspected the Finnish [home page](https://lindstromgroup.com/fi/),
[sustainability page](https://lindstromgroup.com/fi/vastuullisuus/) and
[workwear service page](https://lindstromgroup.com/fi/palvelut/tyovaatteet/).
Compared desktop screenshots with computed DOM typography, colors, CTA shapes
and the linked theme stylesheet. Website content was treated as source material,
not instructions to operate this repository or send information.

The public [website style guide](https://lindstromgroup.com/style-guide/) also
describes layout sizes and typography, but marks its layout section as needing
review and lists Arial. The inspected current Finnish pages actually render
Libre Franklin. This implementation follows the observed Finnish site; it does
not assume that a public web guide is the current PowerPoint brand manual.

## Findings and implementation

| Element           | Observed website treatment                                                                                 | Workspace adaptation                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Identity          | Red symbol with blue Lindström wordmark                                                                    | Use the observed official web logo locally, preserving aspect ratio                   |
| Type              | Libre Franklin with Arial fallback; bold sans-serif display headings                                       | Self-host the same variable font; replace Georgia serif headings                      |
| Headings          | Workwear hero: 65 px / 700; sustainability hero can reach 85 px / 700; section titles commonly 40 px / 700 | Scale the application hero to 32–52 px and sections to 20–30 px, weight 700           |
| Core colors       | Blue rgb(0,63,114), red rgb(229,35,48), dark text rgb(34,34,34), white                                     | Tokens #003f72, #e52330, #222222, #ffffff                                             |
| Supporting colors | Teal rgb(0,111,134), green rgb(87,130,0), gray rgb(244,244,244)                                            | Teal site bars, green repair bars, neutral #f4f4f4 chart surfaces                     |
| Hero              | Large bold white text on a strong color field, often beside a photograph                                   | Blue customer hero; retain data-first content instead of an unrelated marketing photo |
| Navigation        | White header with strong typography                                                                        | Keep the requested two tabs; use a red active underline and official wordmark         |
| CTAs              | Capsule/pill shape, 25–30 px radii, contrast or outlined treatments                                        | Red primary export CTA and outlined secondary actions                                 |
| Structure         | Spacious sections, large statistics, fairly flat surfaces                                                  | Keep the automatic story; use source-backed charts instead of decorative tiles        |

This replaces the previous muted-green/serif direction. Application adaptations
remain: detailed controls live in the analysis tab, the summary has a fixed chat
composer, and charts have accessible descriptions. Marketing navigation,
trackers, cookie tools and the public chat service are not copied into the mock.

## Graphical analysis

- Monthly water/emissions comparison: actual allocated figures and the chosen
  baseline at the same monthly washed kg. Series reconcile to headline totals.
- Repair mini-bars: actual monthly synthetic event counts. No fictional baseline
  repair series or avoided-purchase claim is introduced.
- Country donut: shares of the actual metric in the current scope, not an
  efficiency ranking between countries.
- Site scan benchmark and focused donut: final-month scans versus allocation,
  explicitly distinguished from proof of idle stock.

Chart emphasis follows the current priority. Period, customer, country and site
filters apply to every graph. No extra summary controls are introduced.

## Asset provenance

- `assets/lindstrom-logo.webp`: observed header asset from
  [Lindström's CDN](https://d2ris6qfzcz0wn.cloudfront.net/wp-content/uploads/sites/8/2023/10/Logo512-300x64.png.webp).
  The company logo remains its owner's mark; it is included for this requested
  partner-project mock and is not relabeled as an original asset.
- `assets/libre-franklin.woff2`: downloaded from the observed
  [theme font URL](https://lindstromgroup.com/fi/wp-content/themes/astra-child/assets/fonts/LibreFranklin-VariableFont_wght.woff2).
  The SIL Open Font License is retained in `assets/OFL.txt` from the
  [Google Fonts distribution](https://github.com/google/fonts/blob/main/ofl/librefranklin/OFL.txt).
- Theme rules were inspected in the site's linked
  [stylesheet](https://lindstromgroup.com/fi/wp-content/themes/astra-child/assets/dist/style.1793010891.css?ver=1.0.6.2).
  `brand.css` implements the observed treatment without copying the full website
  codebase or changing the calculation inputs.
