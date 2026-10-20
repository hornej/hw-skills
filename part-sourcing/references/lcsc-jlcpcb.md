# LCSC and JLCPCB

Verified official documentation on 2026-10-20. Both offer partner APIs requiring
account approval. No authenticated call was made during this integration.

## LCSC

Use [LCSC's application page](https://www.lcsc.com/agent) and
[API instructions](https://www.lcsc.com/docs/). The instructions link to the
[current downloadable API guide](https://wmsc.lcsc.com/crm/download/api/doc).
The inspected download is **API Access & Usage Guide v3.4**. Keep the download
outside the repository; consult the original instead of redistributing it.

The current guide and the older `/docs/openapi/` reference describe different
contracts. The helper implements v3.4: signed headers with SHA-256 and business
query parameters, on the production `api.lcsc.com` host. Do not mix in the older
`ips.lcsc.com` endpoints or SHA-1 authentication. The downloaded guide's examples
mostly target `fatapi.lcsc.com`; that is a test environment with simulated data,
not a source of current supply. This helper only targets production.

Access requires an LCSC account, application review, provisioned key/secret, and
possibly an approved IP address. The current guide describes test onboarding and
a cooperation agreement before production activation. Installing this skill does
not provision any of those. Credentials are `LCSC_API_KEY` and `LCSC_API_SECRET`
in the process environment; the Windows launcher also supports user-configured
Bitwarden records. Do not print authentication headers or the signing input.

### Read-only helper

`part_sourcing.py lcsc` provides:

- MPN keyword search, one bounded page per distinct manufacturer/MPN pair.
- Product details by a verified `--sku C…`, together with the expected full MPN
  and manufacturer. Detail mode accepts one input pair.
- Exact manufacturer/MPN verification; suffixes and punctuation are preserved.
  LCSC's verified brand 74, named `ST`, can match `STMicroelectronics`; the
  returned manufacturer name is also retained. Other aliases need evidence.
- Quantity prices, response currency, stock, MOQ, order increment, packaging,
  reel fee, datasheet and reference-photo URLs. Photos are not downloaded.
- Existing JSON/CSV comparison support and source timestamps. Export codes and
  photos do not populate origin-country fields.

Search defaults to 50 results, offset zero; `--limit` accepts 1–500.
`--offset` explicitly requests another page. A missing/mismatched result count
or nonzero offset marks coverage incomplete, even if an exact offer is present.
No automatic pagination, category dump, order/cart mutation or retries.
Use the reported C-number for an exact detail refresh of a finalist.

The guide specifies 60 keyword searches/minute and 1,000/day as reference
quotas, with account limits governing. The older landing-page FAQ says 200/minute.
The helper spaces calls by 1.1 seconds and stops on access, quota or transport
failure, retaining earlier successful parts. Confirm detail-operation limits
with the provisioned account; an undocumented allowance is not unlimited.

The guide's field tables use `manufacturerProductCode`, while its examples use
`manufacturerProductNumber`. The parser accepts either and rejects conflicts.
Nested pricing must match the same SKU, MPN and manufacturer. Native response
currency governs comparison: the documentation says the requested currency
filter applies to `ProductPricing` mode, while this helper requests `All`.
An unexpected currency stays unpriced in the requested currency; no conversion
or assumption. `unitPrice` is used as returned without applying `discountRate`
a second time. Manufacturer pack size is not the order increment.

LCSC's API terms restrict bulk capture, redistribution and public data services.
Keep account results private, attribute LCSC, and use focused candidate queries.
Do not bundle API-returned photos/data in a public repository or hosted dataset.

## JLCPCB

[JLCPCB's official access guide](https://jlcpcb.com/help/article/jlcpcb-online-api-available-now)
and [developer portal](https://api.jlcpcb.com/) explicitly advertise a
Parts/Components API for specifications, availability and pricing.
Apply through the portal; approval considers company/business information and
previous orders. Access to PCB pricing alone does not establish Components access.

The rendered [API list](https://api.jlcpcb.com/docs/api-list) confirms:

- Public component-library information, paginated.
- Component details by C-number.
- The authenticated customer's private component inventory.

The public [SDK guide](https://api.jlcpcb.com/docs/sdk-usage-guide) describes a
Java SDK, separate business packages, and app ID/access key/secret key credentials.
[Basic rules](https://api.jlcpcb.com/docs/start) specify HTTPS POST, JSON, and
business-status checks in addition to HTTP status.

### Authentication requirements

The rendered [request-signature guide](https://api.jlcpcb.com/docs/api-request-signature)
specifies **App ID, AccessKey and SecretKey**. Use `JLC_API_APP_ID`,
`JLC_API_ACCESS_KEY` and `JLC_API_SECRET_KEY` as the credential names when wiring
a client. An access key alone does not supply the application ID.

Sign the UTF-8 string `METHOD\nPATH_WITH_QUERY\nTIMESTAMP\nNONCE\nBODY\n`,
including the final newline, using HMAC-SHA256 with SecretKey and Base64-encode
the digest. The timestamp is Unix seconds; the nonce is 32 random alphanumeric
characters. POST signs the exact JSON bytes sent; GET has an empty body.
The single-line Authorization header uses the `JOP` scheme with quoted `appid`,
`accesskey`, `nonce`, `timestamp` and `signature` fields. The SDK's documented
service origin is `https://open.jlcpcb.com`; operation paths still require the
entitled Components documentation.

The documented request-signing flow does **not** use a tokenization public/private
key pair. Do not load those keys for catalog requests unless the applicable
operation's documentation establishes a separate need. Their other purpose has
not been verified. Keep keys, signatures and signing inputs out of logs, command
arguments, reports and repositories; reject redirects on authenticated requests.

**No standalone JLCPCB transport is implemented yet.** Public pages inspected
did not expose the component request/response schema or its business SDK download.
Obtain the entitled Components documentation/SDK from the approved account,
then verify exact identity, stock scope, currencies, order constraints, quotas,
and field meanings before writing a client or claiming live support.
Do not invent paths or use third-party scraped catalogs as the official API.

Until then, use the ordinary parts-library UI for focused checks. Basic/Extended
classification and SMT placement capabilities concern JLCPCB's assembly service.
Private/customer-owned inventory is not public stock offered for sale. A shared
C-number does not mean LCSC and JLCPCB stock can be combined or purchased through
the same route.

## Origin Lens and manufacturing evidence

The LCSC v3.4 product schema includes reference images and generic product
parameters/export codes, but no documented declared-COO, wafer-fabrication,
chip-assembly or test-country field. `countryCode` and `lastCountryCode` in
shipping/order sections describe destinations. `ProductChangeNotifications`
is a catalog information/price update feed, not a manufacturer process-change
notice service; inventory changes alone do not trigger that feed.

No JLCPCB component-origin field or lot-traceability API was verified in the
public documentation. Keep those stages unknown until an exact-item response
and field definition establish them.

Origin Lens already reads exact ST STM32 LCSC listing photos and recognizes
supported markings locally. This establishes evidence about a photographed
sample only. Neither API discovery nor additional stock data upgrades that
evidence to the current inventory or a complete manufacturing route.
See [origin evidence](origin.md).
