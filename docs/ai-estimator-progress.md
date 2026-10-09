# Implementation tracking — 2026-10-07

- Baseline verified: 5e179cf, original 48 tests/lint/build passed; `design/` preserved.
- Implemented: owner-scoped transactional chat/run persistence; private images; Responses API and narrow validated tools; manually editable bilingual plans/components and revision approval; generation, financial comparison, concurrency protection and restore; explicit preferences/catalog import/business identity; shared approved-scope proposal and real PDF.
- Completed local verification: 71 tests, clean lint, successful build (bundle-size advisory), npm audit clean; real Chrome journey with a separate controlled model and ephemeral PostgreSQL database; all PDF pages rendered and checked. Details/evidence in ai-estimator-evals.md.
- No new remote mutation: linked project vtpciccluvpaclbeqxih verified read-only. Migration 20261007120000_ai_estimator.sql tested locally, pending remote activation. No merge or deployment.
- Real-model quality/latency/tokens remain unmeasured because OPENAI_API_KEY is absent. Server service-role secret and authorized remote activation are also required before testing the live integration. No supplier connector is active.

## Activation update — 2026-10-09

- Confirmed the linked, healthy Supabase project is `kevin-estimator` (`vtpciccluvpaclbeqxih`). A dry run showed exactly one pending migration. Applied `20261007120000_ai_estimator.sql` with Vault updates skipped; the migration list now shows local and remote versions matching.
- Before applying, saved the two existing public estimate rows in a private local backup. After applying, both estimates remain; the new evidence bucket is private, the restrictive storage policy and commit RPC exist, and RLS is enabled on all four new tables. Anonymous conversation reads and direct authenticated writes/RPC calls have no grant.
- Created `.env.server.local` with mode 600 and Git ignore protection. Retrieved the correct Supabase service credential through the authenticated CLI without displaying it. The OpenAI key supplied in chat was not copied into a command or file; a newly rotated key must be entered directly into this local file.
- The backend is listening on loopback and `localhost:5173` reaches it through Vite. Added a real Chrome test with temporary remote account cleanup for the live model path. The 71 tests, lint, and build pass. Real `hola`, billing availability, and estimate generation await the locally configured new API key.
