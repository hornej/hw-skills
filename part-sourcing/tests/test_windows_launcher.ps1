# Offline tests only: synthetic records, no Credential Manager or network access.
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot '..\scripts\run-sourcing.ps1'
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('sourcing-launcher-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testDirectory
$mappingPath = Join-Path $testDirectory 'mapping.json'
$helperPath = Join-Path $testDirectory 'helper.ps1'
$jlcNames = @('JLC_API_APP_ID', 'JLC_API_ACCESS_KEY', 'JLC_API_SECRET_KEY')
$tokenizationNames = @('JLC_API_TOKENIZATION_PUBLIC_KEY', 'JLC_API_TOKENIZATION_PRIVATE_KEY')
$names = @('BWS_ACCESS_TOKEN', 'NEXAR_CLIENT_ID', 'NEXAR_CLIENT_SECRET', 'MOUSER_SEARCH_API_KEY', 'LCSC_API_KEY', 'LCSC_API_SECRET') + $jlcNames + $tokenizationNames
$original = @{}
foreach ($name in $names) { $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

function Assert-True($condition, $message) { if (-not $condition) { throw $message } }
function bws {
    param($operation, $verb, $recordId)
    Assert-True ($operation -eq 'secret' -and $verb -eq 'get') 'Unexpected Bitwarden operation.'
    Assert-True ($env:BWS_ACCESS_TOKEN -eq 'synthetic-bootstrap') 'Missing bootstrap token during retrieval.'
    $global:SourcingLauncherTestReads++
    $global:LASTEXITCODE = 0
    $record = $global:SourcingLauncherTestRecords[$recordId].Clone()
    switch ($global:SourcingLauncherTestCase) {
        'mouser-whitespace' { $record.value = '  ' + $record.value + [Environment]::NewLine }
        'wrong-key' { $record.key = 'OTHER_CREDENTIAL' }
        'wrong-project' { $record.projectId = 'other-project' }
        'jlc-wrong-project' { $record.projectId = 'other-project' }
        'empty-value' { $record.value = '' }
        'retrieval-error' { $global:LASTEXITCODE = 1; return 'synthetic-sensitive-body' }
        'invalid-json' { return 'synthetic-sensitive-body' }
    }
    $record | ConvertTo-Json -Compress
}
function Invoke-SyntheticPython {
    $global:SourcingLauncherTestChildRan = $true
    Assert-True ($args[0] -like '*part_sourcing.py') 'Unexpected child program.'
    Assert-True (-not $env:BWS_ACCESS_TOKEN) 'Bootstrap token leaked to child.'
    foreach ($name in $tokenizationNames) {
        Assert-True (-not [Environment]::GetEnvironmentVariable($name, 'Process')) 'Unused tokenization key leaked to child.'
    }
    if ($args -contains '--help') {
        foreach ($name in $names) {
            Assert-True (-not [Environment]::GetEnvironmentVariable($name, 'Process')) 'Credentials leaked to help.'
        }
        $global:LASTEXITCODE = 0
        return
    }
    if ($args[1] -ne 'lcsc') {
        Assert-True (-not $env:LCSC_API_KEY -and -not $env:LCSC_API_SECRET) 'Unrelated LCSC keys leaked to child.'
    }
    if ($args[1] -ne 'jlcpcb') {
        foreach ($name in $jlcNames) {
            Assert-True (-not [Environment]::GetEnvironmentVariable($name, 'Process')) 'Unrelated JLCPCB credentials leaked to child.'
        }
    }
    if ($args[1] -eq 'jlcpcb') {
        foreach ($name in $jlcNames) {
            Assert-True ([Environment]::GetEnvironmentVariable($name, 'Process') -eq "synthetic-$name") 'Wrong JLCPCB credentials.'
        }
        Assert-True (-not $env:NEXAR_CLIENT_ID -and -not $env:NEXAR_CLIENT_SECRET -and -not $env:MOUSER_SEARCH_API_KEY) 'Unrelated provider keys leaked to JLCPCB child.'
    } elseif ($args[1] -eq 'lcsc') {
        Assert-True ($env:LCSC_API_KEY -eq 'synthetic-LCSC_API_KEY' -and $env:LCSC_API_SECRET -eq 'synthetic-LCSC_API_SECRET') 'Wrong LCSC credentials.'
        Assert-True (-not $env:NEXAR_CLIENT_ID -and -not $env:NEXAR_CLIENT_SECRET -and -not $env:MOUSER_SEARCH_API_KEY) 'Unrelated provider keys leaked to LCSC child.'
    } elseif ($args[1] -eq 'nexar') {
        Assert-True ($env:NEXAR_CLIENT_ID -eq 'synthetic-NEXAR_CLIENT_ID') 'Wrong Nexar ID.'
        Assert-True ($env:NEXAR_CLIENT_SECRET -eq 'synthetic-NEXAR_CLIENT_SECRET') 'Wrong Nexar secret.'
        Assert-True (-not $env:MOUSER_SEARCH_API_KEY) 'Unrelated provider key leaked to child.'
    } else {
        Assert-True ($env:MOUSER_SEARCH_API_KEY -eq 'synthetic-MOUSER_SEARCH_API_KEY') 'Wrong Mouser key.'
        Assert-True (-not $env:NEXAR_CLIENT_ID -and -not $env:NEXAR_CLIENT_SECRET) 'Unrelated provider keys leaked to child.'
    }
    $global:LASTEXITCODE = if ($global:SourcingLauncherTestCase -eq 'child-error') { 2 } else { 0 }
}

try {
    $projectId = [Guid]::NewGuid().ToString()
    $mapping = @{ credential_target='synthetic-target'; project_id=$projectId; secrets=@{} }
    $global:SourcingLauncherTestRecords = @{}
    foreach ($name in $names | Where-Object { $_ -ne 'BWS_ACCESS_TOKEN' }) {
        $recordId = [Guid]::NewGuid().ToString()
        $mapping.secrets[$name] = $recordId
        $global:SourcingLauncherTestRecords[$recordId] = @{id=$recordId;key=$name;projectId=$projectId;value="synthetic-$name"}
    }
    $mapping | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $mappingPath
    'function Get-BwsTokenFromCredentialManager { param($Target) if ($global:SourcingLauncherTestCase -ne ''missing-token'') { ''synthetic-bootstrap'' } }' | Set-Content -LiteralPath $helperPath

    $count = 0
    foreach ($case in @('nexar-success','mouser-success','mouser-whitespace','lcsc-success','jlc-success','jlc-wrong-project','child-error','wrong-key','wrong-project','empty-value','retrieval-error','invalid-json','missing-token')) {
        $global:SourcingLauncherTestCase = $case
        $global:SourcingLauncherTestReads = 0
        $global:SourcingLauncherTestChildRan = $false
        foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, "prior-$name", 'Process') }
        $provider = if ($case -like 'mouser-*') { 'mouser' } elseif ($case -like 'lcsc-*') { 'lcsc' } elseif ($case -like 'jlc-*') { 'jlcpcb' } else { 'nexar' }
        $shouldFail = $case -notin @('nexar-success','mouser-success','mouser-whitespace','lcsc-success','jlc-success','child-error')
        $caught = $null
        try {
            & $launcher -Provider $provider -Python Invoke-SyntheticPython -SecretsFile $mappingPath -BitwardenHelper $helperPath -SourcingArgs @('--part','TEST-PART','--manufacturer','TEST-MAKER','--quantity','1')
            $resultCode = $LASTEXITCODE
        } catch { $caught = $_.Exception.Message }
        Assert-True ([bool]$caught -eq $shouldFail) "Wrong failure behavior for $case."
        if ($shouldFail) {
            Assert-True (-not $global:SourcingLauncherTestChildRan) "Child ran after credential failure: $case."
            Assert-True ($caught -notmatch 'synthetic-sensitive-body|synthetic-NEXAR|synthetic-MOUSER|synthetic-LCSC|synthetic-JLC') 'Sensitive response leaked in diagnostic.'
        } else {
            Assert-True $global:SourcingLauncherTestChildRan 'Child did not run.'
            $expectedReads = if ($provider -eq 'mouser') { 1 } elseif ($provider -eq 'jlcpcb') { 3 } else { 2 }
            Assert-True ($global:SourcingLauncherTestReads -eq $expectedReads) 'Wrong number of secret reads.'
            $expectedCode = if ($case -eq 'child-error') { 2 } else { 0 }
            Assert-True ($resultCode -eq $expectedCode) 'Child exit code was not propagated.'
        }
        foreach ($name in $names) {
            Assert-True ([Environment]::GetEnvironmentVariable($name, 'Process') -eq "prior-$name") "Environment not restored: $case."
        }
        $count++
    }
    foreach ($provider in @('nexar','mouser','lcsc','jlcpcb')) {
        $global:SourcingLauncherTestCase = 'environment-success'
        $global:SourcingLauncherTestReads = 0
        $global:SourcingLauncherTestChildRan = $false
        $env:BWS_ACCESS_TOKEN = 'prior-bootstrap'
        $env:NEXAR_CLIENT_ID = 'synthetic-NEXAR_CLIENT_ID'
        $env:NEXAR_CLIENT_SECRET = 'synthetic-NEXAR_CLIENT_SECRET'
        $env:MOUSER_SEARCH_API_KEY = ' synthetic-MOUSER_SEARCH_API_KEY '
        $env:LCSC_API_KEY = 'synthetic-LCSC_API_KEY'
        $env:LCSC_API_SECRET = 'synthetic-LCSC_API_SECRET'
        foreach ($name in ($jlcNames + $tokenizationNames)) {
            [Environment]::SetEnvironmentVariable($name, "synthetic-$name", 'Process')
        }
        & $launcher -Provider $provider -Python Invoke-SyntheticPython -BitwardenHelper (Join-Path $testDirectory 'missing-adapter.ps1') -SourcingArgs @('--part','TEST-PART','--manufacturer','TEST-MAKER','--quantity','1')
        Assert-True ($LASTEXITCODE -eq 0 -and $global:SourcingLauncherTestChildRan -and $global:SourcingLauncherTestReads -eq 0) 'Environment route should not use Bitwarden.'
        Assert-True ($env:BWS_ACCESS_TOKEN -eq 'prior-bootstrap' -and $env:MOUSER_SEARCH_API_KEY -eq ' synthetic-MOUSER_SEARCH_API_KEY ' -and $env:NEXAR_CLIENT_ID -eq 'synthetic-NEXAR_CLIENT_ID' -and $env:NEXAR_CLIENT_SECRET -eq 'synthetic-NEXAR_CLIENT_SECRET') 'Environment route did not restore caller values.'
        Assert-True ($env:LCSC_API_KEY -eq 'synthetic-LCSC_API_KEY' -and $env:LCSC_API_SECRET -eq 'synthetic-LCSC_API_SECRET') 'Environment route did not restore LCSC values.'
        foreach ($name in ($jlcNames + $tokenizationNames)) {
            Assert-True ([Environment]::GetEnvironmentVariable($name, 'Process') -eq "synthetic-$name") 'Environment route did not restore JLCPCB values.'
        }
        $count++
    }
    $global:SourcingLauncherTestCase = 'missing-token'
    $global:SourcingLauncherTestReads = 0
    $global:SourcingLauncherTestChildRan = $false
    $env:BWS_ACCESS_TOKEN = 'synthetic-bootstrap'
    & $launcher -Provider nexar -Python Invoke-SyntheticPython -SecretsFile $mappingPath -SourcingArgs @('--part','TEST-PART','--manufacturer','TEST-MAKER','--quantity','1')
    Assert-True ($LASTEXITCODE -eq 0 -and $global:SourcingLauncherTestChildRan -and $global:SourcingLauncherTestReads -eq 2) 'Provided bootstrap token should not need an adapter.'
    Assert-True ($env:BWS_ACCESS_TOKEN -eq 'synthetic-bootstrap') 'Provided bootstrap token was not restored.'
    $count++
    $global:SourcingLauncherTestReads = 0
    $global:SourcingLauncherTestChildRan = $false
    & $launcher -Provider nexar -Python Invoke-SyntheticPython -SecretsFile (Join-Path $testDirectory 'missing-mapping.json') -SourcingArgs @('--help')
    Assert-True ($LASTEXITCODE -eq 0 -and $global:SourcingLauncherTestChildRan -and $global:SourcingLauncherTestReads -eq 0) 'Help should bypass all credential setup.'
    Assert-True ($env:BWS_ACCESS_TOKEN -eq 'synthetic-bootstrap') 'Help did not restore caller environment.'
    $count++
    Write-Output "$count Windows launcher isolation/error-path checks passed."
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process') }
    foreach ($path in @($mappingPath,$helperPath)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } }
    Remove-Item -LiteralPath $testDirectory
    Remove-Variable -Scope Global -Name SourcingLauncherTestRecords,SourcingLauncherTestReads,SourcingLauncherTestCase,SourcingLauncherTestChildRan -ErrorAction SilentlyContinue
}
