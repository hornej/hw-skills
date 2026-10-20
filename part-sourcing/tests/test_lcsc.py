"""Synthetic tests of the documented LCSC v3.4 contract, not live acceptance."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location(
    "sourcing_lcsc", Path(__file__).resolve().parents[1] / "scripts" / "part_sourcing.py")
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
CREDS = {"LCSC_API_KEY": "synthetic-key", "LCSC_API_SECRET": "synthetic-secret"}


def requested(*mpns, manufacturer="Maker"):
    return s.unique_parts([{"manufacturer": manufacturer, "mpn": m} for m in mpns or ("CHIP-A",)])


def product(mpn="CHIP-A", sku="C1234"):
    return {
        "lcscProductNumber": sku, "manufacturer": {"id": 999, "name": "Maker"},
        "manufacturerProductNumber": mpn, "package": "LQFP-64",
        "packageType": "Tray", "isInStock": True, "isOnSale": True,
        "minimumOrderQuantity": 10, "incrementQuantity": 10,
        "manufacturerStandardPackageQuantity": 3000,
        "productDetailURL": f"https://www.lcsc.com/product-detail/{sku}.html",
        "productPhotoURL": [f"https://assets.lcsc.com/images/lcsc/900x900/test_{sku}_blank.jpg"],
        "productPrice": {
            "lcscProductNumber": sku, "manufacturer": {"id": 999, "name": "Maker"},
            "manufacturerProductNumber": mpn, "quantityAvailable": 100,
            "currency": "USD", "lcscReelFee": 3,
            "standardPricing": [{"breakQuantity": 10, "unitPrice": 1.25, "discountRate": 0.5},
                                {"breakQuantity": 100, "unitPrice": 0.9, "discountRate": 0.5}],
        },
    }


def response(*products):
    return {"success": True, "code": 200,
            "result": {"productCount": len(products), "products": list(products)}}


def batch(data=None, *, parts=None, operation="keywordsearch", params=None):
    return {"response": data or response(product()), "checked_at": s.utc_now(),
            "parts": parts or requested(), "source_url": s.LCSC + "/" + operation,
            "operation": operation, "request": params or {"offset": 0}}


class LCSCTests(unittest.TestCase):
    def test_current_signing_contract_and_query_escaping(self):
        params = {"keyword": "A+B/TR & test", "offset": 0, "returnInformation": "All",
                  "limit": 50, "currency": "USD"}
        headers = s.lcsc_headers(params, "synthetic-key", "synthetic-secret",
                                nonce="0123456789abcdef", timestamp=1760000000)
        self.assertEqual(headers["signature"],
                         "bedaf431faadd084a63ef9ddaaebd0cdb74f7fabcf8182778745a5ac2acad834")
        self.assertNotIn("secret", headers)
        self.assertEqual(len(s.lcsc_headers(params, "a", "b")["nonce"]), 16)

    def test_exact_stock_pricing_and_order_multiple(self):
        offers, matches, origins = s.normalize_lcsc(batch())
        self.assertEqual(matches[0]["status"], "exact")
        result = s.evaluate_offer(offers[0], 15, "USD")
        self.assertEqual(result["purchase_quantity"], 20)
        self.assertEqual(result["extended_parts_cost"], "25.00")
        self.assertEqual(result["inventory_quantity"], 100)
        self.assertEqual(result["packaging"], "Tray")
        self.assertEqual(result["standard_package"], 3000)
        self.assertIn("additional_reeling_fee", result["warnings"])
        self.assertEqual(origins[0]["evidence_status"], "no_documented_origin_fields")

    def test_no_origin_inferred_from_export_codes_destinations_or_photos(self):
        p = product()
        p.update(countryCode="CN", lastCountryCode="TW",
                 complianceExportCodes="EAR99", productParameters={"Assembly": "SMT"})
        offers, _, origins = s.normalize_lcsc(batch(response(p)))
        self.assertEqual(len(offers[0]["reference_photo_urls"]), 1)
        for stage in s.STAGES:
            self.assertEqual(origins[0][stage], [])

    def test_manufacturer_and_every_ordering_suffix_must_match(self):
        for p in (product("CHIP-A-TR"), product()):
            if p["manufacturerProductNumber"] == "CHIP-A":
                p["manufacturer"]["name"] = "Other Maker"
            offers, matches, _ = s.normalize_lcsc(batch(response(p)))
            self.assertFalse(offers)
            self.assertIn(matches[0]["status"], {"not_found", "identity_mismatch"})

    def test_st_alias_is_scoped_to_verified_lcsc_brand(self):
        p = product()
        p["manufacturer"] = p["productPrice"]["manufacturer"] = {"id": 74, "name": "ST"}
        parts = requested(manufacturer="STMicroelectronics")
        offers, _, _ = s.normalize_lcsc(batch(response(p), parts=parts))
        self.assertEqual(offers[0]["manufacturer"], "STMicroelectronics")
        self.assertEqual(offers[0]["reported_manufacturer"], "ST")
        p["manufacturer"]["id"] = 999
        self.assertFalse(s.normalize_lcsc(batch(response(p), parts=parts))[0])

    def test_documented_mpn_names_and_conflicting_names(self):
        p = product()
        p["manufacturerProductCode"] = p.pop("manufacturerProductNumber")
        self.assertEqual(s.normalize_lcsc(batch(response(p)))[1][0]["status"], "exact")
        p["manufacturerProductNumber"] = "CHIP-A-TR"
        with self.assertRaises(s.SourcingError):
            s.normalize_lcsc(batch(response(p)))

    def test_nested_pricing_cannot_belong_to_another_item(self):
        for field, value in (("lcscProductNumber", "C9999"),
                             ("manufacturerProductNumber", "CHIP-A-TR"),
                             ("manufacturer", {"name": "Other Maker"})):
            p = product()
            p["productPrice"][field] = value
            with self.assertRaises(s.SourcingError):
                s.normalize_lcsc(batch(response(p)))

    def test_currency_and_unknown_stock_are_not_guessed(self):
        p = product()
        p["productPrice"]["currency"] = "CNY"
        del p["productPrice"]["quantityAvailable"]
        result = s.evaluate_offer(s.normalize_lcsc(batch(response(p)))[0][0], 15, "USD")
        self.assertIsNone(result["inventory_quantity"])
        self.assertIsNone(result["stock_sufficient"])
        self.assertIsNone(result["unit_price"])

    def test_stock_conflicts_remain_unknown(self):
        for update in ({"quantityAvailable": 999}, {"isInStock": False}):
            p = product()
            p.update(update)
            result = s.evaluate_offer(s.normalize_lcsc(batch(response(p)))[0][0], 15, "USD")
            self.assertIsNone(result["inventory_quantity"])
            self.assertIn("conflicting_inventory_fields", result["warnings"])

    def test_duplicate_skus_are_ambiguous_but_different_skus_are_preserved(self):
        offers, matches, _ = s.normalize_lcsc(batch(response(product(), product())))
        self.assertFalse(offers)
        self.assertEqual(matches[0]["status"], "ambiguous")
        offers, _, _ = s.normalize_lcsc(batch(response(product(), product(sku="C5678"))))
        self.assertEqual(len(offers), 2)

    def test_search_pages_never_imply_complete_coverage(self):
        for count, offset in ((100, 0), (None, 0), (1, 50)):
            data = response(product())
            data["result"]["productCount"] = count
            _, matches, _ = s.normalize_lcsc(batch(data, params={"offset": offset}))
            self.assertEqual(matches[0]["status"], "truncated")
        data = response()
        self.assertEqual(s.normalize_lcsc(batch(data))[1][0]["status"], "not_found")

    def test_detail_checks_sku_and_manufacturer_mpn(self):
        data = {"success": True, "code": 200, "result": product()}
        b = batch(data, operation="productdetails", params={"lcscProductNumber": "C1234"})
        self.assertEqual(s.normalize_lcsc(b)[1][0]["status"], "exact")
        for field, value in (("lcscProductNumber", "C9999"), ("manufacturerProductNumber", "CHIP-A-TR")):
            wrong = copy.deepcopy(b)
            wrong["response"]["result"][field] = value
            with self.assertRaises(s.SourcingError):
                s.normalize_lcsc(wrong)

    @patch.dict("os.environ", CREDS)
    def test_read_only_production_transport_and_no_credentials_in_report(self):
        with patch.object(s, "request_json", return_value=(response(product()), {})) as send:
            report = s.collect("lcsc", requested(), quantity=15)
        url = send.call_args.args[0]
        self.assertEqual(urlsplit(url).netloc, "api.lcsc.com")
        self.assertEqual(parse_qs(urlsplit(url).query)["keyword"], ["CHIP-A"])
        self.assertIsNone(send.call_args.kwargs["body"])
        self.assertEqual(set(send.call_args.kwargs["headers"]), {"key", "nonce", "timestamp", "signature"})
        self.assertTrue(report["complete"])
        for secret in CREDS.values():
            self.assertNotIn(secret, json.dumps(report))
            self.assertNotIn(secret, url)

    @patch.dict("os.environ", CREDS)
    def test_detail_request_is_bounded_and_identity_checked(self):
        data = {"success": True, "code": 200, "result": product()}
        with patch.object(s, "request_json", return_value=(data, {})) as send:
            report = s.collect("lcsc", requested(), sku="C1234")
        self.assertEqual(send.call_count, 1)
        self.assertIn("/productdetails?", send.call_args.args[0])
        self.assertTrue(report["complete"])
        with self.assertRaises(s.SourcingError):
            s.collect("lcsc", requested("CHIP-A", "CHIP-B"), sku="C1234")

    @patch.dict("os.environ", CREDS)
    def test_quota_or_auth_error_stops_and_preserves_completed_parts(self):
        error = {"code": 430, "success": False, "message": "synthetic-secret"}
        with patch.object(s, "request_json", side_effect=[(response(product()), {}), (error, {})]) as send, \
                patch.object(s.time, "sleep"):
            report = s.collect("lcsc", requested("CHIP-A", "CHIP-B", "CHIP-C"))
        self.assertEqual(send.call_count, 2)
        self.assertFalse(report["complete"])
        self.assertEqual(len(report["offers"]), 1)
        self.assertEqual(len(report["batches"]), 1)
        self.assertEqual(len(report["errors"][0]["unprocessed_parts"]), 2)
        self.assertNotIn("synthetic-secret", json.dumps(report))

    @patch.dict("os.environ", CREDS)
    def test_cli_uses_existing_comparison_and_marks_truncation(self):
        data = response(product())
        data["result"]["productCount"] = 2
        output = io.StringIO()
        with patch.object(s, "request_json", return_value=(data, {})), patch("sys.stdout", output):
            code = s.main(["lcsc", "--part", "CHIP-A", "--manufacturer", "Maker", "--quantity", "15"])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["comparison"]["offers"][0]["purchase_quantity"], 20)
        self.assertFalse(report["comparison"]["source_reports_complete"])


if __name__ == "__main__":
    unittest.main()
