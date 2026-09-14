# Operating workflow

## Runtime

The binary migration helpers are tested with CPython 3.12 and
`altium-monkey==2026.8.21`. Create an isolated environment from the repository
root, or reuse an existing environment with that version. Windows PowerShell:

~~~powershell
py -3.12 -m venv .venv
$python = (Resolve-Path '.venv\Scripts\python.exe').Path
$skill = (Resolve-Path '.\altium-library-migrate').Path
& $python -m pip install -r "$skill\scripts\requirements.txt"
~~~

If the Windows `py` launcher is unavailable, use the full path to a CPython 3.12
executable for the first command. Verify the version before creating the environment.

On macOS/Linux, use `python3.12 -m venv .venv`, then
`.venv/bin/python -m pip install -r altium-library-migrate/scripts/requirements.txt`.
Run the same Python helpers with that executable and paths for your platform.
Native Altium Designer import steps require Windows. Validate engine wheels and
font availability on your platform; the migration tests were exercised on Windows.

Altium Monkey is a separately installed dependency with its own license; see the
[upstream project](https://github.com/wavenumber-eng/altium_monkey). The adapter
uses binary/font/model APIs, including internal interfaces. Verify another
engine version with the test suite before using it on project libraries.

## Analyze and generate

~~~powershell
& $python "$skill\scripts\migrate.py" analyze --root 'D:\Altium\Project-A' --root 'D:\Altium\Project-B' --output 'D:\MigrationRuns\run-01-audit'

& $python "$skill\scripts\migrate.py" build --root 'D:\Altium\Project-A' --root 'D:\Altium\Project-B' --output 'D:\MigrationRuns\run-01-build'
~~~

Use the same roots, optional --profile, and optional repeated --exclude values
for both runs. Each output must be a new directory. Exit 0 means local checks
passed; exit 2 means a blocking finding or invalid input. Check audit.json even
after exit 0: missing metadata and deterministic alias-precedence decisions
remain review findings.

Analyze writes JSON/Markdown reports and the resolved rules. It round-trips
temporary normalized SchLib copies in the system temporary directory and removes
those copies at the end. It does not leave import binaries. Build retains flat/
SchLibs, a batch manifest, and consolidated/Consolidated.SchLib plus its PcbLib,
component-map CSV, provenance JSON and verification manifest. A symbol-only
migration produces no PcbLib. artifacts.json records generated binary hashes.
Source hashes are checked before and after every run.
Byte-identical SchLib files are examined in each original folder, since relative
footprint resolution can differ; the inventory still records content duplicates.

The flat/ folder is an alternative importer source for all normalized libraries.
Use consolidated/Consolidated.SchLib for the deduplicated import. Do not add both.
Do not separately add the PcbLib unless intentionally importing unreferenced
model items. It contains every unique source library's footprints, including
unreferenced ones; the SchLib references only its selected models.

Paths in generated model records are absolute. Keep output in its final staging
location. If moving to another machine/location, regenerate there. The generated
content is new component/model staging; source Workspace links are removed from
SchLib records. Original library files are never saved.

## Importer configuration

1. In Altium connected to the intended Workspace, add the consolidated SchLib.
2. Split by Parameter Grouping: ComponentType. Confirm every logical group.
3. Select existing component types/templates, folders, lifecycle and revision
   schemes appropriate for that Workspace. Export an lmcfg.
4. Normalize the export using this build's manifest:

~~~powershell
& $python "$skill\scripts\normalize_config.py" --input 'D:\MigrationRuns\exported.lmcfg' --manifest 'D:\MigrationRuns\run-01-build\consolidated\Consolidated.manifest.json' --output 'D:\MigrationRuns\run-01-config'
~~~

The result is normalized.lmcfg and config-audit.json. The normalizer reads the
actual SchLib and verifies coverage against the manifest. Canonical parameter
mappings include Comment. MFR+MPN / Supplier+SPN Part Choices are enabled only
for groups containing at least one complete pair; blank rows remain blank.
Canonical ordinary parameters, including the compiled Comment parameter, use
the observed Source=2. Verify that mapping against a fresh export from the
target Altium version; do not invent a schema from parameter names alone.

Name is a separate system field. By default, the normalizer preserves its
exported mapping, even when it reads Comment or MPN. When the user wants the
cleaned Comment as the readable Name, add `--name-from-comment`. This requires
nonempty canonical Comments for every source component, leaves Item ID and
Description mappings unchanged, and records Name mappings in config-audit.json.
It does not format Comments or enrich Descriptions; prepare those values first.

Use --rebind-source only when intentionally adapting a same-schema export to a
different consolidated SchLib. One split parent and every logical group must
match; arbitrary multi-library exports, standalone PcbLib entries, missing groups,
skipped groups and invented fallback IDs are refused.

This generic normalizer targets the original consolidation manifest with
ComponentType grouping and canonical primary Part Choices. A later validated
package may use a separate Import Group parameter and additional manufacturer/
supplier pairs. Preserve that actual configuration for narrow metadata edits;
do not run the generic normalizer blindly and drop extra mappings. See
[metadata preparation](metadata-preparation.md).

If a logical type cannot be added with the user's permissions, provide
--fallbacks path-to.json containing a fallbacks object. The target type/template
must already appear as a native group in the export. SubLibraryName retains the
logical group (e.g. Consolidated.Data Converters), while ComponentType and
ComponentTemplate use the exported fallback's settings. Prefer exporting a fresh
target configuration when its schema differs; do not create GUIDs from scratch.

5. Load the normalized configuration, then Refresh and Validate in Altium.
   Verify required template parameters, missing Comments/part metadata, duplicate
   MPN variants, rendered symbols, pad maps, and expected model counts.
6. Perform import/release when authorized, or hand off to the user when they
   prefer the UI. Preserve existing authorization; do not request it repeatedly.

Local configuration generation cannot verify current Workspace permissions or
change an existing template. The scripts do not contain an import or delete mode.

## Checks

~~~powershell
& $python -m unittest discover -s "$skill\tests" -v
~~~

The tests create temporary synthetic libraries and require no private project
files. For an actual migration, check source hashes, saved/reopened binaries,
electrical and rendered symbol equivalence, and native importer validation.
See [validation](validation.md) for the boundaries of these checks.
