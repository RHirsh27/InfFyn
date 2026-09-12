# Creates a restricted-alpha source package. Never deploys, reads env values, or changes aliases.
[CmdletBinding()]
param([ValidateSet('app','engine')][string]$Service = 'app', [switch]$Package)
$ErrorActionPreference = 'Stop'
$inffynRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$inffynTargets = @{
  app = @{ projectId='prj_jZDPzOm2PZRiwYK43GJ5FTOmZ54c'; projectName='inffyn-preview'; link='.vercel/project.json'; stage='stage-review-deployment.ps1'; config='app/vercel.json' }
  engine = @{ projectId='prj_YkyoXtOXd8AtPRdiW8jxcN3JqnIv'; projectName='inffyn-preview-engine'; link='engine/.vercel/project.json'; stage='stage-engine-deployment.ps1'; config='vercel.json' }
}
$inffynTarget = $inffynTargets[$Service]
$inffynLink = Get-Content -LiteralPath (Join-Path $inffynRoot $inffynTarget.link) -Raw | ConvertFrom-Json
if ($inffynLink.projectId -cne $inffynTarget.projectId -or $inffynLink.projectName -cne $inffynTarget.projectName -or $inffynLink.orgId -cne 'team_sP2wD4MBHG6ACAEpv5pm8rb9') { throw 'Unexpected hosting project. No source package created.' }
$inffynFlags = [ordered]@{ INFFYN_RELEASE_STAGE='private_alpha'; INFFYN_PRIVATE_ALPHA='true'; INFFYN_PREVIEW_MODE='false'; INFFYN_PREVIEW_STORAGE='database' }
if ($Service -eq 'engine') {
  $inffynFlags.AUDIT_V2_ENABLED='true'; $inffynFlags.AUDIT_RETENTION_APPROVED='true'; $inffynFlags.MONTHLY_ENABLED='true'
  foreach ($inffynFlag in @('OPENAI_IMPORT_ENABLED','ANTHROPIC_IMPORT_ENABLED','STRIPE_IMPORT_ENABLED','BILLING_ENABLED','BILLING_LIVE_APPROVED')) { $inffynFlags[$inffynFlag]='false' }
}
$inffynReceipt = [ordered]@{ status='OFFLINE_ALPHA_PACKAGE_PLAN'; service=$Service; project_id=$inffynTarget.projectId; release_stage='private_alpha'; deployment_target='preview'; public_aliases_changed=$false; secrets_read=$false; deploy_executed=$false; required_server_names=@('INFFYN_ALPHA_USER_IDS'); configuration=$inffynFlags; release_ready=$false }
if ($Package) {
  $inffynStage = & (Join-Path $PSScriptRoot $inffynTarget.stage)
  $inffynConfigPath = Join-Path $inffynStage $inffynTarget.config
  $inffynConfig = Get-Content -LiteralPath $inffynConfigPath -Raw | ConvertFrom-Json
  # Fixed non-secret marker travels with the deployment, independently of project-level flags.
  $inffynConfig | Add-Member -NotePropertyName env -NotePropertyValue $inffynFlags -Force
  $inffynConfig | Add-Member -NotePropertyName build -NotePropertyValue @{ env=$inffynFlags } -Force
  [IO.File]::WriteAllText($inffynConfigPath, ($inffynConfig | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
  $inffynReceipt.status='SOURCE_PACKAGED_HOSTED_UNVERIFIED'
  $inffynReceipt.package_directory=$inffynStage
  $inffynReceipt.config_path=$inffynConfigPath
}
$inffynReceipt | ConvertTo-Json -Depth 8
