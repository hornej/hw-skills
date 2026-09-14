# Component synchronization

## Supported route

Altium Designer's Custom Data Synchronization supports CSV sources and a
.CmpSync configuration. It needs a 64-bit OLE DB provider. Create the initial
configuration while connected to the intended Workspace using **File > New >
Components Synchronization Configuration**. The executor is installed under the
Altium version's System directory. These are documented capabilities; the
pitfalls below were observed in earlier native synchronization trials and
should be checked against the target version.

Official sources:
- [Component Database to Workspace Data Synchronization](https://www.altium.com/documentation/altium-designer/components-libraries/component-database-workspace-data-synchronization)
- [Global Operation Permissions](https://www.altium.com/documentation/altium-designer/connected-workspace/setting-global-operation-permissions)
- [Microsoft Access Runtime](https://support.microsoft.com/en-us/access/download-and-install-microsoft-365-access-runtime)
- [Text-driver schema.ini](https://learn.microsoft.com/en-us/sql/odbc/microsoft/schema-ini-file-text-file-driver)

Altium references checked 2026-09-06. Microsoft references were used during the
runtime installation and CSV pilot on 2026-09-05.

Check installed feature/provider availability first. The 64-bit Microsoft 365
Access Runtime can supply the provider when absent; do not reinstall it on every
run. Test the actual source through the same provider
connection Altium uses, rather than trusting a Python CSV read alone.

## Prepare an isolated source

Use a dedicated data directory containing only intended source tables and their
schema.ini. A broad audit directory may expose unrelated CSVs in the picker.
In the pilot, a UTF-8 BOM corrupted the first header and produced extra F2-style
columns through ACE. UTF-8 without BOM, explicit text columns, and
CharacterSet=65001 produced the expected eight text fields.

The helper accepts a reviewed JSON source. Every cell must be a string so numeric
ordering codes cannot lose leading zeros. Include only columns intended for the
particular write. A blank mapped value may clear a field; splitting rows into
separate mapping groups is preferable to filling unrelated missing cells.

~~~json
{
  "key_parameter": "Name",
  "columns": ["Name", "Supplier", "SPN"],
  "rows": [{"Name": "EXAMPLE_EXISTING_NAME", "Supplier": "DigiKey", "SPN": "EXAMPLE_VERIFIED_ORDERING_CODE"}]
}
~~~

This illustrates the format, not an executable catalog match. At runtime choose
an actual key confirmed unique in both the source and target. Do not assume an
audit's WorkspaceItemID column is automatically a supported sync key.

Name is not a suitable sole key for a run that also changes Name. Establish a
separate supported, unique live key first, or use the native batch editor with
existing linked items. Reusing a Name-keyed input after a rename can fail to
match the original item; do not infer idempotence from a successful earlier run.
CSV-to-Workspace synchronization is not a bidirectional managed-library edit
interface. An export/readback and explicit conflict/revision handling are
separate work when building a two-way workflow.

~~~powershell
python <skill>/scripts/sync_artifacts.py prepare --input reviewed-source.json --output run-01
python <skill>/scripts/sync_artifacts.py inspect-log --input server-log.txt
python -m unittest discover -s <skill>/tests -v
~~~

Replace <skill> with the actual skill directory and quote paths with spaces.
prepare refuses an existing output directory. It creates
run-01/data/components.csv, run-01/data/schema.ini, and
run-01/source-manifest.json. The manifest records hashes, columns, the key,
row count, and explicitly unverified target matches. Source keys are checked
conservatively for duplicates after trimming/case folding. The helper restricts
headers to simple identifier words and cells to 1024 characters without control
characters, matching its text schema; adapt intentionally for other data shapes.

## Review the actual configuration

Generate Workspace-bound settings in Altium. Do not fabricate Workspace IDs,
component types, templates, folders, lifecycle definitions, or revision schemes.
Keep the authenticated runnable file in a private machine-local location; never
print its RefreshToken or copy it into the repository. Work on a sanitized review
copy and inspect changed fields before applying them to the private config.

An observed export used a DatabaseDataSource and ComponentDataSourceTable,
with a CSV table name such as pilot#csv. These names are observations, not a
portable contract. Use the target Altium version's generated structure.

Inspect each mapping. The pilot's automatic mapping set Description from Name,
left Supplier unmapped, and omitted the link fields. Corrected one-to-one
mappings retained the original description and models. Do not map audit columns,
blank model names, or unrelated parameters. Review revision flags against the
intended change policy; the pilot used revision parameters.

Part Choice mappings replace the synchronized list, apart from manually added
choices, according to Altium's documentation. The parameter-only pilot kept
PartChoiceMappings empty and its existing choice survived.

## Lifecycle and permissions

Preserve lifecycle state (KeepLifecycleState=true) requires the global operation
**Allow to skip lifecycle state change for new revisions**. A Workspace admin
grants it from **Preferences > Data Management > Servers > Properties >
Operations**, using Add User/Add Role and Apply/OK. That dialog is administrator
only; a disabled menu is consistent with lacking that role, not proof of the
wrong library type. The admin can grant a specific operation without granting
full administrator membership.

Do not silently disable preservation in response to a denial. Establish the
normal new-revision state and whether that change is authorized for the intended
items. An exception authorized for one item does not apply to an entire batch.
Local preflight cannot prove server permissions. An unnamed insufficient-
privileges error must not be attributed to a guessed operation.

## Execute and reconcile

Use the discovered executor path and a reviewed private config:

~~~powershell
& $executor $privateConfig
~~~

Record input/config identities without disclosing credentials, the start time,
and the exact row scope. Keep console output private until sanitized. Official
server logs are under C:/Users/Public/Documents/Altium/Logs/ComponentSync.
Select the log for this invocation, not an older file with the same config name.

The helper's inspect-log reads a single invocation's log and reports write
counts and error line numbers. Error text stays in the private source log because
it may echo authentication/configuration data. Exit 2 means an error or inconclusive write evidence; exit 0
means positive write evidence with no recognized error, NOT a verified Workspace
result. It recognizes the observed English log format and does not infer success
from a generic footer. Other/localized formats may need direct inspection.

In the pilot, the executor exited 0 and printed success after server errors,
including an invocation that actually wrote zero items. Read all ERROR lines.
Positive writes followed by an error require live reconciliation before retrying.
Do not automatically rerun or expand a failed batch.

Read back intended parameters, link label and URL, item/revision identity, models,
Part Choices, and lifecycle state. Check for duplicate items and unintended
description changes. Record verified changes separately from server-reported
writes. A retained native link does not prove new-link creation. Extend to a
batch only after unresolved errors or mapping behavior affecting it are resolved.
