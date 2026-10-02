# Estimates integration

The Estimates list, Home recent estimates, project Estimates tab, and editor all use `src/services/estimates.js` and the same `/estimates/:id` record. A project is optional. An estimate linked to a project inherits its client; a database trigger rejects a mismatch when the project has a client.

## Data and security

- `public.estimates` stores ownership, optional client and project links, status, markup basis points, a version, and one JSON document containing ordered sections, items, and proposal text. This lets autosave write the full document atomically.
- `public.estimate_messages` is ready for per-estimate conversation. Browser clients may insert user prompts only. Assistant replies require a trusted server.
- All four tables have RLS limited to the signed-in owner. Anonymous users have no table privileges. Contacts and projects now use the existing individual-user model (no organization membership model exists). Composite foreign keys enforce the same owner for project/client and estimate/client/project links; triggers also enforce project/client agreement in both directions. The dashboard, contacts, projects and estimates require a session, and account changes unmount private content.
- Email link sign-in is used for Estimates. `supabase/config.toml` adds the local Vite redirect origins. A deployed origin must be added before production use.
- Optimistic saves require the previous `version`; the trigger increments it. A stale write returns no row. Drafts use immutable localStorage revision keys scoped to owner and estimate. A tab only deletes revisions it saved or explicitly discarded; no-op saves cannot clear another tab’s work. Multiple pending variants can be recovered separately, and revisions survive reload, save failure, account changes and late responses after unmount. Changing the UI language does not refetch the editor. Legacy shared-key backups are offered for explicit recovery after authorization and are never deleted, because an older tab might still be using that key. The local draft is retained across reloads, even when the remote version changes. The editor then requires the user to choose whether to save the local draft over the new version or use the remote version.

## Money and documents

`src/lib/estimateDocument.js` computes costs in integer cents, applies the markup in basis points (3600 by default), and allocates any rounding cents across client line prices. The editor, list, proposal, and PDF share these functions. Markup is on cost; the shown margin is profit divided by sale price. No tax or extra charges are added.

The client proposal is always in English. It shows sale prices and total, without internal costs, markup, or margin. `src/lib/proposalPdf.js` creates a paginated downloadable PDF from the same document and totals. The editor loads the PDF library on demand.

## AI boundary

The old sample chat route redirects to Estimates. No AI backend or secret is configured in Supabase, so the workspace labels the assistant as pending. It does not generate replies, item changes, or supplier prices. Future integration should use an authenticated server endpoint, validate structured operations against the estimate document, preserve manual edits, and record applied operations so users can undo them.

Invoices remain separate and unlinked to projects; project invoice and financial placeholders have not been turned into fabricated amounts.

## Verification — 2026-10-02

- Confirmed the configured URL, linked CLI project and Management API all identify `kevin-estimator` / `vtpciccluvpaclbeqxih`.
- Before migration: zero clients, projects, estimates and auth users; the four September migrations were applied and the anonymous/global policies were still active.
- Applied `20261002120000_scope_clients_projects.sql` after a linked dry run. The migration uses an explicit transaction and table locks; if clients/projects appear before execution it aborts rather than assigning owners. All relationship constraints are validated. It does not delete records or backfill ownership. On a database containing legacy contacts/projects, stop and obtain an explicit ownership mapping before adapting this migration.
- `npm test` runs unit tests, React DOM integration tests (jsdom with mocked services), and actual SQL migration/RLS tests using PGlite. The interface suite covers dashboard creation, editing, totals, client/project alignment, reopening, EN/ES, account changes, retry and concurrent editor instances sharing storage.
- `supabase/tests/remote-isolation.sql` also passed against the linked remote project. It creates two transaction-only auth fixtures, checks real authenticated/anonymous roles, links and version conflicts, and rolls everything back. It can be rerun with `supabase db query --linked --file supabase/tests/remote-isolation.sql` after verifying the linked project. No email is sent.
- Anonymous REST reads returned HTTP 401 / PostgreSQL `42501` on all four tables. No application version was deployed.
- Scope of verification: interface behavior was exercised in jsdom, and database behavior against real Supabase separately. Real email delivery and a human signed-in browser session were not tested. Build succeeds with Vite’s bundle-size advisory for a chunk over 500 kB.

## Review walkthrough

Run `npm run dev`, sign in through the email-link form, create a contact and a project, then use Home → New estimate or Estimates in navigation. Select the project (its client is inherited), add a section and an item, enter quantity 2 and unit cost 100: the default 36% markup yields $200 cost, $72 markup and $272 sale price. Wait for Saved, return to Estimates, reopen and reload. Switch EN/ES while editing. Open the same estimate in two tabs and edit both; a stale save must offer explicit conflict resolution, while the other pending draft remains recoverable. The next acceptance step is this walkthrough with Kevin using a real sign-in email, before any application release.


## Real-browser validation after 813d42f — 2026-10-02

The integrated journey was exercised in **Google Chrome**, controlled by Playwright, against local Vite at `http://127.0.0.1:5173` and the real linked Supabase project `vtpciccluvpaclbeqxih`. This is a real browser run, separate from the jsdom component suite. No production deployment or merge was performed.

Authentication used a temporary `@example.invalid` test account and a Supabase Admin-generated one-time magic link. Opening that link exercised Supabase verification, the redirect callback, browser session persistence and actual authenticated RLS requests. Generating a link does **not** send email. Mailbox delivery/receipt and the user's own email-link journey remain unverified; the user's email was requested separately. No mail was sent to Kevin or third parties.

Observed browser results:

- Anonymous routes show sign-in; a blocked OTP request produces a visible error without sending mail.
- Created a `QA-BROWSER-*` contact and a project linked to it, entirely through the UI.
- Created estimates from both the dashboard and the Estimates navigation page, linked the project and confirmed inherited client selection.
- Edited line descriptions, quantities and costs: `2 × 100` at 36% markup produced `$272.00`; `2.5 × 120.50` produced `$301.25` cost, `$108.45` markup and `$409.70` sale price. Saved, reloaded and reopened with values preserved.
- Two tabs used the same actual authenticated session. A controlled failed PATCH preserved B's draft while A saved. B's stale retry showed conflict controls; reload recovered B's input, and an explicit **Save my draft** persisted it.
- **Use remote version** discarded only the selected draft; a different pending revision from the other tab remained available for explicit recovery and save.
- With failed pending edits, navigated to Settings, switched EN→ES, reopened the estimate and observed the original input plus Spanish error/save labels. Retrying persisted the changes.
- Observed loading and save states, injected a GET 503 and retried successfully against Supabase. The SDK retries GET failures before displaying the error; tests allow that delay. PATCH failures are injected only in the test browser, without changing the server.
- Normal sign-out removed private content in both tabs and remained signed out after reload.
- Found and fixed a silent server sign-out failure: the installed Supabase SDK clears local authentication even when remote revocation fails. The menu now shows the error instead of hiding it, prevents repeat clicks while waiting, and labels the signed-out identity accurately. The account menu now fits inside the sidebar so this message is readable.

Evidence: [`results.json`](../evidence/browser-validation/results.json), [saved estimate](../evidence/browser-validation/04-estimate-saved.png), [two-tab conflict](../evidence/browser-validation/05-conflict-two-tabs.png), [Spanish pending draft](../evidence/browser-validation/06-spanish-pending.png), [sign-out error](../evidence/browser-validation/10-logout-failure-fixed.png). Captures contain synthetic test data only; tokens, generated login links, API keys and real email addresses are not written to evidence.

Reproduction: start `npm run dev -- --host 127.0.0.1`, then run `npm run test:browser` with Google Chrome installed and an authenticated Supabase CLI available as `supabase` (or set `SUPABASE_CLI` to its executable). The browser suite intentionally creates temporary remote test data in the verified project; it never runs as part of `npm test`. `BROWSER_HEADED=1` shows the main journey in a Chrome window. Administrative credentials stay in the Node fixture process; they are never injected into the browser. All application operations use the test user's real session. Cleanup filters by that exact newly created user ID, checks that its three data tables are empty, then deletes that temporary account.

Final checks: 48 unit/component/SQL tests passed; lint is clean; build succeeds with the existing bundle-size advisory. A read-only remote cleanup query returned zero `QA-BROWSER` clients, projects, estimates and auth users. No migration or remote configuration change was needed.

The remaining acceptance gate before Kevin's independent trial is a received email and a completed sign-in using the actual email flow. The generated-link browser run verifies the application journey, not email transport.
