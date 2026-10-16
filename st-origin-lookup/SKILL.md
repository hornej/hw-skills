---
name: st-origin-lookup
description: Look up declared country of origin for exact STMicroelectronics or STM32 ordering codes, including batches, using ST website data. Use for origin screening and manufacturing-location questions; distinguish declared COO from wafer fabrication, assembly, and test evidence.
---

# ST Origin Lookup

Retrieve ST's declared country of origin with an exact ordering-code match and traceable evidence. This is a sourcing lookup, not a manufacturing-site or legal-compliance certification.

For distributor availability, quantity pricing, or corroborating origin sources,
use the companion [part-sourcing skill](../part-sourcing/SKILL.md) and its
[origin evidence reference](../part-sourcing/references/origin.md). Keep this
skill's ST website observations separate from distributor or lot-specific claims.

## Workflow

1. Use exact ordering codes, including package, temperature, and packing suffixes. Retain the user's requested scope: declared COO only, or specific fabrication/assembly/test restrictions. Apply the current task's procurement constraints.
2. Read [references/st-website-api.md](references/st-website-api.md) for the observed endpoints, ID mapping, and browser fallback. This is an undocumented website service, not a confirmed supported public API.
3. Discover the family ID from the actual ST product page's requests. Use its product list to map each exact ordering code to a commercial product ID. Never derive an ID from a nearby part or treat the example IDs as defaults.
4. Run [scripts/st_origin_lookup.py](scripts/st_origin_lookup.py) for bounded direct requests or normalization of browser-captured responses. It supports multiple exact parts in a family and JSON/CSV output. With no part arguments, it checks every ordering code returned for that family.
5. If direct access times out, is blocked, or is rate-limited, use the normal product-page browser flow described in the reference. Do not repeatedly retry the same failing route. If browser/network inspection is unavailable, report the lookup as unavailable; do not substitute remembered countries.
6. Report the declared COO, exact code, source, and observation time. Keep fabrication, assembly, and test locations explicitly unverified unless independent evidence establishes them. Missing or ambiguous values cannot establish an exclusion requirement.

## Run the helper

Use an available Python 3 runtime; only the standard library is needed. Resolve the script path relative to this skill.

```text
python scripts/st_origin_lookup.py --parent-id PF274314 --part STM32H523CCU6
python scripts/st_origin_lookup.py --parent-id PF274314 --part STM32H523CCU6 --part STM32H523CCT6 --format csv
python scripts/st_origin_lookup.py --capture captured-responses.json --part STM32H523CCU6
```

The first two commands are verified ID examples, not an approved-parts list. Output goes to stdout unless an explicit output file is supplied. Captured data retains its original timestamp; reading it later does not make it fresh.

For an exported component list, join results by exact ordering code and retain row provenance. Use the available spreadsheet workflow when modifying a workbook is requested. Do not overwrite the source list merely to perform a lookup.

## Interpret the result

- Attribute 5080 is the website's **Country of Origin** field, observed on 2026-10-15. Recheck the page label if the schema or presentation changes.
- Declared COO may differ from packaging or test location. A result such as FRANCE does not establish that every production stage occurs outside China.
- Multiple reported values remain ambiguous; do not choose the most convenient country. Keep conflicting distributor or manufacturer evidence visible.
- For manufacturing-stage restrictions, request or identify evidence covering the exact part and relevant lot/supply route through ST Online Support, an ST sales/application engineer, or the authorized supplier. Preparing that request does not authorize sending it.
- Do not claim regulatory or procurement compliance solely from declared origin. Apply the user's stated requirements without inventing a legal conclusion.

## Verification

```text
python -B scripts/test_st_origin_lookup.py
```

The tests check exact suffix matching, source-ID consistency, missing/ambiguous origin data, capture timestamps, and the CLI. They do not establish API availability or manufacturing location. When reporting a live check, distinguish browser success, direct-HTTP success, and offline parser tests.
