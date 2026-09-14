import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import digikey


class Response(io.BytesIO):
    def __init__(self, data, headers=None):
        super().__init__(json.dumps(data).encode())
        self.headers = headers or {}


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache = Path(self.temp.name)
        self.env = patch.dict(os.environ, {digikey.ID_ENV: "test-client",
                                          digikey.SECRET_ENV: "test-secret"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def replies(self):
        return [Response({"access_token": "test-token", "expires_in": 599}),
                Response({"Products": [{"ManufacturerProductNumber": "ABC"}]},
                         {"X-RateLimit-Remaining": "42", "Set-Cookie": "private"})]

    def test_live_keyword_then_cache_without_auth(self):
        with patch.object(digikey, "urlopen", side_effect=self.replies()) as request:
            live = digikey.fetch("keyword", "test resistor", self.cache)
            self.assertEqual(request.call_count, 2)
            form = parse_qs(request.call_args_list[0].args[0].data.decode())
            self.assertEqual(form["grant_type"], ["client_credentials"])
            self.assertEqual(form["client_secret"], ["test-secret"])
            catalog_request = request.call_args_list[1].args[0]
            self.assertEqual(catalog_request.get_header("Authorization"), "Bearer test-token")
            self.assertEqual(json.loads(catalog_request.data)["Keywords"], "test resistor")
        with patch.object(digikey, "urlopen", side_effect=AssertionError("Must use cache")):
            cached = digikey.fetch("keyword", "test resistor", self.cache)
        self.assertEqual(live["source"], "api")
        self.assertEqual(cached["source"], "cache")
        self.assertEqual(live["checked_at"], cached["checked_at"])
        self.assertEqual(cached["rate_limits"], {"x-ratelimit-remaining": "42"})
        disk = next(self.cache.glob("*.json")).read_text()
        for private in ("test-token", "test-client", "test-secret", "Set-Cookie"):
            self.assertNotIn(private, disk)

    def test_details_encodes_one_path_segment(self):
        with patch.object(digikey, "urlopen", side_effect=self.replies()) as request:
            digikey.fetch("details", "ABC/1,118#x", self.cache)
        self.assertEqual(request.call_args.args[0].full_url,
                         digikey.BASE + "/products/v4/search/ABC%2F1%2C118%23x/productdetails")
        self.assertEqual(request.call_args.args[0].get_method(), "GET")

    def test_refresh_requires_live_credentials(self):
        with patch.object(digikey, "urlopen", side_effect=self.replies()):
            digikey.fetch("keyword", "ABC", self.cache)
        with self.assertRaisesRegex(digikey.CatalogError, "Live request requires"):
            digikey.fetch("keyword", "ABC", self.cache, refresh=True)

    def test_locale_does_not_reuse_other_market_cache(self):
        with patch.object(digikey, "urlopen", side_effect=self.replies()):
            digikey.fetch("keyword", "ABC", self.cache)
        with self.assertRaisesRegex(digikey.CatalogError, "Live request requires"):
            digikey.fetch("keyword", "ABC", self.cache, currency="EUR")

    def test_429_reports_limits_without_body_or_retry(self):
        error = HTTPError(digikey.BASE, 429, "Throttled", {"Retry-After": "60"},
                          io.BytesIO(b"test-secret test-token"))
        with patch.object(digikey, "urlopen", side_effect=[self.replies()[0], error]) as request:
            with self.assertRaises(digikey.CatalogError) as caught:
                digikey.fetch("keyword", "ABC", self.cache)
        message = str(caught.exception)
        self.assertIn("HTTP 429", message)
        self.assertIn('"retry-after": "60"', message)
        self.assertNotIn("test-secret", message)
        self.assertNotIn("test-token", message)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(list(self.cache.iterdir()), [])

    def test_corrupt_cache_is_not_silently_refetched(self):
        with patch.object(digikey, "urlopen", side_effect=self.replies()):
            digikey.fetch("keyword", "ABC", self.cache)
        next(self.cache.glob("*.json")).write_text("{}")
        with patch.object(digikey, "urlopen", side_effect=AssertionError("Unexpected request")):
            with self.assertRaisesRegex(digikey.CatalogError, "Invalid cache"):
                digikey.fetch("keyword", "ABC", self.cache)

    def test_invalid_limits_never_authenticate(self):
        with patch.object(digikey, "urlopen", side_effect=AssertionError("Unexpected request")):
            for limit, offset in ((0, 0), (51, 0), (20, -1)):
                with self.assertRaises(digikey.CatalogError):
                    digikey.fetch("keyword", "ABC", self.cache, limit=limit, offset=offset)

    def test_missing_output_directory_does_not_consume_request(self):
        with patch.object(digikey, "urlopen", side_effect=AssertionError("Unexpected request")):
            with patch.object(sys, "stderr", new_callable=io.StringIO):
                result = digikey.main(["--keyword", "ABC", "--output", str(self.cache / "missing/output.json")])
        self.assertEqual(result, 1)


if __name__ == "__main__":
    unittest.main()
