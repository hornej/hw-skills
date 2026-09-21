# Arena item numbers in Altium

Read this for Arena-to-managed-library matching, IPN updates, or a follow-up
creation list. General execution, credentials, lifecycle settings, and provider
checks remain in [synchronization](synchronization.md).

## Identity and field convention

Confirm whether the project uses **IPN** for the Arena item number. If so, keep
its exact text, including leading zeros, and map it as a Text revision parameter.
IPN is neither MPN nor Supplier/SPN, and it does not replace Altium's stable Item
ID or Revision ID.
An Arena revision is separate from the item number; do not append it to IPN.
Preserve an existing IPN and report a conflict when the proposed Arena number
differs; an identical value is already applied and should be omitted from writes.

Keep identity and sourcing approval distinct. Follow the project's policy for
linking verified manufacturer/MPN associations with unapproved or reference-only
sources; do not promote one project's allowance to a universal rule. Assigning
IPN does not approve sourcing, change lifecycle state, or establish build use.
A blank In Use field is not evidence of no build usage.

One Arena item may have multiple manufacturer identities. Conversely,
several Altium symbol variants can legitimately receive the same IPN. Do not
enforce global IPN uniqueness, merge Altium components, or use IPN as the lookup
key for a run intended to populate missing IPNs.

## Build a match plan without requiring a full-library export

- Start with the Arena item number and its associated manufacturer/MPN records.
  Preserve the item's revision/phase, source status, row relationship, and source
  date. Exports can contain continuation rows for sourcing, so do not treat every
  row as a separate Arena item or discard the alternate approved identities.
- Separate manufacturer MPNs from distributor ordering codes even if the source
  export labels a distributor such as DigiKey as a manufacturer. Keep Supplier
  and SPN evidence in their own role; do not force a manufacturer match from it.
- Match exact MFR+MPN to current Altium records. Preserve raw strings and meaningful
  suffixes. Manufacturer label variants such as a short name versus a legal name
  require recorded alias evidence; they do not justify rewriting live MFR labels.
  Name/MPN contradictions, multiple possible Arena numbers, and missing MFR
  require identity review. Preserve reference-only or unapproved sourcing as
  provenance and apply the project's sourcing policy separately.
- Identical MPN text can belong to different manufacturers; matching text alone
  does not establish a manufacturer alias. Scope acquisition/rebranding evidence
  to the relevant part or product line, and keep an approved distributor record
  separate from manufacturer identity even when a reference record supplies the likely manufacturer.
- A dated Altium export can generate candidates but cannot prove current absence
  or target-key uniqueness. Search candidate MPNs/Names or verified keys in the
  current Workspace and read the exact Item ID, revision, expanded parameters,
  models, and Part Choices before writing.
- If a broad Explorer export repeatedly stalls, switch to focused candidate
  searches/readbacks; do not keep requiring another full export or type-by-type
  export merely to enrich a small set. A grid filter only affects its visible
  scope, and a column filter's history is not a global search-expression editor.
- Exclude component templates and other non-component records by verified content
  type/identity. Do not assume a saved search name or a selected parent folder
  guarantees the result type. An IPN-is-present filter cannot find components that
  still need their first IPN assigned; start from Arena manufacturer identities.

Record exact expected Altium Item IDs separately from the actual supported sync
lookup field. Do not substitute a source-library identifier that happens to look
like a managed CMP ID.

## Select and verify the lookup key

Name may work when the unchanged exact Name resolves to exactly one current
Workspace component. Uniqueness within the CSV, a category folder, or the earlier
export is insufficient. Read the found Item ID and MFR/MPN before accepting it.

For a duplicate Name, an existing **LibraryKey** parameter can be an alternative
when supported by the target Workspace's synchronization configuration. Verify
its exact current value resolves to the intended single item across the
Workspace. Split such rows into their own source/config;
keep the Name and LibraryKey values unchanged and set KeyParameter to LibraryKey.
Do not invent a new key or use an unverified Item ID mapping as a workaround.
Pilot a changed lookup method when its behavior is not yet established.

When a duplicate-Name component has no LibraryKey, an existing **MPN** can be a
key only if the exact unchanged primary MPN is globally unique in the current
Workspace. Search results can include partial strings and alternate Part Choices;
inspect the target's actual MPN and manufacturer. Pilot the alternate key and
verify same-name neighbors remain unchanged; success with one part does not
establish MPN uniqueness for other parts or manufacturers.

Use the native-generated config and inspect all mappings. For an IPN-only
update, map IPN and any unchanged lookup fields required by the supported
configuration; skip unrelated Description and model writes. Check for automatic
Description-from-Name or blank Symbol Name mappings before execution. Preserve
Part Choices and lifecycle according to the authorized scope, and pilot those
settings in the target Workspace; a copied configuration is not proof of behavior.

An unmatched row may create an unintended item, so stop if the current key no
longer resolves to exactly the planned component. Re-read after changes or delays
that could invalidate a match. On success, verify the expected existing Item ID,
new revision and IPN, preserve unrelated data, and check same-name neighbors for
a LibraryKey pilot. Never rerun a completed batch to refresh a view.

## Handoff: library, placed design, and creation candidates

Track electrical metadata discrepancies separately from IPN identity. Before
technical corrections or creating parts, apply the [rating-consistency review](power-ratings.md)
to power/name conflicts; an exact MPN with an IPN can still have incomplete or
inconsistent engineering metadata. Keep unresolved findings in the creation
checklist without treating sourcing approval as specification verification.

State which layer was updated. A verified managed-library revision does not mean
the schematic, PCB, or exported BOM has been updated. For a project follow-up,
identify designator, source sheet, saved managed revision, verified target
revision and IPN. Review the native component-update changes before applying
them: intermediate revisions may contain changes beyond IPN. Preserve placement,
models, pin mapping, design-specific parameters, variant overrides, and fit state.
After an authorized design update, check saved sources and regenerated BOM
output; do not declare it complete from the library readback alone. The companion
altium-design-review skill covers project/variant evidence.

Keep unresolved existing-component matches separate from possible new components.
Before creating a candidate, search the current library by every relevant verified
MPN and inspect alternatives/Part Choices. An old snapshot with no primary-MPN
match is a candidate list, not a confirmed-missing list. Once absence and identity
are established, include the IPN in the new component together with its verified
MFR/MPN, symbol, footprint, and Part Choice. An IPN alone does not establish the
engineering definition. User intent to create missing parts does not imply that
all mechanical items, assemblies, or documents need ECAD components.
