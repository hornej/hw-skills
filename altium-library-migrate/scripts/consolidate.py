#!/usr/bin/env python3
"""Consolidate a normalized Altium batch into one SchLib and one PcbLib.

Components are identified by canonical MFR/MPN, then Supplier/SPN, then name.
Only exact symbol variants are collapsed. Distinct visual or electrical symbols
remain separate components with unique names. Every footprint implementation
seen for an exact symbol variant is attached to that preserved variant.
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from policy import usable

from altium_monkey import AltiumPcbLib, AltiumSchLib
from altium_monkey.altium_font_manager import FontIDManager
from altium_monkey.altium_pintextdata_modifier import PinTextDataModifier


CANONICAL_FIELDS = ("MFR", "MPN", "Supplier", "SPN", "Comment")
IMPLEMENTATION_LIST_RECORD = "44"
IMPLEMENTATION_RECORD = "45"
WORKSPACE_LINK_SUFFIXES = ("vaultguid", "itemguid", "revisionguid")


@dataclass
class Member:
    library: Any
    symbol: Any
    staged_schlib: Path
    source_schlib: Path
    source_order: int
    symbol_order: int
    canonical: dict[str, str]
    category: str
    electrical_hash: str
    visual_hash: str
    identity: str
    variant: str
    review_reason: str


@dataclass
class ModelSource:
    member: Member
    implementation_index: int
    output_name: str


def path_key(path: Path | str) -> str:
    return str(Path(path).resolve()).casefold()


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def parameter_map(symbol: Any) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for parameter in symbol.parameters:
        name = str(getattr(parameter, "name", "") or "").strip()
        if name:
            result[name.casefold()].append(str(getattr(parameter, "text", "") or "").strip())
    return dict(result)


def first_value(parameters: dict[str, list[str]], name: str) -> str:
    return next((value for value in parameters.get(name.casefold(), []) if value), "")


def resolve_expression(
    value: str,
    parameters: dict[str, list[str]],
    seen: set[str] | None = None,
) -> str:
    stripped = value.strip()
    if not stripped.startswith("="):
        return stripped
    reference = stripped[1:].strip().casefold()
    if not reference or any(character in reference for character in "+*()'"):
        return stripped
    seen = set() if seen is None else seen
    if reference in seen:
        return stripped
    seen.add(reference)
    for candidate in parameters.get(reference, []):
        if candidate.strip():
            return resolve_expression(candidate, parameters, seen)
    return stripped


def canonical_value(parameters: dict[str, list[str]], name: str) -> str:
    placeholders = {name.casefold()}
    for raw in parameters.get(name.casefold(), []):
        resolved = resolve_expression(raw, parameters).strip()
        if usable(resolved, placeholders):
            return resolved
    return ""


def most_common(values: Iterable[str]) -> str:
    cleaned = [value.strip() for value in values if value and value.strip()]
    if not cleaned:
        return ""
    counts = Counter(value.casefold() for value in cleaned)
    winner = sorted(counts, key=lambda value: (-counts[value], value))[0]
    return next(value for value in cleaned if value.casefold() == winner)


def normalized_manufacturer(value: str, aliases: dict[str, str]) -> str:
    return aliases.get(value.strip().casefold(), value.strip())


def suggest_category(name: str, designator: str, rules: dict[str, Any]) -> str:
    for rule in rules.get("nameRules", []):
        if re.search(rule["pattern"], name, flags=re.IGNORECASE):
            return rule["componentType"]
    for rule in rules.get("designatorRules", []):
        if re.fullmatch(rule["pattern"], designator, flags=re.IGNORECASE):
            return rule["componentType"]
    return ""


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def electrical_hash(symbol: Any) -> str:
    pins: list[dict[str, Any]] = []
    for pin in symbol.pins:
        pins.append(
            {
                "part": getattr(pin, "owner_part_id", None),
                "designator": getattr(pin, "designator", ""),
                "name": getattr(pin, "name", ""),
                "electrical": enum_value(getattr(pin, "electrical", None)),
                "hidden": getattr(pin, "is_hidden", False),
                "x": getattr(pin, "x_mils", None),
                "y": getattr(pin, "y_mils", None),
                "length": getattr(pin, "length_mils", None),
                "orientation": enum_value(getattr(pin, "orientation", None)),
                "display_mode": getattr(pin, "owner_part_display_mode", None),
            }
        )
    pins.sort(key=lambda pin: json.dumps(pin, sort_keys=True, default=str))
    return sha256_text(
        json.dumps(
            {"part_count": symbol.part_count, "pins": pins},
            sort_keys=True,
            default=str,
        )
    )


def normalize_svg(svg: str) -> str:
    root = ET.fromstring(svg)

    def normalize(node: ET.Element) -> None:
        for attribute in list(node.attrib):
            local = attribute.rsplit("}", 1)[-1].lower()
            if (
                local in {"id", "data-doc-id", "data-element-key"}
                or local.endswith("-index")
            ):
                del node.attrib[attribute]
        ordered = sorted(node.attrib.items())
        node.attrib.clear()
        node.attrib.update(ordered)
        for child in list(node):
            normalize(child)

    normalize(root)
    return ET.tostring(root, encoding="unicode")


def visual_hash(library: Any, symbol: Any) -> str:
    return sha256_text(normalize_svg(library.symbol_to_svg(symbol.name)))


def component_identity(canonical: dict[str, str], name: str) -> str:
    if canonical["MFR"] and canonical["MPN"]:
        return f"MFR_MPN|{canonical['MFR'].casefold()}|{canonical['MPN'].casefold()}"
    if canonical["Supplier"] and canonical["SPN"]:
        return (
            f"SUPPLIER_SPN|{canonical['Supplier'].casefold()}|"
            f"{canonical['SPN'].casefold()}"
        )
    return f"NAME|{name.casefold()}"


def upsert_parameter(records: list[dict[str, Any]], name: str, value: str) -> None:
    for record in records:
        if str(record.get("RECORD", "")) != "41":
            continue
        if str(record.get("OwnerIndex", "0")) not in {"", "0"}:
            continue
        if str(record.get("Name", "")).casefold() != name.casefold():
            continue
        record["Text"] = value
        return
    records.append(
        {
            "RECORD": "41",
            "OwnerPartId": "-1",
            "Name": name,
            "Text": value,
            "IsHidden": "T",
        }
    )


def synchronize_alias_parameters(
    records: list[dict[str, Any]],
    canonical: dict[str, str],
    aliases: dict[str, list[str]],
) -> None:
    alias_targets = {
        alias.casefold(): target
        for target, names in aliases.items()
        for alias in names
    }
    for record in records:
        if str(record.get("RECORD", "")) != "41":
            continue
        if str(record.get("OwnerIndex", "0")) not in {"", "0"}:
            continue
        target = alias_targets.get(str(record.get("Name", "")).casefold())
        if target in canonical:
            record["Text"] = canonical[target]


def strip_workspace_links(records: list[dict[str, Any]]) -> None:
    """Remove source Workspace item links so the import creates fresh items."""
    for record in records:
        for key in list(record):
            if key.casefold().endswith(WORKSPACE_LINK_SUFFIXES):
                del record[key]


def merge_font_tables(
    output_manager: FontIDManager,
    libraries: Iterable[Any],
) -> dict[int, dict[int, int]]:
    """Merge source font tables and return per-library source-to-output IDs."""
    font_maps: dict[int, dict[int, int]] = {}
    for library in libraries:
        font_map: dict[int, int] = {}
        if library.font_manager:
            for source_id, font in sorted(library.font_manager.fonts.items()):
                font_map[int(source_id)] = output_manager.get_or_create_font(
                    font_name=font.get("name", "Times New Roman"),
                    font_size=int(font.get("size", 10)),
                    bold=bool(font.get("bold", False)),
                    italic=bool(font.get("italic", False)),
                    rotation=int(font.get("rotation", 0)),
                    underline=bool(font.get("underline", False)),
                    strikeout=bool(font.get("strikeout", False)),
                )
        font_maps[id(library)] = font_map
    return font_maps


def remap_font_ids(records: list[dict[str, Any]], font_map: dict[int, int]) -> None:
    """Translate every record-local *FontID field to the merged font table."""
    for record in records:
        for key, raw_value in list(record.items()):
            if not key.casefold().endswith("fontid"):
                continue
            try:
                source_id = int(str(raw_value))
            except ValueError:
                continue
            if source_id in font_map:
                record[key] = str(font_map[source_id])


def remap_pin_text_data(stream: bytes, font_map: dict[int, int]) -> bytes:
    """Translate font IDs in a preserved binary PinTextData stream."""
    modifier = PinTextDataModifier()
    if not modifier.parse(stream):
        raise RuntimeError("Unable to parse PinTextData while remapping fonts")
    for _designator, pin_data in modifier.entries:
        if pin_data.name_font_id in font_map:
            pin_data.name_font_id = font_map[pin_data.name_font_id]
        if pin_data.designator_font_id in font_map:
            pin_data.designator_font_id = font_map[pin_data.designator_font_id]
    return modifier.serialize(original_data=stream)


def remap_symbol_streams(
    streams: dict[str, bytes],
    font_map: dict[int, int],
) -> dict[str, bytes]:
    result = dict(streams)
    pin_text_data = result.get("PinTextData")
    if pin_text_data:
        result["PinTextData"] = remap_pin_text_data(pin_text_data, font_map)
    return result


def implementation_indexes(symbol: Any) -> list[int]:
    return [
        index
        for index, record in enumerate(symbol.raw_records)
        if str(record.get("RECORD", "")) == IMPLEMENTATION_RECORD
    ]


def record_owner(record: dict[str, Any]) -> int | None:
    raw = record.get("OwnerIndex")
    if raw in {None, ""}:
        return None
    try:
        return int(str(raw))
    except ValueError:
        return None


def descends_from(records: list[dict[str, Any]], index: int, ancestors: set[int]) -> bool:
    seen: set[int] = set()
    owner = record_owner(records[index])
    while owner is not None and owner not in seen and 0 <= owner < len(records):
        if owner in ancestors:
            return True
        seen.add(owner)
        owner = record_owner(records[owner])
    return False


def implementation_group(symbol: Any, implementation_index: int) -> list[int]:
    records = symbol.raw_records
    return [
        index
        for index in range(implementation_index, len(records))
        if index == implementation_index
        or descends_from(records, index, {implementation_index})
    ]


def model_pin_signature(symbol: Any, implementation_index: int) -> str:
    """Compare explicit pin maps independently of model names, owners and IDs."""
    payload = []
    for index in implementation_group(symbol, implementation_index):
        record = symbol.raw_records[index]
        if str(record.get("RECORD", "")) not in {"46", "47"}:
            continue
        payload.append({k: v for k, v in record.items()
                        if k.casefold() not in {"ownerindex", "uniqueid", "indexinsheet"}})
    return sha256_text(json.dumps(payload, sort_keys=True, default=str))


def implementation_name(record: dict[str, Any]) -> str:
    return str(record.get("ModelDatafileEntity0", "") or record.get("ModelName", "") or "")


def resolve_model_source(
    member: Member,
    implementation_index: int,
    footprint_candidates: dict[str, list[dict[str, str]]],
) -> tuple[list[dict[str, str]], bool]:
    record = member.symbol.raw_records[implementation_index]
    model = implementation_name(record)
    candidates = footprint_candidates.get(model.casefold(), [])
    if not candidates:
        raise RuntimeError(f"{member.symbol.name}: no footprint named {model!r}")

    explicit = str(record.get("ModelDatafile0", "") or "").strip()
    if explicit:
        explicit_key = path_key(explicit)
        matches = [row for row in candidates if path_key(row["source_path"]) == explicit_key]
        if matches:
            return [matches[0]], False

    same_directory = [
        row
        for row in candidates
        if Path(row["source_path"]).parent.resolve()
        == member.source_schlib.parent.resolve()
    ]
    if same_directory:
        return sorted(same_directory, key=lambda row: row["output_name"].casefold()), len(same_directory) > 1

    same_stem = [
        row
        for row in candidates
        if Path(row["source_path"]).stem.casefold()
        == member.source_schlib.stem.casefold()
    ]
    if same_stem:
        return sorted(same_stem, key=lambda row: row["output_name"].casefold()), len(same_stem) > 1

    ordered = sorted(
        candidates,
        key=lambda row: (row["source_path"].casefold(), row["output_name"].casefold()),
    )
    return ordered, len(ordered) > 1


def unique_id(seed: str) -> str:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return "".join(letters[value % len(letters)] for value in digest[:8])


def rebuild_implementations(
    representative: Member,
    output_component_name: str,
    models: list[ModelSource],
    output_pcblib: Path,
    font_maps: dict[int, dict[int, int]],
) -> list[dict[str, Any]]:
    original = representative.symbol.raw_records
    list_indexes = {
        index
        for index, record in enumerate(original)
        if str(record.get("RECORD", "")) == IMPLEMENTATION_LIST_RECORD
    }
    removed = set(list_indexes)
    removed.update(
        index
        for index in range(len(original))
        if descends_from(original, index, list_indexes)
    )
    insertion = min(list_indexes) if list_indexes else len(original)

    items: list[tuple[str, int, int, dict[str, Any]]] = []
    for index, record in enumerate(original):
        if index == insertion:
            items.append(("list", -1, -1, {"RECORD": IMPLEMENTATION_LIST_RECORD}))
            for group_number, model in enumerate(models):
                for old_index in implementation_group(
                    model.member.symbol, model.implementation_index
                ):
                    cloned = copy.deepcopy(model.member.symbol.raw_records[old_index])
                    items.append(("model", group_number, old_index, cloned))
        if index not in removed:
            items.append(("base", 0, index, copy.deepcopy(record)))
    if insertion == len(original):
        items.append(("list", -1, -1, {"RECORD": IMPLEMENTATION_LIST_RECORD}))
        for group_number, model in enumerate(models):
            for old_index in implementation_group(model.member.symbol, model.implementation_index):
                cloned = copy.deepcopy(model.member.symbol.raw_records[old_index])
                items.append(("model", group_number, old_index, cloned))

    base_map: dict[int, int] = {}
    model_maps: dict[int, dict[int, int]] = defaultdict(dict)
    list_index = -1
    for new_index, (kind, group_number, old_index, _) in enumerate(items):
        if kind == "base":
            base_map[old_index] = new_index
        elif kind == "model":
            model_maps[group_number][old_index] = new_index
        else:
            list_index = new_index

    current_assigned = False
    for new_index, (kind, group_number, old_index, record) in enumerate(items):
        source_library = (
            models[group_number].member.library
            if kind == "model"
            else representative.library
        )
        remap_font_ids([record], font_maps[id(source_library)])
        if kind == "base":
            owner = record_owner(record)
            if owner is not None and owner in base_map:
                record["OwnerIndex"] = str(base_map[owner])
        elif kind == "model":
            model = models[group_number]
            if str(record.get("RECORD", "")) == IMPLEMENTATION_RECORD:
                record["OwnerIndex"] = str(list_index)
                record["ModelName"] = model.output_name
                record["ModelDatafileEntity0"] = model.output_name
                record["ModelDatafileKind0"] = "PCBLib"
                record["ModelType"] = "PCBLIB"
                record["ModelDatafile0"] = str(output_pcblib.resolve())
                for key in list(record):
                    if key.casefold() in {
                        "modelvaultguid",
                        "modelitemguid",
                        "modelrevisionguid",
                    }:
                        del record[key]
                if not current_assigned:
                    record["IsCurrent"] = "T"
                    current_assigned = True
                else:
                    record.pop("IsCurrent", None)
            else:
                owner = record_owner(record)
                if owner is not None and owner in model_maps[group_number]:
                    record["OwnerIndex"] = str(model_maps[group_number][owner])
            if "UniqueID" in record:
                record["UniqueID"] = unique_id(
                    f"{output_component_name}|{model.output_name}|{old_index}|{new_index}"
                )
    return [record for _, _, _, record in items]


def allocate_name(base: str, used: set[str], suffix_hint: str = "ALT") -> str:
    candidate = base or "UNNAMED_COMPONENT"
    if candidate.casefold() not in used:
        used.add(candidate.casefold())
        return candidate
    counter = 2
    while True:
        candidate = f"{base}_{suffix_hint}{counter}"
        if candidate.casefold() not in used:
            used.add(candidate.casefold())
            return candidate
        counter += 1


def representative_rank(member: Member) -> tuple[int, int, int, int, int, str, str]:
    metadata = sum(bool(member.canonical[field]) for field in CANONICAL_FIELDS)
    return (
        -metadata,
        -len(member.symbol.implementations),
        -len(str(member.symbol.description or "")),
        member.source_order,
        member.symbol_order,
        str(member.source_schlib).casefold(),
        member.symbol.name.casefold(),
    )


def consolidate(args) -> int:
    batch_path = args.batch_manifest.resolve()
    batch = json.loads(batch_path.read_text(encoding="utf-8-sig"))
    if batch.get("failures"):
        raise RuntimeError(
            f"Batch manifest contains {len(batch['failures'])} failed libraries"
        )
    category_rules = json.loads(args.category_rules.read_text(encoding="utf-8-sig"))
    canonical_aliases = json.loads(args.aliases.read_text(encoding="utf-8-sig"))[
        "canonicalParameters"
    ]
    consolidation_rules = json.loads(
        args.consolidation_rules.read_text(encoding="utf-8-sig")
    )
    excluded = set()
    unresolved_rows = [
        (str(row.get("source", "<unknown>")), str(component))
        for row in batch.get("libraries", [])
        for component in row.get("unresolved_categories", [])
        if str(component).casefold() not in excluded
    ]
    if unresolved_rows:
        raise RuntimeError(
            "Batch manifest contains unresolved, non-excluded component categories: "
            + ", ".join(f"{source}: {component}" for source, component in unresolved_rows)
        )
    manufacturer_aliases = {
        key.casefold(): value
        for key, value in consolidation_rules.get("manufacturerAliases", {}).items()
    }
    review_rules = consolidation_rules.get("preserveSeparateComponents", [])
    from policy import match_exception


    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_schlib = output_dir / f"{args.name}.SchLib"
    output_pcblib = output_dir / f"{args.name}.PcbLib"
    output_manifest = output_dir / f"{args.name}.manifest.json"
    output_map = output_dir / f"{args.name}.component-map.csv"

    pcblib_paths = [Path(row["source"]).resolve() for row in batch["pcblibs"]]
    print(f"Combining {len(pcblib_paths)} PcbLibs...", flush=True)
    combined_pcblib = AltiumPcbLib.combine(pcblib_paths, verbose=False) if pcblib_paths else AltiumPcbLib()
    if pcblib_paths:
        combined_pcblib.save(output_pcblib)
    provenance_path = output_pcblib.with_suffix(".provenance.json")
    if pcblib_paths:
        combined_pcblib.write_combine_provenance(provenance_path)
    else:
        provenance_path.write_text('{"footprints": []}')
    reopened_pcblib = AltiumPcbLib.from_file(output_pcblib) if pcblib_paths else combined_pcblib
    if len(reopened_pcblib.footprints) != len(combined_pcblib.footprints):
        raise RuntimeError("Combined PcbLib footprint count did not round-trip")
    footprint_names = {name.casefold() for name in reopened_pcblib.footprint_names()}
    if len(footprint_names) != len(reopened_pcblib.footprints):
        raise RuntimeError("Combined PcbLib contains duplicate footprint names")

    provenance = combined_pcblib.combine_provenance if pcblib_paths else {"footprints": []}
    footprint_candidates: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in provenance["footprints"]:
        footprint_candidates[str(row["original_name"]).casefold()].append(row)

    print(f"Reading {len(batch['libraries'])} normalized SchLibs...", flush=True)
    members: list[Member] = []
    source_libraries: list[Any] = []
    excluded_rows: list[dict[str, str]] = []
    for source_order, row in enumerate(batch["libraries"]):
        staged = Path(row["staged_schlib"]).resolve()
        source = Path(row["source"]).resolve()
        library = AltiumSchLib(staged)
        source_libraries.append(library)
        for symbol_order, symbol in enumerate(library.symbols):
            if False:  # exclusions already applied by the pipeline
                excluded_rows.append(
                    {"component": symbol.name, "source": str(source)}
                )
                continue
            parameters = parameter_map(symbol)
            canonical = {
                field: canonical_value(parameters, field) for field in CANONICAL_FIELDS
            }
            canonical["MFR"] = normalized_manufacturer(
                canonical["MFR"], manufacturer_aliases
            )
            designator = str(symbol.designators[0].text if symbol.designators else "")
            category = first_value(parameters, "ComponentType")
            ehash = electrical_hash(symbol)
            vhash = visual_hash(library, symbol)
            identity = component_identity(canonical, symbol.name)
            if identity.startswith("NAME|") and not consolidation_rules.get("mergeNamelessAcrossLibraries", False):
                identity += "|" + str(source).casefold()
            variant = f"{identity}|{category.casefold()}|{ehash}|{vhash}"
            review_reason = next(
                (
                    rule["reason"]
                    for rule in review_rules
                    if match_exception(rule, symbol.name, str(source), canonical)
                ),
                "",
            )
            if review_reason:
                variant += f"|review_name:{symbol.name.casefold()}"
            members.append(
                Member(
                    library=library,
                    symbol=symbol,
                    staged_schlib=staged,
                    source_schlib=source,
                    source_order=source_order,
                    symbol_order=symbol_order,
                    canonical=canonical,
                    category=category,
                    electrical_hash=ehash,
                    visual_hash=vhash,
                    identity=identity,
                    variant=variant,
                    review_reason=review_reason,
                )
            )

    identities: dict[str, list[Member]] = defaultdict(list)
    variants: dict[str, list[Member]] = defaultdict(list)
    for member in members:
        identities[member.identity].append(member)
        variants[member.variant].append(member)

    resolved_models: dict[str, list[ModelSource]] = {}
    ambiguous_models: list[dict[str, str]] = []
    for variant, variant_members in variants.items():
        by_output_name: dict[str, ModelSource] = {}
        for member in sorted(variant_members, key=representative_rank):
            for index in implementation_indexes(member.symbol):
                resolved_rows, ambiguous = resolve_model_source(
                    member, index, footprint_candidates
                )
                for resolved in resolved_rows:
                    output_name = resolved["output_name"]
                    by_output_name.setdefault(
                        output_name.casefold(),
                        ModelSource(member, index, output_name),
                    )
                if ambiguous:
                    ambiguous_models.append(
                        {
                            "component": member.symbol.name,
                            "model": implementation_name(member.symbol.raw_records[index]),
                            "selected": "; ".join(
                                row["output_name"] for row in resolved_rows
                            ),
                            "source": str(member.source_schlib),
                        }
                    )
        resolved_models[variant] = list(by_output_name.values())

    output = AltiumSchLib()
    output.font_manager = FontIDManager.from_font_dict({})
    font_maps = merge_font_tables(output.font_manager, source_libraries)
    output._weight_policy = "serialized_data_records"
    used_names: set[str] = set()
    map_rows: list[dict[str, Any]] = []
    variant_manifest: list[dict[str, Any]] = []
    metadata_conflicts: list[dict[str, Any]] = []
    expected_visual_hashes: dict[str, str] = {}
    expected_electrical_hashes: dict[str, str] = {}
    component_type_coverage: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "components": 0,
            "MFR": 0,
            "MPN": 0,
            "MFR+MPN": 0,
            "Supplier": 0,
            "SPN": 0,
            "Supplier+SPN": 0,
            "Comment": 0,
        }
    )

    for identity in sorted(identities):
        identity_variants = sorted(
            {member.variant for member in identities[identity]},
            key=lambda key: representative_rank(sorted(variants[key], key=representative_rank)[0]),
        )
        base_counts = Counter(
            member.symbol.name.casefold() for member in identities[identity]
        )
        identity_base = next(
            member.symbol.name
            for member in identities[identity]
            if member.symbol.name.casefold()
            == sorted(base_counts, key=lambda name: (-base_counts[name], name))[0]
        )
        for variant_number, variant in enumerate(identity_variants, start=1):
            variant_members = sorted(variants[variant], key=representative_rank)
            representative = variant_members[0]
            member_name_counts = Counter(
                member.symbol.name.casefold() for member in variant_members
            )
            preferred_name = next(
                member.symbol.name
                for member in variant_members
                if member.symbol.name.casefold()
                == sorted(
                    member_name_counts,
                    key=lambda name: (-member_name_counts[name], name),
                )[0]
            )
            if len(identity_variants) > 1 and preferred_name.casefold() == identity_base.casefold():
                preferred_name = identity_base if variant_number == 1 else f"{identity_base}_ALT{variant_number}"
            output_name = allocate_name(preferred_name, used_names)
            expected_visual_hashes[output_name.casefold()] = representative.visual_hash
            expected_electrical_hashes[output_name.casefold()] = representative.electrical_hash

            field_values: dict[str, str] = {}
            for field in CANONICAL_FIELDS:
                values = [member.canonical[field] for member in variant_members]
                field_values[field] = most_common(values)
                distinct = sorted({value for value in values if value}, key=str.casefold)
                if len({value.casefold() for value in distinct}) > 1:
                    metadata_conflicts.append(
                        {
                            "identity": identity,
                            "variant": variant,
                            "field": field,
                            "values": distinct,
                            "selected": field_values[field],
                        }
                    )
            pairs = [(m.canonical["Supplier"], m.canonical["SPN"]) for m in variant_members
                     if m.canonical["Supplier"] and m.canonical["SPN"]]
            if pairs:
                folded_pairs = Counter((a.casefold(), b.casefold()) for a, b in pairs)
                selected_pair = sorted(folded_pairs, key=lambda p: (-folded_pairs[p], p))[0]
                field_values["Supplier"], field_values["SPN"] = next(
                    p for p in pairs if (p[0].casefold(), p[1].casefold()) == selected_pair)
            else:
                # Preserve a single member's partial pair; never manufacture a complete one.
                partial = next((m for m in variant_members if m.canonical["Supplier"] or m.canonical["SPN"]), None)
                if partial:
                    field_values["Supplier"], field_values["SPN"] = partial.canonical["Supplier"], partial.canonical["SPN"]
            field_values["MFR"] = normalized_manufacturer(
                field_values["MFR"], manufacturer_aliases
            )

            raw_records = rebuild_implementations(
                representative,
                output_name,
                resolved_models[variant],
                output_pcblib,
                font_maps,
            )
            strip_workspace_links(raw_records)
            for field in CANONICAL_FIELDS:
                upsert_parameter(raw_records, field, field_values[field])
            # Canonical-only staging: no legacy parameters are reintroduced.
            upsert_parameter(raw_records, "ComponentType", representative.category)
            component_record = raw_records[0]
            component_record["LibReference"] = output_name
            component_record["DesignItemId"] = output_name
            description = max(
                (str(member.symbol.description or "") for member in variant_members),
                key=len,
                default="",
            )
            if description:
                component_record["Description"] = description

            new_symbol = output.add_symbol(
                output_name,
                description,
                original_name=representative.symbol.original_name,
            )
            new_symbol.part_count = representative.symbol.part_count
            new_symbol.raw_records = raw_records
            new_symbol.component_record = component_record
            new_symbol._original_streams = remap_symbol_streams(
                representative.symbol._original_streams,
                font_maps[id(representative.library)],
            )
            for image in representative.symbol.images:
                filename = getattr(image, "filename", None)
                if filename and filename in representative.library.embedded_images:
                    output.embedded_images[filename] = representative.library.embedded_images[filename]

            coverage = component_type_coverage[representative.category]
            coverage["components"] += 1
            for field in CANONICAL_FIELDS:
                coverage[field] += int(bool(field_values[field]))
            coverage["MFR+MPN"] += int(bool(field_values["MFR"] and field_values["MPN"]))
            coverage["Supplier+SPN"] += int(
                bool(field_values["Supplier"] and field_values["SPN"])
            )

            source_rows = [
                {
                    "component": member.symbol.name,
                    "source": str(member.source_schlib),
                }
                for member in variant_members
            ]
            model_names = [model.output_name for model in resolved_models[variant]]
            map_rows.append(
                {
                    "OutputComponent": output_name,
                    "ComponentType": representative.category,
                    "MFR": field_values["MFR"],
                    "MPN": field_values["MPN"],
                    "Supplier": field_values["Supplier"],
                    "SPN": field_values["SPN"],
                    "Comment": field_values["Comment"],
                    "Identity": identity,
                    "VariantNumber": variant_number,
                    "VariantCount": len(identity_variants),
                    "CollapsedInstances": len(variant_members),
                    "AttachedModels": len(model_names),
                    "ModelNames": json.dumps(model_names, ensure_ascii=False),
                    "Sources": json.dumps(source_rows, ensure_ascii=False),
                }
            )
            variant_manifest.append(
                {
                    "output_component": output_name,
                    "component_type": representative.category,
                    "identity": identity,
                    "variant_number": variant_number,
                    "variant_count": len(identity_variants),
                    "electrical_hash": representative.electrical_hash,
                    "visual_hash": representative.visual_hash,
                    "collapsed_instances": len(variant_members),
                    "attached_models": model_names,
                    "sources": source_rows,
                }
            )

    print(f"Writing {len(output.symbols)} consolidated components...", flush=True)
    # The raw records are authoritative here. Copying parsed OOP objects would
    # retain their old record indexes after the implementation block is rebuilt
    # and could overwrite normalized parameters during save.
    output.file_header = output._synthesize_file_header()
    output._sync_file_header_font_table()
    output.file_header["UniqueID"] = unique_id(
        f"{args.name}|{len(output.symbols)}|{len(reopened_pcblib.footprints)}"
    )
    expected_font_table = copy.deepcopy(output.font_manager.fonts)
    output.save(output_schlib, sync_pin_text_data=False)
    reopened = AltiumSchLib(output_schlib)
    verification_errors: list[str] = []
    if reopened.font_manager.fonts != expected_font_table:
        verification_errors.append("SchLib font table changed after save")
    if len(reopened.symbols) != len(output.symbols):
        verification_errors.append("SchLib symbol count changed after save")
    reopened_names = [symbol.name.casefold() for symbol in reopened.symbols]
    if len(reopened_names) != len(set(reopened_names)):
        verification_errors.append("SchLib contains duplicate component names")
    for symbol in reopened.symbols:
        parameters = parameter_map(symbol)
        for field in (*CANONICAL_FIELDS, "ComponentType"):
            if field.casefold() not in parameters:
                verification_errors.append(f"{symbol.name}: missing {field}")
        stale_workspace_fields = sorted(
            {
                key
                for record in symbol.raw_records
                for key in record
                if key.casefold().endswith(WORKSPACE_LINK_SUFFIXES)
                and str(record[key]).strip()
            },
            key=str.casefold,
        )
        if stale_workspace_fields:
            verification_errors.append(
                f"{symbol.name}: contains Workspace links "
                f"{', '.join(stale_workspace_fields)}"
            )
        font_ids: set[int] = set()
        for record in symbol.raw_records:
            for key, value in record.items():
                if not key.casefold().endswith("fontid"):
                    continue
                try:
                    font_ids.add(int(str(value)))
                except ValueError:
                    verification_errors.append(
                        f"{symbol.name}: invalid {key} value {value!r}"
                    )
        invalid_font_ids = sorted(
            font_id
            for font_id in font_ids
            if font_id != 0 and reopened.font_manager.get_font_info(font_id) is None
        )
        if invalid_font_ids:
            verification_errors.append(
                f"{symbol.name}: undefined FontID values {invalid_font_ids}"
            )
        if electrical_hash(symbol) != expected_electrical_hashes[symbol.name.casefold()]:
            verification_errors.append(
                f"{symbol.name}: electrical hash changed after consolidation"
            )
        if visual_hash(reopened, symbol) != expected_visual_hashes[symbol.name.casefold()]:
            verification_errors.append(
                f"{symbol.name}: rendered symbol changed after consolidation"
            )
        implementations = implementation_indexes(symbol)
        for index in implementations:
            record = symbol.raw_records[index]
            name = implementation_name(record)
            if name.casefold() not in footprint_names:
                verification_errors.append(
                    f"{symbol.name}: footprint {name!r} absent from consolidated PcbLib"
                )
            if path_key(str(record.get("ModelDatafile0", ""))) != path_key(output_pcblib):
                verification_errors.append(
                    f"{symbol.name}: footprint {name!r} has wrong PcbLib path"
                )

    write_csv(
        output_map,
        map_rows,
        [
            "OutputComponent",
            "ComponentType",
            "MFR",
            "MPN",
            "Supplier",
            "SPN",
            "Comment",
            "Identity",
            "VariantNumber",
            "VariantCount",
            "CollapsedInstances",
            "AttachedModels",
            "ModelNames",
            "Sources",
        ],
    )
    duplicate_identity_count = sum(
        len({member.variant for member in identity_members}) > 1
        for identity_members in identities.values()
    )
    manifest = {
        "kind": "consolidated_altium_library_batch",
        "source_batch_manifest": str(batch_path),
        "output_dir": str(output_dir),
        "output_schlib": str(output_schlib),
        "output_pcblib": str(output_pcblib) if pcblib_paths else None,
        "pcblib_provenance": str(provenance_path),
        "component_map": str(output_map),
        "source_components": sum(int(row["symbols"]) for row in batch["libraries"]),
        "excluded_components": excluded_rows,
        "usable_source_components": len(members),
        "output_components": len(output.symbols),
        "collapsed_component_instances": len(members) - len(output.symbols),
        "source_footprints": sum(
            AltiumPcbLib.from_file(path).footprint_count() for path in pcblib_paths
        ),
        "output_footprints": len(reopened_pcblib.footprints),
        "identities_with_multiple_symbol_variants": duplicate_identity_count,
        "model_union_scope": "exact_symbol_variant",
        "review_components": [
            {
                "component": member.symbol.name,
                "reason": member.review_reason,
                "source": str(member.source_schlib),
            }
            for member in members
            if member.review_reason
        ],
        "ambiguous_model_resolutions": ambiguous_models,
        "metadata_conflicts": metadata_conflicts,
        "component_type_coverage": dict(sorted(component_type_coverage.items())),
        "variants": variant_manifest,
        "verification_errors": verification_errors,
        "libraries": [
            {
                "source": str(output_schlib),
                "staged_schlib": str(output_schlib),
                "symbols": len(output.symbols),
                "unresolved_categories": [],
                "missing_models": [],
                "component_type_coverage": dict(sorted(component_type_coverage.items())),
            }
        ],
        "pcblibs": [{"source": str(output_pcblib)}] if pcblib_paths else [],
    }
    output_manifest.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Verified {len(output.symbols)} components and {len(reopened_pcblib.footprints)} footprint models.", flush=True)
    return 0 if not verification_errors else 2
