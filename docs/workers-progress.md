# Workers implementation

Scope: `builder-one-stop/kevin-estimator`, branch `feat/ai-estimator-approved-plan`, starting commit `3e5a98f0e774b081154d9cfd7cf53afc7702ee79`. Preserve existing untracked design/evidence files. No merge to main.

## Execution plan

- [done] Inspect live configuration, roles, schema, storage, beta target and existing patterns.
- [verified with real manager and worker sessions] Roles, worker accounts and project assignments; enforce existing-session revocation and CRM isolation.
- [verified with real worker sessions] Private progress evidence with bounded uploads, validation and recovery.
- [verified with real manager and worker sessions] Transactional attendance, immutable originals and audited corrections.
- [worker and manager browser verified] Bilingual mobile worker interface, administrative supervision and project tabs.
- [passed] Local SQL, permission/concurrency, API, UI and regression tests; two real remote worker sessions and mobile browser verification.
- [applied and verified] Versioned migration rollout.
- [published; full beta administrative rerun pending] Application published to the existing beta. Independent worker checks passed; the administrative beta run stopped on an ambiguous test selector after 42 checks.

## Initial observations

- Working tree has only pre-existing untracked `design/` and regional-estimator evidence directories.
- No applicable AGENTS.md found in the workspace or parent chain.
- Remote public signup is disabled. Password policy: minimum 6 characters; no required character classes.
- Existing `operator` and `admin` grants remain separate from data ownership. Neither currently owns projects.
- Existing database password guard prevents self-service password changes and administrative reset revokes sessions.
- Supabase connector denies access; existing local Management API authentication works for read-only inspection.

This document records actual completion and remaining verification; unchecked items are not claims of readiness.

## Current verified state

- Netlify site `ce81887b-c941-40c3-8da4-13d6fc833290` is `onestop-beta.netlify.app`, linked to this repository and branch; pre-module baseline was `3e5a98f0e774b081154d9cfd7cf53afc7702ee79`. The tested module application commit is `063347d1eede8c07f714e4e81350aff03df5d33f`, deploy `6ad1bf25e8e6f737efcf30f9` (`ready`).
- Migration `20261016052330_workers_module.sql` applied to `vtpciccluvpaclbeqxih` through Supabase CLI after dry run. All six tables have RLS; private bucket verified; public entry point executable only by service role. Both original beta grants unchanged.
- Security advisors: eight pre-existing warnings; no new worker-related finding.
- Full suite passed **125 tests / 26 files** with `npm test -- --maxWorkers=1`; lint/build passed. Netlify functions bundled, including hourly cleanup. The existing Vite bundle-size warning remains.
- Existing password-gate browser smoke passed. Earlier concurrent runs encountered an existing 15-second Chrome form timeout and a 5-second PGlite startup timeout; isolated checks and the final serial suite passed.
- **57 remote checks passed** using two real password-authenticated workers, isolated synthetic data and the local application against Supabase. These include CRM/API/Storage isolation, forged metadata, simultaneous clocks, repeated breaks, JPEG rendering, WebM playback, mobile EN/ES, deassignment and deactivation of an existing token. This fixture test does **not** substitute for a real manager session or administrative account creation. Cleanup succeeded; temporary workers/projects were removed.
- Added regression coverage for a stale polling response after mutation, EN/ES preservation of an unsaved form, and assignment retry after partial account creation without recreating the account.
- After two rejected administrative login attempts (`invalid_credentials`, HTTP 400), the new submission authenticated successfully. **52 real-manager/worker checks passed** against remote Supabase through the local app: actual account creation and idempotent retry, assignments, private media, corrections/approval, administrative project views, password reset, old-password rejection and existing-session revocation. Cleanup succeeded. No existing administrative password was changed.
- A subsequent form submission stalled on an unused Chrome preconnection. An attempted runtime recovery terminated the process before any Auth result was recorded; this was not a confirmed credential rejection. The one-use form now closes its connections after flushing its response. All three form tests passed, including the new idle-preconnection regression; a fresh submission was requested without retaining the old values.
- Commits `2770657`, `5230865` and `063347d` were pushed to the existing beta branch after the real administrative gate passed. No main merge.
- **Beta: 57 worker checks passed**, including real JPEG/WebM render/playback, route guards, EN/ES, CRM isolation and existing-token deactivation. **42 administrative/worker checks passed** before the manager browser assertion matched two disposable workers with the same display name. This is a test-locator error, not evidence of an application failure; it still means the remaining ten beta steps were not executed. Those ten checks passed locally against the same remote database. The selector is now scoped to the unique worker email and test names include the reservation prefix.
- The existing signed-in Chrome session independently confirmed the published Workers list and the Create worker form with name, email, initial password and assignments. Screenshot: `evidence/workers/admin-create-beta.png`. No new credentials were entered through browser control.
- Cleanup succeeded for both beta runs. The additional full beta administrative rerun (project views, unassignment, deactivation and reset through the deployed administrative API) remains pending a fresh secure administrative login; the earlier one-use script discarded its credentials on exit. The form at localhost:8792 is therefore closed. No further password entry is needed just to use the published application.
