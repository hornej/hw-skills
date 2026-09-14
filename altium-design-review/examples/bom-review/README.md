# First BOM review

This example uses invented part numbers and supplier codes. `Demo.PrjPCB`
contains only the variant metadata needed by the CSV helper; it is not a
complete Altium board project. No Altium installation, parser package,
network access or credentials are needed. Use Python 3.10 or later.

## Run the review

From the repository root:

```sh
python altium-design-review/scripts/audit_exports.py --project altium-design-review/examples/bom-review/Demo.PrjPCB --variant "Demo assembly" --bom altium-design-review/examples/bom-review/bom.csv --pnp altium-design-review/examples/bom-review/pnp.csv --out demo-review.json
```

When using an installed skill instead of a repository checkout, use the same
arguments with paths relative to the installed `altium-design-review` folder.
Keep `--out` in a separate working directory. The output path must be new.

Open the generated JSON, or ask Codex:

```text
Use $altium-design-review to explain demo-review.json, identifying the
intentional errors and what still requires engineering review.
```

## Expected findings

| Report location | Finding |
| --- | --- |
| `summary` | Three BOM rows and four physical references; the PnP also contains four references. |
| `reconciliation.dnp_present_in_bom` | R2 appears in the BOM even though the selected variant marks it not fitted. |
| `reconciliation.bom_only` / `pnp_only` | R2 is only in the BOM; R4 is only in the PnP. Equal counts did not establish matching membership. |
| `issues` | C1 is missing its MPN and supplier ordering code. Its row is retained for review. |
| `nominal_value_candidates` | R1/R2 and R3 use equivalent `10k`/`10K` values but different MPNs and footprints. They are candidates for review; package and electrical compatibility are unverified. |
| `coverage` | Live availability, electrical qualification and native compile/ERC/DRC were not checked. |

The normal exit code is zero because the report was produced, even with these
findings. Reconciliation findings are separate from the `issues` array; inspect
both, along with candidate groups and coverage. File timestamps reflect your
checkout and can produce additional freshness warnings.

For your own design, supply the exact project, selected assembly variant and
matching exports. Use `--variant @base` for the base assembly, `--columns` for
custom CSV headers, and `--previous` to compare a later export. See the
[export-audit reference](../../references/export-audit.md) for details.
