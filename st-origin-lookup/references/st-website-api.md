# ST website origin data

Endpoint structure observed on 2026-10-15 through a logged-out ST product page.
No supported public API documentation was found. Direct-request availability can
vary by client and network; use the normal browser flow when needed. An access
failure does not establish that a part has no origin data.

## Endpoints and identifiers

The website uses GET requests under https://ksmk.st.com:

| Operation | Endpoint | Meaning |
| --- | --- | --- |
| Family ordering codes | /products/productsByParentId?parentId=PF274314 | Returns exact item_name, prmis_id, and parent_id |
| Commercial-part attributes | /viewAttributes/getListOfViewAttributes?prmisId=CP549218 | Returns attribute_name / attribute_value rows |

The family response mapped:

| Exact ordering code | Commercial product ID | Family ID |
| --- | --- | --- |
| STM32H523CCU6 | CP549218 | PF274314 |
| STM32H523CCT6 | CP549210 | PF274314 |

Both attribute responses contained:

```json
{"attribute_name":"5080","attribute_value":"FRANCE"}
```

The product page's Country of Origin table header had data-attribute-id="5080". These observations establish the website's declared COO only. Do not infer the country of wafer fabrication, assembly, or test from this field.

The product list's numeric price fields are outside this skill's scope; do not use them as current distributor quotes.

## Discover IDs and capture data through the browser

Use the browser tools and their current runtime documentation. Do not assume APIs or reuse stale request IDs from another navigation.

1. Open the correct ST product page in the background and view Sample & Buy. Confirm the requested ordering codes are present.
2. If supported, read the browser's CDP capability documentation, enable Network inspection, record an event cursor, and reload once.
3. Inspect Network.responseReceived events for the observed productsByParentId and getListOfViewAttributes requests. Read their response bodies using the actual request IDs.
4. Check the product list's exact item_name, prmis_id, and parent_id mapping. When needed, verify the Country of Origin header's data-attribute-id in the page DOM.
5. Capture only the product list and attribute response bodies, plus an actual UTC capture timestamp. Do not export cookies, authorization headers, CSRF tokens, analytics requests, or unrelated page data.

If only the visible page is available, its exact-part COO can still be reported with a page citation and observation time. Do not claim API extraction succeeded.

The helper accepts this envelope through --capture FILE or --capture - (stdin):

```json
{
  "schema": "st-origin-capture-v1",
  "captured_at_utc": "2026-10-15T12:00:00Z",
  "parent_id": "PF274314",
  "products": [
    {
      "prmis_id": "CP549218",
      "parent_id": "PF274314",
      "item_name": "STM32H523CCU6"
    }
  ],
  "attributes": {
    "CP549218": [
      {
        "prmis_id": "CP549218",
        "attribute_name": "5080",
        "attribute_value": "FRANCE"
      }
    ]
  }
}
```

This envelope is a format example; its timestamp is illustrative. For real evidence, retain the full returned products and attribute arrays and use the time they were actually captured. If a response body is base64-encoded, decode it before JSON parsing.

## Helper behavior

- Direct mode requires an observed PF family ID; the helper gets CP IDs from the returned exact-part mapping.
- Requests use standard TLS verification, a finite timeout, and no automatic retries. A failed fetch returns an error, not a country.
- Every requested part must have one exact mapping. Packing suffixes such as TR are not interchangeable.
- All attribute rows must belong to the expected CP ID. Unexpected structure is rejected.
- Empty or absent 5080 becomes missing. Distinct duplicate values become ambiguous, with all values preserved.
- Wafer fabrication, assembly, and test fields remain null, with manufacturing_locations_status set to not_verified.
- --output writes only the specified file. CSV is suitable for later joining to an authorized component comparison.
- Captures are supplied evidence, not authenticated certificates. The helper checks their structure and internal consistency; it cannot independently attest to their provenance.

## Authoritative references

- [STM32H523CC product page](https://www.st.com/en/microcontrollers-microprocessors/stm32h523cc.html#sample-buy): observed table and API mapping.
- [ST explanation of declared origin versus packaging/testing](https://community.st.com/others-stm32-mcus-related-142/country-of-origin-issues-158764): ST describes silicon fabricated in one country and packaging/testing elsewhere without changing its declared COO.
- [ST guidance for H523 origin clarification](https://community.st.com/stm32-mcus-products-25/clarification-on-country-of-origin-for-stm32h523rct7-164099): requests directed to Online Support.
- [ST Online Support](https://my.st.com/ols): route for exact-part manufacturing-stage questions.
