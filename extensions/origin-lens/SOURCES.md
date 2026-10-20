# Origin Lens source coverage

Updated 2026-10-20; installed Mouser API path confirmed that day. Sources remain separate; distributor declarations are never
presented as direct manufacturer declarations. Missing fields stay unknown.

## Implemented

| Source | Coverage / access | Origin fields |
| --- | --- | --- |
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

## Researched candidates, not integrated

| Source | Current finding | Next evidence needed |
| --- | --- | --- |
| Texas Instruments | [Import details](https://www.ti.com/support/import-details.html) explicitly reports destination-specific COO. Live tool requires myTI login. | Authorized signed-in lookup; exact MPN + destination response and stable read-only transport. |
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
5. Test ambiguous/near matches, missing fields, auth/quota/schema errors,
   cache provenance, and master/type cancellation. Verify live before claiming
   support; document any installed-browser test still pending.
