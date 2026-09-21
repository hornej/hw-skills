# Schematic, PCB and variant evidence

If `references/local-runtime.md` exists locally, consult it for the configured
interpreter and verification scope. Keep machine paths and private validation
artifacts in that ignored local note, outside the portable skill.

Prefer already available native Altium exports or a tested read-only parser. The
bundled adapter uses Altium Monkey when installed. It does not install or upgrade
the engine and does not use private machine paths by default.

```text
python <skill>/scripts/native_inventory.py --project <design.PrjPCB> --pcb <board.PcbDoc> --out <new-inventory.json>
python <skill>/scripts/native_inventory.py --engine-src <altium_monkey/src/py> --project <design.PrjPCB> --out <new-inventory.json>
```

Run in a Python environment containing Altium Monkey's dependencies. Record the
engine path/version/checkout state. If unavailable, retain export-audit capability
and use native schematic/compiled exports for the remaining checks; state the
unavailable coverage. Never save binaries merely to inspect them.

The adapter inventories reachable sheets, component UID, logical designator,
parameters, part ID, locations and schematic DNP texts. With a PCB it also retains
physical designators and the complete `SOURCEUNIQUEID` plus source document. It
does not guess nearest component ownership or build a netlist. Check reported
sheet failures and per-file source hashes before relying on the inventory.

## Identity and fitting

1. Establish the project's hierarchy/channel mapping and assembly scope. Join
   schematic and PCB by the full source identity plus sheet/channel context.
   Exact variant `UniqueId` paths and physical designators are useful cross-checks.
   Do not collapse all instances to a leaf UID. Do not infer total physical count
   from the number of logical symbols on reachable sheets.
2. Resolve the saved variant's not-fitted entries, alternate components and
   parameter overrides. Kind `1` in the supported PrjPCB representation denotes
   not fitted; preserve other kinds and unknown syntax for inspection. A variant
   may omit unchanged components from its variation list.
3. Associate DNP annotations by owner or explicit reference where possible. For
   floating text, render the actual region and confirm its intended target(s).
   Distance can shortlist candidates but cannot decide ownership. A graphic
   annotation may apply to only one assembly configuration; establish that scope.
4. Compare the effective variant to BOM and PnP by physical reference and identity,
   checking alternate MPNs and parameter overrides as well as not-fitted leaks.
   Check fitted parts missing from exports using the board's assembly exclusions.
   Test points, fiducials, mechanical parts and hand-soldered parts are not blanket
   omissions: use this project's settings. Unsupported alternate payloads remain
   open findings until native Altium or explicit exports resolve them.
5. Trace electrical consequences of fit changes and relevant part replacements.
   Use compiled pin/net data or inspect wires, junctions, ports, sheet entries,
   power ports and device pins. Nearby labels and diagram proximity do not prove
   a connection. Check logic defaults and boot/reset states for each affected
   assembly. Document uncertainty when compiled hierarchy or net evidence is absent.

After a correction, reread the saved PrjPCB/SchDoc and applicable PCB, verify the
selected variant in regenerated exports, and check both reference sets and MPNs.
An Altium dialog, screenshot, or user statement that they exported again is a
reason to recheck, not proof that the saved files changed.

## Interoperation with library and sourcing skills

`altium-library-migrate` concerns staged library normalization/consolidation;
`altium-365-library-maintain`, if available, concerns managed metadata updates. This review
uses their canonical MFR/MPN and coherent Supplier/SPN concepts, but does not
rewrite placed component parameters or publish Workspace revisions during review.
Do not merge distinct symbol pin maps or footprint implementations because their
purchasing MPNs match. Preserve managed item/revision IDs as evidence.

If `digikey-part-selection` is installed, use its verified exact-product API
workflow for relevant live sourcing checks. This is an optional integration;
manufacturer/distributor pages remain a portable fallback. Preserve useful extra
parameters and genuine alternate Part Choices. Component Name, Comment, managed
symbol/footprint Name, and item/revision IDs are separate fields; readable names
or matching renders do not establish identity or model equivalence.
