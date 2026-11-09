# Scoped native Altium readback

Use `scripts/altium_panel_probe.py` when an authorized Windows automation run
needs current Components or Explorer panel handles, or a read-only UIA control
query. It requires Python 3.10+ and a running Altium Designer. Queries also need
Adom Bridge and `adom-bridge-cli.exe` on PATH. It does not require Altium Monkey.

```powershell
# Discover the current process, input desktop, screen-saver state and panel hosts.
python -B scripts/altium_panel_probe.py

# Query the Components grid through the newly discovered child host.
python -B scripts/altium_panel_probe.py --panel components --automation-id ComponentsGrid --ai-thread "Library audit readback" --out C:\audit\components-read.json

# Read the Explorer search field without setting or submitting it.
python -B scripts/altium_panel_probe.py --panel explorer --automation-id PART_EditableTextBox --ai-thread "Library audit readback"
```

The examples run from this skill folder. Create the private output directory
first; `--out` refuses existing files. Reports can contain paths, component names
and current field values. Keep them with project evidence, outside this reusable
repository. With multiple Altium instances, use `--pid` to select the intended
one; every invocation still checks its executable and process start time.

## Matching and performance

The helper discovers visible WPF hosts under the named Components or Explorer
ancestors. It checks process identity, input desktop and panel ancestry before
and after a query. Native handles are rediscovered on each invocation, so a
saved HWND is not treated as a permanent identifier. Moved/resized panels are
acceptable because the query targets the native handle, not a pixel position.

The default uses Adom Bridge `desktop_find_control`: the first exact automation
ID match. Its report explicitly does **not** certify that the control ID is
unique. Use `--all-matches` when that distinction matters; it uses
`desktop_find_controls` and rejects truncated or malformed results. Enumerating
the whole control subtree can be substantially slower than locating one control,
especially when the library grid has many loaded rows. Even an HWND-scoped
enumeration may be slow. Narrow the native host and choose the needed query
shape instead of assuming a timeout is a disconnected desktop.

Both modes are observation only. The only Bridge commands reachable from this
helper are those two read commands. It does not send input, activate windows,
change the screen saver, close documents, or publish revisions. A returned
panel handle is neither permission for a write nor a shared desktop lease.

## Session state and evidence limits

An input desktop other than `Default`, an inaccessible desktop, missing or
ambiguous panel hosts, process replacement, and changed panel ancestry stop
the query. Discovery can still report a non-default desktop. Screen-saver
enabled/timeout/password values are observations only; this tool never suspends
or restores a screen saver. Follow the project's existing owner and recovery
procedure when native input is required.

Foreground HWND/PID are observed before and after. If they differ, the report
says only that foreground changed during the read: concurrent human or agent
activity cannot be attributed to this command. This distinction does not relax
foreground guards for input or write operations. UIA names and process identity
also do not establish the connected Workspace, component revision, pin mapping,
saved state or a successful release; verify those through their own readbacks.

The Windows reader uses physical-pixel bounds by temporarily changing only the
calling thread's DPI context, restoring it afterward. It reads screen-saver
state with the GET forms of
[SystemParametersInfoW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-systemparametersinfow)
and follows parent windows with
[GetAncestor](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getancestor).

The English panel captions and WPF host classes were qualified on Altium
Designer Professional 26.11.1. Other UI languages/layout implementations need
qualification; no alternate caption or ambiguous host is guessed.

Altium Monkey remains useful for saved native-file inspection. This helper
supplies live UI control discovery only; neither capability supplies a general
Workspace write API or makes duplicate components equivalent.

## Exact Explorer state readback

`scripts/altium_explorer_states.py` reads a small, already loaded Explorer
cohort through UI Automation. It uses the sibling panel probe for discovery and
session validation, then an observation-only PowerShell worker through Adom
Bridge `run_script`. Unlike the panel probe, this route requires Bridge's script
execution capability. It sends no input and performs no refresh or state change.

From this skill directory:

```powershell
python -B scripts/altium_explorer_states.py --workspace "Example Workspace" --query "EXAMPLE-PART" --component-name "EXAMPLE-PART" --expected C:\audit\expected-states.json --ai-thread "Library lifecycle readback" --out C:\audit\states-read.json
```

The expected file maps exact revision IDs to states, for example:

```json
{"CMP-10001-1": "Draft", "CMP-10002-1": "Superseded"}
```

These names and states are synthetic; use the selected Workspace's actual
identities and lifecycle. The operator/controller must already have loaded the
intended query. The helper accepts 1–20 expected revisions and requires the
qualified English Explorer Generic Search layout: five columns, with Revision
ID, Revision State and Name at zero-based indices 1, 2 and 3. A different layout
stops the read rather than changing the user's view. The helper checks the
Workspace caption, current search value,
unique exact revision roster and row fields; missing, extra or duplicated rows
are errors. Use `--pid` if multiple Altium instances are running. Its output
records observed values separately from expectations. Exit 0 means the observed
states match, exit 1 means the exact roster has a state mismatch, and exit 2 means
the evidence or scope was invalid/unavailable. `--out` refuses an existing file.

The report includes the Altium process/start identity and helper hashes. Rows
are observed sequentially, not as an atomic snapshot; keep concurrent edits out
of the verification interval. This readback proves what the loaded visible rows
display. It does not establish
a server refresh, transition history, saved model equivalence or durable state.
After a lifecycle write, the controller must first refresh/requery and record
that step before using this readback as part of verification. Keep query bounds
small enough for all expected rows to be realized; never treat visible rows as
a whole-library inventory. See [Workspace automation](workspace-automation.md)
for evidence levels, cache checks, batching and resumable operations.

### Reducing readback latency

The Explorer worker combines the Workspace, search and grid selectors into one
UIA traversal at each end of the read, while still requiring each match to be
unique. A request-local UIA CacheRequest fetches row/cell properties together.
It is rebuilt on each invocation; it does not reuse values across edits or
refreshes. Both scope checks remain fresh and the exact expected roster is still
validated independently in Python.

In a local five-row qualification on Altium 26.11.1, three interleaved runs per
version reduced median fresh-process time from 4.80 s to 1.77 s. Worker time fell
from 4.20 s to 1.21 s. The reported identities and states matched, and live
negative checks rejected a wrong query and wrong roster. These are small-cohort
read timings; they do not predict editor acquisition or lifecycle-write speed.
Keep raw timing and equivalence reports with private project evidence.
