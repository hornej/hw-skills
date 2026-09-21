# Resistor rating consistency

Use this when a resistor Name, Description, power parameter, or PLM definition
conflicts with an exact MPN. An IPN identifies the item; it does not approve its
technical metadata or prove circuit suitability.

## Resolve the cause before changing a rating

- Check the exact manufacturer/MPN and all sourced alternatives against primary
  manufacturer evidence. Preserve suffixes: reel/power codes can distinguish
  ordinary and high-power variants. Package size alone cannot determine power.
- Record the datasheet revision, page, power, reference temperature, operating
  mode, and applicable voltage/film-temperature/drift conditions. Distinguish
  an actual wrong specification from a different supported mode, rounding, an
  older datasheet, and a deliberately lower engineering limit.
- A higher current datasheet rating is not permission to uprate existing designs
  or inventory. Preserve an established library mode until a different choice
  has been qualified. Clearly mark unresolved differences instead of guessing.
- Keep initial tolerance separate from lifetime resistance drift. Zero-ohm
  jumpers require current and residual-resistance checks; wattage alone cannot
  establish their suitability.
- `1/16 W` is exactly `62.5 mW`. Some manufacturer/catalog displays use `63 mW`.
  Allow that comparison only with recorded evidence/convention. Do not apply
  general numeric tolerance that could hide `63 mW` versus `100 mW` conflicts.

## Correction and prevention

Use one reviewed structured specification to produce the canonical Name and
Description. Record the selected mode alongside Power when a family has more
than one rating. Preserve alternate supported ratings with their conditions in
the evidence or explanatory Description, rather than mixing their maximum
values into a standard-mode component.

Build a field-level before/after plan. Keep manufacturer catalog prose distinct
from the chosen internal engineering definition: a supplier's 100 mW name may
be valid extended-mode text even when the library uses 63 mW standard mode.
Do not rewrite supplier/source records to conceal that distinction. Verify all
approved alternatives against the internal definition, not merely their names.

For Arena, inspect the Working Revision and actual edit form before concluding
that a disabled Effective-revision edit means insufficient permissions. Use the
workspace's change process for release; a saved Working Revision is not an
effective correction. Check where-used and attach the technical evidence to the
review. Do not assume category attributes or cross-field validation rules exist
because their column names occur in an export.

For future technical metadata imports/creation, run a read-only consistency
check before applying changes. Unknown identities, missing structured values,
unlabeled modes, and unverified alternative sources must remain visible findings.
The checker should preserve manufacturer identity, distinguish units correctly,
and fail on unresolved records. It does not replace datasheet review. Do not
make unrelated technical cleanup a prerequisite for an otherwise verified
IPN-only identity update.
