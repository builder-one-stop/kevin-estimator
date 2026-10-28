# Pricing + mobile integration candidate — 2026-10-28

Isolated worktree: `C:\Users\ricar\Documents\Codex\2026-10-25\task-2\pricing-mobile-worktree`; branch `feat/pricing-mobile-candidate-20261028`.

Sources: pricing `d66ba4c2e529321252d576cf55b6ea1ed50fffeb`; mobile `56e21f9e928262677ab3a9dd218f8019d05b819b`, whose parent/merge-base is release `732d08dfe0c476ec7c52d9427e67c957b5b6bec1`. Cherry-pick produced `7934abf`. The only conflict was appended CSS: both blocks were retained. Every nonempty CSS line from each source is present. No functional edits beyond this existing mobile commit.

## Changes versus sources

Versus pricing: existing mobile activity/reconnection, synchronous send lock, viewport handling, theme/touch styles and mobile QA. Versus mobile: the full existing pricing stack (web references, importer, provenance, snapshots, function-specific SKU selection, explicit technical coverage). Verification scripts/evidence/documentation are added separately. No change from pricing to `server/`, `shared/`, `supabase/`, `netlify/`, dependencies or estimate calculation code. No role or schema migration change.

## Verification matrix

| Check | Result / evidence |
|---|---|
| Complete suite | 403/403 tests, 75 files; `evidence/pricing-mobile-2026-10-28/unit-results.json` |
| Lint | oxlint exit 0 |
| Frontend compilation | Vite succeeds with explicitly synthetic loopback public configuration; existing >500 kB chunk warning. This dist is QA-only, unsuitable for publication. |
| Production configuration | Guard rejects missing candidate configuration (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Existing original public config was checked in memory, without copying: `PUBLIC_SUPABASE_TARGET_INVALID`; production build therefore not run. No guard bypass. |
| Mobile chat | Existing controlled-provider QA: desktop 1440x1000 and mobile390x844; send deduplication, preview, reading position, history/resume, failed send/reload/retry, cancel, provider failure, interrupted polling/reconnect EN/ES, reduced motion, keyboard-space simulation; 8 checks, no errors. `chat/visual-results.json` |
| Integrated pricing | Real local chat → plan approval → estimate → edit → reload → PDF, EN/ES390px. Paint/primer SKU-specific snapshots, explicit coverage recalculation, manual quantity/price retention, reset, mismatched SKU pending and return to exact SKU; `report.json` |
| Persisted compatibility | Existing legacy-plan/repository/document/draft tests pass, including retained pre-expansion estimate and isolated seller access. Mobile adds no persisted fields or schema changes; existing receipt/idempotency format retained. New technical snapshots survive browser reload and PDF. No automatic migration/recalculation on load. |
| PDFs | Four actual downloads, 19 pages total. Saved totals, source/model/date/revision/ranges, pending primer labor and numbering checked; all text inside bounds; all19 pages visually reviewed in contact sheets. `pdf-checks.json`. Poppler reports Symbol/ArialUnicode fallback warnings; inspected output remains legible. |
| Function inputs | All4 Netlify entrypoints imported, default exports checked; ai-run background flag preserved; sharp and Linux native packages available. No function invoked, no network call. `artifact-audit.json` |
| Secret exposure | Compiled QA dist and function entrypoint source scanned against existing private config values in memory: no matches; no env/key files in dist. No secrets copied. No ZIP was produced, hence no ZIP secret attestation. |
| Netlify packaging | NOT verified: Netlify CLI/zip-it-and-ship-it absent. No invented ZIP or deploy equivalence. |
| Cleanup/source integrity | Own QA servers/browser contexts closed normally; no listeners remain on5180/8790/5324/8914. Pricing and mobile source clean at their original SHAs. Original release retains only its pre-existing unrelated scripts/ai-browser.mjs modification. |

Commands: `vitest run --no-cache --configLoader runner --testTimeout 15000` with synthetic public env; `oxlint`; `vite build --configLoader runner` with synthetic public env; `node scripts/pricing-mobile-browser.mjs`; `CHAT_BROWSER_EVIDENCE_DIR=evidence/pricing-mobile-2026-10-28/chat node scripts/chat-experience-browser.mjs`; bundled Python `scripts/pricing-mobile-pdf-check.py`; `node scripts/pricing-mobile-artifact-check.mjs <existing-server-env-path>`. The latter optional path is read only to compare private values in memory and never printed. Initial unit attempt omitted required public fixture env: four module initializations failed, zero assertions failed; corrected complete run above passed. Initial audit used a package.json export prohibited by sharp; corrected filesystem manifest check passed.

Harness notification requests report `Unknown test route` for workers/notifications; this fixture does not implement notifications, which are outside this QA. No page errors. WebKit executable unavailable; real Safari, physical keyboard, device safe-area and zoom remain untested. No real AI, supplier API, authentication service, customer data, SQL remote, contacts or costs exercised.

## Publication prerequisites (not performed)

1. Supply/confirm the existing release's correct public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the production build environment, then run the unchanged guarded build. Do not reuse QA dist.
2. Run genuine Netlify function packaging with its normal toolchain and inspect final ZIP/native dependencies and secret exclusion. This local input/import audit does not replace it.
3. Resolve the release's previously blocked Supabase migration through its authorized process, then validate deployed roles/persistence and runtime configuration. No migration or remote action attempted in this block.

Supplier connections remain unconfigured: references are public observations, not verified current local prices. Manufacturer coverage is not labor productivity. Labor automation still needs real data. No new products, prices, productivity, integrations, permission changes or publication authorization inferred.
