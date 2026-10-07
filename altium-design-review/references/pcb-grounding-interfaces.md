# Grounding and attached-board interfaces

Use for a focused ground review or electrical compatibility across a connector,
cable, daughterboard or host board. Resolve both saved designs and applicable
assembly variants before concluding that their interfaces match.
Select the checks relevant to that interface; do not assume a particular bus,
connector family, indicator circuit or ground architecture.

## Ground and reference paths

Inspect the poured copper on each relevant layer, not just polygon names or
declared net assignments. Identify the reference beneath each critical route,
any plane splits or voids, and the physical connections from connector ground
contacts and capacitor returns into that reference. Count nearby same-net vias
and plated through-hole connections; surface-mount shield/retention pads do not
connect layers by themselves. One distant ground via may establish DC continuity
without providing a useful local high-frequency return.

Separate system ground, chassis/shield ground and any isolated domains according
to circuit intent. Trace their deliberate coupling components and enclosure
bonds. Do not solve a reference-plane problem by automatically shorting ground
domains or filling a transformer/antenna keepout. Use the actual device and
connector construction to determine voids and isolation boundaries.

A same-layer clearance rule does not establish separation across the stack.
Inspect overlapping copper on other layers, capacitor pads spanning a boundary,
and long chassis connections over system ground. Check object-specific clearance
overrides as well as the headline gap. Distinguish a layout improvement from a
confirmed electrical defect or a demonstrated ESD/EMC result.

Use the actual interface and device requirements for impedance, symmetry,
termination, isolation and reference-plane treatment. For transformer-coupled
interfaces, distinguish the circuitry on each side and verify the manufacturer's
copper keepouts. Do not transfer another interface's numerical limits or ground
architecture without qualification.

## Mating connector and cable mapping

Build an explicit pin table from host IC pad through host connector, assembled
cable conductor, daughterboard connector and destination pad. Check polarity,
ground and power contacts, shield pins, unused contacts and fitted variants.
Use physical connected-pin sets to compare schematic and PCB; similar labels
do not prove connectivity, and renamed/swapped net labels do not by themselves
prove a physical wiring error.

For FFC/FPC connectors, verify pitch, conductor count, contact side, cable
thickness and the installed orientation. A cable Type A/Type B label alone is
not proof of the end-to-end pin numbering. State the required continuity map
explicitly, such as pin n to pin n or pin n to pin N+1-n (N is the contact count),
only after deriving it from the two boards. These are examples, not a required
reversal. Separate a compatible required mapping from evidence that
the selected or assembled cable actually implements it.

Board trace lengths exclude the cable and the mating board unless those are
modeled. Report which channel segments an impedance/skew check covers; equal
net names across separate files do not create a verified end-to-end constraint.

## Indicators and multifunction I/O

When indicators are present, trace the actual driver pin through the indicator
and current-limiting circuit. Check supply voltage, source/sink capability,
push-pull versus open-drain behavior, polarity, and resistor value against the
selected parts. Common-anode, common-cathode and other arrangements require
different drive behavior; derive compatibility from the circuit.

For any pin shared with a boot strap or alternate function, check fitted bias
resistors, reset sampling, startup state and operating pin configuration. Review
loading during both configuration and normal operation. Do not change a bias
resistor to improve one function without checking the pin's other roles.

Distinguish electrical compatibility from intended behavior. Signal names do
not establish which physical output or firmware-selected function is used.
Verify the exact pin, default configuration and relevant control settings. If
firmware or register readback is unavailable, leave configured behavior
unverified even when the electrical circuit is compatible. Indicator visibility,
cable continuity and interface operation remain physical checks where relevant.
