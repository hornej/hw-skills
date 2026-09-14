# Checks that change a component recommendation

Use the checks relevant to the requested family and application. A catalog filter
is an initial screen, not a substitute for the datasheet's conditions and curves.

| Family | Verify before recommending |
| --- | --- |
| Ceramic capacitors | Effective capacitance at DC bias, temperature and aging; voltage margin; dielectric; tolerance; actual dimensions. Nominal capacitance can substantially overstate what the circuit gets. |
| Resistors | Standard rated power at the intended ambient and land pattern; derating; working voltage; pulse energy; tolerance and TCR. Keep extended-power modes distinct from the ordinary rating. |
| MOSFETs | RDS(on) guaranteed at the actual gate drive, SOA at the pulse duration, switching loss/gate charge, thermal path, and package pinout. Threshold voltage does not mean fully on. |
| Power ICs | Recommended input/output ranges, startup and dropout, load transients, stability and external-component requirements, efficiency and thermal conditions. |
| Inductors | Saturation and RMS ratings at the relevant temperature, inductance under bias, DCR, core loss, and shielding. |
| Connectors | Pitch, orientation, keying, mating part, contact count, current per contact with derating, mounting and height. A shared pitch does not establish mating compatibility. |
| Amplifiers and interfaces | Supply range, common-mode/input/output limits, bandwidth at gain, offset/noise, protection, logic thresholds, and termination. |
| Any replacement | Full suffix, electrical pin numbering and function, package drawing, footprint/pad compatibility, exposed pad, height, lifecycle, and qualifications. |

Use the expected operating envelope, not only a nominal value. Show the calculation
when current, losses, derating, or required capacitance determine the result.
Treat unresolved circuit assumptions as conditional recommendations.

For sourcing, compare the required quantity using the actual packaging option.
Inspect minimum order/multiples, price breaks, available inventory, factory lead
time, seller/marketplace status, and any non-cancelable or non-returnable terms
present in the source. Report unknown terms as unknown rather than inferring them
from a successful search. Stock and price are observations at a stated time, not
guarantees of future supply.
