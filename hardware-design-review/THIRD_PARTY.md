# Optional engine attribution

The adapter code and synthetic fixtures are MIT-licensed except for the explicitly
marked Apache-2.0 modules described below.

`scripts/altium/project.mjs` and `scripts/altium/channels.mjs` are modified copies
of the matching Universal Netlist **1.14.4** distributed modules. `load.mjs`
adapts its service variant-selection logic. They retain Apache-2.0 licensing;
the upstream [LICENSE](vendor/universal-netlist/LICENSE) and
[NOTICE](vendor/universal-netlist/NOTICE) are included. Changes apply physical
annotation before extraction, preserve isolated-pin names, localize hierarchical
power/port connections, and reject ambiguous identities/hierarchies. The original
annotation module and regression fixtures remain MIT-licensed.

These few integration modules call the separately installed, pinned engine's
parser internals. They do not edit `node_modules`, replace the package globally,
or require install scripts. Requalify both the internal interfaces and native
comparisons before upgrading the engine or changing this integration.

| Dependency | Tested version | Upstream license and source |
| --- | --- | --- |
| Universal Netlist, by Valentino Zegna / IntelligentElectron | 1.14.4 | [Apache-2.0](https://github.com/IntelligentElectron/universal-netlist/blob/main/LICENSE), [repository](https://github.com/IntelligentElectron/universal-netlist) |
| Gerbonara, by jaseg, XenGi and contributors | 1.6.3 | [Apache-2.0](https://github.com/jaseg/gerbonara/blob/main/LICENSE), [repository](https://github.com/jaseg/gerbonara) |

Install these packages separately. Their distributed LICENSE/NOTICE files and
transitive dependency licenses remain applicable; this repository's MIT license
does not relicense them. Universal Netlist includes attribution for its Cadence
reader; retain the installed package's NOTICE. Gerbonara's upstream attribution
includes pcb-tools and pcb-tools-extension.

The npm lockfile records exact package resolutions/integrity. The CAM requirements
file pins the qualified parser release; its transitive Python dependencies are
resolved by pip. Requalify parser version changes with these integration tests
and representative project evidence before updating either pin.
