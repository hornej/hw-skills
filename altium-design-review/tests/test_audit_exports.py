import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from audit_exports import audit, compare_previous, nominal, read_project, read_table, references, write_new


class ExportAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "board.PrjPCB"
        self.project.write_text("[ProjectVariant1]\nDescription=Build A\nVariationCount=2\n"
                                "Variation1=Designator=R2|UniqueId=\\ChannelB\\UID2|Kind=1\n"
                                "Variation2=Designator=U1|UniqueId=\\IC1|Kind=2|AlternatePart=OtherChip\n"
                                "ParamVariationCount=1\nParamDesignator1=U1\n"
                                "ParamVariation1=ParameterName=MPN|VariantValue=ALT\n", encoding="utf-8")

    def csv(self, name, headers, rows, preamble="", encoding="utf-8"):
        path = self.root / name
        with path.open("w", encoding=encoding, newline="") as handle:
            handle.write(preamble)
            writer = csv.writer(handle)
            writer.writerow(headers)
            writer.writerows(rows)
        return path

    def test_dnp_leak_and_equal_count_set_difference(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "MFR", "MPN"],
                       [["R1, R2", 2, "Yageo", "A"]])
        pnp = self.csv("pnp.csv", ["Designator", "Footprint"], [["R1", "0201"], ["R3", "0201"]],
                       "Altium Pick and Place\nVariant: Build A\n\n")
        report = audit(self.project, "Build A", bom, pnp)
        self.assertEqual(report["reconciliation"]["dnp_present_in_bom"], ["R2"])
        self.assertEqual(report["reconciliation"]["bom_only"], ["R2"])
        self.assertEqual(report["reconciliation"]["pnp_only"], ["R3"])
        self.assertEqual(report["project"]["variations"][0]["UniqueId"], "\\ChannelB\\UID2")
        self.assertEqual(len(report["reconciliation"]["non_dnp_variations_for_review"]), 1)
        self.assertIn("ParamDesignator1", report["reconciliation"]["parameter_override_fields"])

    def test_missing_mpn_not_dropped_and_alias_conflict(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "MFR", "MFG", "MPN", "SPN"],
                       [["R1", 1, "Panasonic", "Yageo", "", "[NoParam], 123-ND"]])
        report = audit(self.project, "Build A", bom)
        self.assertEqual(report["summary"]["bom_rows"], 1)
        self.assertEqual(report["summary"]["potentially_fitted_references"], 1)
        self.assertEqual(report["bom"]["rows"][0]["mfr"], "")
        self.assertTrue({"alias_conflict", "placeholder_or_expression", "missing_purchasing_fields"}
                        <= {i["code"] for i in report["issues"]})

    def test_supplier_pairs_stay_together(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "Manufacturer 1", "Manufacturer Part Number 1",
                                   "Supplier 1", "Supplier Part Number 2"], [["R1", 1, "Yageo", "EXACT-1", "DigiKey", "MouserSKU"]])
        row = audit(self.project, "Build A", bom)["bom"]["rows"][0]
        self.assertEqual((row["mfr"], row["mpn"]), ("Yageo", "EXACT-1"))
        self.assertEqual((row["supplier"], row["spn"]), ("DigiKey", ""))
        self.assertEqual(row["choices"][1]["spn"], "MouserSKU")

    def test_ranges_and_ambiguous_channel_tokens(self):
        refs, bad = references("R1 - R3, R4A; R4B CH1/R8 R9-R7")
        self.assertEqual(refs, ["R1", "R2", "R3", "R4A", "R4B"])
        self.assertEqual(bad, ["CH1/R8", "R9-R7"])

    def test_population_and_duplicate_counts(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "Fitted", "MFR", "MPN"],
                       [["R1", 1, "False", "X", "A"], ["R2", "bad", "perhaps", "X", "B"],
                        ["R2", 2, "True", "X", "B"]])
        report = audit(self.project, "Build A", bom)
        self.assertEqual(report["summary"]["explicit_not_fitted_rows"], 1)
        self.assertEqual(report["summary"]["unknown_population_rows"], 1)
        self.assertEqual(report["reconciliation"]["dnp_present_in_bom"], ["R2"])
        self.assertTrue({"invalid_quantity", "duplicate_references", "quantity_reference_mismatch"}
                        <= {i["code"] for i in report["issues"]})

    def test_nominal_values_do_not_prove_package_equivalence(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "MFR", "MPN", "Value", "Footprint"],
                       [["R1", 1, "X", "A-1", "0R", "RES_0201"], ["R3", 1, "Y", "A1", "0", "RES_0402"]])
        report = audit(self.project, "Build A", bom)
        self.assertEqual(len(report["nominal_value_candidates"]), 1)
        self.assertEqual(report["nominal_value_candidates"][0]["status"], "candidate_only_package_and_ratings_unverified")
        self.assertEqual(report["duplicate_identity_rows"], [])
        base = {"references": ["R1"], "comment": ""}
        self.assertNotEqual(nominal({**base, "value": "1m"}), nominal({**base, "value": "1M"}))
        self.assertEqual(nominal({**base, "value": "2K2"}), nominal({**base, "value": "2.2k"}))

    def test_wrong_variant_rejected_and_exports_unverified(self):
        with self.assertRaises(ValueError):
            read_project(self.project, "missing")
        bom = self.csv("bom.csv", ["Designator", "Quantity"], [["R1", 1]], "Variant: Build B\n")
        report = audit(self.project, "Build A", bom)
        self.assertIn("export_variant_mismatch", [i["code"] for i in report["issues"]])
        self.assertEqual(read_project(self.project, "@base")["variations"], [])

    def test_new_export_delta_and_nonoverwrite(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "MFR", "MPN"], [["R1", 1, "X", "A"]])
        old = audit(self.project, "Build A", bom)
        newer = self.csv("new.csv", ["Designator", "Quantity", "MFR", "MPN"], [["R1", 1, "X", "B"], ["R3", 1, "X", "C"]])
        new = audit(self.project, "Build A", newer)
        delta = compare_previous(new, old)
        self.assertEqual(delta["added"], ["R3"])
        self.assertEqual(delta["changed"][0]["reference"], "R1")
        out = self.root / "report.json"
        write_new(out, old)
        with self.assertRaises(FileExistsError):
            write_new(out, new)
        self.assertEqual(json.loads(out.read_text())["bom"]["source"]["sha256"], old["bom"]["source"]["sha256"])

    def test_custom_columns_utf16_and_multiline_csv(self):
        bom = self.csv("bom.csv", ["RefDes", "Qty", "Maker", "PartNumber", "Description"],
                       [["R1A", 1, "Yageo", "EXACT", "first\nsecond"]], encoding="utf-16")
        report = audit(self.project, "Build A", bom, columns={"references": "RefDes", "mfr": "Maker", "mpn": "PartNumber"})
        self.assertEqual(report["bom"]["rows"][0]["mpn"], "EXACT")
        self.assertEqual(report["bom"]["rows"][0]["raw"]["Description"], "first\nsecond")
        self.assertEqual(report["bom"]["source"]["encoding"], "utf-16")

    def test_bad_table_not_silently_truncated(self):
        path = self.root / "bad.csv"
        path.write_text("Designator,Quantity\nR1,1,EXTRA\n", encoding="utf-8")
        with self.assertRaises(ValueError):
            read_table(path)

    def test_quoted_semicolon_and_tab_headers(self):
        for delimiter in (";", "\t"):
            with self.subTest(delimiter=delimiter):
                path = self.root / "quoted.csv"
                with path.open("w", encoding="utf-16", newline="") as handle:
                    writer = csv.writer(handle, delimiter=delimiter, quoting=csv.QUOTE_ALL)
                    writer.writerow(["Designator", "Quantity", "MFR", "MPN"])
                    writer.writerow(["R1", "1", "Yageo", "RC0201JR-070RL"])
                result = audit(self.project, "Build A", path)
                self.assertEqual(result["bom"]["source"]["delimiter"], delimiter)
                self.assertEqual(result["bom"]["rows"][0]["mpn"], "RC0201JR-070RL")

    def test_base_variant_export_case(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity"], [["R1", 1]], "Variant: No variations\n")
        report = audit(self.project, "@base", bom)
        self.assertNotIn("export_variant_mismatch", [i["code"] for i in report["issues"]])

    def test_placeholder_not_counted_as_complete_identity(self):
        bom = self.csv("bom.csv", ["Designator", "Quantity", "MFR", "MPN"],
                       [["R1", 1, "X", "[NoParam]"], ["R3", 1, "X", "=PartNumber"]])
        report = audit(self.project, "Build A", bom)
        self.assertEqual(report["summary"]["unique_complete_identities"], 0)
        self.assertEqual(report["summary"]["potentially_fitted_references"], 2)


if __name__ == "__main__":
    unittest.main()
