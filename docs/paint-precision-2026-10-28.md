# Painting precision audit — 2026-10-28

Local candidate only, branch `feat/pricing-chat-integration-20261028`, isolated from release/mobile. No supplier/AI live calls, remote SQL, role changes, push or deployment. Existing prices, source dates, productivity, coverage, waste and commercial defaults remain assumptions or source evidence as recorded.

## Demonstrated fixes

- Signed dimensions previously matched their positive suffix (`-12 x10 x8 ft` became a 352sf room). Signed/decimal-comma/scientific suffixes and ambiguous omitted mixed units now remain unresolved rather than generating a physical order. Exact metric conversions no longer round dimensions to six decimals before area calculation.
- Patch labor counts previously also bought one whole filler container per hole. New templates explicitly separate `patchCount` from `repairPackages` (default purchase allowance1, independently editable; no yield per hole claimed). Zero repairs buy zero repair packages. Legacy saved templates without the field preserve their original count/allowance and carry a review note; no saved budget migration.
- Generation extended the source's fractional-cent price before rounding, while editor/recalculation rounded unit cost first. The reproducible synthetic0.335USD case differed by0.01USD in the100% expense allowance. Generation now uses the same `itemCostCents` path, excludes pending lines, and rejects unsafe totals.
- A saved manual quantity could remain4 when switching from1gal cans to5gal pails, or lose its resolved/pending state on recalculation. Changing the product after a quantity override now preserves the original quantity as history and asks for a new purchase quantity. Confirmation, save/reload and subsequent recalculation retain the new value and pending state correctly. Reviewed chat quantity edits also resolve pending quantities explicitly.
- PDF/UI scope now labels approved-plan product/finish and assumptions as historical plan references; current selections and costs are in the line items, alongside original/current measurements. Manual material edits no longer imply that the earlier product remains current.
- Engine rejects mismatched purchase units (e.g. a5gal container priced as one `gal`) consistently with the existing importer.5gal containers use `ea`; price is per complete pail. No automatic price conversion or new source amount.
- Whole-package takeoff rejects overflowing counts. Product selectors have explicit accessible labels in EN/ES.

## Concrete matrix

| Case | Expected/verified result |
|---|---|
|350sf,1coat,0%waste,350sf/gal,1gal can|1gal,1complete can|
|350sf,2coats,10%waste|2.2gal,3one-gal cans or1five-gal pail|
|1750sf,1coat,0%waste,5gal pail|5gal,1pail;1750.00001sf buys2pails using unrounded demand|
|1USqt package;124fl oz nominal can|4quarts per1gal demand; nominal can uses0.96875gal, priced per can|
|12×10×8ft;144×120×96in;3.6576×3.048×2.4384m|352sf walls; exact mixed explicit units agree|
|Negative/comma/scientific suffix or ambiguous omitted mixed units|No inferred physical order|
|32sf opening, net vs gross|320sf net or352sf gross; opening deducted once|
|Two coats and100%waste|Waste increases paint only; painting labor uses704coat-sf,4.70hr at existing150sf/hr|
|Protection/prep/cleanup consumables|352sf each, once; paint/filler excluded from these allowance notes|
|8holes,1repair package|1package material and1hr repair labor at existing8patches/hr; yield not asserted|
|Legacy template,8patches, no package field|Preserves8-package legacy allowance with review note|
|Synthetic5gal pail100USD/ea|1complete pail for352sf default room; not5pails or100USD/gal|
|Fractional source unit cost0.335USD|Same expense/totals in generation, editor and recalculation; proposal cent allocation equals total|
|Zero wall dimension; net-zero area; excessive dimension; tiny coverage overflow|Validation failure without a priced order; original draft remains editable|
|Exact known package, missing price|3one-gal cans still computable; price remains null/pending, excluded from known subtotal and expenses|
|No exact product|Physical room area remains known; purchase quantity and price pending|
|Manual4cans -> switch5gal pail|Earlier4gal retained as history; purchase quantity pending until explicit confirmation|
|Confirmed1pail -> change room length13ft|1manual pail preserved; wall area updates368sf; fees/stock stay unknown|
|25%margin vs25%markup|Margin converts3333bps;2500bps markup corresponds20%margin; approved commercial markup preserved|
|EN/ES persistence and PDF|Saved snapshots, pending/confirmed quantities, totals and preliminary notices agree;390px viewport tested|

No primer yield, filler yield, tax, freight, stock, negotiated rate, current supplier connection or local verification was inferred. Mixed feet-and-inches notation such as5ft6in and decimal commas require explicit normalized dimensions; the parser does not guess them.

## Reproduction/evidence

`tests/ai/paintPrecision.test.js` provides the24-case deterministic matrix in addition to existing chat/repository/PDF regressions. `scripts/paint-precision-browser.mjs` exercises actual local UI chat→plan→approval→estimate→quantity edit→5gal switch→pending PDF→reload→quantity confirmation→recalculation→resolved PDF in both languages, at390px. All browser data, five-gallon offer and provider responses are synthetic fixtures; loopback-only network. Evidence: `evidence/paint-precision-2026-10-28/`.

Validation: full suite338 tests/71 files passed before the final original/current scope wording; painting/PDF regressions rerun after that change. Oxlint and Vite frontend build pass. Four actual downloaded PDFs (three pages each) pass extraction, totals/pending state, provenance, page numbering and text bounds, then visual review of every rendered page. Production build configuration is not validated; frontend build uses synthetic public settings without copying secrets. Existing bundle-size warning remains.
