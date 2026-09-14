"""Behavioral tests; run with python -m unittest discover -s tests -v."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from policy import canonicalize, category, discover, file_groups, load_policy, reserve_output, sha256
from normalize_config import normalize_config

def example_config():
    settings={
      "ComponentType":{"Value":"Connectors","Source":0,"TypeGuid":"KEEP-TYPE"},
      "ComponentTemplate":{"Action":4,"ItemGuid":"KEEP-ITEM","RevisionGuid":"KEEP-REVISION"},
      "EntityTypeSettingList":[{"LifeCycleDefinition":{"Value":"KEEP-LIFECYCLE"}}],
      "ParameterMappingList":[{"ServerParameter":"Name","SourceParameter":"Design Item ID","TypeGuid":"TEXT","Source":1},
          {"ServerParameter":"MF","SourceParameter":"MF","TypeGuid":"TEXT","Source":2}],
      "PartChoiceFieldMapList":[{"NameFieldName":"MF","PartNumberFieldName":"MP"}],
      "IsSkipped":False,"IsSplitted":False,"Splitting":{"IsParameterGrouping":True,"GroupParameterName":"ComponentType"}}
    parent=copy.deepcopy(settings);parent["IsSplitted"]=True
    second=copy.deepcopy(settings);second["ComponentType"]["Value"]="Mechanical";second["ComponentTemplate"]["ItemGuid"]="MECHANICAL"
    return {"Version":1,"LibraryList":[
       {"FilePath":"Library.SchLib","SubLibraryName":"","Settings":parent},
       {"FilePath":"Library.SchLib","SubLibraryName":"Library.Connectors","Settings":settings},
       {"FilePath":"Library.SchLib","SubLibraryName":"Library.Mechanical","Settings":second}]}
def example_manifest():
    def coverage(pair):
        return {"components":1,"MFR":int(pair),"MPN":int(pair),"Supplier":0,"SPN":0,"Comment":1,
                "MFR+MPN":int(pair),"Supplier+SPN":0}
    return {"output_schlib":"Library.SchLib","output_components":2,"verification_errors":[],
            "component_type_coverage":{"Connectors":coverage(True),"Mechanical":coverage(False)}}

class PolicyTests(unittest.TestCase):
    def setUp(self): self.rules=load_policy()
    def test_aliases_and_comment_expression(self):
        c,_=canonicalize({"MF":["TI"],"MP":["ABC"],"Comment":["=ManufacturerPartNumber"],
                         "ManufacturerPartNumber":["ABC"]},self.rules)
        self.assertEqual((c["MFR"],c["MPN"],c["Comment"]),("Texas Instruments","ABC","ABC"))
    def test_canonical_precedence_and_conflict_audit(self):
        c,conflicts=canonicalize({"MPN":["GOOD"],"MP":["BAD"]},self.rules)
        self.assertEqual(c["MPN"],"GOOD");self.assertEqual(conflicts[0]["values"],["BAD","GOOD"])
    def test_cycles_and_placeholders_are_missing(self):
        c,_=canonicalize({"MFR":["MF"],"MF":["*"],"MPN":["=MP"],"MP":["=MPN"]},self.rules)
        self.assertFalse(c["MFR"]);self.assertFalse(c["MPN"])
    def test_embedded_noparam_cannot_be_a_purchasing_identity(self):
        from consolidate import canonical_value, component_identity
        for value in ("[NoParam]", "ABC-[NoParam]", "[ noparam ], 123-ND"):
            with self.subTest(value=value):
                canonical,_=canonicalize({"MFR":["Acme"],"MPN":[value],
                    "Supplier":["DigiKey"],"SPN":[value]},self.rules)
                self.assertEqual(canonical["MPN"],"")
                self.assertEqual(canonical["SPN"],"")
                self.assertTrue(component_identity(canonical,"Part").startswith("NAME|"))
                self.assertEqual(canonical_value({"mpn":[value]},"MPN"),"")
    def test_supplier_inference_is_coherent(self):
        c,_=canonicalize({"MOUSER_PART_NUMBER":["123"]},self.rules)
        self.assertEqual((c["Supplier"],c["SPN"]),("Mouser","123"))
        c,_=canonicalize({"Supplier":["DigiKey"],"MOUSER_PART_NUMBER":["123"]},self.rules)
        self.assertEqual(c["SPN"],"")
    def test_supplier_placeholder_not_inferred(self):
        c,_=canonicalize({"MOUSER_PART_NUMBER":["N/A"]},self.rules)
        self.assertFalse(c["Supplier"])
    def test_reusable_designators(self):
        for prefix,expected in {"CONN":"Connectors","MP":"Mechanical","R":"Resistors","C":"Capacitors",
             "U":"Integrated Circuits","TP":"Test Points","FB":"Inductors","BT":"Batteries","F":"Fuses"}.items():
            for suffix in ("","?","12"):
                self.assertEqual(category("ordinary part",prefix+suffix,{},self.rules)[0],expected)
    def test_parameter_rules_and_name_rules(self):
        self.assertEqual(category("odd","",{"ComponentType":["Data Converters"]},self.rules)[0],"Data Converters")
        self.assertEqual(category("M3 standoff","",{},self.rules)[0],"Mechanical")
        self.assertEqual(category("ADS1234","U?",{},self.rules)[0],"Data Converters")
    def test_unresolved_stays_unresolved(self):
        self.assertEqual(category("mystery","",{},self.rules)[0],"")
    def test_exception_is_scoped(self):
        self.rules["categoryOverrides"]=[{"name":"part","sourcePattern":"*/one/*","componentType":"Mechanical","reason":"reviewed"}]
        self.assertEqual(category("part","R?",{},self.rules,"x/one/lib")[0],"Mechanical")
        self.assertEqual(category("part","R?",{},self.rules,"x/two/lib")[0],"Resistors")
    def test_ambiguous_alias_profile_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"bad.json";path.write_text(json.dumps({"canonicalParameters":{"MPN":["MF"]}}))
            with self.assertRaises(ValueError):load_policy(path)
    def test_recursive_case_insensitive_discovery(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/"nested").mkdir();(root/"History").mkdir();(root/"staging").mkdir()
            (root/"nested/a.sChLiB").write_bytes(b"one");(root/"copy.SchLib").write_bytes(b"one")
            (root/"History/old.SchLib").write_bytes(b"old")
            (root/"staging/.altium-migration-output").touch();(root/"staging/new.PcbLib").touch()
            paths,_=discover([root,root/"nested"],self.rules["excludeDirectories"])
            self.assertEqual(len(paths),2);self.assertEqual(len(file_groups(paths)),1)
    def test_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):reserve_output(temp)

class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.config=example_config();self.manifest=example_manifest();self.aliases=load_policy()["canonicalParameters"]
    def test_preserves_workspace_identifiers_and_canonical_maps(self):
        original=copy.deepcopy(self.config)
        result,audit=normalize_config(self.config,self.manifest,self.aliases)
        self.assertEqual(self.config,original)
        settings=result["LibraryList"][1]["Settings"]
        self.assertEqual(settings["ComponentTemplate"],original["LibraryList"][1]["Settings"]["ComponentTemplate"])
        self.assertEqual(settings["EntityTypeSettingList"],original["LibraryList"][1]["Settings"]["EntityTypeSettingList"])
        mappings={r["ServerParameter"]:r for r in settings["ParameterMappingList"]}
        self.assertNotIn("MF",mappings);self.assertEqual(mappings["Comment"]["SourceParameter"],"Comment")
        self.assertEqual(mappings["MPN"]["Source"],2)
        self.assertEqual(mappings["Comment"]["Source"],2)
        self.assertEqual(len(settings["PartChoiceFieldMapList"]),1)
        self.assertEqual(result["LibraryList"][2]["Settings"]["PartChoiceFieldMapList"],[])
        self.assertFalse(audit["workspace_validated"])
    def test_fallback_keeps_logical_split_key(self):
        result,_=normalize_config(self.config,self.manifest,self.aliases,{"Connectors":"Mechanical"})
        row=result["LibraryList"][1]
        self.assertEqual(row["SubLibraryName"],"Library.Connectors")
        self.assertEqual(row["Settings"]["ComponentType"]["Value"],"Mechanical")
        self.assertEqual(row["Settings"]["ComponentTemplate"]["ItemGuid"],"MECHANICAL")
    def test_unknown_fallback_cannot_invent_guid(self):
        with self.assertRaises(ValueError):normalize_config(self.config,self.manifest,self.aliases,{"Connectors":"Unknown"})
    def test_missing_group_rejected(self):
        self.config["LibraryList"].pop()
        with self.assertRaises(ValueError):normalize_config(self.config,self.manifest,self.aliases)
    def test_standalone_pcb_source_rejected(self):
        self.config["LibraryList"].append({"FilePath":"Other.PcbLib"})
        with self.assertRaises(ValueError):normalize_config(self.config,self.manifest,self.aliases)
    def test_rebinding_is_explicit(self):
        self.manifest["output_schlib"]="Other.SchLib"
        with self.assertRaises(ValueError):normalize_config(self.config,self.manifest,self.aliases)
        result,_=normalize_config(self.config,self.manifest,self.aliases,rebind=True)
        self.assertEqual(result["LibraryList"][1]["SubLibraryName"],"Other.Connectors")
    def test_required_flag_preserved(self):
        self.config["LibraryList"][1]["Settings"]["ParameterMappingList"][1]["IsRequired"]=True
        result,_=normalize_config(self.config,self.manifest,self.aliases)
        self.assertTrue(next(r for r in result["LibraryList"][1]["Settings"]["ParameterMappingList"] if r["ServerParameter"]=="MFR")["IsRequired"])

    def test_system_targets_using_canonical_sources_are_not_consumed(self):
        preserved=[{"ServerParameter":"Name","SourceParameter":"Comment","Source":2,"TypeGuid":"TEXT","IsRequired":True},
                   {"ServerParameter":"Description","SourceParameter":"MPN","Source":2,"TypeGuid":"TEXT"},
                   {"ServerParameter":"ID","SourceParameter":"<Auto>","Source":1,"TypeGuid":"TEXT"}]
        for row in self.config["LibraryList"]:
            row["Settings"]["ParameterMappingList"]=copy.deepcopy(preserved)+row["Settings"]["ParameterMappingList"][1:]
        result,_=normalize_config(self.config,self.manifest,self.aliases)
        for row in result["LibraryList"]:
            maps=row["Settings"]["ParameterMappingList"]
            for expected in preserved:
                self.assertEqual([m for m in maps if m["ServerParameter"]==expected["ServerParameter"]],[expected])
            self.assertEqual(sum(m["ServerParameter"]=="Comment" for m in maps),1)

    def test_readable_name_is_explicit_and_preserves_item_identity_settings(self):
        original=copy.deepcopy(self.config)
        normal,_=normalize_config(self.config,self.manifest,self.aliases)
        named,audit=normalize_config(self.config,self.manifest,self.aliases,name_from_comment=True)
        for before,after in zip(normal["LibraryList"],named["LibraryList"]):
            old_maps=before["Settings"]["ParameterMappingList"]
            new_maps=after["Settings"]["ParameterMappingList"]
            name=next(m for m in new_maps if m["ServerParameter"]=="Name")
            self.assertEqual((name["SourceParameter"],name["Source"]),("Comment",2))
            restored=copy.deepcopy(after)
            restored["Settings"]["ParameterMappingList"]=[copy.deepcopy(next(m for m in old_maps if m["ServerParameter"]=="Name")) if m["ServerParameter"]=="Name" else m for m in new_maps]
            self.assertEqual(restored,before)
        self.assertEqual(self.config,original)
        self.assertTrue(all(g["name_mapping"][0]["SourceParameter"]=="Comment" for g in audit["groups"]))

    def test_readable_name_rejects_missing_comments_without_mutating_input(self):
        self.manifest["component_type_coverage"]["Mechanical"]["Comment"]=0
        original=copy.deepcopy(self.config)
        with self.assertRaisesRegex(ValueError,"populated Comment"):
            normalize_config(self.config,self.manifest,self.aliases,name_from_comment=True)
        self.assertEqual(self.config,original)

    def test_readable_name_requires_one_exported_name_target(self):
        mappings=self.config["LibraryList"][1]["Settings"]["ParameterMappingList"]
        mappings.append(copy.deepcopy(mappings[0]))
        with self.assertRaisesRegex(ValueError,"exactly one exported Name"):
            normalize_config(self.config,self.manifest,self.aliases,name_from_comment=True)

class BinaryTests(unittest.TestCase):
    def test_removed_alias_does_not_corrupt_model_owners(self):
        from migrate import canonical_records
        records=[{"RECORD":"1"},{"RECORD":"41","Name":"MF","Text":"TI"},
                 {"RECORD":"41","Name":"MFR","Text":"TI"},
                 {"RECORD":"44"},{"RECORD":"45","OwnerIndex":"3","ModelName":"FP"},
                 {"RECORD":"46","OwnerIndex":"4"}]
        canonical=dict.fromkeys(("MFR","MPN","Supplier","SPN","Comment"),"");canonical["MFR"]="Texas Instruments"
        result=canonical_records(records,canonical,"Connectors",load_policy())
        model=next((i,r) for i,r in enumerate(result) if r["RECORD"]=="45")
        child=next(r for r in result if r["RECORD"]=="46")
        self.assertEqual(result[int(model[1]["OwnerIndex"])]["RECORD"],"44")
        self.assertEqual(int(child["OwnerIndex"]),model[0])
        self.assertNotIn("MF",[r.get("Name") for r in result])
    def test_build_preserves_variants_and_unions_models(self):
        from altium_monkey import AltiumSchLib,AltiumPcbLib
        from migrate import run
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);sources=root/"source";sources.mkdir()
            pcb=AltiumPcbLib()
            for name in ("FP-A","FP-B","UNREFERENCED"):
                footprint=pcb.add_footprint(name)
                footprint.add_track((0,0),(50,0),width_mils=5)
            pcb_path=sources/"parts.PcbLib";pcb.save(pcb_path)
            for index,(width,model) in enumerate(((100,"FP-A"),(100,"FP-B"),(150,"FP-A"))):
                lib=AltiumSchLib();symbol=lib.add_symbol("CONN_TEST")
                symbol.add_rectangle(0,0,width,100);symbol.add_designator("CONN?",0,150)
                symbol.add_parameter("MF","Acme",is_hidden=True)
                symbol.add_parameter("MP","ABC",is_hidden=True)
                symbol.add_footprint(model)
                lib.save(sources/f"part-{index}.SchLib")
            before={p:sha256(p) for p in sources.iterdir()}
            result=run(SimpleNamespace(command="build",root=[str(sources)],profile=None,
                        output=str(root/"result"),exclude=[]))
            self.assertEqual(result,0,(root/"result/audit.json").read_text())
            report=json.loads((root/"result/audit.json").read_text())
            self.assertEqual(report["generated_counts"]["components"],2)
            manifest=json.loads((root/"result/consolidated/Consolidated.manifest.json").read_text())
            self.assertEqual(sorted(len(v["attached_models"]) for v in manifest["variants"]),[1,2])
            self.assertEqual(len(report["unreferenced_footprints"]),1)
            consolidated=AltiumSchLib(root/"result/consolidated/Consolidated.SchLib")
            for symbol in consolidated.symbols:
                names={p.name for p in symbol.parameters}
                self.assertTrue({"MFR","MPN","Supplier","SPN","Comment"}<=names)
                self.assertFalse({"MF","MP","ManufacturerPartNumber"}&names)
            self.assertEqual(before,{p:sha256(p) for p in sources.iterdir()})
    def test_ambiguous_footprint_is_not_silently_selected(self):
        from migrate import resolve_candidates
        source=Path("project/schematic.SchLib").resolve()
        paths=[source.parent/"a.PcbLib",source.parent/"b.PcbLib"]
        result,tier=resolve_candidates(source,{"ModelName":"FP"},{"fp":paths},{})
        self.assertEqual(result,paths);self.assertEqual(tier,"directory")
    def test_hidden_pin_layout_changes_signature(self):
        from consolidate import electrical_hash
        pin=SimpleNamespace(designator="1",name="IN",is_hidden=True,x_mils=0,y_mils=0)
        first=SimpleNamespace(part_count=1,pins=[pin])
        second=copy.deepcopy(first);second.pins[0].x_mils=100
        self.assertNotEqual(electrical_hash(first),electrical_hash(second))
    def test_different_pin_maps_are_distinguished(self):
        from consolidate import model_pin_signature
        first=SimpleNamespace(raw_records=[{"RECORD":"45"},{"RECORD":"47","OwnerIndex":"0","Pin":"1","Pad":"1"}])
        second=copy.deepcopy(first);second.raw_records[1]["Pad"]="2"
        self.assertNotEqual(model_pin_signature(first,0),model_pin_signature(second,0))
    def test_symbol_only_library_build(self):
        from altium_monkey import AltiumSchLib
        from migrate import run
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);sources=root/"source";sources.mkdir()
            lib=AltiumSchLib();sym=lib.add_symbol("MOUNTING_HOLE")
            sym.add_rectangle(0,0,100,100);sym.add_designator("MP?",0,150)
            lib.save(sources/"mechanical.SchLib")
            result=run(SimpleNamespace(command="build",root=[str(sources)],profile=None,
                        output=str(root/"result"),exclude=[]))
            self.assertEqual(result,0,(root/"result/audit.json").read_text())

    def test_identical_schlibs_preserve_different_local_model_contexts(self):
        from altium_monkey import AltiumSchLib,AltiumPcbLib
        from migrate import run
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);sources=root/"source"
            for name in ("a","b"):(sources/name).mkdir(parents=True)
            lib=AltiumSchLib();symbol=lib.add_symbol("CONN_TEST")
            symbol.add_rectangle(0,0,100,100);symbol.add_designator("CONN?",0,150)
            symbol.add_parameter("MFR","Acme",is_hidden=True)
            symbol.add_parameter("MPN","ABC",is_hidden=True);symbol.add_footprint("FP")
            lib.save(sources/"a/parts.SchLib")
            (sources/"b/parts.SchLib").write_bytes((sources/"a/parts.SchLib").read_bytes())
            for name,length in (("a",50),("b",100)):
                pcb=AltiumPcbLib();fp=pcb.add_footprint("FP")
                fp.add_track((0,0),(length,0),width_mils=5);pcb.save(sources/name/"parts.PcbLib")
            result=run(SimpleNamespace(command="build",root=[str(sources)],profile=None,
                        output=str(root/"result"),exclude=[]))
            self.assertEqual(result,0,(root/"result/audit.json").read_text())
            manifest=json.loads((root/"result/consolidated/Consolidated.manifest.json").read_text())
            self.assertEqual(manifest["output_components"],1)
            self.assertEqual(len(manifest["variants"][0]["attached_models"]),2)
            self.assertEqual(len(list((root/"result/flat").glob("*.SchLib"))),2)

    def test_missing_metadata_identity_is_scoped(self):
        from consolidate import component_identity
        self.assertTrue(component_identity(dict.fromkeys(("MFR","MPN","Supplier","SPN","Comment"),""),"part").startswith("NAME|"))

if __name__=="__main__":unittest.main()
