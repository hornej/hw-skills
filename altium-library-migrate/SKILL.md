---
name: altium-library-migrate
description: Discover, normalize, audit, and consolidate local Altium SchLib/PcbLib libraries for Library Importer, with canonical metadata and preserved symbol variants. Use for repeatable library migration and exported lmcfg normalization.
---

# Altium library migration

For metadata changes to components already stored in an Altium 365 Workspace,
use the companion altium-365-library-maintain skill when available. Migration
ends at staging/import; maintenance updates existing item revisions and verifies
live fields, links, models, and lifecycle state. Library Importer is not an
in-place updater. If the user chooses to replace an unused imported batch,
prepare a fresh package and an exact cleanup scope as described in
[replacement imports](references/replacement-import.md). Existing authorization
and the user's preference to perform UI steps carry forward.

Use the bundled offline runner for repeatable analysis and generation. Read
[the operating workflow](references/workflow.md) for commands and importer steps.
Use the existing tested Python environment when available; do not silently
upgrade the binary engine during a migration.

For DigiKey enrichment before import, use the shared
[API guide](../digikey-part-selection/references/api.md) and
[credential locations](../digikey-part-selection/references/credentials.md).
Use digikey-part-selection when the task is choosing new parts rather than
filling verified metadata for existing identities.

- Start with the user's selected project roots. Discover recursively; inspect
  excluded directories and content-duplicate provenance. Generated directories
  carry a marker and are excluded from subsequent discovery.
- Use the reusable defaults without inventing rules per project. Canonical
  authority is MFR, MPN, Supplier, SPN, and Comment. Legacy aliases are retired
  in staging with owner-index and simple-reference repair. Missing values stay
  missing; source conflicts are reported.
- Preserve logical ComponentType independently of a Workspace fallback.
  CONN designators are Connectors; MP mounting hardware is Mechanical.
  Unknown categories, missing/ambiguous models, incompatible pin maps, and
  parse/round-trip failures require resolution before consolidated generation.
- Run analyze first. Inspect audit.json, especially missing metadata, exclusions,
  duplicate MPNs, symbol variants, model decisions, and unreferenced footprints.
  Build performs the same preflight and saves new staged binaries. Use a fresh
  output path for each run; neither command overwrites inputs or existing output.
- Consolidate by normalized MFR+MPN, then a coherent Supplier+SPN. Without either,
  the default name identity is scoped to its source library. Keep differing
  electrical/rendered symbols separate. Union footprint implementations only
  within an exact symbol variant with compatible explicit pin maps.
- For exceptions, read [the profile schema](references/rules.md). Put approved
  exclusions, corrections and model choices in a profile. Do not put project
  policies into Altium Monkey or general defaults. Keep project profiles with
  their source libraries; apply only the profile selected for this migration.
- Normalize an Altium-exported lmcfg for the target Workspace using the
  consolidated manifest. Preserve type/template/lifecycle/revision metadata.
  Check Name, Comment and Description independently in the import preview;
  formatting Comment alone does not change Name. See the
  [metadata preparation rules](references/metadata-preparation.md) for naming,
  catalog descriptions, typed parameters, the current DNP policy, and changes
  to an already validated staging package. Keep useful extra parameters and
  alternate Part Choices when consolidating legacy field names.
  Review component, symbol, and footprint Names separately after native model
  deduplication. Component Name mapping does not establish model Names. When
  readable symbol names are requested, replace opaque source labels deliberately;
  shared symbols need generic function names with meaningful variant qualifiers.
  Do not declare naming ready without checking actual model labels in Altium.
  Footprint filename suffixing preserves collisions; it does not prove semantic
  deduplication. Audit candidates without discarding model alternatives.
  Never fabricate Workspace GUIDs or claim local checks prove permissions.
  A fallback keeps the logical split key and copies existing target type/template
  settings; a missing target needs an Altium export.
- These scripts have no Workspace connection, import, release, or deletion
  operation. Perform Workspace mutations only within the user's authorized
  scope, after review and Altium Refresh/Validate. Do not infer that generating
  migration files authorizes importing them, or ask again when import is already
  authorized. When the user handles Altium, deliver the files and exact steps.

Read [validation](references/validation.md) for the portable test suite and
known limits. Some preservation mechanics use internal engine APIs; verify an
engine upgrade against generated fixtures and the selected project before use.
Keep project binaries, inventories, credentials, and run histories outside the
skill repository.
