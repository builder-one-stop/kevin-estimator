# Closed beta access

This supersedes the historical signup/link/recovery flows documented in the original Netlify activation. The scope is `builder-one-stop/kevin-estimator`, `feat/ai-estimator-approved-plan`, and `https://onestop-beta.netlify.app`.

## Accounts and environments

The operator and development administrator are the two identities explicitly approved for this beta. Their existing Auth IDs and data ownership are preserved. `beta_accounts` assigns access roles separately from record ownership; it does not reassign customer data. Only the service role can register those identities. Other users and their data remain in Supabase and receive no beta grant.

Localhost and the beta use the same Supabase project, `vtpciccluvpaclbeqxih`. Signing in as Kevin on localhost accesses and changes Kevin's real data. Validation must create synthetic conversations and estimates only in the development account. The administrative review reads Kevin's data without using his password or allowing edits.

The logged-out application has an independent EN/ES email/password screen without modules or navigation. There is no signup, magic-link, Google or password-recovery route. Help directs the user to the administrator. Supabase Auth persists and refreshes the browser session; local sign-out revokes that session without terminating the user's other browser sessions. Session revocation/expiry is also checked in the database and server; a still-signed JWT from a revoked session cannot access data or IA.

## Enforcement

Public registration is disabled in the remote Auth configuration. The activation script uses a narrow `disable_signup` patch and compares the full before/after objects in memory. It fails if an unrelated setting changes. Never use a full Auth config push to apply this toggle: omitted settings could be reset. The beta Site URL and existing localhost redirect allowlist are preserved. The app does not consume sign-in/recovery tokens from URLs.

Every data table retains its owner policies and additionally requires a beta grant, password AMR and an active Auth session. The IA server first validates the token through Supabase Auth, checks matching subject/password AMR, then checks account membership and the active session through a service-only RPC. Email strings and mutable browser metadata do not grant access.

The administrator's regular chat, contact, project and estimate lists remain owner-only. Administrative review is a separate GET-only server endpoint backed by a service-only, read-only RPC. The verified actor must have the admin grant. The reviewed subject comes from the operator grant, never a browser-supplied owner. Normal edit/message/approval/estimate routes retain their own-owner checks. The review shows questions, responses, dates, plan/approval state, associated estimates and revision metadata. It offers no editing controls.

## Password administration

Ordinary validation never changes an existing password. Missing approved accounts are created administratively with an initial password entered through the one-use localhost form. The administrator previously used email links; on the user’s explicit request, `--initialize-admin` configures its initial password through the existing service-only setter, preserving the Auth ID, metadata, grants and customer data. This is a one-time authorized setup step, separate from ordinary password testing. It revokes old sessions and tokens; subsequent validation uses the current password without changing it.

Direct password updates through Supabase Auth are blocked by an `auth.users` password-update trigger, including updates initiated through the public recovery API. Hiding the UI alone would not provide this protection. Direct recovery-email requests are not claimed to be disabled: even if Supabase sends an email, its recovery/OTP session fails the application's password gate and its password update is rejected.

For an explicitly requested administrative password change, run:

```sh
npm run admin:password -- operator
# or: npm run admin:password -- admin
```

Open the displayed localhost URL in Chrome and enter the new password and confirmation. The process binds only loopback, validates Host/Origin and a one-use nonce, hashes with bcrypt in memory, and sends only the hash to a service-only RPC. No plaintext password is written to a file, argv, Git, screenshots or application logs. Auth necessarily stores its password hash. The setter clears pending Auth tokens and revokes the account's sessions. It is never imported by the deployed app and has no public HTTP route. This utility is not a testing shortcut for changing a real user's password.

The local input uses `Referrer-Policy: same-origin`: Chrome sends a normal matching Origin for the form POST, while external destinations receive no referrer. `no-referrer` would cause Chrome to send `Origin: null`, correctly rejected by the strict origin guard. A real isolated Chrome regression test exercises form submission; rejected requests do not resolve the input promise or initiate account changes.

## Verification commands

```sh
npm test
npm run lint
npm run build
npm run test:browser
# Remote API/password guards + local Chrome, no authorized password needed:
node --env-file=.env.server.local scripts/beta-api-validation.mjs
# Real authorized accounts, localhost + beta + real online IA/proposal/PDF:
npm run test:beta:browser
# Only when explicitly requested: initialize the existing administrator password
# and confirm both initial passwords in the local form before real validation:
npm run test:beta:browser -- --initialize-admin
```

The real validation requires local server-only `.env.server.local`, the public Vite configuration, localhost Vite/API services and a correctly authenticated Netlify CLI. Neither env file belongs in Git. Passwords are entered in the hidden local form, retained only for the lifetime of the test process, and never recorded. Legacy real-IA/auth aliases point to the closed-beta runner; temporary magic-link fixtures are disabled against a database with `beta_accounts`.

The controlled Chrome journey uses an isolated migrated PGlite database and an explicitly controlled provider. It covers contact/project links, plan approval, editable persisted estimates, two-tab conflicts, pending text during EN/ES changes, proposal/PDF and revisions. This does not prove real OpenAI or Supabase password access.

The authorized runner checks real password login for both accounts on localhost and beta, reload/browser reopening, sign-out/token replay, review permissions, direct signup rejection, and an unauthorized authenticated fixture. Only the development account creates a real online IA quote. Cleanup uses exact IDs from that run, verifies their deletion and retains both approved accounts. Kevin receives no synthetic conversation. Reports and screenshots in `evidence/beta-access/` exclude passwords, emails and customer conversation content. Empty Kevin history means live review detail cannot be demonstrated until Kevin creates his own conversation; detail behavior remains covered by synthetic isolated tests.

## Observed validation — 2026-10-10

The protected form regression was reproduced in Chrome and corrected without accepting null or foreign origins. Before retrying, the waiting process and remote account preflight confirmed that the rejected submission had not initialized passwords or created the operator. On the corrected submission, administration's initial password was configured while preserving its existing identity, metadata and grant; the missing approved operator was created. Neither approved account was removed during cleanup.

Both approved accounts passed actual Chrome password login on localhost and the beta, EN/ES login UI, reload, persistent-profile browser reopening, sign-out and rejected old-token replay. The real online development-account quote passed greeting, approved plan, three-line editable persisted estimate, quantity edit/reload, client proposal and PDF. Responses reported `gpt-6.1-sol` with `medium` effort. The evidence records model-returned usage and provider duration; dollar amounts are estimates using configured token rates, not a billing receipt.

The operator has no conversations, so live review verified its empty state and permissions rather than a customer detail page. Detailed administrative review remains covered by the isolated synthetic Chrome test. Natural session expiration was not waited out in a live browser. The full suite passed 95 tests, lint and build; live validation reported 11 checks, zero errors and zero cleanup errors. See `evidence/beta-access/browser-results.json` and `verification.json` for the tested implementation SHA and the distinction between live and controlled checks.

## Chat presentation and progressive delivery — 2026-10-10

The React login explicitly uses light inputs with dark text, placeholder and WebKit autofill text. Password controls use a system font so their mask glyphs render correctly in WebKit. The dashboard greets the development administrator without the mocked Kevin name, describes the active AI workflow, and opens a responsive, keyboard-accessible History drawer. Conversations use compact titles (new plans supply their validated title), quieter message surfaces and a separate bottom composer.

The provider uses actual Responses API streaming when the engine supplies a progress callback. `server/publicText.js` accepts only the leading public `message` string from assistant output or the mode-authorized terminal proposal tool. It ignores reasoning events, private tool arguments and partial plan/line JSON. New public text is persisted on the existing owner-scoped conversation at a bounded cadence, including the completed public string. The browser polls working runs roughly every 850 ms; Netlify's existing background worker can continue independently of a browser connection. This is progressive delivery of received server content, not a typewriter effect. Short runs may finish before a browser poll; output without an eligible leading message stays under the activity indicator until completion.

Stages describe actual queued work, attachment preparation, response or line generation, a saved-catalog read, and final validation. Animated dots indicate activity only. Nothing displays reasoning, invented percentages or external supplier searches. Full output still passes schema/domain validation, explicit plan revision approval and the existing atomic commit. Partial text never enables approval or estimate generation; errors and cancellation remove the preview.

Messages appear locally as soon as Send is pressed, with one retained request ID for retries. Pending sends survive tab reload and reconcile against server receipts. Polling rejects older versions, controls block duplicate submissions, and reading older content keeps its scroll position with a new-content button. The controlled Chrome/WebKit suite includes mobile layouts, EN/ES pending input, history focus restoration, partial text and failed-send recovery. Existing regression tests retain plan approval, links, two-tab conflicts, estimate editing, PDF and read-only administrative review.

Run `npm run test:chat:browser` for the isolated visual checks (requires installed Playwright WebKit and Chrome). For a real development-account-only local/beta validation, use `npm run test:beta:browser -- --admin-only`; it requests the current administrator password and never resets passwords. `--wait-for-publish` can hold it in memory until a subsequent reviewed commit is available on the connected beta. Evidence is kept under `evidence/chat-experience/`. SafariDriver was initially blocked by disabled remote automation; WebKit verification alone must not be described as verification in the installed Safari application.

Protocol reference: [OpenAI streaming responses](https://developers.openai.com/api/docs/guides/streaming-responses).
