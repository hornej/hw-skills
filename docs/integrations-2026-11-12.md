# First integration delivery

This delivery implements the two highest-value independent file-analysis gaps
identified in the [tool evaluation](tool-landscape-2026-11-12.md): schematic
connectivity and inspection of exported manufacturing files. The research
candidate catalog remains a historical snapshot; it is not an installer.

| Integration | Home and delivered capability | Qualified scope |
| --- | --- | --- |
| Universal Netlist 1.14.4 | `hardware-design-review/scripts/inspect_connectivity.mjs`: saved pin/net maps, DNP/variant fields, source hashes, full-membership comparison | Synthetic regression cases and a native 65-pin control match; annotated hierarchical example fails native equivalence |
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

The integration suite contains 25 tests (14 connectivity, 11 manufacturing),
run against the pinned libraries rather than mocked parser success responses.

## Native Altium follow-up

AD26.11.1 testing now includes a complete 65-pin match on a single-sheet control,
a failed comparison on the hierarchical Bluetooth Sentinel example, and parsing
of actual native Gerber/drill output. The detailed
[qualification record](https://github.com/hornej/altium-tools/blob/main/docs/native-qualification-2026-11-12.md)
owns the results and limits. Native testing exposed ignored physical annotation
and the unsafe `.GKO`-as-outline assumption; the adapters now flag the former and
require explicit outline evidence for the latter.

## Next capability gates

1. Resolve physical annotation and the remaining hierarchical membership/count
   differences before promoting saved connectivity beyond the qualified control.
2. Qualify explicit fabrication profiles and the remaining CAM layer roles, then
   add native variant, ERC/DRC and more complex connectivity acceptance cases.
3. Add reusable datasheet evidence, then evaluate Workspace read access when its
   intended tenant and authentication are available.

Interactive assembly/iBOM work is deferred; native Altium testing takes priority.

The first two adapters are usable now for scoped evidence gathering. Complex
buses/harnesses, hidden-power cases, native physical identity, CAM registration,
supplier acceptance and the remaining integration candidates are still separate
qualification work.
