"""Run the synthetic PowerShell launcher checks on Windows CI and workstations."""
import os
from pathlib import Path
import subprocess
import unittest


@unittest.skipUnless(os.name == "nt", "Windows launcher requires PowerShell")
class WindowsLauncherTests(unittest.TestCase):
    def test_credential_isolation_failure_handling_and_environment_restoration(self):
        script = Path(__file__).with_suffix(".ps1")
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
            text=True, capture_output=True, timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
