# Origin Lens changes

Version 0.2 adds automatic cross-source
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
Version 0.12.5 uses only Origin Lens branding in the documentation, settings
preview and promotional tile, and directs popup support links to GitHub.
