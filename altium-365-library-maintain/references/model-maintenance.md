# Maintaining existing symbol and footprint models

## Identity and readable names

Treat component Name, model Name, Item ID, and revision ID separately. Preserve
the managed Item ID when renaming; a metadata revision is not a replacement
item. Match targets by exact Item ID, not source CMP labels or repeated Names.
Refresh the affected revision and references before applying an offline plan.

When readable model Names are requested, use a part/function name for a
dedicated symbol instead of an opaque inherited source label. Shared primitive
symbols need generic names such as Resistor or Capacitor, with meaningful
pinout/geometry qualifiers. Inspect all linked components before assigning a
name: one capacitor symbol can serve hundreds of values. Preserve unique symbol
variants and all component footprint alternatives.

## Documented native rename route

As checked on 2026-09-10, Altium documents this route for saved models:

1. In Explorer, right-click the existing Symbol Item and choose **Edit**.
2. In the temporary editor, use **File > Save to Server** (**Ctrl+Alt+S**).
3. Set **Name** and, if needed, Description in the Create Revision/Edit Revision
   dialog. Save to the existing Item.
4. Review **Update items related to <ItemRevision>**, normally enabled for a
   model referenced by components. This can update related parent items to the
   new model revision; disabling it leaves their existing model revisions.

Saved Item Properties are read-only; editable Properties for a Planned item do
not establish the same behavior for an already saved revision in a Draft
lifecycle state. Verify the route against the current application and affected
items before using it for a batch.

Source: [Altium: Creating & Editing Content](https://www.altium.com/documentation/altium-designer/connected-workspace/items/creating-editing-content).

No spreadsheet-style bulk symbol-Name edit has been verified for this workflow.
Do not promise F2, Explorer-grid paste, batch Component Editor names, or .CmpSync
as model-renaming mechanisms. Prepare an exact before/after list and user steps
when the user prefers operating Altium; avoid computer use while they are busy.
Any proposed API or bulk release route needs verified access, supported schema,
existing-item targeting, revision behavior, and a small readback pilot before
batch execution. Do not create replacement items to simulate a rename.

## Schematic designator fonts

Establish whether the text is on a schematic or PCB; a user may call a schematic
symbol a footprint. For schematic text, distinguish the placed designator,
the linked symbol revision, and placement preferences before changing the model.

In **Preferences > Schematic > Defaults > Designator**, **Override Library
Primitive** can replace the library font when placing a component. Disable it
to respect the symbol, or set the requested font there with the override enabled
if the user wants a placement-wide convention. For an existing placement, select
the designator text and change Font in Properties. Changing defaults does not
retroactively repair placements. Verify with a newly placed instance.
See [Altium's font guidance](https://www.altium.com/documentation/knowledge-base/altium-designer/is-it-possible-to-change-the-default-font-of-symbols).

If the library itself is wrong, edit the exact managed symbol. In its symbol
editor, **Tools > Document Options > Show Comment/Designator** exposes that text
for editing. Set its font, save a revision of the existing model, and review
related component updates. Do not assume all components or already placed
instances now use the revised model. See
[parameter appearance](https://www.altium.com/documentation/knowledge-base/altium-designer/control-component-parameter-appearance-in-schematic).

A font correction should preserve the shared symbol name and footprint unless
the requested change also covers those fields.

## Folder organization and duplicate models

Prepare folder moves using exact model Item IDs and verified destination folders.
Do not infer model IDs from source labels or apply component synchronization to
model folders. Folder moves, renaming, and model consolidation are separate
operations with separate identity and reference checks.

Same-name groups and collision suffix families are duplicate candidates, not
proof. Compare complete model data: pad numbers, geometry on all layers, masks,
pin mappings, and embedded 3D data. Render hashes or equal pad counts alone are
insufficient. Ignore metadata differences only when each excluded field is
understood and recorded. Local staged-file equality does not establish equality
of current managed revisions without a corresponding readback.

Before consolidation, identify a canonical model, record every affected binding,
and assess live Where Used. Repoint intended component revisions, retain every
legitimate alternative, and verify references before considering removal of a
redundant item. A component-grid export cannot establish absence of project or
other historical references. Never delete merely because the export shows zero
current component references. Audit and plan first; model removal needs the
user's applicable authorization, not an inference from a naming request.
