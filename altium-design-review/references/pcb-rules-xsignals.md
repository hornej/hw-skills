# PCB rules and xSignals

Use this workflow for routing-constraint review or an authorized rule update.
Keep endpoint maps, numerical limits and generated rule packages with the design;
the examples here are synthetic. The bundled inventory and BOM helpers do not
generate rule packages or run native Altium DRC.

## Establish the baseline

Identify the target PCB, saved revision/hash, assembly variant and installed
Altium version. Inspect the existing rules and their priorities, enabled state,
queries, classes, differential pairs and impedance profiles. Resolve any unsaved
work and saves made after the baseline before preparing an import.

For a cross-board comparison, map the actual pads, nets, fitted endpoints and
stackup. Recalculate impedance geometry using the target stackup; another
board's trace widths, profile identifiers and connector choices are not a
transferable rule set. Keep mandatory corrections, optional improvements and
deferred work distinct in the board-specific findings.

## Prepare and import a rule change

For an authorized update, preserve a full saved PCB backup and its current rule
export. Describe the proposed edits/removals, expected counts, priorities and
board objects that must exist first. Keep unrelated rules intact. If generating
`.RUL` text, validate round-trip field preservation and resolvable references;
parsing success still leaves native import and query evaluation unverified.

Label every import as one of these:

| Package | Intended import behavior |
| --- | --- |
| Complete replacement | Replace the entire explicitly covered scope, including intended removals. Confirm the package contains every rule that must survive in that scope. |
| Partial overlay | Add or replace only the named rules. Preserve all other rules of those types or sets. |

In the classic Rules and Constraints Editor, the clear-existing-rules prompt
applies to selected rule types: clear only for a complete replacement of those
types; decline for an overlay. Resolve same-name conflicts deliberately and
verify the result. Newer rule-set dialogs offer **Add and replace matching
rules** for overlays and **Replace all** for complete sets; adding without
replacement can create suffixed duplicates. Confirm the destination set and
actual dialog semantics instead of applying a version-independent click recipe.
See [Altium's rule import documentation](https://www.altium.com/documentation/altium-designer/pcb/defining-scoping-managing-design-rules).

A rule file does not create xSignal paths, object classes or impedance profiles.
An endpoint CSV is a checklist, not a native xSignal import. List these setup
steps separately; leave new rules with unresolved dependencies disabled and
explicitly pending, without disabling existing protection to make DRC pass.

## Map and create complete paths

Record each intended path's start/end component-pad names, both endpoint nets,
series parts, required class and applicable constraint. For example, a synthetic
path might run `U1-3 -> C1-1/C1-2 -> J1-1`, from `TX_P` to `TX_AC_P`.
Use the actual assembly endpoint; an alternative unpopulated connector or a
capacitor pad may truncate the channel being checked.

For a single path, deselect existing objects, then use PCB Filter with **Select**
enabled. Replace this example with verified pad names:

```text
IsPad And ((Name = 'U1-3') Or (Name = 'J1-1'))
```

For pads, [`Name`](https://www.altium.com/documentation/altium-designer/pcb/query-functions/fields)
uses the component designator and pad designator together, separated by a hyphen.
Confirm exactly the intended two pads are selected. Right-click a selected pad
and use **xSignals > Create xSignal from Selected Pins**. Select endpoints only,
not intervening capacitor pads or tracks; inspect the resulting highlighted path
across any series component. Rename it in the PCB panel's xSignals mode. Clear
selection before the next path and check for existing objects before recreating.
See [Altium's xSignal creation workflow](https://www.altium.com/documentation/altium-designer/pcb/high-speed-design/xsignals/creating).

If using the component/net wizard, supply net names as well as pad numbers.
Inspect proposed routes and series-component crossings; avoid generating extra
matching rules when suitable rules already exist.

## Verify scope, then DRC

Create or reconcile the required xSignal classes and exact membership. Check
that each class-scoped rule evaluates the intended complete paths. A net-segment
match and an end-to-end path match answer different questions. Distinguish
within-pair skew from matching between channels, and preserve relevant segment
checks. Altium documents these modes in its
[xSignal rule support](https://www.altium.com/documentation/altium-designer/pcb/high-speed-design/xsignals/design-rule-support).

After an authorized import/setup, save and read back rule names, counts,
priorities, enabled states, queries, path primitives and class membership. Repour
polygons when applicable, run the affected checks, and run the full board DRC
when assessing board or release readiness. Record report time and saved source
identity so a pre-change report cannot validate the change.

Report separately: package/file validation, native import and saved readback,
targeted DRC results, overall DRC results (or not run), and remaining electrical
or fabrication checks. Zero targeted violations is not full-board signoff; a
PCB-only path also excludes external wiring and other boards unless explicitly
modeled. Restoring a rule export restores rules only; a full PCB restore can
also revert later layout work and requires reconciling those changes.
