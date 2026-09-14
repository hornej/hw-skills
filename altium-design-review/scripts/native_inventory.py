#!/usr/bin/env python3
"""Inventory saved Altium sources using an existing Altium Monkey environment."""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import re
import subprocess
import sys
from pathlib import Path

from audit_exports import stamp, write_new


def location(obj):
    point = getattr(obj, "location", None)
    return [float(point.x), float(point.y)] if point is not None else None


def text_parameters(component):
    return [{"name": str(getattr(p, "name", "")), "text": str(getattr(p, "text", "")),
             "unique_id": str(getattr(p, "unique_id", "")),
             "hidden": bool(getattr(p, "is_hidden", False)), "location": location(p)}
            for p in component.parameters]


def inventory(project_path, pcb_path=None, engine_src=None):
    if engine_src:
        sys.path.insert(0, str(Path(engine_src).resolve()))
    try:
        import altium_monkey
        from altium_monkey import AltiumPcbDoc, AltiumSchDoc
        from altium_monkey.altium_prjpcb import AltiumPrjPcb
    except ImportError as exc:
        raise RuntimeError("Use an existing Python environment with Altium Monkey and its dependencies; "
                           "export auditing remains available without it") from exc
    engine = {"module_path": str(Path(altium_monkey.__file__).resolve())}
    try:
        engine["distribution_version"] = importlib.metadata.version("altium-monkey")
    except importlib.metadata.PackageNotFoundError:
        engine["distribution_version"] = None
    if engine_src:
        for name, command in (("git_commit", ["rev-parse", "HEAD"]),
                              ("git_status", ["status", "--short"])):
            result = subprocess.run(["git", "-C", str(engine_src), *command], capture_output=True, text=True)
            engine[name] = result.stdout.strip() if result.returncode == 0 else "unavailable"
    sources = [stamp(project_path)]
    project = AltiumPrjPcb(Path(project_path))
    sheets, errors = [], []
    for path in project.get_reachable_schdoc_paths():
        try:
            source = stamp(path)
            doc = AltiumSchDoc(path)
            components = []
            for component in doc.get_components():
                record = component.record
                components.append({"logical_designator": component.designator,
                                   "unique_id": component.unique_id,
                                   "current_part_id": getattr(record, "current_part_id", None),
                                   "location": location(record), "library_ref": component.library_ref,
                                   "footprint": component.footprint,
                                   "parameters": text_parameters(component),
                                   "pins": [{"designator": str(p.designator), "name": str(p.name)}
                                            for p in component.pins]})
            labels = [{"text": str(label.text), "unique_id": str(label.unique_id),
                       "hidden": bool(getattr(label, "is_hidden", False)), "location": location(label),
                       "ownership": "unresolved"}
                      for label in doc.get_labels()
                      if re.search(r"\b(?:DNP|DNF|DO NOT (?:FIT|POPULATE))\b", str(label.text), re.I)]
            if stamp(path)["sha256"] != source["sha256"]:
                raise ValueError("Source changed during inventory")
            sources.append(source)
            sheets.append({"source": source, "components": components, "dnp_texts": labels})
        except Exception as exc:
            errors.append({"path": str(path), "error": f"{type(exc).__name__}: {exc}"})
    pcb_components = None
    if pcb_path:
        source = stamp(pcb_path)
        pcb = AltiumPcbDoc.from_file(Path(pcb_path))
        pcb_components = []
        for component in pcb.components:
            raw = component.raw_record
            pcb_components.append({"physical_designator": component.designator,
                                   "source_unique_id": raw.get("SOURCEUNIQUEID", ""),
                                   "source_designator": raw.get("SOURCEDESIGNATOR", ""),
                                   "source_document": raw.get("SOURCEDESIGNDOCUMENT", ""),
                                   "source_records": {k: v for k, v in raw.items() if "SOURCE" in k},
                                   "pattern": raw.get("PATTERN", ""),
                                   "parameters": getattr(component, "parameters", {})})
        if stamp(pcb_path)["sha256"] != source["sha256"]:
            raise ValueError("PCB changed during inventory")
        sources.append(source)
    # A sheet read early can change while later sheets or the PCB are loading.
    for source in sources:
        try:
            if stamp(source["path"])["sha256"] != source["sha256"]:
                errors.append({"path": source["path"], "error": "Source changed during inventory"})
        except OSError as exc:
            errors.append({"path": source["path"], "error": f"Final source verification failed: {exc}"})
    return {"schema_version": 1, "engine": engine, "sources": sources, "sheets": sheets,
            "pcb_components": pcb_components, "errors": errors,
            "coverage": {"saved_source_inventory": "incomplete" if errors or not sheets else "read",
                         "logical_to_physical_mapping": "not_resolved",
                         "dnp_text_ownership": "not_resolved", "pin_net_connectivity": "not_resolved",
                         "native_altium_compile": "not_run"}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--pcb")
    parser.add_argument("--engine-src")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    if Path(args.out).exists():
        parser.error("Output already exists; choose a new report path")
    report = inventory(args.project, args.pcb, args.engine_src)
    write_new(args.out, report)
    print(json.dumps({"report": str(Path(args.out).resolve()), "sheets": len(report["sheets"]),
                      "logical_symbols": sum(len(s["components"]) for s in report["sheets"]),
                      "pcb_components": len(report["pcb_components"]) if report["pcb_components"] is not None else None,
                      "errors": report["errors"], "coverage": report["coverage"]}, indent=2))
    return 1 if report["errors"] or not report["sheets"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
