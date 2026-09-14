# DigiKey API credentials

Register an application with access to the Product Information API through the
[DigiKey developer portal](https://developer.digikey.com/). Use that application's
client ID and client secret for production catalog requests.

The bundled client reads two process environment variables:

| Variable | Value |
| --- | --- |
| `DIGIKEY_CLIENT_ID` | Your application's client ID |
| `DIGIKEY_CLIENT_SECRET` | Your application's client secret |

Inject them through your preferred secret manager or an existing private launcher.
No particular vault, account, secret ID or operating-system credential store is
required. Do not put actual values in command history, tracked files, prompts,
logs or screenshots. The helper does not read `.env` files automatically.

Use Python 3.10 or later. From the skill directory, with the variables already
available to the process:

```sh
python scripts/digikey.py --keyword "0402 10k 1% resistor" --limit 20 --output /path/to/project/search.json
python scripts/digikey.py --details EXACT_DIGIKEY_SKU --refresh --output /path/to/project/details.json
```

The optional Windows launcher forwards arguments to the same client:

```powershell
.\scripts\run-digikey.ps1 -Python 'python' -CatalogArgs @('--details', 'EXACT_DIGIKEY_SKU', '--refresh', '--output', 'D:\Project\details.json')
```

Create the output directory first. Cached reads and `--help` require no credentials.
For live requests, the Python helper consumes the variables from its own process
environment and keeps the OAuth token in memory. This does not clear variables
in the parent shell; manage those in the calling secret-manager session.

A successful secret-store read proves retrieval, not current DigiKey permission.
On 401/403, inspect the application subscription and authentication settings.
Avoid printing token requests or raw authentication responses while debugging.
If API access is unavailable, use current product pages and manufacturer
datasheets, and state which facts remain unverified.
