# Chat-to-catalog integration — local integration candidate

Worktree: `C:\Users\ricar\Documents\Codex\2026-10-25\task-2\pricing-chat-worktree`.
Branch: `feat/pricing-chat-integration-20261028`. Release base:
`732d08dfe0c476ec7c52d9427e67c957b5b6bec1`; previous pricing work preserved on its
original branch and applied here as `005e74c`. Neither the release checkout nor
the independent mobile branch is modified by this integration.

## Connected now, locally

1. `MaterialCatalogService` reads the versioned painting catalog and only the
   authenticated owner's settings catalog. `/api/ai/pricing/catalog` is a read-only
   authenticated endpoint. Exact SKU/model/variant/package/vendor/store queries
   are separate from text suggestions. An absent or ambiguous SKU yields a
   pending material, without a default-product price substitution.
2. The engine supplies a bounded material-reference projection to the language
   provider. `lookup_catalog` uses that prepared internal context. The hybrid
   paint interpreter identifies scope and literal material requests; code resolves
   their identities and prices. The language model never establishes a verified
   price or authors derived material evidence.
3. The plan displays the chosen product, purchase package/unit, SKU, recorded
   amount, date, source and status. A salesperson can explicitly choose another
   reference, an optional job ZIP and a separate buying-store candidate. Saving
   the plan re-resolves the exact selection. It does not fetch supplier prices.
4. Server-owned material snapshots bind the reviewed plan to deterministic paint
   calculation. A catalog update between plan review and generation cannot silently
   reprice the approved choice. Paint/coats/waste/packages are calculated by code,
   with whole-package round-up and the existing editable yield assumptions.
5. Feet, inches, metres and mixed explicit dimensions convert through the existing
   conversion code; original request/measurements are retained. The proposal shows
   the current editable dimensions/area alongside the original values after edits.
6. A known package remains calculable when its amount is null. An unresolved
   package has a pending purchase quantity. Unknown values do not appear as free
   materials. Web, local evidence, authorized account quotes, historical snapshots,
   manual adjustments and missing values remain distinct. A manual override keeps
   the original snapshot and never inherits its verification.
7. The saved estimate, editable breakdown and actual downloaded EN/ES PDF use the
   same line data. Source labels include SKU/model/unit and recorded offer-store
   context when present. Tax/freight/stock remain unknown unless explicitly supplied;
   no automatic per-item addition or duplication of these charges was introduced.

The existing catalog remains **59 public references / 50 public amounts /
9 missing / 0 locally verified**. Synthetic quotes exist only in isolated tests.
No commercial margin or labor-rate defaults were changed.

## South Bay context

Lawndale is the service base, with coastal work south toward Palos Verdes. That
does not select a job ZIP. These official store candidates are configurable and
initially unselected; all have connection `not-configured`, price/stock null:

- Sherwin-Williams Lawndale704362,90260:
  https://www.sherwin-williams.com/store-locator/paint-store/lawndale/ca/704362
- Lowe's W.Torrance2268,90505:
  https://www.lowes.com/store/ca-torrance/2268
- Home Depot Hawthorne0620,90250:
  https://www.homedepot.com/l/Hawthorne/CA/Hawthorne/90250/620
- Home Depot Torrance0618,90505:
  https://www.homedepot.com/l/Torrance/CA/Torrance/90505/618

Selecting a candidate never changes a public observation into its store quote.

## Authorized quote/CSV contract — preparation, not an external connector

`server/authorizedQuoteImport.js` normalizes typed rows only after an explicit
`authorized:true` call. It does not read a feed, contact suppliers, create an
account, write settings or bypass the existing admin import permissions.

The contract requires quoteId, product, brand, SKU, exact package, `unit:'ea'`
(price per purchased package), unitCost:number|null, USD, vendor, source URL,
checkedAt, validUntil:null|date, separate offer context and nullable taxUsd,
freightUsd and stockQuantity. Unknown columns, including credential columns, are
rejected. Stable offer UUIDs prevent duplicate imports; importing does not grant
local verification. Original observations and overrides remain versioned.

For an authorized CSV, its approved column mapping must first produce these rows:
store_id maps to offer.storeId, destination ZIP to offer.jobZip, store ZIP to
offer.storeZip, and supplier account label to offer.accountContext (no credential).
A supplier product_id must not be guessed to be a SKU; establish the exact SKU/
variant/package mapping. Blank price/tax/freight/stock becomes null, never zero.
No vendor-specific CSV/SFTP transport or CSV upload UI is implemented here. The
normalized JSON can use the existing validated admin catalog import workflow.

Still NOT connected: Lowe's API/CSV/SFTP, Sherwin PRO+ account pricing, Home Depot
affiliate feed, live stock, negotiated rates, tax or freight services. Official
capability information supplied by the coordinating research:

- https://developer.lowes.com/portal/business-components/Product%20Catalog/
- https://developer.lowes.com/portal/solutions/product-discovery/
- https://www.homedepot.com/c/SF_MS_Affiliate_Program_FAQs

Availability, credentials/onboarding, cost, license and local granularity remain
unconfirmed. No supplier registration, contact, scraping or agreement occurred.

## Local evidence and reproduction

Full suite: **302 passing tests in67 files**, followed by document/PDF/catalog
regressions (**28 passing in6 files**) after the final original/current-measurement clarification. Oxlint and
Vite frontend build pass; the existing >500kB chunk warning remains. Build uses
synthetic public settings. Production release configuration is not validated:
no production environment file or secret was copied. No remote SQL/deploy/push.

`scripts/pricing-chat-browser.mjs` launches a new headless Chrome process, isolated
contexts, controlled provider and ephemeral PGlite on5302/8892. Network is allowed
only to loopback; external font requests are blocked. It exercises real UI chat,
SKU search, manual reference change, candidate selection with blank job ZIP, plan
approval, inch-to-foot quantity calculation, saving/reload, manual override,
recalculation, actual PDF download, EN/ES and390px. It waits for sidebar transitions
before screenshots. No independent mobile-branch code was imported.

`scripts/pricing-chat-pdf-check.py` reads the actual downloaded files with pypdf
and pdfplumber, checks matching saved totals, pending/manual provenance, unknown
charges, page numbering and text bounds; Poppler renders every page for visual QA.
Both PDFs have three pages. Evidence is under
`evidence/pricing-chat-2026-10-28/`: report.json, saved-en/es.json, proposal-en/es.pdf,
desktop/mobile screenshots, pdf-checks.json and per-page/contact PNGs. These records
are synthetic and are not customer quotes. The generic harness does not implement
worker notification requests; its unrelated fixture warnings are not worker QA.

```powershell
$env:TEMP=Join-Path (Get-Location) '.test-tmp'
$env:TMP=$env:TEMP
$env:VITE_SUPABASE_URL='http://127.0.0.1:8790/test-supabase'
$env:VITE_SUPABASE_ANON_KEY='fixture-public-key'
node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner
node node_modules/oxlint/bin/oxlint
node node_modules/vite/bin/vite.js build --configLoader runner
node scripts/pricing-chat-browser.mjs
# Use the bundled Python with pypdf/pdfplumber/Pillow and bundled Poppler:
python scripts/pricing-chat-pdf-check.py
git diff --check
```

Integration remains local for review after the separate release/migration work.
The first deterministic flow covers one interior-wall paint scope. General fuzzy
product matching, vendor-specific CSV parsing/upload, automatic mixed-trade
interpretation and live supplier access remain outside this candidate. Resolve
ambiguous named products by explicitly selecting the exact reference in the plan.
