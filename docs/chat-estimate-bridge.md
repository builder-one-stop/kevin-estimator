# Chat → editable estimate → PDF

Branch: `feat/ai-estimator-approved-plan`. Starting commit: `a2c4e3e11af3af7850ee60860cbef175d0924459`.
No AGENTS.md exists in the repository or parent chain. Workers, Los Angeles pricing rules, owner isolation and EN/ES remain in place. Existing untracked design/regional evidence is excluded.

## Implementation

- The chat embeds `EstimateWorkspace`, its existing validation/calculation, serialized autosave and owner-specific recovery backups. It presents the full document or the editable fields in the same conversation. Internal cost/material/labor/margin breakdown stays available separately.
- Chat, standalone editor and PDF share the same estimate ID and optimistic row version. Periodic reads adopt newer clean revisions; dirty revisions require explicit conflict resolution. Chat instructions flush pending manual edits before preparing a reviewed diff.
- Exact quantity and labor-percentage commands prepare bounded, deterministic changes. Ambiguous item selection asks for clarification. Other requests keep the existing AI reviewed-change flow. Unrelated manual fields are preserved.
- PDF phrases dispatch a client system action to the exporter. There is no AI-generated download link. Save failures/conflicts prevent exporting an older revision; downloads identify the saved revision.
- `20261016142223_chat_estimate_finalization.sql` adds finalization metadata and an owner-scoped, security-invoker RPC. It locks/checks the expected revision, is idempotent and does not alter customer status. Later edits clear finalization. The same record appears in Estimates with a chat link.
- The common PDF template uses the existing house logo geometry, real business/contact/project fields, full scope and line table, allocated cent totals, terms, page numbering and repeated table headers. Ordinary rows stay intact; unusually large text continues explicitly. Signature and customer acceptance are separate.
- Preferences supports an authorized PNG/JPEG signature (100 KB maximum), signer name and title. Server raster validation/re-encoding rejects SVG/URLs. Signature lives in owner-protected settings and revision snapshots, and is excluded from AI input. Existing estimates update their business snapshot only through the explicit editor action. **No authorized Kevin signature was found or added.**

## Observed local verification

- `npm test`: 135 tests passed across 27 files, including Workers and RLS; the final full run includes the model PDF-claim guard.
- `npm run test:bridge:browser`: generation, all 29 lines, contact/project links, inline edit/reload, ambiguity, reviewed quantity/labor edits, failed-save recovery, no stale PDF, two-tab conflict, idempotent finalization, same list record, button/written PDF requests, EN/ES and 390 px mobile.
- Existing AI browser regression passed (15 checks, one persisted estimate, no uncaught errors). The harness uses real migrated PostgreSQL/PGlite and an explicitly controlled model; it does **not** prove real AI or production authentication.
- Actual browser-downloaded EN/ES PDFs rendered and inspected, six pages each. No text outside margins or empty pages; same saved IDs/revisions, terms, contacts and totals. Artifacts: `output/pdf/chat-estimate-{en,es}.pdf`, `evidence/chat-estimate-bridge/`.
- Lint and production build pass. Vite retains its existing >500 KB chunk warning.

## Remote rollout

- Supabase dry run identified only the new finalization migration; applied successfully on 2026-10-16.
- Remote `supabase db lint --linked --level warning`: no schema errors after migration. Finalization RPC is security invoker with empty search path.
- Commit/push use the existing beta branch and automatic Netlify build. Authenticated online results are recorded after publication; local fixture results are not substituted for them.

## Observed online verification and remaining gate

- Feature code commit: `1f915f05caed0cb7a9dc59def1e0ebaddce7703a` (main implementation `07768e91632d5f958349d19a7d72bf5fc9974255`). Netlify deploy `6ad27bd393f8e03c1e24de69` confirmed **ready**, published 2026-10-16 19:32:59 UTC; checked 20:10:58 UTC.
- `https://onestop-beta.netlify.app/chat`: HTTP 200; referenced JavaScript asset: HTTP 200. Unauthenticated AI and Workers API requests: HTTP 401. Remote migration history confirms `20261016142223`.
- Chrome initially displayed an authenticated conversation list. Before exercising the newly published workflow, its control connection failed with **Debugger unattached** on both the existing handle and reattachment. A reconnection request is pending. No password, token or browser session was extracted.
- A transient network interruption returned Netlify DNS `ENOTFOUND` and beta TLS `ECONNRESET`; bounded recheck recovered and produced the successful publication/HTTP results above. The remaining blocker is browser control, not an observed authentication rejection.
- **Pending:** authenticated online generate → inline edit/message change → finalize → list → download, and a real model run on this release. Local controlled tests are not evidence that these online checks passed. Reconnect Chrome on `/chat` to perform one clearly labeled synthetic estimate, leaving existing customer records untouched.
- **Pending asset:** authorized Kevin signature image. Name/title and image configuration are ready; no signature was fabricated or copied.
- Coding agent: Codex, GPT-6 family per session instructions; exact reasoning effort is not exposed. Application provider defaults are `gpt-6.1-sol` / `medium`; no new online model invocation was completed during this verification.
