# Validation

The 32 synthetic migration tests passed on Windows with CPython 3.12 and
`altium-monkey==2026.9.21` on 2026-09-21. Consolidation gives each retained symbol
variant its generated library reference as well as its storage name. The variant
regression checks saved/reopened identities, model unions, and unchanged sources.
This validates the bundled helpers' tested cases; it is not native Altium import
or Workspace qualification.

Run the synthetic regression suite from the repository root in the pinned engine
environment:

```sh
python -m unittest discover -s altium-library-migrate/tests -v
```

The tests create their own temporary SchLib/PcbLib fixtures. They cover canonical
aliases and conflicting values, coherent supplier pairs, scoped exceptions,
recursive discovery, output preservation, importer mappings, Workspace setting
preservation, owner-index repair, symbol variants, explicit pin maps, model
unions, ambiguous footprints, symbol-only libraries and source-local identity.
No private project libraries, exported Workspace configurations or credentials
are required.

For each real build, inspect `audit.json` and the saved/reopened binary checks.
Keep source/output hashes, selected profiles and the exact engine version with
the project's run artifacts. Test representative rendering and electrical
equivalence after serialization; native Altium Refresh/Validate is still needed
before an authorized import. A successful synthetic suite is not proof that all
historical Altium libraries or Workspace schemas are supported.

## Practical limits

- Tested on Windows with the pinned binary engine. Some preservation mechanics
  use private raw-record/font/PinTextData APIs, so an engine upgrade needs tests.
- Explicit pin maps and electrical/rendered signatures guard consolidation.
  They do not prove every footprint is physically compatible with a component;
  ambiguous-model approval requires engineering review.
- Simulation/non-PCBLIB models block generation and need a separate engine
  extension. Unknown categories stay unresolved.
- lmcfg normalization supports an exported consolidated SchLib with one split
  parent and all logical groups. It preserves Workspace-specific settings;
  scratch generation and current permissions cannot be guaranteed offline.
- Existing Component Templates are not updated by mapping normalization.
- Output model paths are absolute; regenerate after relocation.
