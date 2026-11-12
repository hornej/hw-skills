#!/usr/bin/env python3
"""Read an unpacked CAM package with Gerbonara; never rewrite manufacturing files."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys
import warnings

ENGINE_VERSION = "1.6.3"
EXTENSIONS = {".gtl": "top copper", ".gbl": "bottom copper", ".gts": "top mask",
              ".gbs": "bottom mask", ".gto": "top silk", ".gbo": "bottom silk",
              ".gtp": "top paste", ".gbp": "bottom paste"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def classify(path, kind, attrs):
    """Keep naming evidence separate from the geometry it labels."""
    function = attrs.get(".FileFunction", [])
    if function:
        f = [str(s).lower() for s in function]
        if f[0] == "copper" and len(f) >= 3:
            return f"{dict(top='top', bot='bottom').get(f[2], f[1])} copper", "gerber_attribute"
        if f[0] == "profile":
            return "outline", "gerber_attribute"
        if f[0] in ("soldermask", "legend", "paste") and len(f) >= 2:
            return f"{dict(top='top', bot='bottom').get(f[1], f[1])} " + {
                "soldermask": "mask", "legend": "silk", "paste": "paste"}[f[0]], "gerber_attribute"
    if kind == "excellon":
        return "drill", "file_format"
    if kind == "ipc356":
        return "netlist", "file_format"
    return EXTENSIONS.get(path.suffix.lower()), "filename_hint"


def inspect_package(directory, layer_map=None, required=(), render=False):
    from gerbonara import GerberFile, ExcellonFile
    from gerbonara.ipc356 import Netlist
    from gerbonara.layers import identify_file
    from gerbonara.utils import MM

    version = importlib.metadata.version("gerbonara")
    if version != ENGINE_VERSION:
        raise ValueError(f"Expected gerbonara=={ENGINE_VERSION}, found {version}; qualify before changing the pin")
    root = Path(directory).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Input must be an unpacked CAM directory")
    paths = sorted(p for p in root.rglob("*") if p.is_file())
    if not paths:
        raise ValueError("CAM directory is empty")
    snapshots = {p: p.read_bytes() for p in paths}
    mapping, map_source = {}, None
    if layer_map:
        map_path = Path(layer_map).resolve(strict=True)
        map_bytes = map_path.read_bytes()
        spec = json.loads(map_bytes)
        if not isinstance(spec, dict) or not isinstance(spec.get("required_roles", []), list):
            raise ValueError("Layer map must be an object; required_roles must be an array")
        mapping = spec.get("layers", {})
        required = [*required, *spec.get("required_roles", [])]
        if not isinstance(mapping, dict) or any(not isinstance(k, str) or not isinstance(v, str) or not v.strip()
                                                for k, v in mapping.items()):
            raise ValueError("Layer map must map relative file paths to nonempty role strings")
        map_source = {"path": str(map_path), "sha256": digest(map_bytes)}
    if any(not isinstance(role, str) or not role.strip() for role in required):
        raise ValueError("Required roles must be nonempty strings")
    findings, entries, svgs = [], [], {}
    names = {p.relative_to(root).as_posix() for p in paths}
    for missing in sorted(set(mapping) - names):
        findings.append({"code": "mapped_file_missing", "file": missing})
    for index, (path, data) in enumerate(snapshots.items()):
        name = path.relative_to(root).as_posix()
        entry = {"path": name, "sha256": digest(data), "bytes": len(data), "status": "unparsed"}
        entries.append(entry)
        caught = []
        try:
            text = data.decode("utf-8-sig")
            kind = identify_file(text)
            entry["format"] = kind
            parsers = {"gerber": GerberFile, "excellon": ExcellonFile, "ipc356": Netlist}
            if kind not in parsers:
                findings.append({"code": "unrecognized_file", "file": name})
                continue
            with warnings.catch_warnings(record=True) as caught:
                warnings.simplefilter("always")
                obj = parsers[kind].from_string(text, filename=str(path))
                # IPC test records are connectivity evidence, not Gerbonara graphic objects.
                bounds = None if kind == "ipc356" else obj.bounding_box(unit=MM, default=None)
                attrs = getattr(obj, "file_attrs", {})
                role, basis = classify(path, kind, attrs)
                if name in mapping:
                    explicit = mapping[name]
                    if role and basis == "gerber_attribute" and role != explicit:
                        findings.append({"code": "layer_attribute_conflict", "file": name,
                                         "attribute_role": role, "mapped_role": explicit})
                    role, basis = explicit, "explicit_map"
                settings = getattr(obj, "import_settings", None)
                unit = getattr(settings, "unit", None)
                entry.update(status="parsed", role=role, role_basis=basis, source_units=str(unit) if unit else None,
                             bounds_mm=bounds, object_count=sum(1 for _ in obj.objects), attributes=attrs)
                if not role:
                    findings.append({"code": "unclassified_layer", "file": name})
                if bounds is None and kind != "ipc356":
                    findings.append({"code": "empty_geometry", "file": name})
                if unit is None:
                    findings.append({"code": "units_unknown", "file": name})
                if kind == "excellon":
                    entry.update(drill_diameters_mm=obj.drill_sizes(MM), plating=obj.is_plated_tristate)
                    if entry["plating"] is None:
                        findings.append({"code": "plating_unknown_or_mixed", "file": name})
                if kind == "ipc356":
                    # 1.6.3's reader populates `pin`; pin_num is its writer/dataclass field.
                    entry["test_records"] = [{"refdes": r.ref_des, "pin": getattr(r, "pin", r.pin_num), "net": r.net_name,
                                               "x_mm": MM(r.x, r.unit) if r.x is not None and r.unit else None,
                                               "y_mm": MM(r.y, r.unit) if r.y is not None and r.unit else None,
                                               "plated": r.is_plated} for r in obj.test_records]
                    if not obj.test_records:
                        findings.append({"code": "empty_netlist", "file": name})
                if render and kind in ("gerber", "excellon") and bounds is not None:
                    svg_name = f"{index:04d}-{re.sub(r'[^a-zA-Z0-9_.-]', '_', path.name)}.svg"
                    svgs[svg_name] = str(obj.to_svg(svg_unit=MM))
                    entry["preview"] = svg_name
            entry["parser_warnings"] = [str(w.message) for w in caught]
            if caught:
                findings.append({"code": "parser_warning", "file": name})
        except Exception as exc:
            entry.update(status="error", error=f"{type(exc).__name__}: {exc}")
            entry["parser_warnings"] = [str(w.message) for w in caught]
            findings.append({"code": "parse_error", "file": name})
    roles = Counter(e["role"] for e in entries if e.get("role") and e["status"] == "parsed")
    for role in sorted(set(required)):
        if not roles[role]:
            findings.append({"code": "required_role_missing", "role": role})
    for role, count in sorted(roles.items()):
        if count > 1 and role not in ("drill",):
            findings.append({"code": "duplicate_role", "role": role, "count": count})
    outlines = [e for e in entries if e.get("role") == "outline" and e.get("bounds_mm") and e["status"] == "parsed"]
    if len(outlines) == 1:
        (x0, y0), (x1, y1) = outlines[0]["bounds_mm"]
        for entry in entries:
            if entry.get("format") != "excellon" or not entry.get("bounds_mm"):
                continue
            (a, b), (c, d) = entry["bounds_mm"]
            if a < x0 - 0.05 or b < y0 - 0.05 or c > x1 + 0.05 or d > y1 + 0.05:
                findings.append({"code": "drill_outside_outline_bounds", "file": entry["path"],
                                 "note": "Possible offset/units mismatch, edge hole, slot or tooling feature; inspect geometry"})
    changed = [p.relative_to(root).as_posix() for p, data in snapshots.items()
               if not p.exists() or digest(p.read_bytes()) != digest(data)]
    if names != {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}:
        changed.append("<package file membership>")
    if map_source and digest(Path(map_source["path"]).read_bytes()) != map_source["sha256"]:
        changed.append("<layer map>")
    if changed:
        findings.append({"code": "source_changed", "files": changed})
    return {"schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
            "engine": {"name": "gerbonara", "version": version}, "input_directory": str(root),
            "layer_map_source": map_source, "required_roles": sorted(set(required)), "files": entries,
            "findings": findings, "coverage": {
                "source_stability": "changed" if changed else "unchanged",
                "package_parsing": "incomplete" if any(e["status"] != "parsed" for e in entries) else "parsed",
                "outline": "bounds_only" if len(outlines) == 1 else "unresolved",
                "drill_alignment": "bounds_screen_only" if len(outlines) == 1 else "not_checked",
                "origin_agreement": "not_verified", "outline_closure": "not_checked",
                "copper_connectivity": "not_checked", "native_drc": "not_run", "vendor_dfm": "not_run"}}, svgs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    parser.add_argument("--out", required=True, help="New output directory outside the source package")
    parser.add_argument("--layer-map", help="JSON with layers and optional required_roles")
    parser.add_argument("--require", action="append", default=[], help="Expected role, repeatable (e.g. 'bottom copper')")
    parser.add_argument("--render", action="store_true", help="Write per-layer SVG previews in source coordinates")
    args = parser.parse_args()
    try:
        root, out = Path(args.directory).resolve(), Path(args.out).resolve()
        if out == root or root in out.parents:
            raise ValueError("Output must be outside the input package")
        if out.exists():
            raise FileExistsError(f"Output already exists: {out}")
        report, svgs = inspect_package(root, args.layer_map, args.require, args.render)
        out.mkdir(parents=True, exist_ok=False)
        (out / "report.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        for name, svg in svgs.items():
            (out / name).write_text(svg, encoding="utf-8")
        print(json.dumps({"report": str(out / "report.json"), "files": len(report["files"]),
                          "findings": len(report["findings"])}))
        if any(f["code"] in ("parse_error", "source_changed") for f in report["findings"]):
            return 2
        return 1 if report["findings"] else 0
    except (OSError, ValueError, ImportError) as exc:
        print(f"CAM inspection failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
