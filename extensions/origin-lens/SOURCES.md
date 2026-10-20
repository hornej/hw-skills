# Origin Lens source coverage

Updated 2026-10-20; installed Mouser API path confirmed that day. Sources remain separate; distributor declarations are never
presented as direct manufacturer declarations. Missing fields stay unknown.

## Implemented

| Source | Coverage / access | Origin fields |
| --- | --- | --- |
| Texas Instruments | Exact full ordering code in signed-in myTI Import details; initial ship-to scope is United States | Destination-specific declared COO; specialized-flow alternate codes and their own origin kept separate; no stage inference |
| Harwin product pages | Exact product code and canonical page; public, no credentials | Declared COO from `countryOfOrigin`; recognized ISO codes displayed as names |
| Samtec product pages | Exact manufacturer, full MPN, SKU and canonical page; public, no credentials | **Probable COO** only; a manufacturer estimate, separate from declarations and manufacturing stages |
| Mouser Search API | Exact manufacturer + full MPN across its catalog; personal Search API key | Declared COO, assembly, diffusion when returned in `TradeCompliance` |
| Mouser website | Current US/EU product page or cross-site page fetch; fallback when no API key is configured | Same named compliance fields, subject to page availability |
| DigiKey | Signed-in, read-only catalog lookup using an existing empty or populated list | Declared COO |
| STMicroelectronics | Supported STM32 full ordering codes; public family/ordering-code services | Declared COO; multiple values kept |
| Microchip | Exact full ordering code in public Product API; Microchip Technology / Microchip Technology Inc. naming | Declared COO, assembly, wafer fabrication |
| Infineon | Public ECCN & HTS Finder search; exact full OPN and verified Infineon manufacturer name; no personal key/login | Declared COO, assembly, diffusion; all returned regions and material variants retained |
| LCSC reference photos | Exact ST STM32 catalog match; no key/login; automatic search and local OCR | Photo markings, automatic CHN/MYS assembly interpretation, and separately reviewed evidence; never current-stock COO |

Mouser's API supplies distributor reports for many manufacturers without building
a separate website adapter for every brand. That does not imply every catalog
part has COO or all manufacturing stages populated.

Evidence and reference links:

- [Mouser API](https://www.mouser.com/en/api-search/) and
  [V1 schema](https://api.mouser.com/api/docs/V1). Authenticated tests returned
  Taiwan / Taiwan / unknown for STM32G491RET6, and Philippines / unknown /
  United Kingdom for PSMN040-100MSEX (COO / assembly / diffusion).
  After the user saved the key, the installed extension on DigiKey's STM32G491RET6
  page displayed Mouser Search API → Taiwan at 09:57:01 local on 2026-10-20.
  Verification used the panel's Refresh button without opening Mouser.
- [Microchip Product API documentation](https://www.microchip.com/designresources/PartnerDataExchange/ProductAPI-user-guide.html).
  The actual extension adapter returned Thailand / Thailand / United States of
  America for PIC10F200-E/MC (COO / assembly / wafer fabrication). No login/key.
  The documented endpoint uses a part search: the adapter therefore rejects
  incomplete pages and requires a unique full-code match before using fields.
- Microchip's catalog name was verified against the
  [DigiKey product](https://www.digikey.com/en/products/detail/microchip-technology/PIC10F200-E-MC/1947985)
  and [Mouser product](https://www.mouser.com/ProductDetail/Microchip-Technology/PIC10F200-E-MC?qs=WqWCsLCZBkrsCaKJCW5d9A%3D%3D).
- [Infineon ECCN & HTS Finder](https://www.infineon.com/search/eccn-hts-finder)
  exposes `eccn_coo`, `eccn_coa`, and `eccn_cod`. Its public frontend uses a
  temporary token from Infineon and a dedicated Coveo search tenant. This is an
  observed website service, not a documented supported integration API.
  [Infineon's product page](https://www.infineon.com/part/AMM12S62LB2Z)
  explicitly labels CoA as Country of Assembly and CoD as Country of Diffusion.
  Its [diffusion explanation](https://community.infineon.com/t5/Knowledge-Base-Articles/Semiconductors-Country-of-Diffusion-VS-Country-of-Origin/ta-p/256790)
  identifies diffusion as wafer fabrication; this adapter uses the explicitly
  separate CoO/CoA fields instead of inferring one from the other.
  Live CYW43439KUBGT returned 12 regional/material records: COO `YY`, assembly
  `TW`, diffusion `CN`. IRLML6344TRPBF returned 48 records, including regional
  COO differences and unknown wafer codes. Raw `YY` stays unresolved; the finder
  says declared COO is only available at shipment for those records.
  Full sanitized result fixtures preserve every row, excluding unrelated search
  metadata and tokens. Exact Infineon naming was verified on
  [DigiKey](https://www.digikey.com/en/products/detail/infineon-technologies/CYW43439KUBGT/16637075)
  and [Mouser](https://www.mouser.com/en/ProductDetail/Infineon-Technologies/CYW43439KUBGT?qs=iLbezkQI%2Bsimvupr%2BuwCJA%3D%3D).
- [LCSC STM32G491RET6 / C3231005](https://www.lcsc.com/product-detail/C3231005.html)
  supplied exact Product JSON-LD with brand **ST**, full MPN, SKU, canonical
  product link and three 900×900 part-specific image URLs. Brand 74 is ST.
  The [top-side image](https://assets.lcsc.com/images/lcsc/900x900/20230511_STMicroelectronics-STM32G491RET6_C3231005_blank.jpg)
  visibly shows **STM32G491 / RET6** and **CHN**. Reviewed on 2026-10-20,
  SHA-256 `18a9f8dd08330efdc3aebbec6f89c6a12c98b86653b92c7e308d361763cb5568`.
  [LCSC's gallery](https://www.lcsc.com/product-image/C3231005.html?whichImg=0)
  labels images as reference only. File naming is not used to infer a photo or
  manufacturing date. The adapter verified the live fingerprint at
  `2026-10-20T16:14:57Z` and keeps the original visual review timestamp separately.
  For version 0.12.1, visual inspection of the three C3231005 photos confirmed
  `front` is an angled top view, `blank` is the marked top on a plain background,
  and `back` is the unmarked underside. Only `front` and `blank` variants are
  accepted for previews, links and OCR; missing top-side photos are not guessed.
- [ST employee explanation of CHN](https://community.st.com/stm32-mcus-products-25/does-anyone-have-a-cheat-sheet-to-tell-me-what-the-date-code-is-and-what-it-stands-for-34162)
  identifies it as assembly-site country. The LCSC annotation applies this
  interpretation only to the reviewed sample. It assigns no wafer or test
  country and makes no current-lot claim. Other manufacturer codes require
  their own verified interpretation.

LCSC scope is currently ST STM32 photographs, with one bundled reviewed image.
Version 0.7.0 reads other images automatically with bundled Tesseract.js 7.0.0.
Only CHN and MYS are mapped to assembly countries, after two agreeing image
variants with word scores of at least 80. The browser reader independently
recognized CHN (91/100 minimum agreeing score) on C3231005 and MYS (86/100) on
[STM32F103C8T6 / C8734](https://www.lcsc.com/product-detail/C8734.html).
These are OCR scores, not accuracy probabilities. Whole-part lettering can be
misread; the catalog provides the exact listing identity. No plant/lot decoding
or current-stock inference is performed. Unclear/unsupported markings retain
the photos and detected text without assigning a country.
The pasted conversation's specific PCN plant mappings were not
independently validated in this integration and are not used by the extension.

## Texas Instruments verification

The [TI Import details tool](https://www.ti.com/support/import-details.html)
explicitly defines its origin as specific to the ship-to country. The initial
adapter uses United States ship-to and U.S. ECCN; both are fixed request fields.
On 2026-10-20, after the user signed into myTI normally, its live table returned:

| Exact code | Origin, ship to United States | Listed specialized-flow alternative | Alternative origin, same destination |
| --- | --- | --- | --- |
| TLV75801PDRVRG4 | United States | TLV75801PDRVRG4.A | United States |
| TPS259474ARPWR | Taiwan, United States | TPS259474ARPWR.A | United States |

Both rows displayed ECCN EAR99 and HTS 8542390090. These are dated catalog
observations, not guaranteed shipment routes. TI's [manufacturing terminology](https://www.ti.com/about-ti/worldwide-manufacturing/manufacturing-terminology.html)
distinguishes COO from ACO (assembly country), CCO (fabrication country) and PDC
(warehouse). Import details provides no named assembly, fabrication or test
field in the observed result. The extension leaves those stages unknown.

The public client `@ticom/import-details-components` v1.0.17 identifies the
read-only POST endpoint `/importdetailsmodel/api/v1/ext/secured/material-import-details?locale=en-US`
and request fields `searchedPartNumbers`, `shipToCountryCode`, `eccnCountryCode`.
It maps returned `searchedPartNumber`, `tiPartNumber`, `countryName`, `eccn`,
`hts` and `apns[].alternatePartNumber/countryName` into the table. The adapter
requires exact queried and returned full codes, preserving every suffix.
It does not use the user/profile endpoint, persist authentication data, or
follow redirects. An unauthenticated request returned HTTP 401 as expected.
This is an observed website contract, not a published integration API.

The offline fixture is reconstructed from those rendered rows and the public
client field mapping, rather than a raw authenticated API response. Installed
extension validation is recorded separately in the README.

### Product Information API access check

On 2026-10-20, user-provided `TI_API_KEY` and `TI_API_SECRET` were retrieved
from Bitwarden Secrets Manager for a read-only evaluation. OAuth client-credentials
authentication at `https://transact.ti.com/v1/oauth/accesstoken` succeeded.
Credentials and access tokens stayed in process memory and were not added to
the extension, repository, or diagnostic output.

Both `/v1/products/{ProductIdentifier}` and
`/v1/products-extended/{ProductIdentifier}` returned HTTP 200 and exact full
identifiers for `TPS259474ARPWR` and `TLV75801PDRVRG4`. The responses included
base-product identity, package/carrier details, lifecycle, ECCN/HTS, electrical
parameters and limited quality/reliability data. Neither response included COO,
assembly, wafer-fabrication, diffusion or testing locations, or the Import
details specialized-flow alternate list. `Quality.ProcessTechnology` was
`Not Available` for both parts; process technology is not a location even when
populated. `InventoryStatus` explicitly directed callers to the Store Inventory
and Pricing API.

The published [Product Information schema](https://www.ti.com/content/dam/developer-api/product-information-api.yaml)
and [Orchestrated schema](https://www.ti.com/content/dam/developer-api/product-information-orchestrated-api.yaml)
also provided no named origin or manufacturing-location fields. These findings
describe the reviewed schemas and two live examples, not a guarantee about
future API coverage.

A separate request to the existing Import details endpoint, using that valid
API bearer token without browser cookies, returned HTTP 401. Product Information
API access therefore did not replace the myTI website session in this test.
Origin Lens continues to use the signed-in website source for TI COO. Product
Information remains a possible source of package/packing and parametric metadata
for future variant research; it is not counted as origin evidence.

TI Store API approval was still pending and no Store requests were made. After
approval, inspect and test its applicable read-only endpoints separately; do not
assume they offer catalog COO, alternate-flow data, or authentication for Import
details. See TI's [authentication guide](https://www.ti.com/developer-api/product-information-api-suite/authentication.html)
and [Product Information guide](https://www.ti.com/developer-api/product-information-api-suite/getting-started.html).

## Harwin and Samtec verification

Harwin and Samtec were added in 0.11.0 after live network and parser checks on
2026-10-20:

- [Harwin S8411-45R](https://www.harwin.com/products/S8411-45R): `CN` → China.
- [Harwin H3192-05](https://www.harwin.com/products/H3192-05): `GB` → United Kingdom.
- [Samtec SQT-103-01-F-Q](https://www.samtec.com/products/sqt-103-01-f-q):
  probable `MALAYSIA` → Malaysia.
- [Samtec TSM-106-03-L-SV](https://www.samtec.com/products/tsm-106-03-l-sv):
  probable `VIETNAM` → Vietnam.

Samtec's origin table explicitly describes a prediction that may change before
shipment. The extension preserves it in `probableCoo`, leaving declared COO and
all stage fields empty. Harwin's field is under the exact product's attributes
in its server-rendered page data and is also displayed in Product Characteristics.
Both pages are fetched as inert HTML; no provider scripts are executed. Each
adapter checks the requested URL, canonical URL and exact returned product code.
These are observed website fields rather than supported public API contracts.
Sanitized fixture excerpts omit analytics and unrelated content. Distributor
manufacturer aliases were checked against [DigiKey Harwin](https://www.digikey.com/en/products/detail/harwin-inc/S8411-45R/3131055)
and [DigiKey Samtec](https://www.digikey.com/en/products/detail/samtec-inc/SQT-103-01-F-S/6678716).

Additional investigation during this release:

- TI's import tool initially required myTI login; it was subsequently integrated
  in 0.12.0 after an authorized signed-in lookup, as described above.
- ADI's current MAX6067 reliability report provides qualification data, but no
  wafer or assembly country was verified. It was not converted into origin evidence.
- Molex's [COO request form](https://www.molex.com/en-us/country-of-origin)
  delivers results by email. No form was submitted or automatic adapter added.

## Researched candidates, not integrated

| Source | Current finding | Next evidence needed |
| --- | --- | --- |
| Analog Devices / Maxim | [ADI employee guidance](https://ez.analog.com/voltage-references/f/q-a/594884/how-to-get-the-information-of-the-country-of-wafer-origin) points to product pages for wafer origin. MAX6067 product and Sample & Buy views were inspected; no current structured COO result was verified. | Actual exact-order-code compliance response; family page or manufacturing-site lists alone are insufficient. |
| onsemi | Customer-information/report pages surfaced, but no usable exact-part response was verified. | Working supported origin report/API, including any required account access. |
| Nexperia / NXP | No direct exact-part manufacturer COO transport verified in this investigation. | Exact-code source; general factory locations and sustainability declarations are insufficient. |
| Farnell / Newark, RS, TME | Potential additional distributor sources; no authenticated/structured origin endpoint validated here. | Exact manufacturer/MPN mapping, documented field meaning, access requirements and a live result. |
| Nexar / Octopart | Existing sourcing integration is useful for identifying parts/offers; no usable COO field verified here. | Confirm origin field and entitlement before adding requests or using quota. |
| LCSC partner API | Official API Access & Usage Guide v3.4 reviewed 2026-10-20; stock, prices, exact identity and reference-photo URLs are documented. No named manufacturing-country fields found. | Approved API credentials and live response; existing photo evidence remains sample-only. |
| JLCPCB Components API | Official portal confirms public-library details by C-number and private inventory. Public component response schema was not available in the inspected docs. | Approved Components access, field definitions and an exact-part response before adding origin requests. |

The maintained [LCSC/JLCPCB investigation](../../part-sourcing/references/lcsc-jlcpcb.md)
links the official application and documentation routes. LCSC's
`ProductChangeNotifications` API is a catalog/price update feed, not a source of
manufacturer process-change notices. Destination countries, warehouse stock and
PCB assembly attributes are not chip-origin evidence. No new runtime origin
adapter or host permissions were added on the basis of API availability alone.

## Adding an adapter

1. Capture a live, exact-order-code response and the official field description.
2. Add a manufacturer/provider dispatch and explicit verified name aliases in
   `core.js`; never strip packaging/temperature suffixes to make a match.
3. Add a fixed, bounded, read-only network operation and the minimum host
   permission. Credentials stay in the worker; report URLs cannot include them.
4. Return the shared record shape: source identity, checkedAt, sourceKind,
   sourceUrl and distinct declaredCoo/assembly/diffusion/testing fields.
   Estimates use a separate probableCoo field and remain excluded from
   declared-origin counts and comparisons.
5. Test ambiguous/near matches, missing fields, auth/quota/schema errors,
   cache provenance, and master/type cancellation. Verify live before claiming
   support; document any installed-browser test still pending.
