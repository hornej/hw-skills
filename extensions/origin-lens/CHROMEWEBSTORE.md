# Chrome Web Store listing — Origin Lens

Last updated: 2026-10-20

**Release candidate 0.12.4 prepared; not submitted.** Publisher: Basement Labs.
This record contains the submission copy and remaining dashboard/manual checks.
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
extension off. Passives are hidden by default. Eligible source reports are saved
locally with check times. Mouser API reports are requested live and are not cached.

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
| Screenshot 1 | 1280 × 800 JPEG | Prepared | `store-assets/01-source-reports.jpg` |
| Screenshot 2 | 1280 × 800 JPEG | Prepared | `store-assets/02-component-controls.jpg` |
| Screenshot 3 | 1280 × 800 JPEG | Prepared | `store-assets/03-package-photo.jpg` |
| Small promotional tile | 440 × 280 JPEG | Prepared | `store-assets/promo-440x280.jpg` |
| Marquee image | 1400 × 560 | Optional; not prepared | — |

Capture details and the editable tile are in [store-assets](store-assets/README.md).
Images exclude account details and credentials. They use the existing plain
visual style; no slogans or implied supplier endorsement. See Google's
[image requirements](https://developer.chrome.com/docs/webstore/images).

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

**Local storage and deletion:** Preferences and eligible source reports use local
extension storage; the Mouser key uses a separate extension IndexedDB database.
There is no Chrome sync of these records. The credential store is not an
encrypted vault. Origin/photo reports are limited to 100 cached records, with a
one-hour freshness period and dated fallback for up to seven days. ST family
comparisons are limited to 30 records. Expiry is enforced on use/save; idle
records may remain on disk until a later save or deletion. **Clear cached
results** removes reports but retains the key. **Remove key** removes the saved
key. Uninstalling removes the extension's local data.

Mouser API response reports are not persisted or reused from the report cache.
Older cached API reports are removed on worker startup or product-page load.
Only request timestamps are retained to enforce local API request limits.

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

**Public privacy-policy URL:**
[Origin Lens privacy policy](https://github.com/hornej/hw-skills/blob/josh-origin-lens-store-release/extensions/origin-lens/PRIVACY.md).

The [policy source](PRIVACY.md) identifies Basement Labs and
info@basementlabs.net, with direct supplier requests, credentials, retention,
deletion and support handling. Verify the public URL without authentication
before submitting. The policy does not replace the dashboard disclosures.

## Distribution

**Selected visibility:** Unlisted, for sharing a link with coworkers.
Anyone with the link could install it. Use Private instead if installation must
be limited to named Google accounts or configured groups.

**Regions:** Pending publisher selection. English product paths are the current
supported browsing scope; TI reports are explicitly for a United States
destination regardless of the user's location.

See [visibility and regions](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
Unlisted and Private submissions still require review.

## Developer information

- **Publisher name:** Basement Labs.
- **Contact email:** info@basementlabs.net; complete Google's email verification.
- **Support:** [Email Basement Labs](mailto:info@basementlabs.net) or [public issue tracker](https://github.com/hornej/hw-skills/issues). Do not post credentials or confidential data in issues.
- **Homepage:** [Origin Lens README](https://github.com/hornej/hw-skills/tree/josh-origin-lens-store-release/extensions/origin-lens).
- **Store item ID and installation URL:** Not created.

Do not place personal credentials, reviewer account passwords or API keys in
this repository. Supply any required reviewer access through the dashboard's
test-instructions controls.

## Version history

No version has been submitted. Use the release manifest's version when creating
the first item; increase it for subsequent uploads to that same item.

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.12.4 | 2026-10-20 | Initial store candidate; live-only Mouser API results, privacy policy and store assets; includes current OCR and ST document-evidence updates | Prepared; not submitted |

## Review notes and remaining work

- [ ] Select the publisher account; complete registration, verified email and
  2-Step Verification.
- [x] Set the release version to 0.12.4 on the release branch.
- [x] Prepare store screenshots and the small promotional tile.
- [x] Prepare the privacy policy, dashboard data inventory and listing copy.
- [x] Recheck permission scope: two extension permissions and fourteen named hosts.
- [x] Provide an allowlisted runtime ZIP builder with root manifest, licenses,
  pinned OCR assets, checksum and per-file inventory.
- [ ] Load the exact release ZIP's extracted contents in desktop Chrome for the
  final installation check. Disable the unpacked prototype first to avoid
  duplicate panels. Browser automation cannot operate the extension manager.
- [ ] Confirm the published policy URL and final dashboard data selections.
- [ ] Select visibility/regions, submit for review and record the resulting
  item ID, version and outcome here.

### Release build and reviewer instructions

Run `python extensions/origin-lens/scripts/package-release.py` from the release
checkout. Upload `extensions/origin-lens/dist/origin-lens-0.12.4.zip`, not the
repository archive. The adjacent `.sha256` and `-inventory.json` identify the
exact contents. Development scripts, tests, store assets and credentials are
excluded. The ZIP includes the extension license and bundled OCR notices.

1. Open [STM32G491RET6 on DigiKey](https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591).
   Origin Lens appears in the product details. The ST catalog, reviewed ST
   assembly notice and matched LCSC sample evidence can be inspected without a
   personal API key. Expand the photo and ordering-code comparison as needed.
2. Use the panel's title to collapse/expand it and its separate × control to hide
   it. From the toolbar popup, turn Origin Lens off/on; open pages update. Passives
   are off by default and can be enabled independently.
3. Open the exact part on Mouser using a source link. Each row retains its own
   source identity; public manufacturer coverage is available on either site.
4. No publisher account or payment is required. Mouser API lookup is optional:
   save a valid Search API key in **Data sources & cache**, then **Refresh**.
   With no key, the extension tries the Mouser website and may show **Setup
   required** if that source is inaccessible. Missing credentials do not block
   the public manufacturer rows. A key supplied for reviewer testing must be
   authorized by its issuer and entered through the dashboard's private review
   instructions, never in this repository or ZIP.
5. TI requires the reviewer's own normal myTI browser sign-in. With no session,
   its row explains the sign-in requirement. Website protection, supplier changes
   or unavailable part data may produce an explicit unavailable/unknown result;
   the extension does not assign a country from an unmatched part.

Run the offline suite with `node --test extensions/origin-lens/tests/*.test.cjs`.
It exercises matching, rendering, toggles, cancellation, credentials, source
failure paths, local OCR interpretation, migration and cache behavior. It does
not replace the final packaged-extension installation check.

### Sharing keys

Unlisted and Private control discovery/installation, not credential secrecy.
Neither protects a key embedded in the package or shares a signed-in session.
This candidate uses each user's own optional Mouser key and browser sessions.
A future authenticated team backend needs provider-approved use and revised
privacy disclosures; it has not been built. See [shared credentials](README.md#shared-credentials).

### Validation record — October 20, 2026

- All 124 offline tests passed on the isolated release checkout, including
  live-only Mouser reports on both distributor pages and legacy-cache removal.
- All first-party JavaScript files passed Node syntax checks.
- The package contains 32 runtime/license files; manifest references, PNG icon
  dimensions, pinned OCR SHA-256 values and ZIP integrity were checked.
- Three JPEG screenshots are exactly 1280 × 800; the JPEG promotional tile is
  exactly 440 × 280. Captures were visually checked for account details and keys.
- The existing installed interface was exercised on DigiKey for source refresh,
  collapse/expand and the photo disclosure. The release ZIP itself still needs
  the final manual load-unpacked check before store submission.

### Known limits to disclose

Source availability varies; some lookups depend on browser sign-in, a user key
or supplier site behavior. Exact matching can return no result. Only supported
STM32 photos and family comparisons are implemented. Photo readings describe a
catalog sample, not current inventory, and manufacturer reports may be regional
or probable-origin estimates. No report establishes a fully China-free supply
chain. These limits must remain visible in the shipped interface and listing.

**Rejection history:** None; no submission made.
