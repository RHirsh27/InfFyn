param([switch]$Execute, [switch]$Check)
$ErrorActionPreference = 'Stop'
if ($Execute -and $Check) { throw 'Choose execution or receipt inspection.' }
$operationsRoot = Join-Path $env:LOCALAPPDATA 'InfFyn\private-alpha\operations'
$runnerPath = Join-Path $PSScriptRoot 'operations\run.mjs'
if (!$Execute -and !$Check) {
    & node $runnerPath
    exit $LASTEXITCODE
}
if ($Check) {
    $receipts = @(Get-ChildItem -LiteralPath $operationsRoot -Filter 'receipt-*.json' | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json })
    $indexPath = Join-Path $operationsRoot 'receipt-index.json'
    [System.IO.File]::WriteAllText($indexPath, (ConvertTo-Json -InputObject $receipts -Depth 8), [System.Text.UTF8Encoding]::new($false))
    & node $runnerPath --check-receipts $indexPath
    exit $LASTEXITCODE
}
# Existing credentials are supplied through secure setup, outside the checkout.
# Never display their values, put them on a command line, or export them to Git.
$credentialPath = Join-Path $operationsRoot 'credentials.json'
$configPath = Join-Path $operationsRoot 'config.json'
if (!(Test-Path -LiteralPath $credentialPath -PathType Leaf) -or !(Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Secure operator setup is missing. No hosted operation was attempted.'
}
$previousCron = [Environment]::GetEnvironmentVariable('INFFYN_OPERATIONS_CRON_SECRET', 'Process')
$previousProtection = [Environment]::GetEnvironmentVariable('INFFYN_OPERATIONS_APP_PROTECTION', 'Process')
try {
    $credentials = Get-Content -LiteralPath $credentialPath -Raw | ConvertFrom-Json
    if (!$credentials.cron -or !$credentials.protection) { throw 'Secure operator configuration is incomplete.' }
    [Environment]::SetEnvironmentVariable('INFFYN_OPERATIONS_CRON_SECRET', $credentials.cron, 'Process')
    [Environment]::SetEnvironmentVariable('INFFYN_OPERATIONS_APP_PROTECTION', $credentials.protection, 'Process')
    $receiptName = 'receipt-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N') + '.json'
    $receiptPath = Join-Path $operationsRoot $receiptName
    & node $runnerPath --execute --config $configPath --report $receiptPath
    $operationExit = $LASTEXITCODE
} finally {
    [Environment]::SetEnvironmentVariable('INFFYN_OPERATIONS_CRON_SECRET', $previousCron, 'Process')
    [Environment]::SetEnvironmentVariable('INFFYN_OPERATIONS_APP_PROTECTION', $previousProtection, 'Process')
    $credentials = $null
}
exit $operationExit
