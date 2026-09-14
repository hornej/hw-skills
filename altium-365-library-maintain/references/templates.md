# Component templates, parameters, and folders

Inspect the current template Item ID, revision, and affected components before
editing. Repeated names under a type in Create new component can be different
templates assigned to that type, not duplicate component records. Resolve the
template identities before proposing removal. Preferences > Data Management >
Component Types > Templates shows the associations.
[Altium component types](https://www.altium.com/documentation/altium-designer/components-libraries/component-types)

## Separate the settings

- ComponentType controls component categorization; Default Folder controls the
  component destination. These are separate from symbol and footprint folders.
- SCHLIB/PCBLIB defaults select models, not destinations for model items. Audit
  existing model assignments separately when changing a template default.
- Required controls whether a value must be present. The parameter's data type
  determines valid units. Clearing Required does not require converting to Text.
- Saved components reference a template revision. Verify which revision each
  edited component uses instead of assuming a template save updated everything.
- Template-owned fields cannot simply be removed in the component editor.
  Additional user parameters are allowed; preserve useful extras during cleanup.

[Altium component templates](https://www.altium.com/documentation/altium-designer/components-libraries/workspace-component-templates)

## DNP policy

Establish whether the project uses regular passive templates with optional
inapplicable numeric ratings or separate DNP templates. The Required checkbox
applies to all components using that template; no conditional "required unless
DNP" behavior has been verified here. Keep missing specifications on orderable
parts visible in the audit even when the template allows blanks.

Preserve Ohm for resistance, Farad for capacitance, and suitable units for other
ratings. Blank DNP ratings are different from NA or zero; a zero-ohm resistor
remains a real value. Keep the DNP label and intended symbol/footprint. For an
authorized template transition, validate representative blank ratings and assess
references before retiring an unwanted template. Repeated display names alone
do not justify deletion.

An impedance-oriented ferrite/inductor template can serve a different parameter
meaning from an inductance-oriented template. Preserve that distinction when
consolidating apparently similar entries.

## Folder organization

Use the project's chosen taxonomy and match current Workspace folders by ID.
Component types, component destinations, symbol categories and footprint package
folders are separate choices. Updating a component template does not move or
rename its existing model items; use [model maintenance](model-maintenance.md)
for those operations.
