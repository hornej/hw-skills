# First integration delivery

This delivery implements the two highest-value independent file-analysis gaps
identified in the [tool evaluation](tool-landscape-2026-11-12.md): schematic
connectivity and inspection of exported manufacturing files. The research
candidate catalog remains a historical snapshot; it is not an installer.

| Integration | Home and delivered capability | Qualified scope |
| --- | --- | --- |
| Universal Netlist 1.14.4 + Altium adapter v1 | `hardware-design-review/scripts/inspect_connectivity.mjs`: saved pin/net maps, physical annotation, hierarchy, source hashes, full-membership comparison | Fresh native 224-pin hierarchical and 65-pin single-sheet matches; annotated assembly variants remain blocked |
| Gerbonara 1.6.3 | `hardware-design-review/scripts/inspect_manufacturing.py`: Gerber/Excellon/IPC-356 manifest, layer evidence, units, drill sizes/plating, coarse drill bounds check, per-layer SVG | Synthetic regressions plus 20 native Gerber files and one drill file; native hole count/diameter cross-check; no vendor DFM or copper-netlist equivalence claim |

Both are CAD-independent engines, so the adapters belong in `hw-skills`.
[altium-tools](https://github.com/hornej/altium-tools/blob/main/altium-design-review/references/connectivity-integration.md)
owns the Altium project/variant and OutputJob handoffs, including native acceptance
requirements. The existing Monkey inventory, CSV audit and live MCP registration
retain their separate roles and command contracts.

## Dependency and execution boundary

These are optional dependencies installed beside the review skill or in an
isolated Python environment. Ordinary sourcing and CSV review gain no dependency.
No new MCP server, remote service, cloud credential or auto-update installation
is introduced. The Universal Netlist adapter uses its exported in-process service
with external KiCad invocation and parse caches disabled. Both adapters preserve
source bytes, reject existing outputs and explicitly report unverified coverage.

Install instructions and report/exit contracts are in the skill's
[connectivity reference](../hardware-design-review/references/connectivity.md)
and [manufacturing reference](../hardware-design-review/references/manufacturing-inspection.md).
[Attribution](../hardware-design-review/THIRD_PARTY.md) records upstream licensing.

## Observed integration issues

- Gerbonara 1.6.3 populates IPC-356 pin numbers in `pin`, despite declaring
  `pin_num` on the data class. The adapter reads the parsed field and tests exact
  pin identity. Its generic bounding-box path also cannot consume IPC test records;
  the adapter retains those records without claiming graphic bounds.
- Universal Netlist requires a named build when the project declares variants;
  `<Default>` is refused. The adapter propagates this behavior instead of choosing
  a variant. Its normalized unconnected-pin name is `NC`, retained explicitly as
  a coverage caveat.
- Its Altium discovery can skip missing/non-OLE or absolute document paths and
  fall back to directory scanning. The adapter preflights every declared SchDoc,
  refuses unsupported absolute paths and refuses an undeclared project scope.
  Regression tests include a valid sheet beside a missing/corrupt second sheet.

The integration suite contains 35 tests (24 connectivity, 11 manufacturing),
run against the pinned libraries rather than mocked parser success responses.

## Native Altium follow-up

Initial AD26.11.1 testing included a complete 65-pin match on a single-sheet
control, a failed hierarchical comparison and actual native Gerber/drill parsing.
The detailed
[qualification record](https://github.com/hornej/altium-tools/blob/main/docs/native-qualification-2026-11-12.md)
retains that historical result. The subsequent
[fix and fresh rerun](https://github.com/hornej/altium-tools/blob/main/docs/native-connectivity-fix-2026-11-12.md)
matches all 224 hierarchical memberships after applying physical annotation
before extraction, correcting hierarchical power scope and retaining isolated
pin names. Both native cases preserve source bytes and workspace state. The CAM
adapter continues to require explicit outline evidence for `.GKO`.

## Next capability gates

1. Extend native qualification to annotated assembly variants and additional
   hierarchy/hidden-power cases beyond the two exact-match projects.
2. Qualify explicit fabrication profiles and the remaining CAM layer roles, then
   add native variant, ERC/DRC and more complex connectivity acceptance cases.
3. Add reusable datasheet evidence, then evaluate Workspace read access when its
   intended tenant and authentication are available.

Interactive assembly/iBOM work is deferred; native Altium testing takes priority.

The first two adapters are usable now for scoped evidence gathering. Complex
buses/harnesses, hidden-power cases, native physical identity, CAM registration,
supplier acceptance and the remaining integration candidates are still separate
qualification work.
