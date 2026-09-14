#!/usr/bin/env python3
"""Normalize an Altium-exported .lmcfg without inventing Workspace IDs."""
from __future__ import annotations
import argparse
import copy
import json
from pathlib import Path
from policy import FIELDS, load_json, load_policy, reserve_output, write_json, sha256

def canonical_mappings(settings, aliases):
    original=settings.get("ParameterMappingList",[])
    by_alias={a.casefold():f for f,names in aliases.items() for a in [f,*names]}
    mapped, kept = {f:[] for f in FIELDS}, []
    for row in original:
        server=str(row.get("ServerParameter","")).casefold()
        source=str(row.get("SourceParameter","")).casefold()
        # System targets may intentionally read a canonical source parameter.
        # Name <- Comment must remain a Name mapping, not be consumed as an alias.
        if server in {"id","name","description","design item id","source","symbol name"}:
            kept.append(copy.deepcopy(row))
            continue
        target=by_alias.get(server) or by_alias.get(source)
        if target:
            mapped[target].append(row)
        else:
            kept.append(copy.deepcopy(row))
    text_guids={r.get("TypeGuid") for r in original
                if str(r.get("ServerParameter","")).casefold() in {"name","comment","mfr","mpn"}
                and r.get("TypeGuid")}
    if len(text_guids)!=1:
        raise ValueError("Cannot infer one text TypeGuid from exported Name/Comment/MFR/MPN mappings")
    text_guid=next(iter(text_guids))
    for field in FIELDS:
        # Preserve required/template metadata on the canonical target if available.
        canonical=next((r for r in mapped[field] if r.get("ServerParameter")==field),None)
        row=copy.deepcopy(canonical or (mapped[field][0] if mapped[field] else {}))
        if row.get("TypeGuid") and row["TypeGuid"]!=text_guid:
            raise ValueError(f"{field}: exported mapping has a non-text TypeGuid")
        row.update({"ServerParameter":field,"SourceParameter":field,"TypeGuid":text_guid,
                    "Source":2})
        row.setdefault("IsRequired",False)
        kept.append(row)
    return kept

def normalize_config(config, manifest, aliases, fallbacks=None, rebind=False, name_from_comment=False):
    result=copy.deepcopy(config)
    entries=result.get("LibraryList")
    if not isinstance(entries,list) or not entries:
        raise ValueError("Expected nonempty LibraryList from an Altium export")
    target=Path(manifest["output_schlib"])
    coverage=manifest["component_type_coverage"]
    if manifest.get("verification_errors"):
        raise ValueError("Consolidation verification failed")
    if not coverage or sum(v["components"] for v in coverage.values())!=manifest["output_components"]:
        raise ValueError("Manifest coverage does not match component count")
    if any(not name for name in coverage):
        raise ValueError("Uncategorized components must be resolved before config normalization")
    paths={str(r.get("FilePath","")).casefold() for r in entries}
    if len(paths)!=1 or any(Path(r.get("FilePath","")).suffix.casefold()!=".schlib" for r in entries):
        raise ValueError("Export must contain one consolidated SchLib and its split groups only")
    if not rebind and Path(entries[0]["FilePath"]).resolve()!=target.resolve():
        raise ValueError("Export references a different SchLib; re-export or explicitly use --rebind-source")
    fallbacks=fallbacks or {}
    if set(fallbacks)-set(coverage):
        raise ValueError("Fallback contains a logical category absent from the manifest")
    settings_by_type={}
    group_rows={}
    parent_count=0
    for row in entries:
        settings=row["Settings"]
        if settings.get("IsSkipped"):
            raise ValueError("Export contains skipped groups; resolve coverage before normalization")
        if settings.get("IsSplitted"):
            parent_count+=1
            continue
        old_stem=Path(row["FilePath"]).stem
        prefix=old_stem+"."
        sub=row.get("SubLibraryName","")
        if not sub.startswith(prefix):
            raise ValueError(f"Cannot derive logical group from SubLibraryName: {sub!r}")
        logical=sub[len(prefix):]
        if logical in group_rows:
            raise ValueError(f"Duplicate logical group: {logical}")
        group_rows[logical]=row
        type_name=settings.get("ComponentType",{}).get("Value","")
        # Only use the native target group as a source of fallback metadata.
        if logical==type_name:
            settings_by_type[type_name]=settings
    if parent_count!=1 or set(group_rows)!=set(coverage):
        raise ValueError(f"Export must have one split parent and all logical groups; missing={sorted(set(coverage)-set(group_rows))}, extra={sorted(set(group_rows)-set(coverage))}")
    audit={"workspace_validated":False,"permissions_verified":False,"groups":[],
           "preserved_workspace_settings":True,"warnings":[
             "Validate type/template GUIDs and permissions in the target Workspace.",
             "Mappings do not update an existing Component Template.",
             "Refresh and Validate in Altium before any separately authorized import."]}
    for row in entries:
        settings=row["Settings"]
        split=settings.get("IsSplitted",False)
        old_stem=Path(row["FilePath"]).stem
        logical="" if split else row["SubLibraryName"][len(old_stem)+1:]
        row["FilePath"]=str(target.resolve())
        if not split:
            row["SubLibraryName"]=target.stem+"."+logical
        counts={f:sum(v.get(f,0) for v in coverage.values()) for f in [*FIELDS,"MFR+MPN","Supplier+SPN"]} if split else coverage[logical]
        if split:
            grouping=settings.get("Splitting",{})
            if not grouping.get("IsParameterGrouping") or grouping.get("GroupParameterName")!="ComponentType":
                raise ValueError("Export must be split by the ComponentType parameter")
        else:
            wanted=fallbacks.get(logical,logical)
            current=settings.get("ComponentType",{}).get("Value","")
            if wanted!=current:
                if wanted not in settings_by_type:
                    raise ValueError(f"No exported settings for fallback type {wanted!r}; export target settings in Altium")
                settings["ComponentType"]=copy.deepcopy(settings_by_type[wanted]["ComponentType"])
                settings["ComponentTemplate"]=copy.deepcopy(settings_by_type[wanted]["ComponentTemplate"])
        settings["ParameterMappingList"]=canonical_mappings(settings,aliases)
        name_maps=[m for m in settings["ParameterMappingList"] if m.get("ServerParameter","").casefold()=="name"]
        if name_from_comment:
            total=sum(v["components"] for v in coverage.values()) if split else coverage[logical]["components"]
            if counts.get("Comment",0)!=total:
                raise ValueError(f"{logical or '<split parent>'}: readable Names require a populated Comment for every component")
            if len(name_maps)!=1:
                raise ValueError("Expected exactly one exported Name mapping; re-export the configuration")
            comment=next(m for m in settings["ParameterMappingList"] if m["ServerParameter"]=="Comment")
            name_maps[0].update({"SourceParameter":"Comment","Source":comment["Source"]})
        choices=[]
        for name,number,supplier in (("MFR","MPN",False),("Supplier","SPN",True)):
            if counts.get(name+"+"+number,0)>0:
                choices.append({"IsCustom":False,"IsSupplierData":supplier,
                                "NameFieldName":name,"PartNumberFieldName":number})
        settings["PartChoiceFieldMapList"]=choices
        audit["groups"].append({"logical_category":logical or "<split parent>",
            "workspace_type":settings["ComponentType"]["Value"],
            "part_choices":choices,"coverage":counts,"template":settings.get("ComponentTemplate"),
            "name_mapping":copy.deepcopy(name_maps)})
    return result,audit

def verify_manifest_source(manifest):
    from altium_monkey import AltiumSchLib
    from consolidate import parameter_map, canonical_value
    library=AltiumSchLib(Path(manifest["output_schlib"]))
    if len(library.symbols)!=manifest["output_components"]:
        raise ValueError("Source SchLib count differs from manifest")
    coverage={}
    for symbol in library.symbols:
        parameters=parameter_map(symbol)
        if any(field.casefold() not in parameters for field in FIELDS):
            raise ValueError(f"{symbol.name}: source lacks canonical parameters")
        category=next(iter(parameters.get("componenttype",[])),"")
        row=coverage.setdefault(category,dict.fromkeys(["components",*FIELDS,"MFR+MPN","Supplier+SPN"],0))
        row["components"]+=1
        canonical={f:canonical_value(parameters,f) for f in FIELDS}
        for f in FIELDS:
            row[f]+=bool(canonical[f])
        row["MFR+MPN"]+=bool(canonical["MFR"] and canonical["MPN"])
        row["Supplier+SPN"]+=bool(canonical["Supplier"] and canonical["SPN"])
    if coverage!=manifest["component_type_coverage"]:
        raise ValueError("Source SchLib metadata/category coverage differs from manifest")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",required=True,type=Path)
    parser.add_argument("--manifest",required=True,type=Path)
    parser.add_argument("--output",required=True,type=Path,help="New directory for normalized config and audit")
    parser.add_argument("--profile",type=Path)
    parser.add_argument("--fallbacks",type=Path)
    parser.add_argument("--rebind-source",action="store_true")
    parser.add_argument("--name-from-comment",action="store_true",
                        help="Map human-readable Name from each populated Comment; preserve the exported mapping otherwise")
    args=parser.parse_args()
    try:
        rules=load_policy(args.profile)
        manifest=load_json(args.manifest)
        verify_manifest_source(manifest)
        original_hash=sha256(args.input)
        normalized,audit=normalize_config(load_json(args.input),manifest,rules["canonicalParameters"],
            load_json(args.fallbacks)["fallbacks"] if args.fallbacks else {},args.rebind_source,args.name_from_comment)
        out=reserve_output(args.output)
        write_json(out/"normalized.lmcfg",normalized)
        audit.update({"input":str(args.input.resolve()),"input_sha256":original_hash,
                      "manifest":str(args.manifest.resolve()),"source_schlib_sha256":sha256(manifest["output_schlib"])})
        if sha256(args.input)!=original_hash:
            raise ValueError("Input config changed during normalization")
        write_json(out/"config-audit.json",audit)
        print(f"Normalized local configuration: {out/'normalized.lmcfg'}\nTarget Workspace validation still required.")
        return 0
    except (ValueError,OSError,KeyError) as error:
        parser.exit(2,f"{error}\n")

if __name__=="__main__":
    raise SystemExit(main())
