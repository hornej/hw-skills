#!/usr/bin/env python3
"""Read-only Altium CSV/PrjPCB audit; candidate evidence, never design signoff."""
from __future__ import annotations

import argparse
import configparser
import csv
import hashlib
import io
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path


ALIASES = {
    "references": ["Designator", "Designators", "RefDes", "Reference", "References"],
    "quantity": ["Quantity", "Qty"],
    "mfr": ["MFR", "Manufacturer", "MFG", "Manufacturer Name"],
    "mpn": ["MPN", "Manufacturer Part Number", "Manufacturer Part No"],
    "supplier": ["Supplier"],
    "spn": ["SPN", "Supplier Part Number", "Supplier Part No"],
    "value": ["Value"],
    "comment": ["Comment"],
    "footprint": ["Footprint", "Pattern"],
}
PLACEHOLDER = re.compile(r"\[\s*noparam\s*\]|^\s*(?:tbd|n/?a|none|null|unknown|\?|-)\s*$", re.I)


def clean(value):
    return str(value or "").strip()


def key(value):
    return re.sub(r"[\s_.-]+", "", clean(value)).casefold()


def usable(value):
    return bool(clean(value)) and not PLACEHOLDER.search(clean(value)) and not clean(value).startswith("=")


def stamp(path, raw=None):
    path = Path(path).resolve()
    raw = path.read_bytes() if raw is None else raw
    return {"path": str(path), "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw), "modified_utc": datetime.fromtimestamp(
                path.stat().st_mtime, timezone.utc).isoformat()}


def decode(raw, encoding=None):
    if encoding:
        return raw.decode(encoding), encoding
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16"), "utf-16"
    try:
        return raw.decode("utf-8-sig"), "utf-8-sig"
    except UnicodeDecodeError:
        return raw.decode("cp1252"), "cp1252"


def issue(items, code, **details):
    items.append({"code": code, **details})


def read_table(path, encoding=None, columns=None):
    raw = Path(path).read_bytes()
    text, actual_encoding = decode(raw, encoding)
    lines = text.splitlines(keepends=True)
    reference_headers = {key(v) for v in ALIASES["references"]}
    if columns and columns.get("references"):
        reference_headers.add(key(columns["references"]))
    header = None
    for index, line in enumerate(lines):
        for delimiter in (",", "\t", ";"):
            try:
                fields = next(csv.reader([line], delimiter=delimiter, strict=True))
            except csv.Error:
                # A quoted field followed by another delimiter is invalid under
                # this trial dialect, not proof that the source is malformed.
                continue
            if len(fields) > 1 and any(key(v) in reference_headers for v in fields):
                header = index, delimiter
                break
        if header:
            break
    if header is None:
        raise ValueError(f"No designator table header found in {path}")
    index, delimiter = header
    reader = csv.reader(io.StringIO("".join(lines[index:])), delimiter=delimiter, strict=True)
    headers = [clean(v) for v in next(reader)]
    if len(set(map(key, headers))) != len(headers) or any(not v for v in headers):
        raise ValueError(f"Blank or duplicate table headers in {path}")
    rows = []
    for values in reader:
        if not any(clean(v) for v in values):
            continue
        if len(values) != len(headers):
            raise ValueError(f"Table width mismatch near line {index + reader.line_num}: {path}")
        rows.append({"source_line_end": index + reader.line_num,
                     "raw": dict(zip(headers, values))})
    if not rows:
        raise ValueError(f"Empty table in {path}")
    preamble = "".join(lines[:index])
    variants = re.findall(r"^\s*Variant\s*:\s*([^\r\n]*)", preamble, re.I | re.M)
    return {"source": {**stamp(path, raw), "encoding": actual_encoding,
                       "delimiter": delimiter, "header_line": index + 1},
            "headers": headers, "preamble": preamble, "declared_variants": variants,
            "rows": rows}


def field(raw, name, issues, line, columns=None, slot=None):
    if slot is None and columns and name in columns:
        selected = columns[name]
        if selected not in raw:
            raise ValueError(f"Mapped column {selected!r} missing")
        return clean(raw[selected])
    suffix = str(slot) if slot is not None else ""
    choices = [(h, clean(v)) for h, v in raw.items()
               if key(h) in {key(a) + suffix for a in ALIASES[name]} and clean(v)]
    if len({v.casefold() for _, v in choices}) > 1:
        issue(issues, "alias_conflict", line=line, field=name, slot=slot, values=dict(choices))
        return ""
    return choices[0][1] if choices else ""


def references(value):
    refs, unresolved = [], []
    value = re.sub(r"\s*[-–]\s*", "-", clean(value))
    for token in re.split(r"[,;\s]+", value):
        if not token:
            continue
        match = re.fullmatch(r"([A-Za-z]+)(\d+)-([A-Za-z]+)(\d+)", token)
        if match:
            prefix, start, other, end = match.groups()
            if prefix.casefold() == other.casefold() and 0 <= int(end) - int(start) <= 10000:
                refs.extend(f"{prefix.upper()}{n}" for n in range(int(start), int(end) + 1))
            else:
                unresolved.append(token)
        elif re.fullmatch(r"[A-Za-z]+\d+[A-Za-z0-9_]*", token):
            refs.append(token.upper())
        else:
            unresolved.append(token)
    return refs, unresolved


def population(raw, issues, line):
    states = []
    for header, value in raw.items():
        h, value = key(header), clean(value).casefold()
        if h not in {"fitted", "populate", "populated", "dnp", "donotpopulate"} or not value:
            continue
        if value in {"true", "yes", "1", "fitted", "populated"}:
            state = True
        elif value in {"false", "no", "0", "not fitted", "not populated"}:
            state = False
        elif value in {"dnp", "dnf"}:
            state = h in {"dnp", "donotpopulate"}
        else:
            issue(issues, "unknown_population", line=line, column=header, value=value)
            states.append(None)
            continue
        states.append(not state if h in {"dnp", "donotpopulate"} else state)
    if None in states or len(set(states)) > 1:
        if None not in states:
            issue(issues, "population_conflict", line=line)
        return "unknown"
    return "fitted" if not states or states[0] else "not_fitted"


def normalize_table(table, is_bom=True, columns=None):
    issues, result = [], []
    for item in table["rows"]:
        raw, line = item["raw"], item["source_line_end"]
        row = {name: field(raw, name, issues, line, columns) for name in ALIASES}
        row["choices"] = []
        slots = sorted({int(m.group(1)) for h in raw for m in [re.search(r"(\d+)$", h)] if m})
        for slot in slots:
            choice = {name: field(raw, name, issues, line, slot=slot)
                      for name in ("mfr", "mpn", "supplier", "spn")}
            if any(choice.values()):
                row["choices"].append({"slot": slot, **choice})
        # Only use a numbered pair as primary when neither unnumbered field exists.
        for left, right in (("mfr", "mpn"), ("supplier", "spn")):
            canonical_present = any(key(h) in {key(a) for n in (left, right) for a in ALIASES[n]}
                                    for h in raw)
            if not canonical_present and not any(columns and n in columns for n in (left, right)):
                selected = next((c for c in row["choices"] if c.get(left) or c.get(right)), None)
                if selected:
                    row[left], row[right] = selected[left], selected[right]
        refs, unresolved = references(row["references"])
        row.update({"references": refs, "unresolved_references": unresolved,
                    "population": population(raw, issues, line), "line": line, "raw": raw})
        if unresolved or not refs:
            issue(issues, "unresolved_references", line=line, value=row["raw"], tokens=unresolved)
        row["quantity_raw"] = row["quantity"]
        if row["quantity"]:
            try:
                amount = Decimal(row["quantity"])
                if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value():
                    raise InvalidOperation
                row["quantity"] = int(amount)
                if row["quantity"] != len(refs) or unresolved:
                    issue(issues, "quantity_reference_mismatch", line=line,
                          quantity=row["quantity"], parsed_references=len(refs))
            except InvalidOperation:
                row["quantity"] = None
                issue(issues, "invalid_quantity", line=line, value=row["quantity_raw"])
        else:
            row["quantity"] = None
            if is_bom:
                issue(issues, "missing_quantity", line=line)
        for h, v in raw.items():
            if PLACEHOLDER.search(clean(v)) or clean(v).startswith("="):
                issue(issues, "placeholder_or_expression", line=line, column=h, value=v)
        if is_bom and row["population"] != "not_fitted":
            missing = [n for n in ("mfr", "mpn", "supplier", "spn") if not row[n]]
            if missing:
                issue(issues, "missing_purchasing_fields", line=line, fields=missing, references=refs)
        result.append(row)
    counts = Counter(ref for row in result for ref in row["references"])
    duplicates = sorted(ref for ref, count in counts.items() if count > 1)
    if duplicates:
        issue(issues, "duplicate_references", references=duplicates)
    return {**table, "rows": result, "issues": issues}


def read_project(path, variant):
    raw = Path(path).read_bytes()
    text, encoding = decode(raw)
    config = configparser.ConfigParser(interpolation=None, strict=True)
    config.optionxform = str
    config.read_string(text)
    available = {s: config.get(s, "Description", fallback="") for s in config.sections()
                 if re.fullmatch(r"ProjectVariant\d+", s, re.I)}
    selected = [s for s, name in available.items() if name == variant]
    if variant != "@base" and len(selected) != 1:
        raise ValueError(f"Expected one variant {variant!r}; available: {list(available.values())}")
    fields = dict(config.items(selected[0])) if selected else {}
    variations = []
    for name, value in fields.items():
        if re.fullmatch(r"Variation\d+", name, re.I):
            entry = dict(part.split("=", 1) for part in value.split("|") if "=" in part)
            variations.append({"record": name, **{k.strip(): v.strip() for k, v in entry.items()}})
    return {"source": {**stamp(path, raw), "encoding": encoding}, "variant": variant,
            "section": selected[0] if selected else None, "available_variants": list(available.values()),
            "raw_variant_fields": fields, "variations": variations}


def nominal(row):
    families = {re.match(r"[A-Z]+", r).group() for r in row["references"]}
    if len(families) != 1 or next(iter(families)) not in {"R", "C", "L"}:
        return None
    family = next(iter(families))
    value = row["value"] or row["comment"]
    value = re.sub(r"\s+", "", value).replace("µ", "u").replace("μ", "u").replace("Ω", "ohm")
    value = re.sub(r"(?i)ohms?$", "", value)
    if family == "R":
        value = re.sub(r"[Rr]$", "", value)
        match = re.fullmatch(r"(\d+)([RrKkMm])(\d+)", value)
        if match:
            a, mult, b = match.groups()
            value = f"{a}.{b}{'' if mult in 'Rr' else mult}"
    elif value.endswith("F" if family == "C" else "H"):
        value = value[:-1]
    match = re.fullmatch(r"(\d+(?:\.\d+)?)([pnuUmkKM]?)", value)
    if not match:
        return None
    number, prefix = match.groups()
    scale = {"": 0, "p": -12, "n": -9, "u": -6, "U": -6, "m": -3, "k": 3, "K": 3, "M": 6}[prefix]
    return family, str((Decimal(number) * Decimal(10) ** scale).normalize())


def active_refs(table):
    # Include unknown states in potential-fit checks so ambiguity cannot hide a leak.
    return {r for row in table["rows"] if row["population"] != "not_fitted" for r in row["references"]}


def candidate_groups(rows):
    exact, candidates = defaultdict(list), defaultdict(list)
    for row in rows:
        if row["population"] == "not_fitted":
            continue
        if usable(row["mfr"]) and usable(row["mpn"]):
            exact[(row["mfr"].casefold(), row["mpn"].casefold())].append(row)
        value = nominal(row)
        if value:
            candidates[value].append(row)
    brief = lambda r: {n: r[n] for n in ("line", "references", "quantity", "mfr", "mpn", "footprint", "value", "comment")}
    return {
        "duplicate_identity_rows": [{"identity": list(k), "rows": [brief(r) for r in group]}
                                    for k, group in exact.items() if len(group) > 1],
        "nominal_value_candidates": [{"family": k[0], "base_value": k[1],
                                      "status": "candidate_only_package_and_ratings_unverified",
                                      "rows": [brief(r) for r in group]}
                                     for k, group in candidates.items()
                                     if len({(r["mfr"].casefold(), r["mpn"].casefold()) for r in group}) > 1],
    }


def compare_previous(report, previous):
    if (report["project"]["source"]["path"], report["project"]["variant"]) != (
            previous["project"]["source"]["path"], previous["project"]["variant"]):
        raise ValueError("Previous report is for a different project or variant")
    def indexed(rows):
        result = defaultdict(list)
        for row in rows:
            for ref in row["references"]:
                result[ref].append({k: row[k] for k in ("mfr", "mpn", "supplier", "spn", "value", "comment", "footprint", "population")})
        return result
    old, new = indexed(previous["bom"]["rows"]), indexed(report["bom"]["rows"])
    ambiguous = {r for r in old.keys() | new.keys() if len(old.get(r, [])) > 1 or len(new.get(r, [])) > 1}
    return {"previous_bom_sha256": previous["bom"]["source"]["sha256"],
            "unchanged_export": previous["bom"]["source"]["sha256"] == report["bom"]["source"]["sha256"],
            "added": sorted(new.keys() - old.keys()), "removed": sorted(old.keys() - new.keys()),
            "changed": [{"reference": r, "before": old[r][0], "after": new[r][0]}
                        for r in sorted(old.keys() & new.keys() - ambiguous) if old[r] != new[r]],
            "unresolved_duplicate_references": sorted(ambiguous)}


def audit(project_path, variant, bom_path, pnp_path=None, columns=None, bom_encoding=None, pnp_encoding=None):
    project = read_project(project_path, variant)
    bom = normalize_table(read_table(bom_path, bom_encoding, columns), columns=columns)
    pnp = normalize_table(read_table(pnp_path, pnp_encoding), is_bom=False) if pnp_path else None
    issues = [{"source": "bom", **i} for i in bom["issues"]]
    if pnp:
        issues += [{"source": "pnp", **i} for i in pnp["issues"]]
    for name, table in (("bom", bom), ("pnp", pnp)):
        if table is None:
            continue
        declared = [clean(v) for v in table["declared_variants"]]
        expected = {variant} if variant != "@base" else {"", "[no variations]", "no variations"}
        compared = declared if variant != "@base" else [v.casefold() for v in declared]
        if not declared:
            issue(issues, "export_variant_unverified", source=name)
        elif any(v not in expected for v in compared):
            issue(issues, "export_variant_mismatch", source=name, declared=declared, requested=variant)
        if table["source"]["modified_utc"] < project["source"]["modified_utc"]:
            issue(issues, "export_older_than_project", source=name)
    dnp = {v.get("Designator", "").upper() for v in project["variations"] if v.get("Kind") == "1"}
    if "" in dnp:
        issue(issues, "variant_dnp_missing_designator")
        dnp.remove("")
    if project["raw_variant_fields"].get("VariationCount") not in (None, str(len(project["variations"]))):
        issue(issues, "variant_record_count_mismatch")
    variation_refs = Counter(v.get("Designator", "").upper() for v in project["variations"])
    if any(n > 1 for n in variation_refs.values()):
        issue(issues, "duplicate_variant_designators", references=sorted(r for r, n in variation_refs.items() if n > 1))
    bom_refs, pnp_refs = active_refs(bom), active_refs(pnp) if pnp else set()
    reconciliation = {"basis": "physical_designator_text_only_identity_mapping_requires_review",
                      "variant_dnp_count": len(dnp), "dnp_present_in_bom": sorted(dnp & bom_refs),
                      "dnp_present_in_pnp": sorted(dnp & pnp_refs) if pnp else None,
                      "bom_only": sorted(bom_refs - pnp_refs) if pnp else None,
                      "pnp_only": sorted(pnp_refs - bom_refs) if pnp else None,
                      "non_dnp_variations_for_review": [v for v in project["variations"] if v.get("Kind") != "1"],
                      "parameter_override_fields": {k: v for k, v in project["raw_variant_fields"].items()
                                                    if re.match(r"Param(?:Variation|Designator)\d+$", k)}}
    identities = {(r["mfr"].casefold(), r["mpn"].casefold()) for r in bom["rows"]
                  if usable(r["mfr"]) and usable(r["mpn"]) and r["population"] != "not_fitted"}
    return {"schema_version": 1, "generated_utc": datetime.now(timezone.utc).isoformat(),
            "project": project, "bom": bom, "pnp": pnp, "issues": issues,
            "summary": {"bom_rows": len(bom["rows"]), "unique_complete_identities": len(identities),
                        "potentially_fitted_references": len(bom_refs),
                        "explicit_not_fitted_rows": sum(r["population"] == "not_fitted" for r in bom["rows"]),
                        "unknown_population_rows": sum(r["population"] == "unknown" for r in bom["rows"]),
                        "known_quantity_sum": sum(r["quantity"] or 0 for r in bom["rows"]),
                        "rows_without_valid_quantity": sum(r["quantity"] is None for r in bom["rows"]),
                        "pnp_references": len(pnp_refs) if pnp else None},
            **candidate_groups(bom["rows"]), "reconciliation": reconciliation,
            "coverage": {"export_project_linkage": "manual_review_required",
                         "live_availability": "not_checked", "electrical_qualification": "not_checked",
                         "physical_identity_mapping": "not_checked", "schematic_dnp_ownership": "not_checked",
                         "alternate_parts_and_parameter_overrides": "manual_review_required",
                         "native_compile_erc_drc": "not_checked", "assembly_exclusions": "manual_review_required"}}


def write_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("project", "variant", "bom", "out"):
        parser.add_argument(f"--{arg}", required=True)
    for arg in ("pnp", "previous", "columns", "bom-encoding", "pnp-encoding"):
        parser.add_argument(f"--{arg}")
    args = parser.parse_args()
    if Path(args.out).exists():
        parser.error("Output already exists; choose a new report path")
    columns = json.loads(Path(args.columns).read_text(encoding="utf-8-sig")) if args.columns else None
    report = audit(args.project, args.variant, args.bom, args.pnp, columns, args.bom_encoding, args.pnp_encoding)
    if args.previous:
        report["delta"] = compare_previous(report, json.loads(Path(args.previous).read_text(encoding="utf-8")))
    write_new(args.out, report)
    print(json.dumps({"report": str(Path(args.out).resolve()), "summary": report["summary"],
                      "issue_count": len(report["issues"]), "coverage": report["coverage"]}, indent=2))


if __name__ == "__main__":
    main()
