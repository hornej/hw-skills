---
name: part-sourcing
description: Compare exact electronic parts using Nexar/Octopart, Mouser, DigiKey, LCSC, and JLCPCB component details, with quantity pricing, stock, and separate origin evidence. Use for candidate lists, BOM sourcing, and procurement constraints after technical requirements are established.
---

# Part sourcing

Turn technically plausible candidates into an evidence-backed sourcing comparison.
Derive the purchase quantity, market, currency, and origin requirements from the
current task.

## Select the route

- For STM32 interface and package screening, default to ST's GitHub pin database
  at a freshly checked, recorded commit before spending catalog quota. Use local
  CubeMX data for missing coverage, offline work, or a verified newer source.
  Read [CubeMX pin screening](references/stm32-cubemx.md) for mapping and validation.
- For broad availability screening, use Nexar's batch API. Read
  [provider access](references/providers.md) before calling a provider.
- For final stock and prices, use the existing `digikey-part-selection` client or
  the Mouser or LCSC helper here. Refresh exact distributor SKUs and packaging choices.
- For LCSC or JLCPCB, read [LCSC and JLCPCB access](references/lcsc-jlcpcb.md).
  Both have official partner APIs. LCSC supports search/details; JLCPCB supports
  one C-number detail lookup from its official SDK, with live access validated.
  Keep JLCPCB assembly-library inventory distinct from LCSC purchasable stock.
- For COO or fabrication/assembly/test restrictions, read
  [origin evidence](references/origin.md). Use `st-origin-lookup` for ST's website
  service when that installed skill is available. An absent integration is not
  evidence that a country or production stage is acceptable.
- Findchips remains a browser/manual cross-check. Supplyframe's enterprise API is
  documented, but a supported self-service Findchips market-search API, access
  terms, and prices have not been verified. Do not invent endpoints or treat an
  unofficial scraper as the official API.

## Fast workflow

1. Establish hard technical requirements before spending API quota: voltage,
   interfaces, pin/package constraints, temperature, qualifications, and lifecycle.
   Manufacturer datasheets establish suitability. Distributor parameters are
   screening aids; alternative suggestions still need independent qualification.
   For STM32s, distinguish internal peripheral counts from bonded signals and a
   simultaneous package pin allocation using the CubeMX route above.
2. Normalize and deduplicate exact manufacturer/MPN pairs, preserving all suffixes
   and source-row identities. Batch queries; query only entitled optional fields.
3. Compare individual offers at the requested quantity. Include minimum order,
   order multiple, actual purchase quantity, unit price, extended parts cost,
   currency, stock, packaging, source, and observation time. Keep factory stock,
   on-order stock, and ready-to-ship distributor stock distinct.
4. Prefer authorized supply unless the user has chosen another route. An
   aggregator authorization flag is reported evidence, not independent verification
   of the distributor's manufacturer line card. Never sum duplicate packaging,
   regional, or cross-provider listings into a stock total.
5. Enrich promising candidates with origin evidence in parallel with independent
   availability checks when access permits. Keep unknown, conflicting, and
   lot-dependent origin information visible. Never silently waive a hard constraint.
6. Refresh the finalists directly with distributors. Preserve original timestamps
   on reused evidence. Present the tradeoffs and unresolved requirements together
   with the recommended exact part and orderable SKU.

## Helpers

[scripts/part_sourcing.py](scripts/part_sourcing.py) uses Python 3.10+ standard
library only. It makes read-only catalog/quote/tracing requests, deduplicates inputs,
and preserves partial successful batches when a later request fails. It does not
create quotes, send RFQs, place orders, or change libraries.

Input CSV requires `manufacturer,mpn` headers. JSON is an array of objects with
those fields. Optional `row_id` preserves worksheet/BOM identity; the helper also
records the original input indexes. Manufacturer aliases must be resolved from
evidence: a mismatch is not silently accepted.

```text
python scripts/part_sourcing.py nexar --input candidates.csv --quantity 1000
python scripts/part_sourcing.py mouser --part STM32H523CCU6 --manufacturer STMicroelectronics --quantity 1000 --output mouser.json
python scripts/part_sourcing.py lcsc --part STM32G491RET6 --manufacturer STMicroelectronics --quantity 1000 --output lcsc.json
python scripts/part_sourcing.py lcsc --part STM32G491RET6 --manufacturer STMicroelectronics --sku C3231005 --quantity 1000 --output lcsc-detail.json
python scripts/part_sourcing.py jlcpcb --part STM32G491RET6 --manufacturer STMicroelectronics --sku C3231005 --quantity 1000 --output jlcpcb-detail.json
python scripts/part_sourcing.py compare --input mouser.json --quantity 1000 --currency USD --format csv
python scripts/part_sourcing.py compare --input mouser.json --input digikey-details.json --quantity 1000
python scripts/part_sourcing.py digikey-quote --quote-id 12345 --offset 0 --limit 50 --output quote-page.json
python scripts/part_sourcing.py digikey-trace --tracing-id LABEL_TRACING_ID --output lot.json
```

Numbers/codes above illustrate syntax, not current sourcing results. Credentials
are supplied through process environment variables described in the provider
reference, never command arguments or committed files. The optional Windows
[credential launcher](references/credentials.md) accepts environment credentials
or a user-configured Bitwarden mapping. The helper emits JSON by
default; `compare` can produce CSV from one or more helper JSON reports, including
the existing DigiKey client's ProductDetails envelope. DigiKey imports preserve
package-specific stock and validated response currency. Its `StandardPackage`
does not establish an order multiple; missing multiples keep the purchase quantity
and extended cost unresolved while still showing an advertised quantity price.

JLCPCB requires a C-number plus the expected manufacturer and full MPN. Its SDK
does not establish price currency, MOQ or order multiple; price tiers are retained
as unqualified evidence and excluded from cost comparisons. Its inventory is
scoped to JLCPCB's public PCBA library. See the provider reference before live use.

Nexar keeps no persistent cache in this helper. Its data retention limit is 24
hours under the currently documented terms; saved outputs and copies are subject
to the same limit. Use direct distributor/manufacturer evidence for durable
selection records, subject to those sources' terms. In-run input deduplication
avoids repeated requests. The existing DigiKey cache retains its own behavior;
use its `--refresh` for finalists.

## Results and verification

Keep technical fit, commercial comparison, and origin status separate. A calculated
price is not an order acceptance or compliance decision. The helper leaves missing
stock and order constraints unknown and does not convert currencies implicitly.
Its computed parts total excludes freight, duties, taxes, and other unquoted fees.

Run `python -B -m unittest discover -s tests -v` from this skill directory after
changing the helper. Offline fixtures verify request construction, identity,
pricing, provenance, and failures; they do not verify credentials or live inventory.
See the provider reference for which interfaces were inspected and which still need
authenticated acceptance testing.
