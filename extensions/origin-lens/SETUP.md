# Source setup

[Back to installation](README.md#install-or-update)

## Maximum-coverage checklist (0.12.4)

- [ ] Save your **Mouser Search API key** in Origin Lens. This is the only
  user-supplied API key the extension currently uses.
- [ ] Sign in to **DigiKey** and have at least one saved list. It can be empty;
  parts do not need to be added to it.
- [ ] Sign in to **myTI Import details** for TI manufacturer reports.
- [ ] Use the **same browser profile** for those sign-ins and the extension.
  Enable the component types you want, then refresh the product-page panel.

ST (supported STM32 parts), Microchip, Infineon, Harwin, Samtec, and LCSC STM32
photos/OCR need no personal API key or sign-in. They run automatically for
supported parts, even without Mouser configured. Each person uses their own
Mouser key and browser sign-ins; credentials are not included in the download.

TI Product Information/Store, LCSC, JLCPCB, Nexar, and AI-service API keys are
**not used by Origin Lens**. Some are used by separate sourcing helpers or API
research; obtaining them does not add coverage to this extension version.

## Mouser Search API

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

## DigiKey

Sign in to DigiKey normally in the same browser. If Origin Lens reports that a
list is needed, follow the panel's setup instructions to create one empty list
or select an existing shared list. The viewed part does not need to be added;
Origin Lens does not change the list. No DigiKey developer API key is required.

## Texas Instruments

Sign in through [TI Import details](https://www.ti.com/support/import-details.html)
in the same browser, then click **Refresh** in Origin Lens. The TI tab can be
closed afterward. If the session expires, sign in again.

The report uses **United States** as the ship-to destination and labels that
scope. Origin Lens has no TI API-key field: Product Information API credentials
do not replace this website sign-in. Separate API enrollment and research are
in the [developer guide](DEVELOPMENT.md#ti-api-keys-separate-access-for-api-research).

## Confirm the setup

On a supported product page, click **Refresh** and check the source rows:

| Source | What to look for |
| --- | --- |
| Mouser | A result linked to **Mouser Search API**. “Key saved” alone only confirms storage. No Mouser browser sign-in is needed for this API path. |
| DigiKey | A dated result without a sign-in or list-setup prompt. |
| Texas Instruments | On a TI part, a **TI Import details** result with the United States ship-to scope, without a sign-in prompt. |

A valid setup does not guarantee origin or every manufacturing-stage field for
every part. An exact match may have missing data, and supplier protection or
service failures may temporarily block a source. Other source rows still work.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No panel | Turn Origin Lens on, enable the part's component type, and reload the product page. Passives are off by default. |
| Mouser says Setup required | Save a Search API key in this browser profile; the website fallback could not return a result. |
| Mouser says Check API key | Confirm Search API access is enabled and the key was copied correctly. |
| Sign-in required | Sign in to that supplier normally in the same browser, then refresh the panel. |
| Source unavailable | Open its source link to check the exact part. Site protection, missing data, and ambiguous matches can prevent a lookup. |
| Old version after download | Replace the files at the installed path, click Reload on the extension card, then reload product pages. |

**Settings** in the popup opens the controls in a full tab. **Clear cached
results** keeps the Mouser key; **Remove key** deletes it. For details about
local storage and requests, see the [privacy policy](PRIVACY.md).
