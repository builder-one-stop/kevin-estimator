# Estimates integration

The Estimates list, Home recent estimates, project Estimates tab, and editor all use `src/services/estimates.js` and the same `/estimates/:id` record. A project is optional. An estimate linked to a project inherits its client; a database trigger rejects a mismatch when the project has a client.

## Data and security

- `public.estimates` stores ownership, optional client and project links, status, markup basis points, a version, and one JSON document containing ordered sections, items, and proposal text. This lets autosave write the full document atomically.
- `public.estimate_messages` is ready for per-estimate conversation. Browser clients may insert user prompts only. Assistant replies require a trusted server.
- Both tables have RLS limited to the signed-in owner. Anonymous users cannot read or write estimates. Contacts and Projects retain their prior temporary anonymous policies; the new migration also grants authenticated access so those pages keep working after sign-in. That prior public access still needs a workspace-scoped auth migration before production.
- Email link sign-in is used for Estimates. `supabase/config.toml` adds the local Vite redirect origins. A deployed origin must be added before production use.
- Optimistic saves require the previous `version`; the trigger increments it. A stale write returns no row. The local draft is retained across reloads, even when the remote version changes. The editor then requires the user to choose whether to save the local draft over the new version or use the remote version.

## Money and documents

`src/lib/estimateDocument.js` computes costs in integer cents, applies the markup in basis points (3600 by default), and allocates any rounding cents across client line prices. The editor, list, proposal, and PDF share these functions. Markup is on cost; the shown margin is profit divided by sale price. No tax or extra charges are added.

The client proposal is always in English. It shows sale prices and total, without internal costs, markup, or margin. `src/lib/proposalPdf.js` creates a paginated downloadable PDF from the same document and totals. The editor loads the PDF library on demand.

## AI boundary

The old sample chat route redirects to Estimates. No AI backend or secret is configured in Supabase, so the workspace labels the assistant as pending. It does not generate replies, item changes, or supplier prices. Future integration should use an authenticated server endpoint, validate structured operations against the estimate document, preserve manual edits, and record applied operations so users can undo them.

Invoices remain separate and unlinked to projects; project invoice and financial placeholders have not been turned into fabricated amounts.
