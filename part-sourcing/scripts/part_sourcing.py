#!/usr/bin/env python3
"""Read-only part sourcing, origin evidence, and quantity-price comparison."""
import argparse
import base64
import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

SCHEMA = "part-sourcing-v1"
NEXAR = "https://api.nexar.com/graphql"
MOUSER = "https://api.mouser.com/api/v1/search/partnumber"
DIGIKEY = "https://api.digikey.com"
LCSC = "https://api.lcsc.com/rest/api/agent/product/v1"
JLCPCB = "https://open.jlcpcb.com"
JLCPCB_DETAIL_PATH = "/overseas/openapi/component/getComponentDetailByCode"
STAGES = ("declared_coo", "wafer_fabrication", "assembly", "test")


class SourcingError(Exception):
    """Safe diagnostic: no raw response body, token, or authenticated URL."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def checked_time(value):
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            raise ValueError
        return dt
    except (ValueError, AttributeError, TypeError):
        raise SourcingError("Evidence requires an ISO timestamp with a timezone") from None


def request_json(url, *, body=None, headers=None, form=False):
    h = {"Accept": "application/json", **(headers or {})}
    payload = None
    if body is not None:
        payload = body if isinstance(body, bytes) and not form else (
            urlencode(body) if form else json.dumps(body)).encode("utf-8")
        h["Content-Type"] = ("application/x-www-form-urlencoded" if form else "application/json")
    req = Request(url, data=payload, headers=h)
    try:
        with build_opener(NoRedirect()).open(req, timeout=25) as response:
            result = json.load(response)
            limits = {k: v for k, v in response.headers.items()
                      if k.lower().startswith(("x-ratelimit-", "x-burstlimit-"))}
        if not isinstance(result, dict):
            raise SourcingError("Provider returned an unexpected response shape")
        return result, limits
    except HTTPError as exc:
        retry = (exc.headers or {}).get("Retry-After", "")
        # Only a numeric delay is printed; header/body text may echo request data.
        suffix = f"; retry after {retry} seconds" if retry.isdigit() else ""
        code = exc.code
        exc.close()
        raise SourcingError(f"HTTP {code}{suffix}; no automatic retry") from None
    except (URLError, TimeoutError, OSError):
        raise SourcingError("Network request failed; no automatic retry") from None
    except (ValueError, UnicodeError):
        raise SourcingError("Provider returned invalid JSON") from None


def env(name, fallback=None):
    value = os.environ.get(name) or (os.environ.get(fallback) if fallback else None)
    if not value:
        raise SourcingError(f"Missing process credential/configuration: {name}")
    return value


def key(value):
    return value.strip().casefold() if isinstance(value, str) else ""


def unique_parts(rows):
    if not isinstance(rows, list) or not rows:
        raise SourcingError("Input must contain manufacturer/MPN records")
    result, seen = [], {}
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            raise SourcingError("Each input record must be an object")
        manufacturer, mpn = row.get("manufacturer"), row.get("mpn")
        if not key(manufacturer) or not key(mpn):
            raise SourcingError(f"Input record {index} needs manufacturer and mpn")
        if any(ord(c) < 32 for c in manufacturer + mpn) or len(mpn) > 256:
            raise SourcingError(f"Invalid identity at input record {index}")
        identity = (key(manufacturer), key(mpn))
        source_row = {"input_index": index, "row_id": row.get("row_id")}
        if identity in seen:
            seen[identity]["source_rows"].append(source_row)
        else:
            part = {"manufacturer": manufacturer.strip(), "mpn": mpn.strip(),
                    "reference": str(len(result)), "source_rows": [source_row]}
            seen[identity] = part
            result.append(part)
    return result


def integer(value, minimum=0):
    if isinstance(value, bool) or value is None:
        return None
    s = str(value).strip()
    if not re.fullmatch(r"\d+|\d{1,3}(?:,\d{3})+", s):
        return None
    number = int(s.replace(",", ""))
    return number if number >= minimum else None


def money(value, currency):
    if isinstance(value, bool) or value is None:
        return None
    s = str(value).strip()
    symbol = {"USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}.get(currency)
    if symbol and s.startswith(symbol):
        s = s[len(symbol):].strip()
    # Ambiguous grouping/decimal separators stay unknown; raw response is retained.
    if not re.fullmatch(r"\d+(?:\.\d+)?", s):
        return None
    try:
        number = Decimal(s)
        return number if number.is_finite() and number > 0 else None
    except InvalidOperation:
        return None


def origin_record(manufacturer, mpn, batch, **context):
    return {"manufacturer": manufacturer, "mpn": mpn,
            "observed_at": batch["checked_at"], "source_url": batch["source_url"],
            **context, **{stage: [] for stage in STAGES}}


def assertion(record, stage, value, field):
    if isinstance(value, str) and value.strip() and key(value) not in {
            "not available", "n/a", "unknown", "not provided"}:
        record[stage].append({"value": value, "source_field": field})


def nexar_query(parts, *, match_limit=1, country="US", currency="USD",
                all_sellers=False, enrich=False):
    queries = [{"mpn": p["mpn"], "manufacturer": p["manufacturer"],
                "reference": p["reference"], "limit": match_limit} for p in parts]
    extra_part = ("specs { displayValue attribute { name shortname } } "
                  "bestDatasheet { url }" if enrich else "")
    extra_offer = "factoryLeadDays" if enrich else ""
    query = """query Parts($queries: [SupPartMatchQuery!]!, $country: String!,
      $currency: String!, $authorized: Boolean!) {
      supMultiMatch(queries: $queries, country: $country, currency: $currency) {
        reference hits error parts {
          id mpn manufacturer { name } shortDescription octopartUrl
          EXTRA_PART
          sellers(authorizedOnly: $authorized) {
            company { id name } isAuthorized
            offers { id sku clickUrl updated inventoryLevel moq orderMultiple
              packaging factoryPackQuantity EXTRA_OFFER
              prices { quantity price currency }
            }
          }
        }
      }
    }""".replace("EXTRA_PART", extra_part).replace("EXTRA_OFFER", extra_offer)
    return {"query": query, "variables": {"queries": queries, "country": country,
            "currency": currency, "authorized": not all_sellers}}


def normalize_nexar(batch):
    response = batch["response"]
    if response.get("errors"):
        raise SourcingError("Nexar query error; check credentials, schema and plan features")
    matches = (response.get("data") or {}).get("supMultiMatch")
    if not isinstance(matches, list):
        raise SourcingError("Nexar response lacks match results")
    by_ref = {}
    for match in matches:
        ref = match.get("reference")
        if ref in by_ref or ref is None:
            raise SourcingError("Nexar returned missing or duplicate match references")
        by_ref[ref] = match
    expected = {p["reference"] for p in batch["parts"]}
    if set(by_ref) != expected:
        raise SourcingError("Nexar response references do not match the requested batch")
    offers, statuses = [], []
    for requested in batch["parts"]:
        match = by_ref[requested["reference"]]
        candidates = match.get("parts", [])
        exact = [p for p in candidates if key(p.get("mpn")) == key(requested["mpn"])
                 and key((p.get("manufacturer") or {}).get("name")) == key(requested["manufacturer"])]
        hits = integer(match.get("hits"))
        if match.get("error"):
            status = "provider_error"
        elif hits is None or hits > len(candidates):
            status = "truncated"
        elif len(exact) > 1:
            status = "ambiguous"
        elif not exact:
            status = "identity_mismatch" if candidates else "not_found"
        else:
            status = "exact"
        statuses.append({**requested, "status": status, "hits": hits,
                         "observed_at": batch["checked_at"]})
        for part in exact:
            for seller in part.get("sellers", []):
                company = seller.get("company") or {}
                for offer in seller.get("offers", []):
                    offers.append({"provider": "nexar", "manufacturer": requested["manufacturer"],
                        "mpn": part["mpn"], "match_status": status, "seller": company.get("name"),
                        "seller_id": company.get("id"), "offer_id": offer.get("id"),
                        "sku": offer.get("sku"), "source_url": offer.get("clickUrl"),
                        "observed_at": batch["checked_at"], "seller_updated_at": offer.get("updated"),
                        "retain_until": batch.get("retain_until"),
                        "authorized_by_aggregator": seller.get("isAuthorized"),
                        "inventory_quantity": integer(offer.get("inventoryLevel")),
                        "moq": integer(offer.get("moq"), 1),
                        "order_multiple": integer(offer.get("orderMultiple"), 1),
                        "factory_pack_quantity": offer.get("factoryPackQuantity"),
                        "packaging": offer.get("packaging"), "prices": offer.get("prices", []),
                        "factory_lead_days": offer.get("factoryLeadDays")})
    return offers, statuses, []


def normalize_mouser(batch):
    response = batch["response"]
    if response.get("Errors"):
        for error in response["Errors"]:
            if not isinstance(error, dict):
                continue
            code = key(error.get("Code"))
            message = key(error.get("Message"))
            if code in {"invalidapikey", "invalid_api_key"} or re.search(r"\binvalid\s+api[\s_-]*key\b", message):
                raise SourcingError("Mouser rejected the Search API key; verify its value, Search API access, and activation")
        raise SourcingError("Mouser search error; inspect API access and request constraints")
    results = response.get("SearchResults")
    if not isinstance(results, dict) or not isinstance(results.get("Parts"), list):
        raise SourcingError("Mouser response lacks search results")
    candidates = results["Parts"]
    count = integer(results.get("NumberOfResult"))
    truncated = count is None or count > len(candidates)
    offers, statuses, origins = [], [], []
    labels = {"country of origin": "declared_coo", "country of diffusion": "wafer_fabrication",
              "assembly country of origin": "assembly"}
    for requested in batch["parts"]:
        exact = [p for p in candidates if key(p.get("ManufacturerPartNumber")) == key(requested["mpn"])
                 and key(p.get("Manufacturer")) == key(requested["manufacturer"])]
        status = "truncated" if truncated else ("exact" if exact else "not_found")
        if not exact and not truncated and any(key(p.get("ManufacturerPartNumber")) == key(requested["mpn"])
                                               for p in candidates):
            status = "identity_mismatch"
        statuses.append({**requested, "status": status, "observed_at": batch["checked_at"]})
        for part in exact:
            attrs = part.get("ProductAttributes") or []
            packaging = next((a.get("AttributeValue") for a in attrs
                              if key(a.get("AttributeName")) == "packaging"), None)
            offers.append({"provider": "mouser", "manufacturer": part["Manufacturer"],
                "mpn": part["ManufacturerPartNumber"], "match_status": status,
                "seller": "Mouser", "sku": part.get("MouserPartNumber"),
                "source_url": part.get("ProductDetailUrl"), "observed_at": batch["checked_at"],
                "authorized_by_aggregator": None,
                "inventory_quantity": integer(part.get("AvailabilityInStock")),
                "moq": integer(part.get("Min"), 1), "order_multiple": integer(part.get("Mult"), 1),
                "sales_maximum_quantity": integer(part.get("SalesMaximumOrderQty"), 1),
                "packaging": packaging, "lifecycle": part.get("LifecycleStatus"),
                "restriction": part.get("RestrictionMessage"),
                "surcharge_messages": part.get("SurchargeMessages"),
                "prices": [{"quantity": p.get("Quantity"), "price": p.get("Price"),
                            "currency": p.get("Currency")} for p in part.get("PriceBreaks") or []]})
            record = origin_record(part["Manufacturer"], part["ManufacturerPartNumber"], batch,
                                   sku=part.get("MouserPartNumber"), scope="catalog", match_status=status)
            record["source_url"] = part.get("ProductDetailUrl") or batch["source_url"]
            for field in ("ProductAttributes", "ProductCompliance", "TradeCompliance"):
                for i, item in enumerate(part.get(field) or []):
                    name = item.get("AttributeName" if field == "ProductAttributes" else "ComplianceName")
                    value_field = "AttributeValue" if field == "ProductAttributes" else "ComplianceValue"
                    if key(name) in labels:
                        assertion(record, labels[key(name)], item.get(value_field), f"{field}[{i}].{value_field} ({name})")
            origins.append(record)
    return offers, statuses, origins


def lcsc_headers(params, api_key, secret, *, nonce=None, timestamp=None):
    """Current LCSC v3.4 guide: SHA-256, headers, sorted encoded query values."""
    nonce = nonce if nonce is not None else secrets.token_hex(8)
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    query = urlencode(sorted((name, str(value)) for name, value in params.items()))
    signed = f"key={api_key}&nonce={nonce}&secret={secret}&timestamp={timestamp}"
    if query:
        signed += "&" + query
    return {"key": api_key, "nonce": nonce, "timestamp": timestamp,
            "signature": hashlib.sha256(signed.encode("utf-8")).hexdigest()}


def lcsc_mpn(product):
    # The guide's field tables and examples use different names. Reject a conflict.
    values = [product[name] for name in ("manufacturerProductNumber", "manufacturerProductCode")
              if product.get(name) is not None]
    if not values or not all(key(v) for v in values) or len({key(v) for v in values}) != 1:
        raise SourcingError("LCSC returned missing or conflicting manufacturer part numbers")
    return values[0]


def lcsc_manufacturer_matches(manufacturer, requested):
    actual = key(manufacturer.get("name"))
    if actual == key(requested):
        return True
    # Verified LCSC brand 74 is ST; keep the reported name in the offer as well.
    return (integer(manufacturer.get("id")) == 74 and actual == "st" and
            key(requested) == "stmicroelectronics")


def normalize_lcsc(batch):
    response = batch["response"]
    if response.get("success") is not True or response.get("code") != 200:
        raise SourcingError("LCSC rejected the request; check API access, IP whitelist, signature and quota")
    result = response.get("result")
    if not isinstance(result, dict):
        raise SourcingError("LCSC response lacks product data")
    detail = batch.get("operation") == "productdetails"
    products = [result] if detail else result.get("products")
    if not isinstance(products, list):
        raise SourcingError("LCSC response lacks a product list")
    count = 1 if detail else integer(result.get("productCount"))
    offset = batch.get("request", {}).get("offset", 0)
    truncated = not detail and (count is None or offset != 0 or count != len(products))
    for product in products:
        if (not isinstance(product, dict) or not isinstance(product.get("manufacturer"), dict) or
                not key(product["manufacturer"].get("name")) or
                not re.fullmatch(r"C\d{1,12}", str(product.get("lcscProductNumber", "")))):
            raise SourcingError("LCSC returned an incomplete catalog identity")
        lcsc_mpn(product)
    offers, statuses, origins = [], [], []
    for requested in batch["parts"]:
        candidates = [p for p in products if key(lcsc_mpn(p)) == key(requested["mpn"])]
        exact = [p for p in candidates if lcsc_manufacturer_matches(p["manufacturer"], requested["manufacturer"])]
        sku = batch.get("request", {}).get("lcscProductNumber")
        if detail and (len(exact) != 1 or exact[0]["lcscProductNumber"] != sku):
            raise SourcingError("LCSC detail does not match the requested manufacturer, MPN and SKU")
        duplicate = len({p["lcscProductNumber"] for p in exact}) != len(exact)
        status = ("ambiguous" if duplicate else "truncated" if truncated else "exact" if exact
                  else "identity_mismatch" if candidates else "not_found")
        statuses.append({**requested, "status": status, "hits": count,
                         "observed_at": batch["checked_at"]})
        if duplicate:
            continue
        for product in exact:
            pricing = product.get("productPrice") or {}
            if not isinstance(pricing, dict):
                raise SourcingError("LCSC pricing has an unexpected shape")
            if pricing and (
                    pricing.get("lcscProductNumber") != product["lcscProductNumber"] or
                    key(lcsc_mpn(pricing)) != key(lcsc_mpn(product)) or
                    not isinstance(pricing.get("manufacturer"), dict) or
                    key(pricing["manufacturer"].get("name")) != key(product["manufacturer"]["name"])):
                raise SourcingError("LCSC pricing identity does not match its catalog item")
            breaks = pricing.get("standardPricing") or []
            if not isinstance(breaks, list) or any(not isinstance(p, dict) for p in breaks):
                raise SourcingError("LCSC price breaks have an unexpected shape")
            stock_values = {n for n in (integer(product.get("quantityAvailable")),
                                       integer(pricing.get("quantityAvailable"))) if n is not None}
            inventory = next(iter(stock_values)) if len(stock_values) == 1 else None
            stock_conflict = len(stock_values) > 1 or (
                inventory is not None and isinstance(product.get("isInStock"), bool) and
                product["isInStock"] != (inventory > 0))
            if stock_conflict:
                inventory = None
            photos = product.get("productPhotoURL") or []
            source = product.get("productDetailURL") or batch["source_url"]
            offers.append({"provider": "lcsc", "manufacturer": requested["manufacturer"],
                "reported_manufacturer": product["manufacturer"]["name"],
                "mpn": lcsc_mpn(product), "match_status": status, "seller": "LCSC",
                "sku": product["lcscProductNumber"], "source_url": source,
                "observed_at": batch["checked_at"], "authorized_by_aggregator": None,
                "inventory_quantity": inventory, "inventory_conflict": stock_conflict,
                "moq": integer(product.get("minimumOrderQuantity"), 1),
                "order_multiple": integer(product.get("incrementQuantity"), 1),
                "standard_package": integer(product.get("manufacturerStandardPackageQuantity"), 1),
                "package": product.get("package"), "packaging": product.get("packageType"),
                "restriction": "Not currently for sale" if product.get("isOnSale") is False else None,
                "reeling_fee": pricing.get("lcscReelFee"),
                "datasheet_url": product.get("datasheetURL"),
                "reference_photo_urls": photos if isinstance(photos, list) else [],
                "prices": [{"quantity": p.get("breakQuantity"), "price": p.get("unitPrice"),
                            "discount_rate": p.get("discountRate"), "currency": pricing.get("currency")}
                           for p in breaks]})
            record = origin_record(requested["manufacturer"], lcsc_mpn(product), batch,
                sku=product["lcscProductNumber"], scope="catalog", match_status=status)
            record.update(source_url=source, evidence_status="no_documented_origin_fields")
            # Photos, export codes, shipping countries and catalog change feeds do
            # not establish a chip's origin. Keep raw fields for later review.
            origins.append(record)
    return offers, statuses, origins


def jlcpcb_headers(payload, app_id, access_key, secret_key, *, timestamp=None, nonce=None):
    """SDK 1.0.6 detail operation; sign exactly the bytes passed to the transport."""
    if not isinstance(payload, bytes):
        raise SourcingError("JLCPCB signing requires the serialized request bytes")
    if any(not isinstance(v, str) or not re.fullmatch(r'[!-~]+', v) or
           any(c in v for c in '"\\') for v in (app_id, access_key)):
        raise SourcingError("JLCPCB App ID or access key has invalid header characters")
    timestamp = str(int(time.time())) if timestamp is None else str(timestamp)
    nonce = secrets.token_hex(16) if nonce is None else nonce
    if not timestamp.isascii() or not timestamp.isdigit() or not re.fullmatch(r"[a-zA-Z0-9]{32}", nonce):
        raise SourcingError("Invalid JLCPCB timestamp or nonce")
    canonical = f"POST\n{JLCPCB_DETAIL_PATH}\n{timestamp}\n{nonce}\n".encode("utf-8") + payload + b"\n"
    signature = base64.b64encode(hmac.new(secret_key.encode("utf-8"), canonical, hashlib.sha256).digest()).decode("ascii")
    return {"Authorization": f'JOP appid="{app_id}",accesskey="{access_key}",'
            f'timestamp="{timestamp}",nonce="{nonce}",signature="{signature}"'}


def normalize_jlcpcb(batch):
    """Exact public-library detail only; no inferred currency, order rules or COO."""
    response = batch["response"]
    if response.get("code") != 200 or response.get("success") is False:
        raise SourcingError("JLCPCB rejected the request; check Components access, app credentials, IP whitelist and quota")
    products = response.get("data")
    if not isinstance(products, list):
        raise SourcingError("JLCPCB response lacks component detail data")
    requested = batch["parts"][0]
    sku = batch["request"]["componentCodes"][0]
    status = "not_found" if not products else "ambiguous" if len(products) != 1 else "exact"
    match = {**requested, "status": status, "hits": len(products), "observed_at": batch["checked_at"]}
    if status != "exact":
        return [], [match], []
    product = products[0]
    if (not isinstance(product, dict) or product.get("componentCode") != sku or
            key(product.get("componentModel")) != key(requested["mpn"]) or
            key(product.get("componentBrandEn")) != key(requested["manufacturer"])):
        raise SourcingError("JLCPCB detail does not match the requested manufacturer, full MPN and C-number")
    ranges = product.get("priceRanges") or []
    if not isinstance(ranges, list) or any(not isinstance(p, dict) for p in ranges):
        raise SourcingError("JLCPCB price ranges have an unexpected shape")
    offer = {"provider": "jlcpcb", "manufacturer": requested["manufacturer"],
        "reported_manufacturer": product["componentBrandEn"], "mpn": product["componentModel"],
        "match_status": "exact", "seller": "JLCPCB", "sku": sku,
        "source_url": batch["source_url"], "observed_at": batch["checked_at"],
        "authorized_by_aggregator": None, "inventory_quantity": integer(product.get("stockCount")),
        "inventory_scope": "jlcpcb_pcba_public_library", "moq": None, "order_multiple": None,
        "package": product.get("componentSpecification"), "packaging": None,
        "restriction": "For JLCPCB assembly; standalone component purchase is not established",
        "library_type": product.get("libraryType"), "assembly_component_flag": product.get("assemblyComponentFlag"),
        "datasheet_url": product.get("datasheetUrl"),
        # The SDK supplies numeric ranges but no currency or MOQ/order multiple.
        # Preserve them as unqualified evidence, never label them with CLI currency.
        "unqualified_price_ranges": ranges, "price_currency": None, "prices": []}
    record = origin_record(requested["manufacturer"], product["componentModel"], batch,
        sku=sku, scope="catalog", match_status="exact", evidence_status="no_documented_origin_fields")
    # assemblyComponentFlag concerns PCBA eligibility. Export/RoHS codes and
    # generic parameters do not establish wafer, chip assembly or test locations.
    return [offer], [match], [record]


def normalize_digikey(batch, provider):
    response = batch["response"]
    if provider == "digikey-quote":
        products = response.get("QuoteProducts")
        if not isinstance(products, list):
            raise SourcingError("DigiKey quote response lacks QuoteProducts")
    else:
        products = [response]
        if not response.get("ManufacturerProductNumber"):
            raise SourcingError("DigiKey tracing response lacks exact MPN")
    records = []
    for i, product in enumerate(products):
        if not product.get("ManufacturerProductNumber"):
            raise SourcingError("DigiKey origin record lacks exact MPN")
        record = origin_record(product.get("ManufacturerName"), product["ManufacturerProductNumber"], batch,
            scope="quote_line" if provider == "digikey-quote" else "lot",
            sku=product.get("DigiKeyProductNumber") or product.get("DigiKeyPartNumber"),
            lot_code=product.get("LotCode"), date_code=product.get("DateCode"),
            tracing_id=product.get("TracingId"), quote_id=batch.get("quote_id"))
        assertion(record, "declared_coo", product.get("CountryOfOrigin"),
                  f"QuoteProducts[{i}].CountryOfOrigin" if provider == "digikey-quote" else "CountryOfOrigin")
        records.append(record)
    return [], [], records


def import_digikey_details(envelope):
    """Read the existing DigiKey helper's envelope without a second API call."""
    descriptor = envelope.get("request") or {}
    path = descriptor.get("path", "")
    match = re.fullmatch(r"/products/v4/search/([^/]+)/productdetails", path)
    if not match or envelope.get("source") not in {"api", "cache"}:
        raise SourcingError("DigiKey input must be a ProductDetails helper envelope")
    observed = envelope.get("checked_at")
    checked_time(observed)
    response = envelope.get("response") or {}
    product = response.get("Product") or {}
    mpn = product.get("ManufacturerProductNumber")
    manufacturer = (product.get("Manufacturer") or {}).get("Name")
    if not key(mpn) or not key(manufacturer):
        raise SourcingError("DigiKey details lack manufacturer/MPN identity")
    searched = unquote(match.group(1))
    variations = product.get("ProductVariations") or []
    mpn_query = key(searched) == key(mpn)
    selected = variations if mpn_query else [v for v in variations
                      if key(v.get("DigiKeyProductNumber")) == key(searched)]
    if not selected:
        raise SourcingError("DigiKey response does not match the requested MPN/SKU")
    currency = (response.get("SearchLocaleUsed") or {}).get("Currency")
    # An unconfirmed response currency is never inferred from the requested locale.
    offers = []
    for variant in selected:
        marketplace = variant.get("MarketPlace") is True
        supplier = (variant.get("Supplier") or {}).get("Name")
        offers.append({"provider": "digikey", "manufacturer": manufacturer, "mpn": mpn,
            "match_status": "exact", "seller": supplier if marketplace else "DigiKey",
            "marketplace": marketplace, "sku": variant.get("DigiKeyProductNumber"),
            "source_url": product.get("ProductUrl"), "observed_at": observed,
            "evidence_source": envelope["source"],
            "inventory_quantity": integer(variant.get("QuantityAvailableforPackageType")),
            "moq": integer(variant.get("MinimumOrderQuantity"), 1), "order_multiple": None,
            "sales_maximum_quantity": integer(variant.get("MaxQuantityForDistribution"), 1),
            "packaging": (variant.get("PackageType") or {}).get("Name"),
            "standard_package": variant.get("StandardPackage"),
            "surcharge_messages": ["tariff"] if variant.get("TariffActive") else [],
            "reeling_fee": variant.get("DigiReelFee"),
            "prices": [{"quantity": p.get("BreakQuantity"), "price": p.get("UnitPrice"),
                        "currency": currency} for p in variant.get("StandardPricing") or []]})
    return {"schema": SCHEMA, "provider": "digikey", "complete": True,
            "offers": offers, "batches": [], "origin_records": []}


def collect(provider, parts, *, quantity=1, country="US", currency="USD",
            batch_size=None, match_limit=1, all_sellers=False, enrich=False,
            quote_id=None, tracing_id=None, offset=0, limit=50, sku=None):
    report = {"schema": SCHEMA, "provider": provider, "requested_quantity": quantity,
              "currency": currency, "requested_parts": parts, "batches": [],
              "offers": [], "matches": [], "origin_records": [], "errors": [], "complete": True}
    max_size = 100 if provider == "nexar" else 1 if provider in {"lcsc", "jlcpcb"} else 10
    size = batch_size or max_size
    if size < 1 or size > max_size or not 1 <= match_limit <= 100:
        raise SourcingError("Invalid batch size or match limit")
    if provider in {"nexar", "mouser", "lcsc", "jlcpcb"} and not parts:
        raise SourcingError("No parts to query")
    if provider == "mouser" and any(not 3 <= len(p["mpn"]) <= 40 or "|" in p["mpn"] for p in parts):
        raise SourcingError("Mouser part numbers must be 3-40 characters without a pipe")
    if provider == "lcsc":
        if offset < 0 or not 1 <= limit <= 500 or currency not in {"USD", "EUR", "CNY", "HKD"}:
            raise SourcingError("LCSC requires a nonnegative offset, limit 1-500, and supported currency")
        if sku is not None and (len(parts) != 1 or not re.fullmatch(r"C\d{1,12}", sku) or offset):
            raise SourcingError("LCSC --sku requires one exact manufacturer/MPN pair and no offset")
        report["scope"] = "one_catalog_item" if sku else "one_search_page_per_part"
    if provider == "jlcpcb":
        if len(parts) != 1 or not isinstance(sku, str) or not re.fullmatch(r"C\d{1,12}", sku) or offset:
            raise SourcingError("JLCPCB requires --sku C-number and one exact manufacturer/MPN pair")
        report["scope"] = "one_pcba_public_library_item"
    groups = [parts[i:i + size] for i in range(0, len(parts), size)] or [[]]
    headers = {}
    if provider == "nexar":
        auth, _ = request_json("https://identity.nexar.com/connect/token", form=True,
            body={"grant_type": "client_credentials", "client_id": env("NEXAR_CLIENT_ID"),
                  "client_secret": env("NEXAR_CLIENT_SECRET")})
        token = auth.get("access_token")
        if not isinstance(token, str) or not token:
            raise SourcingError("Nexar OAuth response lacks access token")
        headers["Authorization"] = "Bearer " + token
    elif provider == "mouser":
        api_key = env("MOUSER_SEARCH_API_KEY")
    elif provider == "lcsc":
        api_key, api_secret = env("LCSC_API_KEY"), env("LCSC_API_SECRET")
    elif provider == "jlcpcb":
        app_id, api_key, api_secret = env("JLC_API_APP_ID"), env("JLC_API_ACCESS_KEY"), env("JLC_API_SECRET_KEY")
    elif provider in {"digikey-quote", "digikey-trace"}:
        headers = {"Authorization": "Bearer " + env("DIGIKEY_USER_ACCESS_TOKEN"),
                   "X-DIGIKEY-Client-Id": env("DIGIKEY_CLIENT_ID")}
        if provider == "digikey-quote":
            headers["X-DIGIKEY-Account-Id"] = env("DIGIKEY_ACCOUNT_ID")
        elif os.environ.get("DIGIKEY_CUSTOMER_ID"):
            headers["X-DIGIKEY-Customer-Id"] = os.environ["DIGIKEY_CUSTOMER_ID"]
    else:
        raise SourcingError("Unsupported provider")
    for index, group in enumerate(groups):
        if index:
            time.sleep(2.1 if provider == "mouser" else 1.1 if provider == "lcsc" else 0.25)
        try:
            body = None
            if provider == "nexar":
                source = url = NEXAR
                body = nexar_query(group, match_limit=match_limit, country=country,
                                   currency=currency, all_sellers=all_sellers, enrich=enrich)
            elif provider == "mouser":
                source = MOUSER
                url = MOUSER + "?" + urlencode({"apiKey": api_key})
                body = {"SearchByPartRequest": {"mouserPartNumber": "|".join(dict.fromkeys(p["mpn"] for p in group)),
                                                "partSearchOptions": "Exact"}}
            elif provider == "lcsc":
                operation = "productdetails" if sku else "keywordsearch"
                params = {"lcscProductNumber": sku} if sku else {
                    "keyword": group[0]["mpn"], "offset": offset, "limit": limit, "language": "EN"}
                params.update(returnInformation="All", currency=currency)
                source = url = LCSC + "/" + operation + "?" + urlencode(params)
                headers = lcsc_headers(params, api_key, api_secret)
            elif provider == "jlcpcb":
                source = url = JLCPCB + JLCPCB_DETAIL_PATH
                params = {"componentCodes": [sku]}
                body = json.dumps(params, separators=(",", ":")).encode("utf-8")
                headers = jlcpcb_headers(body, app_id, api_key, api_secret)
            elif provider == "digikey-quote":
                if integer(quote_id, 1) is None or offset < 0 or not 1 <= limit <= 50:
                    raise SourcingError("Quote requires a positive ID, nonnegative offset, and limit 1-50")
                source = url = DIGIKEY + f"/quoting/v4/quotes/{int(quote_id)}/details?" + urlencode({"offset": offset, "limit": limit})
            else:
                if not tracing_id or not tracing_id.strip():
                    raise SourcingError("Tracing requires an actual label tracing ID")
                source = url = DIGIKEY + "/ProductTracing/v1/Details/" + quote(tracing_id, safe="")
            response, rates = request_json(url, body=body, headers=headers)
            checked = utc_now()
            batch = {"checked_at": checked, "source_url": source, "parts": group,
                     "response": response, "rate_limits": rates}
            if provider == "nexar":
                batch["retain_until"] = (checked_time(checked) + timedelta(hours=24)).isoformat()
                batch["request"] = body["variables"]
                offers, matches, origins = normalize_nexar(batch)
            elif provider == "mouser":
                offers, matches, origins = normalize_mouser(batch)
            elif provider == "lcsc":
                batch.update(operation=operation, request=params)
                offers, matches, origins = normalize_lcsc(batch)
            elif provider == "jlcpcb":
                batch.update(operation="getComponentDetailByCode", request=params)
                offers, matches, origins = normalize_jlcpcb(batch)
            else:
                if provider == "digikey-quote":
                    batch.update(quote_id=quote_id, offset=offset, limit=limit)
                    report["scope"] = "one_quote_page"
                offers, matches, origins = normalize_digikey(batch, provider)
            report["batches"].append(batch)
            report["offers"].extend(offers)
            report["matches"].extend(matches)
            report["origin_records"].extend(origins)
            if any(m["status"] in {"truncated", "provider_error", "ambiguous"} for m in matches):
                report["complete"] = False
        except (SourcingError, KeyError, TypeError, AttributeError, ValueError) as exc:
            message = str(exc) if isinstance(exc, SourcingError) else "Provider response has an unexpected shape"
            report["errors"].append({"batch_index": index, "message": message,
                                     "unprocessed_parts": [p for g in groups[index:] for p in g]})
            report["complete"] = False
            break
    return report


def evaluate_offer(offer, quantity, currency):
    warnings = []
    checked_time(offer.get("observed_at"))
    if offer.get("retain_until") and checked_time(offer["retain_until"]) <= datetime.now(timezone.utc):
        raise SourcingError("Nexar evidence has expired; remove retained copies and fetch fresh data")
    moq, multiple = integer(offer.get("moq"), 1), integer(offer.get("order_multiple"), 1)
    if moq is None:
        warnings.append("minimum_order_unknown")
    if multiple is None:
        warnings.append("order_multiple_unknown")
    purchase = None if moq is None or multiple is None else ((max(quantity, moq) + multiple - 1) // multiple) * multiple
    inventory = integer(offer.get("inventory_quantity"))
    stock_sufficient = None if inventory is None or purchase is None else inventory >= purchase
    maximum = integer(offer.get("sales_maximum_quantity"), 1)
    if maximum is not None and purchase is not None and purchase > maximum:
        warnings.append("exceeds_sales_maximum")
    if offer.get("restriction"):
        warnings.append("supplier_restriction")
    if offer.get("inventory_conflict"):
        warnings.append("conflicting_inventory_fields")
    if offer.get("surcharge_messages"):
        warnings.append("additional_surcharges")
    if money(offer.get("reeling_fee"), currency) is not None:
        warnings.append("additional_reeling_fee")
    if offer.get("match_status") != "exact":
        warnings.append("identity_or_result_set_unresolved")
    if offer.get("unqualified_price_ranges"):
        warnings.append("price_currency_unverified")
    # An advertised unit price can be reported even when valid order multiples are
    # unknown, but a purchasable quantity and extended cost must remain unresolved.
    priced_quantity = purchase if purchase is not None else max(quantity, moq or 1)
    eligible = []
    for point in offer.get("prices", []):
        threshold = integer(point.get("quantity"), 1)
        price = money(point.get("price"), currency)
        if (point.get("currency") == currency and threshold is not None and price is not None
                and threshold <= priced_quantity):
            eligible.append((threshold, price))
    unit = price_break = None
    if eligible:
        price_break = max(q for q, _ in eligible)
        prices = {p for q, p in eligible if q == price_break}
        if len(prices) == 1:
            unit = prices.pop()
        else:
            warnings.append("conflicting_prices_at_break")
    if unit is None:
        warnings.append("no_unambiguous_applicable_price")
    return {**offer, "requested_quantity": quantity, "purchase_quantity": purchase,
            "price_evaluated_quantity": priced_quantity,
            "comparison_currency": currency, "price_break_quantity": price_break,
            "unit_price": str(unit) if unit is not None else None,
            "extended_parts_cost": str(unit * purchase) if unit is not None and purchase is not None else None,
            "stock_sufficient": stock_sufficient, "warnings": warnings}


def compare(reports, quantity, currency):
    rows, seen = [], set()
    reports = [import_digikey_details(r) if isinstance(r, dict) and "schema" not in r else r
               for r in reports]
    for report in reports:
        if not isinstance(report, dict) or report.get("schema") != SCHEMA:
            raise SourcingError("Comparison input must be a part-sourcing-v1 report")
        for batch in report.get("batches", []):
            if batch.get("retain_until") and checked_time(batch["retain_until"]) <= datetime.now(timezone.utc):
                raise SourcingError("Nexar evidence has expired; remove retained copies and fetch fresh data")
        for offer in report.get("offers", []):
            # Remove identical records only. Do not merge regional stock or packaging.
            fingerprint = json.dumps(offer, sort_keys=True)
            if fingerprint not in seen:
                rows.append(evaluate_offer(offer, quantity, currency))
                seen.add(fingerprint)
    rows.sort(key=lambda r: (key(r.get("manufacturer")), key(r.get("mpn")),
                            r["stock_sufficient"] is not True,
                            Decimal(r["extended_parts_cost"]) if r["extended_parts_cost"] is not None else Decimal("Infinity"),
                            key(r.get("seller"))))
    return {"schema": "part-sourcing-comparison-v1", "requested_quantity": quantity,
            "currency": currency, "source_reports_complete": all(r.get("complete") is True for r in reports),
            "offers": rows, "stock_total": None,
            "note": "Individual offers; no cross-listing stock sum. Parts cost excludes unquoted fees."}


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (ValueError, UnicodeError):
        raise SourcingError("Input is not valid UTF-8 JSON") from None


def read_parts(args):
    if args.input:
        path = Path(args.input)
        if path.suffix.lower() == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as handle:
                rows = list(csv.DictReader(handle))
        else:
            rows = load_json(path)
    else:
        rows = [{"manufacturer": args.manufacturer, "mpn": p} for p in args.part]
    return unique_parts(rows)


def positive(value):
    try:
        number = int(value)
        if number > 0:
            return number
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("Must be a positive integer")


def render(data, fmt):
    if fmt == "json":
        return json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    fields = ["manufacturer", "mpn", "seller", "sku", "provider", "match_status", "package", "packaging", "inventory_scope",
              "authorized_by_aggregator", "marketplace", "sales_maximum_quantity", "restriction", "reeling_fee",
              "requested_quantity", "purchase_quantity", "moq", "order_multiple", "inventory_quantity",
              "stock_sufficient", "comparison_currency", "price_evaluated_quantity", "unit_price", "extended_parts_cost",
              "observed_at", "seller_updated_at", "retain_until", "source_url", "warnings"]
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in data["offers"]:
        safe = {}
        for field in fields:
            value = row.get(field)
            if isinstance(value, list):
                value = "; ".join(value)
            # Avoid spreadsheet formula execution from untrusted supplier text.
            if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
                value = "'" + value
            safe[field] = value
        writer.writerow(safe)
    return stream.getvalue()


def write_output(content, path):
    if not path:
        sys.stdout.write(content)
        return
    destination = Path(path)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", dir=destination.parent,
                                         prefix=destination.name + ".", delete=False) as handle:
            tmp = handle.name
            handle.write(content)
        os.replace(tmp, destination)
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("nexar", "mouser", "lcsc", "jlcpcb"):
        p = sub.add_parser(name)
        inputs = p.add_mutually_exclusive_group(required=True)
        inputs.add_argument("--input", help="CSV or JSON candidate file")
        inputs.add_argument("--part", action="append")
        p.add_argument("--manufacturer", help="Manufacturer for --part inputs")
        p.add_argument("--quantity", type=positive, required=True)
        p.add_argument("--currency", default="USD")
        p.add_argument("--batch-size", type=positive)
        if name == "nexar":
            p.add_argument("--country", default="US")
            p.add_argument("--match-limit", type=positive, default=1)
            p.add_argument("--all-sellers", action="store_true")
            p.add_argument("--enrich", action="store_true")
        if name == "lcsc":
            p.add_argument("--sku", help="Verified LCSC C-number for one manufacturer/MPN pair")
            p.add_argument("--offset", type=int, default=0, help="Search offset; no automatic paging")
            p.add_argument("--limit", type=positive, default=50, help="Search page size, at most 500")
        if name == "jlcpcb":
            p.add_argument("--sku", required=True, help="JLCPCB C-number to verify against one manufacturer/full MPN pair")
        p.add_argument("--output")
    p = sub.add_parser("digikey-quote")
    p.add_argument("--quote-id", type=positive, required=True)
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--limit", type=positive, default=50)
    p.add_argument("--output")
    p = sub.add_parser("digikey-trace")
    p.add_argument("--tracing-id", required=True)
    p.add_argument("--output")
    p = sub.add_parser("compare")
    p.add_argument("--input", action="append", required=True)
    p.add_argument("--quantity", type=positive, required=True)
    p.add_argument("--currency", default="USD")
    p.add_argument("--format", choices=("json", "csv"), default="json")
    p.add_argument("--output")
    args = parser.parse_args(argv)
    try:
        if args.output:
            destination = Path(args.output).resolve()
            if not destination.parent.is_dir():
                raise SourcingError("Output parent directory must already exist")
            inputs = getattr(args, "input", None)
            inputs = inputs if isinstance(inputs, list) else [inputs] if inputs else []
            if any(destination == Path(p).resolve() for p in inputs):
                raise SourcingError("Output must not overwrite an input file")
        if args.command == "compare":
            data = compare([load_json(p) for p in args.input], args.quantity, args.currency)
            code = 0 if data["source_reports_complete"] else 2
        else:
            options = vars(args).copy()
            for field in ("command", "output", "input", "part", "manufacturer"):
                options.pop(field, None)
            parts = read_parts(args) if args.command in {"nexar", "mouser", "lcsc", "jlcpcb"} else []
            data = collect(args.command, parts, **options)
            if parts:
                data["comparison"] = compare([data], args.quantity, args.currency)
            code = 0 if data["complete"] else 2
        write_output(render(data, getattr(args, "format", "json")), args.output)
        return code
    except SourcingError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except (OSError, UnicodeError):
        print("Local file operation failed; check path, encoding, and permissions", file=sys.stderr)
        return 1
    except (KeyError, TypeError, AttributeError, ValueError):
        print("Input or provider record has an unexpected shape", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
