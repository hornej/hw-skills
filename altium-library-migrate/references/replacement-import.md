# Replacing an unused imported batch

Ordinary metadata maintenance updates existing Workspace items. Library Importer
detects duplicates and can exclude them; that does not establish an in-place
update of existing items. A fresh replacement can be useful when the user chooses
it and the imported components are not yet used. Establish intended use from
the session instead of asking again after the user has already answered.

1. Prepare and locally verify the corrected package before proposing removal.
   Keep the earlier import snapshot and logs. Explain that the replacement will
   receive new Workspace identities; it is not a revision update.
2. Reconcile the previous successful import log to the staged source using the
   observed import group/source identity. Build an exact component Item-ID
   whitelist and record counts. Never select by a broad CMP prefix, whole folder,
   current Name, or total Workspace count. Distinguish previously existing
   components from the imported batch even when their Names look alike.
3. If offering range-based selection, expand each range programmatically and
   verify that every included ID exists in the whitelist. Preserve gaps. Provide
   old names, MFR/MPN and group as cross-checks; the selection key is Item ID.
4. Have the user inspect Name/Description and mappings in the new importer
   preview before cleanup. The old batch can cause duplicate warnings here.
   Preserve the current target templates and review <Auto> selections rather
   than assuming a pre-import configuration knows newly created template IDs.
5. Within authorized cleanup, use component soft deletion to Trash. Leave
   **Remove related items** / child-item deletion unchecked when preserving
   symbols, footprints, datasheets and other shared content. Keep unrelated
   components, templates and folders. Do not permanently purge the old batch
   just to perform a replacement.
6. Refresh and Validate after cleanup; do not import on stale Workspace state.
   Shared model geometry, repeated readable names, and deliberate same-MPN
   symbol variants may still produce warnings. Review them without silently
   excluding valid records. Import once, then reconcile the new release log and
   verify representative components, DNPs and multiple-footprint parts.

When the user prefers to operate Altium, deliver a concrete package, exact
cleanup list and steps. Do not take over the UI. File preparation does not
authorize deletion; existing explicit cleanup/import authorization need not be
requested again. Keep project-specific component lists, cached products, binary
libraries and authenticated files in the project, outside the reusable skill.

References:
- [Library Importer duplicate detection](https://www.altium.com/documentation/altium-designer/components-libraries/importing-existing-libraries-workspace)
- [Workspace soft deletion and child items](https://www.altium.com/documentation/altium-designer/connected-workspace/organizing)
