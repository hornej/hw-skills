# BOM and placement evidence

Record the source revision, explicit assembly variant, export method and source
hashes. Inspect original CSVs or the actual selected workbook sheet; a faithful
CSV staging copy retains workbook/sheet provenance. Do not rename XLSX to CSV.

Keep raw column names and values. Map manufacturer, MPN, supplier, supplier SKU,
value, footprint, designator and quantity separately. Flag contradictory aliases
and placeholder/unevaluated fields. Numbered manufacturer/supplier choices are
paired alternatives, not one merged order code. Preserve internal part numbers
as distinct from manufacturer, supplier and CAD revision identities.

Count rows, physical references, complete identities, quantity sum, explicit
not-fitted rows and unresolved rows separately. Expand reference ranges and
check quantities against reference membership. Missing MPNs and unknown fitting
states remain in review coverage; they must not disappear from totals.

Reconcile fitted BOM and placement reference sets with authoritative variant
evidence. Equal counts do not establish equal membership. Explain intentional
exclusions such as hand-fitted parts and fiducials using assembly policy. Verify
units, origin, side, rotation and pin-1 conventions against actual geometry.

Preserve alternate parts, parameter overrides and full channel/instance identity.
Repeated sheets and multi-part symbols cannot be joined solely by a logical
designator or final UID segment. A nearby DNP annotation does not establish
ownership or fitted state.

Report missing metadata, conflicts, duplicate references, quantity differences,
variant leaks, unmatched references and unresolved mapping explicitly. Grouping
nominally equivalent parts identifies candidates; engineering qualification
still requires [component checks](component-review.md).

A parser finishing successfully is not design signoff. Report coverage separately
for native connectivity, variant linkage, live sourcing, electrical suitability
and assembly exclusions. On a recheck, compare the same revision/variant scope
and distinguish fixed, unchanged and newly introduced findings.
