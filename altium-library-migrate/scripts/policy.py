"""Pure migration policy. No Altium or Workspace side effects."""
from __future__ import annotations
import copy
import fnmatch
import hashlib
import json
import os
import re
from pathlib import Path

FIELDS = ("MFR", "MPN", "Supplier", "SPN", "Comment")
EMPTY = {"", "*", "-", "n/a", "na", "none", "<skip>", "?"}

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))

def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()

def load_policy(profile=None):
    result = load_json(Path(__file__).resolve().parents[1] / "assets" / "defaults.json")
    if profile:
        overlay = load_json(profile)
        unknown = set(overlay) - set(result) - {"description"}
        if unknown:
            raise ValueError(f"Unknown profile keys: {sorted(unknown)}")
        # Lists prepend explicit exceptions; dictionaries override individual keys.
        for key, value in overlay.items():
            if key == "description":
                continue
            if isinstance(value, dict):
                result[key].update(value)
            elif isinstance(value, list):
                result[key] = value + result[key]
            else:
                result[key] = value
    owners = {}
    for field, aliases in result["canonicalParameters"].items():
        if field not in FIELDS:
            raise ValueError(f"Unknown canonical field: {field}")
        for alias in [field, *aliases]:
            key = alias.strip().casefold()
            if key in owners and owners[key] != field:
                raise ValueError(f"Alias {alias!r} maps to multiple canonical fields")
            owners[key] = field
    for family in ("nameRules", "designatorRules", "parameterRules"):
        for rule in result[family]:
            re.compile(rule["pattern"])
    return result

def values(parameters, name):
    return [str(v).strip() for k, vs in parameters.items()
            if k.strip().casefold() == name.casefold() for v in vs]

def resolve(value, parameters, seen=()):
    value = value.strip()
    if not value.startswith("="):
        return value
    name = value[1:].strip()
    if name.casefold() in seen or not name or any(c in name for c in "+*()'"):
        return value
    candidates = values(parameters, name)
    return resolve(candidates[0], parameters, (*seen, name.casefold())) if candidates else value

def usable(value, names=()):
    return bool(value and value.casefold() not in EMPTY
                and value.casefold() not in {n.casefold() for n in names}
                and not re.search(r"\[\s*noparam\s*\]", value, re.I)
                and not value.startswith("="))

def canonicalize(parameters, rules):
    canonical, conflicts = {}, []
    for field in FIELDS:
        aliases = list(dict.fromkeys([field, *rules["canonicalParameters"][field]]))
        candidates = [(alias, resolve(raw, parameters)) for alias in aliases
                      for raw in values(parameters, alias)]
        candidates = [(a, v) for a, v in candidates if usable(v, aliases)]
        canonical[field] = candidates[0][1] if candidates else ""
        distinct = sorted({v for _, v in candidates}, key=str.casefold)
        if len({v.casefold() for v in distinct}) > 1:
            conflicts.append({"field": field, "values": distinct, "selected": canonical[field]})
    # Supplier-branded numbers must never be paired with a different supplier.
    supplier_aliases = {k.casefold(): v for k, v in rules["supplierAliases"].items()}
    canonical["Supplier"] = supplier_aliases.get(canonical["Supplier"].casefold(), canonical["Supplier"])
    if not (canonical["Supplier"] and canonical["SPN"]):
        for rule in rules["supplierInference"]:
            candidates = [resolve(v, parameters) for v in values(parameters, rule["partNumber"])]
            number = next((v for v in candidates if usable(v, [rule["partNumber"]])), "")
            if not number:
                continue
            if canonical["Supplier"] and canonical["Supplier"].casefold() != rule["supplier"].casefold():
                continue
            if canonical["SPN"] and canonical["SPN"].casefold() != number.casefold():
                continue
            canonical["Supplier"], canonical["SPN"] = rule["supplier"], number
            break
    aliases = {k.casefold(): v for k, v in rules["manufacturerAliases"].items()}
    canonical["MFR"] = aliases.get(canonical["MFR"].casefold(), canonical["MFR"])
    return canonical, conflicts

def match_exception(rule, name, source, canonical=None):
    if "name" in rule and rule["name"].casefold() != name.casefold():
        return False
    if "namePattern" in rule and not re.search(rule["namePattern"], name, re.I):
        return False
    if "sourcePattern" in rule and not fnmatch.fnmatch(source.replace("\\", "/").casefold(),
                                                     rule["sourcePattern"].casefold()):
        return False
    if rule.get("whenMpn") and canonical is not None:
        return canonical["MPN"].casefold() == rule["whenMpn"].casefold()
    return True

def category(name, designator, parameters, rules, source=""):
    for rule in rules["categoryOverrides"]:
        if match_exception(rule, name, source):
            return rule["componentType"], "exception:" + rule["reason"]
    for rule in rules["parameterRules"]:
        if any(re.search(rule["pattern"], v, re.I) for v in values(parameters, rule["parameter"])):
            return rule["componentType"], "parameter:" + rule["parameter"]
    for family, subject, full in (("nameRules", name, False), ("designatorRules", designator, True)):
        for rule in rules[family]:
            if (re.fullmatch if full else re.search)(rule["pattern"], subject, re.I):
                return rule["componentType"], family + ":" + rule["pattern"]
    return "", "unresolved"

def discover(roots, excludes):
    files, skipped = {}, []
    for root in roots:
        root = Path(root).resolve(strict=True)
        if not root.is_dir():
            raise ValueError(f"Project root is not a directory: {root}")
        def onerror(error):
            raise error
        for folder, dirs, names in os.walk(root, followlinks=False, onerror=onerror):
            kept = []
            for name in sorted(dirs, key=str.casefold):
                path = Path(folder) / name
                relative = path.relative_to(root).as_posix()
                if path.is_symlink() or path.is_junction() or any(
                    fnmatch.fnmatch(name.casefold(), pat.casefold()) or
                    fnmatch.fnmatch(relative.casefold(), pat.casefold()) for pat in excludes
                ) or (path / ".altium-migration-output").exists():
                    skipped.append(str(path))
                else:
                    kept.append(name)
            dirs[:] = kept
            for name in sorted(names, key=str.casefold):
                path = Path(folder) / name
                if path.suffix.casefold() not in {".schlib", ".pcblib"}:
                    continue
                if path.is_symlink():
                    skipped.append(str(path))
                    continue
                resolved = path.resolve(strict=True)
                files[str(resolved).casefold()] = resolved
    return sorted(files.values(), key=lambda p: str(p).casefold()), sorted(set(skipped))

def file_groups(files):
    groups = {}
    for path in files:
        digest = sha256(path)
        groups.setdefault((path.suffix.casefold(), digest), []).append(path)
    result = []
    for (_, digest), members in groups.items():
        # Prefer the original project (project name equals library stem).
        def rank(p):
            match = any(part.casefold() == p.stem.casefold() for part in p.parent.parts)
            return (not match, len(str(p)), str(p).casefold())
        ordered = sorted(members, key=rank)
        result.append({"source": str(ordered[0]), "sha256": digest,
                       "exact_duplicate_sources": [str(p) for p in ordered[1:]]})
    return sorted(result, key=lambda r: r["source"].casefold())

def reserve_output(path):
    path = Path(path).resolve()
    if path.exists():
        raise ValueError(f"Output must be a new directory (no overwrite): {path}")
    path.mkdir(parents=True, exist_ok=False)
    (path / ".altium-migration-output").write_text("Generated local staging; exclude from discovery.\n")
    return path

def check_unchanged(inputs):
    return [row["path"] for row in inputs if not Path(row["path"]).is_file()
            or sha256(row["path"]) != row["sha256"]]
