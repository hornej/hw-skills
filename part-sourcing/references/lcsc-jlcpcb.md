# LCSC and JLCPCB

Verified official documentation on 2026-10-20. Both offer partner APIs requiring
account approval. LCSC live testing is pending credentials. JLCPCB authenticated
component-detail requests were validated after Parts approval on 2026-10-21 UTC
(2026-10-20 in America/Denver). Stock, pricing tiers and technical parameters
were returned; no manufacturing-country or lot-route fields were found.

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
service origin is `https://open.jlcpcb.com`. The component-detail path below was
verified in the downloaded official business SDK.

The documented request-signing flow does **not** use a tokenization public/private
key pair. Do not load those keys for catalog requests unless the applicable
operation's documentation establishes a separate need. Their other purpose has
not been verified. Keep keys, signatures and signing inputs out of logs, command
arguments, reports and repositories; reject redirects on authenticated requests.

### Read-only detail helper

`part_sourcing.py jlcpcb` implements a focused lookup using the official
`overseas-openapi-sdk-java` **1.0.6** and core SDK **1.0.0**, inspected on
2026-10-20. Vendor archives remain outside this repository; the Python client
uses the standard library and does not run or redistribute the Java SDK.

- POST `https://open.jlcpcb.com/overseas/openapi/component/getComponentDetailByCode`
  with `{"componentCodes":["C…"]}`. One C-number per invocation, together with
  the expected manufacturer and complete MPN.
- `ComponentCodesQueryVO.getURI()` establishes the route and request field.
  `ComponentDetailListResponseVO` returns `data` as a list; the core
  `HttpResult.isSuccessful()` requires business `code` 200.
- The helper checks `componentCode`, `componentModel` and `componentBrandEn`
  together. It preserves suffixes and rejects mismatches. No manufacturer aliases
  have been verified for this API. Missing or multiple results are not exact offers.
- `stockCount` is retained with public PCBA-library scope. `componentSpecification`
  is the package, not the packing method. `libraryType`, `assemblyComponentFlag`,
  datasheet URL and the original response remain available for review.
- `ComponentPriceRange` contains `startQuantity`, `endQuantity` and `unitPrice`,
  but no currency. The detail schema also lacks MOQ and order multiple. The helper
  retains raw ranges as `unqualified_price_ranges`, leaves currency/order rules
  unknown and excludes these prices from purchase-cost comparisons. `--currency`
  is a comparison preference, not evidence of JLCPCB's response currency.

### Live acceptance — 2026-10-21 UTC

After Parts approval, the existing Python client completed two authenticated
detail requests with business `code: 200`, `success: true`, and one exact
manufacturer/full-MPN/C-number match each:

- `STM32G491RET6` / `C3231005`, checked at `2026-10-21T04:55:12Z`.
- `STM32F103C8T6` / `C8734`, checked at `2026-10-21T04:56:02Z`.

Both returned package, public PCBA-library stock, price tiers, technical
parameters, library classification, datasheet links, ECCN and RoHS. One returned
zero stock and the other positive stock. The existing normalizer handled both
without changes. Live responses also supplied `dataManualUrl`,
`dataManualOfficialLink` and `dataManualFileAccessId`; they remain in the raw
response rather than being interpreted as origin evidence. No response currency,
MOQ or order multiple was present, so price tiers remain unqualified.

All returned field names and parameter labels were reviewed. Neither part had
COO, wafer-fabrication, chip-assembly, test-country or lot-route information.
The public component response classes in SDK 1.0.6 likewise expose no explicit
manufacturing-country fields. This confirms these detail lookups, not every
JLCPCB API, account entitlement, or possible future response. Private inventory,
orders, balances and catalog-wide enumeration were not requested. Credentials
were supplied in memory; full API responses remain outside the repository.

The earlier request returned HTTP/business status 403 while Parts was under
review. If another account fails, check application credentials, Parts
entitlement and the configured
[outbound IP whitelist](https://api.jlcpcb.com/docs/ip-whitelist).
Do not automatically retry or disable security settings.

The SDK's other public-library operations paginate a catalog; they do not provide
a verified targeted MPN search. This helper does not scan that catalog, read
customer-private stock, or call ordering/balance services. Use a C-number from
an ordinary focused library search, then verify identity with the detail lookup.
Batch limits, account quotas and redistribution terms require confirmation before
expanding this into a bulk service.

Use the ordinary parts-library UI for focused C-number discovery. Basic/Extended
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

JLCPCB's inspected component-detail schema has no explicit COO, wafer-fabrication,
chip-assembly, test-country or lot-traceability field. `assemblyComponentFlag`
concerns PCBA eligibility, not a chip's assembly country. `eccnCode`, `rohsFlag`
and generic parameters do not establish a manufacturing route. The helper leaves
all origin assertions empty. The two successful live detail responses above
also contained no manufacturing-country fields, including their generic
parameter arrays. JLCPCB access is now usable by the sourcing helper, but does
not add an origin source or credential requirement to Origin Lens. An explicit,
defined country/lot field and a verified exact-part response are still needed
before adding an origin integration.

Origin Lens already reads exact ST STM32 LCSC listing photos and recognizes
supported markings locally. This establishes evidence about a photographed
sample only. Neither API discovery nor additional stock data upgrades that
evidence to the current inventory or a complete manufacturing route.
See [origin evidence](origin.md).
