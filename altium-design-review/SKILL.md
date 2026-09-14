---
name: altium-design-review
description: Review Altium BOMs for consolidation and sourcing, check proposed parts against schematic roles, and reconcile saved assembly variants with BOM and pick-and-place exports. Use for design reviews, specific replacement questions, and rechecks after a new export.
---

# Altium design review

Turn the current design evidence into specific, traceable actions: affected
designators, present and proposed MFR/MPN, the reason, and what is still unverified.
Default to review. Apply edits when requested; preserve unrelated changes and
verify saved sources and regenerated outputs before saying a change is complete.

## Establish the review scope

- Resolve the exact `.PrjPCB`, board revision, assembly variant, BOM, and applicable
  PCB/PnP/OutJob. Follow project membership and reachable sheets rather than a
  recursive scan of every SchDoc or the newest CSV anywhere in a directory.
- For "check again", reread and hash the current exports. Record full input paths,
  export variant, modification time and SHA-256. Timestamps suggest freshness;
  they do not establish which saved design produced an export. Flag absent,
  ambiguous or stale inputs and unsaved Altium changes when observable.
- Read local design requirements and preserve the user's chosen standards,
  supplier constraints, build quantity, and fabrication status. A preference from
  one design is not a global preferred MPN or manufacturer.
- Review the requested scope. A focused resistor question does not require a full
  board audit; "all parts available" requires every in-scope orderable MPN.

## BOM and procurement

Use [the export workflow](references/export-audit.md) for the bundled read-only
`scripts/audit_exports.py`. It detects metadata gaps/conflicts, duplicate identity
rows, nominal-value candidates, variant DNP leaks, BOM/PnP differences and changes
since a previous report. It does not qualify replacements or check live stock.

- Count BOM rows, unique MFR+MPN identities, physical references, quantity sum,
  explicit not-fitted rows and unresolved rows separately. Do not discard rows
  without an MPN. Reconcile quantity with expanded designators before totals.
- Interpret MFR/Manufacturer/MFG, MPN/Manufacturer Part Number, Supplier and
  SPN/Supplier Part Number as aliases for analysis. Preserve raw fields and flag
  contradictory aliases. Keep manufacturer choices and each Supplier/SPN pair
  coherent; numbered choices are alternatives, not a comma-separated order code.
- Detect embedded `[NoParam]`, unresolved `=Parameter` expressions, incomplete
  module suffixes, and incorrect supplier SKUs. Manufacturer MPN and distributor
  SKU are distinct identities. Preserve meaningful punctuation, package suffixes,
  tolerance/temperature grades and packaging codes unless equivalence is sourced.
- Group candidates beyond identical footprint strings: verified library aliases
  and equivalent value notation can reveal missed splits. Same value/package,
  similar part names, or a distributor cross-reference are only candidate evidence.
- Classify each finding as metadata-only, qualified consolidation, conditional
  substitution, intentional split, or unresolved. Keep the reason for intentional
  differences. A unique MPN per row does not mean consolidation is finished.
- Before recommending a substitute, use [the component review criteria](references/component-review.md)
  and trace the actual circuit role. Choose a specific part only when the evidence
  supports it, and distinguish PCB compatibility from electrical qualification.
- Check exact MPN and supplier packaging against current distributor pages and
  lifecycle against manufacturer evidence. Record checked date, URL, stock,
  minimum/order multiple and lead time when material. Compare stock with required
  quantity plus the user's assembly allowance. A search snippet is provisional;
  inaccessible evidence means unverified, not available. Without build quantity,
  report stock counts rather than asserting sufficiency. Do not reuse historical
  stock or price as current. Provide checked/total coverage for a full availability audit.

## Schematic and assembly variants

Read [the schematic/variant workflow](references/schematic-variants.md) for a
variant audit or when a proposed part depends on circuit topology. The optional
`scripts/native_inventory.py` exposes saved SchDoc/PCB evidence through an existing
Altium Monkey installation without saving any design file.

- Follow physical reference, source document and complete unique-ID/channel path.
  Multi-part symbols and repeated sheets are not duplicate physical components.
  An ambiguous mapping remains unresolved; never join repeated channels solely
  by the final UID segment or a logical designator.
- Treat schematic DNP text, saved variant fitting state, variant alternate parts
  and parameter overrides, BOM contents, and PnP contents as distinct evidence.
  A nearby label or net name does not prove ownership, connectivity or fit state.
- Resolve expected BOM/PnP exclusions from assembly policy (for example hand-fitted
  through-hole parts or fiducials). Compare reference sets, not just equal counts.
- Review how each relevant variant changes pull-ups, defaults, power paths,
  termination, boot straps and interfaces. An unpopulated resistor can change the
  behavior even when its own part number is valid. Trace pins/nets and consult
  exact device datasheets; render ambiguous regions when useful.
- Report native compile/ERC/DRC results only when actually run or current exports
  were inspected. Parsing files or passing export checks is not full design signoff.

## Recheck and handoff

Lead with remaining actionable items. Give exact designators and MPN changes,
metadata fields to correct, sourcing evidence and unresolved engineering checks.
For a new export, distinguish fixed, still open and newly introduced items.
Include compact scope/coverage so partial evidence cannot read as a complete audit.

After an authorized correction, check the source/library or variant used by the
design, then regenerated BOM/PnP where applicable. State what changed and verify
expected quantities, reference membership and remaining groups. Purchasing
consolidation need not change a routed PCB footprint; identical nominal package
names also do not establish pad compatibility. Do not force BOM row merging by
erasing useful footprint or assembly distinctions.

This skill is portable across Altium projects. Library migration and Altium 365
metadata publication remain separate workflows; if those skills are installed,
use them only when that additional operation is requested. A design-review request
does not authorize workspace import/release or a repository push.
