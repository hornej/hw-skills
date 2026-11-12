# Hardware and Altium repository split

On 2026-11-12 the Altium-specific skills moved to
[hornej/altium-tools](https://github.com/hornej/altium-tools), retaining their
relevant Git history. The original history remains in this repository; no
existing branch history was rewritten. The split includes the published native
readback helpers and the Altium Monkey 2026.9.22 requirement.

| Install from hw-skills | Install from altium-tools |
| --- | --- |
| `hardware-design-review` | `altium-design-review` |
| `digikey-part-selection` | `altium-library-migrate` |
| `part-sourcing` | `altium-365-library-maintain` |
| `st-origin-lookup` | |

Origin Lens remains here. Component/interface criteria were moved into the generic
review skill, with CAD-independent export-review and release guidance. Altium
references forward to the shared criteria; native rules, variants, OutputJobs,
Workspace maintenance and release instructions remain in the Altium repository.

The existing `audit_exports.py` retains its CLI and schema. It still combines
CSV auditing with `.PrjPCB` variant parsing, so it remains an Altium helper. A
future generic executable can consume a versioned evidence interface without
changing the established native workflow during this relocation.

## Existing installations

Keep the three Altium skill names unchanged. Compare local edits before replacing
copied installations. If using developer junctions/symlinks, retarget only those
three entries to the corresponding folders in the new checkout. Install
`hardware-design-review` from this repository for the shared engineering guidance.
Preserve unrelated installed skills and their local changes.

Install all three Altium skills side by side for their within-repository links.
Links to generic companion references use canonical GitHub URLs, with installed
copies usable when available. Neither repository relies on a sibling checkout
or absolute workstation path for its portable helpers.

Third-party MCP registrations and engine/reference installations keep their
existing locations. No new MCP backend is installed by this split. Generated
library staging can contain absolute paths: regenerate staging after relocating
its inputs instead of reusing a stale importer configuration.

## Maintenance boundary

`hw-skills` owns portable engineering review, sourcing, datasheet/origin evidence,
and future manufacturing-file or simulation integrations. It runs without Altium.
`altium-tools` owns CAD-specific adapters, native automation, managed libraries,
setup guidance and native acceptance evidence. Third-party engines remain
separately versioned dependencies with their own licenses.

Each repository has its own offline CI. The
[Altium history record](https://github.com/hornej/altium-tools/blob/main/docs/history.md)
maps source commits to the extracted commits and records what was preserved.
