# CircuitHub design and service requirements

Apply when the board's maintained specification selects CircuitHub for the
intended build. Use during part/package selection, stackup and rule setup, layout
review and release. This is supplier guidance, not a default supplier selection
or a completed board audit. Keep board-specific decisions and results with the
project, preserving its requirement IDs.

Sources checked **2026-10-12**: [Board documentation](https://docs.circuithub.com/board),
[ProtoBoard specifications](https://www.circuithub.com/capabilities/protoboard),
[Value Proto](https://docs.circuithub.com/getting-a-quote/value-proto), and
[general design rules](https://www.circuithub.com/capabilities/design-rules).
Reopen the applicable official pages at design/rule setup and release; record
URLs and check date with the project. The general capabilities table is embedded
and may need a browser to read. These dated values are a starting point. Missing
or conflicting current evidence leaves the affected check Open; do not treat an
unloaded table as an empty set of restrictions.

## 1. Establish the manufacturing target

Record in the board specification (using its existing format): supplier;
fabrication profile; order service; revision/variant and quantity; required
stackup/material/copper/thickness/finish; special processes; source URLs/date;
and any explicitly agreed deviations with their evidence.

| Selection | What to apply |
| --- | --- |
| ProtoBoard / prototype fabrication | The ProtoBoard table below plus applicable general board details. |
| Value Proto | ProtoBoard-compatible fabrication **and** all Value Proto build restrictions below. |
| General CircuitHub fabrication | Current capability tables, applicable board articles, chosen stackup and the actual quote. Do not impose ProtoBoard-only limits. |
| Custom fabrication | Explicitly agreed, quoted requirements for the identified build; verify any departure from published capability. A request awaiting review is not acceptance. |
| CircuitHub only, or ambiguous "proto spec" | Clarify the intended profile/service. Check common requirements now; leave profile-dependent eligibility Open. |

Record the order option separately. [Priority, Standard and Flexible](https://docs.circuithub.com/getting-a-quote/quote-service-options)
describe quotation/scheduling choices; Value Proto is a special Priority offering.
The word "Standard" in a quote does not select a universal PCB rule set. Availability
and dates come from the current quote; a promotion or advertised assembly duration
does not establish delivery timing for this build.

## 2. ProtoBoard fabrication profile

Snapshot of the [ProtoBoard specification table](https://www.circuithub.com/capabilities/protoboard):

| Property | Requirement |
| --- | --- |
| Build quantity | 1-10 units |
| Board envelope | At most 380 x 380 mm |
| Copper layer count | 1-4 inclusive |
| Board thickness | 1.6 mm |
| Copper weight | 1 oz |
| Material | Standard FR4 |
| Finish | ENIG |
| Solder mask / silkscreen | Black / white |
| Trace width and gap | Each at least 0.127 mm (5 mil) |
| Minimum drill size | 0.15 mm |
| Impedance control | Not included/allowed in this profile |
| Custom requirements or custom stackup | Not allowed |
| Via fill and cap; via plugging | Not allowed |
| Blind or buried vias | Not allowed |

Check the selected standard stackup, every copper layer and all drill spans.
Do not infer manufacturing tolerances from nominal thickness/copper values.
Retain the supplier's distinction between drill size and finished plated hole;
resolve any ambiguity before translating values into Altium rules.

If the circuit requires controlled impedance, a different stackup, filled vias
or another excluded feature, report a conflict with this profile. Preserve the
engineering requirement and record the chosen design or service change. Do not
remove impedance control or substitute general capabilities to claim ProtoBoard
compliance.

## 3. Value Proto build restrictions

In addition to ProtoBoard-compatible fabrication, verify the intended build has:

- At most ten boards.
- No fitted through-hole or hybrid SMT/through-hole parts. Include fitted parts
  classified as Mechanical; Cosmetic features are excluded from that check.
- No fitted 0201 or 01005 packages, including approved substitutes in those sizes.
  Resolve package naming against physical dimensions/MPN; do not conflate metric
  and imperial package codes.
- No consigned parts; CircuitHub purchases the build's parts.

Apply these checks to every fitted reference and approved alternate in the
actual assembly variant. Treat fit state, package, mounting type and sourcing as
separate evidence. Any proposed DNP or replacement must preserve the intended
prototype's function and be recorded as a design/build decision. General service
support for through-hole or small packages does not qualify them for Value Proto.
Unmatched/unpurchasable parts and quantity shortages still prevent a valid quote.
Confirm an actual orderable offer for this configuration.
[Source: Value Proto](https://docs.circuithub.com/getting-a-quote/value-proto).

## 4. General fabrication and quoting

The [live capability tables](https://www.circuithub.com/capabilities/design-rules)
describe automatic versus custom quoting, not a guarantee that a smaller feature
is impossible or that any combination is eligible for ProtoBoard/Value Proto.
Record the applicable row rather than inventing a single global minimum.

| Dependency to check | Published quoting guidance, checked 2026-10-12 |
| --- | --- |
| Layers | 1-10: automatic quote; 11+: custom quote. |
| Copper weight | 0.5/1/2 oz: standard stackups; 3 oz: nonstandard, automatic quote; other weights: custom quote. |
| Trace/gap at 1 oz | 0.075-0.124 mm: automatic quote; 0.074 mm or less: custom quote for any weight. |
| Trace/gap with heavier copper | 0.075-0.124 mm at >1 oz: custom; 0.125-0.149 mm at 2 oz: custom; 0.15-0.20 mm at 2 oz: automatic. |
| Minimum drill 0.08 mm or less | Custom quote at any board thickness. |
| Minimum drill 0.081-0.15 mm | Automatic through 1.6 mm board thickness; custom above it. |
| Minimum drill 0.151-0.20 mm | Automatic through 2.0 mm thickness; custom above it. |
| Minimum drill 0.201 mm or greater | Automatic through 2.4 mm thickness; custom above it. |
| Special processes | Check current options for cutouts, via fill/in-pad, castellations, blind/buried vias, panelization and impedance. Custom stackups, HDI and rigid-flex require custom review. |

Unlisted combinations or gaps between displayed ranges need the actual quote or
clarification, not interpolation. For dimensions, automatic quoting supports
500 x 380 mm; up to 1040 x 380 mm requires manual review when the longer side
exceeds 500 mm. Both dimensions must fit the envelope, allowing rotation.
[Board dimension limits](https://docs.circuithub.com/board/maximum-allowed-board-dimensions).

The live capability table also lists dimensional tolerances of +/-0.1 mm for
0-300 mm and +/-0.15 mm for 301-1040 mm. Compare these with enclosure/mating
requirements; resolve dimensions outside the explicitly listed ranges and any
tighter tolerance in the quote instead of assuming acceptance.

For general prototype assembly, separately review
[cost and lead-time triggers](https://docs.circuithub.com/getting-a-quote/cost-and-lead-time-triggers-for-prototypes):
board dimensions up to 400 mm, 0201 limits (five BOM lines / 200 placements),
through-hole limits (500 placements / 50 unique MPNs per order), and firmware
programming can affect the production route. These are routing/cost constraints;
they do not relax Value Proto's stricter exclusions. Use the current quote to
resolve applicability and counting scope.

## 5. Board details and supplier configuration

Apply these to the selected process; a general capability does not override a
more restrictive service. Preserve source units and distinguish limits from
recommendations and CAM behavior.

| Check | Guidance and source |
| --- | --- |
| Mask dam | Minimum 4 mil (supplier also gives rounded 0.1 mm). Check actual openings and remaining dams. [Minimum dam](https://docs.circuithub.com/board/minimum-solder-mask-dam-sliver). |
| Mask expansion | Recommended minimum 2 mil on copper pads, with 4 mil slivers. Review deliberate deviations separately from hard violations. [Expansion](https://docs.circuithub.com/board/solder-mask-expansion). |
| Drill-to-drill | Minimum 0.25 mm hole-to-hole clearance for vias/plated holes. Check edge clearance, not center pitch alone. [Drill clearance](https://docs.circuithub.com/board/minimum-hole-to-hole-drill-clearance). |
| Plated slots | At least 0.4 mm plated slot width; annular ring at least 0.1 mm, with 0.15 mm recommended. Do not substitute the recommended ring for the published minimum. [Slot requirements](https://docs.circuithub.com/board/specs-for-slotted-through-hole-pads). |
| Silkscreen | CAM clips silk to 2 mil (rounded 0.05 mm) from mask clearances. Check resulting legibility/polarity marks. [Silkscreen clipping](https://docs.circuithub.com/board/silkscreen-to-solder-mask-limitation). |
| Stackup | Verify exact selected standard stackup. Specify custom layer order, copper, materials, dielectric separations and overall thickness in Board settings; exact required material must be explicit. Custom selection overrides default material/thickness/copper fields. [Stackups](https://docs.circuithub.com/board/stackups), [current choices](https://www.circuithub.com/capabilities/pcb-stackups). |
| Controlled impedance, if required | Specify layers, single-ended/differential mode, transmission-line type, identifying width/pair gap, target and tolerance in Board settings; state coupon needs. The article lists +/-8% as the tightest supported tolerance; verify the offered tolerance. A standard stackup alone is not an impedance-control order. [Impedance](https://docs.circuithub.com/board/specifying-impedance-control). |
| Via treatment, if required | Select fill in Board settings: documented standard fill is nonconductive resin with a plated-flat surface. Conductive fill needs custom requirements/manual quote. [Via in pad](https://docs.circuithub.com/board/via-in-pad). |
| Other process features | Follow the applicable [Board articles](https://docs.circuithub.com/board) for finish, blind/buried layer sets, cutouts, substrate, panelization, UL marks and flex. Capture the actual selected options and any limits in the project record. |

The [slot viewer guidance](https://docs.circuithub.com/managing-projects/board-slots)
warns slots may display as round holes. Check native geometry/drill data and
explicit fabrication instructions; resolve uncertainty with supplier evidence.
Use fabrication custom requirements for board processes and the separate assembly
instructions for assembly work. Disagreement between documentation, capability
tables and quote settings stays Open until reconciled for the intended build.

## 6. Verify and record the result

1. **Design:** Compare board requirements and fitted parts to the chosen profile
   before committing to packages, stackup and routing geometry. Keep stricter
   electrical/mechanical requirements; do not silently relax either requirement.
2. **Rules and geometry:** Inspect the saved PCB's actual widths, clearances,
   drills/slots, annular rings, masks, outline and stackup. Map applicable checks
   to Altium constraints with correct queries, priorities and Batch coverage;
   manually review constraints not covered by native DRC. A saved rule value
   alone does not establish compliant geometry. Follow
   [PCB rule verification](pcb-rules-xsignals.md) for authorized rule changes.
3. **Release:** Tie native DRC, BOM/variant evidence, generated files, supplier
   Board settings, CAM/DFM disposition and quoted service/quantity to the same
   revision. Follow [CircuitHub output/import checks](outputjobs-manufacturing-files.md#circuithub).
   Recheck affected eligibility after quantity, sourcing, fitting, approved
   substitute, stackup, service or geometry changes.

Keep a compact comparison in the project's review record:

| Requirement/source/date | Selected profile and required value | Actual value/object or setting | Evidence/revision | Result/action |
| --- | --- | --- | --- | --- |

Use **Pass / Fail / Open / N/A**, with a reason for N/A. Separate hard profile
violations, recommendations, quote triggers and unverified checks. Identify the
affected object/designator/setting, correction or pending decision, and retained
supplier acceptance for an exception. A local waiver alone does not make a build
eligible for a supplier service. Map failures/unverified checks to Open on the
[release checklist](pcb-release-checklist.md); close only with relevant evidence.
Keep native DRC, supplier eligibility and engineering qualification distinct.
