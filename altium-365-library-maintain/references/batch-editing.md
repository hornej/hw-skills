# Batch editing existing Workspace components

This is a component workflow. Editing a component's Name does not rename its
managed symbol or footprint. For those, use [model maintenance](model-maintenance.md);
do not extrapolate component-grid paste behavior to model metadata.

Use this route for native metadata changes when synchronization behavior is
unproven, especially when changing Name. Match records using live Workspace
Item IDs; do not use a Name that is itself about to change as the update key.
Confirm the active Workspace, including when multiple Altium windows are open.

Selecting multiple existing components in Components or Explorer and choosing
Edit opens the batch Component Editor. Show Item ID, Name, Comment, Description,
MFR/MPN and the requested fields. For a user-operated session, have the user
copy those cells to a spreadsheet if offline transformation is needed. Join by
Item ID and preserve the live row order in the returned paste columns; a prior
source order is not sufficient.

When the user wants Name to equal an already normalized Comment, copy the
Comment cells directly into the corresponding Name cells. First verify the
Comment values actually exist and are suitable. Name and Description also
support [ParameterName] expressions, but inspect the rendered result before
applying an expression broadly. A short Comment does not create a detailed
catalog Description.

Use ordinary Ctrl+C / Ctrl+V for data cells. Ctrl+Shift+C / Ctrl+Shift+V copies
entire component definitions and can add or overwrite records. Typing one value
with multiple cells selected fills all selected cells with that same value;
use a multirow paste for per-component names or descriptions. Keep sorting and
filtering unchanged between copying and pasting, and verify IDs at the batch
boundaries.

Do not assume Excel-style expansion from a single destination cell; only the
first row may paste. Try a small, equal-sized source and destination range and
verify the actual result before extending the operation.
Exit text-edit mode, select data cells rather than headers, and check several
distinct values before scaling up. If the trial fails, stop repeating the full
paste; preserve/export the data and use a verified transfer route.

Show Release Status: existing components should normally target Create Revision,
with the existing Item ID retained. Do not use Clear Link To Target Item, which
turns the operation into creating a new item. Save using File > Save to Server,
inspect validation and release results, then refresh/read back a representative
sample before extending an unproven paste workflow. Preserve models, footprints,
Part Choices, lifecycle behavior and out-of-scope fields.

For Source cleanup, clearing a cell value differs from removing the parameter.
Template parameters may be read-only or required; inspect the actual ownership
and validation requirement rather than trying a wider deletion or template edit.
The Show checkbox only hides a column. Remove deletes a parameter definition
from the editing scope; template-owned fields need a template change. See
[templates](templates.md).

## Manufacturer aliases and Part Choices

When the requested schema uses ordinary parameters named MFR and MPN, the Part
Choice Migration dialog does not rename legacy parameters to those names:

- Copy to Part Choice creates choices and keeps the detected source parameters.
- Move to Part Choice creates choices and removes the detected source parameters.
- Skip leaves parameters and choices unchanged.

Compare each numbered manufacturer/part-number pair with MFR/MPN and existing
Part Choices by Item ID before removing anything. Manufacturer 1 can contain a
different approved alternative, not just an alias of the primary manufacturer.
Fill missing canonical values from a verified primary pair; resolve conflicting
nonempty values rather than overwriting them. Preserve intended alternatives as
Part Choices, then remove redundant legacy parameters in the requested scope.
Do not choose Move as a shortcut to populate MFR/MPN, and do not treat canonical
parameters alone as proof that managed Part Choices exist.

## Consolidating package fields

If the project chooses Case (Imperial) as its canonical resistor package field,
store it as Text to retain leading zeros. Compare Case Code (Imperial), Case/Package,
and any existing canonical value. Fill blank canonical cells from compatible
source values and flag disagreements; a column rename is not a merge.

Normalize a verified resistor code such as R0402 to 0402. Do not apply that
conversion to unrelated families or convert package names such as SOT-23 into
an imperial case code. Keep the old columns until all intended values have been
checked. Other useful parameters remain unless their removal was requested.

[Altium batch editor documentation](https://www.altium.com/documentation/altium-designer/components-libraries/batch-component-editing)
