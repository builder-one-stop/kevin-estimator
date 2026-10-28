# Exact-product technical coverage — 2026-10-28

Local pricing candidate based on351baab in the isolated worktree. Two existing products reviewed; no new price, package SKU offer, supplier account, live API, tax/freight value, labor productivity or trade added.

## Evidence and exact scope

|Existing reference|Identity bound by the application|Manufacturer technical range|Published sheet revision|Evidence|
|---|---|---|---|---|
|HD01|BEHR ULTRA/275001, retailerSKU433052, Ultra Pure White, eggshell,1USgal|250–400sf/USgal per applied layer|11/2020|[Manufacturer TDS linked from exact retailer listing](https://images.thdstatic.com/catalog/pdfImages/da/dae4efe2-cd05-4c12-b7f8-344757743ad9.pdf), [current manufacturer product page](https://www.behr.com/pro/products/interior-products/interior-paints-and-coatings/paints-and-coatings/behr-ultra-interior/behr-ultra-interior-eggshell-enamel-2750)|
|HD02|KILZ2 All-Purpose/20941, White,1USgal; exact retailer listing links manufacturerNo2000|300–400sf/USgal per applied layer|03/2019; legacy6/2014 header retained|[Manufacturer TDS linked from exact retailer listing](https://images.thdstatic.com/catalog/pdfImages/b5/b505644b-bcec-4656-9ad9-64839581d23d.pdf), [current manufacturer product page](https://www.kilz.com/primer/kilz-2)|

The linkage uses the exact [BEHR275001 listing](https://www.homedepot.com/p/BEHR-ULTRA-1-gal-Ultra-Pure-White-Extra-Durable-Eggshell-Enamel-Interior-Paint-Primer-275001/203202159) and [KILZ20941 listing](https://www.homedepot.com/p/KILZ-KILZ-2-ALL-PURPOSE-1-gal-White-Interior-Exterior-Multi-Surface-Primer-Sealer-and-Stain-Blocker-20941/100096395), under their manufacturer-document links. The KILZ catalogSKU remains blank; retailerSKU140770 is documented as an additional exact identifier, not invented or silently added to the price catalog. The manufacturer number2000 is not substituted for the saved retail model20941.

Both PDF files were read and their first pages visually inspected. BEHR page1 relates250sf/gal to6.4wet/2.4dry mils and400 to4.0/1.5; KILZ page1 relates300 to5.3/1.7 and400 to4.0/1.3. Thus the application interprets coverage per applied layer at the stated film, not as guaranteed coverage for an entire multi-coat system. Actual coat count remains a job input. No automatic reduction of existing finish coats occurs when a separate primer is selected.

Both manufacturers condition coverage on preparation, porosity/texture and application; spray losses are excluded. The estimating waste allowance is separate and editable. Typical stated application-temperature range is50–90°F; no job conditions are marked verified. The documented lower bound is neither a guaranteed minimum on this job nor labor productivity.

The PDFs are older revisions. Their ranges are corroborated by manufacturer product pages read2026-10-28; consultation does not make the sheets newly revised. The direct manufacturer wrapper URLs `https://www.behr.com/binaries/content/assets/behrpro/web/tds/2750_tds_us.html` and `https://www.kilz.com/binaries/content/assets/kilz/tds/2000_tds_us.html` returned HTTP403 to the direct reader. Those operations were not retried/bypassed. Independently published manufacturer PDFs linked by the exact official retailer listings returned200. Only technical documents/identity were used; incidental displayed prices were not imported or refreshed.

The temporary PDFs remain ignored local research files, not redistributed in the patch. The checked-in manifest stores facts, URLs, revisions, consultation date and hashes:

- BEHR SHA256 `8e88f1fa499c0735d9bbc0ff40ad7e069f45010c1c2f6b677ae363cc70b916e8`.
- KILZ SHA256 `0e72498490391aef975c7952d1ad8637ac13cb6e5291e30f3beb537cb26f0dc9`.

## Behavior

`shared/research/technical-coverage-2026-10-28.json` is a versioned, exact-identity registry. Brand, product, retail model, acceptedSKU, package, unit and variant must match; role must be compatible. It does not extrapolate to other BEHR bases/sheens, PREMIUM PLUS2050, KILZGray/KILZ3, other formulations or5gal packages. The previous broad2050 family/model regex no longer labels a different physical identity as documented without explicit accepted evidence.

A technical profile merely becoming available changes no existing default, reviewed plan, quantity, source price/date or labor calculation. The existing350sf/gal,2coats,10%waste template remains provisional. The editor can explicitly prepare the exact sheet's lower bound250or300. This is an application estimating criterion, not a manufacturer-recommended numeric default or guarantee. The value remains editable; values outside the published range are marked as seller assumptions outside the range.

Changes are applied only with the existing **Recalculate painting** action. Full technical snapshots are stored in the rule and line evidence, including original range, conditions and sheet revision. Registry profiles are immutable/versioned: future research should add a new version, retain historical versions and require explicit application; do not rewrite a reviewed snapshot in place. Profiles are validated against the known registry and exact product before any calculation; altered or mismatched evidence cannot establish automatic consumption.

Primer automation is opt-in and requires explicit area scope and coat count. A seller chooses current room walls (tracks later geometry/opening edits) or a manual partial area inSF (remains manual as room geometry changes). The application never assumes all walls need primer. Job waste initially copies the existing editable job allowance only when preparing the profile and remains separately editable; it is applied once. Missing area/coats/coverage/waste or an unsupported profile leaves purchase quantity pending while the rest remains calculable.

Calculation is by existing Decimal code: `area × coats × (1+waste/100) ÷ coverage`, then ceiling to complete packages from the exact saved size. Example352sf: BEHR2coats/250/10% =3.0976gal →4one-gal cans; KILZ1coat/300/10% =1.2907gal →2one-gal cans. Nothing applies waste a second time or reuses finish-paint yield for primer. No5gal source was invented.

Manual line counts/prices survive parameter and dimension edits. A separate explicit quantity-reset checkbox permits resuming the calculation for a selected line, while retaining its manual price and original evidence. ChangedSKU/product or a stale mismatched technical identity leaves automatic purchase quantity pending; the seller can apply a supported exact profile or explicitly return to a manual assumption/count. Primer labor remains a separate pending-hours review; manufacturer coverage supplies no work-rate data. Tax, freight and stock remain unknown as before.

Technical consultation date2026-10-28 is separate from price observation2026-10-17. Looking at a sheet or changing dimensions/store does not refresh prices or create local verification. Scope from the approved plan remains historical; current calculations and assumptions are shown per line in editor/PDF.

## Tests and QA

`tests/ai/technicalCoverage.test.js` and `technicalCoverageUi.test.jsx` cover exact and rejected identities, unchanged old budgets, explicit actions, per-coat math, single waste application, whole packages, missing inputs, full versus partial area, dimension updates, manual override retention and explicit reset, wrongSKU fallback, invalid snapshot, editable out-of-range assumptions, independent labor/fees and EN/ES serialization/PDF.

`scripts/technical-coverage-browser.mjs` uses a new isolated headless Chrome profile, controlled model and ephemeral local database, with network limited to loopback. It exercises chat→plan→approval→unchanged initial estimate→prepare profiles without saving/repricing→explicit recalculation→required primer area/coats→manual corrections→dimension changes→explicit quantity reset→wrong primer profile→return to exact primer→save/reload→actual EN/ES PDFs at390px.

The local harness now ignores all generated `evidence/` artifacts in its dev watcher: Windows reportedEBUSY when a newly downloaded PDF was watched while being written. That correction is confined to test infrastructure; app source files continue being watched. Unrelated fixture worker-notification warnings are not worker QA.

## Remaining coverage and next real blocker

Only2of the existing25painting/preparation references have newly accepted exact technical profiles in this block. The other23remain manual/provisional or unsupported for consumption; that does not claim their manufacturers lack documentation. Examples: DE03ULTRA-GRIP and other finishes were not verified in this small set; family-onlySH01/SH02 still lack an exact variant/package. Protection, abrasives and patch filler have no defensible job-use/consumption yield here. Prices remain25references/20amounts/5missing, global59/50/9;0local prices verified.

The next practical blocker is **job-specific scope/condition and labor calibration**, not another universal coverage number: confirm full versus spot priming, coats and surface/application conditions, then supply measured or explicitly estimated primer hours. Coverage cannot supply those hours or verify substrate suitability. Additional exact-product profiles can be added with the same source/identity/version checks; no broad manufacturer/family fallback should replace missing evidence.

Integration remains local: frontend/server must ship together after the coordinated release/migration/config work. This block adds no SQL migration, role, credential, supplier API or deployment. Production configuration is not validated; synthetic public build settings are used. Existing large-chunk warning remains.

## Final local validation

Full cumulative suite:402passing tests in75files with `--testTimeout 15000`; final focused technical/UI matrix:29passing, including missing-price quantity calculation. Oxlint and Vite frontend build pass with synthetic public config; the existing >500kB chunk warning remains. No production configuration was copied or validated.

Actual controlled Chrome EN/ES390px flow passed. Four actual downloaded PDFs contain19pages in total (appliedEN5, resizedEN4, appliedES5, resizedES5). Identifier/range/revision/date distinctions, saved known subtotals, explicit area scope, manual price preservation, preliminary state, pending primer hours, page numbering and text bounds pass extraction checks. Every rendered page was visually reviewed. The technical model remains visible even when the price becomes a manual override; this does not upgrade manual price verification. Existing Poppler Symbol/ArialUnicode fallback warnings remain; rendered text is readable.

Reproduce with `scripts/technical-coverage-browser.mjs`, then compute `document-totals.json` from its saved records via `calculateEstimate`, then run `scripts/technical-coverage-pdf-check.py` using the bundled Python/Poppler. Reports and synthetic evidence are under `evidence/technical-coverage-2026-10-28/`. Manufacturer PDFs and source-page renders remain temporary ignored research files; only factual metadata and their hashes are committed.
