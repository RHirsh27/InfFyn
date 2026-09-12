param([ValidateSet('app','engine','build')][string]$Target='app')
$ErrorActionPreference='Stop'
$inffynRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if($Target -eq 'engine') {
  Set-Location -LiteralPath (Join-Path $inffynRoot 'engine')
  & '.\.venv\Scripts\python.exe' -m app.v2.local_validation
} else {
  # This process and its children never read .env files or use provider credentials.
  Get-ChildItem Env: | Where-Object {$_.Name -match 'SUPABASE|STRIPE|SENTRY|ANTHROPIC|OPENAI|ENGINE_URL|BILLING_|AUDIT_'} | ForEach-Object {Remove-Item -LiteralPath ('Env:\'+$_.Name)}
  $env:NODE_OPTIONS='--require "'+((Join-Path $PSScriptRoot 'next-validation-preload.cjs') -replace '\\','/')+'"'
  $env:INFFYN_LOCAL_VALIDATION='1'
  $env:ENGINE_URL='http://127.0.0.1:8012'
  $env:NEXT_TELEMETRY_DISABLED='1'
  Set-Location -LiteralPath (Join-Path $inffynRoot 'app')
  if($Target -eq 'build') { & node (Join-Path $inffynRoot 'node_modules\next\dist\bin\next') build --webpack }
  else { & node (Join-Path $inffynRoot 'node_modules\next\dist\bin\next') dev --webpack --hostname 127.0.0.1 --port 3012 }
}
exit $LASTEXITCODE
