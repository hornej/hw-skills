import copy
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "sync_artifacts.py"
spec = importlib.util.spec_from_file_location("sync_artifacts", SCRIPT)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class SyncArtifactTests(unittest.TestCase):
    def source(self):
        return {"key_parameter": "Name", "columns": ["Name", "MFR", "SPN"],
                "rows": [{"Name": 'Part, "A"', "MFR": "Würth", "SPN": "000123-1-ND"}]}

    def test_roundtrip_preserves_text_and_hashes(self):
        source = self.source()
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / "run"
            manifest = helper.prepare(source, output)
            path = output / "data" / "components.csv"
            self.assertFalse(path.read_bytes().startswith(b"\xef\xbb\xbf"))
            with path.open(encoding="utf-8", newline="") as stream:
                self.assertEqual(list(csv.DictReader(stream)), source["rows"])
            for name, digest in manifest["files"].items():
                self.assertEqual(hashlib.sha256((output / name).read_bytes()).hexdigest(), digest)
            schema = (output / "data" / "schema.ini").read_text()
            self.assertIn("CharacterSet=65001", schema)
            self.assertIn("Col3=SPN Text Width 1024", schema)
            self.assertEqual({p.name for p in (output / "data").iterdir()},
                             {"components.csv", "schema.ini"})
            self.assertFalse(manifest["target_matches_verified"])

    def test_existing_output_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / "run"
            helper.prepare(self.source(), output)
            path = output / "data" / "components.csv"
            before = path.read_bytes()
            with self.assertRaises(FileExistsError):
                helper.prepare(self.source(), output)
            self.assertEqual(path.read_bytes(), before)

    def test_bad_sources_create_no_output(self):
        cases = []
        source = self.source()
        duplicate = copy.deepcopy(source["rows"][0])
        duplicate["Name"] = ' PART, "a" '
        source["rows"].append(duplicate)
        cases.append(source)
        for value in (" ", 123, None, "A\nB", "A" * 1025):
            source = self.source()
            source["rows"][0]["Name"] = value
            cases.append(source)
        source = self.source()
        source["rows"][0]["SPN"] = 123
        cases.append(source)
        for columns in (["Name", "name"], ["Name\nCol2=Bad"], []):
            source = self.source()
            source["columns"] = columns
            cases.append(source)
        source = self.source()
        del source["rows"][0]["SPN"]
        cases.append(source)
        source = self.source()
        source["key_parameter"] = "Missing"
        cases.append(source)
        with tempfile.TemporaryDirectory() as root:
            output = Path(root) / "run"
            for source in cases:
                with self.subTest(source=source):
                    with self.assertRaises(ValueError):
                        helper.prepare(source, output)
                    self.assertFalse(output.exists())

    def test_error_after_write_is_partial_and_unverified(self):
        result = helper.inspect_log(
            "INFO: Successfully written 1 item(s) to server. Item(s): CMP-001\n"
            "ERROR: Failed to synchronize. Error message: Insufficient privileges.\n"
            "Synchronization accomplished successfully\n")
        self.assertEqual(result["status"], "writes_reported_with_errors")
        self.assertEqual(result["reported_write_count"], 1)
        self.assertEqual(len(result["errors"]), 1)
        self.assertFalse(result["workspace_result_verified"])

    def test_zero_write_error_is_failure_despite_success_footer(self):
        result = helper.inspect_log(
            "INFO: Successfully written 0 item(s) to server.\n"
            "ERROR: Failed to write 1 item(s) to server. KeepLifecycleState not allowed.\n"
            "Synchronization accomplished successfully\n")
        self.assertEqual(result["status"], "server_error")
        self.assertEqual(result["reported_write_count"], 0)

    def test_success_messages_never_replace_live_readback(self):
        result = helper.inspect_log("INFO: Successfully written 2 item(s) to server.\n"
                                    "INFO: Successfully written 3 item(s) to server.\n")
        self.assertEqual(result["reported_write_count"], 5)
        self.assertEqual(result["status"], "writes_reported_unverified")
        self.assertTrue(result["live_readback_required"])
        self.assertEqual(helper.inspect_log("Synchronization accomplished successfully")["status"],
                         "inconclusive")

    def test_cli_rejects_uncertain_or_failed_log(self):
        with tempfile.TemporaryDirectory() as root:
            log = Path(root) / "server.txt"
            log.write_text("Insufficient privileges", encoding="utf-8")
            result = subprocess.run([sys.executable, str(SCRIPT), "inspect-log", "--input", str(log)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2)
            self.assertFalse(json.loads(result.stdout)["workspace_result_verified"])

    def test_error_summary_does_not_echo_private_log_content(self):
        result = helper.inspect_log('INFO: start\nERROR: RefreshToken="fixture-private-token"\n')
        self.assertEqual(result["status"], "server_error")
        self.assertEqual(result["errors"][0]["line"], 2)
        self.assertNotIn("fixture-private-token", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
