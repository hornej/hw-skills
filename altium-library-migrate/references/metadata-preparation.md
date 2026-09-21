# Preparing display metadata without changing component identity

## Name, Comment and Description

Name is the human-readable Workspace label; Item ID is the Workspace identity.
Comment is a separate source parameter. Changing a SchLib Comment does not fix
Name when the importer still maps Name from Design Item ID. Inspect all three
display fields in the actual import preview before release. The normalizer's
`--name-from-comment` option is appropriate when the user wants that mapping;
do not impose it on a different naming convention.

Readable Names can repeat across manufacturers, exact MPNs or symbol variants.
Do not merge components, discard footprint alternatives, or append old IDs to
the requested label merely to make Names unique. Keep duplicate detection
enabled and distinguish shared labels from redundant components. A source CMP
identifier and a newly allocated Workspace CMP identifier can have the same
text while identifying different parts; keep those namespaces separate.

An optional display convention, to use only when the project adopts it:

- Resistors: size, resistance, tolerance, power, then existing extra qualifiers;
  for example `R0402 2.2k 1% 63mW`.
- Capacitors: size, capacitance, voltage, dielectric, tolerance, then extras;
  for example `C0402 10uF 100V X5R 10%`.
- Use decimal engineering notation (`2K2` -> `2.2k`, `4R7` -> `4.7`) without
  changing magnitude; preserve the distinction between m and M. The chosen
  whole-milliwatt display rounds 62.5mW to 63mW without changing precise ratings.
- Retain package suffixes, AC/DC conditions, pulse ratings and other meaningful
  qualifiers. Retain DNP labels, but apply the current template policy below
  rather than preserving obsolete numeric placeholders. Missing or invalid
  ratings do not justify guessing a value.

These are project preferences, not universal Altium requirements. Reuse the
project's tested formatter and audit when continuing that migration.

## Symbol and footprint Names are separate

Component Name, managed symbol Name, managed footprint Name, local library
reference, and Workspace Item ID are distinct fields. `--name-from-comment`
fixes the component mapping only. Do not claim that a `Symbol Name` parameter
mapping controls new model labels without verifying that behavior in the native
importer. A successful component-name preview does not prove correct model Names.

When readable symbol names are requested, replace inherited opaque source IDs.
For a symbol specific to one part, use its readable part/function name, retaining
meaningful pinout or geometry qualifiers. For symbols shared by many component
values, use generic names such as `Resistor` or `Capacitor`, qualified where
needed to distinguish variants. Do not name a shared capacitor symbol after
one capacitance, voltage, or package merely because that component supplied the
canonical source record. Keep distinct top/bottom-pad or other symbol variants.
Readable labels do not replace stable Workspace SYM IDs or revision identities.

Prepare a separate model-name plan keyed by source model identity and, after
import, exact managed Item ID. Review all members of each native reuse class
before choosing its shared name. Inspect actual new and reused model labels;
if the write path is unproven, report that naming remains unresolved. Capture
released model IDs and verify names after import. Repair existing managed models
through altium-365-library-maintain; changing a local SchLib does not rename
already released symbols.

Footprints need a separate duplicate audit. Same names, generated suffixes,
matching pad counts, or matching rendered images are candidate evidence only.
Compare pad numbers, complete geometry/layers, masks, pin mapping, and embedded
3D data before treating models as equivalent. Retain provenance and all allowed
footprint alternatives. A combine operation that suffixes filename collisions
may preserve every duplicate; do not describe it as geometry deduplication.

## Parameters and template preflight

Preserve existing internal part numbers as extra metadata. Confirm the project's
PLM-to-`IPN` mapping and store it as Text independently of MFR/MPN, Supplier/SPN
and Altium Item/revision IDs. Retain leading zeros; do not use IPN to merge symbol
variants or replace the migration's identity checks. Conflicting IPNs on candidate
duplicates need explicit resolution. When staging genuinely new Arena-backed
components, include a verified IPN from the start and check the current managed
library/Part Choices before creating another representation. For matching and
updates to existing managed components, use the maintenance skill's
[Arena workflow](../../altium-365-library-maintain/references/arena-ipn.md).
Record sourcing approval and build use separately from identity. Follow the
project's policy for unapproved/reference sources; IPN alone asserts neither.

Use current exported templates and inspect actual importer parameter types.
Formatting a SchLib value as 2.2k does not establish an Ohm-typed Workspace
parameter. Keep the requested units, validate representative nonempty values,
and preserve useful extra parameters. Mixed/range/conditional values that need
Text must not be coerced into an invented single number.

Establish the project's DNP policy before changing templates. Regular passive
templates with optional inapplicable numeric ratings are one option; separate
templates are a different organizational choice. Requiredness and unit type are
independent. Keep missing orderable-part ratings visible in the audit. For the
native template workflow and component/model folder distinction, read the
companion maintenance skill's
[template guidance](../../altium-365-library-maintain/references/templates.md).

MFR/MPN are the canonical primary manufacturer parameters. Numbered legacy
manufacturer/part-number pairs can contain genuine alternatives: preserve those
Part Choices before retiring aliases. Inspect mappings in each actual import
group; an All Libraries selection can omit parameters that differ by group.
Use the matching exported configuration, not a guessed global mapping.

## Description evidence

Use an exact manufacturer/MPN catalog match for detailed technical descriptions.
Record product URL, cache record, observation time and any substitutions. A
previously verified cached response can be reused; do not exhaust an API quota
re-fetching the same evidence. Stop on quota exhaustion and report remaining
coverage without inventing a reset time.

Compare prose with the final structured specifications and reviewed corrections.
Distributor descriptions may use extended-mode resistor power where the chosen
manufacturer specification uses standard mode. Keep both descriptions and
parameters consistent with the selected evidence. Do not copy Automotive/AEC
qualification or any other specification from the user's formatting example
onto unrelated parts. Country of origin requires explicit evidence; company
headquarters and distributor shipping location do not establish it.

Without an exact match, preserve useful source prose or assemble a description
from available, validated fields. Mark that basis separately from catalog-
verified data. Keep missing facts visible in the audit. Adding named DigiKey or
Mouser links does not require adding supplier part numbers when the user only
wants links. Keep unrelated links and Part Choices intact.

## Editing an already validated package

Use the latest validated SchLib/configuration as immutable input and write to
a fresh output directory. General enrichment/analyze scripts may reset earlier
proposals; inspect their behavior before rerunning them. Do not re-consolidate
or rewrite models for a Name/Description change.

For raw SchLib metadata edits, use the pinned parser/writer already tested for
the project. Component descriptions occur both in a component's record-1
ComponentDescription field and FileHeader.CompDescrN; update and verify both,
including legacy and UTF-8 representations. Preserve all other record bytes,
record order, OwnerIndex links, pins, symbol parts and model implementations.
Reopen every output stream and verify component count, footprint bindings,
multiple-footprint counts and unchanged model-file hashes.

Clear a legacy Source value only when requested, and skip its importer mapping
so a source filename is not reintroduced. Blanking the value and removing the
parameter definition are different operations. A template-owned required field
may need a template change; do not silently redesign templates.

Preserve prior native-validation fixes: unavailable optional source parameters
may require <Skip>; ESR ranges, frequency ranges and conditional AC/DC ratings
may require Text mappings. Retain all Part Choices and named-link mappings,
logical grouping, target types/templates and lifecycle/revision metadata. Never
fabricate missing Workspace GUIDs. An existing <Auto> template setting needs
review against the current Workspace before a replacement import.

Load the matching new SchLib and lmcfg together in a fresh importer session.
A configuration/source mismatch is not fixed by loading the new config over
an old source binary. Run Refresh/Validate in Altium; local binary checks do not
prove current template or Workspace acceptance.

Authoritative importer behavior:
[Importing Existing Libraries](https://www.altium.com/documentation/altium-designer/components-libraries/importing-existing-libraries-workspace).
