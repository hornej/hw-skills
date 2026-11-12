"""Synthetic exported files exercise the real pinned CAM parser."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "inspect_manufacturing.py"
spec = importlib.util.spec_from_file_location("cam_review", SCRIPT)
cam = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cam)

GERBER = """G04 Synthetic review fixture*
%FSLAX24Y24*%
%MOMM*%
%ADD10C,0.100*%
D10*
X000000Y000000D02*
X200000Y000000D01*
X200000Y100000D01*
X000000Y100000D01*
X000000Y000000D01*
M02*
"""
DRILL = """M48
;TYPE=PLATED
METRIC,TZ
T01C0.600
%
T01
X5.000Y5.000
M30
"""


class ManufacturingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.input = self.root / "cam"
        self.input.mkdir()
        for name, text in [("board.gtl", GERBER), ("board.gbl", GERBER),
                           ("board.gko", GERBER), ("board.drl", DRILL)]:
            (self.input / name).write_text(text)

    def inspect(self, **kwargs):
        return cam.inspect_package(self.input, **kwargs)

    def test_units_roles_geometry_previews_and_unchanged_sources(self):
        before = {p: p.read_bytes() for p in self.input.iterdir()}
        report, previews = self.inspect(render=True, required=["top copper", "bottom copper", "outline", "drill"])
        self.assertEqual(report["coverage"]["source_stability"], "unchanged")
        self.assertEqual(report["coverage"]["package_parsing"], "parsed")
        self.assertEqual(report["findings"], [])
        self.assertEqual(len(previews), 4)
        self.assertTrue(all("<svg" in svg for svg in previews.values()))
        drill = next(f for f in report["files"] if f["format"] == "excellon")
        self.assertEqual(drill["drill_diameters_mm"], [0.6])
        self.assertEqual(before, {p: p.read_bytes() for p in self.input.iterdir()})
        self.assertEqual(report["coverage"]["vendor_dfm"], "not_run")

    def test_missing_expected_layer_is_reported(self):
        (self.input / "board.gbl").unlink()
        report, _ = self.inspect(required=["bottom copper"])
        self.assertIn({"code": "required_role_missing", "role": "bottom copper"}, report["findings"])

    def test_shifted_drill_is_not_hidden_by_matching_counts(self):
        (self.input / "board.drl").write_text(DRILL.replace("X5.000", "X105.000"))
        report, _ = self.inspect()
        self.assertIn("drill_outside_outline_bounds", [f["code"] for f in report["findings"]])

    def test_ambiguous_filename_requires_mapping(self):
        (self.input / "board.gtl").rename(self.input / "layer.gbr")
        report, _ = self.inspect()
        self.assertIn("unclassified_layer", [f["code"] for f in report["findings"]])
        mapping = self.root / "map.json"
        mapping.write_text(json.dumps({"layers": {"layer.gbr": "top copper"}}))
        report, _ = self.inspect(layer_map=mapping)
        self.assertNotIn("unclassified_layer", [f["code"] for f in report["findings"]])

    def test_malformed_and_unknown_files_stay_visible(self):
        (self.input / "broken.gbr").write_text("%FSLAX24Y24*%\n%MOMM*%\nD10*\nX100Y100D01*\nM02*\n")
        (self.input / "mystery.bin").write_bytes(b"not a manufacturing file")
        report, _ = self.inspect()
        by_name = {f["path"]: f for f in report["files"]}
        self.assertEqual(by_name["broken.gbr"]["status"], "error")
        self.assertEqual(by_name["mystery.bin"]["status"], "unparsed")
        self.assertEqual(report["coverage"]["package_parsing"], "incomplete")

    def test_ipc356_records_are_preserved(self):
        record = f'327{"VCC":<14}   {"U1":<6}-{1:<4}       A01X+005000Y+005000X1000Y1000R000'
        (self.input / "board.d356").write_text('P  UNITS CUST 1\n' + record + '\n999\n')
        report, _ = self.inspect()
        entry = next(f for f in report["files"] if f["path"] == "board.d356")
        self.assertEqual(entry["test_records"][0]["refdes"], "U1")
        self.assertEqual(entry["test_records"][0]["net"], "VCC")
        self.assertEqual(entry["test_records"][0]["pin"], "1")
        self.assertAlmostEqual(entry["test_records"][0]["x_mm"], 5.0)

    def test_cli_creates_report_and_refuses_overwrite_or_nested_output(self):
        out = self.root / "review"
        command = [sys.executable, str(SCRIPT), str(self.input), "--out", str(out), "--render"]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = (out / "report.json").read_bytes()
        self.assertEqual(subprocess.run(command, capture_output=True).returncode, 2)
        self.assertEqual(report, (out / "report.json").read_bytes())
        result = subprocess.run([sys.executable, str(SCRIPT), str(self.input), "--out", str(self.input / "out")], capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertFalse((self.input / "out").exists())

    def test_duplicate_roles_and_unknown_plating_remain_findings(self):
        (self.input / "copy.gtl").write_text(GERBER)
        (self.input / "board.drl").write_text(DRILL.replace(";TYPE=PLATED\n", ""))
        report, _ = self.inspect()
        codes = [f["code"] for f in report["findings"]]
        self.assertIn("duplicate_role", codes)
        self.assertIn("plating_unknown_or_mixed", codes)

    def test_explicit_map_conflicting_with_x2_attributes_is_reported(self):
        target = self.input / "board.gtl"
        target.write_text(GERBER.replace('%MOMM*%', '%MOMM*%\n%TF.FileFunction,Copper,L1,Top*%'))
        mapping = self.root / "map.json"
        mapping.write_text(json.dumps({"layers": {"board.gtl": "bottom copper"}}))
        report, _ = self.inspect(layer_map=mapping)
        self.assertIn("layer_attribute_conflict", [f["code"] for f in report["findings"]])

    def test_source_change_during_parsing_invalidates_snapshot(self):
        from gerbonara import GerberFile
        original = GerberFile.from_string
        target = self.input / "board.gtl"
        def changing_parser(*args, **kwargs):
            target.write_text(GERBER + 'G04 changed during parse*\n')
            return original(*args, **kwargs)
        with patch.object(GerberFile, "from_string", side_effect=changing_parser):
            report, _ = self.inspect()
        self.assertEqual(report["coverage"]["source_stability"], "changed")
        self.assertIn("source_changed", [f["code"] for f in report["findings"]])


if __name__ == "__main__":
    unittest.main()
