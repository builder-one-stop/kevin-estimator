# AI estimator verification and activation

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

The original `npm run test:browser` uses the remote Supabase project. It was **not rerun** for this delivery: no new remote migration was authorized. Prior remote-browser evidence is historical and remains labeled as such.

## PDF checks

Real jsPDF output is rendered with PyMuPDF (Poppler is absent here). Inspect every page for legibility, section continuation and clipping; extracted text checks assert totals, no default internal cost, page numbering, approved exclusions and no broad-prime/extra-ceiling claims. Evidence includes both fixed-fixture PDFs ($4,008.60) and browser-edited PDFs ($4,273.80 before restoration). The latter are expected to differ because Chrome changed quantities. `pdf-checks.json` records the checks. PDF filenames include type/language/revision. A manually renamed item preserves its text rather than resurrecting a stale AI translation.

## Real OpenAI evaluation — pending

No `OPENAI_API_KEY` is configured. No Responses request was sent to OpenAI; no real token usage, cost, latency or model quality was measured. Controlled-fixture timing and mocked transport usage must not be reported as actual model measurements.

Once securely configured, run the reference scope and also: unspecified heights, kitchen walls-only, spot prime, alternate finishes, exact product preservation, a limited Bedroom 2 edit after manual changes, current-request-over-preference, catalog mismatch/failure, Spanish conversation with English document, missing client/address, reload and concurrent retry. Evaluate semantic correctness, transparent assumptions and preserved IDs/quantities, not textual matching or a mandatory 29-line free response. Record prompt version, gpt-6.1-sol/medium, real duration, usage, configured price rates and violations. Repeat selected difficult cases with server effort=high only by configuration; never silently switch models.

## Activation, intentionally not performed

1. Review `20261007120000_ai_estimator.sql`. It is additive: new owner-scoped tables, private bucket, versioned commit RPC and revision triggers. It does not assign legacy ownership or delete old records. Local tests apply the entire migration chain. Confirm linked project/ref again immediately before a future remote apply, inspect existing storage policy/bucket compatibility, take the ordinary backup, then apply the single pending migration through the existing CLI workflow. The migration aborts if a bucket of this name is already public. No copied dashboard SQL is needed.
2. Configure secrets through the server's secure environment, **not chat and not VITE variables**: `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`. Nonsecret values: `SUPABASE_URL=https://vtpciccluvpaclbeqxih.supabase.co`, `OPENAI_MODEL=gpt-6.1-sol`, `OPENAI_REASONING_EFFORT=medium`, `APP_ORIGIN`, `PORT`. Optional pricing rates are listed in `.env.server.example`; blank rates mean no cost estimate. A local gitignored `.env.server.local` can be used with `npm run dev:api`. Confirm real model access with those credentials.
3. Start Node 24 backend and Vite (`npm run dev -- --host 127.0.0.1`), using the already-authorized Supabase session. Vite proxies `/api/ai` to loopback :8787. For a future hosted preview, configure an HTTPS reverse proxy to the Node service and the exact APP_ORIGIN; do not expose the service-role key or replace auth with the local fixture adapter. Deployment/remote activation requires the next explicitly authorized step.
4. Run the real model evaluations and authenticated browser journey. Then a Kevin usability trial can judge the actual generated estimates. Today's evidence is sufficient for local workflow review; it is not a claim of a live production-ready AI service.

## Operational limits

Persistent polling (2.5 seconds) reports committed public stages; speculative streamed text is deliberately not used for mutations. At most 80 messages/conversation, 8,000 characters/message, 6 images (5 MB raw/normalized each, 16 megapixels), 40 tasks, 200 lines, 500 catalog entries (first 100 currently offered to the model), 4 model cycles/6 tools, 12k output tokens, 120 seconds/run and one persisted active run/owner. Backend has 8 concurrent runs/process and a 40 writes/minute/user local rate limiter. Expired run leases recover on next read/request after 150 seconds; interrupted work is never reported ready. Retried commands reuse IDs in the browser; writes check both conversation and estimate versions.

Only JPEG/PNG/WebP are accepted; bytes are decoded, normalized and metadata stripped server-side. Private files are served through bearer-authenticated owner checks. Metadata changes invalidate pending approvals. Storage deletes occur after database authorization/lease checks; a storage outage can leave an inaccessible orphan and returns `STORAGE_CLEANUP_PENDING`. A scheduled reconciliation/retention job is a hosted-operations follow-up, not an implemented supplier feature.

Bilingual plan/component text is explicitly reviewable. Automatic structural equality prevents scope drift in generated documents, but the real model's interpretation, translations, construction quantities and adequacy still require the pending model evaluation and human plan review. Manual descriptions are preserved verbatim across languages until the user supplies their translation. Legacy manual estimates retain their older proposal template; the approved-scope renderer applies to estimates created through this new flow.

See [provider/CRM roadmap](providers-and-crm-roadmap.md) for authorized supplier access, lead conversion, audio/video, contracts and other later integrations.
