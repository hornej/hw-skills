# Metadata and identity

These conventions capture the requested enrichment workflow. Honor a different
schema or supplier preference explicitly chosen by the user.

| Field | Meaning and evidence |
| --- | --- |
| MFR | Manufacturer supported by the exact part record. Preserve a valid historical label unless normalization is requested. |
| MPN | Exact manufacturer part number, including suffixes and leading zeros. |
| IPN | Internal part number. Confirm the project's PLM mapping; preserve its exact text separately from MPN, supplier codes, and Altium Item/revision IDs. See [Arena IPN synchronization](arena-ipn.md). |
| Name | Human-readable component label; may be derived from a normalized Comment when requested. It is not the Item ID. |
| Description | Exact-part technical prose, checked against the final structured specifications and manufacturer corrections. |
| Supplier | Distributor associated with SPN. Use DigiKey for a newly selected DigiKey offer. |
| SPN | That distributor's exact ordering code, including packaging suffixes. |
| Value | Nominal electrical value for a passive, such as 39k, 1uF, or 4.7uH, supported by its identity or reliable existing specification. |
| DigiKey link | Native named component link with description/key DigiKey and the verified product URL. |

## Catalog matching

Verify manufacturer and exact MPN on an authoritative manufacturer or distributor
page. Preserve source URLs, observed ordering codes, packaging, and the date of
verification in the project audit. A search-results URL is not a verified product
link. Similar names, a matching package, or a distributor search hit do not prove
identity. Do not invent ordering codes or strip suffixes to force a match.

Keep Supplier and SPN coherent. Adding a DigiKey link does not require replacing
an existing valid Mouser pair. A missing SPN with an existing supplier remains a
gap until that supplier's offer is verified. Choose packaging from a real offer
using the user's preference; do not impose one project's packaging choice on
other libraries.

Named DigiKey or Mouser links can be added without adding supplier part numbers
when that is the user's preference. Only add country of origin when an explicit
exact-part source provides it; do not infer it from manufacturer headquarters,
shipping origin, tariffs, or export classifications.

Reuse previously verified catalog caches with their exact identity, URL and
observation date. Catalog prose can conflict with reviewed ratings, such as
standard-mode versus extended-mode resistor power. Apply the same evidence
choice to Description as to technical fields. Preserve useful source prose
or assemble known facts for unmatched records, clearly separating that basis
from exact catalog verification. Do not copy example qualifications such as
Automotive/AEC onto other parts or claim full coverage while searches remain.

A source name conflicting with MPN/SPN requires identity resolution. Keep symbol
variants as separate Workspace items even when they share an MPN. Do not merge,
clone, delete, or reimport items as part of ordinary metadata enrichment.

For resistor power/name discrepancies, follow [rating consistency](power-ratings.md).
The same exact part can have standard, extended, or precision operating ratings;
record the selected mode and conditions before changing Name, Description, or
Power. A package code or the highest catalog wattage is insufficient evidence.

Names can repeat and may resemble old source IDs. Keep local source identifiers
separate from Workspace Item IDs even when their strings overlap; use the
reconciled import mapping. Changing Name must not change the managed Item ID,
merge same-MPN symbol variants, or split multiple footprints into separate
components. See [batch editing](batch-editing.md) for native Name changes.

## Named links and Part Choices

Inspect all existing link slots before assigning one. The observed native storage
fields are ComponentLinkNDescription and ComponentLinkNURL, with a paired index N.
Update an existing DigiKey slot or use a confirmed unused slot; do not overwrite
a datasheet or another reference just because it occupies slot 1.

An ordinary parameter named DigiKey, or a supplier entry beneath Part Choices,
does not establish that the requested native link was created. Verify the rendered
named link and its actual URL in the Workspace. Retaining an existing link
during a synchronization does not establish new-link creation. Pilot creation
through these mappings before extending it to a batch.

Canonical MFR/MPN/Supplier/SPN parameters are separate from Part Choices. Keep
Part Choice mappings absent for a parameter-only update unless their replacement
is intended. See the synchronization reference for the documented overwrite
behavior. When retiring numbered Manufacturer/Manufacturer Part Number fields,
use the [batch cleanup guidance](batch-editing.md); those pairs may contain
alternatives that differ from MFR/MPN.

## Passive values and templates

Use a compact, consistent unit convention without changing magnitude. Preserve
decimal values and distinguish m from M. Resolve ambiguous source notation
against a datasheet instead of guessing. Values in a user example are formatting
examples, not specifications for generic RES/CAP/IND symbols.

Requiredness is independent of a parameter's unit type. For DNPs, retain the
user's chosen template policy rather than inserting NA or zero into numeric
fields. Decide whether optional ratings on regular templates or separate
templates fit the project. See [templates](templates.md).

Generic symbols and non-orderable primitives may lack an orderable identity.
Report those gaps separately. Do not clear generic placeholder values or create
value-specific parts until that choice is within the user's scope. An unanswered
generic-symbol preference need not block independently verified orderable parts.

Type-template design is a separate task. Do not redesign templates, recategorize
components, or apply the migration skill's retired-alias cleanup to a live library
merely to add purchasing metadata. If local binary normalization is actually
needed, use altium-library-migrate and its existing tested code rather than
copying its parser or consolidation engine into this skill.
