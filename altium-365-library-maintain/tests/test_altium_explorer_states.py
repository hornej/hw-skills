import base64
import copy
import hashlib
from contextlib import redirect_stderr
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import altium_explorer_states as explorer
from altium_panel_probe import ProbeError


EXPECTED = {"ITEM-A-1": "Draft", "ITEM-B-2": "Superseded"}
REQUEST = {"workspace": "Example Workspace", "query": "Example part", "pid": 7, "hwnd": 22,
           "component_name": "Example part", "ids": list(EXPECTED)}


def worker_report():
    return {"workspace": REQUEST["workspace"], "query": REQUEST["query"], "pid": 7, "host_hwnd": 22,
            "observed_utc": "2026-01-01T12:00:00Z", "worker_ms": 100,
            "rows": [
                {"revision_id": revision, "state": state, "name": "Example part", "row_index": index,
                 "row_runtime_id": [7, index + 1]}
                for index, (revision, state) in enumerate(EXPECTED.items())]}


def snapshot(hwnd=22):
    return {"application": {"pid": 7, "created_filetime": 10, "main_hwnd": 11},
            "input_desktop": "Default", "foreground": {"pid": 7, "hwnd": 11},
            "panels": {"explorer": [{"hwnd": hwnd, "pid": 7, "panel_ancestor": 21}]}}


class ExplorerStatesTest(unittest.TestCase):
    def test_literal_roster_allows_custom_ids_and_rejects_invalid_input(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "expected.json"
            p.write_text(json.dumps(EXPECTED), encoding="utf-8")
            self.assertEqual(explorer.load_expected(p), EXPECTED)
            for invalid in ('{"ITEM-A-1":"Draft","ITEM-A-1":"Released"}', '["ITEM-A-1"]',
                            '{"ITEM-A-1":NaN}', '{"ITEM-A-1":" "}', '{" ITEM-A-1":"Draft"}',
                            '{"ITEM-A-1":"Draft"} {"ITEM-B-2":"Draft"}'):
                with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                    p.write_text(invalid, encoding="utf-8")
                    explorer.load_expected(p)

    def test_wrong_scope_or_roster_fails_closed(self):
        for key, bad in (("workspace", "Different Workspace"), ("query", "Wrong search"),
                         ("pid", 8), ("host_hwnd", 23)):
            with self.subTest(key=key), self.assertRaises(ProbeError):
                explorer.verify_rows({**worker_report(), key: bad}, REQUEST, EXPECTED)
        mutations = (("revision_id", "ITEM-A-1"), ("revision_id", "OTHER-1"),
                     ("name", "Other part"), ("state", None), ("row_index", 0),
                     ("row_runtime_id", [7, 1]), ("row_runtime_id", [True]))
        for key, bad in mutations:
            with self.subTest(row_key=key, bad=bad), self.assertRaises(ProbeError):
                report = worker_report()
                report["rows"][1][key] = bad
                explorer.verify_rows(report, REQUEST, EXPECTED)
        with self.assertRaises(ProbeError):
            explorer.verify_rows({**worker_report(), "rows": []}, REQUEST, EXPECTED)

    def test_match_and_state_mismatch_preserve_the_exact_roster(self):
        for observed_state, expected_match in (("Draft", True), ("Superseded", False)):
            with self.subTest(observed_state=observed_state):
                report = worker_report()
                report["rows"][0]["state"] = observed_state
                native = Mock()
                native.capture.side_effect = [snapshot(), snapshot()]
                result = explorer.read_states(REQUEST["workspace"], REQUEST["query"], EXPECTED,
                                              "Audit reader", component_name=REQUEST["component_name"],
                                              native=native, reader=Mock(return_value=report))
                self.assertEqual(result["matches_expected"], expected_match)
                self.assertEqual(result["observed"]["ITEM-A-1"], observed_state)
                self.assertEqual(result["evidence_scope"], "currently_loaded_visible_explorer_rows")
                self.assertFalse(result["server_refresh_performed"])
                self.assertFalse(result["durable_server_state_verified"])
                self.assertFalse(result["rows_read_atomically"])
                self.assertEqual(result["application"], snapshot()["application"])
                self.assertEqual(len(result["panel_probe_sha256"]), 64)

    def test_host_replacement_discards_worker_result(self):
        native = Mock()
        native.capture.side_effect = [snapshot(), snapshot(hwnd=23)]
        with self.assertRaises(ProbeError):
            explorer.read_states(REQUEST["workspace"], REQUEST["query"], EXPECTED,
                                 "Audit reader", native=native, reader=Mock(return_value=worker_report()))

    def test_bridge_uses_structured_arguments_and_rejects_failure(self):
        request = copy.deepcopy(REQUEST)
        request["query"] = "Part 'quoted' & $literal"
        worker = {"ok": True, "exitCode": 0, "stdout": json.dumps(worker_report())}
        runner = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps(worker), ""))
        with patch.object(explorer.shutil, "which", return_value="bridge.exe"):
            report = explorer.bridge_read(request, "Caller Name", runner)
            self.assertEqual(report["worker_sha256"], hashlib.sha256(explorer.WORKER.read_bytes()).hexdigest())
            args, kwargs = runner.call_args
            self.assertEqual(args[0][:4], ["bridge.exe", "--ai-thread", "Caller Name", "run_script"])
            self.assertFalse(kwargs["shell"])
            script = base64.b64decode(json.loads(args[0][4])["scriptB64"]).decode()
            encoded_request = script.split("FromBase64String('", 1)[1].split("'", 1)[0]
            self.assertEqual(json.loads(base64.b64decode(encoded_request)), request)
            runner.return_value = subprocess.CompletedProcess([], 1, json.dumps(worker), "")
            with self.assertRaises(ProbeError):
                explorer.bridge_read(request, "Caller Name", runner)

    def test_existing_output_stops_before_native_discovery(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "existing.json"
            p.write_text("retained", encoding="utf-8")
            args = ["reader", "--workspace", "Example Workspace", "--query", "Example part",
                    "--expected", str(p), "--ai-thread", "Audit reader", "--out", str(p)]
            with patch.object(sys, "argv", args), patch.object(explorer, "read_states") as reader, redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as raised:
                    explorer.main()
                self.assertEqual(raised.exception.code, 2)
                reader.assert_not_called()
            self.assertEqual(p.read_text(encoding="utf-8"), "retained")


if __name__ == "__main__":
    unittest.main()
