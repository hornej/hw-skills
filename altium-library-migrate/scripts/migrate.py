#!/usr/bin/env python3
"""Analyze or generate an offline Altium migration. No network/import/delete command."""
from __future__ import annotations
import argparse
import copy
import json
import logging
import re
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from types import SimpleNamespace
from policy import (FIELDS, canonicalize, category, check_unchanged, discover, file_groups,
                    load_policy, match_exception, reserve_output, sha256, write_json)
import consolidate as engine
from altium_monkey import AltiumPcbLib, AltiumSchLib
from normalize_records import parameter_map

def top_parameter(record):
    return str(record.get("RECORD", "")) == "41" and str(record.get("OwnerIndex", "0")) in {"", "0"}

def canonical_records(records, canonical, component_type, rules):
    """Remove alias/duplicate records with complete OwnerIndex remapping."""
    aliases = {a.casefold(): f for f, names in rules["canonicalParameters"].items()
               for a in [f, *names]}
    # Branded supplier parameters retain their independent meaning.
    removed, chosen = set(), {}
    for index, record in enumerate(records):
        if not top_parameter(record):
            continue
        name = str(record.get("Name", "")).casefold()
        target = aliases.get(name)
        if target:
            if target not in chosen:
                chosen[target] = index
            elif name == target.casefold() and str(records[chosen[target]].get("Name","")).casefold() != name:
                removed.add(chosen[target])
                chosen[target] = index
            else:
                removed.add(index)
    new, index_map = [], {}
    for index, record in enumerate(records):
        if index in removed:
            continue
        index_map[index] = len(new)
        new.append(copy.deepcopy(record))
    for old, new_index in index_map.items():
        record = new[new_index]
        owner = engine.record_owner(record)
        if owner in removed:
            raise ValueError("Cannot remove an aliased parameter with owned child records")
        if owner is not None and owner in index_map:
            record["OwnerIndex"] = str(index_map[owner])
        if top_parameter(record):
            target = aliases.get(str(record.get("Name", "")).casefold())
            if target:
                record["Name"], record["Text"] = target, canonical[target]
        # Resolve simple references to retired names; keep compound expressions for review.
        for key in ("Text",):
            text = str(record.get(key, ""))
            if text.startswith("=") and text[1:].strip().casefold() in aliases:
                record[key] = "=" + aliases[text[1:].strip().casefold()]
    for field in FIELDS:
        engine.upsert_parameter(new, field, canonical[field])
    engine.upsert_parameter(new, "ComponentType", component_type)
    engine.strip_workspace_links(new)
    return new

def resolve_candidates(source, record, candidates, duplicate_paths):
    name = engine.implementation_name(record)
    rows = candidates.get(name.casefold(), [])
    if not rows:
        return [], "missing"
    explicit = str(record.get("ModelDatafile0", "")).strip()
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = source.parent / path
        wanted = duplicate_paths.get(str(path.resolve()).casefold(), str(path.resolve()).casefold())
        matches = [p for p in rows if str(p).casefold() == wanted]
        if matches:
            return matches, "explicit"
    near = [p for p in rows if p.parent == source.parent]
    if near:
        return near, "directory"
    same_stem = [p for p in rows if p.stem.casefold() == source.stem.casefold()]
    if same_stem:
        return same_stem, "stem"
    return rows, "global"

def audit_and_normalize(groups, rules, flat, report):
    pcbs = [r for r in groups if Path(r["source"]).suffix.casefold() == ".pcblib"]
    # Byte-identical SchLibs can resolve relative/same-directory footprints differently.
    # Analyze each context, while keeping content-duplicate provenance in the inventory.
    schs = []
    for row in groups:
        if Path(row["source"]).suffix.casefold() != ".schlib":
            continue
        for source in [row["source"], *row["exact_duplicate_sources"]]:
            schs.append({**row, "source":source})
    candidates, duplicate_paths = defaultdict(list), {}
    footprints = []
    for row in pcbs:
        path = Path(row["source"])
        for duplicate in [row["source"], *row["exact_duplicate_sources"]]:
            duplicate_paths[str(Path(duplicate).resolve()).casefold()] = str(path).casefold()
        try:
            library = AltiumPcbLib.from_file(path)
            for name in library.footprint_names():
                candidates[name.casefold()].append(path)
                footprints.append((str(path), name))
        except Exception as error:
            report["blockers"].append({"kind":"pcblib_parse", "source":str(path), "error":str(error)})
    flat.mkdir(parents=True, exist_ok=True)
    libraries, referenced = [], set()
    for row in schs:
        source = Path(row["source"])
        print(f"Inspecting {source.name}", flush=True)
        try:
            original = AltiumSchLib(source)
            output = AltiumSchLib()
            output.font_manager = copy.deepcopy(original.font_manager)
            output.file_header = copy.deepcopy(original.file_header)
            output.embedded_images = copy.deepcopy(original.embedded_images)
            output._weight_policy = "serialized_data_records"
            expected = {}
            for symbol in original.symbols:
                params = parameter_map(symbol)
                canonical, conflicts = canonicalize(params, rules)
                component_type, reason = category(symbol.name,
                    str(symbol.designators[0].text if symbol.designators else ""), params, rules, str(source))
                excluded = next((r for r in rules["excludedComponents"]
                    if match_exception(r, symbol.name, str(source), canonical)), None)
                if excluded:
                    report["excluded_components"].append({"source":str(source),"component":symbol.name,"reason":excluded["reason"]})
                    continue
                for override in rules["parameterOverrides"]:
                    if match_exception(override, symbol.name, str(source), canonical):
                        canonical.update(override["parameters"])
                if not component_type:
                    report["blockers"].append({"kind":"category","source":str(source),"component":symbol.name})
                for conflict in conflicts:
                    report["metadata_conflicts"].append({"source":str(source),"component":symbol.name,**conflict})
                records = canonical_records(symbol.raw_records, canonical, component_type, rules)
                for record in records:
                    if str(record.get("RECORD","")) != "45":
                        continue
                    if str(record.get("ModelType","PCBLIB")).casefold() != "pcblib":
                        report["blockers"].append({"kind":"unsupported_model","source":str(source),
                            "component":symbol.name,"model_type":record.get("ModelType")})
                        continue
                    model = engine.implementation_name(record)
                    for rule in rules["modelSubstitutions"]:
                        if model.casefold() == rule["fromModel"].casefold() and re.search(rule["componentPattern"],symbol.name,re.I):
                            model = rule["toModel"]
                            record["ModelName"] = record["ModelDatafileEntity0"] = model
                            record["ModelDatafile0"] = ""
                            report["model_substitutions"].append({"source":str(source),"component":symbol.name,**rule})
                            break
                    paths, tier = resolve_candidates(source, record, candidates, duplicate_paths)
                    allowed = next((r for r in rules["allowAmbiguousModels"]
                        if r["model"].casefold() == model.casefold()
                        and match_exception(r, symbol.name, str(source), canonical)), None)
                    model_row = {"source":str(source),"component":symbol.name,"model":model,
                                 "candidates":[str(p) for p in paths],"resolution":tier,
                                 "approved_ambiguity":allowed["reason"] if allowed else ""}
                    report["model_resolution"].append(model_row)
                    if not paths or (len(paths)>1 and not allowed):
                        report["blockers"].append({"kind":"missing_model" if not paths else "ambiguous_model",**model_row})
                    if len(paths) == 1:
                        record["ModelDatafile0"] = str(paths[0])
                    elif len(paths)>1:
                        # Empty path lets the writer attach all approved candidates.
                        record["ModelDatafile0"] = ""
                    for p in paths:
                        referenced.add((str(p), model.casefold()))
                new_symbol = output.add_symbol(symbol.name, symbol.description, original_name=symbol.original_name)
                new_symbol.raw_records = records
                new_symbol.component_record = records[0]
                new_symbol.part_count = symbol.part_count
                new_symbol._original_streams = copy.deepcopy(symbol._original_streams)
                expected[symbol.name] = (canonical, component_type, engine.electrical_hash(symbol), reason)
            if not output.symbols:
                continue
            filename = re.sub(r"[^A-Za-z0-9._-]", "_", source.stem)[:65] + "-" + sha256(source)[:12] + "-" + engine.sha256_text(str(source))[:8] + ".SchLib"
            staged = flat / filename
            output.save(staged, sync_pin_text_data=False)
            reopened = AltiumSchLib(staged)
            if len(reopened.symbols) != len(expected):
                raise ValueError("Normalized symbol count changed")
            for symbol in reopened.symbols:
                canonical, component_type, ehash, category_reason = expected[symbol.name]
                parameters = engine.parameter_map(symbol)
                for field in FIELDS:
                    if parameters.get(field.casefold()) != [canonical[field]]:
                        raise ValueError(f"{symbol.name}: {field} did not round-trip")
                if engine.electrical_hash(symbol) != ehash:
                    raise ValueError(f"{symbol.name}: electrical signature changed")
                # This hash reflects canonical staging, and is what consolidation uses.
                vhash = engine.visual_hash(reopened, symbol)
                identity = engine.component_identity(canonical, symbol.name)
                if identity.startswith("NAME|") and not rules["mergeNamelessAcrossLibraries"]:
                    identity += "|" + str(source).casefold()
                review_reason = next((r["reason"] for r in rules["preserveSeparateComponents"]
                    if match_exception(r,symbol.name,str(source),canonical)), "")
                variant = f"{identity}|{component_type.casefold()}|{ehash}|{vhash}"
                if review_reason:
                    variant += "|review_name:" + symbol.name.casefold()
                report["components"].append({"source":str(source),"name":symbol.name,**canonical,
                    "component_type":component_type,"category_reason":category_reason,"identity":identity,"variant":variant,
                    "model_bindings":[{"model":engine.implementation_name(symbol.raw_records[i]),
                        "path":str(symbol.raw_records[i].get("ModelDatafile0","")),
                        "pin_map":engine.model_pin_signature(symbol,i)}
                        for i in engine.implementation_indexes(symbol)],
                    "electrical_hash":ehash,"visual_hash":vhash,"review_reason":review_reason,
                    "missing_metadata":[f for f in FIELDS if not canonical[f]]})
            libraries.append({"source":str(source),"source_sha256":row["sha256"],
                "exact_duplicate_sources":row["exact_duplicate_sources"],"staged_schlib":str(staged),
                "symbols":len(reopened.symbols),"unresolved_categories":[],"missing_models":[]})
        except Exception as error:
            report["blockers"].append({"kind":"schlib_normalization","source":str(source),"error":str(error)})
    pin_maps = defaultdict(dict)
    for row in report["components"]:
        for binding in row["model_bindings"]:
            key = (row["variant"], binding["model"].casefold(), binding["path"].casefold())
            pin_maps[key].setdefault(binding["pin_map"], []).append({"source":row["source"],"component":row["name"]})
    for (variant, model, path), maps in pin_maps.items():
        if len(maps)>1:
            report["blockers"].append({"kind":"incompatible_pin_maps","variant":variant,
                "model":model,"path":path,"mappings":maps})
    report["unreferenced_footprints"] = [{"source":p,"name":n} for p,n in footprints if (p,n.casefold()) not in referenced]
    return {"libraries":libraries,"pcblibs":pcbs,"failures":[]}

def summarize(report):
    components = report["components"]
    by_variant, identities, mpns = defaultdict(list), defaultdict(set), defaultdict(list)
    for row in components:
        by_variant[row["variant"]].append(row)
        identities[row["identity"]].add(row["variant"])
        if row["MPN"]:
            mpns[row["MPN"].casefold()].append(row)
    report["duplicate_mpns"] = [{"mpn":key,"instances":len(rows),
        "manufacturers":sorted({r["MFR"] for r in rows}),"components":[{"name":r["name"],"source":r["source"]} for r in rows]}
        for key,rows in sorted(mpns.items()) if len(rows)>1]
    report["symbol_variants"] = [{"identity":key,"variants":sorted(variants)}
        for key,variants in sorted(identities.items()) if len(variants)>1]
    report["summary"] = {"source_components":len(components),
        "planned_components":len(by_variant),"logical_groups":len({r["component_type"] for r in components if r["component_type"]}),
        "missing_metadata_components":sum(bool(r["missing_metadata"]) for r in components),
        "blockers":len(report["blockers"]),"symbol_variant_identities":len(report["symbol_variants"]),
        "duplicate_mpn_groups":len(report["duplicate_mpns"]),
        "unreferenced_footprints":len(report["unreferenced_footprints"])}
    report["category_coverage"] = dict(sorted(Counter(r["component_type"] or "<Review>" for r in components).items()))

def save_report(output, report):
    summarize(report)
    write_json(output/"audit.json",report)
    summary=report["summary"]
    lines=["# Local migration audit", "", *[f"- {k}: {v}" for k,v in summary.items()], "",
        "Review audit.json for source-specific metadata conflicts, duplicate MPNs, symbol variants,",
        "model resolution, explicit exceptions, and unreferenced footprints.", "",
        "## Before Workspace import", "",
        "- Add only consolidated/Consolidated.SchLib (or the flat folder as an alternative).",
        "- Keep the generated PcbLib and absolute model paths fixed; do not import PcbLib standalone.",
        "- Split by ComponentType; export a config from the target Workspace and normalize it.",
        "- Refresh and Validate in Altium; review missing Comment/part metadata, variants and pin maps.",
        "- Confirm target type/template GUIDs, template parameters, folder/lifecycle/revision schemes,",
        "  and permissions for component types, templates, models and release.",
        "- Local hashes predict grouping, not Altium's shared symbol-model release count.",
        "- Workspace import/release/deletion is a separate explicitly authorized operation.", ""]
    if report["blockers"]:
        lines.extend(["## Blocking findings", "", *[f"- {r}" for r in report["blockers"]]])
    (output/"audit.md").write_text("\n".join(lines)+"\n",encoding="utf-8")

def run(args):
    rules=load_policy(args.profile)
    roots=[Path(p).resolve(strict=True) for p in args.root]
    out=Path(args.output).resolve()
    if any(root == out or root.is_relative_to(out) for root in roots):
        raise ValueError("Output cannot equal or contain an input project")
    files, skipped=discover(roots,rules["excludeDirectories"]+args.exclude)
    if not any(p.suffix.casefold()==".schlib" for p in files):
        raise ValueError("No SchLib files discovered")
    groups=file_groups(files)
    inputs=[{"path":str(p),"sha256":sha256(p)} for p in files]
    out=reserve_output(out)
    write_json(out/"rules.json",rules)
    report={key:[] for key in ("blockers","components","metadata_conflicts","model_resolution",
            "model_substitutions","excluded_components","unreferenced_footprints")}
    report.update({"schema_version":1,"mode":args.command,"roots":[str(p) for p in roots],
                   "inputs":inputs,"discovered_library_groups":groups,"skipped_directories":skipped,
                   "engine_version":__import__("importlib.metadata",fromlist=["version"]).version("altium-monkey"),
                   "workspace_mutations":False})
    temporary = tempfile.TemporaryDirectory(prefix="altium-audit-") if args.command=="analyze" else None
    try:
        flat=Path(temporary.name)/"flat" if temporary else out/"flat"
        batch=audit_and_normalize(groups,rules,flat,report)
        save_report(out,report)
        if args.command=="build" and not report["blockers"]:
            write_json(out/"batch-manifest.json",batch)
            target=out/"consolidated"
            options=SimpleNamespace(batch_manifest=out/"batch-manifest.json",
                category_rules=out/"rules.json",consolidation_rules=out/"rules.json",
                aliases=out/"rules.json",output_dir=target,name="Consolidated")
            logging.getLogger("altium_monkey").setLevel(logging.ERROR)
            try:
                result=engine.consolidate(options)
                manifest=json.loads((target/"Consolidated.manifest.json").read_text())
                report["consolidation_manifest"]=str(target/"Consolidated.manifest.json")
                if result:
                    report["blockers"].append({"kind":"consolidation_verification","errors":manifest["verification_errors"]})
                if manifest["output_components"] != report["summary"]["planned_components"]:
                    report["blockers"].append({"kind":"plan_count_mismatch"})
                report["generated_counts"]={"components":manifest["output_components"],
                    "footprints":manifest["output_footprints"],
                    "referenced_footprints":len({n for v in manifest["variants"] for n in v["attached_models"]}),
                    "attachments":sum(len(v["attached_models"]) for v in manifest["variants"])}
                outputs=[]
                for path in sorted(out.rglob("*")):
                    if path.is_file() and path.suffix.casefold() in {".schlib",".pcblib"}:
                        outputs.append({"path":str(path.resolve()),"sha256":sha256(path)})
                write_json(out/"artifacts.json",{"files":outputs})
            except Exception as error:
                report["blockers"].append({"kind":"consolidation","error":str(error)})
    finally:
        if temporary:
            temporary.cleanup()
        changed=check_unchanged(inputs)
        if changed:
            report["blockers"].append({"kind":"source_changed_during_run","paths":changed})
        save_report(out,report)
    print(json.dumps(report["summary"],indent=2))
    return 2 if report["blockers"] else 0

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command",choices=["analyze","build"])
    parser.add_argument("--root",required=True,action="append",help="Selected project directory; repeatable")
    parser.add_argument("--output",required=True,help="New output directory; existing directories are refused")
    parser.add_argument("--profile",type=Path)
    parser.add_argument("--exclude",action="append",default=[],help="Additional directory name/glob exclusion")
    args=parser.parse_args()
    try:
        return run(args)
    except (ValueError,OSError) as error:
        parser.exit(2,f"{error}\n")

if __name__=="__main__":
    raise SystemExit(main())
