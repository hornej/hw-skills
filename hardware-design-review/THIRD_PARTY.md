# Optional engine attribution

The adapter code and synthetic fixtures in this skill are original MIT-licensed
work under the repository license. Upstream engine source is not vendored.

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
