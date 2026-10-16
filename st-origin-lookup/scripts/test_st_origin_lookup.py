"""Offline contract and CLI tests; fixtures are synthetic, not origin evidence."""

import copy
import csv
import io
import json
import subprocess
import sys
import unittest
from pathlib import Path

import st_origin_lookup as lookup

PARENT = "PF100"
PRODUCT = "CP200"
PART = "STM32EXAMPLEU6"
STAMP = "2026-01-01T12:00:00Z"


def capture():
    return {
        "schema": "st-origin-capture-v1",
        "captured_at_utc": STAMP,
        "parent_id": PARENT,
        "products": [
            {"item_name": PART, "prmis_id": PRODUCT, "parent_id": PARENT},
            {"item_name": PART + "TR", "prmis_id": "CP201", "parent_id": PARENT},
        ],
        "attributes": {
            PRODUCT: [{"prmis_id": PRODUCT, "attribute_name": "5080", "attribute_value": "FRANCE"}],
            "CP201": [{"prmis_id": "CP201", "attribute_name": "5080", "attribute_value": "CHINA"}],
        },
    }


class OriginContractTests(unittest.TestCase):
    def normalize(self, rows):
        return lookup.normalize_attributes(PART, PRODUCT, PARENT, rows, STAMP, "browser_capture")

    def test_exact_suffix_mapping(self):
        result = lookup.select_products(capture()["products"], PARENT, [PART + "TR"])
        self.assertEqual(result, [(PART + "TR", "CP201")])
        with self.assertRaises(lookup.LookupFailure):
            lookup.select_products(capture()["products"], PARENT, ["STM32EXAMPLE"])

    def test_duplicate_and_wrong_family_mapping_fail(self):
        rows = capture()["products"]
        with self.assertRaises(lookup.LookupFailure):
            lookup.select_products(rows + [copy.deepcopy(rows[0])], PARENT, [PART])
        rows[0]["parent_id"] = "PF999"
        with self.assertRaises(lookup.LookupFailure):
            lookup.select_products(rows, PARENT, [PART])

    def test_wrong_product_attributes_fail(self):
        with self.assertRaises(lookup.LookupFailure):
            self.normalize(capture()["attributes"]["CP201"])

    def test_missing_or_empty_origin_remains_unknown(self):
        for rows in ([], [{"prmis_id": PRODUCT, "attribute_name": "5080", "attribute_value": ""}]):
            result = self.normalize(rows)
            self.assertEqual(result["coo_status"], "missing")
            self.assertIsNone(result["declared_country_of_origin"])
            self.assertEqual(result["manufacturing_locations_status"], "not_verified")

    def test_distinct_origins_are_not_silently_selected(self):
        rows = capture()["attributes"][PRODUCT]
        rows.append({"prmis_id": PRODUCT, "attribute_name": "5080", "attribute_value": "CHINA"})
        result = self.normalize(rows)
        self.assertEqual(result["coo_status"], "ambiguous")
        self.assertIsNone(result["declared_country_of_origin"])
        self.assertEqual(result["reported_values"], ["FRANCE", "CHINA"])

    def test_declared_country_does_not_populate_manufacturing_sites(self):
        result = self.normalize(capture()["attributes"][PRODUCT])
        self.assertEqual(result["declared_country_of_origin"], "FRANCE")
        for field in ("wafer_fabrication_country", "assembly_country", "test_country"):
            self.assertIsNone(result[field])
        self.assertEqual(result["observed_at_utc"], STAMP)

    def test_capture_identity_and_timezone(self):
        self.assertEqual(lookup.validate_capture(capture()), (PARENT, STAMP))
        with self.assertRaises(lookup.LookupFailure):
            lookup.validate_capture(capture(), "PF999")
        bad = capture()
        bad["captured_at_utc"] = "2026-01-01T12:00:00"
        with self.assertRaises(lookup.LookupFailure):
            lookup.validate_capture(bad)

    def test_malformed_attribute_data_fails(self):
        for rows in (
            {},
            [{"prmis_id": PRODUCT, "attribute_name": "5080"}],
            [{"prmis_id": PRODUCT, "attribute_name": "5080", "attribute_value": ["FRANCE"]}],
        ):
            with self.assertRaises(lookup.LookupFailure):
                self.normalize(rows)

    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, "-B", str(Path(lookup.__file__)), "--capture", "-", *args],
            input=json.dumps(capture()), text=True, capture_output=True, timeout=10,
        )

    def test_cli_json_and_csv_preserve_capture_time_and_exact_parts(self):
        result = self.run_cli("--part", PART + "TR")
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads(result.stdout)["records"][0]
        self.assertEqual(record["declared_country_of_origin"], "CHINA")
        self.assertEqual(record["observed_at_utc"], STAMP)
        result = self.run_cli("--format", "csv")
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = list(csv.DictReader(io.StringIO(result.stdout)))
        self.assertEqual([row["part_number"] for row in rows], [PART, PART + "TR"])

    def test_cli_unmatched_part_has_nonzero_exit_and_no_false_result(self):
        result = self.run_cli("--part", "MISSING")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertIn("No exact ordering-code match", result.stderr)


if __name__ == "__main__":
    unittest.main()
