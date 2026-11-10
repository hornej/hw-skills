import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from uuid import UUID


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import library_mirror as mirror


def gid(n):
    return str(UUID(int=n))


WORKSPACE = "Sample Workspace"
VAULT, FOREIGN, PART_TYPE, FOOTPRINT_TYPE = map(gid, (1, 2, 3, 4))
ITEM, FIRST, SECOND, FOOTPRINT, MISSING = map(gid, (10, 11, 12, 13, 14))


def raw_record(content, parent=None):
    row = {"Guid": content["GUID"].upper(), "UpdatedAt": "2026-01-01T00:00:00",
           "ExpireAt": "9999-12-31T23:59:59"}
    if parent:
        row["ParentRevisionGuid"] = parent.upper()
    return {"row": row, "content": content, "content_sha256": "e" * 64}


def revision(uid, item, item_hrid, rev, content_type, parameters):
    return raw_record({"GUID": uid, "ItemGUID": item, "HRID": f"{item_hrid}-{rev}",
                       "ItemHRID": item_hrid, "RevisionId": rev, "ContentTypeGUID": content_type,
                       "RevisionParameters": parameters, "StateChanges": {"$values": []},
                       "LifeCycleStateGUID": gid(41)})


def link(uid, parent, child, index, default):
    return raw_record({"GUID": uid, "ParentItemRevisionGUID": parent, "ChildItemRevisionGUID": child,
                       "ParentVaultGUID": VAULT, "ChildVaultGUID": VAULT, "HRID": "PCBLIB",
                       "Data": json.dumps({"Footprint": {"FootprintIndex": index,
                                                       "IsDefaultFootprint": default}}, separators=(",", ":")),
                       "LinkParameters": {"$values": [{"HRID": "MapAsString", "ParameterValue": None}]}},
                      parent=parent)


class LibraryMirrorTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.snapshot = self.root / "snapshot"
        self.snapshot.mkdir()
        self.db = self.root / "mirror.sqlite"
        self.params = [
            {"HRID": "MPN", "ParameterTypeGUID": gid(61), "ParameterValue": None,
             "ParameterRealValue": "", "ItemRevisionGUID": SECOND.upper()},
            {"HRID": "Manufacturer Part Number", "ParameterTypeGUID": gid(62),
             "ParameterValue": "001.00", "ParameterRealValue": "1.0"},
            {"HRID": "Show", "ParameterValue": False, "ParameterRealValue": 0},
        ]
        self.revisions = [
            revision(FIRST, ITEM, "PART-A", "1", PART_TYPE, None),
            revision(SECOND, ITEM, "PART-A", "2", PART_TYPE, {"$values": self.params}),
            revision(FOOTPRINT, gid(15), "FOOTPRINT-A", "1", FOOTPRINT_TYPE, {"$values": []}),
        ]
        self.links = [link(gid(21), SECOND, MISSING, 1, False), link(gid(22), SECOND, FOOTPRINT, 0, True),
                      link(gid(23), gid(17), FOOTPRINT, 0, True)]
        self.manifest = {
            "snapshot_copy_completed_utc": "2026-01-02T03:04:05+00:00",
            "workspace": WORKSPACE, "vault_guid": VAULT,
        }

    def write_snapshot(self, revisions=None, links=None):
        exports = {
            "ItemRevisions": revisions if revisions is not None else self.revisions,
            "ItemRevisionLinks": links if links is not None else self.links,
        }
        hashes, counts = {}, {}
        for table, records in exports.items():
            name = mirror.TABLES[table]
            raw = "".join((r if isinstance(r, str) else json.dumps(r)) + "\n" for r in records).encode()
            (self.snapshot / name).write_bytes(raw)
            hashes[name], counts[table] = hashlib.sha256(raw).hexdigest(), len(records)
        self.manifest.update(jsonl_sha256=hashes, table_counts=counts)
        self.save_manifest()

    def save_manifest(self):
        (self.snapshot / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def build(self):
        return mirror.ingest(self.snapshot, self.db, WORKSPACE, VAULT)

    def expect_failed_import(self):
        originals = {p.name: p.read_bytes() for p in self.snapshot.iterdir()}
        with self.assertRaises((mirror.MirrorError, OSError)):
            self.build()
        self.assertFalse(self.db.exists())
        self.assertFalse(list(self.root.glob(".library-mirror-*")))
        self.assertEqual(originals, {p.name: p.read_bytes() for p in self.snapshot.iterdir()})

    def test_import_preserves_history_raw_parameters_and_link_evidence(self):
        self.write_snapshot()
        originals = {p.name: p.read_bytes() for p in self.snapshot.iterdir()}
        info = self.build()
        self.assertEqual(info["counts"]["revisions"], 3)
        self.assertEqual(info["counts"]["items"], 2)
        self.assertEqual(info["counts"]["links_missing_child_revision"], 1)
        self.assertEqual(info["counts"]["links_missing_parent_revision"], 1)
        self.assertEqual(info["provenance"]["manifest_sha256"], hashlib.sha256(originals["manifest.json"]).hexdigest())
        with mirror.open_mirror(self.db) as db:
            out = mirror.export_revisions(db, ["PART-A-1", SECOND.upper(), "FOOTPRINT-A-1"])["revisions"]
        self.assertIsNone(out[0]["parameters"])
        self.assertEqual(out[1]["parameters"], self.params)
        self.assertIs(out[1]["parameters"][2]["ParameterValue"], False)
        self.assertIs(type(out[1]["parameters"][2]["ParameterRealValue"]), int)
        self.assertEqual(out[2]["parameters"], [])
        self.assertEqual(out[1]["native_record"], self.revisions[1])
        links = out[1]["model_links"]
        self.assertEqual([x["footprint_index"] for x in links], [1, 0])
        self.assertEqual([x["is_default_footprint"] for x in links], [False, True])
        self.assertEqual([x["child_revision_status"] for x in links], ["unknown", "observed_in_snapshot"])
        self.assertEqual([x["native_record"] for x in links], self.links[:2])
        self.assertEqual(out[1]["verification"]["where_used"], "unknown")
        self.assertEqual(originals, {p.name: p.read_bytes() for p in self.snapshot.iterdir()})

    def test_bad_hash_missing_export_or_wrong_count_rolls_back(self):
        self.write_snapshot()
        path = self.snapshot / "ItemRevisionLinks.jsonl"
        path.write_bytes(path.read_bytes().replace(b'"HRID": "PCBLIB"', b'"HRID": "BAD"'))
        self.expect_failed_import()
        self.write_snapshot()
        self.manifest["table_counts"]["ItemRevisions"] += 1
        self.save_manifest()
        self.expect_failed_import()
        self.write_snapshot()
        path.unlink()
        self.expect_failed_import()

    def test_rejects_identity_conflict_and_foreign_vault(self):
        self.revisions[0]["row"]["Guid"] = gid(92)
        self.write_snapshot()
        self.expect_failed_import()
        self.revisions[0]["row"]["Guid"] = FIRST.upper()
        self.links[0]["content"]["ParentVaultGUID"] = FOREIGN
        self.write_snapshot()
        self.expect_failed_import()
        self.links[0]["content"]["ParentVaultGUID"] = VAULT
        self.manifest["source_path"] = f"C:/cache/{UUID(FOREIGN).hex}-{UUID(gid(90)).hex}-v20.sqlite"
        self.write_snapshot()
        self.expect_failed_import()

    def test_external_child_is_preserved_and_never_resolves_a_same_guid_local_revision(self):
        self.links[0]["content"]["ChildVaultGUID"] = FOREIGN
        self.links[0]["content"]["ChildItemRevisionGUID"] = FOOTPRINT
        self.write_snapshot()
        counts = self.build()["counts"]
        self.assertEqual(counts["links_external_child_vault"], 1)
        self.assertEqual(counts["links_missing_child_revision"], 0)
        with mirror.open_mirror(self.db) as db:
            first, second = mirror.export_revisions(db, ["PART-A-2"])["revisions"][0]["model_links"]
        self.assertEqual(first["child_vault_guid"], FOREIGN)
        self.assertEqual(first["child_revision_status"], "external_vault")
        self.assertIsNone(first["child_revision_hrid"])
        self.assertEqual(first["native_record"], self.links[0])
        self.assertEqual(second["child_revision_hrid"], "FOOTPRINT-A-1")

    def test_missing_native_content_hash_is_rejected_with_valid_export_hash(self):
        del self.revisions[0]["content_sha256"]
        self.write_snapshot()
        self.expect_failed_import()

    def test_duplicate_json_keys_or_revision_guids_are_rejected(self):
        duplicate_key = json.dumps(self.revisions[0]).replace('"content":', '"content":null,"content":', 1)
        self.write_snapshot(revisions=[duplicate_key])
        self.expect_failed_import()
        alias = revision(FIRST.upper(), gid(99), "PART-DIFFERENT", "1", PART_TYPE, None)
        self.write_snapshot(revisions=[*self.revisions, alias])
        self.expect_failed_import()
        self.write_snapshot(links=[*self.links, self.links[0]])
        self.expect_failed_import()

    def test_duplicate_hrid_or_same_item_revision_number_are_rejected(self):
        duplicate = revision(gid(30), gid(31), "PART-A", "1", PART_TYPE, None)
        self.write_snapshot(revisions=[*self.revisions, duplicate])
        self.expect_failed_import()
        duplicate_item_rev = revision(gid(32), ITEM, "PART-ALIAS", "1", PART_TYPE, None)
        self.write_snapshot(revisions=[*self.revisions, duplicate_item_rev])
        self.expect_failed_import()

    def test_scoped_links_or_one_scoped_revision_do_not_bind_unscoped_revisions(self):
        self.manifest.pop("workspace")
        self.manifest.pop("vault_guid")
        self.write_snapshot(links=[])
        self.expect_failed_import()
        self.write_snapshot()
        self.expect_failed_import()
        self.revisions[0]["content"]["VaultGUID"] = VAULT
        self.write_snapshot()
        self.expect_failed_import()
        for record in self.revisions:
            record["content"]["VaultGUID"] = VAULT
        self.write_snapshot()
        evidence = self.build()["provenance"]
        self.assertEqual(evidence["vault_identity_evidence"], ["revision_vault_guid", "parent_link_vault_guids"])
        self.assertEqual(evidence["workspace_name_provenance"], "caller_supplied")

    def test_native_cache_filename_can_bind_unscoped_revisions(self):
        self.manifest.pop("vault_guid")
        self.manifest["source_path"] = f"C:/cache/{UUID(VAULT).hex}-{UUID(gid(90)).hex}-v20.sqlite"
        self.write_snapshot()
        self.assertEqual(self.build()["provenance"]["vault_identity_evidence"],
                         ["native_cache_filename", "parent_link_vault_guids"])

    def test_hash_consistent_revision_label_injection_is_rejected(self):
        self.revisions[1]["content"]["HRID"] = "PART-OTHER-2"
        self.write_snapshot()
        self.expect_failed_import()

    def test_hash_consistent_item_label_reassignment_is_rejected_in_both_directions(self):
        # Different revision numbers avoid the existing revision uniqueness checks.
        for item_guid, item_hrid in ((ITEM, "PART-ALIAS"), (gid(99), "PART-A")):
            with self.subTest(item_guid=item_guid, item_hrid=item_hrid):
                reassigned = revision(gid(32), item_guid, item_hrid, "3", PART_TYPE, None)
                self.write_snapshot(revisions=[*self.revisions, reassigned])
                self.expect_failed_import()

    def test_status_verification_is_not_shared(self):
        self.write_snapshot()
        first = self.build()
        first["verification"]["part_choices"] = "modified by caller"
        with mirror.open_mirror(self.db) as db:
            self.assertEqual(mirror.status(db)["verification"]["part_choices"], "unknown")

    def test_existing_output_and_read_only_open(self):
        self.write_snapshot()
        self.build()
        before = self.db.read_bytes()
        with self.assertRaises(mirror.MirrorError):
            self.build()
        with mirror.open_mirror(self.db) as db:
            with self.assertRaises(mirror.sqlite3.OperationalError):
                db.execute("DELETE FROM revisions")
        self.assertEqual(self.db.read_bytes(), before)
        out = self.root / "existing.json"
        out.write_text("keep", encoding="utf-8")
        with self.assertRaises(mirror.MirrorError):
            with mirror.new_output(out):
                self.fail("Existing output opened")
        self.assertEqual(out.read_text(encoding="utf-8"), "keep")

    def test_plan_preserves_before_and_blocks_lifecycle_until_fresh_validation(self):
        self.write_snapshot()
        self.build()
        before = self.db.read_bytes()
        with mirror.open_mirror(self.db) as db:
            request = {"changes": [{"revision": "PART-A-2", "parameters": {"MPN": "001"},
                                    "lifecycle_state": "Superseded", "comment": "Review only"}]}
            plan = mirror.plan_changes(db, request)
            self.assertFalse(plan["ready_to_execute"])
            self.assertFalse(plan["changes"][0]["ready_to_execute"])
            self.assertEqual(plan["changes"][0]["before"]["parameters"], self.params)
            self.assertEqual(plan["changes"][0]["desired"]["lifecycle_state"], "Superseded")
            self.assertIn("allowed_transition_unresolved", plan["changes"][0]["blockers"])
            self.assertIn("current_server_state_unverified", plan["changes"][0]["blockers"])
            for change in ({"revision": "missing", "lifecycle_state": "Draft"},
                           {"revision": "PART-A-2"},
                           {"revision": "PART-A-2", "comment": "alone"},
                           {"revision": "PART-A-2", "lifecycle_state": "Draft", "transition_id": gid(60)},
                           {"revision": "PART-A-2", "parameters": {"MPN": {"value": "wrong shape"}}}):
                with self.subTest(change=change), self.assertRaises(mirror.MirrorError):
                    mirror.plan_changes(db, {"changes": [change]})
        self.assertEqual(self.db.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
