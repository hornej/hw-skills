---
name: digikey-part-selection
description: Select, compare, or find replacements for electronic components using DigiKey catalog search, current purchasing data, and manufacturer datasheets. Use for circuit requirements and sourcing decisions; use the Altium skills to prepare or update library components after selection.
---

# DigiKey part selection

Turn the user's circuit requirements into a justified choice of exact manufacturer
parts. DigiKey is the discovery and purchasing source; manufacturer datasheets
establish electrical and mechanical suitability.

## Search and qualify

- Separate hard requirements from preferences. Use the existing circuit context
  for operating voltage/current, transients, temperature, package/height/pinout,
  assembly constraints, quantity, and target cost. Ask only for missing information
  that changes the selection; continue independent research while it is pending.
- Read [API usage](references/api.md) for the bundled read-only search/details
  client and [credentials](references/credentials.md) when access is needed.
  Use credentials supplied by the user through environment variables or their
  chosen secret manager without printing values. Keep API caches and selection
  artifacts outside this skill repo. Manufacturer/distributor pages remain a
  fallback when API access is unavailable.
- Use keyword search for discovery. Narrow broad queries with observed category
  or parameter IDs if needed; do not invent filter IDs. The bundled client handles
  simple queries; use the documented API for more advanced filters.
- Verify exact MFR and MPN, including suffixes, before attributing specifications.
  Similar catalog results and alternate packaging are not automatically drop-in
  replacements. A DigiKey SKU identifies an orderable packaging choice; the
  manufacturer's part number identifies the component.
- Read the relevant manufacturer datasheet sections for the intended operating
  conditions. Typical values and absolute maximum ratings do not establish a
  guaranteed operating point. Consult [selection checks](references/selection.md)
  for the component family being considered.
- Before a purchasing recommendation, refresh ProductDetails for the exact SKU
  and intended quantity. Distinguish stock from lead time, and unit price from
  the selected quantity break, packaging, minimum order, and order multiples.
  Record retrieval time and currency. Keyword results can remain cached upstream
  even when freshly fetched; an old local response is not current availability.

## Present the decision

Recommend the best fit supported by the evidence. Include a few alternatives
when they offer a useful tradeoff, rather than an arbitrary shortlist count.
Compare hard requirements, exact MFR/MPN, package, key specifications, stock,
quantity price, and unresolved constraints. Link to the DigiKey product and the
manufacturer datasheet; identify assumptions and calculations separately from
quoted specifications. If no part meets all hard requirements, say which
constraint prevents a match before proposing compromises.

Do not infer country of origin from brand headquarters, RoHS status, or a product
family. Report it only when an explicit source supports the exact part or shipment;
otherwise leave it unknown. Do not add automotive qualifications or environmental
ratings from an adjacent series.

Selection does not require an Altium import, Workspace revision, or purchase.
When the user asks to add the selected part to a library, hand off exact identity,
datasheet/product links, verified parameters, and evidence to
altium-library-migrate (local preparation) or altium-365-library-maintain
(existing Workspace items). Keep stable item identity separate from display Name.
