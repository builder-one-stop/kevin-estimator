# Workers / Trabajadores

Scope: One Stop (`builder-one-stop/kevin-estimator`), the existing `onestop-beta.netlify.app` site and `feat/ai-estimator-approved-plan`. This module adds no payroll, GPS, biometrics or impersonation.

## Access model

The existing `beta_accounts` grants remain unchanged. Both the operator (Kevin) and development administrator can manage workers **within their own data ownership boundary**. Workers have a separate record and never acquire a CRM grant. The existing CRM restrictive policies and AI API continue to require a beta account; the session access RPC additionally recognizes active workers for the mobile portal.

Every worker API request validates the JWT with Supabase Auth, requires password authentication, and passes the verified actor/session to a service-only SQL entry point. That entry point checks the live Auth session and locks the worker row before state changes. Client JSON cannot supply actor, role, owner or clock time. Direct table writes are denied to authenticated users. Read policies restrict managers to their workers, and workers to their own currently assigned projects. Projects are exposed through a safe projection containing only id, name and address.

No public signup or magic-link flow is added. Password creation uses Auth Admin and its provider validation. Administrative reset reuses the existing guarded bcrypt mechanism, with the observed provider minimum (6 characters), no character-class requirement and a 72 UTF-8 byte ceiling. `WORKER_PASSWORD_MIN_LENGTH` may raise the server requirement; synchronize this with provider policy before changing that policy. Reset removes the worker's sessions, refresh tokens and recovery tokens. Worker self-service password changes remain blocked by the existing Auth database trigger. Passwords are transient form/request values and are never stored separately or logged.

Account creation reserves a unique email and operation UUID before Auth creation. The created Auth user carries a server-only provision identifier; retries reconcile only this marker. A pre-existing Auth account is never adopted or deleted as compensation. A partially provisioned account remains visible as incomplete in Workers and can be retried with the same reservation. Assignments can be retried independently after account creation. Zero assignments is supported.

## Administrative use

1. Open **Workers / Trabajadores**, choose **Create worker / Crear trabajador**, and enter name, email and initial password.
2. Choose any number of the current account's projects, or save without projects.
3. Use **Edit worker** to change name, assignments or active status, **Reset password** to set a new password, and **View records** for evidence and attendance.
4. Sign out and sign in with the worker's email/password to test the mobile portal.
5. Project workspaces expose **Progress / Avances** and **Hours / Horas**, with worker/date filters.

Removing an assignment blocks new project operations. Disabling access also revokes sessions. If an affected worker has an open shift, the update is rejected with an instruction to resolve the shift first. Administration must enter the actual missing time and a reason; no clock-out is invented. Existing evidence and time history remain available to its manager.

## Attendance and corrections

UTC instants are recorded by the database; all displayed dates and filters use `America/Los_Angeles`. A worker-row lock and a unique partial index prevent two open shifts across projects. A command UUID makes clock retries idempotent. State transitions, chronological order and overlap with other effective shifts are validated transactionally. Clock-out while on break needs explicit confirmation and creates break-end and out at the same server instant.

Effective event arrays and original clock events are stored separately. Worker requests identify a recorded event, proposed instant and reason. Approval/rejection records author, time and review reason. Administration may add an omitted block or apply several omitted events together, with optimistic version checks and a full before/after audit. Existing event identities cannot be silently removed in a batch correction. Date input requires the applicable PDT/PST offset; nonexistent DST times are rejected and repeated autumn times are explicit.

Closed-shift totals include elapsed duration, break count/duration and time outside breaks. Open shifts are provisional and excluded from closed totals. No assumption is made about paid or unpaid breaks. Dashboard polling is every 15 seconds and failed requests never confirm a clock event.

## Private media and recovery

The private `worker-progress` bucket allows authenticated INSERT only for a server-created reservation owned by an active, assigned worker. No user SELECT, UPDATE, DELETE or upsert is granted; viewing goes through the authenticated backend.

Default and database hard ceilings:

- JPEG, PNG, WebP: 8 MiB, decoded-image ceiling 40 million pixels.
- MP4, WebM: 25 MiB. HEIC and MOV are rejected. Playback depends on browser codec support; no transcoding or universal mobile compatibility is promised.
- Five files per browser selection; five simultaneous pending reservations and 100 reservations per worker per rolling 24 hours in SQL.
- Upload reservation lifetime: 24 hours. Retry reuses the same UUID/path, including finalization after a lost response.
- Viewing URL: 60 seconds. A URL already issued may remain usable for up to 60 seconds after deactivation or unassignment. Already downloaded content cannot be recalled.

`WORKER_PHOTO_MAX_BYTES` and `WORKER_VIDEO_MAX_BYTES` can lower server limits; database/storage ceilings and SQL quantity limits are changed through a versioned migration. Keep UI limit text synchronized. Backend finalization verifies actual byte length, supported signatures and image decode before marking a record ready. Uploading bytes alone does not mark success. Rejected bytes are removed through Storage API. Pending files always retain their reservation; expired non-ready objects are removed by the hourly scheduled cleanup function, and the failed reservation remains visible. Cleanup failures remain eligible for a later run. This cleanup is bounded and idempotent.

Supabase recommends resumable TUS uploads for larger files; this version uses bounded standard uploads with full-file retry and explicit progress, not offline/resumable recording. See [Supabase upload behavior](https://supabase.com/docs/guides/storage/uploads/standard-uploads). The scheduled cleanup runs on published Netlify deployments and has no public HTTP endpoint ([Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/)).

## Migration and rollout

Migration: `supabase/migrations/20261016052330_workers_module.sql`. It creates the worker tables/private helpers, private bucket/policies and extends session classification; it does not rewrite existing CRM records or beta grants.

1. Run `npm run lint`, `npm test -- --maxWorkers=1`, `npm run build` and `npx netlify functions:build --src netlify/functions --functions .netlify/functions-workers-build`.
2. Verify the Supabase linked project is `vtpciccluvpaclbeqxih`; inspect `supabase db push --linked --dry-run --skip-vault`.
3. Apply only the reviewed migration using `supabase db push --linked --skip-vault` and run security advisors.
4. Start the local API and Vite. Run `node --env-file=.env.server.local scripts/workers-remote-validation.mjs`; the existing administrator enters credentials into the loopback form, never in chat. The script uses two disposable workers and an isolated project. It does not change Kevin's or administration's password.
5. Only after actual permission/browser verification, commit/push the reviewed work on the beta branch and verify Netlify's published commit. Run the same verification with `WORKERS_TEST_ORIGIN=https://onestop-beta.netlify.app`.

Server variables reuse `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no new privileged browser variables are introduced. The worker functions have no OpenAI dependency. The beta already has these server secrets; do not print or rotate them for this rollout.

Recovery: preserve all worker/audit/storage data. Revert the frontend/function deploy to the recorded prior Netlify deploy if necessary, and disable new worker access through administrative controls only after resolving open shifts. Do not drop tables, remove audit entries, rewrite the applied migration or reset Auth. Apply a corrective versioned migration for a database issue. A full rollback of session classification requires reviewing active worker accounts first; the old UI does not have the worker role router.

## Verification status

See [workers-progress.md](workers-progress.md) and `evidence/workers/` for actual completed checks. A local build or mock is not proof of remote isolation or beta behavior.
