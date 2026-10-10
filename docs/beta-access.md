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
