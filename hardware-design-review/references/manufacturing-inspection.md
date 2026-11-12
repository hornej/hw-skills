# Inspect exported manufacturing files

`scripts/inspect_manufacturing.py` integrates
[Gerbonara](https://github.com/jaseg/gerbonara) **1.6.3**, Apache-2.0. It reads an
unpacked CAM directory and writes a new JSON report with optional per-layer SVGs.
It never edits the supplied Gerber, Excellon or IPC-356 files.

## Optional installation and invocation

Requires Python 3.12+ for this engine; other existing helpers retain their own
requirements. From this skill's directory, using an isolated environment:

```sh
python -m venv .venv
# Windows: use .venv/Scripts/python.exe below; Unix: .venv/bin/python
.venv/bin/python -m pip install -r scripts/requirements-cam.txt
.venv/bin/python scripts/inspect_manufacturing.py /project/CAM --out /reports/cam-review --render --require "top copper" --require "bottom copper" --require outline --require drill
```

Choose required roles for the actual board. No two-layer or drilling assumption
is imposed by default. The output directory must be new and outside the input
package. Unpack archives first; inspect the exact files intended for release.

For ambiguous exports, supply `--layer-map layers.json`:

```json
{
  "layers": {
    "Board.GM1": "outline",
    "Board.G1": "inner_1 copper",
    "Board.G2": "inner_2 copper"
  },
  "required_roles": ["top copper", "inner_1 copper", "inner_2 copper", "bottom copper", "outline", "drill"]
}
```

Paths are relative to the package, with `/` separators. Confirm mechanical-layer
meaning from the CAD output configuration; `.GM1` alone does not mean outline.
Gerber FileFunction attributes take priority over common extension hints; an
explicit mapping is retained as user evidence and conflicts are reported.
Inspect the `role_basis` field rather than treating filenames as authoritative.

## Reading the result

- Each input remains in the manifest with SHA-256 and size, including unknown,
  ambiguous or malformed files. The source package and layer map are checked
  again after parsing. Parser warnings remain review findings.
- Parsed graphics include source units, millimeter bounds, object counts and
  original file attributes. Each SVG is a separate layer preview in its own
  source coordinate system, not a registered composite or proof of alignment.
- Drills include diameter sets and parser-reported plating. Unknown or mixed
  plating is explicit. Missing sidecar settings/tool tables are not guessed;
  these inputs may need re-export with self-contained units/tools.
- With one identified outline, drill bounds outside its bounds raise a review
  finding. This catches gross offsets but also flags legitimate edge holes,
  tooling features or slots. It neither proves alignment for holes inside the
  bounds nor checks outline closure, cutouts or point-in-polygon containment.
- IPC-356 test records preserve reference, pin, net, coordinates and plating.
  Gerbonara 1.6.3 parses the pin into `pin` rather than its declared `pin_num`
  field; the adapter handles that observed behavior. IPC records have no graphic
  bounds or preview in this integration. They are not a copper-connectivity check.

Exit codes: **0** no automated findings; **1** review findings; **2** parse/source
stability/input/runtime failure. A produced report, or exit 0, does not establish
native DRC, correct CAM origin, fabrication suitability or vendor DFM acceptance.
Use the [release checklist](release-checklist.md) for those separate checks.

Synthetic acceptance covers missing layers, shifted drills, ambiguous names,
duplicate roles, unknown plating, malformed/unknown files, IPC pin records,
SVG generation and input/output preservation. Real supplier packages and native
Altium OutputJobs still need project-specific review.
