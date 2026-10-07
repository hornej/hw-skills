# Programmatic PCB rule updates

Use for an authorized change to rules in a saved `.PcbDoc`. A native Altium API,
rule import, or a verified file adapter can provide the update. Lack of a live
Altium API does not by itself rule out editing the saved file. The bundled
`native_inventory.py` helper is read-only; it does not implement this procedure.

## Select the editing path

Inspect the available engine and target document before promising a direct edit.
Record the engine version or source revision. Read support does not imply write
support, and the repository's tested inventory dependency is not a promise that
every internal writer API is present or qualified. Do not install or upgrade an
engine merely to assume those capabilities.

For classic PCB rules, an engine such as Altium Monkey may expose the compound
file streams, `Rules6` records, and a container writer. For Constraint Manager
projects, establish the authoritative constraint storage first; changing
`Rules6` alone may not update the effective constraints. If the file format or
round-trip preservation cannot be established, prepare a native import instead.

## Protect the current revision

- Establish whether the target PCB has unsaved editor changes. Before external
  replacement, save and close that document or use a verified native reload
  workflow that cannot overwrite either version. Ask only for missing editor
  state; an existing authorization to edit does not need a second approval.
- Use the latest saved source, even if it is newer than the review. Preserve a
  complete PCB backup, its SHA-256, and the complete original rule records/raw
  streams. A fabrication-oriented CAM `.RUL` summary may omit scopes and other
  fields; it is not necessarily a complete restorable rule export.
- Describe the exact rule changes, expected count, priorities, and required
  classes/pairs before applying. Preserve unrelated rules and current user edits.

## Build and verify a candidate

Prefer a change limited to the rule storage over reserializing all board
geometry. In the classic-rule format supported by compatible parsers,
`Rules6/Data` records contain a two-byte type leader, a four-byte payload length,
and a text payload; `Rules6/Header` contains the rule count. Validate that
structure against the actual input, consume the complete stream, and reject
unexplained trailing data.
Keep existing type leaders and unknown fields; derive a new rule from the same
verified rule type rather than guessing its binary discriminator.

With a compatible Altium Monkey engine, inspect these APIs before using them:
`AltiumPcbDoc._iter_rules6_records`, `AltiumOleFile`, and
`AltiumOleWriter.fromOleFile` / `editEntry` / `write`. The first is an internal
API. A same-size stream modifier cannot handle a larger rule record or added
rule; use a container writer that preserves the other streams and storages.
Do not pad or truncate unrelated data to force the update to fit.

Write the candidate to a separate file, then verify:

- Complete stream membership is preserved. Only the expected rule data and
  count/header streams change; all non-rule stream payloads compare byte for
  byte. Retain required container identity/metadata and storage structure.
- Every untouched rule payload is unchanged. Edited rules preserve fields
  outside the requested change; new names and unique IDs do not collide.
- Header count, fully parsed record count, and intended count agree. Reopen with
  the PCB parser and, when available, an independent compound-file reader.
- Rule types, enabled flags, scopes, priorities, units and mode flags read back
  correctly. Where rule sets are present, verify intended set membership and
  that the containing set is enabled; an enabled rule in a disabled set is not
  effective. Resolve required pair/class membership against the candidate and
  check the relevant Batch DRC configuration without weakening other checks.

For a length-based **within-pair** rule, these native fields express the intended
mode when supported by the inspected format:

| Field | Setting |
| --- | --- |
| `RULEKIND` | `MatchedLengths` |
| `SCOPE1EXPRESSION` | A query selecting the verified pairs or pair class |
| `TOLERANCE` | The justified project budget with explicit units |
| `CHECKNETSINDIFFPAIR` | `TRUE` |
| `CHECKDIFFPAIRVSDIFFPAIR`, `CHECKOTHERS`, `CHECKXSIGNALS` | `FALSE` |
| `USEDELAYUNITS` | `FALSE` for a length budget |

Preserve priority ordering or deliberately insert the new rule where its scope
requires it. For most rule types, the highest-priority applicable rule wins.
Matched Length rules are an exception: multiple applicable rules are enforced
together. Inspect every overlapping matched-length scope and budget; changing
priority does not mask another matching constraint. See
[Altium's rule-priority behavior](https://www.altium.com/documentation/altium-designer/pcb/defining-scoping-managing-design-rules#rule-priority)
and [length-tuning modes](https://www.altium.com/documentation/altium-designer/pcb/high-speed-design/length-tuning).

## Apply and hand back

Recheck the working file hash immediately before replacement. If it differs
from the backed-up source, stop that replacement and reconcile the new revision;
do not overwrite it with a candidate based on old geometry. Use an atomic
same-directory replacement where supported, then read and hash the actual
working file and compare it with the verified candidate. Keep the backup.

Report whether the change was prepared or applied, the changed rule settings,
preservation checks, and any expected newly exposed violations. An offline
length calculation may predict a violation but is not native DRC; account for
arcs, pad/barrel contributions and external segments or state their exclusions.

Reopen in Altium, verify effective rules, and run the affected native checks;
run full DRC when assessing release readiness. If native validation is unavailable,
state that the saved-file edit is verified and native acceptance/DRC is pending.
Do not call an older DRC report current or silently relax a new constraint to
make the existing routing pass. Preserve the distinction between rule changes,
routing changes, and regenerated manufacturing outputs.
