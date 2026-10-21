# Origin Lens

Compare country-of-origin and manufacturing reports while browsing DigiKey or
Mouser. See each source separately, with links to its evidence, package-photo
markings, and supported STM32 ordering options.

**[Download 0.12.4](https://github.com/hornej/hw-skills/releases/download/origin-lens-v0.12.4/origin-lens-0.12.4.zip)** ·
[Source setup](SETUP.md) · [Report an issue](https://github.com/hornej/hw-skills/issues)

## Install or update

Requires desktop Chrome 120 or newer. This is a beta distributed through GitHub;
it is not yet listed in the Chrome Web Store. No build tools or developer account
are needed.

1. Download the ZIP above and extract it into a permanent folder, such as
   `Documents/Origin Lens`. Keep this folder after installation.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing
   `manifest.json`.
4. Open a DigiKey or Mouser product page. Try
   [STM32G491RET6 on DigiKey](https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591).
   The **Country of origin** panel appears in the product details.

Pin Origin Lens from Chrome's Extensions menu for easy access to its settings.
If your work browser blocks **Load unpacked**, ask your browser administrator.
These steps follow [Chrome's installation guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

Downloading the full repository instead? Select its `extensions/origin-lens`
folder in step 3. The release ZIP above contains just the extension.

## Get API keys

Only Mouser uses a personal API key in this release. Other source requirements
are listed below; one unavailable source does not block the others.

| Source | Setup |
| --- | --- |
| Mouser | For automatic lookup from either site, [get a Search API key](SETUP.md#mouser-search-api) and save it under **Data sources & cache**. Without a key, website lookup is attempted but may be blocked. |
| DigiKey | Sign in normally in the same browser. Follow any setup prompt in its result row. |
| Texas Instruments | Sign in to [myTI Import details](https://www.ti.com/support/import-details.html) in the same browser. No TI API key is used. |
| ST, Microchip, Infineon, Harwin, Samtec | No personal key or sign-in for the implemented sources. Coverage varies by part. |
| LCSC package photos | No key or sign-in. Currently supports ST STM32 parts, with marking recognition performed locally. |

Each person configures their own accounts and optional Mouser key.
See [source setup and troubleshooting](SETUP.md) for the steps.

## Use

- **Enable Origin Lens** turns panels and lookups on or off across open pages.
- **Component types** controls which parts show a panel. Passives are off by default.
- Click the panel heading to **collapse or expand** it. **×** hides it until
  you reload the page or turn the extension off and on.
- **Refresh** checks the sources again. Expand source details to inspect
  manufacturing stages, dates, and part matching.
- On supported STM32 parts, **Ordering options** compares package, packing,
  temperature, and declared origin across the base part's ordering codes.

## Update an unpacked installation

Updates are manual until the Chrome Web Store edition is available.

1. Download the current release linked above and extract it.
2. Replace the contents of the installed extension folder with the new files,
   keeping the **same folder path**, including `vendor` and `icons`.
3. In `chrome://extensions`, click **Reload** on Origin Lens. Then reload open
   DigiKey and Mouser pages.

Keeping the same installation preserves settings and the saved Mouser key.
Do not remove and reinstall for routine updates. Chrome's **Update** button
does not download GitHub releases.

## Reading the results

A catalog's declared origin does not establish every manufacturing stage or
the origin of a particular shipment. Samtec's probable-origin estimates and
LCSC photo readings are labeled separately. Package photos describe a sample;
ordering options are not a guarantee of drop-in compatibility. Origin Lens
does not certify a China-free supply chain.

Requests go directly to the suppliers. Settings and saved reports stay in your
browser; photo recognition runs locally. No publisher server or analytics is
used. See the [privacy policy](PRIVACY.md).

## More

[Source coverage](SOURCES.md) · [Evidence and behavior](DETAILS.md) ·
[Development and publishing](DEVELOPMENT.md) · [Change history](CHANGELOG.md)

Built by **Basement Labs**. Support: **info@basementlabs.net**.
