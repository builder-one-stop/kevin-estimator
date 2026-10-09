# AI estimator verification and activation

**Current activation, 2026-10-09:** Migration `20261007120000_ai_estimator.sql` is applied to the verified `vtpciccluvpaclbeqxih` project. The two pre-existing estimates remain. The private bucket, new RLS tables, restrictive storage policy and service-only RPC were checked remotely. The backend secret file has mode 600 and is Git-ignored; both server credentials are configured there, with the OpenAI key removed from `.env.local`. After API credit was added, the real-model Chrome journey passed. See [implementation tracking](ai-estimator-progress.md).

## Evidence boundaries

Baseline on 2026-10-07: 5e179cf, branch `fix/estimate-isolation-and-draft-recovery`, 48 tests/lint/build passed; only `design/` was untracked. Supabase CLI identified the linked, healthy `kevin-estimator` project `vtpciccluvpaclbeqxih`. This delivery uses branch `feat/ai-estimator-approved-plan`. No customer data was used or modified. No merge or deployment, no new remote migration, no email sent.

The normal email receipt/link access remains verified by the prior user's confirmation on 2026-10-03, recorded in `evidence/browser-validation/email-access.json`. This delivery's new browser journey uses an isolated local test session, not a new email delivery test.

## Automated verification

`npm test`: original editor/auth/route/draft/SQL tests plus new domain, HTTP+PostgreSQL and Responses transport tests. See final run in `evidence/ai-estimator/tests.txt` for the count and result.

Coverage:

- Actual PostgreSQL migrations, owner isolation, anonymous denial, forged relationships and browser rejection of the service-only atomic RPC. A restrictive storage policy denies access to the private evidence bucket even if an unrelated broad storage policy exists.
- Exact plan revision approval, material questions blocking approval, edited plan invalidation, one active run/owner, persistent results, idempotent request replay, duplicate clicks, cancellation with no late commit and explicit provider error preservation.
- Current manual estimate context, readable bounded diff, stale estimate-version refusal, one-time application and controlled revision restoration. Original immutable draft-recovery regression tests continue to run.
- Decimal fixture: 29 lines, 19.5 labor hours, material $1,485.00, labor $1,462.50, cost $2,947.50, markup $1,061.10, client total $4,008.60, margin 26.5%, wall unit sale $88.40/GAL and labor $102/HR. GAL/QT stay separate. This is **not live supplier pricing**.
- Documents consume the same approved bilingual scope. Generated descriptions must exactly match a component in that approved plan. An approved task ID alone cannot authorize bedroom ceilings or a full-primer description. Unknown task IDs, implicit deletions and product substitutions are rejected. Kitchen exclusions, spot primer, ceiling product and alternative finishes remain verbatim approved fields.
- Responses adapter tests inspect model/effort, strict schemas, vision input, tool arguments/state, bounded failure, token accounting and optional configured cost rates. Its network transport is mocked; it does not prove the real model follows the instructions.

## Real browser, controlled model

`npm run test:ai:browser` starts Vite, the actual application HTTP backend and migrated ephemeral PostgreSQL/PGlite, and drives installed **Google Chrome** with Playwright. For an interactive local review, `npm run dev:ai:fixture` exposes `http://127.0.0.1:5180/__fixture/session` with an explicit test-session button. It is absent from the real backend. The separate test entrypoint supplies synthetic authentication and a deterministic model. It imports no remote/service credentials. UI explicitly displays the controlled-test banner. Closing the harness destroys its test data and private in-memory files.

Observed steps and outcomes are written to [browser-results.json](../evidence/ai-estimator/browser-results.json). Screenshots and actual downloaded PDFs are in the same directory. The journey covers contact/project creation and links, image upload, pending question, plan editing/approval, result, reload, manual edit, chat change, second-tab conflict, re-proposal/application, restoration, preference/catalog persistence, in-place UI EN/ES, independent document language, visible errors/retry and PDF export. Test photos are generated solid-color fixtures; they prove upload/delivery, not vision quality.

The original `npm run test:browser` uses the remote Supabase project and was not rerun during this real-model check. Its prior remote-browser evidence remains historical. The live journey described below uses a temporary remote account against the already migrated project.

## PDF checks

Real jsPDF output is rendered with PyMuPDF (Poppler is absent here). Inspect every page for legibility, section continuation and clipping; extracted text checks assert totals, no default internal cost, page numbering, approved exclusions and no broad-prime/extra-ceiling claims. Evidence includes both fixed-fixture PDFs ($4,008.60) and browser-edited PDFs ($4,273.80 before restoration). The latter are expected to differ because Chrome changed quantities. `pdf-checks.json` records the checks. PDF filenames include type/language/revision. A manually renamed item preserves its text rather than resurrecting a stale AI translation.

## Real OpenAI evaluation — passed after API credit

With `gpt-6.1-sol` and medium reasoning, the authenticated Chrome journey at `localhost:5173` sent “hola”, received a Spanish answer, submitted a small synthetic bedroom painting request, reviewed and approved its plan, generated an estimate, reopened it and changed the paint quantity from 2 to 3 gallons. The three persisted lines totaled $380.00 cost / $516.80 sale before editing and $445.00 cost / $605.20 sale after editing at 36% markup. Reloading the editor preserved the quantity and total. No customer account or data was used. The temporary account and its records were deleted, with cleanup verified by the fixture. The prior credit-exhaustion run is historical; the current browser run has no errors.

| Real Responses call | Returned model | Input tokens (cached) | Output tokens | Provider duration | Estimated USD |
| --- | --- | ---: | ---: | ---: | ---: |
| “hola” | `gpt-6.1-sol` | 3,365 (0) | 55 | 3,210 ms | $0.0072800 |
| Quote plan | `gpt-6.1-sol` | 3,560 (3,362) | 1,541 | 27,607 ms | $0.0161422 |
| Estimate generation | `gpt-6.1-sol` | 5,087 (0) | 1,024 | 17,192 ms | $0.0204140 |
| **Total** | | **12,012 (3,362)** | **2,620** | **48,009 ms** | **$0.0438362** |

These durations are measured provider calls, not end-to-end clicks. The cost uses configured [Standard model token rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and is an estimate, not an invoice. The run used prompt `estimator-2026-10-09.3`. [Structured result](../evidence/ai-estimator-live/results.json), [hello screenshot](../evidence/ai-estimator-live/hello.png) and [saved editor screenshot](../evidence/ai-estimator-live/estimate.png) are the browser evidence. The checkout and generated numbers are a synthetic example; supplier prices and actual construction adequacy were not verified. The prior user's email-link receipt/access confirmation remains separate evidence and was not repeated in this run.

The first post-credit run exposed two quality issues: the model put optional, explicitly nonblocking details in `pending`, preventing plan approval, and placed “2 gal” in a description that became false after a manual quantity change. Prompt version `.3` confines blocking questions to material gaps and keeps mutable quantities in numeric fields. The final real run produced an approvable plan without pending questions or embedded mutable quantities. The browser test also exercises the manual plan review path if a future run lists only explicitly nonblocking provisional details.

Once securely configured, run the reference scope and also: unspecified heights, kitchen walls-only, spot prime, alternate finishes, exact product preservation, a limited Bedroom 2 edit after manual changes, current-request-over-preference, catalog mismatch/failure, Spanish conversation with English document, missing client/address, reload and concurrent retry. Evaluate semantic correctness, transparent assumptions and preserved IDs/quantities, not textual matching or a mandatory 29-line free response. Record prompt version, gpt-6.1-sol/medium, real duration, usage, configured price rates and violations. Repeat selected difficult cases with server effort=high only by configuration; never silently switch models.

## Activation record and remaining steps

1. `20261007120000_ai_estimator.sql` is additive: new owner-scoped tables, private bucket, versioned commit RPC and revision triggers. It does not assign legacy ownership or delete old records. It passed local PostgreSQL tests, then was applied remotely on 2026-10-09 after confirming project identity, the single pending migration and bucket compatibility. A private local pre-apply backup contains the two original estimate rows; both remained afterward. The remote migration list is aligned.
2. Configure secrets through the server's secure environment, **not chat and not VITE variables**: `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` are set in the ignored mode-600 `.env.server.local`. Nonsecret values: `SUPABASE_URL=https://vtpciccluvpaclbeqxih.supabase.co`, `OPENAI_MODEL=gpt-6.1-sol`, `OPENAI_REASONING_EFFORT=medium`, `APP_ORIGIN=http://localhost:5173`, `PORT=8787`. The local Standard token price rates were set to the [official model prices](https://developers.openai.com/api/docs/models/gpt-6.1-sol); computed cost is an estimate, distinct from API usage and invoices. The key is not duplicated in `.env.local`.
3. The Node backend is listening on loopback and an existing Vite instance at `localhost:5173` reaches it through `/api/ai`. A 401 without authentication confirms the proxy and auth gate. For a future hosted preview, configure an HTTPS reverse proxy to the Node service and the exact APP_ORIGIN; do not expose the service-role key or replace auth with the local fixture adapter. No application deployment or merge was done.
4. `npm run test:ai:real-browser` now passes with credit. It uses a temporary account, tests a real response to “hola”, requests and approves a small synthetic plan, generates/reopens and edits an estimate, records actual model metrics and deletes only its own records. A Kevin usability trial can judge actual generated estimates; this synthetic case does not establish supplier-price accuracy or quality over varied scopes.

## Operational limits

Persistent polling (2.5 seconds) reports committed public stages; speculative streamed text is deliberately not used for mutations. At most 80 messages/conversation, 8,000 characters/message, 6 images (5 MB raw/normalized each, 16 megapixels), 40 tasks, 200 lines, 500 catalog entries (first 100 currently offered to the model), 4 model cycles/6 tools, 12k output tokens, 120 seconds/run and one persisted active run/owner. Backend has 8 concurrent runs/process and a 40 writes/minute/user local rate limiter. Expired run leases recover on next read/request after 150 seconds; interrupted work is never reported ready. Retried commands reuse IDs in the browser; writes check both conversation and estimate versions.

Only JPEG/PNG/WebP are accepted; bytes are decoded, normalized and metadata stripped server-side. Private files are served through bearer-authenticated owner checks. Metadata changes invalidate pending approvals. Storage deletes occur after database authorization/lease checks; a storage outage can leave an inaccessible orphan and returns `STORAGE_CLEANUP_PENDING`. A scheduled reconciliation/retention job is a hosted-operations follow-up, not an implemented supplier feature.

Bilingual plan/component text is explicitly reviewable. Automatic structural equality prevents scope drift in generated documents, but the single real-model synthetic example does not establish reliable interpretation, translation, construction quantities or adequacy across varied jobs. Human plan review remains required. Manual descriptions are preserved verbatim across languages until the user supplies their translation. Legacy manual estimates retain their older proposal template; the approved-scope renderer applies to estimates created through this new flow.

See [provider/CRM roadmap](providers-and-crm-roadmap.md) for authorized supplier access, lead conversion, audio/video, contracts and other later integrations.
