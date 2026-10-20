# DigiKey COO without adding a part

Investigation date: 2026-10-16. Results below are observations, not permanent origin
qualifications. No private account/list identifiers or credentials are included.

## Result

**Yes, in the tested signed-in DigiKey session.** The website's alternate-part
details endpoint accepts an arbitrary catalog MPN or SKU and returns
`countryOfOrigin`. It requires an existing list ID as context, but the part does
not need to belong to that list. Only GET requests were used.

```text
GET /en/mylists/api/lists/{existingListId}/parts/alternateParts/{encodedPartNumber}
```

The route was discovered in the JavaScript delivered by the live MyLists website,
in its `getAlternatePartInfo` method. The site's UI calls this read operation
first, then separately calls `updatePart` to save a new alternate. Origin Lens
performs only the read operation.

The inspected bundle was:
`https://www.digikey.com/mylists/dist/main.869e063fb31e26de.js`.
The extension does not download, execute, or depend on this bundle filename.

## Evidence

| Check | Observed result |
| --- | --- |
| Guest `viewOptions` lookup for `FUSB302BMPXCT-ND` | HTTP 200; `countryOfOrigin` was `-` |
| Guest `viewOptions` lookup for `2648-SC1510-A4TR-ND` | HTTP 200; `countryOfOrigin` was `-`, even though the existing list showed Malaysia |
| Signed-in `viewOptions` with an existing list | HTTP 200; origin was also `-` |
| Alternate-part lookup for `FUSB302BMPXCT-ND` | HTTP 200; exact MPN `FUSB302BMPX`, onsemi, Thailand; response SKU canonicalized to `FUSB302BMPXTR-ND` |
| Alternate-part lookup for `2648-SC1510-A4TR-ND` | Malaysia, matching the existing MyLists row |
| Alternate-part lookup for `ECS-240-18-23B-JTM-TR` | HTTP 200; ECS Inc., `XC3081TR-ND`, Taiwan |
| Was the ECS product already in the list? | No, verified against the existing list's 37 returned rows before lookup |
| List state before / after ECS lookup | 37 / 37 items; `dateModified` unchanged |
| Same-origin lookup from a DigiKey product page | Successful, using existing browser session |
| Automatic existing-list discovery | HTTP 200; response contains a `lists` array and list IDs |

Automatic discovery uses the website's read-only `getContactLists` operation:

```text
GET /en/mylists/api/lists/contact?startIndex=0&limit=1&sort=DateModifiedDesc
```

The official [MyLists schema](https://developer.digikey.com/node/2687/oas-download)
also exposes `ListPart.CountryOfOrigin`, but the website route above is not a
documented public API contract. Public API authentication and website-session
authentication are different integration paths.

## Mouser

Live inspected markup exposes origin labels in `dl.compliance-dlist dt` and
values in the adjacent `dd`. Tooltip text inside `dt` is excluded when matching
labels. The page for `STM32G491RET6` reported Taiwan for declared origin and
assembly, with diffusion unavailable. Those fields remain separate in the UI.

## Reproduce without modifying a list

1. Sign in normally and open an existing MyLists list.
2. Read list metadata and existing parts; choose an exact component absent from it.
3. Read the alternate-part URL above with that component's exact SKU.
4. Verify returned manufacturer and complete MPN, including all suffixes.
5. Re-read list metadata and confirm item count and modification time are unchanged.

Do not call `addParts`, `updatePart`, or any cart/quote operation to reproduce this.
No account changes, purchasing requests, or new list entries are necessary.

The guest alternate-part route and operation without any existing list have not
been validated. The prototype requires sign-in plus an existing list, and does
not claim this works for every distributor item, marketplace seller, or account.

For shipment-specific COO, DigiKey directs users to invoices or packslips:
[DigiKey's origin guidance](https://forum.digikey.com/t/how-to-view-country-of-origin-coo-with-digikey-my-lists/59804).

## Version 0.1 prototype validation

The flow under test was: open a product page, render the exact-part origin panel,
then refresh it without modifying the distributor account.

Chrome was controlled through the available browser/CDP tools. The actual bundled
`core.js` and `content.js` files were executed in an isolated page world, with
an in-memory stand-in for `chrome.storage`. All distributor
lookups used the real same-origin website and signed-in browser session. No
extension was installed into the Chrome profile during this validation.

| Check | Result |
| --- | --- |
| DigiKey page identity and panel | Exact `FUSB302BMPX` / onsemi; Thailand displayed |
| Mouser page identity and panel | Exact `STM32G491RET6` / STMicroelectronics; Taiwan COO and assembly displayed independently |
| Nonblank/render health | Both panels rendered; no framework error overlay; desktop screenshots inspected |
| Refresh interaction | Real lookup completed and original observation timestamp advanced |
| Cache interaction | Remount reused the cached result and original timestamp with zero network calls |
| List-setting interaction | Non-DigiKey URL rejected; saving automatic selection refreshed the live result |
| Dismissal and layout | Hide removed the panel; a single panel rendered without horizontal overflow |
| Rate-limit interaction | Simulated HTTP 429 displayed an actionable message and zero country values; real fetch restored and success reverified |
| Console health | No extension exceptions observed; pre-existing DigiKey framework/chat/analytics and Mouser tracking warnings were unrelated |
| Offline suite | 11 tests passed; JavaScript syntax checks passed |

Desktop viewports were approximately 2560×1215 (DigiKey) and 2560×1270 (Mouser).
Screenshots and temporary browser-test state are kept outside the repository.
Chrome installation, real extension storage persistence, popup integration,
mobile viewports, additional accounts, and other locales remain unverified.

## Version 0.2 cross-source validation

Observed on 2026-10-16, around 21:48–21:51 UTC. Source records were obtained with
the actual updated adapters. No countries below are fabricated UI examples.

| Check | Observed result |
| --- | --- |
| DigiKey identity `onsemi / FUSB302BMPX` → Mouser | `GET /c/?q=FUSB302BMPX` redirected to the exact product; full identity matched, Mouser SKU `512-FUSB302BMPX`; COO Thailand, assembly Thailand, diffusion Taiwan |
| Mouser search-grid branch | `STM32G491RET6` search returned exact `STM32G491RET6`, suffix variant `STM32G491RET6TR`, and NUCLEO board links; the adapter selects only one exact MPN link and verifies the fetched product's manufacturer and full MPN |
| Mouser identity `STMicroelectronics / STM32G491RET6` → DigiKey | Read-only exact-MPN lookup returned `497-STM32G491RET6-ND`, exact manufacturer/MPN, Taiwan; source link uses DigiKey product ID `13592591` |
| ST family discovery | Live `stm32g491re.html` table identified `PF269474`; its Country of Origin header identified attribute `5080` |
| ST exact code mapping | Real `productsByParentId?parentId=PF269474` response mapped `STM32G491RET6` uniquely to `CP531377` |
| ST declaration | Real `getListOfViewAttributes?prmisId=CP531377` response contained 19 string-valued attributes, all belonging to that CP; attribute 5080 was `TAIWAN` |
| Three-source panel | Actual captured DigiKey and ST records, plus current Mouser DOM, displayed as three separate Taiwan declarations on the Mouser page |
| Source error isolation | Simulated DigiKey authentication failure removed its country while Mouser and ST remained visible |
| Disagreement | A deliberately simulated ST France value triggered the disagreement banner; actual Taiwan evidence was then restored |
| Cache | Remount reused DigiKey/ST records with original observation times and zero additional message lookups; current Mouser DOM was reread |
| Controls and layout | Manufacturing details expanded correctly; Refresh and Hide worked; one preview panel remained without horizontal overflow; screenshot inspected |
| Offline tests | 18 passed, including worker sender validation and duplicate in-flight request handling |

The source adapters ran through isolated Chrome page contexts: DigiKey requests
used the signed-in DigiKey origin; Mouser requests used the Mouser origin. ST's
public KSMK endpoints were successfully fetched from the Mouser page context.
Normal non-browser ST HTTP requests timed out in this environment; this was not
interpreted as missing COO. The ST family table was inspected in the normal browser.

The UI preview used the real `core.js`/`content.js`, in-memory storage, and a
stand-in for extension messaging that returned those real captured records and
the observed ST table identifiers. The temporary preview was removed afterward.
An existing v0.1 panel was hidden during this preview to avoid duplicate displays.
No extension was installed or granted new permissions by this test.

**Still unverified:** installed v0.2 service-worker requests and cookie behavior,
the ST family HTML fetch from an extension origin, real Chrome storage persistence,
popup integration, mobile layout, additional accounts, and other locales. Reload
the unpacked extension and product pages to exercise the complete installed flow.

Primary source pages: [Mouser FUSB302BMPX](https://www.mouser.com/en/ProductDetail/onsemi/FUSB302BMPX?qs=8ziscO3x5y1SHqdwooDK6g%3D%3D),
[DigiKey STM32G491RET6](https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591),
[ST STM32G491RE Sample & Buy](https://www.st.com/en/microcontrollers-microprocessors/stm32g491re.html#sample-buy).

## Version 0.2.1 toggle validation

2026-10-19: tested popup On → Off → reopen (still Off) → On using the actual
popup HTML, CSS, and JavaScript in a temporary isolated Chrome preview with
in-memory extension storage. The preview ran over the existing DigiKey Molex
0444282001 tab at 2560×1215 and was removed afterward. It did not change installed
extension settings or make source requests. Browser Use through CUA was used;
the separate Browser plugin was not listed. No new dependencies were installed.

The control rendered, its accessible switch state and status text updated, and
reopening read the saved choice. Screenshot inspected; no preview exceptions
observed. Existing DigiKey LaunchDarkly, Datadog, and chat errors were unrelated.
Mobile layout and the installed Chrome popup remain unverified.

All 23 Node tests and changed-JavaScript syntax checks passed. New regression
checks exercise the actual content and worker scripts with mocked DOM/storage/
transport boundaries: two open pages hide/restore immediately; saved Off suppresses
initial work; a fresh worker honors Off; both direct and worker requests abort;
and a delayed initial settings read cannot overwrite a newer Off event.

## Installed in-app browser toggle verification

2026-10-19: verified the installed Origin Lens on the signed-in DigiKey
`STM32G491RET6` product page in the ChatGPT in-app browser. The user operated
the switch inside the extension popup; the agent observed the live page.
This test used the installed extension and real storage, without an injected
preview or mocked messaging.

| Check | Observed result |
| --- | --- |
| Initial On | Exactly one Origin Lens panel appeared |
| Off | Panel count changed from one to zero without refreshing the page |
| Off persistence | Agent refreshed DigiKey; the fully loaded page still had zero panels |
| On restoration | Exactly one panel returned without another page refresh |
| Retained results | DigiKey and ST displayed cached Taiwan declarations with the original observation timestamps |
| Final state | On, with one panel visible; screenshots saved outside the repository |

Mouser returned no unique exact match during this run and was shown as unavailable;
the DigiKey and ST reports remained visible. The browser security policy prevented
agent access to extension-management controls, so an extension-manager reload was
not performed or verified by the agent. Browser-restart persistence and simultaneous
installed-tab propagation were not tested in this session.

## Version 0.3.0 component-type controls

2026-10-19: added six independently saved groups with the user's confirmed
defaults: Passives Off; integrated circuits, discrete semiconductors, connectors,
electromechanical, and other/unrecognized On. Existing global On/Off is retained.
Disabled groups hide the panel, prevent new requests, and abort their active
page-side and worker requests without cancelling requests for other groups.

Inspected actual English category breadcrumbs in the in-app browser:

- DigiKey STM32G491RET6: Integrated Circuits (ICs) → Embedded → Microcontrollers.
- DigiKey GRM155R70J105KA12J: Capacitors → Ceramic Capacitors.
- Mouser FUSB302BMPX: Semiconductors → Interface ICs → USB Interface IC.

The classifier reads only same-origin category links in DigiKey's product
breadcrumb navigation or Mouser's `#pdpBreadcrumb .breadcrumb`. Descriptions,
part numbers, general menus and external links cannot set the type. IC category
ancestry takes precedence over capacitor-related controller names; connector
ancestry keeps IC sockets in Connectors. Unrecognized categories remain Other.
Additional distributor taxonomy variations remain possible.

All 32 Node tests passed, as did syntax checks for all five extension scripts.
New tests cover category precedence and source selectors, passive defaults,
immediate propagation across simulated open pages, persistence across new page
and popup instances, master-switch precedence, navigation, selective cancellation,
initial-read races, and popup recovery after a failed save. The storage approach
uses Chrome's documented local storage and change events:
[Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).

Rendered the actual updated popup HTML/CSS/JS in an isolated in-app browser
preview using in-memory mock extension storage. Native checkbox names/states
were checked, selections remained editable while the master was Off, and the
preview was restored to the requested defaults. All six controls were visible
within the 600px preview; additional settings are available by scrolling.
The preview was removed afterward; it changed no installed extension settings.
Screenshot evidence is saved outside this repository.

The installed extension was not reloaded by the agent because browser tooling
does not allow access to its management controls. Actual installed 0.3.0 popup
integration and type filtering still require the user to reload the extension
and product tabs. Earlier installed global-toggle verification remains recorded
above and is not being treated as a test of the new category controls.

## Version 0.3.1 contextual DigiKey setup

2026-10-19: removed permanent MyLists links, list-selection controls, and list
implementation wording from the popup and successful product-panel results.
Source records still retain their original lookup provenance internally.

Only a successful list-discovery response with an empty list collection triggers
the create-an-empty-list prompt. Missing list/part and invalid-setting errors
offer list selection/reset recovery without claiming that a new list is needed.
Authentication errors ask for sign-in/site verification, and unrelated failures
offer no list setup. Recovery stays within the DigiKey result on either site;
other source reports continue independently. No list is created or changed by
the extension.

All 34 Node tests and changed-script syntax checks passed. Regression checks run
the real content script with mocked page/storage/transport boundaries: recovery
appears only for the appropriate errors, retrying an unchanged automatic setting
still reruns the lookup, and success removes the list guidance and controls.
The real popup script also runs against a DOM without the removed form. No
installed-browser reload or new live UI verification was performed for 0.3.1.

## Version 0.3.2 Nexperia matching and conflicting reports

2026-10-19: the user reported PSMN040-100MSEX showing China on DigiKey and
Philippines on Mouser, with the opposite distributor unavailable on each page.
Both public product pages identify the same full MPN and link the same Nexperia
datasheet. DigiKey labels the manufacturer "Nexperia USA Inc." and Mouser uses
"Nexperia". Running the existing adapter reproduced rejection of these identities.

Added this one explicit manufacturer alias to identity and cache matching. Source
names remain unchanged, and full MPN suffix, provider, source host, SKU isolation,
cache expiry and provenance checks remain in place. Unrecognized company names
are still rejected. No country values or product-specific results were hardcoded.

Ran the actual updated core/network adapters in isolated browser contexts with
live read-only requests. DigiKey requests ran from the signed-in DigiKey origin;
Mouser search/product requests ran from the Mouser origin. At approximately
16:07 America/Denver, results were:

| Source | Manufacturer | Exact MPN | Declared origin |
| --- | --- | --- | --- |
| DigiKey | Nexperia USA Inc. | PSMN040-100MSEX | China |
| Mouser | Nexperia | PSMN040-100MSEX | Philippines |

Mouser separately reported United Kingdom for diffusion; assembly was unavailable.
The existing disagreement function returned true for the two live origin records.
All 36 Node tests and the changed-script syntax check passed. Regression tests
exercise both lookup directions, preserve differing source reports, reject other
brands and altered MPN suffixes, and retain cache isolation and expiry.

The user's Mouser search failure was not reproduced in this normal page context:
search redirected to the correct product, then the old manufacturer check failed.
The alias fix addresses that identity failure, but site verification or search
availability from an installed extension can still fail independently. This was
not an installed service-worker or extension-reload test.

Nexperia PCN CN-202503043F, issued April 2, 2025 and effective July 15, 2025,
explicitly lists PSMN040-100MSEX. It qualifies ATXSZ (China) as an additional
assembly/final-test location alongside Nexperia (Philippines), keeps the product
identification unchanged, and points to COO on the packing label. This supports
multiple manufacturing locations as a plausible explanation; it does not prove
either distributor's current shipment lot.

Sources: [DigiKey canonical product](https://www.digikey.com/en/products/detail/nexperia-usa-inc/PSMN040-100MSEX/4004849),
[Mouser product](https://www.mouser.com/en/ProductDetail/Nexperia/PSMN040-100MSEX?qs=5XOdhvmYM0P4Ftmbr2cr4A%3D%3D),
[Nexperia change notice](https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/6745/CN-202503043F.pdf).

## Version 0.4.0 source reports shared across distributor pages

2026-10-19: corrected the cache and rendering behavior so reports collected on a
source page are also available from the other distributor's view of the exact
part. Previously same-site records used a source SKU in their cache key, while
cross-site readers looked for an empty SKU, and a failed refresh deleted a prior
success. Manufacturer alias matching alone did not solve those cases.

Reports are now written under their reporting source's own identity/SKU and
selected by verified manufacturer, full MPN, source and source host. Same-site
views retain SKU matching; cross-site views select the newest matching source
report. Legacy v2 entries are readable, including observed pre-alias names.
Storage changes update open matching panels without starting extra lookups.
Mouser refreshes use an already verified product URL when one is available.

Each source retains its actual link, SKU, name, country and check time. Fresh
reports are reused for one hour. Older reports are refreshed and remain eligible
as labeled last-known fallbacks for seven days; no failed or empty check resets
their timestamps or erases them. At most 100 records are retained on save.
Normal cold lookups still request every supported source automatically. A source
blocked before any successful observation remains unavailable; no country is
invented or copied from another provider.

All 44 Node tests passed. Added regression coverage for reports propagating in
both directions between open pages, all three supported sources on either site,
failed forced updates, newly arrived evidence surviving an older request's failure,
late initial cache reads, retention/expiry, region/SKU/MPN restrictions, legacy
cache records, direct Mouser product requests, and global/type toggle precedence.
Syntax checks passed for all five extension scripts.

Rendered the actual 0.4.0 core/content scripts over both Nexperia product pages
in temporary isolated in-app browser previews with mock extension storage and
transport. The previews used the real DigiKey China and Mouser Philippines
records captured earlier; Mouser's current DOM also supplied its live report.
Both site views displayed both distributor reports with their original source
links and timestamps. Simulated failed refreshes retained those reports with a
clear update-unavailable message. Screenshots were saved outside the repository.
Temporary previews were removed and the installed panels' appearance restored.

This validates rendering with real records and simulated extension boundaries;
it does not establish installed 0.4.0 worker/cookie behavior. Browser tooling
still blocks management controls, so the agent did not reload the installed
extension or alter its actual storage. No new permissions were added.

## Authenticated Mouser Search API COO acceptance test

2026-10-19 at 17:33:43 America/Denver (23:33:43 UTC): used the existing
part-sourcing helper and configured Search API credential for one read-only
catalog request to `POST https://api.mouser.com/api/v1/search/partnumber`.
The request used `partSearchOptions: "Exact"` and the pipe-separated MPNs
`STM32G491RET6|PSMN040-100MSEX`. Both returned exact manufacturer/MPN matches;
there were no API errors or truncated results. No Mouser browser page was opened.

| Manufacturer / MPN | Mouser SKU | Country of Origin | Assembly Country of Origin | Country of Diffusion |
| --- | --- | --- | --- | --- |
| STMicroelectronics / STM32G491RET6 | 511-STM32G491RET6 | Taiwan | Taiwan | Not available |
| Nexperia / PSMN040-100MSEX | 771-PSMN040-100MSEX | Philippines | Not available | United Kingdom |

These were actual `TradeCompliance` name/value entries, using `ComplianceName`
and `ComplianceValue`; they were not inferred from tariffs or manufacturer
locations. `Not available` remains unknown. The API also supplied each exact
product URL. Values are catalog observations at the timestamp above, not a
guarantee for all products, accounts, or future shipments.

The credential was loaded in memory by the existing launcher, never placed in
extension files or logged. Raw and origin-only evidence were saved outside the
repository in the workstation's private Origin Lens evidence directory. This
confirms that the API can supply the requested data without a browser visit.
Origin Lens 0.4.1 still uses website requests; no API integration, new permissions,
or browser extension settings were changed by this test.

## Version 0.5.0 — Mouser API and Microchip integration

Implemented 2026-10-19. Mouser API is now the preferred source on both distributor
pages when a Search API key is saved. It uses a fixed V1 exact-part POST, omits
cookies, disallows redirects, validates manufacturer/full MPN/SKU and maps only
the observed TradeCompliance fields. Auth/quota/match errors remain visible;
only an unconfigured key falls back to the existing website adapter.

The key is stored in extension-origin IndexedDB, separate from content-script
preferences and report storage. Popup settings support save/remove and a bounded
JSON import. Saved keys are never filled back into the form. A revision marker
refreshes open product pages and invalidates pending work when configuration
changes. A persistent request ledger caps this browser at 30 requests per minute
and 1,000 per rolling day, matching the published Search API limits conservatively.

Microchip's documented public Product API was verified live through the in-app
browser. At 2026-10-20T00:31:32.918Z (2026-10-19 in America/Denver), the actual
extension core/network code, running in a temporary isolated developer world,
requested PIC10F200-E/MC and returned:

- manufacturer: Microchip Technology Inc.; exact part_number and sku: PIC10F200-E/MC
- country_of_origin: Thailand
- assembly_country: Thailand
- wafer_fab_country: United States of America

The network operation used GET with cookies omitted and no API key. Source:
[Microchip Product API guide](https://www.microchip.com/designresources/PartnerDataExchange/ProductAPI-user-guide.html).
The manufacturer dispatch adds Microchip on both distributor sites and retains ST
for supported STM32 codes. Manufacturing-only records now survive caching even
when no declared COO is supplied. A previously known COO is retained when a
refresh has only stage data; reports are not merged across observation times.

Validation: 56 Node tests pass, including the prior 44 toggle/cache/identity
checks. New cases exercise API transport, secret redaction, malformed/ambiguous
results, fallback policy, region/SKU boundaries, request limits, cancellation on
key/global changes, Microchip mapping, cross-site configured-API behavior,
manufacturing-only caching and settings import/save/remove errors. Syntax checks
pass for all seven extension JavaScript files. Both real Mouser TradeCompliance
payloads captured in the preceding acceptance test were replayed through the new
network/parser adapter and retained their original observation times.

The actual popup and credentials module were exercised in a local browser preview
with a synthetic key and real IndexedDB: invalid key rejection, save, empty
password field after save, persistence after reload, and remove/fallback state.
Chrome preferences/messaging were mocked in this preview. This does not establish
the installed extension's updated permissions or service-worker behavior.

Automatic approval review rejected the attempted command to retrieve the existing
Search API key and create a private import file; no more specific reason was
provided. The command did not run. No real key was installed, copied into the
repository, or sent to the preview. A new live authenticated request through the
0.5.0 worker remains unverified. User action is needed to reload the extension and
save the Search API key through its popup. Browser tools cannot access the
installed extension's management controls.

TI's public import tool was inspected and explicitly requires myTI login. ADI's
MAX6067 product and Sample & Buy pages were inspected, but no structured exact-part
COO response was verified. Other candidates and evidence requirements are recorded
in [SOURCES.md](SOURCES.md); they are not advertised as implemented adapters.

## 2026-10-20 — installed Mouser confirmation and LCSC photo source

After the user saved the Mouser key, the installed DigiKey panel for STM32G491RET6
returned Mouser Search API → Taiwan at 09:57:01 America/Denver, alongside DigiKey
and ST. No Mouser page was needed. This supersedes the pending installed-API
check above.

LCSC's rendered product metadata and photos were checked for C3231005. The
observed microcontroller search route is
`https://www.lcsc.com/category/941.html?scene=FULL_MATCH&globalKeyword=STM32G491RET6`.
It returns both RET6 and RET6TR; the adapter accepts only the full exact ordering
code, then verifies manufacturer, SKU and canonical URL in Product JSON-LD.
No script from the returned HTML is executed. Other search transports were
investigated but are not used: the generic search page had no server-rendered
product links and the observed public query endpoint rejected the test query.
The adapter therefore advertises the verified ST STM32 scope only.

The actual core/network code ran in an isolated LCSC browser world with live
requests, returning C3231005 and three photos at `2026-10-20T16:14:57.956Z`.
The image fingerprint matched the visually reviewed CHN sample. Declared COO,
assembly, diffusion and testing catalog fields all remained empty; the
interpretation resides in a separate `photoEvidence.observation` with its own
review date and ST reference.

Version 0.6.0 adds only `www.lcsc.com` and `assets.lcsc.com` host permissions.
The photo preview was exercised on DigiKey using a temporary isolated rendering
context with captured reports and simulated extension messaging/storage.
The image loaded at its native 900×900 resolution. The installed extension
still needs reloading for the new hosts. All 66 offline tests passed.

## 2026-10-20 — Automatic local package OCR (0.7.0)

Added a bundled Tesseract.js 7.0.0 engine and English model, executed in a
temporary offscreen document using a dedicated worker. All JS, WASM and language
data are local; no cloud OCR, extra API key, or new remote host is required.
The new `offscreen` permission enables this context. Only runtime messaging is
used for Chrome API access there.

The reader revalidates exact LCSC product metadata independently of the content
script, fetches only that listing's bounded SKU-specific raster photos, crops the
dark package using luminance, upscales and runs grayscale/contrast passes at
0/90/180/270 degrees. Up to three photos and eight passes per photo are examined;
a usable sample ends the scan. A 60-second limit, four-job queue bound, serialized
worker lifecycle and existing type/global cancellation limit resource use.

Country interpretation is restricted to ST's documented CHN/MYS assembly
markings. Each requires two different image variants at the same rotation, both
with word scores >=80. Unsupported tokens are left as text; disagreement or a
clearly read different STM32 family suppresses automatic countries. OCR does
not establish the full MPN or current warehouse lot. No catalog COO/stage fields
are populated from the photo.

Browser verification used the real packaged engine through an isolated local
test page with `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'` and
`connect-src 'self'`. No saved manual observation was read by this test:

| Source photo | Read | Minimum agreeing score | Processed at |
| --- | --- | --- | --- |
| C3231005 STM32G491RET6, `20230511_..._blank.jpg` | CHN → China | 91/100 | 2026-10-20T16:33:01.268Z |
| C8734 STM32F103C8T6, `20230221_..._blank.jpg` | MYS → Malaysia | 86/100 | 2026-10-20T16:32:58.044Z |

C8734's image hash was
`697a42a97cf1fb81c5b84504554c1582b08fa45e320587ba7fedac1db169e91d`;
C3231005 retained the hash above. LCSC's current Product JSON-LD identified
brand ST, exact MPN/SKU and the three image URLs for each.
Scores are uncalibrated OCR scores, not accuracy probabilities. Other text
(including some part-number lettering) was misread, so it is exposed verbatim
for review and not used as a replacement catalog identity.

The test page's Cancel control also stopped an in-progress OCR run. Production
message/cancellation/lifecycle behavior is covered separately by offline tests.
The actual installed extension's offscreen path has not been exercised; the
user must reload Origin Lens and refresh the product page. Browser tools cannot
operate the extension manager. No installed runtime success is claimed.
All 76 offline tests and JavaScript syntax checks passed.

Evidence is saved locally under
`%LOCALAPPDATA%/hw-skills/origin-lens-evidence/2026-10-20/` as
`ocr-G491-browser.json`, `ocr-F103-browser.json`, `lcsc-C8734.json` and the two
photographs. These are test artifacts, not bundled user data or sample photos.

## Collapsible panel and Infineon — 2026-10-20

Version 0.8.0 keeps the panel's reports inside a native details/summary disclosure.
Collapse/Expand leaves one header row; the independent × hides the whole panel.
Neither collapse nor expansion repeats lookups. The choice lasts for the current
page, including remounts. A browser preview verified pointer collapse, Enter to
expand, narrow 360px layout and hide; 78 tests passed. The accumulated prototype
was committed and pushed on `josh-coo-extension-prototype` as `23e8f3a`.

Version 0.9.0 adds a direct Infineon adapter. The public
[ECCN & HTS Finder](https://www.infineon.com/search/eccn-hts-finder) exposes these
operations in its own frontend code:

1. GET `/content/ifx/en/search/eccn-hts-finder.coveoSearch.txt` on
   `www.infineon.com`, returning a short-lived public `Search Token`.
2. POST `https://infineontechnologiesproduction6kx2o63f.org.coveo.com/rest/search/v2`,
   pipeline `IFXECCNAndHTSFinder`, search hub `IFXEccnAndHtsFinderSearchHub`.
   An exact `@opn_name=="FULL_CODE"` query returns region/material records.

Only these fixed endpoints are used; cookies and redirects are disabled. The
public token remains in memory and is excluded from caches, messages and logs.
The extension does not execute Infineon's JavaScript, send analytics events,
open an account, or accept any website agreement. The visible finder page has a
legal acknowledgement before its interactive UI; that acknowledgement was not
accepted by the browser agent. The public read-only service was tested separately.
This is an observed website service, not a supported integration API contract.

Live results:

| Full OPN | Rows | Observation |
| --- | ---: | --- |
| CYW43439KUBGT | 12 | All returned variants: CoO YY, CoA TW, CoD CN |
| IRLML6344TRPBF | 48 | Region/material-dependent CoO CN, PH, GB or YY; CoA CN/PH; CoD GB or YY |
| AMM12S62LB2ZXKMA1 | 12 | Regional/material CoO KR/AT/YY; CoA KR; CoD AT/YY |

The actual extension network/parser code returned CYW43439KUBGT at
`2026-10-20T16:47:24Z` and IRLML6344TRPBF at `2026-10-20T16:50:42Z`.
The third part was checked during endpoint investigation. Infineon's
[product page](https://www.infineon.com/part/AMM12S62LB2Z) labels CoA as assembly
and CoD as diffusion; its
[knowledge-base explanation](https://community.infineon.com/t5/Knowledge-Base-Articles/Semiconductors-Country-of-Diffusion-VS-Country-of-Origin/ta-p/256790)
identifies diffusion as wafer fabrication. No test country is inferred.

The finder explains that `YY` COO is only available at shipment. The adapter
retains YY and other unresolved raw codes but assigns no country to them.
Country lists summarize all returned variants; expandable regional records keep
the region, SP, material and separate field values together. No destination is
assumed. Complete responses are required, with a 100-record bound. Manufacturer
matching accepts Infineon Technologies and the verified Mouser short name
Infineon; it does not alias acquired brands or remove OPN suffixes.

Sanitized fixtures contain all 12 and 48 records for the first two parts, with
only OPN, SP, material, region and origin fields retained. Tests cover exact
identity, ambiguity, incomplete responses, missing codes, country disagreements,
cross-site cache sharing, tampered reports, errors/token redaction, bounded reads,
and global cancellation. All 86 tests pass. The browser preview verified the
regional details using the fixture; it does not establish installed-extension
permissions or service-worker behavior. Reloading the installed extension is
still required for the two new Infineon host permissions.

## ST ordering-code comparisons — 2026-10-20

Version 0.10.0 adds a separate family comparison on both distributor sites.
The live [STM32G491RE page](https://www.st.com/en/microcontrollers-microprocessors/stm32g491re.html#sample-buy)
identified `PF269474`. Its Sample & Buy headers verify these attribute IDs:

| Attribute | Meaning |
| --- | --- |
| 4363 | Package, including dimensions and pitch where reported |
| 1069 | Packing Type |
| 960 | Minimum operating temperature, °C (quick-view Min label) |
| 962 | Maximum operating temperature, °C |
| 5080 | Country of Origin |

The existing `productsByParentId` operation returned seven unique CP mappings.
`getListOfViewAttributes` returned each code's attributes. The production network
adapter was also exercised live, independently of the captured-fixture UI test.
All seven attribute requests succeeded:

| Ordering code | Package | Packing | Operating °C | COO |
| --- | --- | --- | --- | --- |
| STM32G491RET6 | LQFP 64, 10×10×1.4 mm | Tray | −40 to 85 | Taiwan |
| STM32G491RET6TR | LQFP 64, 10×10×1.4 mm | Tape and Reel | −40 to 85 | Taiwan |
| STM32G491RET3 | LQFP 64, 10×10×1.4 mm | Tray | −40 to 125 | Taiwan |
| STM32G491RET3TR | LQFP 64, 10×10×1.4 mm | Tape and Reel | −40 to 125 | Taiwan |
| STM32G491REI3 | UFBGA 64, 5×5×0.6 mm, P 0.5 mm | Tray | −40 to 125 | Taiwan |
| STM32G491REI6 | UFBGA 64, 5×5×0.6 mm, P 0.5 mm | Tray | −40 to 85 | Taiwan |
| STM32G491REY6TR | WLCSP 64, 3.5×3.6×0.6 mm, P 0.4 mm | Tape and Reel | −40 to 85 | Taiwan |

Full raw observations stay outside the repository. The sanitized
`tests/fixtures/stm32g491re-options.json` retains the complete seven-code mapping
and only the five relevant attribute IDs plus marketing status. Family reports
use a separate versioned cache, never exact-part origin records. A row's missing
or failed attributes remain unknown. A mismatch, duplicate CP, absent current
code or changed column mapping prevents a comparison. Limits and stale/partial
states are explicit; no inferred ordering codes or fabricated specifications.

All 96 tests passed, covering all seven variants, comparisons from another
current code, missing attributes, per-code origin differences, bad identities,
bounded parallel requests, rate-limit stops, cancellation, family cache isolation,
cross-distributor rendering, late responses after Off, failed refresh and Clear
cache. Browser preview verified keyboard expansion and horizontal keyboard
scrolling at 360px. Preview command:
`node extensions/origin-lens/scripts/preview-panel.cjs --st-options`.
It uses captured ST data and simulated browser-extension messaging, not the
installed extension. Reload Origin Lens and the product page to load this version.
