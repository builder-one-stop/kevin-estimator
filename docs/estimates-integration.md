# Estimates integration boundary

`public.estimates` does not exist yet. The `/estimates` page, the Home recent estimates section, and the project Estimates tab intentionally show empty states. No estimate rows, totals, statuses, or alerts are inferred from chat output or invoice mocks.

When the persisted estimate model is designed:

- Give each estimate one stable ID and a direct route such as `/estimates/:id`. Home, `/estimates`, and `/projects/:id/estimates` should link to that same route.
- Support optional `project_id` and `client_id` relationships. A project and a client may each have multiple estimates. Decide how client identity stays consistent when both links are present.
- Serve all three estimate lists through one data service, with recent and project filtered queries. Load related project and client names in the query instead of making one request per row.
- Derive total, status, document code, and dates only from persisted estimate data. Customer facing estimate, proposal, contract, and PDF content must be in English regardless of interface language.
- Define follow-up ownership and timestamps (`assigned_salesperson`, `last_contact_at`, `next_follow_up_at`) alongside the later auth/workspace model. Build attention signals only after those fields and rules exist.

Invoices currently have only mock data and no project relationship, so the project Invoices tab and financial summary also remain empty. The existing `projects.client_id` foreign key and nested project routes are the only project relationships needed now.
