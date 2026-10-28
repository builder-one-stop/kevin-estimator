# Reference maintenance and next coverage queue

Settings now includes a read-only maintenance view for painting/preparation
research plus the current owner's managed catalog. It shows records with an
amount, missing amounts, stale observations and a bounded next-review queue.
The25 base paint/preparation records contain20 public amounts and5 gaps. The
separate existing public construction library remains part of the59-reference,
50-amount global inventory; no new trade engine or supplier collection was added.

Queue reasons include missing price/package/SKU, invalid or old source dates,
expired validity, incomplete source evidence and paint packages without a
documented conversion. These are review information, not gates on budgeting.
No date, price, default product, markup or previous snapshot changes. No network
refresh occurs. Advancing the test date marks observations stale without
rewriting their dates or discarding reference amounts.

Tests:8 focused maintenance/import tests pass in2 files. Controlled Chrome also
verifies the panel after importing an owner list:27 records/21 amounts/6 pending,
owner-A data empty, no price/date refresh,390px fit. Oxlint and Vite frontend build
pass; the pre-existing >500kB chunk warning remains. Reproduction and evidence:
`scripts/catalog-import-browser.mjs`, `evidence/catalog-import-2026-10-28/`.
Final combined validation:315 tests passed in70 files; all three controlled
web-reference flows and the import/maintenance browser workflow passed.

Completed sequence this turn:
1. Web references usable by default, EN/ES explanations, accepted alternatives
   explicitly distinguished from exact equivalence (`c7e1024`).
2. Existing JSON importer gains preview, merge/replace, units/package/date/duplicate
   validation, null preservation and owner history (`f751dd2`).
3. Read-only maintenance/coverage queue without automatic supplier fetching.

Next bounded queue:
- Seller-owned catalog writes: requires explicit authorization to change the
  existing admin-only permissions. Not implemented or bypassed.
- Resolve the5 painting research gaps only when exact variant/package data is
  available; meanwhile public defaults or explicitly chosen alternatives can be
  used for budgeting. No account/contact is required to continue estimating.
- If an authorized real list uses CSV, map its documented columns into the existing
  validated JSON/quote contract; do not guess SKU or unit/package meanings.
- Provider sync/licensing/onboarding remains separate and unnecessary for the
  current reference flow. No new Dunn-Edwards/Catalina catalog or prohibited
  scraping was added. No production SQL, new credentials, push or deployment.
