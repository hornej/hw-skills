# Origin Lens behavior and evidence

For installation and everyday use, see the [README](README.md).
Source implementation and evidence details follow below.

## Collapse or hide the panel

Click the **Country of origin** header or **Collapse** to reduce the panel to one
line. Click it again or **Expand** to restore the existing reports without new
lookups. Keyboard users can focus the header and press Enter or Space. The
collapsed state lasts for the current page, including panel remounts; a full
page reload starts expanded.

The separate **×** still hides the panel for that page. Reload the page or turn
Origin Lens off and on to bring it back. Collapse keeps source updates active;
use the global or component-type switches to stop lookups.

## Compare ordering options

On supported STM32 product pages, **Ordering options** automatically checks ST's
base-part listing. Open **Compare all … ordering codes** to see each full code's
package (including dimensions), packing, operating-temperature limits, lifecycle
status and declared origin. Changed fields are bold, the current code is marked,
and each row links to ST plus exact-code searches on DigiKey and Mouser.

For STM32G491RET6, ST currently lists seven STM32G491RE codes: one alternative
with different packing, two with different temperature ranges in the same
package, and three in UFBGA or WLCSP packages. The comparison uses explicit ST
attributes; suffixes are not decoded into specifications. Package or temperature
changes are not asserted to be drop-in replacements.

This first family adapter supports the same STM32 scope as the existing ST
origin adapter. ST's page identifies the family, and its returned CP records
must include the exact viewed ordering code. All returned family members are
enumerated; prefix search matches do not establish membership. Other
manufacturers' family comparisons and distributor stock for these alternatives
are not yet supported. Exact-part source reports remain separate.

Family comparisons are cached separately and reused on either distributor and
on sibling ordering codes. Successful results are fresh for one hour; failed
attribute requests retain an explicit unknown row and retry after five minutes
or **Refresh**. A failed full refresh retains the dated previous listing for up
to seven days. At most 30 family reports are retained. Clear cache removes these
alongside source reports.

Requests use three concurrent attribute reads, a 45-second scheduling budget,
and the existing 12-second per-request timeout. Every enumerated code remains
visible if only some requests succeed. A family exceeding 64 codes displays an
explicit limit and links to ST rather than silently truncating the comparison.
No new credentials or host permissions are needed.

## Turn Origin Lens on or off

Click Origin Lens in Chrome's toolbar (or the Extensions puzzle-piece menu), then
use the **Enable Origin Lens** control at the top of its popup. It defaults to **On**.

- **Off:** removes panels from open supported product pages, stops observing page
  changes, blocks new lookups, and aborts pending page/worker requests.
- **On:** restores panels for selected component types on open supported product
  pages, including panels hidden with their × button. No product-page reload is
  needed for ordinary toggles.
- The choice is saved locally across tabs and browser restarts. Cache and list
  settings are retained. Clearing cached results does not turn the extension on.

Under **Component types**, choose the component groups you want:

| Component group | Initial setting |
| --- | --- |
| Passives: resistors, capacitors, inductors and ferrites | Off |
| Integrated circuits | On |
| Discrete semiconductors: diodes, transistors, thyristors | On |
| Connectors | On |
| Electromechanical: switches, relays, motors, fans | On |
| Other / unrecognized: includes sensors, optoelectronics and crystals | On |

Unchecked groups have no panel and initiate no origin lookups. Changing a group
updates open supported pages and aborts active lookups for that group. The master
switch pauses every group while retaining your selections; groups can still be
configured while the master is Off. Your existing master setting is preserved
when updating. Defaults apply only to groups without a saved preference.

Types come from the product's category breadcrumbs, not its part number or
description. Missing or unfamiliar categories use **Other / unrecognized**.
This is a broad grouping of English distributor categories, not a complete
electronic-component taxonomy.

After updating, reload the extension and existing product tabs once. No additional
permissions were required through 0.4.1; 0.5.0 adds access to `api.mouser.com`
and `www.microchip.com`. Cache controls are under **Data
sources & cache** in the popup. List controls appear only in a DigiKey result
that reports a missing list/part or invalid list setting. Existing saved list
selections remain in effect; the recovery control can reset them to automatic.

## What it checks

| Source | Lookup on either distributor's page |
| --- | --- |
| DigiKey | Read-only MyLists alternate-part lookup, using the DigiKey SKU on DigiKey or the exact manufacturer part number on Mouser |
| Mouser | Authenticated Search API on either site when configured; otherwise the existing compliance section / exact product-page lookup |
| STMicroelectronics | For supported STM32 ordering codes, read the family page's PF identifier, resolve the exact full code to its CP identifier, then read declared origin from attribute 5080 |
| Texas Instruments | Signed-in Import details; exact full code, declared origin for shipping to the United States, and separate specialized-flow alternate ordering codes |
| Microchip | Public Product API; require one exact full ordering code and manufacturer, then read declared COO, assembly country and wafer-fab country |
| Infineon | Public ECCN & HTS Finder; exact OPN match, with all returned regions and material variants retained; declared COO, assembly and diffusion |
| Harwin | Public product page; exact item identity and its Country of Origin field, with ISO country codes displayed as names |
| Samtec | Public product page; exact manufacturer, full ordering code and SKU; **probable COO**, stored and displayed as an estimate separately from declared COO |
| LCSC reference photos | ST STM32 microcontroller catalog search, exact manufacturer/MPN/SKU metadata, and part-specific image URLs; reviewed markings describe only the photographed sample |

Each source has a separate result, source link, observation time, and expandable
assembly, diffusion, and testing fields. Different declarations remain visible
in their respective source rows. There is no vote, merged country, or assumption
that another distributor's inventory establishes the origin of the units being
purchased. Stage locations are never inferred from declared origin.

### TI import details

TI parts automatically use the existing myTI session in the same browser. Only
the full ordering code is submitted to the fixed read-only Import details
endpoint. An expired or unavailable session displays **Sign in to myTI**; the
extension does not extract, store or ask for a password or session token.

This version requests **United States** as both the ship-to destination and
ECCN jurisdiction. The destination is always shown with the result and checked
when reusing cached data. It is not inferred from a distributor's locale or
silently changed to match TI's website preferences. Other destinations are not
yet configurable. TI describes the field as destination-specific origin for
tariff analysis, not a manufacturing-stage report. Assembly, wafer fabrication
and testing therefore remain **Not reported**.

All returned origins for the exact code remain visible. **TI specialized-flow
alternatives** lists TI's separate alternate ordering codes and their own
origins under the same destination. They never overwrite the selected code's
origin, increase the source count, or establish a China-free route. No country
is inferred from `.A`, `.B` or any other suffix. Availability, pricing and
shipment-specific manufacturing routes still require confirmation from TI.

The website endpoint is observed rather than a supported integration API. Calls
have a 25-second timeout, bounded response size and no automatic retries or
redirect following. Sign-in, service or schema failures retain a dated valid
cached result when available.

### Harwin and Samtec product pages

These adapters need no key or sign-in. Only parts identified as Harwin / Harwin
Inc. or Samtec / Samtec Inc. use their respective manufacturer page. Fetches
omit cookies and reject redirects. Full ordering codes and canonical URLs must
match; a series page, near match, ambiguous identity or changed schema is rejected.
Unknown country values remain unresolved. Website layouts can change; these are
observed public page fields, not documented integration APIs.

Harwin's Country of Origin is a catalog declaration. Samtec explicitly calls its
value **probable COO** and says it may change before shipment. The panel shows
`Malaysia · probable`, for example, with a link to Samtec's quantity-specific
pricing and delivery tool. That estimate does not increment the declared-origin
source count, participate in declaration comparisons, or populate assembly,
fabrication or testing. Its qualifier survives caching and failed refreshes.
Neither source establishes the manufacturing route of a particular shipment.

### Infineon regional records

Infineon needs no personal API key or login. The worker obtains a temporary public
search token from Infineon and sends the exact full OPN to Infineon's dedicated
Coveo search service. Neither remote JavaScript nor analytics is loaded.
The token stays in memory for that lookup and is never included in reports.

The top-level country list includes all returned catalog regions and material
variants. **Manufacturing & match details → Regional origin records** retains
each region's declaration, SP number and material numbers. A US declaration can
differ from one for China, the EU or Singapore. No destination is assumed.
Infineon's `YY` is unresolved, not a country; for declared COO, Infineon says it
is only confirmed at shipment. Original country codes remain in the saved report,
and recognized codes are displayed as country names. Unknown codes remain unresolved.
Searches returning more than 100 records or incomplete pages are rejected rather
than displaying a partial list. Legacy Cypress/International Rectifier brand names
are not automatically equated to Infineon; the distributor must identify the part
as Infineon Technologies or its verified short name, Infineon.

### LCSC photo evidence

The LCSC row is additional visual evidence, not another declared-COO vote. It
does not change the count of sources reporting origin. **View top-side photos**
expands an image preview and links to the full-resolution top-side photos. Photos are
reference images, not confirmation of the current warehouse lot.

Only LCSC's `front` (angled top) and `blank` (top on a plain background) photo
variants are accepted. Underside (`back`) and unknown views are excluded from
previews, full-size photo links and OCR. A listing with no supported top-side
photo reports that absence. Older saved galleries containing underside images
are ignored and looked up again, so clearing the cache is unnecessary.

The initial automatic search covers **ST STM32** parts in LCSC's microcontroller
category. It does not yet search other manufacturers or decode arbitrary images.
The first reviewed observation is **STM32G491RET6 / C3231005**, whose top-side photo
shows **CHN**, interpreted as the pictured sample's Chinese assembly location
using an ST employee's explanation. The review is bundled with its original
review time, exact image URL and SHA-256 fingerprint. The worker checks the
current image bytes before displaying **China · sample**. A changed or
unavailable image loses that annotation; its available photos stay inspectable.
All matched STM32 listings also run **local OCR**, including images without
a bundled review. The reader crops the dark package, upscales it, tries grayscale
and contrast-enhanced passes, and checks four orientations. If those passes do
not agree, a red-channel contrast pass suppresses blue catalog watermarks while
retaining neutral package lettering. It examines up to three top-side listing
photos, at most 12 passes per photo, and stops when one sample yields usable evidence.
Literal **CHN → China**, **MYS → Malaysia**, **TWN → Taiwan** and
**PHL → Philippines** are interpreted. CHN/MYS follow ST's STM32 explanation;
TWN/PHL use ST's explicit country-code definitions in PCN 4452. That PCN covers
EPROMs, so the photo details disclose the interpretation being applied to STM32.
A country still needs two distinct image variants at the same rotation to agree
with word scores of at least 80/100. The grayscale/contrast fast path remains.
Scores are heuristic, not calibrated probabilities. Other markings, including
plant/lot codes, remain uninterpreted.
Conflicts and a clearly different STM32 family suppress automatic country claims.

An automatic result appears as **Taiwan · auto-read**, for example.
Expand the photo details for detected text, source photos and processing time.
Weak/unreadable results retain the photos without assigning a country. Photo
identity is established from exact catalog metadata; OCR does not reliably read
the entire part number. It cannot establish that a listing photo depicts the
current stock or independently authenticate the part.
The existing fingerprint-checked manual review remains labeled **China · sample**;
the new automatic reading is shown separately in its details.
OCR evidence version 2 invalidates earlier saved readings, including unreadable
ones, so reloading the extension and product page triggers a fresh scan without
clearing other sources' cached reports.

Tesseract.js 7.0.0 and its English model run in a temporary offscreen document
and dedicated worker. Jobs are serialized, bounded to 60 seconds, cancellable by
the existing global/type switches, and closed after completion. No photos are
sent to an AI service. There is no additional API key.

Reviewed markings never populate the declared COO, assembly, diffusion or test
fields of a catalog report. Only a separate photo observation carries the
interpretation. A photo review cannot establish the manufacturing history of
other lots or parts with a different ordering-code suffix.

Manufacturer and full MPN must match, including packaging and temperature suffixes.
The explicit Nexperia / Nexperia USA Inc., Microchip Technology / Microchip
Technology Inc., ST / STMicroelectronics, Infineon / Infineon Technologies,
Harwin / Harwin Inc., and Samtec / Samtec Inc. aliases are accepted; each source retains
its original manufacturer name. Other unrecognized name differences, near matches,
and ambiguous results are rejected. No general company-suffix stripping or fuzzy
brand matching is used. DigiKey may canonicalize a cut-tape
SKU to a reel SKU for the same MPN; match details show that resolution explicitly.

Every supported page checks all supported sources automatically. Verified reports
are shared by source and exact part across DigiKey and Mouser: learning a report
in one tab updates other open matching pages without reloading them. Source URLs,
manufacturer names, SKUs, countries and original observation times stay attached
to each report. When a Mouser product URL is already verified, refresh requests
that product directly instead of repeating the search.

A login challenge, rate limit, missing value, or failed match does not erase an
existing report. The panel keeps the last known report and marks an unsuccessful
update. Reports older than one hour are labeled as last known and refreshed;
reports older than seven days are not displayed. A source that has never been
retrieved can still be unavailable when its site blocks access. Visiting that
source's product page can supply its report to the other open pages.

Use **Refresh** for a new check. No automatic retry loop runs. Complete any sign-in
or verification normally on the source site; the extension does not automate it.

English product pages on `www.digikey.com`, `www.mouser.com`, and `eu.mouser.com`
are supported. Mouser API reports are reusable across US/EU pages for the same
exact SKU; website reports retain their regional boundary. Website searches
use Mouser's US site. Other direct manufacturer adapters,
non-STM32 ST products, search-grid overlays, other locales, password-protected
shared lists, and shipment certificates are outside this version's coverage.
The STM32 family URL is only a candidate; no origin is used without an observed
PF identifier and a unique exact-order-code mapping in ST's response.

## Permissions and data

The extension uses `storage` and `offscreen`. The latter hosts the local OCR
worker, image canvas and inert product parser; it opens no visible tab and does
not read the API-key store. Host permissions cover exactly:

- `https://www.digikey.com/*`
- `https://www.mouser.com/*`
- `https://eu.mouser.com/*`
- `https://api.mouser.com/*`
- `https://www.ti.com/*`
- `https://www.microchip.com/*`
- `https://www.harwin.com/*`
- `https://www.samtec.com/*`
- `https://www.st.com/*`
- `https://ksmk.st.com/*`
- `https://www.lcsc.com/*`
- `https://assets.lcsc.com/*`
- `https://www.infineon.com/*`
- `https://infineontechnologiesproduction6kx2o63f.org.coveo.com/*`

Chrome host permissions apply to the whole host. A background service worker needs
them to fetch the other sources while viewing a distributor page. Content scripts
remain limited to supported product-page paths. No cookie API, history access,
analytics, remote code, or external application server is used.

Automatic lookup sends the product MPN to DigiKey and Mouser and, for supported
STM32 parts, requests the relevant ST family and ordering-code data. Microchip
parts also request Microchip's public catalog. DigiKey and Mouser website requests
use existing browser sessions; ST and Microchip requests omit credentials.
TI parts POST one full code, United States ship-to and U.S. ECCN selection to
`https://www.ti.com/importdetailsmodel/api/v1/ext/secured/material-import-details?locale=en-US`.
Only that exact TI endpoint receives existing browser credentials, with redirects
disabled. No account/profile endpoint is read. Reports retain only part identity,
origin, destination, ECCN/HTS and separately identified alternate codes.
Infineon parts request the public search token from `www.infineon.com` and send
the full ordering code to its dedicated Coveo host. Both omit cookies and disable
redirects. No account information, search history, or analytics identifiers are sent.
Harwin and Samtec parts request one exact-order-code product page from their
respective `www.harwin.com` or `www.samtec.com` host. These GETs omit cookies and
disable redirects. Only origin fields and matching identity are retained; page
scripts, unrelated product data and analytics metadata are discarded.
Supported STM32 parts also send the full MPN to LCSC's microcontroller search
and retrieve the exact product metadata. LCSC requests omit cookies. Up to three
photos are fetched for OCR, and a known reviewed image is fetched for fingerprint
validation. Images are processed in memory; extracted text, scores, timestamps
and image hashes are saved with the normal source cache. Expanding the photo view
loads the preview from LCSC with no referrer. Only constrained HTTPS raster
image URLs tied to the source SKU are accepted.
Mouser API searches omit cookies and send your key only to `api.mouser.com`,
with redirects disabled. API auth/quota errors do not trigger website fallback.
The extension never extracts passwords or cookies. Browser cookie settings and
site verification can still prevent cross-site session use.

Mouser, TI and Infineon use read-only catalog search POSTs; the other requests use GET. No lists, alternates, carts, quotes, or
accounts are changed. DigiKey discovery reads one list metadata response, uses
its ID, and discards unrelated metadata. It does not request list contents. HTML
is parsed in a disconnected inert template; source scripts and page resources
are never executed or inserted into the current page. Rendering uses text nodes
and validated LCSC image URLs.
The worker accepts only supported top-frame product-page senders and fixed source
operations, with constrained product URLs, bounded HTML/JSON/image reads, and timeouts.

Product identity, origin evidence, source, timestamp, your on/off and type
preferences, request timestamps, and an explicitly chosen list ID are stored locally.
The API key is stored separately in the extension origin's IndexedDB, which the
content scripts do not use. It is not embedded in source files, sent in extension
messages, included in reports, or stored in synced preferences. This is local
credential storage, not an encrypted vault. Clear cached results retains the key;
**Remove key** removes it and resumes website lookup. API request timestamps
enforce a local ceiling of 30/minute and 1,000/rolling day across worker restarts.
Other applications using the same key may consume additional quota.

Except for Mouser API results, positive origin, separately qualified probable-origin estimates, manufacturing-stage reports, and matched reference-photo records
are keyed by reporting source, source host, exact manufacturer/MPN and source SKU.
The newest matching report is reusable across sites, while same-site views retain
SKU matching and US/EU Mouser website reports stay separate. Each source keeps its original
check time. Configured Mouser API lookup is available on either website.
Up to 100 records are retained. Reports younger than one hour are reused; older
reports are refreshed and can serve as labeled fallbacks for up to seven days.
Expired and old-version records are pruned on save. Idle records may remain on
disk until the next save, **Clear cached results**, or uninstall. Failed or empty
responses do not overwrite a saved positive report or advance its check time.

Mouser Search API reports are displayed live on the current page and are not
persisted or reused from the report cache. Previously stored API reports are
removed when the updated worker starts or a product page loads. Only request
timestamps are retained for API rate limiting. This follows Mouser's published
[API caching restriction](https://www.mouser.com/apiterms/); it does not change
the treatment of reports retrieved from the separate website interface.

## Reviewed ST assembly notices

The ST source combines its live catalog declaration with separately dated,
reviewed manufacturer documents. For `STM32G491RET6` and `STM32G491RET6TR`,
PCN **MDG/24/14363** documents ASE Kaohsiung (Taiwan) and JSCC (China).
The row shows **Taiwan / China**, an explicit **Declared COO · ST catalog**
field, and **Assembly locations · ST PCN**, with a link and publication/review
dates. These are routes documented in a notice, not a verified shipment lot.

The reviewed evidence is bundled and matched by exact manufacturer/ordering
code. It appears with existing cached declarations and when a catalog request
fails; refreshing the catalog does not advance the document's review date.
This is not an automatic PDF/PCN crawler. Other codes have no reviewed PCN
coverage yet; their assembly remains unverified. Adding evidence requires
reviewing the exact code, sites, source document and scope. LCSC photographs
remain in their own sample-evidence row and do not change ST's declaration.
