# Component decisions

Apply only the checks relevant to the component and circuit. Use manufacturer
datasheets for technical claims and current authorized distributor pages for
availability. Cite exact parts, not a family-level qualification badge. When
sources disagree, retain the conflict until resolved rather than choosing the
more favorable rating.

| Part family | Evidence needed for consolidation |
| --- | --- |
| Resistor | Resistance, tolerance, package/pads, working voltage, power with temperature derating, pulse/surge behavior, temperature coefficient, qualification, and role (divider, sense, termination, gate/series resistor, strap). A tighter tolerance alone does not replace a pulse rating. |
| Zero-ohm jumper | Package/pads, maximum resistance, rated current with derating and overload **test** current. Do not treat overload current as continuous capacity or assume every zero-ohm link is a signal. Check power, ground, VCONN and configuration paths. |
| Ceramic capacitor | Capacitance/tolerance, package, rated voltage and actual bias, dielectric, DC-bias effective capacitance, temperature range, ESR/ESL where relevant. A smaller or higher-voltage part may have different effective capacitance. Preserve intentional rail/placement-specific differences. |
| Inductor/ferrite | Inductance or impedance at relevant frequency, saturation and RMS current, DCR, thermal rise, core loss, shielding, dimensions and recommended converter behavior. |
| Diode/MOSFET/protection | Pin function and orientation, footprint, ratings at actual operating conditions, leakage, capacitance, recovery or clamp behavior, drive requirements and thermal path. |
| IC/module/memory | Exact functional variant, pin/ball map including NC/reserved pins, rails, absolute/operating limits, logic levels, timing, straps, firmware/configuration, package/thermal pad, temperature grade, lifecycle and required production tests. A package match does not prove a drop-in replacement. |
| Connector/mechanical | Pitch and land pattern, mating compatibility, pin numbering/orientation, current/voltage, retention/height, assembly method and clearance. |

For a named reference, locate the exact instance and variant first. Follow both
ends and relevant neighboring circuitry. Text near a resistor is a navigation aid,
not a netlist. Calculate voltage/current/power margins when needed; label assumptions.

## TVS polarity and replacements

Resolve symbol/MPN disagreements from the exact manufacturer datasheet and traced
pin connections. TVS directionality concerns signal voltage relative to its
return, not the direction of data flow. For signals that normally stay above
ground, unidirectional protection can provide lower negative clamping; signals
that legitimately go below ground need a protection window that accommodates it.
Both types can protect against transients of either polarity.

Check maximum normal voltage, reverse working voltage, breakdown, clamp voltage
at the relevant pulse/current, capacitance, leakage, and protected-device limits.
Working voltage is not clamp voltage. A unidirectional suffix or matching package
does not prove a drop-in replacement: verify cathode/anode mapping, land pattern,
signal loading, and the protection path, including any series impedance. For the
general polarity distinction, see [TI's GPIO ESD guidance](https://www.ti.com/document-viewer/lit/html/SLVAFQ4/GUID-E87DB142-562D-408B-802B-30488CFE68C5).

## Decision record

Use a compact decision record when several substitutions are being tracked:

- source MFR/MPN, proposed MFR/MPN, affected physical references and variants;
- circuit role, required limits, evidence URLs and values compared;
- footprint/pin compatibility and any board/firmware changes;
- decision: metadata-only / qualified consolidation / conditional substitution /
  intentional split / unresolved; outstanding tests or missing evidence;
- preferred supplier/SKU, date and quantity actually checked.

Respect an approved project standard when it meets the requirements. Do not encode
one project's manufacturer or supplier choice as a universal default in this
skill.
