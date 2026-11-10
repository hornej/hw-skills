"""Build and inspect a local, read-only mirror of a completed library cache export."""

import argparse
from contextlib import closing, contextmanager
from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path, PureWindowsPath
import re
import sqlite3
import sys
import tempfile
import time
from uuid import UUID


TABLES = {"ItemRevisions": "ItemRevisions.jsonl", "ItemRevisionLinks": "ItemRevisionLinks.jsonl"}
APP_ID = 0x414C4D31  # ALM1
SCHEMA_VERSION = 3
HEX_SHA = re.compile(r"[0-9a-fA-F]{64}")
NATIVE_CACHE_NAME = re.compile(r"([0-9a-f]{32})-[0-9a-f]{32}-v\d+\.sqlite", re.I)
UNVERIFIED = {"current_server_state": "unverified", "part_choices": "unknown", "where_used": "unknown"}
SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE items (item_guid TEXT PRIMARY KEY, item_hrid TEXT NOT NULL UNIQUE);
CREATE TABLE revisions (
  revision_guid TEXT PRIMARY KEY, revision_hrid TEXT NOT NULL UNIQUE,
  item_guid TEXT NOT NULL, item_hrid TEXT NOT NULL, revision_id TEXT NOT NULL,
  content_type_guid TEXT NOT NULL, source_line INTEGER NOT NULL UNIQUE, record_json TEXT NOT NULL,
  UNIQUE(item_guid, revision_id)
);
CREATE TABLE revision_links (
  link_guid TEXT PRIMARY KEY, parent_revision_guid TEXT NOT NULL, child_revision_guid TEXT NOT NULL,
  child_vault_guid TEXT NOT NULL,
  source_line INTEGER NOT NULL UNIQUE, footprint_index INTEGER, is_default_footprint INTEGER,
  record_json TEXT NOT NULL
);
CREATE INDEX revisions_item ON revisions(item_guid);
CREATE INDEX revisions_content_type ON revisions(content_type_guid);
CREATE INDEX links_parent ON revision_links(parent_revision_guid, source_line);
CREATE INDEX links_child ON revision_links(child_revision_guid);
"""


class MirrorError(ValueError):
    pass


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise MirrorError(f"Duplicate JSON key: {key!r}")
        result[key] = value
    return result


def invalid_constant(token):
    raise MirrorError(f"Invalid JSON constant: {token}")


def finite_float(token):
    value = float(token)
    if not math.isfinite(value):
        raise MirrorError(f"JSON number is outside the supported finite range: {token}")
    return value


def decode_json(raw):
    return json.loads(raw, object_pairs_hook=unique_object, parse_constant=invalid_constant,
                      parse_float=finite_float)


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def valid_hash(value, label):
    if not isinstance(value, str) or not HEX_SHA.fullmatch(value):
        raise MirrorError(f"{label} must be a SHA-256 hex digest.")
    return value.lower()


def guid(value, label):
    try:
        result = UUID(value) if isinstance(value, str) else None
    except ValueError:
        result = None
    if result is None or result.int == 0:
        raise MirrorError(f"{label} must be a nonzero GUID.")
    return str(result)


def text_id(value, label):
    if (not isinstance(value, str) or not value or value.strip() != value
            or any(ord(ch) < 32 or ord(ch) == 127 for ch in value)):
        raise MirrorError(f"{label} must be nonblank literal text.")
    return value


def object_value(value, label):
    if not isinstance(value, dict):
        raise MirrorError(f"{label} must be a JSON object.")
    return value


def values_block(raw, label):
    # A missing/null block is different from an explicitly observed empty list.
    if raw is None:
        return None
    values = object_value(raw, label).get("$values")
    if values is not None and (not isinstance(values, list) or not all(isinstance(v, dict) for v in values)):
        raise MirrorError(f"{label}.$values must be an array of JSON objects or null.")
    return values


@contextmanager
def new_output(path):
    path = Path(path)
    if os.path.lexists(path):
        raise MirrorError(f"Output already exists: {path}")
    with tempfile.TemporaryDirectory(dir=path.parent, prefix=".library-mirror-") as directory:
        staged = Path(directory) / path.name
        yield staged
        # Windows rename is exclusive; on POSIX use an exclusive hard link.
        if os.name == "nt":
            os.rename(staged, path)
        else:
            os.link(staged, path)


def manifest_info(snapshot, workspace, vault):
    path = snapshot / "manifest.json"
    raw = path.read_bytes()
    manifest = object_value(decode_json(raw), "Snapshot manifest")
    completed = manifest.get("snapshot_copy_completed_utc")
    try:
        if datetime.fromisoformat(completed.replace("Z", "+00:00")).utcoffset() is None:
            raise ValueError
    except (AttributeError, ValueError):
        raise MirrorError("Snapshot manifest must identify a completed UTC-offset copy.") from None
    hashes = object_value(manifest.get("jsonl_sha256"), "Manifest JSONL hashes")
    counts = object_value(manifest.get("table_counts"), "Manifest table counts")
    exports = {}
    for table, name in TABLES.items():
        count = counts.get(table)
        if type(count) is not int or count < 0:
            raise MirrorError(f"Manifest has no valid {table} row count.")
        exports[table] = {"file": name, "sha256": valid_hash(hashes.get(name), name), "row_count": count}
    if "workspace" in manifest and manifest["workspace"] != workspace:
        raise MirrorError("Manifest Workspace differs from the requested Workspace.")
    scope_sources = []
    for key in ("vault_guid", "source_vault_guid"):
        if key in manifest:
            if guid(manifest[key], f"Manifest {key}") != vault:
                raise MirrorError("Manifest vault differs from the requested vault.")
            scope_sources.append(key)
    source_path = manifest.get("source_path")
    if isinstance(source_path, str):
        name = NATIVE_CACHE_NAME.fullmatch(PureWindowsPath(source_path).name)
        if name:
            if guid(name[1], "Native cache filename vault") != vault:
                raise MirrorError("Native cache filename identifies a different vault.")
            scope_sources.append("native_cache_filename")
    return manifest, raw, exports, scope_sources


def check_vault(content, key, expected, *, required=False):
    if required or key in content:
        if guid(content.get(key), key) != expected:
            raise MirrorError(f"{key} identifies a foreign vault.")
        return True
    return False


def record_fields(record):
    record = object_value(record, "Export record")
    row = object_value(record.get("row"), "Export row")
    content = object_value(record.get("content"), "Export content")
    valid_hash(record.get("content_sha256"), "Native source content digest")
    uid = guid(row.get("Guid"), "Export row Guid")
    if guid(content.get("GUID"), "Export content GUID") != uid:
        raise MirrorError("Export row and content GUIDs differ.")
    return row, content, uid


def insert_revision(db, record, raw, line, workspace, vault):
    _, content, uid = record_fields(record)
    scoped = check_vault(content, "VaultGUID", vault)
    if "VaultHRID" in content and content["VaultHRID"] != workspace:
        raise MirrorError("Revision belongs to a different Workspace.")
    revision_hrid = text_id(content.get("HRID"), "Revision HRID")
    item_guid = guid(content.get("ItemGUID"), "Item GUID")
    item_hrid = text_id(content.get("ItemHRID"), "Item HRID")
    revision_id = text_id(content.get("RevisionId"), "Revision ID")
    if revision_hrid != f"{item_hrid}-{revision_id}":
        raise MirrorError("Revision HRID does not match its exact item HRID and revision ID.")
    previous = db.execute("SELECT item_hrid FROM items WHERE item_guid=?", (item_guid,)).fetchone()
    if previous is None:
        db.execute("INSERT INTO items VALUES (?, ?)", (item_guid, item_hrid))
    elif previous != (item_hrid,):
        raise MirrorError("One item GUID identifies more than one item HRID.")
    params = values_block(content.get("RevisionParameters"), "RevisionParameters")
    for param in params or ():
        if "ItemRevisionGUID" in param and guid(param["ItemRevisionGUID"], "Parameter revision") != uid:
            raise MirrorError("Parameter refers to a different revision.")
    db.execute("INSERT INTO revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
        uid, revision_hrid, item_guid, item_hrid, revision_id,
        guid(content.get("ContentTypeGUID"), "Content type GUID"), line, raw,
    ))
    return scoped


def footprint_order(raw):
    if not isinstance(raw, str) or not raw.lstrip().startswith("{"):
        return None, None
    try:
        data = decode_json(raw)
    except json.JSONDecodeError:
        return None, None  # Opaque data stays available without an order claim.
    footprint = data.get("Footprint") if isinstance(data, dict) else None
    if not isinstance(footprint, dict):
        return None, None
    index, default = footprint.get("FootprintIndex"), footprint.get("IsDefaultFootprint")
    return (index if type(index) is int and 0 <= index < 2**63 else None,
            int(default) if type(default) is bool else None)


def insert_link(db, record, raw, line, workspace, vault):
    row, content, uid = record_fields(record)
    check_vault(content, "ParentVaultGUID", vault, required=True)
    child_vault = guid(content.get("ChildVaultGUID"), "Child vault")
    parent = guid(content.get("ParentItemRevisionGUID"), "Parent revision")
    child = guid(content.get("ChildItemRevisionGUID"), "Child revision")
    if guid(row.get("ParentRevisionGuid"), "Row parent revision") != parent:
        raise MirrorError("Export link row and content parent revision GUIDs differ.")
    values_block(content.get("LinkParameters"), "LinkParameters")
    index, default = footprint_order(content.get("Data"))
    db.execute("INSERT INTO revision_links VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (uid, parent, child, child_vault, line, index, default, raw))
    return True


def import_export(db, path, expected, insert, workspace, vault):
    hash_state = hashlib.sha256()
    count, scoped_rows = 0, 0
    with path.open("rb") as source:
        for count, raw in enumerate(source, 1):
            hash_state.update(raw)
            try:
                decoded = decode_json(raw)
                encoding = "utf-8-sig" if count == 1 else "utf-8"
                scoped_rows += int(insert(db, decoded, raw.decode(encoding).rstrip("\r\n"), count, workspace, vault))
            except sqlite3.IntegrityError as exc:
                raise MirrorError(f"{path.name}:{count}: Conflicting or duplicate item, revision or link identity: {exc}") from exc
            except (UnicodeError, ValueError) as exc:
                raise MirrorError(f"{path.name}:{count}: {exc}") from exc
    if count != expected["row_count"]:
        raise MirrorError(f"{path.name} row count differs from the manifest.")
    if hash_state.hexdigest() != expected["sha256"]:
        raise MirrorError(f"{path.name} SHA-256 differs from the manifest.")
    return scoped_rows


def ingest(snapshot, db_path, workspace, vault_guid):
    started = time.perf_counter()
    workspace = text_id(workspace, "Workspace")
    vault = guid(vault_guid, "Requested vault")
    snapshot = Path(snapshot).resolve(strict=True)
    manifest, raw_manifest, exports, scope_sources = manifest_info(snapshot, workspace, vault)
    with new_output(db_path) as staged:
        with closing(sqlite3.connect(staged)) as db:
            db.executescript(SCHEMA)
            db.execute(f"PRAGMA application_id={APP_ID}")
            db.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
            revisions = exports["ItemRevisions"]
            scoped_revisions = import_export(db, snapshot / TABLES["ItemRevisions"], revisions,
                                             insert_revision, workspace, vault)
            if scoped_revisions != revisions["row_count"] and not scope_sources:
                raise MirrorError("Unscoped revision rows require manifest or native cache filename vault evidence.")
            if scoped_revisions:
                scope_sources.append("revision_vault_guid")
            if import_export(db, snapshot / TABLES["ItemRevisionLinks"], exports["ItemRevisionLinks"],
                             insert_link, workspace, vault):
                scope_sources.append("parent_link_vault_guids")
            if not scope_sources:
                raise MirrorError("Snapshot does not contain evidence tying it to the requested vault.")
            if (snapshot / "manifest.json").read_bytes() != raw_manifest:
                raise MirrorError("Snapshot manifest changed during import.")
            metadata = {
                "workspace": workspace, "vault_guid": vault, "vault_identity_evidence": scope_sources,
                "workspace_name_provenance": "manifest" if "workspace" in manifest else "caller_supplied",
                "snapshot_path": str(snapshot), "manifest_sha256": digest(raw_manifest), "exports": exports,
                "snapshot_copy_completed_utc": manifest["snapshot_copy_completed_utc"],
                "manifest": manifest, "evidence_scope": "local_cache_snapshot",
                "import_ms": round((time.perf_counter() - started) * 1000, 1),
            }
            db.executemany("INSERT INTO metadata VALUES (?, ?)",
                           ((key, json_text(value)) for key, value in metadata.items()))
            db.commit()
            if db.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
                raise MirrorError("Imported mirror failed SQLite quick_check.")
            result = status(db)
    return {**result, "db": str(Path(db_path).resolve()),
            "ingest_total_ms": round((time.perf_counter() - started) * 1000, 1)}


@contextmanager
def open_mirror(path):
    uri = Path(path).resolve(strict=True).as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True)) as db:
        db.execute("PRAGMA query_only=ON")
        if db.execute("PRAGMA application_id").fetchone() != (APP_ID,) or db.execute(
                "PRAGMA user_version").fetchone() != (SCHEMA_VERSION,):
            raise MirrorError("File is not a supported library mirror.")
        yield db


def provenance(db):
    data = {key: decode_json(value) for key, value in db.execute(
        "SELECT key, value_json FROM metadata WHERE key != 'manifest'")}
    return {k: data[k] for k in ("workspace", "vault_guid", "vault_identity_evidence", "workspace_name_provenance",
                                 "snapshot_path", "manifest_sha256", "exports", "snapshot_copy_completed_utc",
                                 "evidence_scope", "import_ms")}


def status(db):
    scope = provenance(db)
    vault = scope["vault_guid"]

    def count(query, args=()):
        return db.execute(query, args).fetchone()[0]

    return {"provenance": scope, "verification": UNVERIFIED.copy(), "counts": {
        "revisions": count("SELECT COUNT(*) FROM revisions"),
        "items": count("SELECT COUNT(*) FROM items"),
        "links": count("SELECT COUNT(*) FROM revision_links"),
        "links_external_child_vault": count("SELECT COUNT(*) FROM revision_links WHERE child_vault_guid<>?", (vault,)),
        "links_missing_child_revision": count(
            "SELECT COUNT(*) FROM revision_links l LEFT JOIN revisions r ON r.revision_guid=l.child_revision_guid "
            "WHERE l.child_vault_guid=? AND r.revision_guid IS NULL", (vault,)),
        "links_missing_parent_revision": count(
            "SELECT COUNT(*) FROM revision_links l LEFT JOIN revisions r ON r.revision_guid=l.parent_revision_guid "
            "WHERE r.revision_guid IS NULL"),
        "revisions_by_content_type_guid": dict(db.execute(
            "SELECT content_type_guid, COUNT(*) FROM revisions GROUP BY content_type_guid ORDER BY content_type_guid")),
    }}


def exact_revision(db, identifier):
    identifier = text_id(identifier, "Requested revision")
    try:
        by_guid = guid(identifier, "Requested revision")
    except MirrorError:
        by_guid = None
    rows = db.execute("SELECT revision_guid, source_line, record_json FROM revisions "
                      "WHERE revision_hrid = ? OR revision_guid = ?", (identifier, by_guid)).fetchall()
    if len(rows) != 1:
        raise MirrorError(f"Requested revision is missing or ambiguous: {identifier!r}")
    uid, line, raw = rows[0]
    return uid, line, decode_json(raw)


def export_revisions(db, identifiers):
    scope = provenance(db)
    vault = scope["vault_guid"]
    records, seen = [], set()
    for identifier in identifiers:
        uid, line, record = exact_revision(db, identifier)
        if uid in seen:
            raise MirrorError(f"Requested the same exact revision more than once: {identifier!r}")
        seen.add(uid)
        content = record["content"]
        links = []
        for source_line, index, default, child_vault, child_hrid, raw in db.execute(
                "SELECT l.source_line, l.footprint_index, l.is_default_footprint, l.child_vault_guid, "
                "r.revision_hrid, l.record_json FROM revision_links l LEFT JOIN revisions r "
                "ON l.child_vault_guid=? AND r.revision_guid=l.child_revision_guid "
                "WHERE l.parent_revision_guid=? ORDER BY l.source_line", (vault, uid)):
            child_status = "external_vault" if child_vault != vault else (
                "observed_in_snapshot" if child_hrid is not None else "unknown")
            links.append({
                "source_line": source_line, "footprint_index": index,
                "is_default_footprint": None if default is None else bool(default),
                "child_vault_guid": child_vault, "child_revision_status": child_status,
                "child_revision_hrid": child_hrid, "native_record": decode_json(raw),
            })
        records.append({
            "revision_hrid": content["HRID"], "revision_guid": uid,
            "item_hrid": content["ItemHRID"], "item_guid": guid(content["ItemGUID"], "Item GUID"),
            "revision_id": content["RevisionId"], "content_type_guid": guid(content["ContentTypeGUID"], "Content type GUID"),
            "source_line": line, "native_record": record,
            "parameters": values_block(content.get("RevisionParameters"), "RevisionParameters"),
            "lifecycle_state_guid": content.get("LifeCycleStateGUID"),
            "model_links": links, "link_order_basis": "source_export_order_with_explicit_footprint_index_if_observed",
            "verification": {**UNVERIFIED, "selected_link_completeness": "unknown"},
        })
    if not records:
        raise MirrorError("Supply at least one exact revision.")
    return {"provenance": scope, "revisions": records}


def plan_changes(db, payload):
    payload = object_value(payload, "Desired update input")
    changes = payload.get("changes")
    if set(payload) != {"changes"} or not isinstance(changes, list) or not changes:
        raise MirrorError("Desired update input requires one nonempty changes array.")
    requested = []
    for change in changes:
        change = object_value(change, "Desired revision update")
        if set(change) - {"revision", "parameters", "lifecycle_state", "comment"}:
            raise MirrorError("Desired revision update contains an unknown key.")
        revision = text_id(change.get("revision"), "Desired revision")
        params = object_value(change.get("parameters", {}), "Desired parameters")
        for name, value in params.items():
            text_id(name, "Desired parameter name")
            if value is not None and type(value) not in (str, int, float, bool):
                raise MirrorError("Desired parameter values must be literal JSON scalars.")
        has_lifecycle = "lifecycle_state" in change
        if has_lifecycle:
            text_id(change["lifecycle_state"], "Desired lifecycle state")
        if "comment" in change:
            if not has_lifecycle or not isinstance(change["comment"], str):
                raise MirrorError("A comment must accompany a desired lifecycle state.")
        if not params and not has_lifecycle:
            raise MirrorError("Request at least one parameter value or lifecycle state.")
        requested.append(revision)
    exported = export_revisions(db, requested)
    plans = []
    for change, before in zip(changes, exported["revisions"]):
        blockers = ["current_server_state_unverified", "part_choices_unknown", "where_used_unknown"]
        if "lifecycle_state" in change:
            blockers.append("allowed_transition_unresolved")
        plans.append({"before": before, "desired": {k: v for k, v in change.items() if k != "revision"},
                      "blockers": blockers, "ready_to_execute": False})
    return {"provenance": exported["provenance"], "plan_only": True, "ready_to_execute": False, "changes": plans}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    load = sub.add_parser("ingest", help="Create a new local SQLite mirror.")
    load.add_argument("--snapshot", required=True, type=Path)
    load.add_argument("--db", required=True, type=Path)
    load.add_argument("--workspace", required=True)
    load.add_argument("--vault-guid", required=True)
    for name in ("status", "export", "plan"):
        command = sub.add_parser(name)
        command.add_argument("--db", required=True, type=Path)
        command.add_argument("--out", type=Path)
        if name == "export":
            command.add_argument("--revision", required=True, action="append")
        if name == "plan":
            command.add_argument("--changes", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "ingest":
        result = ingest(args.snapshot, args.db, args.workspace, args.vault_guid)
    else:
        if args.out and os.path.lexists(args.out):
            raise MirrorError(f"Output already exists: {args.out}")
        with open_mirror(args.db) as db:
            if args.command == "status":
                result = status(db)
            elif args.command == "export":
                result = export_revisions(db, args.revision)
            else:
                result = plan_changes(db, decode_json(args.changes.read_bytes()))
        if args.out:
            with new_output(args.out) as staged:
                staged.write_text(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
                                  encoding="utf-8")
            print(json.dumps({"output": str(args.out.resolve()), "command": args.command}, indent=2))
            return
    print(json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, sqlite3.Error, KeyError) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        sys.exit(2)
