import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "altium_panel_probe.py"
spec = importlib.util.spec_from_file_location("altium_panel_probe", SCRIPT)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


def window(hwnd, parent, title, kind="TPanel", pid=7, visible=True):
    return dict(hwnd=hwnd, parent=parent, title=title, **{"class": kind},
                pid=pid, visible=visible, rect=[1, 2, 301, 402])


def topology():
    return [window(10, 0, "Demo - Altium Designer", "TDocumentForm"),
            window(11, 10, "Components"), window(12, 11, "elementHost", "HwndWrapper[demo]"),
            window(20, 0, ""), window(21, 20, "Explorer"),
            window(22, 21, "", "HwndWrapper[explorer]")]


def snapshot():
    return dict(application={"pid": 7, "created_filetime": 123, "main_hwnd": 10,
                             "executable": "C:/Altium/X2.exe"}, input_desktop="Default",
                panels=probe.panel_hosts(topology(), 7), foreground={"hwnd": 10, "pid": 7})


class PanelProbeTests(unittest.TestCase):
    def test_docked_and_floating_hosts(self):
        panels = probe.panel_hosts(topology(), 7)
        self.assertEqual([12], [w["hwnd"] for w in panels["components"]])
        self.assertEqual([22], [w["hwnd"] for w in panels["explorer"]])

    def test_hidden_and_foreign_hosts_are_excluded(self):
        windows = topology() + [window(30, 11, "", "HwndWrapper[hidden]", visible=False),
                                window(31, 11, "", "HwndWrapper[foreign]", pid=8)]
        self.assertEqual(1, len(probe.panel_hosts(windows, 7)["components"]))
        windows[1]["visible"] = False
        self.assertEqual([], probe.panel_hosts(windows, 7)["components"])

    def test_ambiguous_hosts_stop_before_bridge(self):
        state = snapshot()
        state["panels"]["components"].append(copy.deepcopy(state["panels"]["components"][0]))
        reader, finder = Mock(), Mock()
        reader.capture.return_value = state
        with self.assertRaisesRegex(probe.ProbeError, "found 2"):
            probe.probe(reader, "components", "ComponentsGrid", finder=finder)
        finder.assert_not_called()

    def test_ancestry_cycle_and_duplicate_handles_rejected(self):
        with self.assertRaisesRegex(probe.ProbeError, "Cycle"):
            probe.panel_hosts([window(1, 2, "", "HwndWrapper[demo]"), window(2, 1, "")], 7)
        with self.assertRaisesRegex(probe.ProbeError, "Duplicate"):
            probe.panel_hosts(topology() + [topology()[0]], 7)

    def test_locked_desktop_stops_before_bridge(self):
        for desktop in ("Screen-saver", "Winlogon", "unavailable"):
            state, finder = snapshot(), Mock()
            state["input_desktop"] = desktop
            with self.assertRaisesRegex(probe.ProbeError, "not Default"):
                probe.probe(Mock(capture=Mock(return_value=state)), "components", "ComponentsGrid", finder=finder)
            finder.assert_not_called()

    def test_pid_reuse_and_recycled_panel_discard_readback(self):
        before = snapshot()
        for mutate in (
            lambda x: x["application"].update(created_filetime=999),
            lambda x: x["panels"]["components"][0].update(hwnd=99),
            lambda x: x["panels"]["components"][0]["lineage"][1].update(hwnd=99),
            lambda x: x.update(input_desktop="Winlogon"),
        ):
            after = copy.deepcopy(before)
            mutate(after)
            with self.assertRaises(probe.ProbeError):
                probe.validate_readback(before, after, "components")

    def test_geometry_changes_do_not_invalidate_handle_scoped_read(self):
        before, after = snapshot(), snapshot()
        after["panels"]["components"][0]["rect"] = [400, 200, 900, 700]
        probe.validate_readback(before, after, "components")

    def test_foreground_change_is_observed_not_attributed(self):
        before, after = snapshot(), snapshot()
        after["foreground"] = {"hwnd": 100, "pid": 99}
        reader = Mock(capture=Mock(side_effect=[before, after]))
        finder = Mock(return_value={"matches": []})
        result = probe.probe(reader, "components", "ComponentsGrid", finder=finder)
        finder.assert_called_once_with(12, "ComponentsGrid", "Altium read-only panel probe", 60, all_matches=False)
        self.assertTrue(result["foreground_changed_during_read"])
        self.assertIn("cannot be attributed", result["foreground_attribution"])

    def test_envelope_accepts_nested_cli_and_data(self):
        value = {"success": True, "output": json.dumps({"ok": True, "data": {"matches": [], "count": 0}})}
        self.assertEqual([], probe.unwrap_bridge(value)["matches"])

    def test_envelope_never_masks_errors(self):
        cases = [
            {"success": True, "output": json.dumps({"success": False, "errorCode": "needs_approval"})},
            {"success": False, "data": {"success": True}},
            {"ok": True, "data": {"error": "failure"}},
            {"matches": []}, {"ok": True, "output": "not JSON"},
        ]
        for value in cases:
            with self.assertRaises(probe.ProbeError):
                probe.unwrap_bridge(value)

    @patch.object(probe.shutil, "which", return_value="bridge.exe")
    def test_cli_has_only_read_verb_and_literal_args(self, _):
        automation_id = "quoted'; $(literal)"
        runner = Mock(return_value=subprocess.CompletedProcess([], 0,
            stdout=json.dumps({"success": True, "best": {"automationId": automation_id}}), stderr=""))
        result = probe.bridge_find(12, automation_id, "test read", runner=runner)
        argv = runner.call_args.args[0]
        self.assertEqual(["bridge.exe", "--ai-thread", "test read", "desktop_find_control"], argv[:4])
        self.assertEqual({"hwnd": 12, "automationId": automation_id}, json.loads(argv[4]))
        self.assertFalse(runner.call_args.kwargs["shell"])
        self.assertEqual(12, result["target_hwnd"])
        self.assertFalse(result["control_id_uniqueness_verified"])

    @patch.object(probe.shutil, "which", return_value="bridge.exe")
    def test_truncated_and_wrong_selector_results_rejected(self, _):
        for reply in ({"success": True, "count": 0, "matches": [], "truncated": True},
                      {"success": True, "count": 1, "matches": [{"automationId": "wrong"}]}):
            runner = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps(reply), ""))
            with self.assertRaises(probe.ProbeError):
                probe.bridge_find(12, "ComponentsGrid", "test read", all_matches=True, runner=runner)

    @patch.object(probe.shutil, "which", return_value="bridge.exe")
    def test_explicit_enumeration_proves_only_returned_scope(self, _):
        runner = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps({"success": True,
            "count": 1, "matches": [{"automationId": "ComponentsGrid"}]}), ""))
        result = probe.bridge_find(12, "ComponentsGrid", "test read", all_matches=True, runner=runner)
        self.assertEqual("desktop_find_controls", runner.call_args.args[0][3])
        self.assertEqual(100, json.loads(runner.call_args.args[0][4])["maxResults"])
        self.assertTrue(result["control_id_uniqueness_verified"])

    @patch.object(probe.shutil, "which", return_value="bridge.exe")
    def test_timeout_is_not_retried(self, _):
        runner = Mock(side_effect=subprocess.TimeoutExpired("bridge.exe", 60))
        with self.assertRaises(subprocess.TimeoutExpired):
            probe.bridge_find(12, "ComponentsGrid", "test read", runner=runner)
        self.assertEqual(1, runner.call_count)

    def test_discovery_never_calls_bridge(self):
        finder = Mock()
        self.assertEqual(snapshot(), probe.probe(Mock(capture=Mock(return_value=snapshot())), finder=finder))
        finder.assert_not_called()


if __name__ == "__main__":
    unittest.main()
