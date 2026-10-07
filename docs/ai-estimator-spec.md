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
