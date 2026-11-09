"""Read an exact visible Altium Explorer lifecycle cohort through scoped UIA."""

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import unicodedata

import altium_panel_probe as panels


WORKER = Path(__file__).with_name("Read-AltiumExplorerStates.ps1")
MAX_ROWS = 20


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key!r}")
        result[key] = value
    return result


def literal(value):
    return (isinstance(value, str) and 0 < len(value) <= 256 and value == value.strip()
            and not any(unicodedata.category(ch).startswith("C") for ch in value))


def load_expected(path):
    expected = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_object)
    if (not isinstance(expected, dict) or not 1 <= len(expected) <= MAX_ROWS
            or not all(literal(revision) and literal(state) for revision, state in expected.items())):
        raise ValueError(f"Expected an object of 1–{MAX_ROWS} literal revision IDs mapped to lifecycle states.")
    return expected


def verify_rows(report, request, expected):
    if not isinstance(report, dict) or any(report.get(report_key) != request[key] for report_key, key in (
            ("workspace", "workspace"), ("query", "query"), ("pid", "pid"), ("host_hwnd", "hwnd"))):
        raise panels.ProbeError("Worker returned a different Explorer workspace, query, or host.")
    rows = report.get("rows")
    if not isinstance(rows, list) or len(rows) != len(expected):
        raise panels.ProbeError("Explorer did not return the complete exact visible roster.")
    observed, runtime_ids = {}, set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or type(row.get("row_index")) is not int or row["row_index"] != index:
            raise panels.ProbeError("Explorer returned an invalid row index.")
        revision, state, name = row.get("revision_id"), row.get("state"), row.get("name")
        runtime = row.get("row_runtime_id")
        if (not literal(revision) or revision not in expected or revision in observed
                or not literal(state) or not isinstance(name, str)
                or request["component_name"] is not None and name != request["component_name"]
                or not isinstance(runtime, list) or not runtime or any(type(part) is not int for part in runtime)
                or tuple(runtime) in runtime_ids):
            raise panels.ProbeError("Explorer returned a malformed, duplicate, or unexpected row.")
        observed[revision] = state
        runtime_ids.add(tuple(runtime))
    if observed.keys() != expected.keys():
        raise panels.ProbeError("Explorer did not return the exact expected revision IDs.")
    return observed


def encoded(value):
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def bridge_read(request, thread, runner=subprocess.run):
    cli = shutil.which("adom-bridge-cli.exe")
    if not cli:
        raise panels.ProbeError("Adom Bridge CLI is unavailable.")
    parameters = encoded(json.dumps(request, ensure_ascii=True, separators=(",", ":")))
    prefix = ("$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"
              + parameters + "')) | ConvertFrom-Json\n")
    worker = WORKER.read_bytes()
    payload = {"interpreter": "powershell", "scriptB64": encoded(prefix + worker.decode("utf-8")),
               "timeoutSeconds": 20, "reason": "Read exact visible Altium Explorer revision states"}
    result = runner([cli, "--ai-thread", thread, "run_script", json.dumps(payload, separators=(",", ":"))],
                    shell=False, capture_output=True, text=True, encoding="utf-8", timeout=25,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    envelope = json.loads(result.stdout, object_pairs_hook=unique_object) if result.stdout else {}
    try:
        reply = panels.unwrap_bridge(envelope)
    except panels.ProbeError as error:
        worker_error = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", str(envelope.get("stderr", "")))
        if worker_error:
            raise panels.ProbeError(f"{error}\n{worker_error[-1000:].strip()}") from error
        raise
    if result.returncode or reply.get("exitCode") != 0 or not isinstance(reply.get("stdout"), str):
        raise panels.ProbeError("Explorer worker did not return a successful readback.")
    report = json.loads(reply["stdout"], object_pairs_hook=unique_object)
    if not isinstance(report, dict):
        raise panels.ProbeError("Explorer worker did not return a JSON object.")
    return {**report, "worker_sha256": hashlib.sha256(worker).hexdigest()}


def read_states(workspace, query, expected, thread, *, component_name=None, pid=None,
                native=None, reader=bridge_read):
    started = time.monotonic()
    native = native if native is not None else panels.NativeWindows()
    before = native.capture(pid)
    explorer = panels.select_panel(before, "explorer")
    request = {"pid": explorer["pid"], "hwnd": explorer["hwnd"], "workspace": workspace,
               "query": query, "component_name": component_name, "ids": list(expected)}
    report = reader(request, thread)
    after = native.capture(pid)
    panels.validate_readback(before, after, "explorer")
    observed = verify_rows(report, request, expected)
    return {**report, "expected": expected, "observed": observed,
            "matches_expected": observed == expected, "read_only": True,
            "evidence_scope": "currently_loaded_visible_explorer_rows",
            "rows_read_atomically": False, "application": before["application"],
            "panel_probe_sha256": hashlib.sha256(Path(panels.__file__).read_bytes()).hexdigest(),
            "server_refresh_performed": False, "durable_server_state_verified": False,
            "foreground_changed_during_read": before["foreground"] != after["foreground"],
            "total_ms": round((time.monotonic() - started) * 1000)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, help="Exact visible Explorer workspace name.")
    parser.add_argument("--query", required=True, help="Exact value already loaded in the Explorer search field.")
    parser.add_argument("--expected", required=True, type=Path, help="JSON object mapping exact revision IDs to expected states.")
    parser.add_argument("--ai-thread", required=True, help="Caller identity for Adom Bridge.")
    parser.add_argument("--component-name", help="Optional exact Name for every row in the cohort.")
    parser.add_argument("--pid", type=int, help="Select the intended Altium process.")
    parser.add_argument("--out", type=Path, help="Also save the JSON report to a new file.")
    args = parser.parse_args()
    if not all(literal(value) for value in (args.workspace, args.query, args.ai_thread)):
        parser.error("Workspace, query, and caller identity must be nonblank literal text.")
    if args.component_name is not None and not literal(args.component_name):
        parser.error("Component name must be nonblank literal text.")
    if args.pid is not None and args.pid < 1:
        parser.error("PID must be positive.")
    if args.out and args.out.exists():
        parser.error("Output already exists. Choose a new file.")
    expected = load_expected(args.expected)
    report = read_states(args.workspace, args.query, expected, args.ai_thread,
                         component_name=args.component_name, pid=args.pid)
    data = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.out:
        with args.out.open("x", encoding="utf-8") as output:
            output.write(data)
    print(data, end="")
    return 0 if report["matches_expected"] else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f"STOP: {error}", file=sys.stderr)
        sys.exit(2)
