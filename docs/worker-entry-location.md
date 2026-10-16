# Worker clock-in location and administrative notifications

Extends the existing worker module and `worker_shifts` record. No AGENTS.md was found in the repository or parent chain. Starting branch/commit: `feat/ai-estimator-approved-plan` / `9aaa2c6`. Existing unrelated design and evidence files are preserved.

## Behavior and validation

The mobile worker selects an assigned project and presses Clock in / Ingresar al trabajo. A visible explanation describes the location requirement and sharing with administration. The browser requests one foreground fix using `enableHighAccuracy: true`, `maximumAge: 0`, `timeout: 15000`; a 16-second application deadline covers browsers that fail to invoke callbacks. No permission-state string is required, including for one-time permission. Denial, unavailable fixes and timeout make no clock request and allow retry; denial includes site/phone settings instructions.

Server and SQL validate the exact location object: numeric finite latitude [-90,90], longitude [-180,180], nonnegative accuracy in meters and ISO capture timestamp with offset. Initial captures must be within the preceding 120 seconds and no more than 60 seconds ahead of server time; check the device clock if rejected. These limits allow capture/network latency but reject deliberately stale fixes. Accuracy above 100 m is an advisory label, **not** a rejection threshold; indoor reception can be poor. There is no geofence, distance rule, geocoding dependency or background tracking. This is device-reported location, not proof of physical presence or GPS authenticity.

Official entry time is produced by the existing server/SQL clock and saved in UTC; UI uses America/Los_Angeles. `entry_location.capturedAt` is explicitly identified as device data. Original location/time are immutable through administrative hour corrections. The corrected event timeline and audit remain separate. Historical shifts without location continue to work; new administrative exceptions require the existing reason/audit and show an administrative/no-location label.

## Integrity, authorization and delivery

Migration `20261016221552_worker_entry_location_notifications.sql` adds nullable location metadata and `entry_source` to existing shifts, plus `worker_notifications`. The original command dispatcher, row lock, one-open-shift constraint, corrections and media authorization are reused. A narrow dispatcher extension validates location, runs the original clock, stores the original fix and inserts the notification in the same transaction. A notification failure rolls back the entry. A unique shift reference guarantees one notification; committed retries return the original record even after their capture becomes old.

The recipient comes from `workers.manager_id`, not a fixed email/UUID or all administrators. Only that owner with an active authorized session can list/read notifications. Workers cannot list notifications or fetch another worker’s coordinates by UUID. Notification read timestamps are server-generated and only set by the explicit Mark as read action. The authenticated API and database both enforce the boundary. No new client secrets, public buckets or GPS logging are introduced.

The notification indicator is available throughout the normal administrative workspace. It polls the authenticated endpoint every 5 seconds while visible and refreshes on focus/visibility. Poll failure preserves the durable records; it cannot create another shift or lose an alert. Each notice links to `/time?shift=<canonical UUID>` and an explicitly external Google Maps coordinate link. Notifications are not email, SMS, WhatsApp, web push or automatic read receipts.

The worker tab retains only a request ID/project/kind in tab storage for uncertain-response retries; coordinates are not stored there. Each retry obtains a fresh foreground fix. Open-shift lookup remains available if a response is uncertain.

## Verification

- 148 tests passed across 30 files using `npm test -- --maxWorkers=1 --reporter=dot`; the initial concurrent run had two existing resource/time-limit failures, both passed in the serial run.
- Lint and production build passed; Vite retains its existing >500 KB chunk advisory.
- Migrated PostgreSQL tests cover missing/malformed/stale GPS, server time, advisory low accuracy, concurrent entries, duplicate requests, transactional failure, recipient isolation, notification read persistence, active assignment, breaks/out, historical/admin rows and immutable location after correction.
- Local Chrome with actual workers HTTP handler and migrated PostgreSQL passed the worker/manager flow, live notice without reload, read-state reload, UUID links/map, denial/unavailable/timeout recovery, lost-response retry, EN/ES and 390 px mobile. Auth transport/geolocation in this harness are controlled fixtures, not real authentication or physical GPS.
- Production Supabase password-session and beta checks are recorded separately in `evidence/worker-location/`. A service-key inspection is not reported as a manager-session/UI test.

## Testing the feature

Worker: sign in with the account created by your administrator, choose an assigned project and press Clock in. Allow this site to access location; success appears after saving. Hours shows the recorded fix and external map link. Break and clock-out do not request location.

Kevin/manager: remain signed in; the notification badge updates within roughly 5 seconds while the tab is visible. Open Notifications, inspect the report/map, mark the notice read explicitly or open its existing shift. The same fix appears in Time tracking and project Hours. A manual correction retains the original location and its original time.

Physical phone permission/GPS behavior requires an actual device test. Automated positions are identified as controlled throughout the evidence.
