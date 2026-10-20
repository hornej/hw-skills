# Provider access and limits

Documentation and public schemas inspected on 2026-10-15. Validate each provider
with the user's provisioned access before claiming live availability. Offline
fixtures do not establish authentication, account entitlements, or current stock.
Installing the skill does not create an account, subscription, API key, or OAuth
grant.

For environment variables and optional Windows launchers, see
[credential injection](credentials.md).

## Nexar / Octopart

- [Official API](https://support.nexar.com/support/solutions/articles/101000450648-introduction-to-the-nexar-api)
  and [public GraphQL schema](https://api.nexar.com/graphql?sdl).
- Supply application credentials: `NEXAR_CLIENT_ID`, `NEXAR_CLIENT_SECRET`.
  POST form `grant_type=client_credentials`, client ID, and secret to
  `https://identity.nexar.com/connect/token`. Keep the bearer token in memory.
  POST GraphQL queries to `https://api.nexar.com/graphql`.
- The helper uses `supMultiMatch`, exact `manufacturer`/`mpn`, and per-input
  `reference` identifiers. Defaults: 100 inputs per batch, one returned candidate
  per input, authorized sellers, US market, USD. Change market/currency to fit the
  user. `country` and seller country are market/location fields, **not COO**.
- A returned MPN/manufacturer must still match. `hits` exceeding returned parts
  marks the result truncated; use `--match-limit 3` or narrower verified identity
  when needed. A missing result is not proof of zero worldwide supply.
- `--enrich` adds specifications, datasheet, and lead-time fields. The inspected
  schema gates these behind plan/features (TECH_SPECS, DATASHEETS, LEAD_TIME; some
  require PRO). Default queries omit them. Subscription failures are reported,
  not repeatedly retried with broader queries. Lifecycle may appear in specs;
  missing lifecycle data remains unknown.
- Offers include native currency price breaks, stock, SKU, MOQ, `orderMultiple`,
  packaging, seller-feed `updated`, and `clickUrl`. `factoryPackQuantity` is for
  factory orders and must not substitute for `orderMultiple`. `medianPrice1000`
  is an estimate, not a purchasable distributor quote; the helper does not use it.
- [Batch limit](https://support.nexar.com/support/solutions/articles/101000434616-what-are-the-supply-api-rate-limits-):
  up to 100 MPNs/IDs per request; recommended maximum 300 requests/minute.
  The helper makes sequential batches with a short delay and no automatic retries.
- [Quota](https://support.nexar.com/support/solutions/articles/101000476314-part-limits-and-how-they-work)
  counts returned part objects, including repeated lookups, rather than requests.
  Default matching can return three per input; limit one only when identity is
  sufficiently specific. Paid quotas reset monthly. Official pages conflict on
  evaluation allowance (100 versus 1,000 lifetime parts); inspect the account's
  actual quota and portal plan price instead of promising either allowance.
- [Retention notice](https://support.nexar.com/support/solutions/articles/101000567001-changes-on-offer-id):
  do not retain Nexar data longer than 24 hours under current terms. This includes
  saved JSON/CSV and copied report content, not just a cache directory. The helper
  uses memory only by default and stamps `retain_until` on Nexar batches. It cannot
  automatically delete a copy saved elsewhere. Do not build a permanent Nexar
  dataset without a license permitting it.
- General supply data is updated daily. The
  [FAQ](https://support.nexar.com/support/solutions/articles/101000497890-frequently-asked-questions)
  also says Octopart.com has additional data not exposed through Nexar. Fresh API
  retrieval does not mean a fresh distributor feed. Refresh finalists directly.
- [Authorization flags](https://support.nexar.com/support/solutions/articles/101000499786-distributor-classification)
  can be imperfect; qualify important supplier relationships independently.

## Mouser

- [Search API enrollment and limits](https://www.mouser.com/en/api-search/),
  [Swagger UI](https://api.mouser.com/api/docs/ui/index),
  [V1 schema](https://api.mouser.com/api/docs/V1).
- `MOUSER_SEARCH_API_KEY` is a Search API key, distinct from order/cart API access.
  POST `https://api.mouser.com/api/v1/search/partnumber?apiKey=...` with
  `SearchByPartRequest: {mouserPartNumber: "MPN1|MPN2", partSearchOptions: "Exact"}`.
  The helper never logs this credential-bearing URL.
- Up to 10 pipe-separated part numbers per request, each 3-40 characters, with
  at most 50 results. The published limit is 30 calls/minute and 1,000/day;
  actual account limits govern. The helper waits at least 2.1 seconds between
  batches. It flags truncation rather than interpreting omitted parts as absent.
- Verify exact returned `ManufacturerPartNumber` and `Manufacturer`. Different
  `MouserPartNumber` values may represent packaging choices for the same MPN.
  Preserve `Min`, `Mult`, price breaks, stock, lifecycle, restrictions, and fees.
  `FactoryStock` and `AvailabilityOnOrder` are not `AvailabilityInStock`.
- The helper parses only unambiguous numeric strings and native currencies.
  Localized/ambiguous price strings remain unpriced and available in raw evidence.
  It does not silently guess decimal separators or exchange rates.
- V1/V2 schemas expose generic `ProductAttributes`, `ProductCompliance`, and
  `TradeCompliance` name/value arrays. Authenticated V1 acceptance testing on
  2026-10-19 confirmed `TradeCompliance` entries named `Country of Origin`,
  `Assembly Country of Origin`, and `Country of Diffusion` for STM32G491RET6 and
  PSMN040-100MSEX using exact manufacturer/MPN matches. Some stage values were
  `Not available`; this confirms the route, not universal part/account coverage.
  Preserve actual fields and use the [origin workflow](origin.md) when missing.

## DigiKey

Use the installed `digikey-part-selection` skill's catalog client and credential
launcher; its maintained [API reference](../../digikey-part-selection/references/api.md)
and [credential locations](../../digikey-part-selection/references/credentials.md)
are the source of truth. Product Information V4 uses application credentials and
has no explicit COO field in the inspected schema.

`compare --input digikey-details.json` accepts that client's saved ProductDetails
envelope (API or cache) and preserves `checked_at`. It verifies the queried MPN/SKU,
uses each variation's stock rather than the product's summed quantity, and takes
currency from `SearchLocaleUsed.Currency`. `StandardPackage` is not an order
multiple, so purchase totals stay unknown until a source establishes that rule.
Marketplace supplier names, maximum quantity, tariffs, and reeling fees remain
visible. Only standard pricing is compared; account-specific `MyPricing` requires
separate review of its account context. Source schema:
[Product Information V4](https://developer.digikey.com/node/2360/oas-download).

The helper here adds only read operations for already-existing quote and tracing
IDs. They require an account-linked **three-legged OAuth token** in
`DIGIKEY_USER_ACCESS_TOKEN` plus `DIGIKEY_CLIENT_ID`.
The catalog client-credentials token cannot substitute. Never store this token in
the skill or assume ordinary catalog credential setup supplies it.

- Quote: GET `/quoting/v4/quotes/{quoteId}/details?offset=0&limit=50`.
  Set `DIGIKEY_ACCOUNT_ID` for `X-DIGIKEY-Account-Id`. The schema marks the header
  required although its description calls it optional; the helper follows the
  stricter schema. Limit is 1-50. One page is read per invocation; inspect pagination
  metadata and request further offsets explicitly. Do not call a page a whole BOM.
- Tracing: GET `/ProductTracing/v1/Details/{tracingId}`; optionally set
  `DIGIKEY_CUSTOMER_ID`. IDs are URL-encoded, not derived from an MPN.
- Both preserve COO as declared origin, with quote or lot context. See
  [origin evidence](origin.md) for limitations and primary schema links.

## LCSC and JLCPCB

Both have official partner APIs, confirmed 2026-10-20. Read
[LCSC and JLCPCB access](lcsc-jlcpcb.md) for enrollment, current versus legacy
contracts, scope, and source links.

The `lcsc` helper implements v3.4 read-only product search/details and uses
`LCSC_API_KEY` / `LCSC_API_SECRET`. Offline tests verify signing, matching,
pricing, incomplete pages and failures; production credentials and IP access
still need authenticated acceptance testing. JLCPCB is an access/documentation
route pending its entitled component schema, not a working CLI integration.

## Failures, records, and Findchips

Stop a provider on authentication, quota, or transport failure; retain completed
batches and return a nonzero status. No automatic retries or paid upgrades. The
helper hides HTTP bodies, API error messages, credentials, and credential-bearing
URLs from diagnostics. Respect returned retry/reset metadata before a later retry.

Reports can contain confidential purchasing records. Keep generated reports outside
the skill repository and use an appropriate project-private evidence location.

[Findchips](https://www.findchips.com/) supports website stock/price comparisons.
Supplyframe publishes an
[enterprise API guide](https://sf-npi-ds.zendesk.com/hc/en-us/article_attachments/45828452787092),
but this does not establish a public Findchips inventory-search API entitlement.
Before adding a client, verify the licensed endpoint/schema, supported datasets,
batch/rate limits, fees, and retention terms. The skill currently supplies a manual
fallback, not an invented API integration. Contacting sales requires the user's
instruction to send that communication.
