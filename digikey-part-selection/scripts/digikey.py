#!/usr/bin/env python3
"""Read-only DigiKey V4 keyword/details client. Python 3.10+, no dependencies."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

BASE = "https://api.digikey.com"
ID_ENV = "DIGIKEY_CLIENT_ID"
SECRET_ENV = "DIGIKEY_CLIENT_SECRET"


class CatalogError(Exception):
    """A diagnostic safe to print; never include raw HTTP bodies or credentials."""


def rate_headers(headers):
    return {k.lower(): v for k, v in headers.items()
            if k.lower().startswith(("x-ratelimit-", "x-burstlimit-"))
            or k.lower() == "retry-after"}


def request_json(request, stage):
    try:
        with urlopen(request, timeout=30) as response:
            data = json.load(response)
            if not isinstance(data, dict):
                raise CatalogError(f"{stage}: expected a JSON object")
            return data, rate_headers(response.headers)
    except HTTPError as exc:
        # Bodies can contain echoed request details. Do not expose them.
        rates = rate_headers(exc.headers or {})
        exc.close()
        raise CatalogError(f"{stage}: HTTP {exc.code}; limits={json.dumps(rates)}") from None
    except (URLError, TimeoutError, OSError):
        raise CatalogError(f"{stage}: network request failed; no automatic retry") from None
    except (ValueError, UnicodeError):
        raise CatalogError(f"{stage}: invalid JSON response") from None


def atomic_json(path, data):
    path = Path(path)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=path.name + ".", delete=False) as handle:
            temp_name = handle.name
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def fetch(kind, query, cache_dir, *, limit=20, offset=0, refresh=False,
          site="US", language="en", currency="USD"):
    if kind not in {"keyword", "details"} or not query.strip():
        raise CatalogError("Choose keyword or details and a nonempty query")
    if not 1 <= limit <= 50 or offset < 0:
        raise CatalogError("Limit must be 1–50 and offset must be nonnegative")
    body = {"Keywords": query, "Limit": limit, "Offset": offset} if kind == "keyword" else None
    path = ("/products/v4/search/keyword" if kind == "keyword" else
            f"/products/v4/search/{quote(query, safe='')}/productdetails")
    descriptor = {"method": "POST" if body else "GET", "path": path, "body": body,
                  "site": site, "language": language, "currency": currency}
    digest = hashlib.sha256(json.dumps(descriptor, sort_keys=True).encode()).hexdigest()
    cache_dir = Path(cache_dir).expanduser()
    cache_file = cache_dir / (digest + ".json")
    if cache_file.exists() and not refresh:
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if (not isinstance(cached, dict) or cached.get("request") != descriptor
                    or not cached.get("checked_at") or not isinstance(cached.get("response"), dict)):
                raise ValueError
        except (ValueError, OSError):
            raise CatalogError("Invalid cache file; use --refresh to replace it") from None
        return {**cached, "source": "cache"}

    client_id = os.environ.pop(ID_ENV, "")
    client_secret = os.environ.pop(SECRET_ENV, "")
    if not client_id or not client_secret:
        raise CatalogError(f"Live request requires {ID_ENV} and {SECRET_ENV}; see credentials.md")
    form = urlencode({"client_id": client_id, "client_secret": client_secret,
                      "grant_type": "client_credentials"}).encode()
    auth, _ = request_json(Request(BASE + "/v1/oauth2/token", data=form,
                                  headers={"Content-Type": "application/x-www-form-urlencoded"}), "OAuth")
    token = auth.get("access_token")
    if not isinstance(token, str) or not token:
        raise CatalogError("OAuth response did not contain an access token")
    headers = {"Authorization": "Bearer " + token, "X-DIGIKEY-Client-Id": client_id,
               "X-DIGIKEY-Locale-Site": site, "X-DIGIKEY-Locale-Language": language,
               "X-DIGIKEY-Locale-Currency": currency, "Accept": "application/json"}
    if body:
        headers["Content-Type"] = "application/json"
    result, rates = request_json(Request(BASE + path, data=json.dumps(body).encode() if body else None,
                                        headers=headers), "Catalog")
    envelope = {"source": "api", "checked_at": datetime.now(timezone.utc).isoformat(),
                "request": descriptor, "rate_limits": rates, "response": result}
    cache_dir.mkdir(parents=True, exist_ok=True)
    atomic_json(cache_file, envelope)
    return envelope


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    search = parser.add_mutually_exclusive_group(required=True)
    search.add_argument("--keyword", help="Keyword or MPN discovery query")
    search.add_argument("--details", help="Exact MPN or preferably DigiKey SKU")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--site", default="US")
    parser.add_argument("--language", default="en")
    parser.add_argument("--currency", default="USD")
    parser.add_argument("--cache-dir", type=Path, default=Path.home() / ".cache/codex/digikey")
    parser.add_argument("--refresh", action="store_true", help="Bypass the local cache")
    parser.add_argument("--output", type=Path, help="Write response JSON here instead of stdout")
    args = parser.parse_args(argv)
    try:
        if args.output and not args.output.parent.is_dir():
            raise CatalogError("Output directory must already exist")
        data = fetch("keyword" if args.keyword is not None else "details",
                     args.keyword if args.keyword is not None else args.details,
                     args.cache_dir, limit=args.limit, offset=args.offset, refresh=args.refresh,
                     site=args.site, language=args.language, currency=args.currency)
        if args.output:
            atomic_json(args.output, data)
            print(json.dumps({"source": data["source"], "checked_at": data["checked_at"],
                              "output": str(args.output), "rate_limits": data.get("rate_limits", {})}))
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    except CatalogError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except OSError:
        print("Local file operation failed; check output/cache permissions", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
