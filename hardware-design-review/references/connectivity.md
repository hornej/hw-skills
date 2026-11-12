# Saved schematic connectivity

`scripts/inspect_connectivity.mjs` integrates
[Universal Netlist](https://github.com/IntelligentElectron/universal-netlist)
**1.14.4**, Apache-2.0, through its exported library service. Use it for pin/net
membership beyond BOM and symbol inventories. It reads supported Altium, KiCad,
Cadence and Universal Netlist inputs. Local acceptance tests currently exercise
Altium; other format readers are upstream capabilities, not locally qualified.

## Optional installation

Requires Node.js 22.15+ and npm. From this skill's directory:

```sh
npm ci --ignore-scripts
node scripts/inspect_connectivity.mjs --help
```

The exact engine version and dependency integrity hashes are in `package-lock.json`.
Install dependencies beside the skill, including for a copied installation.
The adapter checks its engine pin before parsing. It uses the library directly:
no MCP registration, binary auto-updater, disk parse cache, telemetry initialization,
or external KiCad process is used. Existing live CAD backends remain separate.

## Read one saved build

```sh
node scripts/inspect_connectivity.mjs --design /project/Board.PrjPcb --variant "Production" --out /reports/connectivity.json
```

Omit `--variant` only for a design with no named variants. The pinned engine
requires a named build when variants exist and refuses `<Default>` in that case.
Use the project file for Altium: reading one `.SchDoc` cannot establish project
hierarchy or variant behavior. Unsaved editor changes are outside the snapshot.

The report retains the engine's component fields, full reference identities,
pin/net maps, DNP flags and alternate-part data. `connections` is a complete
list of `(refdes, pin, net)` tuples derived from the component map. Query that
list or `nets` to trace a signal. DNP parts remain present; assess fitted state
separately from schematic connectivity. Do not collapse repeated channels or
multi-part components by stripping reference suffixes.

Every dependency read through the engine is SHA-256 stamped and checked again
before reporting; missing-file probes are also checked for membership changes.
For Altium projects, every declared SchDoc must exist and have the supported OLE
header. Absolute SchDoc paths and projects with no declared sheets are refused:
the upstream discovery can otherwise skip entries or scan neighboring files.
The adapter rejects an empty parse, read failure or changed source and refuses
existing output files. The engine normalizes unconnected pins to `NC`; a report
does not independently establish the semantics of a literal net named `NC`.

Altium `.Annotation` files containing physical designator mappings are a known
unsupported dependency in engine 1.14.4. The adapter checks declared annotation
files and the adjacent project-named file, hashes them, and emits
`altium_physical_annotation_unsupported`. It retains the parser's evidence but
marks physical mapping unsupported and exits 1. Use native compiled membership;
do not repair this by renaming references until the numbers look right.

## Compare independent membership

Optionally pass `--compare compiled-membership.json` with this structure:

```json
{
  "source": "Native compiled export path, export method and compile time",
  "design_sha256": "SHA-256 of the project file",
  "design_variant": "Production",
  "connections": [{"refdes": "U1", "pin": "1", "net": "VCC"}]
}
```

Preserve the native export alongside this normalized evidence. Use every pin
in the intended scope; the adapter compares membership sets, not counts, and
does not silently rename nets or remap logical/physical references. It rejects
empty/duplicate rows and mismatched project hash or resolved variant. The
comparison file is hashed with the other sources.

An exact match means **matches supplied membership**, not native signoff. The
project-file hash alone does not establish source-sheet freshness of a native
export. Verify its complete source revision, physical instance mapping, variant,
compile completion and unconnected-pin conventions independently. Differences
remain evidence for investigation, not permission to rewrite a design.

Exit codes: **0** report written with no findings; **1** supplied membership differs
or an unsupported annotation mapping is present; **2** input,
parser, version or output error. Native compile/ERC/DRC, physical mapping,
PCB geometry and electrical qualification remain explicitly unverified.

## Qualification scope

Synthetic tests run the actual pinned parser on flat and repeated-sheet Altium
projects, a multi-part component, named variants and a DNP row. They verify full
pin membership, missing/corrupt sheet refusal, source preservation, comparison
scope and exclusive output creation. They do not qualify all buses, harnesses,
hidden-power conventions, alternate libraries or native compiled equivalence.
Retain these gaps when applying the parser to a real design.

Native AD26.11.1 testing on 2026-11-12 matched all 65 pin/net memberships in a
15-component single-sheet control. The annotated, hierarchical Bluetooth Sentinel
example failed equivalence (native 72 components/224 pins versus saved parser
70/220). See the [native qualification record](https://github.com/hornej/altium-tools/blob/main/docs/native-qualification-2026-11-12.md).
This is a limited positive control and a confirmed unsupported case, not general
Altium equivalence.
