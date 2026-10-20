"""Synthetic SDK 1.0.6 fixtures; successful live access is still unverified."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location(
    "sourcing_jlcpcb", Path(__file__).resolve().parents[1] / "scripts" / "part_sourcing.py")
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
CREDS = {"JLC_API_APP_ID": "synthetic-app", "JLC_API_ACCESS_KEY": "synthetic-key",
         "JLC_API_SECRET_KEY": "synthetic-secret"}
PAYLOAD = b'{"componentCodes":["C1234"]}'


def requested():
    return s.unique_parts([{"manufacturer": "Maker", "mpn": "CHIP-A"}])


def product():
    return {"componentCode": "C1234", "componentModel": "CHIP-A", "componentBrandEn": "Maker",
            "componentSpecification": "LQFP-64", "stockCount": 120, "libraryType": "Extended",
            "assemblyComponentFlag": True, "eccnCode": "EAR99", "rohsFlag": True,
            "priceRanges": [{"startQuantity": 1, "endQuantity": 99, "unitPrice": 2.3},
                            {"startQuantity": 100, "endQuantity": 499, "unitPrice": 1.9}]}


def response():
    return {"code": 200, "data": [product()]}


def batch():
    return {"response": response(), "parts": requested(), "request": {"componentCodes": ["C1234"]},
            "checked_at": s.utc_now(), "source_url": s.JLCPCB + s.JLCPCB_DETAIL_PATH}


class JLCPCBTests(unittest.TestCase):
    def test_documented_hmac_vector_including_final_newline(self):
        header = s.jlcpcb_headers(PAYLOAD, *CREDS.values(), timestamp=1792500000,
                                 nonce="0123456789abcdef0123456789abcdef")["Authorization"]
        self.assertEqual(header, 'JOP appid="synthetic-app",accesskey="synthetic-key",'
            'timestamp="1792500000",nonce="0123456789abcdef0123456789abcdef",'
            'signature="LTezcQGlR5h8SL2sV3h3c3ZW28LuEhOehvdhHuV1oPA="')
        self.assertNotIn("synthetic-secret", header)

    def test_header_injection_and_nonserialized_bodies_rejected(self):
        for value in ('bad\nheader', 'bad"header', 'bad\\header', "", "bad header"):
            with self.subTest(value=value), self.assertRaises(s.SourcingError):
                s.jlcpcb_headers(PAYLOAD, value, "key", "secret")
        with self.assertRaises(s.SourcingError):
            s.jlcpcb_headers({"componentCodes": ["C1234"]}, *CREDS.values())

    def test_transport_sends_signed_bytes_without_reserializing(self):
        fake = io.BytesIO(b'{"code":200,"data":[]}')
        fake.headers = {}
        with patch.object(s, "build_opener") as opener:
            opener.return_value.open.return_value = fake
            s.request_json(s.JLCPCB + s.JLCPCB_DETAIL_PATH, body=PAYLOAD,
                           headers=s.jlcpcb_headers(PAYLOAD, *CREDS.values()))
        req = opener.return_value.open.call_args.args[0]
        self.assertEqual(req.get_method(), "POST")
        self.assertEqual(req.data, PAYLOAD)
        self.assertEqual(req.get_header("Content-type"), "application/json")
        self.assertIsInstance(opener.call_args.args[0], s.NoRedirect)

    def test_exact_identity_stock_scope_and_provenance(self):
        b = batch()
        offers, matches, origins = s.normalize_jlcpcb(b)
        self.assertEqual(matches[0]["status"], "exact")
        self.assertEqual(offers[0]["inventory_quantity"], 120)
        self.assertEqual(offers[0]["inventory_scope"], "jlcpcb_pcba_public_library")
        self.assertEqual(offers[0]["package"], "LQFP-64")
        self.assertIsNone(offers[0]["packaging"])
        self.assertEqual(offers[0]["observed_at"], b["checked_at"])
        self.assertEqual(origins[0]["source_url"], b["source_url"])

    def test_sku_manufacturer_and_full_suffix_are_all_required(self):
        for field, value in (("componentCode", "C9999"), ("componentBrandEn", "Other Maker"),
                             ("componentModel", "CHIP-A-TR"), ("componentBrandEn", None)):
            b = batch()
            b["response"]["data"][0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(s.SourcingError):
                s.normalize_jlcpcb(b)

    def test_currency_and_order_rules_not_inferred_from_price_tiers(self):
        offer = s.normalize_jlcpcb(batch())[0][0]
        for currency in ("USD", "CNY"):
            result = s.evaluate_offer(offer, 100, currency)
            self.assertIsNone(result["unit_price"])
            self.assertIsNone(result["purchase_quantity"])
            self.assertIsNone(result["extended_parts_cost"])
            self.assertIsNone(result["stock_sufficient"])
            self.assertIn("price_currency_unverified", result["warnings"])
        self.assertEqual(offer["unqualified_price_ranges"], product()["priceRanges"])
        self.assertIn("supplier_restriction", result["warnings"])

    def test_no_origin_inferred_from_assembly_flag_export_codes_or_parameters(self):
        b = batch()
        b["response"]["data"][0].update(countryCode="CN", parameters=[
            {"parameterName": "Assembly", "parameterValue": "SMT"}])
        origin = s.normalize_jlcpcb(b)[2][0]
        self.assertEqual(origin["evidence_status"], "no_documented_origin_fields")
        for stage in s.STAGES:
            self.assertEqual(origin[stage], [])

    def test_missing_or_invalid_stock_remains_unknown(self):
        for stock in (None, True, -1, "120 units"):
            b = batch()
            b["response"]["data"][0]["stockCount"] = stock
            self.assertIsNone(s.normalize_jlcpcb(b)[0][0]["inventory_quantity"])
        b["response"]["data"][0]["stockCount"] = 0
        self.assertEqual(s.normalize_jlcpcb(b)[0][0]["inventory_quantity"], 0)

    def test_empty_duplicate_and_malformed_responses(self):
        for data, status in (([], "not_found"), ([product(), product()], "ambiguous")):
            b = batch()
            b["response"]["data"] = data
            offers, matches, origins = s.normalize_jlcpcb(b)
            self.assertFalse(offers or origins)
            self.assertEqual(matches[0]["status"], status)
        for data in (None, {}, "bad"):
            b["response"]["data"] = data
            with self.assertRaises(s.SourcingError):
                s.normalize_jlcpcb(b)
        b = batch()
        b["response"]["data"][0]["priceRanges"] = [1]
        with self.assertRaises(s.SourcingError):
            s.normalize_jlcpcb(b)

    @patch.dict("os.environ", CREDS)
    def test_one_read_only_request_no_credentials_in_report(self):
        with patch.object(s, "request_json", return_value=(response(), {})) as send:
            report = s.collect("jlcpcb", requested(), sku="C1234")
        self.assertEqual(send.call_count, 1)
        self.assertEqual(send.call_args.args[0],
                         "https://open.jlcpcb.com/overseas/openapi/component/getComponentDetailByCode")
        self.assertEqual(send.call_args.kwargs["body"], PAYLOAD)
        self.assertEqual(report["scope"], "one_pcba_public_library_item")
        self.assertTrue(report["complete"])
        for secret in CREDS.values():
            self.assertNotIn(secret, json.dumps(report))

    @patch.dict("os.environ", CREDS)
    def test_requires_one_part_and_c_number_before_sending(self):
        with patch.object(s, "request_json") as send:
            for parts, sku in ((requested(), None), (requested(), "C12/34"),
                               (requested() * 2, "C1234"), ([], "C1234")):
                with self.subTest(parts=parts, sku=sku), self.assertRaises(s.SourcingError):
                    s.collect("jlcpcb", parts, sku=sku)
        send.assert_not_called()

    @patch.dict("os.environ", {}, clear=True)
    def test_app_id_required_even_when_keys_present(self):
        with patch.dict("os.environ", {k: v for k, v in CREDS.items() if k != "JLC_API_APP_ID"}):
            with self.assertRaisesRegex(s.SourcingError, "JLC_API_APP_ID"):
                s.collect("jlcpcb", requested(), sku="C1234")

    @patch.dict("os.environ", CREDS)
    def test_business_error_suppressed_and_not_retried(self):
        failure = {"code": 403, "message": "synthetic-secret", "data": [product()]}
        for body in (failure, {**response(), "success": False}):
            with patch.object(s, "request_json", return_value=(body, {})) as send:
                report = s.collect("jlcpcb", requested(), sku="C1234")
            self.assertEqual(send.call_count, 1)
            self.assertFalse(report["complete"])
            self.assertFalse(report["offers"] or report["batches"])
            self.assertNotIn("synthetic-secret", json.dumps(report))

    @patch.dict("os.environ", CREDS)
    def test_http_denial_suppressed_and_not_retried(self):
        error = HTTPError(s.JLCPCB, 403, "synthetic-secret", {}, io.BytesIO(b"synthetic-secret"))
        with patch.object(s, "build_opener") as opener:
            opener.return_value.open.side_effect = error
            report = s.collect("jlcpcb", requested(), sku="C1234")
        self.assertEqual(opener.return_value.open.call_count, 1)
        self.assertFalse(report["complete"])
        self.assertIn("HTTP 403", report["errors"][0]["message"])
        self.assertNotIn("synthetic-secret", json.dumps(report))

    @patch.dict("os.environ", CREDS)
    def test_cli_comparison_keeps_assembly_scope_visible(self):
        output = io.StringIO()
        with patch.object(s, "request_json", return_value=(response(), {})), patch("sys.stdout", output):
            code = s.main(["jlcpcb", "--part", "CHIP-A", "--manufacturer", "Maker",
                           "--sku", "C1234", "--quantity", "100"])
        self.assertEqual(code, 0)
        report = json.loads(output.getvalue())
        self.assertIsNone(report["comparison"]["stock_total"])
        csv = s.render(report["comparison"], "csv")
        self.assertIn("jlcpcb_pcba_public_library", csv)
        self.assertIn("For JLCPCB assembly", csv)


if __name__ == "__main__":
    unittest.main()
