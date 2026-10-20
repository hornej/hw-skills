# Credential injection

The Python client accepts `NEXAR_CLIENT_ID`, `NEXAR_CLIENT_SECRET`,
`MOUSER_SEARCH_API_KEY`, `LCSC_API_KEY` / `LCSC_API_SECRET`, or the JLCPCB
credentials below through its process environment. Nexar access tokens are
obtained automatically. Do not substitute a portal-generated access token for the
client secret or a Mouser cart/order API key for its Search API key.
LCSC needs approved production access for its current API contract; see
[LCSC and JLCPCB](lcsc-jlcpcb.md). JLCPCB's app credentials are not interchangeable
with LCSC's.

For `jlcpcb`, supply `JLC_API_APP_ID`, `JLC_API_ACCESS_KEY` and
`JLC_API_SECRET_KEY`. The detail request uses HMAC authentication and does not
require the tokenization public/private keys. The Windows launcher neither
retrieves those keys nor passes existing tokenization variables to its child.
See the authentication section in
[LCSC and JLCPCB](lcsc-jlcpcb.md) before using any JLC credentials.

## Environment credentials

Inject the selected provider's variables through your preferred secret manager
or process environment, then run `scripts/part_sourcing.py`. No specific vault,
machine account, or operating-system credential store is required. The helper
does not load `.env` files automatically. Keep values out of command arguments,
tracked files and output.

The optional Windows [launcher](../scripts/run-sourcing.ps1) accepts the same
environment variables. Complete provider credentials take precedence over its
default local Bitwarden mapping; explicitly passing `-SecretsFile` selects that
mapping instead. Help requires no credentials. The launcher removes unrelated
provider variables and any Bitwarden bootstrap token from the child environment,
then restores the caller's environment on exit.

```powershell
# With the provider's variables already supplied to this process:
& .\scripts\run-sourcing.ps1 -Provider nexar -Python 'python' -SourcingArgs @('--part', 'STM32F091CBT6', '--manufacturer', 'STMicroelectronics', '--quantity', '1000')
& .\scripts\run-sourcing.ps1 -Provider mouser -Python 'python' -SourcingArgs @('--part', 'STM32F091CBT6', '--manufacturer', 'STMicroelectronics', '--quantity', '1000')
& .\scripts\run-sourcing.ps1 -Provider lcsc -Python 'python' -SourcingArgs @('--part', 'STM32G491RET6', '--manufacturer', 'STMicroelectronics', '--quantity', '1000')
& .\scripts\run-sourcing.ps1 -Provider jlcpcb -Python 'python' -SourcingArgs @('--part', 'STM32G491RET6', '--manufacturer', 'STMicroelectronics', '--sku', 'C3231005', '--quantity', '1000')
```

## Optional Windows Bitwarden integration

This route requires the `bws` CLI, access to the intended Secrets Manager project,
and a local record mapping. Supply the machine token as `BWS_ACCESS_TOKEN`, or use
a trusted local adapter selected with `-BitwardenHelper`. The adapter must define
`Get-BwsTokenFromCredentialManager -Target <target>` and return the token without
printing it. An explicitly selected adapter takes precedence over the environment
bootstrap token. If no token/adapter is provided, an installed `bitwarden-secrets`
helper under `CODEX_HOME/skills` (default `~/.codex/skills`) is a compatibility
fallback; it is optional and is not bundled in this repository.

The launcher retrieves only the selected provider's records and verifies their
IDs, names and project. It trims pasted outer whitespace from the Mouser Search
API key in memory without modifying the stored record. No secret value is saved
in the skill or record mapping.

The default local mapping is
`%LOCALAPPDATA%\hw-skills\part-sourcing-bitwarden.json`. Its fields are:

```json
{
  "credential_target": "YOUR_CREDENTIAL_MANAGER_TARGET",
  "project_id": "BITWARDEN_PROJECT_UUID",
  "secrets": {
    "NEXAR_CLIENT_ID": "SECRET_RECORD_UUID",
    "NEXAR_CLIENT_SECRET": "SECRET_RECORD_UUID",
    "MOUSER_SEARCH_API_KEY": "SECRET_RECORD_UUID",
    "LCSC_API_KEY": "SECRET_RECORD_UUID",
    "LCSC_API_SECRET": "SECRET_RECORD_UUID",
    "JLC_API_APP_ID": "SECRET_RECORD_UUID",
    "JLC_API_ACCESS_KEY": "SECRET_RECORD_UUID",
    "JLC_API_SECRET_KEY": "SECRET_RECORD_UUID"
  }
}
```

The target is needed only for the Credential Manager adapter. The other fields
are record locators, not credential values. Discover or confirm records without
printing values, and keep this machine-specific mapping outside the repository.
`-SecretsFile` overrides the default path. Other machines need their own authorized
bootstrap and mapping; installing the skill does not provision either.

Use a known Python 3.10+ interpreter when `python` is not on PATH. Capture output
in memory when testing Nexar; its data-retention limits also apply to saved
outputs. The launcher does not provide the separate user OAuth grant needed for
DigiKey quotes or tracing.

The Windows launcher has an offline isolation/error-path test:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tests\test_windows_launcher.ps1
```
