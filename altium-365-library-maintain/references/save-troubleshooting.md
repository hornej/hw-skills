# Library validation and save troubleshooting

Establish the actual operation: saving Workspace components, saving a model,
or updating Altium Designer itself. A window title alone can be misleading.
Read the user's validation/release report before attributing a failure to
performance or networking. Preserve exact component/model revision IDs.

## Model validation failures

Group repeated errors by the referenced model revision and message. Hundreds
of component errors can have one shared footprint dependency. A report saying
a selected revision is unreleased or in an inapplicable state needs a live check
of that revision and its lifecycle applicability. The label Draft alone does not
prove that the model was never released.

Inspect the affected Model Links entry in Explorer. Use a suitable revision of
the same model when available, or replace/remove an explicitly unwanted binding
after verifying each component retains its intended package and alternatives.
Do not flatten a resistor batch with several sizes to one footprint. Updating a
template's default symbol does not establish that old footprint links were
removed. Run the component rule check again before saving.

See [batch model editing and validation](https://www.altium.com/documentation/altium-designer/components-libraries/batch-component-editing)
and [model maintenance](model-maintenance.md).

## An apparently hung save

Before recommending force-close, inspect owned/modal windows as well as the main
window. Compare dialog bounds with all current monitor bounds; negative desktop
coordinates are valid when they intersect a monitor. A visible dialog outside
every monitor can disable the main window while awaiting input. With the dialog
focused, a user can try Alt+Space, M, an arrow key, then move the mouse onto a
visible monitor and click. Reinspect the result rather than assuming recovery.

Read-only process/window diagnostics can establish ownership and location; use
the available computer-use workflow for UI actions. A screenshot or main-window
list that omits a modal does not prove no modal exists. Do not dismiss an unknown
release dialog or restart Altium merely to test this possibility.

Compare short, timestamped samples of scalar CPU time, process I/O counters,
relevant log growth, and release results. .Responding=false, one busy CPU core,
or zero file I/O alone cannot distinguish progress from a stalled operation.
CPU consumption is not a count of saved components. Keep long waits bounded
and report new evidence rather than repeatedly announcing unchanged samples.

After an interrupted or partially successful save, reconcile live revisions and
release logs before retrying. Validate a manageable subset with representative
models first; do not repeatedly resubmit the same unverified full batch.
Preserve available recovery files and unapplied edits before a necessary restart.

## Windows blocking and network claims

When a Windows block notification accompanies the failure, inspect recent
Microsoft-Windows-CodeIntegrity/Operational events and the exact executable/DLL
and policy involved. Check that file's signature and current Smart App Control
state. A block is evidence of an affected load, not proof of every subsequent
save failure. Separate it from antivirus and firewall behavior.

As checked September 14, 2026, Altium documents incompatibility with Windows 11
Smart App Control because some DLLs can be blocked. Microsoft documents no
per-app SAC exception; recent Windows updates can allow re-enabling without a
clean installation. Verify the current guidance/build before advising changes.
Do not disable security or add broad exclusions as routine library maintenance.
[Altium requirements](https://www.altium.com/documentation/altium-designer/installation-management/system-requirements)
and [Microsoft SAC FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)

If asked about limits, distinguish application-scoped outbound rules and proxies
from QoS throttling and router/server limits. A rule named for another app or a
different user SID is not evidence that Altium is blocked. An elevated
`Get-NetQosPolicy -PolicyStore ActiveStore` can inspect Windows policies; access
denied means unknown, not no policies. GPU utilization is not a proxy for
Workspace release progress; Altium's documented GPU benefit concerns graphics,
especially 3D PCB work.
