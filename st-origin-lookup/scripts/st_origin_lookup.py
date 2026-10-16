#!/usr/bin/env python3
"""Read ST's declared COO; never infer fabrication, assembly, or test sites."""

import argparse
import csv
import io
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://ksmk.st.com"
ORIGIN_ATTRIBUTE = "5080"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024


class LookupFailure(Exception):
    """Unavailable, malformed, or inconsistent source evidence."""


def require_id(value, prefix):
    if not isinstance(value, str) or not re.fullmatch(prefix + r"\d+", value):
        raise LookupFailure(f"Expected an observed {prefix} identifier, got {value!r}")
    return value


def products_url(parent_id):
    return f"{BASE_URL}/products/productsByParentId?parentId={parent_id}"


def attributes_url(product_id):
    return f"{BASE_URL}/viewAttributes/getListOfViewAttributes?prmisId={product_id}"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def fetch_json(url, timeout):
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": "STOriginLookup/1.0"}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise LookupFailure("Response exceeds the 4 MiB limit")
        return json.loads(body), utc_now()
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise LookupFailure(
            f"Could not read {url}: {exc}. No retry was made. "
            "Use the normal ST product page and --capture if browser access works."
        ) from exc


def select_products(products, parent_id, requested_parts):
    if not isinstance(products, list):
        raise LookupFailure("Product response must be a JSON array")
    mapping = {}
    for row in products:
        if not isinstance(row, dict) or row.get("parent_id") != parent_id:
            raise LookupFailure("Product row does not belong to the requested family")
        part = row.get("item_name")
        if not isinstance(part, str) or not part.strip():
            raise LookupFailure("Product row has no exact ordering code")
        product_id = require_id(row.get("prmis_id"), "CP")
        key = part.strip().upper()
        if key in mapping:
            raise LookupFailure(f"Multiple product mappings for {key}; inspect the source")
        mapping[key] = (part.strip(), product_id)
    if not mapping:
        raise LookupFailure("No ordering codes returned for this family")
    wanted = list(dict.fromkeys(p.strip().upper() for p in requested_parts))
    if not wanted:
        wanted = list(mapping)
    missing = [part for part in wanted if part not in mapping]
    if missing:
        raise LookupFailure("No exact ordering-code match for: " + ", ".join(missing))
    return [mapping[part] for part in wanted]


def normalize_attributes(part, product_id, parent_id, rows, observed_at, mode):
    if not isinstance(rows, list):
        raise LookupFailure(f"{part}: attributes must be a JSON array")
    values = []
    for row in rows:
        if not isinstance(row, dict) or row.get("prmis_id") != product_id:
            raise LookupFailure(f"{part}: attribute response contains a different product ID")
        if "attribute_name" not in row or "attribute_value" not in row:
            raise LookupFailure(f"{part}: attribute row has an unexpected schema")
        if str(row["attribute_name"]) == ORIGIN_ATTRIBUTE:
            value = row["attribute_value"]
            if value is None:
                continue
            if not isinstance(value, str):
                raise LookupFailure(f"{part}: origin value is not a string")
            value = value.strip()
            if value and value not in values:
                values.append(value)
    status = "missing" if not values else "reported" if len(values) == 1 else "ambiguous"
    return {
        "part_number": part,
        "st_product_id": product_id,
        "st_parent_id": parent_id,
        "declared_country_of_origin": values[0] if len(values) == 1 else None,
        "coo_status": status,
        "reported_values": values,
        "wafer_fabrication_country": None,
        "assembly_country": None,
        "test_country": None,
        "manufacturing_locations_status": "not_verified",
        "source_url": attributes_url(product_id),
        "mapping_source_url": products_url(parent_id),
        "observed_at_utc": observed_at,
        "retrieval_mode": mode,
    }


def validate_capture(capture, requested_parent=None):
    if not isinstance(capture, dict) or capture.get("schema") != "st-origin-capture-v1":
        raise LookupFailure("Expected a st-origin-capture-v1 envelope")
    parent = require_id(capture.get("parent_id"), "PF")
    if requested_parent and parent != requested_parent:
        raise LookupFailure("Capture family differs from --parent-id")
    stamp = capture.get("captured_at_utc")
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
            raise ValueError("capture timestamp must have a UTC offset")
    except (AttributeError, TypeError, ValueError) as exc:
        raise LookupFailure("captured_at_utc must be a UTC ISO-8601 timestamp") from exc
    if not isinstance(capture.get("attributes"), dict):
        raise LookupFailure("Capture attributes must be keyed by CP product ID")
    return parent, stamp


def lookup(args):
    capture = None
    if args.capture:
        if args.capture == "-":
            capture = json.load(sys.stdin)
        else:
            capture = json.loads(Path(args.capture).read_text(encoding="utf-8-sig"))
        parent, capture_time = validate_capture(capture, args.parent_id)
        products = capture.get("products")
    else:
        parent = require_id(args.parent_id, "PF")
        products, _ = fetch_json(products_url(parent), args.timeout)
    selected = select_products(products, parent, args.part)
    records = []
    for index, (part, product_id) in enumerate(selected):
        if capture is not None:
            if product_id not in capture["attributes"]:
                raise LookupFailure(f"{part}: capture has no attribute response for {product_id}")
            rows = capture["attributes"][product_id]
            observed_at, mode = capture_time, "browser_capture"
        else:
            if index:
                time.sleep(0.5)
            rows, observed_at = fetch_json(attributes_url(product_id), args.timeout)
            mode = "direct_http"
        records.append(normalize_attributes(part, product_id, parent, rows, observed_at, mode))
    return records


def render(records, output_format):
    if output_format == "json":
        return json.dumps(
            {"schema": "st-origin-results-v1", "records": records}, indent=2, ensure_ascii=False
        ) + "\n"
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=list(records[0]))
    writer.writeheader()
    for record in records:
        row = dict(record)
        row["reported_values"] = json.dumps(row["reported_values"], ensure_ascii=False)
        writer.writerow(row)
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-id", help="Observed ST family ID (PF...), required for direct HTTP")
    parser.add_argument("--part", action="append", default=[], help="Exact code; repeat for a batch")
    parser.add_argument("--capture", help="Browser capture envelope JSON file, or - for stdin")
    parser.add_argument("--timeout", type=float, default=12, help="Per-request seconds, 0 < n <= 60")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--output", help="Optional output file; otherwise stdout")
    args = parser.parse_args()
    if not args.capture and not args.parent_id:
        parser.error("supply --parent-id or --capture")
    if not 0 < args.timeout <= 60:
        parser.error("--timeout must be greater than 0 and at most 60 seconds")
    try:
        result = render(lookup(args), args.format)
        if args.output:
            with Path(args.output).open("w", encoding="utf-8", newline="") as stream:
                stream.write(result)
        else:
            sys.stdout.write(result)
        return 0
    except (LookupFailure, OSError, ValueError) as exc:
        print(f"Origin lookup failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
