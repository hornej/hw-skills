# Hardware release checklist

Copy this record into the project for each release. Record **Done / N/A / Open**
with an evidence reference or reason. Keep unresolved applicable checks Open;
record accepted exceptions with their scope, reason and accepting person.

Record design/board and assembly revisions, variant, CAD version, supplier and
selected fabrication/assembly service, quantity, source commit/hashes, output
generation settings, validation reports, reviewer/date and package location.

- [ ] **Build identity:** Exact revision, fitted variants, alternates and build quantity are agreed; supplier requirements are current for the selected service.
- [ ] **Circuit and parts:** Exact MFR/MPN, ratings at actual operating conditions, pin mapping, footprints, substitutions and quantity-dependent sourcing are verified.
- [ ] **Native agreement:** Schematic/PCB connectivity and physical identities agree; native validation results, suppressed checks and intentional exclusions are retained.
- [ ] **Mechanical fit:** Outline, cutouts, holes, component heights, connector mating/orientation, enclosure and assembly access are checked against reliable geometry.
- [ ] **Fabrication:** Stackup, copper, impedance targets, drill spans/slots, via treatment, mask/paste and edge features match the selected process.
- [ ] **Copper and returns:** Final pours, thermal connections, reference continuity and layer-transition returns are checked against the actual circuit. Preserve intentional isolation and keepouts.
- [ ] **Identification:** Board/revision marks, pin 1, polarity, connector functions and test-point labels are correct and remain readable after assembly.
- [ ] **Native checks:** Applicable rules are enabled and scoped to intended objects; final ERC/DRC ran to completion on the release snapshot. Targeted checks and full-board checks are distinguished.
- [ ] **Stable source:** Relevant documents are saved and outputs generated from one recorded snapshot with explicit variants and destinations.
- [ ] **BOM and placement:** Physical references, quantities, parts and fitting states reconcile; coordinate units/origin, sides, rotations and intentional exclusions are verified.
- [ ] **Exported CAM:** Inspect the actual exported copper/layer order, outline, drills, slots, mask, paste and silkscreen for alignment and unintended mirroring.
- [ ] **Supplier interpretation:** Fabrication notes, assembly views, imported parts and supplier DFM/preview match the reviewed configuration. Import success alone is not release readiness.
- [ ] **Package:** Only intended current deliverables are included; archive sources, generation settings, reports and a relative-path/SHA-256 manifest separately from supplier upload contents.
- [ ] **Release:** All applicable checks are completed or explicitly dispositioned, and the exact revision/variant/package issued is recorded.

Subsequent design changes invalidate affected results; rerun checks and regenerate
outputs. Received-board bring-up and bench verification remain separate work.
