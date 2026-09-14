---
name: altium-365-library-maintain
description: Maintain existing Altium 365 components, models, templates, and metadata; diagnose library validation and save failures. Use after import for naming, model organization, parameter cleanup, enrichment, and verified synchronization. Local SchLib/PcbLib consolidation belongs to altium-library-migrate.
---

# Altium 365 library maintenance

Maintain existing managed components in the user's selected Workspace. A CSV
and a Components Synchronization Configuration (.CmpSync) are update inputs;
the component library remains managed in Altium 365.

## Select the workflow

- Establish the Workspace and requested fields from the session. Prefer an
  available, documented API or connector with the needed capability. Otherwise
  use Custom Data Synchronization for repeatable metadata changes. Use the
  component editor when required behavior has not been established through
  synchronization. Read [synchronization](references/synchronization.md) for
  configuration, execution, permissions, and verification.
- For Name/Description or other grid edits, use the
  [batch-editor workflow](references/batch-editing.md). When the user prefers
  operating Altium, prepare the data and instructions instead of UI automation.
- For required values, DNPs, duplicate template entries, or default component
  folders/models, read [templates](references/templates.md). Retain additional
  component parameters unless their removal is part of the requested cleanup.
- For symbol/footprint Names, model folders, or duplicate models, read
  [model maintenance](references/model-maintenance.md). Component batch editing
  and .CmpSync are not established bulk model editors. Keep model Names separate
  from component Names and stable Item IDs; assess every shared model's users.
  That reference also covers schematic designator fonts and placement overrides.
- For failed validation or an apparently hung library save, read
  [save troubleshooting](references/save-troubleshooting.md) before recommending
  a restart. Distinguish a blocked model revision, hidden dialog, and incomplete
  release from a confirmed crash.
- If the user chooses to replace a confirmed-unused import, use the companion
  altium-library-migrate skill's replacement workflow. This creates new items
  and requires an exact old-batch cleanup scope; it is not ordinary maintenance.
- Read [metadata rules](references/metadata.md) when matching catalog records or
  preparing links, purchasing fields, or passive Value parameters. Keep reusable
  rules separate from Workspace-specific choices and unresolved identities.
- For DigiKey enrichment, use the shared [API guide](../digikey-part-selection/references/api.md)
  and [credential locations](../digikey-part-selection/references/credentials.md).
  Selecting a new part from circuit requirements belongs to digikey-part-selection;
  enrichment starts with an already identified part.

## Prepare and apply changes

1. Record current item IDs, revision IDs, names, types, fields, links, models,
   Part Choices, and lifecycle states for the intended scope. Reuse trustworthy
   exports/import records for the audit, but refresh affected records before
   applying changes. A unique source key must also match exactly one live item;
   never rely on names or MPNs being globally unique.
2. Build an explicit before/after plan with evidence for each changed value.
   Separate ready records, already verified results, ambiguous identities,
   missing facts, and non-orderable primitives. Do not fill blanks merely to
   satisfy a coverage count. Omit unchanged or out-of-scope fields from writes;
   a mapped blank can clear an existing value.
3. Keep native DigiKey links distinct from ordinary parameters and Part Choices.
   Preserve unrelated links, models, supplier pairs, type/template assignments,
   and lifecycle behavior unless the requested task changes them.
4. Use a representative pilot when a write path or mapping is unproven. Existing
   user authorization carries forward; do not ask again for the same scope.
   Resolve a material lifecycle or identity choice before dependent writes.
   A one-item lifecycle exception does not authorize changing the whole batch.
5. Read server logs and verify the live result before extending the batch.
   Reconcile partial writes before retrying: a repeated run may create another
   revision. Record successful item/revision pairs and exclude them from pending
   updates. On an unidentified server error, hold dependent bulk writes while
   continuing useful offline preparation.

## Offline helpers

scripts/sync_artifacts.py uses the Python 3.10+ standard library only. It can
prepare an isolated UTF-8 CSV/schema and source-hash manifest, or summarize a
single invocation's server log. It does not contact Altium, verify catalog
identity, validate Workspace matches, or execute a synchronization. Commands and
input format are in [synchronization](references/synchronization.md).

Keep authenticated .CmpSync files and raw execution logs outside the skill
repository. Configuration files can contain refresh tokens. Prepare sanitized
review copies explicitly; do not assume a file is safe because it is JSON.
Store run data and catalogs in the user's project, not in this reusable skill.
