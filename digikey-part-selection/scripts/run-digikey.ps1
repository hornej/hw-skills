param(
    [string]$Python = 'python',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CatalogArgs
)
$ErrorActionPreference = 'Stop'

# Credentials are supplied to the process by the user's environment or secret manager.
# The Python helper checks credentials only when a live request is required;
# cache-only reads and --help work without them.
& $Python (Join-Path $PSScriptRoot 'digikey.py') @CatalogArgs
exit $LASTEXITCODE
