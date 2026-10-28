# Painting reference coverage and maintenance — 2026-10-28

Read-only snapshot of the existing25 painting/preparation references, not a supplier sync. Source observations remain2026-10-17. On2026-10-28 the20 amounts are within the existing30-day review policy; that is not a guarantee of current purchase price.0 local prices/stock verified,0 selected buying stores. Work area Lawndale/coast toward Palos Verdes informs candidates only. Global catalog still59 references/50 amounts/9 missing; this report isolates the painting25/20/5.

## What is usable now

| Category | References | Public amounts | Missing | Automatic use in current painting scope |
|---|---:|---:|---:|---|
|Interior finish paint|6|5|1|Exact selected package drives whole-can quantities; coverage/merma remain editable assumptions|
|Primer|5|3|2|Reference for manual scoped lines; no automatic primer coverage/manos invented|
|Minor patch/filler|5|4|1|Exact container price with separately editable whole-package purchase allowance; patch count drives labor only|
|Abrasives|3|3|0|Manual reference per complete pack; not automatically substituted into per-sf preparation allowance|
|Protection|6|5|1|Manual cloth/roll/sheet references; no invented lifespan or per-room yield|
|Total|25|20|5|No supplier/account/store prerequisite for using public web references|

Finish-paint references with amounts: HD01 BEHR ULTRA1USgal eggshell46.98USD; LO01 Valspar2000 nominal1gal can(124fl oz =0.96875USgal) eggshell25.98USD; DE01 SUPREMA1USgal eggshell81.50USD; DE02 SPARTAWALL1USgal flat61.00USD; CA01 Ultra Spec5001USgal eggshell56.66USD. These are existing observations, not new imports or equivalence claims. Different paint brands/finishes cannot be silently exchanged.

No public five-gallon finish-paint reference exists in these25 rows. The engine supports a correctly defined5USgal/ea package, but its regression100USD price is synthetic QA only and never added to the base catalog. No satin/semi-gloss/high-gloss finish reference, job-specific tint surcharge, separate primer yield, filler-per-hole yield, paint roller/brush yield, negotiated discount, tax, freight or stock is established here.

## Five actual gaps

|Source ID / stable catalog ID|Category|SKU|Purchase package / unit|Reason and existing source|
|---|---|---|---|---|
|SW01 /00000000-0000-4000-8000-000000000010|Primer|650132764|1USgal White /gal|Price requires account/local context; [Premium Wall & Wood Primer](https://www.sherwin-williams.com/homeowners/products/premium-wall-wood-primer)|
|SW02 /00000000-0000-4000-8000-000000000011|Patch|1510619|1USqt /ea|Price unavailable anonymously; [Shrink Free Spackling](https://www.sherwin-williams.com/homeowners/products/shrink-free-spackling)|
|SW03 /00000000-0000-4000-8000-000000000012|Protection|1980929|1cloth /ea|Price unavailable anonymously; [Contractor Series Canvas Drop Cloth8oz](https://www.sherwin-williams.com/homeowners/products/contractor-series-canvas-drop-cloth-8oz)|
|SH01 /00000000-0000-4000-8000-000000000013|Interior paint|Not recorded|Variant/package unresolved /ea placeholder|Category/family only, no exact price; [Regal Select family listing](https://shilpark.com/product_category/interior-paint/)|
|SH02 /00000000-0000-4000-8000-000000000014|Primer|Not recorded|Variant/package unresolved /ea placeholder|Category/family only, no exact price; [High Hide PVA family listing](https://shilpark.com/product_category/primers/)|

All five amounts remain null; no quote was obtained. The machine-readable report contains the exact current IDs, recorded dates, URLs and source state, generated from the checked-in dataset. HD02,HD04,HD05 andCA03 have amounts but no recordedSKU: their stableID/sourceURL/package can identify a reference; do not imply verifiedSKU matching.

## Closed selection gap

The previous rule editor offered any volume-bearing product as paint, including quart filler and primer. A shared role predicate now keeps server search, reviewed-plan selection and rule editor consistent. Only a categorized finish paint or an explicitly named unclassified paint can be suggested as paint; patch/filler/standalone primer cannot. Category hints restrict suggestions and never prove suitability. Known paint packages with missing price can still be selected and calculated; labels explicitly say price pending.

Free-text search now requires all words across brand/product/variant/package/vendor/SKU/model in any order, ignores repeated whitespace and accents, and remains `matchType:suggestions`. StructuredSKU/model/variant/package/provider/store matching remains exact; no automatic alternative, new amount, timestamp update or local-verification upgrade results from search. Existing explicit alternative acceptance remains intact.

If the seller itemizes tape, protection or abrasives separately, the corresponding consumables allowance must be reviewed to avoid charging both. The editor now states this; no invented per-item conversion or automatic commercial adjustment was introduced. A purchased3-sponge pack or6-sheet pack remains one purchased package, not one piece at the pack price.

## Executable next queue

1. Administrator can merge a privately supplied exact list using the existing importer preview: SKU/model, variant, package, material unit, price/null, source date/URL and offer location. Preserve original evidence and approve preview before Save; sellers need no additional catalog-write role.
2. Refresh existing source evidence only through authorized sources/imports; after30days observations become stale snapshots and continue as marked historical references. Never set today's date just because a store was selected.
3. If a real5gal reference or another sheen is supplied, import it as a distinct offer/package (unit ea for whole pail), review coverage and validate source date. Do not copy the1gal amount or scale it as if it were an observed price.
4. Separate primer automation or specific consumable takeoff requires confirmed scope and defensible yield/usage inputs. Until then use explicit manual quantities and review the allowance. More supplier data cannot establish a material's job-specific consumption by itself.
5. Multiple product identifiers in one free-form chat still require reviewing the exact material selections; the current bare-SKU parser uses the last identifier for paint. A future role-aware intent review should preserve ambiguity rather than silently route unknown repair SKUs into paint. No fuzzy SKU equivalence should be introduced.

Reproduce inventory: `node scripts/painting-coverage-report.mjs 2026-10-28`; output `evidence/painting-coverage-2026-10-28.json`. No network, account data, secrets or customer data. Existing Dunn-Edwards/Catalina observations remain historical checked-in evidence; this work imports or scrapes no additional catalogs and asserts no commercial-sync license.

## Final local validation

356tests in72files passed;17 new selection regressions plus24 precision cases. After the last hyphenated-SKU geometry guard clarification, the41 focused precision/selection cases passed again. Oxlint and Vite frontend build pass with synthetic public config; existing >500kB warning remains. Actual isolated Chrome EN/ES390px repeated the complete precision flow after the shared filter, asserting that filler and primer are absent from the finish-paint selector while a5gal paint fixture remains selectable. Report: `evidence/painting-selection-browser-2026-10-28.json`. The four downloaded pending/resolved precision PDFs (12pages total) passed extraction, bounds, totals/provenance and visual review in the prior precision block. No production configuration was loaded.
