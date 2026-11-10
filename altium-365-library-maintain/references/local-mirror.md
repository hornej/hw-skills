# Local managed-library mirror

Use `scripts/library_mirror.py` for offline inventory and change planning from
an existing captured Workspace metadata export. Python 3.10+ and its standard
library are sufficient. This is a local analysis database, not an Altium server
database or an authenticated Workspace connection.

## Import and inspect

The input is an explicit snapshot directory containing `manifest.json`,
`ItemRevisions.jsonl` and `ItemRevisionLinks.jsonl`. The manifest supplies the
export SHA-256 values. Each export line uses the collector's `content` envelope.
Use a completed consistent snapshot, not files copied independently from a
running SQLite cache. Supply the intended Workspace name and Vault GUID.

From this skill's folder:

```powershell
python -B scripts/library_mirror.py ingest --snapshot C:\audit\snapshot --db C:\audit\library.sqlite --workspace "Example Workspace" --vault-guid 11111111-1111-4111-8111-111111111111
python -B scripts/library_mirror.py status --db C:\audit\library.sqlite
python -B scripts/library_mirror.py export --db C:\audit\library.sqlite --revision CMP-10001-1 --revision CMP-10002-1 --out C:\audit\two-revisions.json
```

The GUID and IDs above are synthetic. Imports create a new database and output
files are never overwritten. A failed import must not leave a usable partial
database. Keep private snapshots, databases, exports and plans in the project
evidence directory, outside this reusable repository.

Retain the exact item/revision identity and raw source records alongside the
structured projection. Parameter names, nulls, typed values and link metadata
must not be normalized destructively. A missing referenced model remains a
coverage gap, not an empty model. Missing purchasing or usage data is unknown,
not a confirmed empty Part Choice list or an unused component.

## Preview a change

Prepare explicit target revisions and requested fields in JSON:

```json
{
  "changes": [
    {"revision": "CMP-10001-1", "parameters": {"MFR": "Example Manufacturer", "MPN": "EXAMPLE-123"}},
    {"revision": "CMP-10002-1", "lifecycle_state": "Superseded", "comment": "Proposed duplicate of CMP-10001-1; verification pending."}
  ]
}
```

```powershell
python -B scripts/library_mirror.py plan --db C:\audit\library.sqlite --changes C:\audit\changes.json --out C:\audit\change-preview.json
```

The preview identifies source observations and requested changes. It is not
authorization or an executable update. There is deliberately no apply command,
network client, credential loader, model editor or lifecycle writer in this
helper. A familiar lifecycle label does not resolve a tenant's transition ID.
Do not promote a preview to a verified duplicate decision merely because the
target exists in the mirror.

## Qualification before a live adapter

Treat cache freshness separately from parsing integrity. A valid source hash
proves which file was imported; it does not prove the server still has those
values or that every live component is represented. Lifecycle operations after
the snapshot belong in a separate observation ledger. Preserve the original
snapshot rather than rewriting history to resemble current state.

Use a representative private pilot set with exact identity mappings and known
coverage: populated and genuinely loaded-empty choices, alternate/default
footprints, custom and unresolved pin maps, historical/current revisions,
known duplicates, conflicting controls, and independently proven usage. Missing
coverage stays explicit. Do not substitute an old local schematic reference for
a current connected-server Where-used result.

A future API/native adapter must first demonstrate exact revision targeting,
complete values/model bindings/choices, correct usage scope and supported
transition/approval behavior. Refresh mutable observations before a write;
check for drift and reconcile partial results before retrying. Parameter updates
may create new revisions, while lifecycle transitions may affect existing ones.
No adapter or test should silently publish disposable template-test components.

The broader workflow and evidence distinctions are in
[Workspace automation](workspace-automation.md). Native panel identity and
loaded-row lifecycle observations are covered by [native readback](native-readback.md).
