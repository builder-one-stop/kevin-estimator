# Web prices are the default budgeting reference

Product clarification: suppliers' public web observations are usable for estimates
without a supplier account/contact, chosen store, job ZIP or private quote.
These secondary details are optional context. They do not refresh observation dates
or turn a web price into branch-verified pricing. The existing scope/commercial
approval flow is unchanged; no approval per web price was added.

The existing59-reference public library has50 observed amounts and9 missing values.
No new catalog, scraping, import permission assumption or supplier API was added.
The material selector still requires the identity/package of the chosen reference;
if an exact requested SKU is absent, it stays pending. The salesperson can explicitly
select a budgeting alternative. That selection records the original missing request
and accepted-alternative status in plan and price snapshots, with a clear statement
that technical equivalence is not confirmed. Its actual SKU/package/date/source
remain unchanged. Manual overrides retain that original snapshot.

EN/ES notices in the plan, cost evidence and PDF explain that web prices are for
budgeting and that purchase price, tax and delivery can vary. No supplier/ZIP
questions were introduced. Unknown values remain pending.

Evidence: `scripts/web-reference-browser.mjs` exercises web-only EN/ES flows with
no supplier account/contact, no settings catalog, no client/project, no chosen
store or job ZIP, plus an explicitly accepted alternative for an unknown SKU.
The actual app saves, reloads and downloads each PDF in new headless Chrome
contexts at390px, controlled provider and ephemeral PGlite on5304/8894, with
non-loopback browser requests blocked. Results and synthetic records are in
`evidence/pricing-web-defaults-2026-10-28/`.

Focused regression suite:16 tests pass in3 files. Browser:all3 flows pass.
No account/contact/credential, remote SQL, push or deployment is involved.
The first deterministic material flow remains interior wall painting; this change
does not claim a complete tile or mixed-trade engine. Existing public construction
references remain available in the versioned library with their documented limits.
