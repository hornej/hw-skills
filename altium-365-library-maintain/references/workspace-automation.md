# Programmatic Workspace automation

Use this workflow for repeated component inspection, deduplication and native
readback. Prefer structured evidence over a screenshot after every action.
Keep the selected Workspace, immutable input inventory, exact revision IDs,
private evidence and operation journal together in the project.

## Choose the evidence for the claim

| Question | Preferred evidence | Limit |
| --- | --- | --- |
| Which records exist? | Authenticated Workspace query/export with revision IDs, pagination and capture time | Search results and local caches can be filtered, stale or incomplete. |
| Which live panel/control is available? | Dynamic native discovery and scoped UIA query | A handle or caption alone does not establish Workspace identity. |
| What does the loaded component contain? | GUID-validated native definition, parameters, actual model links and Part Choices | An editor cache can contain unsaved data; it is not release confirmation. |
| Are models equivalent? | Exact released model revision payloads; parsed pins, pads and other relevant primitives | Matching previews or geometry hashes alone do not prove component equivalence. |
| Did a lifecycle change persist? | Refresh/requery, then exact revision/state readback; history where needed | Reading already loaded rows proves only their current displayed values. |
| Does the result look right? | A representative native visual check | Images do not prove hidden pin maps, supplier identities or complete fields. |

Use a documented API/connector when it exposes the required operation and is
available to the current account. Altium's [365 API quick start](https://www.altium.com/documentation/altium-developer-center/quick-starts/365-api)
describes a closed beta as of November 8, 2026; verify access before planning
around it. Altium Monkey can inspect saved native files. Neither a file parser
nor a desktop bridge is itself a general Workspace write API. For supported
metadata updates, consider [synchronization](synchronization.md).

The cache and UIA details below are observations from English Altium Designer
Professional 26.11.1, not a supported cache schema contract. Qualify them again
when the version, schema, panel layout or relevant control behavior changes.

## Establish a bounded native operation

1. Record process identity, Workspace, input desktop, open documents, dirty
   state, query/filter and intended exact revision roster. Discover panel hosts
   with [native readback](native-readback.md); do not reuse saved HWNDs blindly.
2. Give one controller ownership of native input. When agents are requested,
   parallelize immutable inventory/model analysis; send native acquisition and
   writes through that controller. A read-only comparison agent needs no cursor.
3. Pilot one small cohort. Confirm every selected row by Item ID and Revision,
   every opened definition by GUID, and every resulting state by exact revision.
   Name, MPN and row position are not unique identifiers.
4. Poll a bounded postcondition after each action. A successful Invoke, click or
   scroll response does not establish that Altium acted. If a timeout follows a
   possible write, reconcile the actual result before retrying.
5. Close only clean documents created by the operation, and restore its prior
   query/view when appropriate. Preserve pre-existing editors and user changes.
   An unexpected dialog or dirty document stops dependent operations; retain
   its identity/error and continue independent offline work.

Use screenshots for a new or ambiguous UI route, visual/model review, an error,
or an occasional representative result. Once a route is qualified, use scoped
UIA values, exact row identities and saved-file evidence for routine checks.
Keep timing for each stage rather than treating image count as verification.

Observe screen-saver and input-desktop state before input. A locked desktop is
not evidence that Altium needs elevation. Any temporary workstation setting
change needs the project's existing authorization, a recorded original value,
one owner and restoration when coordinated native work ends. Read-only panel
helpers do not make those changes.

## UIA details that affect correctness

- Locate a specific control under the discovered WPF host first. Whole-window
  enumeration and all-match searches may cost much more. A first-match lookup
  does not prove uniqueness; require a unique match for ambiguous targets.
- In the tested Components grid, select the parent DataItem row using its
  SelectionItemPattern. Cell patterns can refer to a different container.
  Confirm the row's selection container is the intended grid and reread visible
  selected DataItem identities. The tested grid has no container SelectionPattern
  for a global selection read. Reconcile the complete opened XML roster
  independently, especially after paging. A highlighted cell is insufficient.
- Display Item ID and Revision columns and validate headers before reading their
  indices. Grid RowCount can describe realized rows rather than all search
  results. Track actual revision IDs and changed viewport boundaries when paging.
- A blank terminal DataItem was observed as a footer. Exclude only its qualified
  structural signature; do not silently discard arbitrary rows with missing IDs.
- Menu/dialog creation can be asynchronous. Poll for the exact expected control.
  If UIA Invoke has no effect, a physical click can use a freshly verified,
  visible control rectangle under the controller's foreground guard. Focusing
  a popup can dismiss it; always verify the intended postcondition.
- Multiple selected components can open one aggregate editor or several editors
  depending on their templates. Record the actual opened documents. Do not infer
  the cohort from tab labels or the number of tabs.

## Read native definitions without trusting cache labels

Read cache databases without modifying them; use a consistent database backup
for analysis rather than copying an active database without its journal state.
Record capture time, source identity and hashes. Missing cache data remains
unknown until acquired; cache coverage is separate from inventory coverage.

For each native component definition:

- Match the Workspace/Vault, Item GUID, Revision GUID and human-readable revision
  ID against the pinned component graph and exact requested roster. Require each
  requested definition once, no extras, and no unaccounted edited state.
- For the tested VaultEditCache acquisition, require clean `Revision.Info` flags
  `Modified=False` and `LocalEditsOnly=False`, the original `FullDocumentPath`,
  the pinned Vault and a byte-stable definition/Info pair. Correlate those files
  with the newly opened editor; hashes alone do not establish editor ownership.
- Treat filenames and `Revision.Info` display labels as hints. A tested split
  batch retained the first selected component's label on a different definition.
  Its XML GUIDs remained distinct. Preserve the discrepancy in the evidence.
- In aggregate files, ItemGUID and RevisionGUID lists can have different orders.
  Validate their sets separately; pair identities through the actual XML
  definitions and revision graph. Never zip the two lists by position.
- Follow each `TComponentDefinition`'s actual `ModelChoices` references. Template
  `DefaultModelLinks` describe defaults, not necessarily the assigned models.
  Retain alternative footprints, multiplicity, ordering and default indices.
- Freeze a stable capture, hash it and compare offline. Confirm fresh Workspace
  state separately before a mutation; a clean cache file is not a live-server
  freshness guarantee.

A template/default-model error during acquisition does not establish that the
actual component models are absent. Record the warning and compare the assigned
links explicitly. Do not silently repair a template as part of a read operation.

## Model, pin-map and Part Choice comparisons

Keep byte equality, narrowly normalized equality and geometry equivalence as
separate evidence levels. A normalized signature must identify exactly which
fields were excluded and why. Preserve all other streams, unknown fields,
graphics, pins, pads, 3D data and model alternatives. Test both known equivalent
models and adverse examples before extending a normalization rule. Excluding
source GUIDs can establish geometry equivalence without establishing component
interchangeability.

For pin mapping, inspect both cached link representations when present:
`ItemRevisionLinks.Data.Footprint.PinMapAsString` and the `LinkParameters` entry
whose `HRID` is `MapAsString` (read its `ParameterValue`). The selected PCBLIB
`TModelChoice/MapAsString` in CmpLib provides another readback. A Data-only map is
still explicit. Conflicts, a present JSON null or literal `(null)` require review;
do not equate them with absence. Preserve grouped pins and unknown syntax; a
datasheet link's map field can use a different grammar.

Altium documents the default correspondence by matching pin/pad designators in
[single component editing](https://www.altium.com/documentation/altium-designer/components-libraries/single-component-editing).
The absence of an explicit map is insufficient: check that every actual symbol
pin resolves to an actual pad in every selected footprint. A tested default map
displayed plausible labels even though the footprint's pad labels differed.
Report extra or mechanical pads separately rather than dropping them.

For Part Choices, compare the complete current list: source, source part ID,
manufacturer ordering code, type, rank, multiplicity and subpart relationships.
Retain unresolved choices. Supplier offer counts can change independently of
product identity; a manufacturer display alias alone is not a different product.
Association GUIDs belong to the component association and need not match across
components referring to the same source product.

`OriginalPartChoiceListLoaded=false` did not, by itself, make the current list
incomplete in a qualified positive aggregate control. Conversely, an empty list
must not be accepted as proof of no choices without a qualified empty control
for that acquisition mode. The aggregate-empty case remains unqualified here.
Do not enable a different Part Choice revision-control mode merely to make
automation easier. A disabled multi-selection Part Choices command does not
prove that individual records have no choices.

## Deduplication and resumable execution

Candidate grouping is screening. Keep exact-name matches across different
description/footprint signatures in the queue, and never group all missing MPNs
together. Compare a proposed keeper with each candidate for identity, all
populated parameters, model alternatives, pin mapping, Part Choices, attachments,
and usage. A parameter superset is directional evidence, not permission to
discard a conflicting populated value. No reported server usage does not prove
absence from every external or offline design.

Use the user's chosen reversible lifecycle state for verified duplicates only
after checking the Workspace's actual transitions and search filtering. A label
such as Superseded is not a universal guarantee of hiding or restorability.
Record candidate revision, keeper revision, reason and before/after evidence.
Keep ambiguous records unchanged with a specific review reason. Deletion and
removal of shared models are separate cleanup decisions.

Normalize the selected keeper to the project's template/parameter convention as
a separately recorded operation. For example, MFR/MPN cleanup must preserve
useful legacy values, purchasing choices and model links. Re-read the resulting
revision before dependent work; template changes can affect more than labels.

Use immutable evidence files and an append-only operation journal with explicit
planned, applied and verified outcomes. On synced directories, rapid replacement
of one progress file can encounter sharing violations; append and flush journal
events, then derive summaries. A pre-action logging failure stops that action.
Do not hide the original failure if recovery logging also fails.

On resume, reconcile journal entries with live state rather than replaying the
whole batch. Keep the inventory snapshot immutable and record later lifecycle
or metadata operations separately. Report inventory coverage, model/metadata
coverage, adjudicated groups, verified writes and unresolved groups separately.
An ETA should distinguish measured acquisition throughput from the unmeasured
time for conflicts, template corrections and lifecycle operations.

## Improve throughput from measurements

Measure the whole operation and its stages: query, selection, opening, data
read/validation, cleanup and restoration. Compare the same workload before and
after; include process startup in end-to-end timing. Interleave a few baseline
and optimized reads when practical, and compare output identities as well as
elapsed time. Keep failed attempts separate from completed timings.

First reduce broad UI traversals and repeated cross-process property requests.
Batch reads of properties under an already identified control with a fresh UIA
cache request; keep the scope and identity checks. Avoid retaining UI handles or
cached field values across mutations merely to improve timings. Reuse immutable
model comparisons by exact revision and payload hash, while refreshing mutable
Workspace state before a change. Data acquired for a prior revision does not
automatically qualify the current revision.

Use template grouping only when actual template identities and the available
selection route support it. The same part Name can span several templates and
open separate editors. Estimate savings from observed editor counts, not just
the number of selected rows. Prefer a documented direct command over repeated
menu navigation when it can be qualified with the same ownership, clean-state
and postcondition checks. A documented keybinding alone is insufficient. Altium
documents Ctrl+F4 as [closing the active document](https://www.altium.com/documentation/altium-designer/shortcut-keys),
but a native 26.11.1 pilot opened a global Save to Server dialog instead. The
cause was not established; no save was sent. The controller retained the
verified context-menu path. Requalify both installed bindings and input transport
before substituting a shortcut, prove the active document is an owned clean
editor, and verify exactly one intended document closed. Do not automatically
accept a save dialog or retry the key when the postcondition differs.
