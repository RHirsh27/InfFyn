# Package app source for the owner's direct CLI deployment, without old Git integration metadata.
# Never include local credentials, browser evidence, research, dependencies or build outputs.
$ErrorActionPreference = 'Stop'
$inffynSource = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$inffynStage = Join-Path ([IO.Path]::GetTempPath()) ('inffyn-review-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $inffynStage -Force | Out-Null
Push-Location -LiteralPath $inffynSource
try {
  $inffynFiles = @('package.json', 'package-lock.json') + @(
    & rg --files app packages -g '!.env*' -g '!*.tsbuildinfo' -g '!**/node_modules/**' -g '!**/.next/**' -g '!**/.vercel/**'
  )
  if ($LASTEXITCODE -ne 0) { throw 'Unable to enumerate deployment source.' }
  foreach ($inffynFile in $inffynFiles) {
    $inffynRelative = $inffynFile -replace '\\', '/'
    if ($inffynRelative -match '(^|/)(\.env[^/]*|\.git|\.validation|node_modules|\.next|\.vercel)(/|$)') {
      throw 'Private or generated file found in deployment inputs.'
    }
    $inffynTarget = [IO.Path]::GetFullPath((Join-Path $inffynStage $inffynFile))
    if (!$inffynTarget.StartsWith($inffynStage + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid deployment path.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $inffynTarget) -Force | Out-Null
    Copy-Item -LiteralPath $inffynFile -Destination $inffynTarget
  }
  New-Item -ItemType Directory -Path (Join-Path $inffynStage '.vercel') | Out-Null
  Copy-Item -LiteralPath '.vercel/project.json' -Destination (Join-Path $inffynStage '.vercel/project.json')
  Write-Output $inffynStage
} finally {
  Pop-Location
}
