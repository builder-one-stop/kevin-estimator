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

- `npm test`: 134 tests passed across 27 files, including Workers and RLS; final focused rerun covers changed engine/PDF/signature paths.
- `npm run test:bridge:browser`: generation, all 29 lines, contact/project links, inline edit/reload, ambiguity, reviewed quantity/labor edits, failed-save recovery, no stale PDF, two-tab conflict, idempotent finalization, same list record, button/written PDF requests, EN/ES and 390 px mobile.
- Existing AI browser regression passed (15 checks, one persisted estimate, no uncaught errors). The harness uses real migrated PostgreSQL/PGlite and an explicitly controlled model; it does **not** prove real AI or production authentication.
- Actual browser-downloaded EN/ES PDFs rendered and inspected, six pages each. No text outside margins or empty pages; same saved IDs/revisions, terms, contacts and totals. Artifacts: `output/pdf/chat-estimate-{en,es}.pdf`, `evidence/chat-estimate-bridge/`.
- Lint and production build pass. Vite retains its existing >500 KB chunk warning.

## Remote rollout

- Supabase dry run identified only the new finalization migration; applied successfully on 2026-10-16.
- Remote `supabase db lint --linked --level warning`: no schema errors after migration. Finalization RPC is security invoker with empty search path.
- Commit/push use the existing beta branch and automatic Netlify build. Authenticated online results are recorded after publication; local fixture results are not substituted for them.
