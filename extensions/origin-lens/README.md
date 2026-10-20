# Origin Lens prototype

[Install](#install-or-update) · [Update](#update-an-unpacked-installation) ·
[API keys](#get-api-keys) · [Share and publish](#sharing-and-automatic-updates)

A Chrome Manifest V3 extension that compares country-of-origin
reports on DigiKey and Mouser product pages. Version 0.2 adds automatic cross-source
lookup and an initial STMicroelectronics manufacturer adapter. Version 0.3.0 adds
persistent component-type controls alongside the global on/off switch. Version
0.3.1 shows DigiKey list setup only when a lookup requires it. Version 0.3.2
recognizes the verified Nexperia / Nexperia USA Inc. manufacturer naming difference.
Version 0.4.0 shares verified source reports across distributor pages and retains
dated reports when a new lookup is unavailable. Version 0.4.1 replaces the slogan
and rounded teal cards with compact monospaced settings and ruled source reports,
with neutral light/dark themes and square controls.
Version 0.5.0 adds Mouser Search API lookup from either distributor page and a
direct Microchip Product API adapter for COO, assembly and wafer-fabrication data.
Version 0.5.1 adds the monochrome origin-marker icon to Chrome's toolbar and
Extensions manager. The editable source is `icons/origin-lens.svg`; regenerate
the 16, 32, 48 and 128 pixel PNGs with
`node extensions/origin-lens/scripts/build-icons.cjs` from the repository root.
Version 0.5.2 makes missing Mouser API configuration explicit when website lookup
fails, adds a Configure Mouser action to the source row, and shows key status at
the top of the popup. Setup opens the extension's own settings in a tab.
Version 0.6.0 adds an LCSC reference-photo row for ST STM32 parts on either
distributor. Photos are matched to an exact catalog item. Reviewed package
markings are separate from declared COO and current-stock claims.
Version 0.7.0 automatically reads LCSC package markings using bundled local OCR.
No image-service account, API key, or remote code is needed.
Version 0.7.1 normalizes uppercase country names in the panel (for example,
TAIWAN → Taiwan), including saved results and manufacturing details. Original
source values remain unchanged.
Version 0.8.0 adds native collapse/expand while retaining a separate hide button.
Version 0.9.0 adds Infineon's public ECCN & HTS Finder, including regional COO,
assembly and diffusion records for exact full ordering codes.
Version 0.10.0 compares every ordering code in the viewed STM32 base part's ST
family listing, including package, packing, operating temperature and origin.
Version 0.10.1 keeps Mouser key status and controls inside Data sources & cache
and reduces row spacing so the collapsed settings fit within Chrome's popup.
Version 0.11.0 adds exact-part Harwin declared COO and Samtec probable-origin
estimates from public manufacturer product pages, without account setup.
Version 0.12.0 adds TI Import details through the existing myTI browser session,
with an explicit United States ship-to scope and separately listed specialized-flow alternatives.
It also fixes strict manufacturer-report cache checks when extension messaging
or storage reorders object keys, without accepting changed evidence values.
Version 0.12.1 restricts LCSC photo previews, links and OCR to top-side views
and documents API-key enrollment and configuration.
Version 0.12.2 recognizes TWN (Taiwan) and PHL (Philippines), adds a red-channel
fallback for blue-watermarked photos, and refreshes earlier OCR results automatically.
Version 0.12.3 adds reviewed ST assembly notices to the manufacturer row. For
STM32G491RET6 and STM32G491RET6TR, Taiwan and China are both visible, with the
catalog's declared COO and the notice's assembly locations labeled separately.
Version 0.12.4 prepares an unlisted store release with a privacy policy, store
graphics and reproducible packaging. Mouser API reports are now live-only, and
previously cached API reports are removed automatically.

## Install or update

Origin Lens currently installs from source as an **unpacked extension** in
desktop Chrome 120 or newer. There is no published Chrome Web Store listing yet.
No build, npm install, server, or Web Store developer account is needed to use it.

### Download and install

1. [Download the current prototype ZIP](https://github.com/hornej/hw-skills/archive/refs/heads/josh-coo-extension-prototype.zip).
   Alternatively, open the
   [prototype branch](https://github.com/hornej/hw-skills/tree/josh-coo-extension-prototype)
   on GitHub and choose **Code → Download ZIP**.
2. Extract the ZIP completely into a permanent folder. On Windows, right-click
   the ZIP and select **Extract All**. Keep the extracted files after installation;
   Chrome runs the extension from that folder. Do not load it from inside the ZIP
   or move the folder after installing.
3. Open `chrome://extensions` in Chrome and enable **Developer mode**.
4. Choose **Load unpacked**. Inside the extracted repository, select
   **`extensions/origin-lens`**, the folder containing `manifest.json`.
   Do not select the repository root or just the `extensions` folder. Keep its
   bundled `vendor` and `icons` folders intact.
5. Confirm **Origin Lens — DigiKey & Mouser** appears and is enabled. Use Chrome's
   Extensions puzzle-piece menu to pin Origin Lens if desired.
6. Open or reload a supported DigiKey or Mouser product page. For a first check,
   use [STM32G491RET6 on DigiKey](https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591).
   The **Country of origin** panel should appear. Passives are hidden by default;
   the popup's **Component types** controls determine which pages show a panel.

These steps follow Chrome's
[load-unpacked instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).
If **Load unpacked** is unavailable on a managed work computer, its browser
administrator may need to allow development extensions.

**Git alternative:** clone the prototype branch, then follow steps 3–6 using
the clone's `extensions/origin-lens` folder:

```sh
git clone --branch josh-coo-extension-prototype --single-branch https://github.com/hornej/hw-skills.git
```

### Configure data sources

1. For DigiKey results on either site, sign in to DigiKey normally. Origin Lens
   automatically uses your latest existing list. If DigiKey reports no lists,
   its result row explains how to create one empty list or select an existing
   shared list. The part being viewed does **not** need to be in that list.
   Sign-in and network failures do not ask you to create a list.
2. Open Origin Lens → **Data sources & cache**, enter your **Mouser Search API
   key**, and choose **Save key**. See [Get API keys](#get-api-keys) below for
   enrollment instructions. You can instead import a JSON settings file
   with `format: "origin-lens-api-settings-v1"` and `mouserSearchApiKey`. Never
   commit that file. The saved key is not displayed when reopening the popup.
   A key used by a separate sourcing tool is not automatically available to the
   browser extension. Reloading the extension does not configure a key.
3. For TI parts, sign in to [myTI through Import details](https://www.ti.com/support/import-details.html)
   in the same browser, then use **Refresh** in Origin Lens. No TI API key is
   required.

A Mouser Search API key enables automatic API lookup without opening or signing
in to Mouser. Without a key, the existing website lookup remains available. The
panel shows **Setup required** with **Configure Mouser** when that fallback fails,
instead of sending you to sign in to Mouser. A saved key's status confirms local
storage only; an API rejection remains visible as **Check API key** in the panel.
The manufacturer sources do not require the Mouser key.
Remove the extension through Chrome to uninstall it and its local data.

### Update an unpacked installation

Unpacked extensions do **not** download changes from GitHub automatically.

1. Update the files using the same method you used to install:
   - **ZIP:** download the latest prototype ZIP, extract it, then replace the
     contents of your installed `extensions/origin-lens` folder with the new
     folder's contents, including `vendor`. Keep the installed folder at the
     **same path**.
   - **Git:** from your `hw-skills` clone on `josh-coo-extension-prototype`, run
     `git pull --ff-only`. If Git reports local edits or a diverged branch,
     resolve them before continuing; do not discard your changes.
2. Open `chrome://extensions` and click the circular **Reload** arrow on the
   Origin Lens card. Check that its version matches the downloaded
   `manifest.json`. Review any new site-access prompt Chrome presents.
3. Reload open DigiKey and Mouser product pages so they use the new code.

Reloading the same installation preserves its saved settings, cache and Mouser
key. Do not remove and reinstall it for routine updates. Chrome's **Update**
button does not fetch a new GitHub ZIP or pull your Git clone.

## Sharing and automatic updates

For a few prototype testers, share this README and the source download above.
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

## Get API keys

Instructions checked against the providers' documentation on 2026-10-20.
**Mouser Search is the only API credential currently configured in Origin Lens.**

| Source | What Origin Lens needs |
| --- | --- |
| Mouser | A **Search API** key for automatic API lookup on either distributor site |
| DigiKey | A normal DigiKey browser sign-in; no DigiKey developer API key |
| Texas Instruments | A normal myTI browser sign-in for Import details; TI API credentials currently do not replace it |
| ST, Microchip, Infineon, Harwin and Samtec | No personal API key for the implemented sources |
| LCSC package photos and local OCR | No LCSC, JLCPCB or image-service API key |

### Mouser Search API: obtain and configure a key

1. Open [Mouser's Search API page](https://www.mouser.com/en/api-search/) and
   sign in to your My Mouser account, or create one.
2. Choose **Sign Up for Search API** under **Additional Resources**. Complete
   the Search API Request Form and any email verification requested by Mouser.
3. Mouser emails the Search API key and setup information. Request **Search API**
   access specifically; Origin Lens does not use Cart, Order or Order History keys.
4. Open Origin Lens from the browser toolbar, expand **Data sources & cache**,
   paste the key into **Mouser Search API key**, and select **Save key**. The
   popup's **Settings** link opens the same controls in a full tab if preferred.
5. On a supported DigiKey or Mouser product page, click **Refresh** in the
   Origin Lens panel. A successful API result links to **Mouser Search API**.
   Not every part has origin data, even when the key is valid.

The saved-key indicator confirms local storage, not a successful API request.
If the panel shows **Check API key**, verify that you copied a Search API key
and that Mouser has enabled it. **Setup required** means no key is configured
and the website fallback could not supply the result. To replace a key, save
the new value; **Remove key** removes it from this extension.

Keys in Bitwarden Secrets Manager, environment variables, or the separate
part-sourcing helper are not automatically copied into Origin Lens. Save or
import the key in each browser profile where the extension is installed.
Keep the original in your password/secret manager; never commit a key or an
API-settings JSON file to GitHub.

### TI API keys: separate access for API research

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
