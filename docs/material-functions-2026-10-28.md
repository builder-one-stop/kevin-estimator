# Multiple SKU functions for interior painting — 2026-10-28

Isolated local candidate on `feat/pricing-chat-integration-20261028`, based on03215ec. No supplier connector, new public catalog/price, role change, production SQL, credentials, push or deployment.

## Behavior delivered

The server resolves exact identifiers into independent functions: finish paint, minor repair, primer, protection consumables and preparation abrasives. It uses explicit English/Spanish function hints or the unique role of an exact existing catalog match. An unknown identifier in a multi-product request remains unassigned until the seller chooses its function; a bare single unknownSKU retains the existing pending-paint behavior. A product requested in the wrong function remains pending there. Two different finish paints in the same request produce an ambiguous paint selection, rather than silently taking the lastSKU. Case-only repeatedSKUs do not create duplicate purchase lines.

Examples using only existing evidence:

- `paint SKU433052; primer SKU UGPR00-1-WH-1; protection SKU590695; protection SKU3487100; abrasive SKU6014059` retains BEHR finish paint46.98USD, ULTRA-GRIP primer69USD, tape8.28USD, plastic3.98USD and abrasive pack6.98USD as distinct source prices. Observation dates stay2026-10-17, no local verification.
- `primer SKU433052` does not turn BEHR paint into primer or reuse its46.98USD price. It produces a pending primer line while an independently valid paint selection continues calculating.
- Explicit `Change primer SKU650132764` replaces the earlier primer selection in a subsequent planning message, without changing protection or finish paint. That Sherwin primer's amount remains null.

Each supplementary selection has a stable selectionID, role, exact offer/catalogID or unresolved request, manual whole-package quantity/null, price evidence, source date and snapshot. Multiple products within one consumable function remain distinct. Repeated exact identifiers are deduplicated within the same request, including case differences; manual duplicate selections are not silently merged or totaled.

## Quantity and cost boundaries

- The existing deterministic finish-paint takeoff remains unchanged: approved geometry, coats, editable350sf/gal default and10%waste default, rounded to whole packages. Existing defaults remain assumptions; no new yield was researched or inferred.
- Primer and itemized consumables have manual whole purchase-package quantities, initially null/pending. Neither wall area nor finish-paint yield supplies those quantities. Different package/price units require review; a price per linear foot is not treated as a price per roll. Editing quantity alone cannot clear that review; the seller must select a compatible offer or explicitly enter a manual per-package unit/price with original evidence retained.
- Primer application has **one** pending labor-hours line per painting task, regardless of how many primer products are selected. It reuses only the existing editable hourly-cost basis, not an invented productivity. Existing finish-paint hours remain unchanged. The seller can explicitly supply additional hours, or explicitly enter0if already included; the application never assumes0. Direct-cost burden remains separately pending when its inputs are absent.
- Itemized protection replaces the protection consumables allowance; abrasives replace the preparation consumables allowance. Labor for those phases is retained once. All selected items in a phase are counted, with a visible completeness-review note. Cleanup allowance is unchanged. This is a choice of itemization, not an inferred usage/yield or a silent markup change.
- Previously edited phase allowances are stored as inactive history while itemized. Removing the function restores the saved allowance with its manual price/quantity corrections. No duplicate active allowance is billed alongside the detailed materials.
- A changed product or function preserves previous evidence and requires a new purchase quantity when a prior manual quantity existed. A manual unknown-primer price cannot migrate into protection. Pending source amount/quantity is excluded from the known subtotal, never represented as a free item.

The plan editor can add/remove supplementary selections, assign their function, choose role-filtered exact references and edit purchase quantities. The rule editor exposes the same selections; ordinary line edits support manual price/quantity review. Recalculation updates geometry/finish quantities/labor and expenses in code while preserving manual supplementary purchase counts, prices and evidence. Saved historical observations are not refreshed by choosing a store or changing dimensions.

## Persistence and presentation

Approved plan evidence remains immutable scope history. Current item selections are clearly identified in the estimate/PDF, with original/current measurements and source information per line. Unknown quantities, missing prices and pending primer labor keep the document preliminary while the rest remains calculable. EN/ES labels,390px layout, reload, revision restoration and real PDF downloads are exercised locally.

Evidence:

- `tests/ai/materialFunctions.test.js`: role routing/deduplication/ambiguity, wrongSKU, several consumables, missing price/quantity, independent primer price, no duplicate allowances or labor, unsafe price-unit mismatch, explicit replacements, quantity corrections, dimensions, source snapshots, inactive manual allowance restoration, saved revisions and restore in both languages.
- `scripts/material-functions-browser.mjs`: controlled real browser chat→plan→manual purchase quantities→approval→generation→pending PDF→primer substitution→manual quantities/hours review→dimensions→save/reload→reviewed PDF, EN/ES390px; no live AI or supplier queries. Explicit0hours is a synthetic QA decision, not a project assumption added to the product.
- `scripts/material-functions-pdf-check.py`: actual downloaded PDFs, source identifiers/dates, separate roles, preliminary/resolved state, totals, explicit manual labor decision, page numbering, text bounds, rendered pages.
- `evidence/material-functions-2026-10-28/`: saved synthetic records, browser report/screenshots, downloaded PDFs and per-page renders.

## Cumulative integration checklist and concrete pending work

1. Integrate the isolated pricing commits onto the intended release only after the separate sales/mobile work is coordinated. No shared checkout was edited. Ship the server and frontend together: old servers reject the new role enum; old clients' paint/repair plans remain valid.
2. Existing tables store these additions inside document/plan JSON. This block introduces no SQL migration. The release's previously pending production database migration/enrollment remains a separate prerequisite to verify in the parent release task; no remote attempt was made here.
3. Run the production release/configuration checks in the intended environment. Local frontend builds use synthetic public config; no production secret was copied. Existing large-bundle warning remains. Deployment, rollback and staging authentication must be verified with real configured infrastructure by the coordinator.
4. Keep catalog Save administrator-only. Authenticated sellers can select existing references and edit their own estimate; this block changes no access roles or policies. Existing current-owner/private catalog isolation and importer tests remain in the cumulative suite.
5. No new five-gallon source or price exists. Painting/preparation coverage stays25references/20public amounts/5missing; global existing catalog stays59/50/9. No live supplier/API, stock, tax, freight or negotiated pricing is connected. Existing web references remain usable without account/contact/store/ZIP.
6. Additional primer/consumable quantity automation needs supplied technical yield or explicit project inputs. Current manual purchase counts are functional and survive dimension edits; they do not pretend to establish consumption. Itemized phase completeness and incremental primer labor remain seller reviews.
7. This deterministic geometry engine still targets the established single interior-wall painting task. Ambiguous free-form named products, multi-room material allocation, generic prose substitutions and generalized trade takeoff remain outside this block. Exact function selections remain editable; no interrogation is added.
8. Catalog lookup retains the existing40-row suggestion-page bound. Large private catalogs may need paginated/searchable selectors later; the current25-row painting catalog and exact server identifier queries are covered.

## Final validation

373tests in73files pass with `--testTimeout 15000`; a prior parallel browser/test run timed out one untouched PGlite legacy-ownership test at its default5seconds. The final suite ran without browsers competing for resources; no assertions or database policies were loosened.17new multi-function regressions pass. Oxlint and Vite frontend build pass with synthetic public config; the existing >500kB chunk warning remains.

Actual EN/ES390px multi-function browser flow passed, including manual primer substitution, quantities, explicit labor review and reload. Existing EN/ES no-account/store/ZIP web-reference defaults and accepted-alternative flow passed separately; report `evidence/material-functions-web-compat-2026-10-28.json`. Its old synthetic request had omitted the space before room dimensions; that fixture is corrected, and strict geometry parsing is retained.

Four actual PDF downloads (4pages each in EN,5pages each in ES;18pages total) pass identifier/date/provenance, preliminary versus explicitly reviewed labor state, totals, page numbering and text-bound checks. All18rendered pages were visually reviewed. PDF extraction assertions normalize line-break whitespace so a wrapped Spanish disclosure is checked as its complete text. Poppler emits existing Symbol/ArialUnicode fallback warnings; outputs are readable and within bounds. The local harness does not implement worker notifications; unrelated fixture route warnings are not worker QA.
