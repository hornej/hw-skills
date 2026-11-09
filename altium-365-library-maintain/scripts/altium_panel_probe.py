#!/usr/bin/env python3
"""Discover current Altium panel hosts and perform scoped, read-only UIA queries.

No clicks, key presses, focus changes, settings changes, or library writes.
Windows discovery uses native observation; UIA queries use Adom Bridge.
"""

import argparse
from contextlib import contextmanager
import ctypes
from ctypes import wintypes
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time


PANEL_TITLES = {"components": "Components", "explorer": "Explorer"}
READ_VERBS = ("desktop_find_control", "desktop_find_controls")


class ProbeError(RuntimeError):
    pass


def panel_hosts(windows, pid):
    """Find visible WPF hosts below named panel ancestors, never by coordinates."""
    by_id = {w["hwnd"]: w for w in windows}
    if len(by_id) != len(windows):
        raise ProbeError("Duplicate native window handles in snapshot")
    result = {name: [] for name in PANEL_TITLES}
    for window in windows:
        if (window["pid"] != pid or not window["visible"]
                or not window["class"].startswith("HwndWrapper[")):
            continue
        seen, chain, current = set(), [], window
        while current:
            if current["hwnd"] in seen:
                raise ProbeError("Cycle in native window ancestry")
            seen.add(current["hwnd"])
            if current["pid"] != pid or not current["visible"]:
                break
            chain.append(current)
            names = [key for key, title in PANEL_TITLES.items() if current["title"] == title]
            if names:
                result[names[0]].append({"hwnd": window["hwnd"], "pid": pid,
                    "class": window["class"], "title": window["title"],
                    "rect": window["rect"], "panel_ancestor": current["hwnd"],
                    "lineage": [{k: node[k] for k in ("hwnd", "pid", "class", "title")}
                                for node in chain]})
                break
            current = by_id.get(current["parent"])
    return result


def select_panel(snapshot, panel):
    if snapshot["input_desktop"] != "Default":
        raise ProbeError("Input desktop is not Default; no UIA query sent")
    choices = snapshot["panels"][panel]
    if len(choices) != 1:
        raise ProbeError(f"Expected one visible {panel} host, found {len(choices)}; no query sent")
    return choices[0]


def validate_readback(before, after, panel):
    if before["application"] != after["application"]:
        raise ProbeError("Altium process, start time, or main window changed during query")
    first, last = select_panel(before, panel), select_panel(after, panel)
    # Movement/resizing is harmless to an HWND-scoped read. Identity/ancestry is not.
    if {k: v for k, v in first.items() if k != "rect"} != {
            k: v for k, v in last.items() if k != "rect"}:
        raise ProbeError("Panel identity or ancestry changed during query; discard readback")


def unwrap_bridge(reply):
    """Reject errors at every wrapper level, including JSON-encoded CLI output."""
    combined, affirmative = {}, False
    for _ in range(8):
        if not isinstance(reply, dict):
            raise ProbeError("Bridge reply is not a JSON object")
        if (reply.get("success") is False or reply.get("ok") is False
                or reply.get("status") in {"error", "failed"} or reply.get("errorCode")
                or reply.get("error")):
            raise ProbeError(f"Bridge refused read: {reply.get('errorCode') or reply.get('error') or reply.get('status')}")
        affirmative |= reply.get("success") is True or reply.get("ok") is True
        combined.update({k: v for k, v in reply.items() if k not in {"output", "data"}})
        nested = reply.get("output", reply.get("data"))
        if isinstance(nested, str):
            try:
                nested = json.loads(nested)
            except ValueError as exc:
                raise ProbeError("Bridge returned non-JSON output") from exc
        if nested is None:
            if not affirmative:
                raise ProbeError("Bridge did not affirm success")
            return combined
        reply = nested
    raise ProbeError("Too many nested Bridge envelopes")


def bridge_find(hwnd, automation_id, thread, timeout=60, *, all_matches=False, runner=subprocess.run):
    if not automation_id.strip() or not thread.strip():
        raise ProbeError("A nonempty automation ID and caller thread are required")
    cli = shutil.which("adom-bridge-cli.exe")
    if not cli:
        raise ProbeError("Adom Bridge CLI is not installed/on PATH")
    verb = READ_VERBS[bool(all_matches)]
    args = {"hwnd": hwnd, "automationId": automation_id}
    if all_matches:
        args["maxResults"] = 100
    started = time.monotonic()
    completed = runner([cli, "--ai-thread", thread, verb, json.dumps(args)],
        shell=False, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=timeout, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if completed.returncode:
        raise ProbeError(f"Bridge query exited {completed.returncode}: {completed.stderr[:300]}")
    reply = unwrap_bridge(json.loads(completed.stdout))
    matches = reply.get("matches") if all_matches else [reply.get("best")]
    if (not isinstance(matches, list) or (all_matches and reply.get("count") != len(matches))
            or len(matches) >= 100 or reply.get("truncated")
            or any(not isinstance(m, dict) or m.get("automationId") != automation_id for m in matches)):
        raise ProbeError("UIA result is truncated, malformed, or does not match requested ID")
    return {"elapsed_seconds": round(time.monotonic() - started, 4),
            "verb": verb, "target_hwnd": hwnd, "automation_id": automation_id,
            "match_scope": "all-matches" if all_matches else "first-match",
            "control_id_uniqueness_verified": all_matches and len(matches) == 1,
            "matches": matches, "bridge_foreground_report": reply.get("foreground")}


class NativeWindows:
    """Win32 observation only. DPI context changes affect this calling thread only."""
    def __init__(self):
        if os.name != "nt":
            raise ProbeError("Native discovery requires Windows")
        self.u = ctypes.WinDLL("user32", use_last_error=True)
        self.k = ctypes.WinDLL("kernel32", use_last_error=True)
        self.callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        signatures = [
            (self.u, "EnumWindows", [self.callback_type, wintypes.LPARAM], wintypes.BOOL),
            (self.u, "EnumChildWindows", [wintypes.HWND, self.callback_type, wintypes.LPARAM], wintypes.BOOL),
            (self.u, "GetWindowThreadProcessId", [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)], wintypes.DWORD),
            (self.u, "GetClassNameW", [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int], ctypes.c_int),
            (self.u, "GetWindowTextW", [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int], ctypes.c_int),
            (self.u, "GetAncestor", [wintypes.HWND, wintypes.UINT], wintypes.HWND),
            (self.u, "GetWindowRect", [wintypes.HWND, ctypes.POINTER(wintypes.RECT)], wintypes.BOOL),
            (self.u, "IsWindowVisible", [wintypes.HWND], wintypes.BOOL),
            (self.u, "GetForegroundWindow", [], wintypes.HWND),
            (self.u, "SetThreadDpiAwarenessContext", [wintypes.HANDLE], wintypes.HANDLE),
            (self.u, "OpenInputDesktop", [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], wintypes.HANDLE),
            (self.u, "GetUserObjectInformationW", [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p,
                wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            (self.u, "CloseDesktop", [wintypes.HANDLE], wintypes.BOOL),
            (self.u, "SystemParametersInfoW", [wintypes.UINT, wintypes.UINT, ctypes.c_void_p,
                wintypes.UINT], wintypes.BOOL),
            (self.k, "OpenProcess", [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], wintypes.HANDLE),
            (self.k, "QueryFullProcessImageNameW", [wintypes.HANDLE, wintypes.DWORD,
                wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)], wintypes.BOOL),
            (self.k, "GetProcessTimes", [wintypes.HANDLE] + [ctypes.POINTER(wintypes.FILETIME)] * 4, wintypes.BOOL),
            (self.k, "CloseHandle", [wintypes.HANDLE], wintypes.BOOL),
        ]
        for library, name, args, result in signatures:
            function = getattr(library, name)
            function.argtypes, function.restype = args, result

    @contextmanager
    def physical_coordinates(self):
        old = self.u.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
        if not old:
            raise ProbeError("Cannot establish physical-pixel DPI context")
        try:
            yield
        finally:
            self.u.SetThreadDpiAwarenessContext(old)

    def window(self, hwnd):
        pid, rect = wintypes.DWORD(), wintypes.RECT()
        if not self.u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid)):
            return None
        if not self.u.GetWindowRect(hwnd, ctypes.byref(rect)):
            return None
        title, kind = ctypes.create_unicode_buffer(4096), ctypes.create_unicode_buffer(256)
        self.u.GetWindowTextW(hwnd, title, len(title))
        self.u.GetClassNameW(hwnd, kind, len(kind))
        return {"hwnd": int(hwnd), "pid": pid.value, "parent": int(self.u.GetAncestor(hwnd, 1) or 0),
            "class": kind.value, "title": title.value, "visible": bool(self.u.IsWindowVisible(hwnd)),
            "rect": [rect.left, rect.top, rect.right, rect.bottom]}

    def enumerate(self, parent=None):
        handles = []
        def callback(hwnd, _):
            handles.append(int(hwnd))
            return len(handles) < 20000
        cb = self.callback_type(callback)
        if parent is None:
            self.u.EnumWindows(cb, 0)
        else:
            self.u.EnumChildWindows(parent, cb, 0)
        if len(handles) >= 20000:
            raise ProbeError("Native window enumeration exceeded bound")
        return [node for handle in handles if (node := self.window(handle))]

    def process(self, pid):
        handle = self.k.OpenProcess(0x1000, False, pid)  # QUERY_LIMITED_INFORMATION
        if not handle:
            raise ProbeError(f"Cannot inspect process {pid}")
        try:
            path, size = ctypes.create_unicode_buffer(32768), wintypes.DWORD(32768)
            times = [wintypes.FILETIME() for _ in range(4)]
            if not self.k.QueryFullProcessImageNameW(handle, 0, path, ctypes.byref(size)):
                raise ProbeError("Cannot read Altium executable path")
            if not self.k.GetProcessTimes(handle, *(ctypes.byref(t) for t in times)):
                raise ProbeError("Cannot read Altium process start time")
            return {"pid": pid, "executable": path.value,
                "created_filetime": times[0].dwHighDateTime << 32 | times[0].dwLowDateTime}
        finally:
            self.k.CloseHandle(handle)

    def desktop(self):
        handle = self.u.OpenInputDesktop(0, False, 1)  # DESKTOP_READOBJECTS
        if not handle:
            return "unavailable"
        try:
            name, needed = ctypes.create_unicode_buffer(256), wintypes.DWORD()
            if not self.u.GetUserObjectInformationW(handle, 2, name, ctypes.sizeof(name), ctypes.byref(needed)):
                return "unavailable"
            return name.value
        finally:
            self.u.CloseDesktop(handle)

    def screen_saver(self):
        result = {}
        for key, action in (("enabled", 0x0010), ("timeout_seconds", 0x000E), ("password_required", 0x0076)):
            value = wintypes.UINT()
            success = self.u.SystemParametersInfoW(action, 0, ctypes.byref(value), 0)
            result[key] = value.value if success else None
        return result

    def capture(self, pid=None):
        with self.physical_coordinates():
            top = self.enumerate()
            mains = [w for w in top if w["visible"] and w["class"] == "TDocumentForm"
                     and "Altium Designer" in w["title"] and (pid is None or w["pid"] == pid)]
            if len(mains) != 1:
                raise ProbeError(f"Expected one Altium main window, found {len(mains)}; specify --pid if needed")
            main = mains[0]
            application = self.process(main["pid"])
            if Path(application["executable"]).name.casefold() != "x2.exe":
                raise ProbeError("Altium window does not belong to X2.exe")
            application["main_hwnd"] = main["hwnd"]
            windows = {w["hwnd"]: w for w in top if w["pid"] == main["pid"]}
            for window in list(windows.values()):
                if window["visible"]:
                    windows.update({w["hwnd"]: w for w in self.enumerate(window["hwnd"])
                                    if w["pid"] == main["pid"]})
            foreground = self.window(self.u.GetForegroundWindow())
            return {"schema_version": 1, "observed_utc": datetime.now(timezone.utc).isoformat(),
                "read_only": True, "application": application, "input_desktop": self.desktop(),
                "screen_saver": self.screen_saver(),
                "foreground": {k: foreground[k] for k in ("hwnd", "pid")} if foreground else None,
                "panels": panel_hosts(list(windows.values()), main["pid"])}


def probe(reader, panel=None, automation_id=None, thread="Altium read-only panel probe", timeout=60,
          finder=bridge_find, all_matches=False):
    before = reader.capture()
    if not panel:
        return before
    host = select_panel(before, panel)
    result = finder(host["hwnd"], automation_id, thread, timeout, all_matches=all_matches)
    after = reader.capture()
    validate_readback(before, after, panel)
    return {"schema_version": 1, "read_only": True, "before": before, "query": result, "after": after,
        "foreground_changed_during_read": before["foreground"] != after["foreground"],
        "foreground_attribution": "Observation only; concurrent desktop activity cannot be attributed to this read."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--panel", choices=sorted(PANEL_TITLES))
    parser.add_argument("--automation-id", help="Exact UIA automation ID; required with --panel")
    parser.add_argument("--pid", type=int, help="Select among multiple running Altium instances")
    parser.add_argument("--ai-thread", default="Altium read-only panel probe")
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--all-matches", action="store_true", help="Enumerate every matching control; can be much slower")
    parser.add_argument("--out", type=Path, help="Write a new JSON report; never overwrite")
    args = parser.parse_args()
    if bool(args.panel) != bool(args.automation_id):
        parser.error("--panel and --automation-id must be supplied together")
    if args.all_matches and not args.panel:
        parser.error("--all-matches requires a panel query")
    if not 1 <= args.timeout <= 120:
        parser.error("--timeout must be between 1 and 120 seconds")
    if args.out and args.out.exists():
        raise ProbeError("Output already exists; choose a new report path")
    native = NativeWindows()
    class Reader:
        def capture(self):
            return native.capture(args.pid)
    result = probe(Reader(), args.panel, args.automation_id, args.ai_thread, args.timeout,
                   all_matches=args.all_matches)
    payload = json.dumps(result, indent=2) + "\n"
    if args.out:
        with args.out.open("x", encoding="utf-8") as output:
            output.write(payload)
        print(json.dumps({"report": str(args.out.resolve()), "read_only": True}))
    else:
        print(payload)


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, OSError, ValueError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "stopped", "error": str(exc)}), file=sys.stderr)
        sys.exit(2)
