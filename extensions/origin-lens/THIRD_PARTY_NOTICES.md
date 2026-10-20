# Bundled OCR dependencies

The extension includes these pinned, locally executed dependencies:

| Package | Version | License / source |
| --- | --- | --- |
| Tesseract.js | 7.0.0 | Apache-2.0; [upstream](https://github.com/naptha/tesseract.js). Full license: `vendor/ocr/LICENSE-tesseract.txt`. |
| Tesseract.js-core | 7.0.0 | Apache-2.0; [upstream](https://github.com/naptha/tesseract.js-core). Full license: `vendor/ocr/LICENSE-core.txt`. |
| @tesseract.js-data/eng | 1.0.0 | npm packaging declares MIT; the [language data repository license](https://github.com/naptha/tessdata/blob/gh-pages/LICENSE) is Apache-2.0. Bundled file: `4.0.0_best_int/eng.traineddata.gz`; original README included. |

Tesseract.js contributors and the Tesseract OCR contributors retain their
respective copyright notices in the bundled licenses and upstream source.
The language package credits Balearica and jeromewu. Upstream Tesseract English
trained data is distributed by the [tessdata project](https://github.com/tesseract-ocr/tessdata)
under Apache-2.0 (the included Apache license text applies).

`pnpm-lock.yaml` pins package integrity. `scripts/build-ocr-assets.cjs` copies the
browser API, worker, all three LSTM CPU variants (scalar, SIMD, relaxed SIMD),
English model and notices into `vendor/ocr`. `SHA256.json` records the resulting
file hashes. No CDN or other remote executable is loaded at runtime.

LCSC photographs are fetched from LCSC at runtime and remain attributed to their
source. No distributor sample photographs are included in the extension bundle.
