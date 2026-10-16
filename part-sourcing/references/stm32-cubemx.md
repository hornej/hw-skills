# STM32 screening with the CubeMX database

Default to ST's public GitHub pin database to narrow candidates by package and
simultaneous interfaces before distributor lookups, with local CubeMX data as a
fallback or supplement. This is read-only technical screening. It does not
establish price, stock, manufacturing origin, or a working hardware/firmware
configuration.

## Choose and identify the source

- Start with ST's
  [STM32_open_pin_data](https://github.com/STMicroelectronics/STM32_open_pin_data).
  Unless the user requests a particular revision, resolve the current upstream
  default-branch commit when beginning a new screening run. Fetch the required
  files from that commit, or use a cache verified against it. Record the commit
  SHA, retrieval date and source paths so one analysis uses a consistent snapshot.
- ST describes the repository as a subset of the CubeMX internal database.
  Check that it covers the exact device/package and required metadata; GitHub
  publication alone does not prove it is newer or more complete than an updated
  local installation. Use local CubeMX or current datasheets for missing coverage,
  offline work, or a verified newer source. Identify that fallback and any source
  disagreements; do not silently combine files from different revisions.
- When using local data, resolve the actual installation, including per-user installs. A Windows
  location observed on 2026-10-15 is
  `%LOCALAPPDATA%\Programs\STM32CubeMX\db\mcu`; do not assume Program Files.
  An installed application's path or Windows uninstall registration can help
  locate it. Verify `families.xml` and the relevant MCU XML files exist.
- Record the local database path, inspected MCU/GPIO filenames, inspection date, and
  available application/database release identifiers. XML `DBVersion="V3.0"`
  is a schema identifier, not sufficient evidence of the CubeMX release. Hashes
  of the files actually used make a batch analysis reproducible.
- If the upstream revision cannot be checked, label cached data with its actual
  revision/date and leave freshness unverified. Missing files or fields remain
  unresolved. Do not edit the installed database or copy the vendor database into
  this skill; keep fetched snapshots in a task/cache location outside the repository.

## Map the exact ordering code

Keep the original manufacturer/MPN and input row identity. Use `families.xml`
entries (`RPN`, `Name`, `RefName`, `PackageName`) and the device XML's `RefName`
and `Package` to identify the model, then check the manufacturer ordering table.
Models may group memory sizes in parentheses and use `x` for a temperature grade.

For example, the inspected model `STM32U3B5CITx.xml` represents an LQFP48 device;
`STM32U3B5CITxQ.xml` is a separate model. Preserve package, memory, power-option
and other functional suffix distinctions. Remove a packing suffix such as `TR`
only when its meaning is established. Do not drop unfamiliar suffixes or choose
the first fuzzy match. Ambiguous or missing mappings stay unresolved.

## Read package signals and alternate functions

Use a namespace-aware XML parser; the inspected files use
`http://mcd.rou.st.com/modules.php?name=mcu`.

| Source | Use |
| --- | --- |
| Device `IP` entries | Available `InstanceName` values, with their IP type and version. Do not assume a family-wide peripheral exists in this model. |
| Device `Pin` entries | Physical package `Position`, GPIO `Name`, type and restrictions. |
| `Pin/Signal` entries | Signals actually offered on that package pad. A signal in a family GPIO table alone does not establish package availability. |
| Device GPIO IP `Version` and matching `IP/GPIO-<Version>_Modes.xml` | GPIO `PinSignal` entries and `SpecificParameter Name="GPIO_AF"` values for the proposed functions. Verify the referenced file exists. |

Intersect instance availability, package bonding and applicable function mappings.
Account for dedicated functions that have no numbered GPIO AF. Retain remap,
security, power-domain and option-byte restrictions rather than flattening them
into unconditional pin choices. GPIO labels may include aliases or annotations;
use the physical pad position to detect collisions.

## Check simultaneous use

Build the allocation from the current task's requirements, not a fixed UART count.
For each UART/USART/LPUART that needs full duplex, reserve both TX and RX on the
same instance. For each I2C bus, reserve SCL and SDA on the same instance. Include
the required USB mode/PHY signals, debug/programming pins, clocks, flow control,
transceiver enables and other fixed functions. Resolve their signal names from
the selected device; prefixes and debug naming differ between families.

For a batch, a matching/backtracking check over physical pads can screen for
independent assignments. Preserve an explicit assignment as the witness for each
candidate and verify every selected signal against its source entries. Report
the assumptions and omitted constraints. A pad-matching result alone cannot
resolve peripheral-mode coupling, remaps, shared resources or electrical limits.
Failure of a partial model does not prove that every hardware allocation fails.

Keep these quantities separate: internal peripheral count, package instances with
the required signals, and simultaneous instances under the chosen constraints.
Do not count a TX-only logging pin as a two-way UART. Using USB for debug changes
the function allocation; present that tradeoff explicitly rather than counting
USB as another hardware UART.

## Qualify and report the result

Cross-check finalists against the current manufacturer datasheet's package and
AF tables and relevant errata. Check USB clock/PHY requirements, supply domains,
boot behavior, UART/LPUART clock and baud limits, DMA/request availability, and
memory/concurrent-traffic needs. Surface disagreements between sources.

Retain the exact MPN/model, source version or hashes, required functions, proposed
peripheral/signal/pad/AF allocation, and unresolved checks with the sourcing
comparison. Store generated evidence with the task, outside this skill repository.
Label the result **CubeMX database pin analysis**. Claim CubeMX project validation,
successful code generation, firmware testing or measured operation only when
those separate steps were actually performed.

CubeMX family names, die IDs and IP technology labels are not fabrication,
assembly or test-country evidence. Continue the separate
[origin-evidence workflow](origin.md) when sourcing constraints require it.
