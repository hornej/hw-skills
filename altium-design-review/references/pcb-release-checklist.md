# PCB Release Checklist

Use this before releasing an Altium PCB for fabrication or assembly. Duplicate it
for each release and keep the completed record with the project. Keep the master
unchecked. Received-board testing belongs in a separate bring-up checklist.

For each item, record **Done / N/A / Open**, plus a short evidence reference or
reason. Check the box only for Done; write N/A with its reason explicitly. An
accepted exception needs its exact scope, reason and accepting person recorded;
it is not a clean pass.

**Who checks:** **C** = Codex can verify saved files, reports or supplied evidence.
**D** = designer checks in Altium, mechanical CAD or the supplier preview.
**C+D** = Codex can audit the evidence, with designer confirmation where needed.
These tags describe capability, not permission to edit or a promise of automation.
Missing tools or evidence leave an applicable item Open.

## Release record

Record: project/PCB; PCB revision; assembly revision and variant(s), or base build;
Altium version; fab/assembler; build quantity; source snapshot/commit and file hashes;
OutJob(s); validation-report paths; reviewer/date; exceptions; package location.
Use the project's own revision scheme when PCB and assembly revisions are shared.

Companion: [OutputJobs and Manufacturing Files](outputjobs-manufacturing-files.md).

## 1. Confirm the design and build

- [ ] **C+D — Build identity:** Confirm the project, board revision, build quantity and intended assembly variant(s), or explicitly select the base build.
- [ ] **C+D — Variants:** Check fitted/DNP parts, alternates and parameter overrides. Distinguish never fitted, fitted by the assembler and fitted later in house.
- [ ] **C+D — Revision encoding, if used:** Update revision resistors/jumpers in every released variant; verify the resulting code against the firmware decoding table.
- [ ] **D — Schematic validation:** Validate/compile the project using the installed Altium workflow. Resolve errors; review warnings, No ERC directives and suppressed checks. Retain the result.
- [ ] **C+D — Schematic/PCB agreement:** Resolve unintended ECO differences and component-link mismatches. Review intentional exclusions, including manually maintained rooms.
- [ ] **C+D — Parts:** Verify exact MFR/MPN, values, ratings, footprints, pin mapping and approved substitutions. Resolve sourcing blockers for the intended quantity; date any stock check.

## 2. Finish the PCB

- [ ] **D — Mechanical fit:** Check outline/cutouts, holes, connector mating and orientation, component heights, enclosure, fasteners and assembly/tool access. Missing or inaccurate 3D models leave those clearances unverified.
- [ ] **D — Unused pad shapes:** Review/remove unused layer shapes where appropriate for the design and fab process. Preserve required connections, outer-layer lands and specified annular rings.
- [ ] **D — Teardrops, if used:** Add or update them after routing changes and inspect affected pads/vias. Do not make teardrops a universal requirement.
- [ ] **C+D — Fabrication details:** Check stackup, impedance targets/tolerances, copper weights, drill spans, slots, via treatment, edge contacts and mask/paste settings against the selected process.
- [ ] **D — Ground stitching vias:** Verify adequate stitching between intended same-net ground pours/planes; add vias where missing. Respect antenna, isolation and other keepouts; verify actual connections after repour.
- [ ] **C+D — High-speed layer transitions:** Verify nearby ground return connections between the relevant ground reference planes; add return vias where missing and preserve differential-pair symmetry. Check reference continuity at each transition; review transitions between different reference nets separately.
- [ ] **D — Final copper:** Repour polygons after copper/pad/via/teardrop changes. Inspect thermal connections, disconnected copper and return paths relevant to the design.

Altium provides tools for [unused pad shapes and teardrops](https://www.altium.com/documentation/altium-designer/pcb/removing-unused-pads-adding-teardrops).
Choose their scope deliberately; rerun the affected checks after using them.

For return-via placement, follow the interface/device layout guidance and actual
stackup; see [TI's ground-stitching example](https://www.ti.com/document-viewer/lit/html/SLLA653/GUID-A4F1CD83-9D39-45B1-B7A5-0E03429E4305).
Do not treat one device's spacing recommendation as a universal limit.

## 3. Finish identification and silkscreen

- [ ] **C+D — Board identification:** Update board name, PCB revision and any product/date-code markings. Distinguish a design-release date from a production date code.
- [ ] **D — Functional markings:** Check pin 1, polarity, connector orientation, voltage, switch/jumper functions and useful test-point labels; confirm they remain readable after assembly.
- [ ] **D — Silkscreen preparation:** Where available, run Tools > Silkscreen Preparation with the intended rules/settings; otherwise finish manually. Inspect moved/clipped text and outlines before accepting the result.

The [Silkscreen Preparation tool](https://www.altium.com/documentation/altium-designer/pcb/preparing-silkscreen)
can move text and clip graphics. Its availability depends on the installed version
and feature set. Always inspect the final artwork, including resolved special strings.

## 4. Verify the final design

- [ ] **C+D — Rule intent:** Check constraints, enabled state and priorities against the circuit and fab capabilities; identify overly broad exceptions and duplicate or obsolete rules.
- [ ] **C+D — Rule scopes:** Verify each relevant query selects the intended objects. Check exact class/room names, membership, differential-pair polarity and complete xSignal endpoints/series crossings.
- [ ] **D — DRC coverage:** In Rules to Check, enable Batch checking for all applicable rule types. Review disabled checks and waivers; verify the report actually lists the expected checks.
- [ ] **D — Final full DRC:** Run after final copper, pad, via, teardrop and silkscreen edits. Resolve violations or record accepted exceptions. An aborted/capped report is incomplete.
- [ ] **C — Evidence:** Retain schematic-validation and full DRC results tied to the source snapshot. Distinguish native checks from file-parser checks and targeted DRC from full-board DRC.

Use [Batch DRC before final artwork](https://www.altium.com/documentation/altium-designer/pcb/drc/setting-up-running).
A zero count does not prove that a query matched anything. If DRC/ERC is generated
through an OutJob, check that job's validation configuration too; see the companion guide.

## 5. Generate and inspect the release

- [ ] **C+D — Stable source:** Save all relevant documents and generate from one identified source snapshot. Resolve unsaved changes before treating on-disk files as final.
- [ ] **C+D — OutputJob:** Check source documents, variant choices, enabled generators, output containers, filenames and destinations. Generate every required container.
- [ ] **C+D — BOM/PnP:** Reconcile physical references, quantities, MPNs, footprints and fitting state. Check coordinates, units, origin, side and rotation; explain intentional BOM/PnP differences.
- [ ] **C+D — CAM review:** Open the exported data and inspect copper/layer order, outline, drills/slots, mask, paste and silkscreen. Check drill/copper alignment and avoid unintended mirroring.
- [ ] **C+D — Drawings and supplier preview:** Verify fabrication notes, stackup/impedance requirements and required assembly views. Confirm imported parts, DNPs, polarity and orientation when using a supplier portal.
- [ ] **C — Package:** Include only current, intended deliverables. Archive sources, OutJobs, reports and a relative-path/SHA-256 manifest; distinguish internal archive files from the supplier upload.
- [ ] **D — Release:** Confirm all applicable items are Done or explicitly dispositioned; record the exact revision, variant and package issued. Leave unresolved work visible.

Any later source change invalidates the affected results: rerun the relevant
validation and regenerate/review affected outputs. Do not fix only an exported
BOM or drawing while leaving its source inconsistent.

## Handoff

Report what Codex completed with evidence, what the designer still needs to do,
and any pending engineering decisions. Name the exact object, setting or file for
each remaining action. Keep routine checklist execution in the release record;
use the project's task tracker for actionable unresolved work when requested.
