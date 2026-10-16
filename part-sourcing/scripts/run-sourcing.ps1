[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('nexar', 'mouser')][string]$Provider,
    [string]$Python = 'python',
    [string]$SecretsFile = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'hw-skills\part-sourcing-bitwarden.json'),
    [string]$BitwardenHelper = '',
    [Parameter(Mandatory = $true)][string[]]$SourcingArgs
)

$ErrorActionPreference = 'Stop'
$requiredNames = if ($Provider -eq 'nexar') { @('NEXAR_CLIENT_ID', 'NEXAR_CLIENT_SECRET') } else { @('MOUSER_SEARCH_API_KEY') }
$helpOnly = $SourcingArgs -contains '--help' -or $SourcingArgs -contains '-h'
$environmentReady = @($requiredNames | Where-Object {
    [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_, 'Process'))
}).Count -eq 0
# Environment credentials work without Bitwarden or any separately installed skill.
# An explicit mapping selects Bitwarden; an existing default mapping is a fallback.
$useBitwarden = -not $helpOnly -and ($PSBoundParameters.ContainsKey('SecretsFile') -or
    (-not $environmentReady -and (Test-Path -LiteralPath $SecretsFile)))
if ($useBitwarden) {
    if (-not (Test-Path -LiteralPath $SecretsFile)) { throw 'The Bitwarden record mapping is missing; see references/credentials.md.' }
    try { $config = Get-Content -LiteralPath $SecretsFile -Raw | ConvertFrom-Json } catch { throw 'Invalid Bitwarden record mapping; contents suppressed.' }
    if (-not $config.project_id) { throw 'The Bitwarden project ID is required.' }
    foreach ($name in $requiredNames) {
        $recordId = [Guid]::Empty
        if (-not [Guid]::TryParse([string]$config.secrets.$name, [ref]$recordId)) { throw "Missing or invalid Bitwarden record ID for $name." }
    }
    $null = Get-Command bws -ErrorAction Stop
}
$null = Get-Command $Python -ErrorAction Stop
$envNames = @('BWS_ACCESS_TOKEN', 'NEXAR_CLIENT_ID', 'NEXAR_CLIENT_SECRET', 'MOUSER_SEARCH_API_KEY')
$priorEnv = @{}
foreach ($name in $envNames) { $priorEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$sourcingExit = 1
try {
    foreach ($name in $envNames) {
        if ($useBitwarden -or $helpOnly -or $name -notin $requiredNames) {
            [Environment]::SetEnvironmentVariable($name, $null, 'Process')
        }
    }
    if ($useBitwarden) {
        if (-not $BitwardenHelper -and -not [string]::IsNullOrWhiteSpace($priorEnv['BWS_ACCESS_TOKEN'])) {
            $env:BWS_ACCESS_TOKEN = $priorEnv['BWS_ACCESS_TOKEN']
        } else {
            if (-not $BitwardenHelper) {
                $skillHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' }
                $BitwardenHelper = Join-Path $skillHome 'skills\bitwarden-secrets\scripts\windows_bws_common.ps1'
            }
            if (-not $config.credential_target -or -not (Test-Path -LiteralPath $BitwardenHelper)) {
                throw 'Provide BWS_ACCESS_TOKEN or configure a trusted Credential Manager adapter and target.'
            }
            . $BitwardenHelper
            $env:BWS_ACCESS_TOKEN = Get-BwsTokenFromCredentialManager -Target $config.credential_target
        }
        if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) { throw 'Bitwarden machine access token is unavailable.' }
        foreach ($name in $requiredNames) {
            $recordJson = & bws secret get $config.secrets.$name 2>$null
            if ($LASTEXITCODE -ne 0) { throw "Could not retrieve $name from Bitwarden; response suppressed." }
            try { $record = $recordJson | ConvertFrom-Json } catch { throw 'Bitwarden returned invalid JSON; response suppressed.' }
            if ($record.id -ne $config.secrets.$name -or $record.key -cne $name -or
                $record.projectId -ne $config.project_id -or
                $record.value -isnot [string] -or [string]::IsNullOrWhiteSpace($record.value)) {
                throw "Unexpected or empty Bitwarden record for $name."
            }
            [Environment]::SetEnvironmentVariable($name, $record.value, 'Process')
            $record = $recordJson = $null
        }
    }
    # Normalize pasted whitespace without modifying the source secret record.
    if ($Provider -eq 'mouser' -and $env:MOUSER_SEARCH_API_KEY) { $env:MOUSER_SEARCH_API_KEY = $env:MOUSER_SEARCH_API_KEY.Trim() }
    Remove-Item Env:BWS_ACCESS_TOKEN -ErrorAction SilentlyContinue
    & $Python (Join-Path $PSScriptRoot 'part_sourcing.py') $Provider @SourcingArgs
    $sourcingExit = $LASTEXITCODE
} finally {
    foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $priorEnv[$name], 'Process') }
    $record = $recordJson = $null
}
exit $sourcingExit
