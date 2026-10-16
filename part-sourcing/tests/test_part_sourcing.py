"""Synthetic contract/behavior tests. No credentials or live API calls."""
import copy
from datetime import datetime, timedelta, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "part_sourcing.py"
spec = importlib.util.spec_from_file_location("sourcing", SCRIPT)
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


def parts(*mpns):
    return s.unique_parts([{"manufacturer": "Maker", "mpn": p} for p in mpns])


def offer(**updates):
    return {"provider": "mouser", "manufacturer": "Maker", "mpn": "CHIP-A",
            "seller": "Mouser", "sku": "M-CHIP-A", "match_status": "exact",
            "observed_at": s.utc_now(), "moq": 1, "order_multiple": 500,
            "inventory_quantity": 1200, "prices": [
                {"quantity": 1, "price": "$3.00", "currency": "USD"},
                {"quantity": 1000, "price": "$1.50", "currency": "USD"}], **updates}


def nexar_response(requested):
    return {"data": {"supMultiMatch": [{"reference": p["reference"], "hits": 1,
        "error": None, "parts": [{"id": "part-" + p["reference"], "mpn": p["mpn"],
        "manufacturer": {"name": p["manufacturer"]}, "sellers": [{"company": {"id": "1", "name": "Seller"},
        "isAuthorized": True, "offers": [{"id": "opaque+string/id", "sku": "SKU-" + p["mpn"],
        "clickUrl": "https://example.test/part", "updated": "2026-01-01T00:00:00Z",
        "inventoryLevel": 5000, "moq": 1, "orderMultiple": 1, "factoryPackQuantity": 3000,
        "prices": [{"quantity": 1, "price": 2, "currency": "USD"}]}]}]}]}
        for p in requested]}}


def batch(response, requested=None):
    now = s.utc_now()
    return {"checked_at": now, "source_url": "https://example.test/api", "parts": requested or parts("CHIP-A"),
            "response": response, "retain_until": (s.checked_time(now) + timedelta(hours=24)).isoformat()}


def mouser_response(mpns=("CHIP-A",)):
    return {"Errors": [], "SearchResults": {"NumberOfResult": len(mpns), "Parts": [
        {"Manufacturer": "Maker", "ManufacturerPartNumber": mpn, "MouserPartNumber": "M-" + mpn,
         "ProductDetailUrl": "https://example.test/" + mpn, "Min": "1", "Mult": "1",
         "AvailabilityInStock": "1,234", "FactoryStock": "999999",
         "PriceBreaks": [{"Quantity": 1000, "Price": "$1.25", "Currency": "USD"}],
         "TradeCompliance": [{"ComplianceName": "Country of Origin", "ComplianceValue": "France"},
                             {"ComplianceName": "Country of Diffusion", "ComplianceValue": "Taiwan"},
                             {"ComplianceName": "Assembly Country of Origin", "ComplianceValue": "Not available"}]}
        for mpn in mpns]}}


def report(*offers, complete=True):
    return {"schema": s.SCHEMA, "offers": list(offers), "complete": complete, "batches": []}


class IdentityTests(unittest.TestCase):
    def test_mouser_invalid_key_error_is_actionable_without_echoing_response(self):
        for error in (
            {"Code": "InvalidApiKey", "Message": "private-response https://example.test/?apiKey=private-key"},
            {"Code": "Unknown", "Message": "Invalid API key: private-key"},
        ):
            with self.assertRaises(s.SourcingError) as caught:
                s.normalize_mouser(batch({"Errors": [error]}))
            message = str(caught.exception)
            self.assertIn("Mouser rejected the Search API key", message)
            self.assertNotIn("private-", message)
            self.assertNotIn("https://", message)

    def test_dedup_preserves_suffixes_rows_and_punctuation(self):
        p = s.unique_parts([{"manufacturer": "Maker", "mpn": "ABC-TR", "row_id": "sheet:2"},
                            {"manufacturer": "maker", "mpn": "ABC-TR", "row_id": "sheet:8"},
                            {"manufacturer": "Maker", "mpn": "ABC"}])
        self.assertEqual(len(p), 2)
        self.assertEqual([r["row_id"] for r in p[0]["source_rows"]], ["sheet:2", "sheet:8"])

    def test_requires_manufacturer_and_mpn(self):
        for rows in [[], [{"mpn": "ABC"}], [None], [{"manufacturer": "Maker", "mpn": "A\nB"}]]:
            with self.assertRaises(s.SourcingError):
                s.unique_parts(rows)

    def test_nexar_uses_returned_references_not_order(self):
        p = parts("CHIP-A", "CHIP-B")
        data = nexar_response(p)
        data["data"]["supMultiMatch"].reverse()
        offers, matches, _ = s.normalize_nexar(batch(data, p))
        self.assertEqual([o["mpn"] for o in offers], ["CHIP-A", "CHIP-B"])
        self.assertTrue(all(m["status"] == "exact" for m in matches))
        self.assertEqual(offers[0]["offer_id"], "opaque+string/id")

    def test_nexar_suffix_or_manufacturer_mismatch_not_accepted(self):
        for field in ["mpn", "manufacturer"]:
            data = nexar_response(parts("CHIP-A"))
            item = data["data"]["supMultiMatch"][0]["parts"][0]
            item[field] = "CHIP-A-TR" if field == "mpn" else {"name": "Another Maker"}
            offers, matches, _ = s.normalize_nexar(batch(data))
            self.assertFalse(offers)
            self.assertEqual(matches[0]["status"], "identity_mismatch")

    def test_nexar_truncation_and_duplicate_references(self):
        data = nexar_response(parts("CHIP-A"))
        data["data"]["supMultiMatch"][0]["hits"] = 4
        _, matches, _ = s.normalize_nexar(batch(data))
        self.assertEqual(matches[0]["status"], "truncated")
        data["data"]["supMultiMatch"].append(data["data"]["supMultiMatch"][0])
        with self.assertRaises(s.SourcingError):
            s.normalize_nexar(batch(data))

    def test_mouser_wrong_suffix_not_assigned(self):
        offers, matches, _ = s.normalize_mouser(batch(mouser_response(("CHIP-A-TR",))))
        self.assertEqual(offers, [])
        self.assertEqual(matches[0]["status"], "not_found")

    def test_mouser_truncation_is_not_reported_as_no_stock(self):
        data = mouser_response()
        data["SearchResults"]["NumberOfResult"] = 51
        _, matches, _ = s.normalize_mouser(batch(data))
        self.assertEqual(matches[0]["status"], "truncated")


class PriceTests(unittest.TestCase):
    def test_order_rounding_and_correct_break_affect_stock(self):
        row = s.evaluate_offer(offer(), 1100, "USD")
        self.assertEqual(row["purchase_quantity"], 1500)
        self.assertEqual(row["unit_price"], "1.50")
        self.assertEqual(row["extended_parts_cost"], "2250.00")
        self.assertFalse(row["stock_sufficient"])

    def test_moq_and_multiple_both_apply(self):
        row = s.evaluate_offer(offer(moq=1600, order_multiple=1000), 1000, "USD")
        self.assertEqual(row["purchase_quantity"], 2000)

    def test_no_cheaper_break_above_purchase_quantity(self):
        row = s.evaluate_offer(offer(order_multiple=1), 10, "USD")
        self.assertEqual(row["unit_price"], "3.00")

    def test_factory_pack_is_not_order_multiple(self):
        row = s.evaluate_offer(offer(order_multiple=None, factory_pack_quantity=3000), 1000, "USD")
        self.assertIsNone(row["purchase_quantity"])
        self.assertIsNone(row["extended_parts_cost"])
        self.assertEqual(row["unit_price"], "1.50")
        self.assertIn("order_multiple_unknown", row["warnings"])

    def test_missing_inventory_is_unknown_not_zero(self):
        self.assertIsNone(s.evaluate_offer(offer(inventory_quantity=None), 1000, "USD")["stock_sufficient"])
        self.assertIsNone(s.integer(-1))
        self.assertIsNone(s.integer("1,000+"))
        self.assertEqual(s.integer("1,234"), 1234)

    def test_no_implicit_currency_conversion_or_ambiguous_decimal(self):
        eur = offer(prices=[{"quantity": 1, "price": "1.20", "currency": "EUR"}])
        self.assertIsNone(s.evaluate_offer(eur, 1000, "USD")["unit_price"])
        for price in ["1,20", "$1,234.56", "NaN", "Infinity", "0", "-1"]:
            self.assertIsNone(s.money(price, "USD"))

    def test_conflicting_same_break_prices_are_not_cherry_picked(self):
        row = s.evaluate_offer(offer(prices=[{"quantity": 1, "price": 2, "currency": "USD"},
                                            {"quantity": 1, "price": 3, "currency": "USD"}]), 1000, "USD")
        self.assertIsNone(row["unit_price"])
        self.assertIn("conflicting_prices_at_break", row["warnings"])

    def test_supplier_limits_and_fees_are_visible(self):
        row = s.evaluate_offer(offer(sales_maximum_quantity=100, restriction="Export restriction",
                                    surcharge_messages=["Fee"], reeling_fee=7), 1000, "USD")
        self.assertIn("exceeds_sales_maximum", row["warnings"])
        self.assertIn("supplier_restriction", row["warnings"])
        self.assertIn("additional_surcharges", row["warnings"])
        self.assertIn("additional_reeling_fee", row["warnings"])

    def test_identical_offers_dedup_but_no_stock_sum(self):
        a = offer()
        b = {**a, "provider": "nexar"}
        result = s.compare([report(a), report(a, b)], 1000, "USD")
        self.assertEqual(len(result["offers"]), 2)
        self.assertIsNone(result["stock_total"])


class OriginAndProvenanceTests(unittest.TestCase):
    def test_mouser_stage_evidence_stays_separate(self):
        offers, _, origins = s.normalize_mouser(batch(mouser_response()))
        record = origins[0]
        self.assertEqual(record["declared_coo"][0]["value"], "France")
        self.assertEqual(record["wafer_fabrication"][0]["value"], "Taiwan")
        self.assertEqual(record["assembly"], [])
        self.assertEqual(record["test"], [])
        self.assertEqual(offers[0]["inventory_quantity"], 1234)

    def test_conflicting_origin_assertions_retained(self):
        data = mouser_response()
        data["SearchResults"]["Parts"][0]["ProductCompliance"] = [
            {"ComplianceName": "Country of Origin", "ComplianceValue": "China"}]
        _, _, origins = s.normalize_mouser(batch(data))
        self.assertEqual({x["value"] for x in origins[0]["declared_coo"]}, {"China", "France"})

    def test_generic_or_missing_compliance_is_not_invented(self):
        data = mouser_response()
        data["SearchResults"]["Parts"][0]["TradeCompliance"] = [{"ComplianceName": "RoHS", "ComplianceValue": "Yes"}]
        _, _, origins = s.normalize_mouser(batch(data))
        self.assertTrue(all(origins[0][stage] == [] for stage in s.STAGES))

    def test_trace_has_lot_context_but_no_stage_inference(self):
        data = {"ManufacturerProductNumber": "CHIP-A", "CountryOfOrigin": "FR",
                "DigiKeyProductNumber": "DK-A", "LotCode": "LOT-1", "DateCode": "2601", "TracingId": "TRACE-1"}
        _, _, origins = s.normalize_digikey(batch(data), "digikey-trace")
        self.assertEqual(origins[0]["lot_code"], "LOT-1")
        self.assertEqual(origins[0]["declared_coo"][0]["value"], "FR")
        self.assertEqual(origins[0]["wafer_fabrication"], [])

    def test_reuse_preserves_observation_and_rejects_expired_nexar(self):
        a = offer(observed_at="2026-01-01T00:00:00Z")
        self.assertEqual(s.compare([report(a)], 1000, "USD")["offers"][0]["observed_at"], a["observed_at"])
        a["retain_until"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        with self.assertRaises(s.SourcingError):
            s.compare([report(a)], 1000, "USD")

    def test_timezone_required(self):
        with self.assertRaises(s.SourcingError):
            s.evaluate_offer(offer(observed_at="2026-01-01T12:00:00"), 1000, "USD")

    def test_digikey_variation_stock_and_response_currency(self):
        envelope = {"source": "cache", "checked_at": "2026-01-01T00:00:00Z",
            "request": {"path": "/products/v4/search/DK%2FA/productdetails", "currency": "USD"},
            "response": {"SearchLocaleUsed": {"Currency": "EUR"}, "Product": {
                "Manufacturer": {"Name": "Maker"}, "ManufacturerProductNumber": "CHIP-A", "QuantityAvailable": 9999,
                "ProductVariations": [{"DigiKeyProductNumber": "DK/A", "QuantityAvailableforPackageType": 100,
                    "MinimumOrderQuantity": 1, "StandardPackage": 3000,
                    "PackageType": {"Name": "Cut Tape"}, "StandardPricing": [{"BreakQuantity": 1, "UnitPrice": 2}]},
                    {"DigiKeyProductNumber": "DK/TR", "QuantityAvailableforPackageType": 9899}]}}}
        rows = s.compare([envelope], 1000, "USD")["offers"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["inventory_quantity"], 100)
        self.assertIsNone(rows[0]["unit_price"])
        self.assertIsNone(rows[0]["order_multiple"])
        self.assertEqual(rows[0]["observed_at"], envelope["checked_at"])
        envelope["request"]["path"] = "/products/v4/search/DK-B/productdetails"
        with self.assertRaises(s.SourcingError):
            s.compare([envelope], 1000, "USD")


class ClientAndCliTests(unittest.TestCase):
    @patch.dict(os.environ, {"NEXAR_CLIENT_ID": "test-id", "NEXAR_CLIENT_SECRET": "test-secret"}, clear=True)
    @patch.object(s.time, "sleep")
    def test_nexar_batches_101_inputs_without_optional_entitlements(self, sleep):
        requested = parts(*(f"CHIP-{i}" for i in range(101)))
        calls = []
        def fake(url, **kw):
            calls.append((url, kw))
            if "connect/token" in url:
                return {"access_token": "test-token"}, {}
            records = kw["body"]["variables"]["queries"]
            return nexar_response(records), {}
        with patch.object(s, "request_json", side_effect=fake):
            result = s.collect("nexar", requested)
        self.assertTrue(result["complete"])
        self.assertEqual([len(c[1]["body"]["variables"]["queries"]) for c in calls[1:]], [100, 1])
        self.assertNotIn("factoryLeadDays", calls[1][1]["body"]["query"])
        self.assertNotIn("test-secret", json.dumps(result))
        self.assertNotIn("test-token", json.dumps(result))

    @patch.dict(os.environ, {"MOUSER_SEARCH_API_KEY": "test-private-key"}, clear=True)
    @patch.object(s.time, "sleep")
    def test_mouser_partial_failure_retains_success_without_key(self, sleep):
        p = parts("CHIP-A", "CHIP-B")
        with patch.object(s, "request_json", side_effect=[(mouser_response(), {}), s.SourcingError("HTTP 429")]):
            result = s.collect("mouser", p, batch_size=1)
        self.assertFalse(result["complete"])
        self.assertEqual(len(result["offers"]), 1)
        self.assertEqual(result["errors"][0]["unprocessed_parts"][0]["mpn"], "CHIP-B")
        self.assertNotIn("test-private-key", json.dumps(result))
        sleep.assert_called_once_with(2.1)

    @patch.dict(os.environ, {"MOUSER_SEARCH_API_KEY": "test-private-key"}, clear=True)
    @patch.object(s.time, "sleep")
    def test_schema_change_retains_previous_batch_and_stops(self, sleep):
        malformed = {"SearchResults": {"NumberOfResult": 1, "Parts": [None]}}
        with patch.object(s, "request_json", side_effect=[(mouser_response(), {}), (malformed, {})]) as call:
            result = s.collect("mouser", parts("CHIP-A", "CHIP-B", "CHIP-C"), batch_size=1)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(len(result["offers"]), 1)
        self.assertFalse(result["complete"])
        self.assertEqual(result["errors"][0]["message"], "Provider response has an unexpected shape")

    def test_incomplete_report_cli_returns_nonzero_and_writes_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "partial.json", Path(tmp) / "comparison.json"
            source.write_text(json.dumps(report(offer(), complete=False)), encoding="utf-8")
            code = s.main(["compare", "--input", str(source), "--quantity", "1000", "--output", str(output)])
            self.assertEqual(code, 2)
            self.assertFalse(json.loads(output.read_text())["source_reports_complete"])

    @patch.dict(os.environ, {"DIGIKEY_USER_ACCESS_TOKEN": "test-user-token", "DIGIKEY_CLIENT_ID": "test-client", "DIGIKEY_ACCOUNT_ID": "123"}, clear=True)
    def test_quote_and_trace_only_get_existing_records(self):
        with patch.object(s, "request_json", return_value=({"QuoteProducts": []}, {})) as call:
            result = s.collect("digikey-quote", [], quote_id=1234, offset=50, limit=50)
            self.assertIn("/quoting/v4/quotes/1234/details?offset=50&limit=50", call.call_args.args[0])
            self.assertIsNone(call.call_args.kwargs["body"])
            self.assertEqual(result["scope"], "one_quote_page")
        with patch.object(s, "request_json", return_value=({"ManufacturerProductNumber": "CHIP-A"}, {})) as call:
            s.collect("digikey-trace", [], tracing_id="ID/#1")
            self.assertTrue(call.call_args.args[0].endswith("ID%2F%231"))
            self.assertIsNone(call.call_args.kwargs["body"])

    def test_http_error_diagnostic_does_not_leak_key_url_or_body(self):
        error = HTTPError("https://example.test?apiKey=secret", 429, "secret echoed", {"Retry-After": "5"}, io.BytesIO(b"secret body"))
        with patch.object(s, "build_opener") as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(s.SourcingError) as cm:
                s.request_json("https://example.test?apiKey=secret")
        self.assertNotIn("secret", str(cm.exception))
        self.assertIn("429", str(cm.exception))
        self.assertIn("5 seconds", str(cm.exception))

    def test_graphql_errors_not_treated_as_successful_partial_data(self):
        data = nexar_response(parts("CHIP-A"))
        data["errors"] = [{"message": "private echoed error"}]
        with self.assertRaises(s.SourcingError) as cm:
            s.normalize_nexar(batch(data))
        self.assertNotIn("private", str(cm.exception))

    def test_cli_csv_protects_formula_text_and_preserves_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "offers.json"
            output = Path(tmp) / "offers.csv"
            source.write_text(json.dumps(report(offer(seller="=1+1"))), encoding="utf-8")
            result = subprocess.run([sys.executable, "-B", str(SCRIPT), "compare", "--input", str(source),
                                     "--quantity", "1000", "--format", "csv", "--output", str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("'=1+1", output.read_text(encoding="utf-8"))
            self.assertEqual(json.loads(source.read_text())["offers"][0]["seller"], "=1+1")

    def test_cli_invalid_quantity_and_output_input_collision(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "offers.json"
            original = json.dumps(report(offer()))
            source.write_text(original, encoding="utf-8")
            for extra in [["--quantity", "0"], ["--quantity", "1000", "--output", str(source)]]:
                result = subprocess.run([sys.executable, "-B", str(SCRIPT), "compare", "--input", str(source), *extra], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(source.read_text(), original)


if __name__ == "__main__":
    unittest.main()
