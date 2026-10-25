# Pricing observations and offer freshness — isolated integration candidate

Base: `cc88a8a95743607e351e11079f5d0fba69fde7f8`. Branch:
`feat/pricing-offer-freshness-20261025`. This work is local and must be integrated
after the separate team/sales release. No provider account, live API, remote SQL,
production settings, or deployment is configured by this change.

## Behavior

- Expiration and the existing 30-day review policy downgrade saved prices to
  `stale`/provisional. Paint and trade package calculations keep their saved
  package and source date, and remain calculable. Missing material amounts retain
  `priceMissing` and `price.unitCost:null`; their numeric arithmetic placeholder
  is excluded from the known subtotal and never displayed as a free material.
- Exact matching includes product, brand, SKU, model, variant, purchase package,
  unit, supplier, currency, market, legacy branch context and verified ZIP.
  Optional `offer` separately captures supplier/store IDs, store ZIP, job ZIP,
  fulfillment and non-secret account context. An absent identifier is not a
  wildcard. Ambiguous offers are not selected by array position.
- The resolver has a bounded 100-offer, per-provider memory cache (five-minute
  default TTL), three-second default timeout, caller cancellation and explicit
  `fresh`, `stale`, `unavailable` outcomes. A provider failure keeps compatible
  dated prior/cached evidence. It never relabels another offer's price. Manual
  prices bypass both cache and provider. No background timer refreshes prices.
- `/estimates/:id` has optional price-location fields. Empty ZIPs remain allowed;
  saving context does not rewrite saved offers, look up prices, or change markup.
  Kevin's operational ZIP is unknown. Store metadata is not a job address.
- Both languages expose stale price warnings and dates in cost evidence. Owner
  reference reuse also requires the same offer; a stale reference stays marked
  provisional. Recalculation preserves manual amounts and historical snapshots.
- Managed and imported evidence history now retains offer context. Research UUIDs
  have deliberately NOT been reordered/remapped: a permanent source-ID mapping
  with migration tests remains a separate task.

The resolver is a server-side boundary for explicit internal/imported data. No
external supplier adapter or HTTP endpoint for live supplier lookup was added.
The application still declares external pricing not connected. The optional
location is request context for future reviewed adapters, not verification.

## Official observations provided by the coordinating task

Recorded 2026-10-25 05:34–05:35 UTC from official web pages crawled “today”. This is
not a checkout or live API response. Every store/ZIP is unselected, stock unknown,
and local verification false. `priceRefresh20261025.js` applies the versioned
batch on top of the existing source so original evidence remains in history.

- Ace 12922 / manufacturer 380501: USD26.99 per 4.5 US gal pail.
  https://www.acehardware.com/departments/paint-and-supplies/patch-and-repair/joint-compound/12922
  This offer ALREADY existed. Refreshing it does not add a duplicate. The older
  indexed USD25.99 observation conflicts and is not used. Existing manufacturer
  joint-treatment coverage is preserved separately; no new yield was inferred.
- Ace 1010800 / 384210: new USD16.99, 18 lb Easy Sand45 bag.
  https://www.acehardware.com/departments/paint-and-supplies/patch-and-repair/joint-compound/1010800
  Coverage remains unknown, auto eligibility false; no patch-to-joint yield conversion.
- Ace 50190 / 58102: USD4.99, 1.25 in × 8 ft steel corner bead, sale pack unknown.
  https://www.acehardware.com/departments/building-supplies/lumber-and-trim/corner-beads/50190
- Ace 1024487 / 2007312: USD5.99 sponge presentation; current pack contents unknown.
  https://www.acehardware.com/departments/paint-and-supplies/painting-tools-and-supplies/sanding-sponges/1024487
  The older https://www.acehardware.com/p/1024487 crawl (four months earlier)
  stated “Number in Package:1pack” and “Carded”. It is separate historical evidence,
  not current proof of unit contents. Both ambiguous Ace packs stay `pack_pending`.
- Home Depot 100321605 / 380501: Store SKU258725, 4.5gal pail; 100321610 / 384210:
  Store SKU632716, SO1001390484, 18lb bag; 202530243 / 14113411708: Store SKU893749,
  sold by one 1/2in × 4ft × 8ft panel,32sf. Official full product URLs are stored
  in the refreshed records. All prices remain null. The screws 311654611 retain
  the older evidence/date: the new attempt had a cache miss and only a three-month
  index; neither current SKU, price nor count per pound was established.

Actual combined counts: **59 references, 50 with public amounts, 9 missing,
zero locally verified**. Construction alone:34/30/4. All five painting login or
family-only gaps and all four Home Depot gaps remain. No existing saved estimate
is migrated, repriced or mutated by this in-memory catalog batch.

## Supplier prerequisites

Lowe's official Product Discovery information describes store-level product,
price and inventory capabilities, with organization/app onboarding and credentials:
https://developer.lowes.com/portal/solutions/product-discovery/
https://developer.lowes.com/portal/contact/

Home Depot describes a daily affiliate feed; licensing and local granularity need
review: https://www.homedepot.com/c/SF_MS_Affiliate_Program_FAQs

The registry/UI label both connections `not-configured`. These are documentation
links, not invented API endpoints or evidence that an integration was tested.

## Validation and integration

Final local validation: **270 tests passed in 62 files**, oxlint clean,
Vite frontend build successful and `git diff --check` clean. The normal full
suite uses loopback HTTP and in-memory PGlite fixtures; no remote database or
supplier API was exercised.

Use the existing installed dependencies through the ignored worktree junction.
Set TEMP and TMP to this worktree's `.test-tmp` so test transforms do not write to
the shared dependency checkout. Tests use synthetic environment values only:

```powershell
$env:TEMP=Join-Path (Get-Location) '.test-tmp'
$env:TMP=$env:TEMP
$env:VITE_SUPABASE_URL='http://127.0.0.1:8790/test-supabase'
$env:VITE_SUPABASE_ANON_KEY='fixture-public-key'
node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner
node node_modules/oxlint/bin/oxlint
node node_modules/vite/bin/vite.js build --configLoader runner
git diff --check
```

The Vite command validates a local frontend build with synthetic public settings.
It does not validate the production release configuration guard; no production
environment or secrets were copied. Run the normal configured release gate in
the integration checkout after the team/sales release. The existing >500kB bundle
warning remains. No shared browser profile was used.

Regression coverage includes expiration with exact package round-up, pending
amounts, SKU/variant/vendor/store/ZIP/account isolation, stale cache fallback,
timeout/cancellation, blank ZIP/no configured API, override preservation,
idempotent research import, immutable original snapshots, missing Home Depot
amounts and English/Spanish evidence without supplier network refresh.

Commercial markup/margin defaults and labor assumptions are unchanged. The
pre-existing 25% painting sale margin versus 25% cost markup distinction still
needs an explicit commercial decision; no automatic normalization was made.
