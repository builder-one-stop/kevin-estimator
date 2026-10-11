# AI estimator — first functional increment

Baseline inspected 2026-10-07: 5e179cf; 48 tests, lint and build pass. No AGENTS.md found in repository/ancestors. `design/` belongs to the user and is untouched. Email receipt/sign-in remains the prior user-confirmed evidence, not a newly repeated delivery test.

The pasted request is authoritative. The three Handoff reports describe historical UI recordings, not verified tools, supplier prices, model identity or persistence. Their scope drift (ceilings, primer, kitchen trim, alternative finishes and ceiling product) becomes regression coverage. Their 29-line fixture is a financial fixture, not a required model answer.

## Architecture and invariants

Browser → authenticated Node HTTP API → Supabase. OpenAI Responses calls occur only in Node. Model and effort are server configuration, initially gpt-6.1-sol/medium; no automatic fallback. Explicit approval of the exact plan revision precedes estimate creation. User-owned conversations persist messages, plan revisions, run progress, proposals and idempotency receipts. Images use a private bucket. Existing estimates and draft recovery remain authoritative.

Every API operation validates a Supabase access token, then scopes reads/writes to its owner. Model tools can read only that conversation's preauthorized context, explicit preferences and internal catalog. No arbitrary SQL or client creation tool. A service-only atomic RPC checks the owner, conversation version, estimate version and relationships before committing an estimate and conversation together. Browser users can read only their conversations/revisions/settings; writes go through validated endpoints. Existing manual estimate updates remain protected by RLS and versioning.

Plan tasks have stable IDs, bilingual labels, included/excluded work, dimensions, preparation, product/finish, assumptions, pending material questions and provenance. Prices and quantities are model proposals; decimal code calculates money. Documents render the stored approved scope, not independently generated sales prose. New scope after creation is a proposed revision with a financial comparison; confirmation is atomic and refuses stale editor versions. Revision restore is also an explicit version-checked operation.

Local development and controlled-provider integration tests do not activate the service remotely. New migrations must pass local PostgreSQL tests. Remote migration/backend activation and real-model evaluations remain separately reported.

## Money

USD, no implicit taxes/shipping/discounts. Round unit cost to cents HALF_UP, then quantity × rounded unit cost to cents HALF_UP. Global markup uses HALF_UP on total; allocate residual cents deterministically to client lines. Explicit per-line markup is supported; margin is markup / sale. Canonical units are `hr` for HRS, `lot` for LS, `gal` and `qt`. Quantities retain units: GAL and QT are never added. Hours sum only labor/hr. Business labor/productivity assumptions are independent of material catalogs.

## Limits and safe failure

Text 8,000 characters/turn, 80 messages/conversation, 6 images/conversation, 5 MB/image, JPEG/PNG/WebP signatures only, 200 lines and 40 scope tasks, one active run/owner, bounded tool calls, 120-second model deadline, SDK retry at most once. Persist visible stage before work and final result before ready. No private reasoning in UI/logs. Cancellation invalidates the run's commit; abandoned runs expire. Missing credentials return an explicit unavailable error, never a fake success.

## Sources consulted

- [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

Access to the configured model must still be tested with this project's server credentials. This document does not infer availability from Codex's model.

## Regional estimating and seller conversation — 2026-10-11

The application market is Los Angeles, California, US, with USD, feet/inches and square feet. `shared/estimatingMarket.js` supplies the immutable configuration independently of EN/ES UI/document selection. New generated documents retain a market snapshot. Existing documents and manual quantities are not converted or rewritten in place. Seller-supplied metric measurements retain their originals in the plan alongside their conversions. Deterministic tools convert compatible length/area/volume/liquid units (US gallons) and calculate rectangular wall/floor areas. Full-wall requests ignore opening deductions; coats/waste do not alter the physical wall surface. Unknown height remains unknown. These calculations do not verify input measurements or infer dimensions from photographs.

Prompt version `estimator-2026-10-11.2` asks at most two essential, plain-language questions, uses the conversation and latest manual estimate to avoid repeats, and advances directly with sufficient facts. Secondary choices and unverified rates become visible editable assumptions reviewed together with the plan. Model schemas limit pending entries to two; runtime validation also rejects more than two question marks in the public message or in either language's pending entries. Legacy/manual plans remain readable under the original schema. Semantic question quality still depends on the model: these guards do not prove that every possible question is essential.

The existing `approvedRevision`, scope revision and `ai-approved-plan` revision origin authorize a plan, not Kevin's internal price approval. Estimate `Draft/Sent/Accepted/Rejected` is a separately editable commercial status, not an audited internal unit-price decision or evidence of a customer signature. The schema has no actor/date/version-bound internal price approval record or approved historical price corpus. Therefore no prior estimates are retrieved as approved price references, and the context explicitly reports approved history as unavailable. This avoids treating ordinary conversations, accepted estimates or manual catalog entries as approved pricing.

The existing data model is owner-scoped; there is no organization-wide sharing model to infer. Only the current owner's settings/catalog and authorized current estimate enter model context. Administrative review remains read-only and separate from estimating tools. Conversations never update catalog/settings automatically. Tests explicitly attempt to request another owner's prices and assert that neither those prices nor an invented approved history reaches the model.

Each new generated line records source, category and internal-price approval status. A documented matching user catalog entry can retain local-source provenance; it is not a live supplier search or internal approval. Missing/mismatched location keeps prices provisional without asking for ZIP as a prerequisite for a provisional quote. Material, labor and markup stay separate. Manual cost/unit/type changes clear active catalog verification and record a provisional manual source, preserving prior source/date as evidence and retaining unrelated manual notes and values. Quantity-only edits preserve source evidence. Existing saved estimates are not bulk rewritten.

The UI states the market, provisional-price limitation and approval meaning in EN/ES. `Plan` approval and generation gates, conflict checks and reviewed change application remain in place. No migration or remote data operation is required for this delivery.

### Verification and remaining integration

- `npm test`: 108 passing tests across 21 files; `npm run lint` and `npm run build` pass (existing bundle-size warning).
- `AI_BROWSER_EVIDENCE_DIR=evidence/regional-estimator/browser npm run test:ai:browser`: actual isolated local Chrome, migrated ephemeral PGlite, controlled provider. Covers regional notices, EN/ES, plan approval, editable estimate, manual edits/conflicts/reload, proposal/PDF and read-only administrative review. This is not a live beta or live OpenAI browser test.
- `node --env-file=.env.server.local scripts/ai-regional-eval.mjs`: opt-in real OpenAI, synthetic content, no database calls. The initial six cases in `real-model.json` used prompt `.1`; two follow-up cases in `real-model-followup.json` used `.2`, which removes internal tool terminology from public provenance. Both runs report `gpt-6.1-sol`, `medium`. Evidence includes returned usage and configured-rate cost estimates, not billing receipts.
- Observed: 12 × 10 × 8 ft yields 352 sf walls before deductions; full surface retained. Metric 3.6576 × 3.048 × 2.4384 m produces the same area. Complete EN/ES facts and previously answered questions produce approvable plans without extra questions. Paint/flooring asks dimensions and flooring type, then proposes editable secondary assumptions. Real generation of the supplied provisional prices yields materials $115, labor $360, markup $95 and total $570, with all lines provisional.

To connect local pricing, provide a vetted supplier/catalog feed with product/package, unit, USD unit cost, service location, checked date and source evidence. A connector must validate equivalent products and retain provisional fallback on mismatch/failure. Internal history reuse first requires an explicit authorized approval workflow that records approver, date, exact estimate version and unit-price snapshot; edits must invalidate or supersede that approval. Then similarity lookup can compare unit, scope, work type and date within the owner boundary, adjusting quantities and exposing the reference. No supplier feed, price approval or company-sharing permission is fabricated by this delivery.

Tool integration follows the official [Responses function-calling guide](https://developers.openai.com/api/docs/guides/function-calling), with strict argument schemas and application-executed calculations.
