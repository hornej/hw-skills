# Origin Lens store assets

Prepared October 20, 2026; settings and promotional captures refreshed October 21.
No item has been submitted to the Chrome Web Store.

| Upload field | File | Dimensions |
| --- | --- | --- |
| Screenshot 1 | [Source reports](01-source-reports.jpg) | 1280 × 800 JPEG |
| Screenshot 2 | [Component controls](02-component-controls.jpg) | 1280 × 800 JPEG |
| Screenshot 3 | [Package-photo evidence](03-package-photo.jpg) | 1280 × 800 JPEG |
| Small promotional tile | [Origin Lens](promo-440x280.jpg) | 440 × 280 JPEG |
| Store icon | [128 px icon](../icons/icon-128.png) | 128 × 128 PNG |

The promotional tile's editable source is [promo-440x280.svg](promo-440x280.svg).
It uses the existing Origin Lens mark, plain typography and feature descriptions.
There is no slogan or claim of supplier endorsement. A marquee is optional and
is not included.

## Capture provenance

The source-report and photo screenshots are unaltered Chrome viewport captures
of the installed Origin Lens 0.12.3 interface on
[DigiKey's STM32G491RET6 page](https://www.digikey.com/en/products/detail/stmicroelectronics/STM32G491RET6/13592591).
The source view was refreshed before capture and includes separate DigiKey,
Mouser API and ST evidence. The photo view shows the LCSC sample, its CHN reading
and the sample-specific qualification. Values and availability are dated
observations, not claims about all inventory. No credentials or account details
are visible. Versions 0.12.4 and 0.12.5 retain these report interfaces, with
changes to API-cache handling and privacy/support links.

The settings image renders the actual `popup.html`, CSS and JavaScript with
default preferences in an isolated local preview, alongside explanatory copy.
Its mock Chrome storage starts empty; no installed extension preferences or
API keys are read. The promotional image is rendered from the existing vector
mark and the SVG source above. Both are browser captures, not generated product
results. The settings and promotional captures were refreshed from their source
files for 0.12.5 using only Origin Lens branding.

To reproduce the settings and promo capture surfaces:

```text
node extensions/origin-lens/scripts/preview-store-assets.cjs
```

Open `http://127.0.0.1:8766/` at 1280 × 800 for settings, or
`http://127.0.0.1:8766/store-assets/promo-440x280.svg` at 440 × 280 for the tile.
The server listens only on loopback. Stop it after capture. Do not put real
credentials into the preview.

The release ZIP excludes this directory and both preview scripts. Use the images
in the store dashboard's separate graphics fields. See the
[listing and submission record](../CHROMEWEBSTORE.md) for copy and review steps,
and Google's [image requirements](https://developer.chrome.com/docs/webstore/images).
