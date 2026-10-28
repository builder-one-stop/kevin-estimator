# Own-list maintenance: extend the existing JSON importer

This extends the existing admin catalog import in Settings. It does not introduce
a second importer, CSV transport, vendor sync or new permissions.

- A selected JSON array (existing1MB/500-row limits) opens a preview. No catalog
  draft or server settings change until the reviewed import is applied.
- Default merge preserves unrelated current entries. Replace is explicit and
  shows removal counts. Apply updates only the draft; the existing Save action
  persists it with optimistic version checks and server-maintained history.
- Validation covers record schema, purchased-unit/package consistency, duplicate
  IDs, same-SKU/provider/package/store offers (including renamed aliases), duplicate
  research overrides, source dates, validity and market mismatch. Unknown/private
  columns are rejected. Existing exact identities reuse their IDs on repeat imports.
- Dates and prices are not normalized to today/zero. Null amounts remain pending;
  stale references retain their date with warnings. Whole5USgal containers use ea,
  not a per-gallon price. Unrecognized paint packages warn that automatic takeoff
  remains pending; no yield is invented. Known research conversion metadata is
  used only for the unchanged documented package.
- Direct catalog edits are also checked before saving. New blank entries begin
  with price null. Imported verification is not automatically granted.
- Prior estimate/plan snapshots remain unchanged when the owner updates a list.

Validation:10 focused tests pass in2 files (including web-reference regressions),
oxlint and Vite frontend build pass. The controlled Chrome/PGlite run in
`scripts/catalog-import-browser.mjs` uses existing synthetic admin-B/operator-A
roles, loopback-only browser requests, and390px. It proves invalid units and
duplicates block apply, preview performs no persistence, merge keeps pending rows,
save/reload versions a changed price with history, replace removals are visible,
cancel preserves data, and the other owner's catalog remains empty. Synthetic
evidence is in `evidence/catalog-import-2026-10-28/`.

Permission boundary: the existing API/UI reserve catalog writes to administrators.
That was NOT widened to sellers/operators. Sellers can still select public
references and edit their estimate prices under the existing workflow. Allowing
seller catalog writes would require an explicitly authorized permission change,
outside the current instruction not to touch seller/security behavior.

No remote SQL, supplier contact/account, scraping, new credentials, push or deploy.
