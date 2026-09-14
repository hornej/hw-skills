# Repeatable export audit

The CSV helper uses Python 3.10+ standard library only. It reads original files
and writes one new JSON report (refuses overwrite). For Excel exports use an
available spreadsheet workflow to inspect the selected sheet or produce a faithful
CSV staging copy; record the workbook/sheet provenance. Do not rename XLSX to CSV.

```text
python <skill>/scripts/audit_exports.py --project <design.PrjPCB> --variant <exact-name> --bom <BOM.csv> --pnp <PnP.csv> --out <new-report.json>
python <skill>/scripts/audit_exports.py --project <design.PrjPCB> --variant <exact-name> --bom <new-BOM.csv> --previous <old-report.json> --out <new-report.json>
```

Use `--variant @base` explicitly for the base assembly. A nonexistent named
variant fails. `--bom-encoding` and `--pnp-encoding` override the detected UTF-8,
UTF-16 BOM or legacy CP1252 decoding. The report retains input hashes, encoding,
raw columns, header line and any export preamble, plus saved variant records.
The exported variant is not always encoded in the file: the helper records that
as unverified and the reviewer must establish it from the OutJob/export source.

Canonical metadata alias conflicts are not resolved silently. Numbered
manufacturer/supplier fields are preserved as separate slots. `--columns` accepts
a project-local JSON map when the export uses other names, e.g.
`{"references": "RefDes", "mpn": "PartNumber", "mfr": "Maker"}`. An explicit
mapping chooses a column for analysis, still retaining every raw field. Fitted or
DNP columns with unfamiliar values are unresolved, not silently treated as fitted.

Read `issues` and `coverage` before counts or candidate groups. The helper checks:

- blank/placeholder metadata, conflicting aliases, ambiguous reference syntax,
  repeated designators and quantity mismatches;
- repeated exact MFR+MPN identity, and same nominal passive values across MPNs
  (including differing footprint names; package compatibility is unverified);
- saved not-fitted references appearing as fitted in either export;
- BOM-only/PnP-only reference sets, with exclusions left for assembly policy;
- alternate parts/parameter overrides retained for explicit review;
- additions, removals and changes per unambiguous reference versus a prior report
  for the same project and variant.

The report has **no overall pass/fail signoff**. A zero process exit code means
the report was produced. In particular, it does not validate inventory, electrical
substitutions, complete physical identity mapping or schematic DNP ownership.
Malformed inputs fail loudly. Syntactically valid but unresolved data remains
visible in the report rather than disappearing from counts.

Keep review artifacts in a project-local output location or a temporary folder.
Use dated new report names so repeated exports can be compared. Do not place
project BOMs, confidential design files or stock snapshots in the reusable skill.

For changes to the helper, run `python -m unittest discover -s <skill>/tests -v`.
These tests cover variant leaks despite equal export counts, missing/conflicting
metadata, coherent numbered supplier pairs, ambiguous references, quantity/fit
states, candidate-only matching, encoding, recheck deltas and overwrite refusal.
Smoke-test changed parsing against a real export with its own column schema.
