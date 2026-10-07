# OutputJobs and Manufacturing Files

Use this to configure and verify a release package for an Altium project. Start
with the [PCB Release Checklist](pcb-release-checklist.md). This is a setup guide;
it does not supply a universal .OutJob with guessed layer names or process values.

Supplier guidance checked **2026-10-06**. Recheck linked requirements for the
chosen service before each release. Board technology, assembly scope and the
supplier's agreed process determine which outputs are needed.

## Create or adapt the OutputJob

1. Add an Output Job File to the project, or adapt a known job. Reset each generator's Data Source to the intended project, PCB or drawing.
2. Set Variant Choice explicitly: one named variant for applicable outputs, or deliberate per-output selections. Use [No Variations] only for the intended base build.
3. Add the required generators and connect each to a Folder Structure or PDF container. A generator merely listed in the job is not proof it was generated.
4. Configure each generator and container. Give outputs stable names containing board/revision and, for assembly files, variant. Use a fresh release directory to avoid mixing old files.
5. Check the OutJob's own validation settings. Its ERC/DRC configuration can differ from checks configured elsewhere in Altium.
6. Save and generate every required container, then inspect its actual files and logs. Generating one container does not generate all other containers.

These are the native [Altium OutputJob concepts](https://www.altium.com/documentation/altium-designer/preparing-for-manufacture/output-jobs).
Menu labels/exporter availability vary by version. Record the version and use its
actual dialogs. Keep board-specific layer mapping, drill spans, impedance targets
and assembly decisions with the project.

## Recommended output set

The table is a starting point. Supply the chosen manufacturer's accepted package;
keep additional review evidence in the internal release archive.

| Output | Configure and verify |
| --- | --- |
| Gerber/accepted intelligent fabrication format | Include every intended copper layer, top/bottom mask and silkscreen, and a clearly identified outline/cutout layer. Use the supplier's accepted format. Include paste for stencil/assembly when required. |
| NC Drill/routing data | Include applicable plated/non-plated holes, slots and each blind/buried drill span. Check units, numeric format, origin and registration against copper. A drill drawing does not replace drill data. |
| Fabrication drawing PDF | Specify board revision, dimensions/tolerances, thickness, material/stackup, copper, finish and special processes. Include impedance targets, tolerances and controlled layers where used. |
| BOM CSV/XLSX | Export the intended fitting state, physical designators, quantity, exact MFR/MPN, value/specification and footprint. Include supplier IDs when required. Resolve blanks and parameter placeholders. |
| Pick-and-place/CPL/centroid CSV | Export the intended assembly references, centroid X/Y, units, side and rotation. Check representative polarized and bottom-side parts against the placement preview. |
| Assembly views PDF | Where required, show revision/variant, top and bottom designators, pin 1/polarity and clear DNP identification. State viewing direction and only the assembler's necessary instructions. |
| Schematic PDF | Export all applicable project sheets with readable text and current revision; normally retain as release/support documentation. |
| STEP/3D model | Include when needed for mechanical coordination; verify populated variant and model completeness. A model alone does not prove mechanical fit. |
| IPC netlist / ODB++ / IPC-2581 | Generate the specific accepted format when required for comparison or supplier import. Confirm exporter support and any supplemental files. |
| Validation and source archive | Retain final validation/DRC reports, completed checklist, exceptions, source snapshot, OutJob and file manifest. Upload only the portion the supplier needs. |

Do not assume an assembly variant removes unused copper or paste apertures. Inspect
the actual stencil data, especially for alternate footprints and hand-fitted parts.
Document an intended paste exception where relevant.

For controlled impedance, state the electrical target and tolerance plus the
permitted stackup adjustments. If the fab may adjust dielectric thickness, preserve
the agreed overall thickness/mechanical limits and review any proposed changes
outside that agreement.

## File checks before upload

- **Same revision:** All outputs derive from the same saved snapshot. Record source hashes and generation settings; a newer timestamp alone is not proof.
- **Physical references:** Expand grouped BOM rows. Compare actual BOM/PnP reference sets, full component identities and DNP state. Explain omissions for hand-fit/THT/mechanical parts instead of demanding identical counts blindly.
- **Placement convention:** Use a documented origin and verify centroid, side and rotation in the supplier preview. Do not apply a blanket bottom-side mirror or rotation correction without checking the importer convention.
- **Fabrication alignment:** Reopen CAM data; compare drill/slot locations, outline and layer order. Keep mechanical drawings from being accidentally plotted as copper or repeated on every Gerber layer.
- **Rendered content:** Inspect resolved revision strings, clipped silkscreen, polarity and DNP markings in the actual output. An on-screen source view can differ from an export or supplier rendering.
- **Archive:** Use relative filenames and SHA-256 hashes in a manifest. Keep prior releases outside the new upload directory; retain the exact package issued and its release record.

## CircuitHub

**Preferred native input:** upload all applicable .SchDoc files and one .PcbDoc
for the board, with an explicit CSV BOM when needed for MPNs and fitting. Confirm
component links before upload. A .PrjPCB alone is not a design package, and Gerbers
alone are insufficient for CircuitHub's import workflow.
[Altium import guide](https://docs.circuithub.com/importing-a-project/preparing-altium-files-for-circuithub-import)
and [supported inputs](https://docs.circuithub.com/getting-started/welcome).

**Variants:** CircuitHub's current guide says native Altium variants are not
supported directly. Reconcile the intended build's BOM and every fitted/DNP
reference in CircuitHub. Make the requested quantities/configurations explicit;
do not assume the selected Altium variant transferred with the native files.
[Variant guidance](https://docs.circuithub.com/importing-a-project/altium-variants).

**IPC-2581 alternative:** follow CircuitHub's Altium export procedure, including
its supplemental CSV BOM and IPC-D-356A netlist. Supported IPC-2581 revisions and
export options must match the current importer.
[Altium IPC-2581 workflow](https://docs.circuithub.com/importing-a-project/exporting-altium-to-ipc-2581).

Review the imported board, layer mapping, component orientation, DNPs and displayed
revision text before release. Check the current
[special-string limitations](https://docs.circuithub.com/importing-a-project/altium-special-strings)
when using parameter-based markings. Keep internal reports/archives separately.

## JLCPCB

Prepare the fabrication package plus the assembly BOM and CPL for the selected
service. Map exact orderable parts and validate the selected JLCPCB/LCSC codes
against the intended MPN, package and ratings in the import preview.

- **BOM:** include Comment/specification, Designator and Footprint. Keep exact MFR/MPN and the relevant JLCPCB/LCSC part code to make selection unambiguous. Do not distinguish references by letter case alone.
- **CPL:** use Designator, Mid X, Mid Y, Layer and Rotation; coordinates in mm, layer Top/Bottom, and rotation in degrees with positive angles counterclockwise per JLCPCB's format.
- **Import review:** reconcile references and fitting, then inspect pin 1, diode/LED polarity, connector orientation and bottom-side placement. Resolve any rotation corrections against the actual preview.

Sources: [BOM requirements](https://jlcpcb.com/help/article/bill-of-materials-for-pcb-assembly),
[CPL requirements](https://jlcpcb.com/help/article/pick-place-file-for-pcb-assembly),
[Altium export walkthrough](https://jlcpcb.com/help/article/how-to-generate-bill-of-materials-and-centroid-file-from-altium).

## PCBWay

Prepare Gerber/drill data, BOM and centroid data for PCBA, with required fabrication
notes and assembly details. Use the current service templates.
[Assembly FAQ](https://www.pcbway.com/assembly-faq.html).

- **BOM:** supply an editable spreadsheet/CSV with references, quantities, packages and exact part numbers. Include values/specifications and mounting type where useful. PCBWay does not accept PDF-only BOMs for sourcing.
- **Centroid:** reconcile references with the assembly BOM. PCBWay allows THT references to be excluded from this file; document any such omissions and keep the build BOM complete.
- **Orientation:** provide clear pin-1 and polarity information in silk or an assembly drawing. Explain exceptions to the assembler's convention. Include only instructions relevant to its work.

Source: [necessary assembly files and information](https://www.pcbway.com/smt_ordering_guide.html).

## Codex / designer handoff

**Codex can verify:** saved source/variant identity, BOM/PnP sets and metadata,
report contents and freshness, package completeness, hashes, and inspectable
drawings/CAM data. State partial coverage when a parser, renderer or source is missing.

**Designer checks in Altium / supplier tools:** native validation and generation,
rule-query matching, final mechanical judgment, silkscreen/paste appearance and
supplier placement/import settings. Codex may assist when appropriate native
tools are available, but must verify their actual result before closing the item.

Report readiness against the identified source snapshot. Keep physical qualification
and received-board tests separate from file-release completion.
