# hw-skills

Reusable Codex skills for PCB and hardware design: Altium library preparation,
Altium 365 maintenance, design review, and component sourcing.

Each skill includes instructions and focused reference material. The bundled
Python helpers make repeatable file analysis and catalog queries available
without requiring UI automation for every step.

## Skills

| Skill | Use it for |
| --- | --- |
| [altium-library-migrate](altium-library-migrate/SKILL.md) | Discover, normalize, audit and consolidate local SchLib/PcbLib libraries; prepare an Altium Library Importer configuration. |
| [altium-365-library-maintain](altium-365-library-maintain/SKILL.md) | Maintain existing Workspace components, models and templates; add verified metadata and named product links; prepare synchronization inputs and diagnose saves. |
| [altium-design-review](altium-design-review/SKILL.md) | Review BOM consolidation and replacements, trace schematic roles, and reconcile assembly variants with BOM and pick-and-place exports. |
| [digikey-part-selection](digikey-part-selection/SKILL.md) | Find and compare exact parts using DigiKey catalog data, current purchasing information and manufacturer datasheets. |

The library skills distinguish local staging from updates to existing Workspace
items. Design review reports evidence and unresolved checks; component selection
does not place an order. Project naming conventions, templates, supplier choices
and component lists belong with the project using the skills.

## Install in Codex

Ask Codex:

```text
Use $skill-installer to install altium-library-migrate,
altium-365-library-maintain, altium-design-review, and digikey-part-selection
from https://github.com/hornej/hw-skills.
```

Alternatively, clone this repository and copy the desired skill folders into
`~/.codex/skills` (Windows: `%USERPROFILE%\.codex\skills`), or into your configured
`CODEX_HOME/skills`. Preserve existing same-name skills and reconcile local edits
before replacing them. Installing all four keeps the companion reference links
available. Restart Codex after installing so it discovers the skills.

Installation supplies skill instructions and scripts. Configure the dependencies
below only for workflows you use.

## Dependencies

| Workflow | Requirements |
| --- | --- |
| BOM/PnP CSV review and synchronization-file preparation | Python 3.10+; standard library only. |
| DigiKey catalog helper | Python 3.10+; a DigiKey Product Information API application for live queries. Set `DIGIKEY_CLIENT_ID` and `DIGIKEY_CLIENT_SECRET` through your own secret manager or process environment. |
| Binary library migration and optional native design inventory | CPython 3.12 with `altium-monkey==2026.8.21`, the tested engine version. |
| Native import, Workspace release and component/model editing | Altium Designer on Windows and appropriate access to the selected Altium 365 Workspace. Custom Data Synchronization also needs its installed feature and a compatible 64-bit OLE DB provider. |

For binary helpers, create a virtual environment and install
[`altium-library-migrate/scripts/requirements.txt`](altium-library-migrate/scripts/requirements.txt).
See the [migration workflow](altium-library-migrate/references/workflow.md) for
platform commands and validation limits. Some adapters use internal engine APIs;
test another engine version before using it on design files.

See [DigiKey credentials](digikey-part-selection/references/credentials.md) for
portable credential injection and [API usage](digikey-part-selection/references/api.md)
for cache and request behavior. Product pages and manufacturer datasheets remain
available when API access is absent. No account credentials are included.

## Examples

```text
Use $altium-design-review to check this project's BOM and assembly variant,
including consolidation candidates and differences from the pick-and-place export.

Use $altium-library-migrate to analyze these local libraries and prepare an
import package while preserving electrical symbol variants.

Use $altium-365-library-maintain to prepare DigiKey links and verified
MFR, MPN, Supplier, SPN, and passive Value fields for these existing components.

Use $digikey-part-selection to compare replacement MOSFETs for this circuit,
including the actual gate drive, pinout, thermal conditions, and build quantity.
```

## Tests and contributions

From the repository root, in the environment described above:

```sh
python -m unittest discover -s altium-library-migrate/tests -v
python -m unittest discover -s altium-365-library-maintain/tests -v
python -m unittest discover -s altium-design-review/tests -v
python -m unittest discover -s digikey-part-selection/tests -v
```

The tests use synthetic temporary libraries, CSVs and mocked network responses.
They do not require a private project, live Workspace or DigiKey credentials.
They do not establish native Altium acceptance, live API access, current stock
or engineering signoff. GitHub Actions runs the suites on Windows with Python 3.12.

Contributions should improve reusable workflows or include a minimal synthetic
reproduction for a demonstrated problem. Keep customer designs, Workspace
exports, project histories, credentials and API caches out of commits and issue
attachments. Run the affected suite when changing a helper.

## License

Original skill instructions and helper code in this repository are available
under the [MIT License](LICENSE).

[Altium Monkey](https://github.com/wavenumber-eng/altium_monkey) is separately
installed and licensed under
[AGPL-3.0-or-later](https://pypi.org/project/altium-monkey/2026.8.21/).
The MIT license here does not relicense that dependency or its dependencies.
Altium and DigiKey services remain subject to their own access requirements and
terms. This is an independent project, not an official Altium or DigiKey product.
