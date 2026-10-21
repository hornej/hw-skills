# Origin Lens privacy policy

Effective date: October 21, 2026

Maintainer: **[hornej](https://github.com/hornej)**

Support and privacy questions: **[GitHub issue tracker](https://github.com/hornej/hw-skills/issues)**.
Issues are public; do not post credentials or confidential information.

Origin Lens compares origin and manufacturing information for electronic
components on supported DigiKey and Mouser product pages. This policy explains
what the extension processes, where requests go, and how to remove local data.

## Information used by the extension

On a supported product page, Origin Lens reads the manufacturer, full part
number, distributor part number, product URL and component category. It uses
these identifiers to match reports to the exact component and to apply your
component-type settings. It does not request access to your general browser
history or monitor unrelated websites.

The extension retrieves product information such as declared country of origin,
manufacturing locations, source links, check times, ordering options and catalog
photos. It distinguishes catalog declarations, document evidence, estimates and
observations from a photographed sample. Downloaded website responses are parsed
as data; their scripts are not run by the extension.

Origin Lens also uses your on/off and component-type preferences, optional source
settings, and API request timestamps. If you supply a Mouser Search API key, the
extension saves it in a separate local credential database and sends it only to
Mouser's API. This database is local browser storage, not an encrypted vault.
Keys are not included in reports or shared with product-page scripts.

## Requests to suppliers and manufacturers

Lookups send relevant part identifiers directly from your browser to the
applicable sources below. Contacted servers also receive normal network
information, such as your IP address. They control their own logging, retention
and account handling under their policies.

| Recipient | Purpose | Privacy information |
| --- | --- | --- |
| DigiKey (`www.digikey.com`) | Exact-part origin lookup and, when needed, list-ID discovery | [DigiKey privacy](https://www.digikey.com/en/help/Privacy) |
| Mouser (`www.mouser.com`, `eu.mouser.com`, `api.mouser.com`) | Exact-part search and trade-compliance reports; the API receives your supplied key | [Mouser privacy](https://www.mouser.com/en/privacypolicy/) |
| Texas Instruments (`www.ti.com`) | Import details for the exact ordering code, with United States explicitly selected as the report destination | [TI privacy](https://www.ti.com/legal/terms-conditions/privacy-policy.html) |
| STMicroelectronics (`www.st.com`, `ksmk.st.com`) | STM32 product identity, origin and ordering-code options | [ST privacy](https://www.st.com/content/st_com/en/about/security-and-privacy/corporate-privacy-statement.html) |
| Microchip (`www.microchip.com`) | Exact-part origin and manufacturing fields | [Microchip privacy](https://www.microchip.com/en-us/about/legal-information/privacy-notice) |
| Infineon and its dedicated Coveo search service (`www.infineon.com`, `infineontechnologiesproduction6kx2o63f.org.coveo.com`) | Exact ordering-code origin, assembly and diffusion reports | [Infineon privacy](https://www.infineon.com/legal/privacy-policy) |
| Harwin (`www.harwin.com`) | Exact-part declared origin | [Harwin privacy](https://www.harwin.com/support/privacy-policy) |
| Samtec (`www.samtec.com`) | Exact-part probable-origin estimate | [Samtec legal and privacy information](https://www.samtec.com/about/legal/) |
| LCSC (`www.lcsc.com`, `assets.lcsc.com`) | Match STM32 product listings and retrieve reference photos | [LCSC privacy](https://www.lcsc.com/help/privacy) |

Your browser can attach an existing signed-in session to DigiKey, Mouser website
and TI requests. Those services may associate the lookup with your account.
Origin Lens does not extract your passwords or cookie values, and it does not
share a signed-in session with other users. API requests to Mouser omit browser
cookies. TI's United States destination is a report setting, not your detected
location.

DigiKey list discovery reads list metadata to identify a usable list; it does not
read list contents or add parts. Origin Lens does not create lists, modify
supplier accounts, place orders or access payment information.

Package markings are read locally using a bundled OCR engine and language model.
Photos are processed in memory on your device, not uploaded to an OCR or AI
service. Extracted text, confidence scores, image hashes and source references
may be saved with the local photo-evidence report. Expanding a photo preview
requests that image from LCSC without a referrer.

## Local storage and retention

Settings and eligible source reports use local extension storage. The optional
Mouser key uses the extension's IndexedDB database. These records are not stored
in Chrome's synchronized settings or sent to the project maintainer.

Mouser Search API results are displayed on the current page and are **not saved
to the report cache** or reused from it on another page. Earlier cached API
reports are removed when the updated extension starts or loads a product page.
Request timestamps, without API response content, support local rate limits.

Other eligible source and photo-evidence reports are limited to 100 cached
records. They are fresh for one hour and may be displayed as dated fallbacks for
up to seven days. ST family comparisons have a separate limit of 30 records.
Expiry is checked when records are used or saved; inactive records may remain
on disk until a later cleanup or deletion. Preferences and the optional key
remain until you change or remove them, or uninstall the extension. Your browser
and supplier websites may maintain their own caches and account data separately.

## Your controls

- Turn **Enable Origin Lens** off to stop its product-page lookups. Uncheck a
  component type to stop panels and lookups for that group. Collapsing or hiding
  a panel alone does not disable lookups.
- Use **Data sources & cache → Clear cached results** to remove saved reports.
  This retains preferences and your optional API key.
- Use **Remove key** to delete the saved Mouser credential. Clearing reports
  does not delete it.
- Uninstall Origin Lens to remove its local extension data. This does not delete
  information held by supplier accounts or revoke a key at its issuer.

## Project support

Origin Lens has no publisher-operated data collection server, analytics,
advertising trackers or crash-reporting service. The project maintainer does not
receive your part lookups, browsing records, credentials or source reports through the
extension. We do not sell this information, use it for advertising, or use it
for creditworthiness or lending decisions.

Use the [GitHub issue tracker](https://github.com/hornej/hw-skills/issues) for
support or privacy questions. The maintainer can read the account name and
information you choose to post and use it to respond to your request. Do not
include API keys, passwords or confidential project data in a public issue.

The project documentation and public issue tracker are hosted on GitHub. Opening
those links is subject to GitHub's own policies; information you post in a public
issue is public. External source links are also handled by the destination site.

## Changes

We will update this policy and its effective date when the extension's data
practices change. Any future shared-server service or different credential flow
will require updated disclosures before it is introduced. This policy describes
the current browser-based extension.
