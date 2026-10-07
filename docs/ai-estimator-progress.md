# Implementation tracking — 2026-10-07

- Baseline verified: 5e179cf, original 48 tests/lint/build passed; `design/` preserved.
- Implemented: owner-scoped transactional chat/run persistence; private images; Responses API and narrow validated tools; manually editable bilingual plans/components and revision approval; generation, financial comparison, concurrency protection and restore; explicit preferences/catalog import/business identity; shared approved-scope proposal and real PDF.
- Completed local verification: 71 tests, clean lint, successful build (bundle-size advisory), npm audit clean; real Chrome journey with a separate controlled model and ephemeral PostgreSQL database; all PDF pages rendered and checked. Details/evidence in ai-estimator-evals.md.
- No new remote mutation: linked project vtpciccluvpaclbeqxih verified read-only. Migration 20261007120000_ai_estimator.sql tested locally, pending remote activation. No merge or deployment.
- Real-model quality/latency/tokens remain unmeasured because OPENAI_API_KEY is absent. Server service-role secret and authorized remote activation are also required before testing the live integration. No supplier connector is active.
