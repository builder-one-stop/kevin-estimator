# Research import button regression closure — 2026-10-28

Supersedes candidate6e83d354 for delivery. Isolated branch `feat/pricing-mobile-candidate-20261028`, worktree `pricing-mobile-worktree`. Application change is one mapping line in AiSettings: the actual Import research for review button now copies `model` and `variant` from each research entry. The identity validator and earlier P2 protections are unchanged.

## Reproduction and regression

The new test renders AiSettings itself, clicks its real EN/ES button from an empty managed catalog, applies the preview, saves, unmounts/remounts and repeats the import. It does not duplicate the button mapping in test code. Before the correction both tests failed because the Apply button was disabled; `before-regressions.json` preserves that result. The underlying source has25 records and12 nonempty models, matching the reported12 rejected bindings; HD01's275001 model is now retained. No variant is currently declared in the source data; the button explicitly forwards the optional source variant without inventing one.

The tests assert all25 source models/variants, original prices/dates, absence of binding/classification errors, persistence and repeat-import idempotency. The unit persistence stub uses the existing versionManagedCatalog function to mirror server versioning; an intermediate stub-only expectation failed before that correction. The browser test independently exercises the real local HTTP/server/versioning path, not the stub.

## Producer audit

| Producer | Review |
|---|---|
| AiSettings research button | Only omission found in managed research-entry production; model/variant forwarding fixed. Existing source IDs and package/SKU metadata unchanged. |
| AiSettings manual Add and edit controls | Manual records have no research binding; model/variant remain optional. Editing spreads the existing entry, preserving identity fields. No model or variant inferred. |
| JSON import / shared catalogImport | Schema parses and preserves supplied model/variant; researchBindingIssue still rejects omitted/changed identity when a source binding requires it. No validation relaxed. |
| Authorized quote importer | Explicit model/variant input and output already preserved; no research sourceId attached. |
| MaterialCatalogService resolve | Projects all declared catalogSchema fields, including model/variant. No lossy hand mapping. |
| InternalCatalogProvider / resolvePrice | Parse/clone existing catalog records; no identity-field projection omission. |
| researchCatalog source | Supplies model for every row, blank where unknown. No source variant exists in current observations. |
| versionManagedCatalog / snapshots | Existing object spreads and history retain model/variant. |
| localPriceLibrary.libraryCatalog / construction trade paths | Separate construction-library provenance contract used by tradeRules/drywallFinishing; not the managed paint research-import path. Model/variant retained by spreading the source record. |
| publicReferenceLibrary / maintenance / coverage report | Read-only display/report transformations, not managed-entry import producers. No change required. |

## Final verification

- Full suite417/417,78 files, including two new real-button EN/ES regressions; lint and git diff check pass.
- Real headless Chrome390px EN/ES: empty catalog → actual button → valid25-row preview before any persistence → apply/save → reload → repeat import/save. HD01 model275001 retained; zero identity issues or pending classifications; original dates/prices retained;25 rows remain, priceVersion1, no duplicates or new price versions; operator-A untouched. No page errors.
- Unchanged production guard and Vite pass with existing authorized Kevin public URL/key in child memory. No env file or private key copied; existing chunk-size warning remains.
- All4 final Netlify ZIPs regenerated with existing official ZISI16.5.0/NFT/Node24 and audited. ZIP integrity/paths pass; no symlinks, env/private files, known private-value matches or fixture credentials in ZIP/dist. Required Linux Sharp/libvips verified ELF64 x86-64. Backend is unchanged, so function hashes may match6e83d354; frontend hashes change.
- Actual extracted handlers import on Windows. Without runtime credentials and with fetch blocked, ai-run401, ai/workers503; cleanup never invoked; zero network requests. This is not deployed Linux execution.

Evidence: `evidence/research-import-button-2026-10-28/` contains unit results, before-regression summary, real browser report, saved synthetic records, screenshots, production audit and bundled smoke. Reproduction: `node scripts/research-import-button-browser.mjs` and Vitest `tests/ai/researchImportButton.test.jsx`. Browser/network confined to isolated loopback; no real AI or supplier request.

Own QA server/browser contexts closed; no listeners5312/8902. Source release remains732d08d with only its pre-existing unrelated scripts/ai-browser.mjs edit; pricing/mobile sources remain clean. No package/lockfile, schema, role, credential, hook or remote environment change. No SQL remote, push, deploy or publication. Migration readiness, physical-device/Safari QA and deployed runtime verification remain unchanged external limits.
