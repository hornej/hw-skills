# hw-skills

Reusable hardware engineering skills for component selection, sourcing,
country-of-origin evidence and design review across CAD tools.

Altium-specific automation now lives in
[altium-tools](https://github.com/hornej/altium-tools), with its file history
preserved. See the [repository split](docs/repository-split.md) for migration
details and the installation boundary.

## Skills

| Skill | Use it for |
| --- | --- |
| [hardware-design-review](hardware-design-review/SKILL.md) | Review component suitability, BOM/placement evidence, grounding, board interfaces and release readiness using available CAD evidence. |
| [digikey-part-selection](digikey-part-selection/SKILL.md) | Find and compare exact parts using DigiKey catalog data, current purchasing information and manufacturer datasheets. |
| [part-sourcing](part-sourcing/SKILL.md) | Compare Nexar/Octopart, Mouser, LCSC and DigiKey availability/prices, collect origin evidence, and query live-validated JLCPCB component details. |
| [st-origin-lookup](st-origin-lookup/SKILL.md) | Retrieve ST declared country of origin for exact ordering codes while preserving unknown manufacturing stages. |

The [Origin Lens Chrome extension](extensions/origin-lens/README.md) compares
distributor and manufacturer origin reports, exact-part matches and timestamps.
It includes separate manufacturing-stage evidence, probable-origin estimates and
LCSC package-photo marking recognition. Its own README covers installation,
credentials and current prototype limitations.

Project naming, limits, supplier choices and completed reviews belong with the
project. Component selection does not place orders, and source parsing or an
export report does not establish engineering signoff.

## Install in Codex

```text
Use $skill-installer to install hardware-design-review,
digikey-part-selection, part-sourcing, and st-origin-lookup
from https://github.com/hornej/hw-skills.
```

Alternatively copy the desired skill folders into `~/.codex/skills` (Windows:
`%USERPROFILE%\.codex\skills`) or your configured `CODEX_HOME/skills`. Preserve
local edits before replacing existing same-name skills. Keep companion folders
side by side for relative references. Installed skills are available on the next
Codex turn; copied installations do not update automatically.

For Altium, install `altium-library-migrate`, `altium-365-library-maintain` and
`altium-design-review` from
[hornej/altium-tools](https://github.com/hornej/altium-tools).
Their names and helper command lines are unchanged. They are optional for this
repository's generic workflows.

## Capabilities and dependencies

| Workflow | Requirements and result |
| --- | --- |
| Hardware design review | Instructions and reference material; uses supplied evidence or available CAD tools. No particular CAD installation required. |
| DigiKey catalog | Python 3.10+ and Product Information API credentials for live queries; local cache and manufacturer-page fallbacks remain available. |
| Batch sourcing and origin | Python 3.10+ and credentials/access for each selected provider. No quote creation, order placement or RFQs. |
| ST website origin | Python 3.10+; undocumented website access may require browser capture. |
| STM32 package/pin screening | ST public pin-data repository at a recorded commit; CubeMX/datasheets for missing coverage. |
| Origin Lens | Chrome extension and configured access for the selected sources; see its own setup guide. |

The helpers preserve exact manufacturer/part identities, source timestamps and
native currencies. JLCPCB component-detail calls have been validated; LCSC live
testing is pending credentials. Read the [provider scope](part-sourcing/references/lcsc-jlcpcb.md)
before interpreting coverage. Historical validation does not establish current
stock or access for another account.

See [DigiKey credentials](digikey-part-selection/references/credentials.md) and
[API behavior](digikey-part-selection/references/api.md), plus
[sourcing provider access](part-sourcing/references/providers.md) for batching,
quotas, plan-gated fields and retention. Nexar data must not be retained beyond
its documented 24-hour limit. The optional
[Windows sourcing launcher](part-sourcing/references/credentials.md) accepts
environment credentials or a user-configured Bitwarden mapping. No private
vault or account-specific configuration is required for the ordinary clients.

This repository does not depend on Altium Monkey, Altium Designer or an Altium
MCP server. Native Altium helpers and the synthetic BOM/variant CLI walkthrough
are maintained in [altium-tools](https://github.com/hornej/altium-tools).

## Review and future integrations

Start with the [generic release checklist](hardware-design-review/references/release-checklist.md)
for a review across CAD tools. For an Altium project, use the native release and
OutputJob guidance in the Altium repository as well.

The [hardware tooling evaluation](docs/tool-landscape-2026-11-12.md) compares 25
projects and records proposed pilots. Its candidate catalog is research evidence,
not an installation manifest or qualified-backend registry. Portable datasheet,
manufacturing-file and simulation integrations belong here; Altium-specific
adapters and native acceptance tests belong in `altium-tools`.

## Tests and contributions

From the repository root, Python 3.10+ is enough:

```sh
python -B -m unittest discover -s digikey-part-selection/tests -v
python -B -m unittest discover -s part-sourcing/tests -v
python -B st-origin-lookup/scripts/test_st_origin_lookup.py
```

These suites use synthetic inputs and mocked responses. They do not require
credentials or establish live stock, API access or electrical qualification.
CI runs them on Windows/Python 3.12 and Linux/Python 3.10. Origin Lens has its
own tests described in its README.

Keep customer designs, Workspace exports, credentials and API caches out of
commits and issue attachments. Run the affected suite when changing a helper.
Generic review guidance should not assume one CAD vendor or a particular
project's electrical limits.

## License

Original skills and helpers are available under the [MIT License](LICENSE).
Third-party dependencies and bundled extension assets retain their own terms;
see the extension's notices. Services remain subject to their access requirements.
This is an independent project, not an official distributor or CAD-vendor product.
