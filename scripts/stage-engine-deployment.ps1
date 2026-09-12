# Package only executable engine source and pinned dependencies for the existing review project.
param()
$ErrorActionPreference = 'Stop'
$inffynRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$inffynEngine = (Resolve-Path -LiteralPath (Join-Path $inffynRoot 'engine')).Path
$inffynStage = Join-Path ([IO.Path]::GetTempPath()) ('inffyn-engine-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $inffynStage -Force | Out-Null
Push-Location -LiteralPath $inffynEngine
try {
  $inffynFiles = @('pyproject.toml', 'requirements.txt', 'constraints-v1.txt', 'vercel.json') + @(
    & rg --files app -g '*.py' -g '!**/__pycache__/**'
  )
  if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate engine source.' }
  foreach ($inffynFile in $inffynFiles) {
    $inffynTarget = [IO.Path]::GetFullPath((Join-Path $inffynStage $inffynFile))
    if (!$inffynTarget.StartsWith($inffynStage + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid deployment path.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $inffynTarget) -Force | Out-Null
    Copy-Item -LiteralPath $inffynFile -Destination $inffynTarget
  }
  New-Item -ItemType Directory -Path (Join-Path $inffynStage '.vercel') | Out-Null
  Copy-Item -LiteralPath '.vercel/project.json' -Destination (Join-Path $inffynStage '.vercel/project.json')
  Write-Output $inffynStage
} finally { Pop-Location }
