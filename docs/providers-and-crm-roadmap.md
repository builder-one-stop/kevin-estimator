# Provider and CRM roadmap

Reviewed 2026-10-07. No external supplier or lead connector is active. `server/pricing.js` defines an exact product/brand/package/unit/location boundary; failed/no-equivalent lookups retain a provisional price and never silently substitute. The initial usable source is the owner's editable/importable JSON catalog. Verified means the owner supplied source evidence; it does not mean One Stop queried a store.

## Supplier access investigated

- **Sherwin-Williams** publishes a [PunchOut buyer guide](https://images.sherwin-williams.com/content_images/SW-PDF-PRO-PUNCHOUT.pdf), [PRO+ account pricing](https://www.sherwin-williams.com/painting-contractors/pro-plus/pro-app) and selected [Digital Alliance integrations](https://www.sherwin-williams.com/painting-contractors/digital-alliance). These support a request for a commercial integration; they do not document an unrestricted public retail-price API. No integration credentials, contract or technical API specification are available here.
- **Home Depot** publishes [e-procurement options](https://www.homedepot.com/c/eprocurement-for-pros) and [Buildertrend account integration](https://www.homedepot.com/c/pro-buildertrend). Neither page supplies general public price API credentials/endpoints. Next viable increment: authorized Pro account export → validated catalog import, then an approved procurement connector if the supplier provides its protocol and sandbox.
- **Lowe's** describes [eProcurement](https://www.lowes.com/l/Pro/epro), custom catalogs and PunchOut. Its setup includes preregistration, approval, supplied credentials and testing. This is a potential contracted integration, not evidence that One Stop currently has API access.

Before integrating: obtain authorized account access, permitted data use/caching, sandbox protocol, rate limits, account-specific pricing terms, taxes/freight semantics, availability meaning, store/ZIP and delivery rules. Preserve SKU/URL, package, currency, observed timestamp and source. Display a substitution proposal for user approval. Do not scrape authenticated websites or invent endpoints.

## CRM extension

Future sequence: lead → contact/opportunity → project/estimate. Store owner_id on every entity and relationship; derive owner from the authenticated connection, never incoming payload. Lead records need source, external account and lead ID, received time, contact fields, consent provenance when applicable and an idempotency/deduplication key `(owner, source, external_id)`. Potential duplicates by normalized phone/email need review; do not merge different owners.

Webhook receiver must verify provider signature/challenge using its official protocol, enforce body/time limits, reject replay, enqueue durably and acknowledge only after persistence. Store minimal payload, redact logs, audit conversion and use retry/dead-letter handling. Converting a lead must be explicit and idempotent; it must not auto-create fictitious clients or approve an estimate. Meta/Google connection scopes, account permissions, app review requirements, test leads and current API schemas must be researched when authorized credentials are available. No connections or test lead sends were performed.

## Other follow-up deliveries

Audio/video: private upload → validated media processing → transcription / selected frames → timestamped evidence → user review → current plan flow. Do not send raw unsupported media as if it had been analyzed. Contracts/e-signature, invoices/financing and scheduling follow separately; the quote PDF is not a signed contract and contains no invented payment schedule.
