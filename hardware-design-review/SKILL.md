---
name: hardware-design-review
description: Review hardware component suitability, BOM and placement evidence, grounding and board interfaces, and fabrication or assembly release readiness across CAD tools. Use for portable engineering review; use the relevant CAD skill for native file parsing, edits, compilation and output generation.
---

# Hardware design review

Turn supplied design evidence into specific findings: affected physical
references and variants, the requirement, observed evidence, and unresolved
checks. Select only checks relevant to the requested review. Keep project limits,
supplier choices and completed reviews with the project.

- Establish the design revision, assembly variant, build quantity and intended
  fabrication/assembly service. Record input paths, hashes and observation time;
  do not infer export provenance or current stock from filenames or timestamps.
- For component replacements or consolidation, use
  [component decisions](references/component-review.md). Trace the actual circuit
  role and exact package/pin mapping; distinguish guaranteed ratings from typical
  values and absolute maxima. Nominal value/package equality is candidate evidence.
- For BOM and placement exports, use [export review](references/export-review.md).
  Preserve raw fields, ambiguous identities and coverage gaps. A saved native
  variant, fitted export row and nearby DNP text are separate evidence.
- For grounding, cables, daughterboards and mating interfaces, use
  [grounding and interface checks](references/pcb-grounding-interfaces.md).
- For fabrication or assembly handoff, use the
  [release checklist](references/release-checklist.md). Record Done, N/A or Open
  with evidence; an unknown or unexecuted check cannot become a pass.

Use the project's available CAD tools to obtain native connectivity, compilation,
DRC and geometry evidence. State what was actually run and which source snapshot
it covers. Native generation and mutation belong to that CAD workflow. This skill
can review supplied evidence without requiring a particular CAD installation.

For live procurement checks, use the installed `part-sourcing` or
`digikey-part-selection` companion when available. Manufacturer datasheets govern
technical suitability; preserve exact MFR/MPN and supplier packaging. Origin
declarations and manufacturing stages remain separate from availability.

Lead the result with actionable findings and remaining decisions. Distinguish
metadata corrections, qualified substitutions, conditional changes and intentional
differences. After authorized edits, recheck the source and regenerated outputs;
retain unresolved identity or physical/bench checks explicitly.
