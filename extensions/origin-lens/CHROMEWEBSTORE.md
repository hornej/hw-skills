# Chrome Web Store listing — Origin Lens

Last updated: 2026-10-20

**Draft only.** No store item has been submitted or published. This record
describes the implemented extension and identifies work still needed before
submission. Recheck it against the release manifest and code when packaging.
Installation and release steps are in the [README](README.md#install-or-update).

## Store listing

**Extension name:** Origin Lens — DigiKey & Mouser

**Short description** (matches `manifest.json`, maximum 132 characters):

Compare component origin reports on DigiKey and Mouser, with local OCR of LCSC package photos. Exact part matching.

**Detailed description** (draft store copy):

Compare country-of-origin reports for electronic components while viewing
DigiKey and Mouser product pages.

See separate reports from distributors and supported manufacturers, with source
links, check times and exact ordering-code matches. Supported manufacturer
sources include STMicroelectronics, Texas Instruments, Microchip, Infineon,
Harwin and Samtec. Coverage depends on the part and the source's available data.

For supported STM32 parts, compare package, packing and temperature options
reported by ST. View LCSC reference photos and automatically read supported
package markings on your device. Photo observations and probable-origin
estimates are labeled separately from declared country of origin.

Select the component types you want to see, collapse the panel, or turn the
extension off. Passives are hidden by default. Previously checked reports are
saved locally and show when they were checked.

After installation, open a supported product page. Configure sources in the
extension's Data sources & cache section. Automatic Mouser lookup uses your own
Mouser Search API key. DigiKey and TI lookups may require signing in to those
sites in the same browser. Setup instructions are linked from the project README.

Part lookups go directly to the relevant suppliers and manufacturers. Your
settings and saved reports stay in this browser profile. Package photos are
read locally; they are not uploaded to an image-recognition service. There is
no developer-operated collection server or analytics service.

Catalog declarations can vary by shipment or lot. A reference photo does not
establish the origin of current inventory. These reports do not certify an
entire supply chain or establish that alternative parts are interchangeable.

**Category:** Shopping (proposed; confirm the dashboard category at submission)

**Single purpose:** Compare origin and manufacturing evidence for exact
electronic component ordering codes on DigiKey and Mouser product pages.

**Primary language:** English

## Graphics and assets

| Asset | Dimensions | Status | File / planned content |
| --- | --- | --- | --- |
| Store icon | 128 × 128 PNG | Existing; dimensions verified | `icons/icon-128.png` |
| Screenshot 1 | 1280 × 800 | Needed | Product page with multiple source reports and check times |
| Screenshot 2 | 1280 × 800 | Recommended; needed | Settings, component-type controls and source setup |
| Screenshot 3 | 1280 × 800 | Optional | STM32 ordering options and qualified photo evidence |
| Small promotional tile | 440 × 280 | Required; needed | Origin Lens icon and restrained product presentation |
| Marquee image | 1400 × 560 | Optional; not prepared | — |

Capture actual release behavior. Exclude account details and credentials from
images. Use the existing plain visual style; no slogans or implied supplier
endorsement. See Google's [image requirements](https://developer.chrome.com/docs/webstore/images).

## Permissions justification

The release currently requests two extension permissions and fourteen named
HTTPS hosts. Content scripts run only on the supported DigiKey and Mouser
product-page paths in `manifest.json`. Host access also allows cross-source
requests while the user is viewing either distributor.

| Permission | Type | User-facing reason |
| --- | --- | --- |
| `storage` | permissions | Save on/off and component-type preferences, source settings, request limits and dated part reports in this browser. |
| `offscreen` | permissions | Read package markings locally from supplier photos and parse source responses without opening an extra visible tab. |
| `https://www.digikey.com/*` | host_permissions | Identify the viewed component, show the comparison panel, and retrieve exact-part origin using the existing DigiKey session. List discovery reads metadata, not list contents, and does not add parts. |
| `https://www.mouser.com/*` | host_permissions | Identify the viewed component, show the panel and retrieve exact-part compliance information from Mouser's main website. |
| `https://eu.mouser.com/*` | host_permissions | Support Mouser's European product pages and their source-specific compliance reports. |
| `https://api.mouser.com/*` | host_permissions | Retrieve exact-part origin using the user's Mouser Search API key, including while viewing DigiKey. |
| `https://www.ti.com/*` | host_permissions | Read TI Import details for the full ordering code using the user's existing myTI session, with an explicit United States destination. |
| `https://www.microchip.com/*` | host_permissions | Read Microchip's exact-part origin, assembly and wafer-fabrication fields. |
| `https://www.harwin.com/*` | host_permissions | Read declared origin from the exact Harwin product page. |
| `https://www.samtec.com/*` | host_permissions | Read the exact Samtec product's probable-origin estimate and label it as an estimate. |
| `https://www.st.com/*` | host_permissions | Identify the ST product family for the viewed STM32 ordering code. |
| `https://ksmk.st.com/*` | host_permissions | Read ST ordering-code attributes, including origin, package, packing and temperature options. |
| `https://www.lcsc.com/*` | host_permissions | Find exact STM32 catalog matches and their reference-photo metadata. |
| `https://assets.lcsc.com/*` | host_permissions | Retrieve matched package photos for local marking recognition, image fingerprint checks and user-requested previews. |
| `https://www.infineon.com/*` | host_permissions | Obtain the public search token used by Infineon's ECCN & HTS Finder. |
| `https://infineontechnologiesproduction6kx2o63f.org.coveo.com/*` | host_permissions | Query Infineon's dedicated search service for exact-order-code origin, assembly and diffusion reports. |

**Remote code:** None. JavaScript, WebAssembly and the OCR language model are
bundled under `vendor/ocr`. Downloaded source HTML is parsed as data; its scripts
are not executed. The CSP allows the bundled WebAssembly engine. Keep the
vendor licenses and all runtime assets in the release archive.

## Privacy and data use

### Data handling inventory

**Does the extension handle user data? Yes.** It reads the current supported
product identity, sends lookup requests to suppliers and stores user-selected
settings and a user-supplied credential. No data is sent to a publisher-operated
backend. Do not describe this as an extension in which all data stays on-device.

This is the implementation inventory for the dashboard disclosure, not a
published privacy policy. Confirm the final selections against Google's
[privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

| Data type | Handled? | Transmission and purpose |
| --- | --- | --- |
| Personally identifiable information | No deliberate collection of name, email or account profile | Existing authenticated requests may be associated with the user's account by the receiving supplier. DigiKey list discovery discards unrelated metadata. |
| Health information | No | Not used. |
| Financial information | No | No payment, cart or order data is read or changed. |
| Authentication information | Yes | The optional Mouser key is saved locally and sent only to `api.mouser.com`. The browser can attach existing cookies to DigiKey, Mouser website and TI requests; the extension does not extract passwords or cookie values. |
| Personal communications | No | Not used. |
| Location | No device-location collection | TI queries specify United States as the report destination, not an inferred user location. Contacted servers receive normal network metadata, including an IP address. |
| Web history | Limited to supported product context | Current product URL, manufacturer, part number and supplier SKU are read and retained with reports. Relevant identifiers are sent to lookup sources. There is no browser-history API access or general browsing-history collection. |
| User activity | Local controls only | On/off, component selection and explicit source/cache actions affect local settings and requests. No clickstream, keystroke or usage analytics is recorded. |
| Website content | Yes | Part identifiers, origin/manufacturing fields, source links, ordering options, photos and extracted markings support the comparison. Photo bytes are processed locally; extracted evidence is cached. No photos are uploaded to a recognition service. |

**Recipients:** DigiKey, Mouser, TI, Microchip, Harwin, Samtec, ST, LCSC and
Infineon's dedicated Coveo search service, as applicable to the requested part.
Requests use the fixed operations in `network.js`. Data requests do not create
lists, add items, place orders or modify supplier accounts. Each source also
controls its own server-side request logging and retention.

**Local storage and deletion:** Preferences and source reports use local
extension storage; the Mouser key uses a separate extension IndexedDB database.
There is no Chrome sync of these records. The credential store is not an
encrypted vault. Origin/photo reports are limited to 100 cached records, with a
one-hour freshness period and dated fallback for up to seven days. ST family
comparisons are limited to 30 records. Expiry is enforced on use/save; idle
records may remain on disk until a later save or deletion. **Clear cached
results** removes reports but retains the key. **Remove key** removes the saved
key. Uninstalling removes the extension's local data.

**Controls:** Disabling Origin Lens or a component type stops its lookups.
Collapsing or hiding a panel does not disable its source updates. Each browser
profile has its own settings and credential.

### Data-use certification

The current implementation supports these statements. The publisher must
confirm them in the dashboard for the actual submitted release:

- [ ] Data is not sold to third parties.
- [ ] Data is not used for purposes unrelated to the extension's single purpose.
- [ ] Data is not used for creditworthiness or lending purposes.

## Privacy policy

**Public privacy-policy URL: Pending.** Prepare and host a policy that identifies
the publisher/contact and covers the inventory above, direct supplier requests,
credentials, local storage, deletion and third-party handling. The README and
this draft are not substitutes for completing the store's privacy disclosures.

## Distribution

**Proposed visibility:** Unlisted, for sharing a link with coworkers.
Anyone with the link could install it. Use Private instead if installation must
be limited to named Google accounts or configured groups.

**Regions:** Pending publisher selection. English product paths are the current
supported browsing scope; TI reports are explicitly for a United States
destination regardless of the user's location.

See [visibility and regions](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
Unlisted and Private submissions still require review.

## Developer information

- **Publisher name:** Pending.
- **Verified contact email:** Pending.
- **Support URL/email:** Pending; select a maintained issue tracker or contact.
- **Proposed homepage:** [Origin Lens README](https://github.com/hornej/hw-skills/tree/josh-coo-extension-prototype/extensions/origin-lens).
- **Store item ID and installation URL:** Not created.

Do not place personal credentials, reviewer account passwords or API keys in
this repository. Supply any required reviewer access through the dashboard's
test-instructions controls.

## Version history

No version has been submitted. Use the release manifest's version when creating
the first item; increase it for subsequent uploads to that same item.

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| To be selected at packaging | — | Initial store release | Draft; not submitted |

## Review notes and remaining work

- [ ] Select the publisher account; complete registration, verified email and
  2-Step Verification.
- [ ] Finalize the release version and test the packaged extension in desktop
  Chrome, including source failures, settings, cross-site reports and local OCR.
- [ ] Capture store screenshots and create the small promotional tile.
- [ ] Publish the privacy policy; reconcile dashboard disclosures and listing.
- [ ] Recheck permission scope and all named hosts against the release code.
- [ ] Create a clean runtime ZIP with `manifest.json` at its root. Exclude the
  repository wrapper, `.git`, `node_modules`, tests, build scripts, development
  configs, README/store metadata and credentials. Preserve bundled OCR assets
  and their license files. Load this exact archive's extracted contents to test.
- [ ] Provide reviewer instructions for a public ST example, source setup and
  expected unavailable states. Confirm a missing personal key or login does not
  prevent testing the public manufacturer results.
- [ ] Select visibility/regions, submit for review and record the resulting
  item ID, version and outcome here.

### Known limits to disclose

Source availability varies; some lookups depend on browser sign-in, a user key
or supplier site behavior. Exact matching can return no result. Only supported
STM32 photos and family comparisons are implemented. Photo readings describe a
catalog sample, not current inventory, and manufacturer reports may be regional
or probable-origin estimates. No report establishes a fully China-free supply
chain. These limits must remain visible in the shipped interface and listing.

**Rejection history:** None; no submission made.
