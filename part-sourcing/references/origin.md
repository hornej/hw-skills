# Origin evidence

Verified documentation/schema observations: 2026-10-15. The user's requirement
determines what must be established. Declared customs origin, wafer fabrication,
assembly, and testing are distinct facts. Declared COO alone does not establish
that every stage meets the task's sourcing restrictions or regulatory requirements.

## Evidence to retain

For every assertion retain exact manufacturer/MPN (including suffix), distributor
SKU if relevant, source URL/document, source field label, verbatim value, observation
time, and scope: catalog, quote, shipment, or lot. Record lot/date code where known.
Keep separate fields for declared COO, wafer fabrication/diffusion, assembly, and
test. Missing, conflicting, ambiguous, and mixed-country evidence stays unresolved.

The helper's `origin_records` contain assertion lists for each stage. Empty lists
mean no evidence, not an allowed country. Do not assign a statement about assembly
to testing or turn a wafer-country assertion into evidence of every fabrication
operation. A website's country may change by lot or shipment.

For an exclusion requirement, report stage-by-stage evidence as supported,
excluded-country present, or unknown/conflicting, followed by any procurement
restriction needed to obtain the qualifying lot. Never choose the convenient value
from multiple listed countries. A representative product-family claim is weaker
than evidence for the actual ordering code and supply route.

## ST

Use the installed `st-origin-lookup` skill for its exact-code lookup and browser
fallback. Its observed website attribute 5080 is **declared COO**. This is an
undocumented website JSON service, not a confirmed supported public ST API.

ST explains that French-fabricated silicon can be packaged/tested elsewhere while
declared origin remains France:
[ST community explanation](https://community.st.com/others-stm32-mcus-related-142/country-of-origin-issues-158764).
For missing stage/lot evidence use existing manufacturer documents, supplier
certificates, or prepare a specific request to [ST Online Support](https://my.st.com/ols)
or the authorized supplier. Preparing the request does not authorize sending it.

## Mouser

The product page's Product & Trade Compliance section can expose:

- Country of Origin
- Assembly Country of Origin
- Country of Diffusion (wafer fabrication)

Some entries are unavailable, and Mouser warns that the country can change at
shipment. This does not supply a separate test-country guarantee. An observed
[STM32H523CCU6 example](https://eu.mouser.com/en/ProductDetail/STMicroelectronics/STM32H523CCU6?qs=ZcfC38r4PospXMf8H10EcA%3D%3D)
showed France for COO and assembly unavailable; do not reuse that observation as
a current qualification of another part or lot.

The Search API's generic compliance arrays do not define guaranteed COO keys.
The helper recognizes the three explicit labels above if actually returned in
`ProductAttributes`, `ProductCompliance`, or `TradeCompliance`. It retains raw
values, source field paths, and conflicting assertions. All other names stay in
the raw response for review rather than being guessed. Synthetic fixtures check
the parser; verify the fields actually returned for each live lookup.

## DigiKey

The inspected Product Information V4 schema has no explicit COO field. Two other
APIs document it:

| Source | Field and scope | Access |
| --- | --- | --- |
| Quote V4 ProductsFromQuote | `QuoteProducts[].CountryOfOrigin`, tied to an existing quote line | Three-legged OAuth; quote/account access |
| Product Tracing Details | `CountryOfOrigin` with MPN, lot/date code, and shipment identifiers | Three-legged OAuth; actual tracing ID |

Primary references:

- [Quote operation](https://developer.digikey.com/products/quote/quote-v4/productsfromquote)
  and [OpenAPI schema](https://developer.digikey.com/node/3719/oas-download).
- [Tracing operation](https://developer.digikey.com/zh-hans/products/barcode/producttracing/details)
  and [OpenAPI schema](https://developer.digikey.com/zh-hans/node/3680/oas-download).

The helper reads existing records only. Creating a quote or adding products is a
separate account mutation, not part of an arbitrary part-number lookup. Tracing is
useful when receiving parts and does not predict a future lot. Quote and tracing
COO still do not prove wafer, assembly, and testing locations.

If authenticated origin APIs are unavailable, use the ordinary product/quote/list
UI or supplier documentation within the user's authorized scope. Clearly identify
an unverified stage rather than turning a login limitation into a sourcing answer.

## LCSC and JLCPCB

The [API investigation](lcsc-jlcpcb.md) on 2026-10-20 found official sourcing
APIs at both companies, but no verified manufacturing-country or lot-route field.
LCSC's current v3.4 product schema provides reference photos, generic parameters
and export codes. Its shipping-country fields are destinations, and its
`ProductChangeNotifications` feed concerns catalog/price updates, not manufacturer
process changes. The helper preserves raw responses and leaves origin assertions
empty. JLCPCB's official business SDK 1.0.6 detail schema was inspected: it has no
explicit COO, wafer-fabrication, chip-assembly, test-country or lot-route fields.
The helper leaves origin assertions empty; successful live response validation
is pending Parts approval. Export codes, RoHS and `assemblyComponentFlag` do not
establish origin.

Origin Lens's existing LCSC photo/OCR integration can provide sample assembly
evidence for supported ST markings. Keep this separate from catalog declarations,
stock and lot evidence. JLCPCB's SMT placement services concern board assembly;
they do not establish the semiconductor's package-assembly location.
