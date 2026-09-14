#!/usr/bin/env python3
"""Offline CSV preparation and conservative Altium server-log inspection."""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re
import sys


def validate_source(source):
    if not isinstance(source, dict):
        raise ValueError("Source must be a JSON object")
    columns = source.get("columns")
    if not isinstance(columns, list) or not columns:
        raise ValueError("columns must be a nonempty list")
    if any(not isinstance(c, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_ ]*", c)
           or c != c.strip() for c in columns):
        raise ValueError("Use simple text column names without surrounding whitespace")
    if len({c.casefold() for c in columns}) != len(columns):
        raise ValueError("Column names must be unique ignoring case")
    key = source.get("key_parameter")
    if not isinstance(key, str) or key not in columns:
        raise ValueError("key_parameter must name an included column")
    rows = source.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValueError("rows must be a nonempty list")
    seen = set()
    for index, row in enumerate(rows, 1):
        if not isinstance(row, dict) or set(row) != set(columns):
            raise ValueError(f"Row {index} must contain exactly the declared columns")
        for column, value in row.items():
            if not isinstance(value, str):
                raise ValueError(f"Row {index}, {column}: cells must be strings")
            if len(value) > 1024 or any(ord(c) < 32 or ord(c) == 127 for c in value):
                raise ValueError(f"Row {index}, {column}: exceeds text schema limits")
        identity = row[key].strip().casefold()
        if not identity or identity in seen:
            raise ValueError(f"Row {index}: blank or duplicate source key")
        seen.add(identity)
    return columns, key, rows


def prepare(source, output):
    columns, key, rows = validate_source(source)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    data = output / "data"
    data.mkdir()
    csv_path = data / "components.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)
    schema = ["[components.csv]", "Format=CSVDelimited", "ColNameHeader=True",
              "MaxScanRows=0", "CharacterSet=65001"]
    schema.extend(f"Col{i}={name} Text Width 1024"
                  for i, name in enumerate(columns, 1))
    schema_path = data / "schema.ini"
    schema_path.write_text("\n".join(schema) + "\n", encoding="utf-8")
    manifest = {
        "status": "prepared_offline", "rows": len(rows), "columns": columns,
        "key_parameter": key, "target_matches_verified": False,
        "workspace_modified": False,
        "files": {p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (csv_path, schema_path)},
    }
    (output / "source-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def inspect_log(text):
    # Server errors may echo authenticated configuration or request data. Keep
    # this shareable summary to locations; raw diagnostics stay in the private log.
    errors = [{"line": number, "details": "Inspect this error in the private source log"}
              for number, line in enumerate(text.splitlines(), 1)
              if re.search(r"\bERROR\b|\bFailed to (?:write|synchronize)\b|Insufficient privileges", line,
                           re.IGNORECASE)]
    counts = [int(n) for n in re.findall(
        r"Successfully written\s+(\d+)\s+item\(s\)\s+to server", text, re.IGNORECASE)]
    written = sum(counts)
    if errors:
        status = "writes_reported_with_errors" if written else "server_error"
    elif written:
        status = "writes_reported_unverified"
    elif counts:
        status = "zero_writes_reported"
    else:
        status = "inconclusive"
    return {"status": status, "reported_write_count": written,
            "write_messages": len(counts), "errors": errors,
            "live_readback_required": True, "workspace_result_verified": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    source_parser = sub.add_parser("prepare", help="Prepare a new isolated CSV source directory")
    source_parser.add_argument("--input", type=Path, required=True)
    source_parser.add_argument("--output", type=Path, required=True)
    log_parser = sub.add_parser("inspect-log", help="Inspect one invocation's server log")
    log_parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            result = prepare(json.loads(args.input.read_text(encoding="utf-8-sig")), args.output)
            code = 0
        else:
            result = inspect_log(args.input.read_text(encoding="utf-8-sig"))
            code = 0 if result["status"] == "writes_reported_unverified" else 2
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return code
    except (OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
