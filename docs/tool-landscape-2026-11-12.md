# Hardware tooling landscape and integration priorities

Checked **2026-11-12** against `hw-skills` commit
`edef9633a1c207daa839eba5da5924b1572c4464`.

**Recommendation:** retain `hw-skills` as the engineering workflow and evidence
layer. Qualify the existing Altium MCP connection, then add optional adapters for
connectivity, manufacturing-file inspection, interactive assembly documentation,
and datasheet evidence. Evaluate direct Workspace access separately. The useful
unit of integration is a verified capability, not an entire tool catalog.

This review evaluates 25 projects, including the two Altium servers in the
original discussion. The [candidate catalog](tool-candidates-2026-11-12.json)
records upstream commit IDs, dates, declared licenses, decisions and evidence
levels. These are research snapshots, **not approved dependency pins**.

> Repository split: Altium-specific skills now live in
> [altium-tools](https://github.com/hornej/altium-tools). Links to the original
> Altium helpers below are pinned to the evaluated snapshot. Current portable
> review guidance lives in `hardware-design-review`.
>
> Implementation update: the [first integration delivery](integrations-2026-11-12.md)
> adds optional Universal Netlist and Gerbonara adapters with synthetic acceptance
> tests. The evaluation and candidate catalog below retain their original evidence scope.

## Scope and evidence

The search covered live Altium automation, saved-file readers, managed libraries,
manufacturing outputs, BOM/assembly review, sourcing, simulation, and adjacent
KiCad/code-driven workflows. Candidates were assessed on incremental value to
this repository, operating-system/EDA fit, testable behavior, implementation
evidence, maintenance burden and licensing. Popularity and advertised tool counts
did not determine the ranking. This is a substantial shortlist, not an exhaustive
catalog of every EDA tool or a benchmark of every implementation.

Evidence consists of current primary documentation and repository metadata,
selected implementation/test inspection, the local Altium MCP status response,
and one isolated synthetic function probe described below. No new backend was
installed, no native design command was executed, no Workspace was modified, and
no third-party project's full test suite was run. README demonstrations and
upstream issue reports remain author-reported evidence.

## What we already have

| Existing capability | Evidence in this checkout | What an addition must improve |
| --- | --- | --- |
| BOM/PnP/variant review | [`audit_exports.py`](https://github.com/hornej/hw-skills/blob/edef9633a1c207daa839eba5da5924b1572c4464/altium-design-review/scripts/audit_exports.py), synthetic CLI example, tests, release checklist | Native connectivity, geometry and verification of the actual generated files |
| Saved Altium inspection | [`native_inventory.py`](https://github.com/hornej/hw-skills/blob/edef9633a1c207daa839eba5da5924b1572c4464/altium-design-review/scripts/native_inventory.py), Altium Monkey dependency | The adapter explicitly leaves pin/net connectivity and physical-instance reconciliation unresolved; extend or supplement it before claiming complete circuit extraction |
| Local library migration | [`altium-library-migrate`](https://github.com/hornej/hw-skills/blob/edef9633a1c207daa839eba5da5924b1572c4464/altium-library-migrate/SKILL.md), pinned Monkey engine, staging and normalization helpers | Primitive-level authoring/diff and native acceptance of newly generated models |
| Managed-library maintenance | [`altium-365-library-maintain`](https://github.com/hornej/hw-skills/blob/edef9633a1c207daa839eba5da5924b1572c4464/altium-365-library-maintain/SKILL.md), synchronization artifacts, revision/IPN guidance | Direct structured Workspace reads and narrowly controlled revision updates |
| Sourcing and origin | DigiKey, Nexar, Mouser, LCSC/JLCPCB clients, ST lookup and [Origin Lens](../extensions/origin-lens/README.md) | Better presentation or additional verified providers; preserve exact identity, currency, freshness and manufacturing-stage distinctions |
| Native workflow guidance | PCB rules, xSignals, grounding, OutputJobs and supplier-specific release references | Reliable machine-readable evidence that those checks actually ran |

The [JLCPCB provider reference](../part-sourcing/references/lcsc-jlcpcb.md) records
successful authenticated component-detail validation on October 21 UTC / October
20 Denver time. The old README's blanket “live acceptance pending” wording was
stale. LCSC live testing remains pending credentials in that reference. Historical
validation does not establish current stock or access for a new installation.

**Workstation versus repository:** the local `coffeenmusic/altium-mcp` checkout
was clean at `9ad05d3009912d54ed183221abd244bb86f18696`, and its MCP endpoint
responded to `get_server_status`. This supersedes the pasted earlier observation
that no Altium MCP was connected. The status implementation checks configured
executable/script paths; it does **not** prove a successful native Altium command.
The repository still does not bundle this server. Adom Bridge, panel helpers and
task-specific archived review scripts remain surrounding workstation tools, not
portable dependencies supplied by installing these six skills.

## Ranked candidates

“Pilot” means worth qualifying, not already accepted. Effort is relative:
small = configuration or a narrow export; medium = an adapter plus fixtures;
high = a new backend/platform or broad native integration. Licenses below are
upstream declarations; bundled code and dependencies can carry additional terms.

### Direct value for the current Altium workflow

| Candidate | Incremental value and overlap | Decision / effort |
| --- | --- | --- |
| [coffeenmusic/altium-mcp](https://github.com/coffeenmusic/altium-mcp) — MIT | Already connected here. Project/unsaved-state queries, ERC, stackup, rules, library primitives and OutputJobs complement our saved-file helpers. Some queries depend on the focused document. | **Qualify existing first / small.** Record which operations work on the installed revision before adding another live bridge. |
| [eda-agent](https://github.com/salitronic/eda-agent) — Apache-2.0 | Broader live connectivity, design queries and editing; explicit project paths on useful queries. Substantial overlap with the connected server, but useful additional circuit context. Upstream marks it experimental. | **Focused comparative pilot / medium.** Start with connectivity and constraints; keep UI automation disabled for that pilot. |
| [Universal Netlist](https://github.com/IntelligentElectron/universal-netlist) — Apache-2.0 | Saved Altium, KiCad and Cadence schematics through one query interface. Altium project hierarchy and variants address gaps explicitly left open by our inventory adapter. Independent implementation makes it useful for disagreement detection. | **High-priority pilot / medium.** Compare complete pin membership against native compiled evidence. It does not replace PCB geometry inspection or native compilation. |
| [Gerbonara](https://gerbolyze.gitlab.io/gerbonara/) — Apache-2.0 | Reads Gerber, Excellon and IPC-356, groups manufacturing layers and renders them. Its fixture collection includes Altium outputs. Adds inspection after OutputJob generation. | **High-priority pilot / medium.** Build a read-only manufacturing manifest/report. Parsing success is not a full DFM or electrical-netlist proof. |
| [InteractiveHTMLBOM4Altium2](https://github.com/zharovdv/InteractiveHTMLBOM4Altium2) — MIT | Native script/OutJob exporter to self-contained HTML or generic JSON. Adds component-location, assembly and rework views to our tabular review. | **High-priority pilot / small.** Verify variant filtering, bottom-side geometry, rotations, pin 1 and text rendering on AD26. |
| [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) — MIT | Established interactive frontend and generic JSON contract. Its [usage guide](https://github.com/openscopeproject/InteractiveHtmlBom/wiki/Usage) explicitly links the Altium exporter. | **Pair with exporter / small.** Prefer its generic-data boundary where practical; retain our BOM reconciliation as the source check. |
| [kicad-happy](https://github.com/aklofas/kicad-happy) — MIT | Broad review, datasheet, simulation and sourcing skills. Most CAD analysis is KiCad-specific, but structured datasheet facts and provenance are transferable. Existing sourcing/review workflows overlap heavily. | **Adapt selected pieces / medium.** Prioritize evidence schemas and cache validation; do not import its entire release policy. |
| [altium-workspace-mcp](https://github.com/Heegiiny/altium-workspace-mcp) — MIT | Direct Workspace queries, revision parameters, model links, templates and bulk editing without desktop Altium. Fills a substantial gap in our synchronization-file workflow. | **Separate pilot / high.** Start with readonly access and identity/revision comparison. Authentication and server compatibility are unverified here. |
| [altium-designer-mcp](https://github.com/embedded-society/altium-designer-mcp) — GPL-3.0 | Offline SchLib/PcbLib authoring, primitive edits and library diff. Overlaps Monkey migration and native library tools but offers a focused authoring interface. | **Selective pilot / medium.** Test one symbol and one footprint with demanding primitives, then native open/save/readback. |
| [altium-monkey-mcp](https://github.com/wjakiela/altium-monkey-mcp) — AGPL-3.0 | Read-only MCP interface to the engine we already use, including net queries and rendering beyond our narrow adapter. | **Optional wrapper / small.** Useful ergonomics; it is not an independent parser cross-check against Monkey. Reconcile engine requirements with our tested pin. |
| [Electronics AI](https://github.com/M-R-Abedini/Electronics_AI), formerly Altium-MCP-Suite — mixed MIT/Apache-2.0 | Coordinated Altium automation, connectivity contracts and recovery; bundles an eda-agent snapshot. The [license scope](https://github.com/M-R-Abedini/Electronics_AI/blob/23baa831da46f2e65cc5e8bbf994c69e44a2afea/THIRD_PARTY_NOTICES.md) distinguishes original and bundled code. | **Study selected mechanisms / high.** Compare pin-contract and recovery ideas; avoid taking on a second large bundled runtime without demonstrated benefit. |

### Useful additions with narrower or future demand

| Candidate | Incremental value and limitation | Decision / effort |
| --- | --- | --- |
| [PyGerber](https://github.com/Argmaster/pygerber) — MIT | Gerber X2/X3 rendering, syntax tooling and public Python APIs. Complements Gerbonara's broader manufacturing-file scope. | **Secondary renderer / small.** Add only when it resolves a concrete coverage or visualization gap. |
| [spicelib](https://github.com/nunobrum/spicelib) — GPL-3.0 | Batch LTspice/ngspice/QSPICE/Xyce runs, netlist edits and waveform analysis. Adds repeatable electrical checks to review. | **Later pilot / medium.** Start with an RC network and a model-backed power circuit; preserve model/source/version evidence. |
| [PySpice](https://github.com/PySpice-org/PySpice) — GPL-3.0 | Python circuit definition and ngspice/Xyce integration. Alternative to spicelib, with simulator/library environment setup to qualify. | **Alternative / medium.** Prefer spicelib initially for existing simulator files; choose PySpice when programmatic circuit construction is the requirement. |
| [KiCost](https://github.com/hildogjr/KiCost) — MIT | Quantity-sensitive purchasing workbooks; accepts Altium BOMs and CSVs. Overlaps our supplier clients. | **Optional presentation adapter / small.** Do not replace exact-part checks or source timestamps. Qualify live distributor access separately. |
| [Ki-nTree](https://github.com/sparkmicro/Ki-nTree) — GPL-3.0 | Supplier metadata ingestion into KiCad and InvenTree. No direct solution to Altium 365 revision management. | **Only with KiCad/InvenTree / medium.** Its documented parameter-unit compatibility setting needs evaluation against the chosen inventory configuration. |
| [InvenTree](https://github.com/inventree/InvenTree) — MIT | Stock, BOM and build records cover inventory rather than our current supplier availability checks. Requires a maintained service and a master-data decision. | **Separate platform decision / high.** Avoid creating another authoritative IPN/part database without a defined relationship to existing PLM/Workspace records. |
| [KiBot](https://github.com/INTI-CMNB/KiBot) — AGPL-3.0 | Repeatable KiCad fabrication/documentation generation and CI. Excellent fit for a future KiCad workflow; does not run Altium OutJobs. | **When KiCad is in scope / medium.** Adopt its artifact-manifest/build ideas now, integrate executable later. |
| [KiDiff](https://github.com/INTI-CMNB/KiDiff) — GPL-2.0 | Visual revision comparisons for KiCad schematics/PCB layers. Dependencies and CAD-specific plotting limit direct Altium use. | **When KiCad is in scope / medium.** For Altium, first compare native exports and semantic inventories. |
| [KiKit](https://github.com/yaqwsx/KiKit) — MIT | KiCad panelization, fabrication presets and presentation outputs. Strong specialized functionality, different source format. | **When KiCad is in scope / medium.** Do not convert an Altium project merely to use it. |
| [SKiDL](https://github.com/devbisme/skidl) — MIT | Reusable Python-defined circuits and netlist/ERC generation. Valuable for parameterized new designs, with a different authoring model. | **Watch / high.** Pilot a reusable circuit block if code-first capture becomes a requirement. |
| [atopile](https://github.com/atopile/atopile) — MIT | Declarative modules, constraints and component selection feeding KiCad layout. A design-system choice rather than a small Altium helper. | **Watch / high.** Do not make migration of existing designs a prerequisite to tooling improvements. |
| [circuit-synth](https://github.com/circuit-synth/circuit-synth) — MIT | Python/KiCad generation and AI workflows. Overlaps code-first capture and review orchestration. | **Watch / high.** Evaluate only against a concrete reusable-design use case. |
| [Freerouting](https://github.com/freerouting/freerouting) — GPL-3.0 | DSN/SES autorouting with local and service modes. Altium exchange and preservation of its richer constraints must be demonstrated. | **Defer Altium routing / high.** A produced SES file is not successful import, acceptable return paths or native DRC completion. |
| [Altium community scripts](https://github.com/Altium-Designer-addons/scripts-libraries) — per-script terms | Broad native examples and specialized utilities. Repository explicitly warns of inconsistent maintenance and has no uniform license. | **Per-script reference / variable.** Choose a concrete script, inspect its own terms and test it; do not vendor the whole collection. |

The searched Cimos iBOM fork resolves to the same inspected commit as the
zharovdv project; prefer the upstream project linked by InteractiveHtmlBom.
For KiCost, use `hildogjr/KiCost`; the separately found INTI-CMNB copy is much
older. These distinctions avoid mistaking similarly named repositories for the
best-maintained integration target.

## Findings that materially affect the choices

1. **A query can still save.** At eda-agent `c5aaa465`,
   [`ForceRecompileIfRequested`](https://github.com/salitronic/eda-agent/blob/c5aaa465c5f4e0ba53d6513909346063a308bc6b/scripts/altium/Project.pas#L1088)
   calls `SaveAllDirty(0)` before recompilation. Its
   [read-only classification](https://github.com/salitronic/eda-agent/blob/c5aaa465c5f4e0ba53d6513909346063a308bc6b/src/eda_agent/safety.py#L91)
   is based on command names. Set `EDA_AGENT_READONLY=1` and
   `EDA_AGENT_UI_AUTOMATION=0` for a pilot, but independently verify each selected
   call's disk/editor effects; omit forced refresh until saving is intended.

2. **Unknown input must remain unknown.** At kicad-happy `7d9d4d9`,
   [`check_routing`](https://github.com/aklofas/kicad-happy/blob/7d9d4d9fef87ac2d3eb16cfc5cdc9a0869f417f4/skills/kicad/scripts/fab_release_gate.py#L52)
   defaults missing `unrouted_count` to zero. An isolated execution of just that
   function with `{}` returned `pass`, with message `All nets routed (0/0)`;
   explicit two-unrouted-net input returned `fail`. This establishes a helper
   boundary weakness, not that every full CLI path accepts incomplete input.
   Any adaptation must require explicit coverage before passing a check.

3. **The transferable datasheet work is concrete.** kicad-happy's
   [`SpecValue` schema](https://github.com/aklofas/kicad-happy/blob/7d9d4d9fef87ac2d3eb16cfc5cdc9a0869f417f4/skills/datasheets/schemas/spec_value.schema.json)
   separates min/typ/max, units, test conditions, PDF page and extraction method.
   This is a strong starting point for reusable evidence in component selection.
   Preserve document hashes, exact MPN/package applicability and explicit unknowns
   when adapting it. A confidence label alone is not electrical qualification.

4. **Workspace access is a genuine gap, with setup dependencies.** The inspected
   server uses SOAP/Workspace services, .NET 10, Windows or browser-token login,
   and a user-supplied OAuth client ID for token auth. Its default guarded mode
   permits small writes; a reading trial should explicitly use
   `ALTIUM_WRITE_MODE=readonly`. Source has a
   [change guard](https://github.com/Heegiiny/altium-workspace-mcp/blob/f9598afe7ffd2ddc19239c134279539927f55a21/src/AltiumWorkspaceMCP/Safety/ChangeGuard.cs#L85),
   but that does not establish our cloud tenant's compatibility. The repository
   was created October 1, so production experience is still limited.

5. **Interactive BOMs need native-version and variant checks.** The Altium
   exporter implements fitted-state filtering, but upstream reports include
   [AD25/26 stream errors](https://github.com/zharovdv/InteractiveHTMLBOM4Altium2/issues/22),
   [missing rendered characters](https://github.com/zharovdv/InteractiveHTMLBOM4Altium2/issues/21)
   and a [DNP-path identifier problem](https://github.com/zharovdv/InteractiveHTMLBOM4Altium2/issues/14).
   These are reported cases, not failures reproduced here. They make a small
   representative native pilot more useful than immediately standardizing it.

6. **Keep proposed fixes separate from shipped capabilities.** Sampled open PRs
   include [foreground restoration for coffeenmusic](https://github.com/coffeenmusic/altium-mcp/pull/100),
   [save-status correction for eda-agent](https://github.com/salitronic/eda-agent/pull/327),
   and [paging changes for Universal Netlist](https://github.com/IntelligentElectron/universal-netlist/pull/289).
   Their descriptions inform acceptance tests; they are not evidence those fixes
   are in the recorded default-branch revision or the local installation.

The supplied [JLCPCB walkthrough](https://jlcpcb.com/blog/altium-mcp-with-claude-code-pcb-design)
is useful first-hand workflow evidence for wrong-document queries, identity drift
and incomplete automation. Use those cases as regression scenarios; the article
does not qualify our workstation or designs.

Altium's own [Developer Center](https://developer.altium.com/) currently lists
its Altium Designer and Altium 365 MCP servers as coming soon and the Workspace
GraphQL API as closed beta. Keep the integration boundary replaceable so official
access can be evaluated when available; do not treat announced tools as installed.

## Proposed integration boundary

Each backend should return a small summary plus references to complete artifacts.
The common evidence record should include:

- Backend name, version/commit and operation; explicit project/document paths and
  assembly variant; full logical/channel/physical identity where relevant.
- Saved-file hashes and capture time; observable editor modified state; compile
  freshness; units, coordinate origin and side conventions.
- Result and coverage separately: observed, failed, unsupported, unknown or not
  run. Partial pages and truncated results must be declared.
- Actual side effects: exports, compilation, disk saves, editor changes and
  foreground interaction. A function name is not the classification evidence.
- Raw artifact paths/hashes and concise findings with source references.

Use one chosen live Altium backend per operation, plus independent saved/exported
evidence. Qualify competing bridges in separate sessions before considering
coexistence. Keep the backend's native IDs and original fields alongside normalized
ones. Never merge repeated channels solely by designator or the last UID segment.

Keep third-party engines separately versioned and preserve their own licenses and
notices. The candidate JSON is not an installer. No automatic “install all,” broad
tool registration, or new mandatory dependency is proposed for ordinary BOM CSV
review. New checks belong next to the existing review workflow; service-specific
authentication and write execution belong in their own backend modules.

## Concrete integration backlog

| Order | Deliverable and likely home | Acceptance evidence |
| --- | --- | --- |
| 1 | Live-backend capability record and small comparison fixture under `altium-design-review` | Explicit target identification; two open projects; unsaved edits; project/board identity; same component/net queries on connected coffeenmusic and optional eda-agent; unchanged source hashes for intended reads; compile/save effects recorded; clean return of control. |
| 2 | Universal Netlist adapter or targeted extension of `native_inventory.py` | One flat and one hierarchical/repeated-sheet project, multi-part IC, buses, hidden power pins, DNP and alternate variant. Compare complete `(physical component, pin, net)` membership to native compiled exports, not only equal counts. Unsupported cases remain unknown. |
| 3 | `inspect_manufacturing` report using Gerbonara | Layer map, units, origin, outline, plated/non-plated drill evidence and IPC-356 records where supplied; flag ambiguous filenames. Test a missing layer, shifted drill coordinates and a malformed file. Verify source hashes unchanged. Native DRC and vendor DFM remain separate evidence. |
| 4 | Altium iBOM integration guide plus export reconciliation | Self-contained HTML opens offline; top/bottom placements and pin 1 agree with Altium; variant reference sets match our BOM audit; Unicode/text and known AD26 issue paths tested; source and HTML hashes retained. |
| 5 | Datasheet evidence/cache adapter shared by selection and review | Exact MPN/package applicability, source URL/PDF hash/page, min/typ/max and conditions. Changed PDFs invalidate cached extraction; absent facts never become defaults; one misleading typical-vs-guaranteed example is rejected. Retain attribution for adapted material. |
| 6 | Workspace readonly connector pilot, then scoped edit support under `altium-365-library-maintain` | Authenticate to intended tenant; compare a small item/revision/parameter/model set with native exports; test pagination and readonly refusal. A later disposable-item edit must preserve links/IDs, verify revision semantics and report partial failures before any broader use. |
| 7 | Optional simulation workflow using spicelib | Reproduce a known RC result, then a manufacturer-model case and tolerance sweep; retain engine/model/netlist versions, convergence status and operating conditions. A missing model or failed run cannot produce a passing engineering conclusion. |

Orders 1–4 give the most direct benefit to current Altium work. Orders 5–7 add
reusable depth. KiCad build tools, inventory platforms, code-first authoring and
autorouting should be activated by concrete project demand. The existing
engineering checklists, exact-part sourcing, origin evidence and independent
saved-file verification remain valuable across all these additions.

## Verification of this research change

- Inventoried repository instructions/helpers and inspected the clean local MCP
  checkout; the status-only tool response was recorded separately from native
  acceptance.
- Read primary documentation and recorded commit metadata for 25 candidates;
  inspected selected code, test inventories and a bounded sample of open issues.
- Reproduced the isolated missing-routing-data behavior without installing the
  upstream package or running its CLI.
- The repository changes are research documentation and a machine-readable
  catalog. Implementation, native pilots and backend qualification remain the
  next work, not claimed accomplishments of this evaluation.
