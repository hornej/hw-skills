# Profiles and exception schema

assets/defaults.json contains reusable canonical aliases, supplier pair
inference, manufacturer spelling aliases, and category rules. It contains no
project exclusions or component-specific corrections. Apply an optional JSON
profile with --profile. Unknown top-level keys and aliases shared by multiple
canonical fields are rejected.

Dictionary entries override the corresponding defaults. List entries prepend
to defaults, so explicit rules win. No default needs copying into each project.
All category rules return the logical category, including Data Converters and
Test Points. Workspace fallbacks live in a different file.

Canonical precedence: canonical spelling first, then aliases in listed order,
case-insensitive. Trim surrounding whitespace; preserve MPN punctuation.
Simple =Parameter references resolve recursively; placeholders and unresolved
expressions do not become identities. MFR spelling normalization is explicit.
Supplier-branded SPNs infer a supplier only when the pair is consistent; never
pair a Mouser number with an existing DigiKey supplier. Conflicting alias values
are retained in the audit, even when a deterministic canonical winner exists.

Category precedence: categoryOverrides, recognized parameterRules, nameRules,
designatorRules. Names use regex search; designators use fullmatch. Category
coverage includes a rule explanation per component. An unmatched part stays
unresolved rather than silently becoming Miscellaneous. P/CONN default to
Connectors; a different legacy designator convention belongs in a project profile.

Example profile:

~~~json
{
  "canonicalParameters": {
    "MPN": ["MPN", "MP", "ManufacturerPartNumber", "Vendor legacy MPN"]
  },
  "categoryOverrides": [
    {
      "name": "Special mounting assembly",
      "sourcePattern": "*/project-a/*",
      "componentType": "Mechanical",
      "reason": "Reviewed assembly function"
    }
  ],
  "parameterOverrides": [
    {
      "name": "Part needing correction",
      "parameters": {"MFR": "Acme", "MPN": "ABC-123"},
      "reason": "Verified against the part datasheet"
    }
  ],
  "excludedComponents": [
    {"name": "PROJECT_PLACEHOLDER", "reason": "Non-orderable project placeholder"}
  ],
  "preserveSeparateComponents": [
    {
      "name": "Suspect source symbol",
      "whenMpn": "ABC-123",
      "reason": "Name conflicts with MPN; retain for review"
    }
  ]
}
~~~

Exception selectors accept name (case-insensitive exact match), namePattern
(regex search), and sourcePattern (glob on an absolute source path with forward
slashes). Multiple selectors must all match. whenMpn is optional on metadata/
preservation rules. Every exception should state the review reason.

Model rules:

~~~json
{
  "modelSubstitutions": [
    {
      "componentPattern": "^ReviewedPart$",
      "fromModel": "STALE_FOOTPRINT",
      "toModel": "VERIFIED_FOOTPRINT",
      "reason": "Verified package dimensions and pin map"
    }
  ],
  "allowAmbiguousModels": [
    {
      "name": "ReviewedPart",
      "model": "SHARED_NAME",
      "sourcePattern": "*/project-a/*",
      "reason": "Reviewed all candidate footprints as compatible alternatives"
    }
  ]
}
~~~

Model selection requires the name to exist in discovered PcbLibs. Precedence is
valid explicit file path, same source directory, matching SchLib stem, then
global unique match. Exact duplicate PcbLib paths resolve to the retained
representative. Ambiguous tiers block by default. An allowAmbiguousModels
exception attaches all candidates in the selected tier, not an arbitrary first
candidate. Re-review such an exception if the candidate set changes.

All models from exact duplicate symbol instances are unioned. Differing explicit
pin maps for the same resolved model in one symbol variant block consolidation;
use a scoped preservation exception or correct the map after review. Simulation
and other non-PCBLIB implementations currently block generation rather than
being rewritten as footprints.

Without complete part-choice metadata, names are scoped to the source SchLib.
mergeNamelessAcrossLibraries=true is an explicit relaxation for a reviewed
legacy batch. Do not enable it merely to reduce the output component count.

Fallback file (used only by normalize_config.py):

~~~json
{
  "fallbacks": {
    "Data Converters": "Integrated Circuits",
    "Test Points": "Miscellaneous"
  }
}
~~~

This never alters ComponentType in the SchLib or the preferred category rules.
