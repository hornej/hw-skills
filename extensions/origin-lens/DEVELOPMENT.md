# Developing and distributing Origin Lens

For installation and source setup, see the [README](README.md) and [setup guide](SETUP.md).
This document covers release packaging, store distribution and validation history.

## Install from Git

```sh
git clone https://github.com/hornej/hw-skills.git
```

Load `extensions/origin-lens` through Chrome's **Load unpacked** control.
To update a clean checkout on `main`, run `git pull --ff-only`, reload the
extension, then reload open product pages. Keep the checkout at the same path.

## Sharing and automatic updates

For a few prototype testers, share the [installation guide](README.md) and its release download.
Each person installs their own copy, configures their own accounts/key, and
follows the manual update steps. Share extension files without credentials,
browser-profile data or API-settings JSON files.

For ongoing use by coworkers, the recommended route is an **unlisted Chrome Web
Store listing**. Users install from its link and Chrome automatically receives
published updates. They no longer need Developer mode or local source folders.
See Chrome's [distribution overview](https://developer.chrome.com/docs/extensions/how-to/distribute).

| Distribution | Installation and updates | Who can install |
| --- | --- | --- |
| GitHub ZIP or Git clone | Load unpacked; replace/pull files, reload extension and product pages for every update | People with the source files |
| Chrome Web Store: **Unlisted** | Install once from the store link; automatic updates | Anyone with the link; hidden from normal store discovery |
| Chrome Web Store: **Private** | Install from the store with an allowed Google account; automatic updates | Specified testers or configured groups |
| Chrome Web Store: **Public** | Search or follow the link; automatic updates | Everyone in the selected distribution regions |

Unlisted is convenient for link sharing, but it does not restrict access to a
team. Choose Private if that restriction matters. All three store visibility
options go through Google's review. See the official
[visibility settings](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

Existing unpacked users will need to install the store edition once when it is
available. Plan to re-enter settings and the Mouser key; the store edition can
have a different extension ID and does not automatically inherit local data.
Remove or disable the unpacked copy to avoid duplicate panels.

### Publish to the Chrome Web Store

The [store listing and readiness record](CHROMEWEBSTORE.md) contains the listing
copy, permission explanations, privacy disclosures and reviewer steps. The
[store assets](store-assets/README.md) contain three screenshots, the small
promotional tile and capture details. The publisher is **Basement Labs**, with
**info@basementlabs.net** as the public support/privacy contact. See the
[privacy policy](PRIVACY.md).

Build the runtime-only release with Python 3 from the repository root:

```text
python extensions/origin-lens/scripts/package-release.py
```

The script writes `dist/origin-lens-<version>.zip`, a SHA-256 checksum, a
per-file inventory and `dist/origin-lens-<version>-publish-kit.zip` containing the
separate store materials. Upload the inner runtime ZIP as the extension; the
publication kit is for organizing the submission. The script checks manifest assets,
icon sizes, bundled OCR hashes and common credential-literal patterns. The ZIP
excludes development tools, tests, store graphics, source documents and settings.
Keep the inventory with the release; test the exact archive's extracted contents
before submission.

1. [Register a developer account](https://developer.chrome.com/docs/webstore/register)
   and pay Google's one-time registration fee. Set a publisher name and verified
   contact email, and enable the required
   [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification).
2. Test the release in desktop Chrome. Package only the extension's runtime
   files and bundled assets, with **`manifest.json` at the ZIP root**. Do not
   upload the entire `hw-skills` repository archive. See
   [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare).
3. Complete the listing, screenshots, small promotional image, privacy-policy
   URL, data-use disclosures, permission explanations and reviewer instructions.
   Use the prepared assets and current data-flow inventory in the readiness record.
4. Choose **Unlisted** (or another desired visibility), submit for review, then
   share the approved store link. Approval and review time are not guaranteed.
   See Google's [publishing guide](https://developer.chrome.com/docs/webstore/publish).
5. For later releases, increase the manifest version and upload the new ZIP to
   the **same store item**, then submit the update for review. After publication,
   Chrome distributes it automatically; it is not instantaneous, and changes to
   permissions can require user action. Pushing to GitHub alone does not publish
   a store update. See [Update your item](https://developer.chrome.com/docs/webstore/update).

### Shared credentials

Private visibility restricts who can install an extension; it does not make
bundled keys secret or share a browser's signed-in session. This release contains
no publisher keys. Each browser needs its own configured Mouser key and any
required supplier sign-in.

A future team service could authenticate users and hold provider-approved
application credentials on a server, with request limits and revocation. That
requires the provider's permission for this application and audience; private
distribution does not change those terms. [Mouser's API terms](https://www.mouser.com/apiterms/)
restrict key disclosure, application reuse and API-content caching. [TI's API
terms](https://www.ti.com/developer-api/product-information-api-suite/reference/api-terms-of-use.html)
also restrict credential disclosure and third-party distribution. Confirm the
intended service with each provider before enabling shared access.

TI origin in this release uses the myTI website session. Product Information
Suite credentials do not replace that flow. No shared server or credential
service is included in this release.

## TI API keys: separate access for API research

The current TI origin source uses your myTI browser session. The steps below
obtain credentials for TI's official APIs; Origin Lens has no TI API-key field.
Our [live API check](SOURCES.md#product-information-api-access-check) found no
COO or manufacturing locations in the Product Information responses, and its
token did not authenticate the Import details website endpoint.

To obtain Product Information access, follow TI's
[Product Information keys and access guide](https://www.ti.com/developer-api/product-information-api-suite/keys-access.html):

1. Create or join a **myTI company account**. A company account administrator
   manages API access.
2. In **myTI dashboard**, open **Company Account → API Keys and Access**.
3. Find **TI Product Information API Suite**, select **Enable**, and review
   and accept TI's API terms if you agree to them.
4. Copy the generated **API key and secret** into your secret manager before
   closing the dialog. TI limits secret visibility to 30 minutes or closing
   the viewed dialog, whichever happens first. The key/secret pair can only
   be regenerated once every 24 hours.
5. For this project's API evaluations, store them as `TI_API_KEY` and
   `TI_API_SECRET` in Bitwarden Secrets Manager. These are API credentials,
   separate from your myTI login password.

**TI Store API suite requires separate approval.** From the same access page,
request the Store suite and follow TI's
[Store keys and access guide](https://www.ti.com/developer-api/store-api/keys-access.html).
TI currently requires an API-eligible company checkout profile using bank
transfer or a line of credit. Wait for TI's approval; having a working Product
Information key does not establish Store access. The same key pair can serve
the enabled suites, so a separate pair is not necessarily required. Store
support is not yet integrated into Origin Lens.

## Validation

From the repository root, using Node 20 or newer:

```text
pnpm --dir extensions/origin-lens install --frozen-lockfile
node --test extensions/origin-lens/tests/*.test.cjs
node --check extensions/origin-lens/core.js
node --check extensions/origin-lens/network.js
node --check extensions/origin-lens/st-options.js
node --check extensions/origin-lens/background.js
node --check extensions/origin-lens/content.js
node --check extensions/origin-lens/popup.js
node --check extensions/origin-lens/popup-api.js
node --check extensions/origin-lens/credentials.js
```

The offline tests cover source provenance, full-MPN matching, ST identity
mapping, read-only requests, URL and sender restrictions, cache separation,
disagreements, independent errors, concurrent worker requests, saved off state,
cross-tab toggle behavior, category detection, per-type request cancellation,
settings initialization races, popup persistence, failed-save recovery, and
contextual list guidance that disappears after a successful retry, and verified
manufacturer alias matching without merging conflicting origin declarations.
Harwin and Samtec tests parse minimal live-derived HTML fixtures with LinkeDOM
(test-only; not shipped or loaded by the extension). They cover exact-code and
canonical checks, duplicate/changed schemas, missing countries, fixed requests,
type cancellation, cross-site cache reuse, stale/invalid records, and preserving
the Samtec estimate qualifier in rendering and source counts.
TI tests cover exact full-code matching including suffix variants, multiple
origins, alternate-code separation, unknown country fields, destination-aware
cache validation, normal sign-in recovery, fixed endpoint/credential scope,
bounded failures, cancellation and rendering on both distributor sites.
TI, Infineon, Harwin and Samtec cache tests also replay reports with reordered
object keys, as can happen across browser message/storage boundaries.
The TI fixture reconstructs the signed-in table's observed values using the
public client's field mapping; it is not represented as a raw API capture.
Sharing tests cover all three supported sources on both distributor views,
updates between open pages, failed refreshes retaining dated reports, late
responses, cache-read races, legacy records, source/region/SKU isolation, stale
and expired reports, and direct refresh through a known Mouser product URL.
Infineon tests cover live-derived public fixtures, regional/material disagreements,
YY and unknown codes, exact OPN/suffix matching, incomplete responses, token
redaction, fixed hosts, credential-free lookup, cancellation, and cache sharing.
API tests cover exact-part/SKU ambiguity, manufacturing-stage separation, secret
redaction, cookie-free requests, no-key-only fallback, local rate limiting,
key-change cancellation, live-only API results on both sites, legacy API-cache
removal, and Microchip mapping.
Recovery tests cover missing-key fallback errors, trusted settings navigation,
the setup shortcut and keyboard focus, and cancellation/error preservation.
Photo tests cover exact metadata and image-SKU matching, suffix and ambiguity
rejection, URL bounds, changed fingerprints, unknown markings, separate photo
and COO fields, cross-site cache sharing, and the master switch.
They also cover top-side filtering regardless of gallery order, bottom-only
listings, rejection of old mixed-view caches and exclusion of underside links.
OCR tests cover confidence/consensus, unsupported codes, conflicting readings,
part mismatch, bounded records, forged observations, old-cache refresh, image
allowlists, cancellation and offscreen lifecycle. The C3228560 fixture contains
real browser OCR output from the original LCSC photograph (provenance in
`SOURCES.md`); it reproduces the weak grayscale reading and successful fallback.
Tests also cover literal TWN/PHL codes, blue-watermark suppression, preserving
the two-pass fast path, and country-specific reference links on both distributors.
Asset hashes check that the bundled engine and model match the pinned build.

To rebuild OCR assets after an intentional dependency update, run `pnpm install
--ignore-scripts` and `pnpm run build:ocr` in this directory. Normal unpacked
installation uses the already bundled files. See `THIRD_PARTY_NOTICES.md`.

Live adapters were checked in both distributor directions. The rendered panel was
tested on Mouser using actual captured source records and simulated extension
messaging/storage. This does **not** establish installed service-worker behavior
or Chrome's cross-origin cookie handling in your profile. The installed global
toggle was subsequently verified on DigiKey in the in-app browser. On 2026-10-20,
after the user saved the Mouser key, refreshing the installed panel on DigiKey's
STM32G491RET6 page returned **Mouser Search API → Taiwan**, checked at 09:57:01
local time, alongside DigiKey and ST. No Mouser page was opened. This confirms
the installed API path for that exact part; the screenshot's STM32F070CBT6TR
was not independently rechecked. Version 0.5.2's setup UI was verified in a
local browser preview and tests; it still requires an extension reload to load.
The Microchip network/parser code was verified live; Mouser parsing was also
checked against captured authenticated responses from the preceding acceptance test.
Settings were tested with real IndexedDB in a local preview and a synthetic key.
On 2026-10-20 the actual LCSC network/parser adapter ran in an isolated browser
world against live search, product and image responses for STM32G491RET6. It
returned C3231005, three photos and the fingerprint-matched CHN observation.
A temporary DigiKey rendering preview showed that evidence alongside the
existing source reports and loaded the 900×900 image. This preview used simulated
extension messaging/storage; installed 0.6.0 host access still requires reloading
the extension and the product page. The temporary preview was removed afterward.
For 0.7.0, the actual bundled browser OCR engine was tested under a local-only
CSP using downloaded LCSC photographs. It read CHN on STM32G491RET6 and MYS on
STM32F103C8T6, both from two agreeing passes, without consulting manual reviews.
Browser cancellation also stopped a job. These checks establish OCR operation
in the in-app browser; installed extension/offscreen behavior still needs a
reload and product-page refresh. No installed-extension result is claimed here.
Version 0.8.0's collapse, keyboard expansion, hide action and narrow layout were
checked in the isolated browser preview; 78 tests passed. Version 0.9.0's actual
Infineon network/parser path was verified against live CYW43439KUBGT and
IRLML6344TRPBF responses. The full suite now has 86 passing tests. Infineon needs
an extension reload for its two new host permissions; installed browser access
has not yet been verified. The preview can be run with
`node extensions/origin-lens/scripts/preview-panel.cjs --infineon`.
See
[RESEARCH.md](RESEARCH.md) for exact observations and remaining validation limits.

For 0.11.0, the actual bounded network operations fetched two Samtec and two
Harwin pages without credentials. Both parsers passed against the full live
HTML, including the native browser's inert-template parser in a local panel
preview. The preview displayed Samtec's `Malaysia · probable` separately from
declared-origin counts and Harwin's `United Kingdom` as a declaration.
Installed-extension behavior with the two added host permissions still requires
an extension reload and product-page refresh.

For 0.12.0, the user signed into myTI and reloaded the unpacked extension in the
in-app browser. The live DigiKey TPS259474ARPWR page then displayed TI Import
details → Taiwan / United States, with ship-to United States and the separate
TPS259474ARPWR.A → United States alternative. After closing the TI tab, the
Mouser page also fetched that report successfully. Both sites kept DigiKey and
Mouser's separate China declarations visible. No TI page needs to remain open
for the background lookup once the browser is signed in.
After applying the cache-validation fix and reloading the extension, both
distributor pages reused the same saved TI report and checked timestamp without
another lookup. The TI-only change passed all 113 tests in an isolated worktree.

## Known limits and references

DigiKey and ST website services are undocumented and may change. Mouser search,
markup, or site protection may also change. An unavailable source without a valid
saved report is shown without assigning a country. If a source loads data after the panel
appears, use Refresh. If exact identity cannot be established, no panel is inserted.
See [SOURCES.md](SOURCES.md) for source coverage and researched candidates.

See Chrome's [cross-origin request documentation](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests),
[cookie behavior](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies),
and [unpacked extension setup](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
