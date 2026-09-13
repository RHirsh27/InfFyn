# Operator-only secure PostgreSQL setup. Default execution is read-only/offline.
[CmdletBinding()]
param(
  [switch]$Initialize,
  [switch]$PrepareCertificate,
  [string]$ProjectRef = 'jmfzmoqdvweeixxwzlma',
  [string]$DatabaseHost = 'db.jmfzmoqdvweeixxwzlma.supabase.co',
  [string]$DatabaseUser = 'postgres',
  [string]$RootCertificate = (Join-Path $env:LOCALAPPDATA 'InfFyn\private-alpha\certificates\supabase-prod-ca-2021.crt'),
  [string]$CredentialDirectory = (Join-Path $env:LOCALAPPDATA 'InfFyn\private-alpha\database-credentials')
)
$ErrorActionPreference = 'Stop'
function Get-InffynCertificateHash([string]$Path) {
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($Path))).Replace('-', '') }
  finally { $hasher.Dispose() }
}
$inffynProject = 'jmfzmoqdvweeixxwzlma'
$inffynRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($ProjectRef -cne $inffynProject) { throw 'Only the existing InfFyn project is supported.' }
$inffynDirect = $DatabaseHost -ceq "db.$inffynProject.supabase.co"
$inffynPooler = $DatabaseHost -cmatch '^[a-z0-9-]+\.pooler\.supabase\.com$'
if (!$inffynDirect -and !$inffynPooler) { throw 'Use the InfFyn direct host or the session-pooler host shown in its dashboard.' }
if ($inffynDirect -and $DatabaseUser -cnotmatch '^[a-z_][a-z0-9_]*$') { throw 'Invalid direct database role.' }
if ($inffynPooler -and $DatabaseUser -cnotmatch ('^[a-z_][a-z0-9_]*\.' + $inffynProject + '$')) { throw 'The pooler user must identify the InfFyn project.' }
if (![IO.Path]::IsPathRooted($CredentialDirectory)) { throw 'Credential directory must be an absolute local path.' }
$inffynPrivate = [IO.Path]::GetFullPath($CredentialDirectory)
if ($inffynPrivate.StartsWith('\\')) { throw 'Use a private local directory, not a network share.' }
if ($inffynPrivate -eq $inffynRepo -or $inffynPrivate.StartsWith($inffynRepo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or $inffynPrivate -match '(?i)(^|[\\/])(Google Drive|My Drive|OneDrive|Dropbox)([\\/]|$)') { throw 'Credentials must stay outside the repository and shared storage.' }
# Resolve existing ancestors, rejecting reparse points before any sensitive write.
$inffynAncestor = $inffynPrivate
while ($inffynAncestor) {
  if (Test-Path -LiteralPath $inffynAncestor) {
    if ((Get-Item -LiteralPath $inffynAncestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Credential path cannot pass through a link or junction.' }
  }
  $inffynAncestor = Split-Path -Parent $inffynAncestor
}
if (!$Initialize -and !$PrepareCertificate) {
  [ordered]@{ status='OFFLINE_SETUP_PLAN'; project_ref=$inffynProject; host=$DatabaseHost; port=5432; user=$DatabaseUser; credential_directory=$inffynPrivate; sslmode='verify-full'; files_written=$false; database_contacted=$false; next='Run with -Initialize and -RootCertificate in your own terminal. The existing password is prompted without echo.' } | ConvertTo-Json
  exit 0
}
if ($Initialize -and [Console]::IsInputRedirected) { throw 'Initialize must run in your interactive terminal; do not pipe a password.' }
if (!$RootCertificate -or ![IO.Path]::IsPathRooted($RootCertificate)) { throw 'RootCertificate must be an absolute path.' }
$inffynDefaultCertificate = Join-Path $env:LOCALAPPDATA 'InfFyn\private-alpha\certificates\supabase-prod-ca-2021.crt'
if ([IO.Path]::GetFullPath($RootCertificate) -eq [IO.Path]::GetFullPath($inffynDefaultCertificate)) {
  $inffynCertificateHash = '700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7'
  $inffynBundledCertificate = Join-Path $PSScriptRoot 'certificates\supabase-root-2021.crt'
  if ((Get-InffynCertificateHash $inffynBundledCertificate) -cne $inffynCertificateHash) { throw 'Bundled public certificate integrity check failed. Update from the reviewed repository.' }
  if (!(Test-Path -LiteralPath $RootCertificate)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $RootCertificate) -Force | Out-Null
    $inffynCertStream = New-Object IO.FileStream($RootCertificate, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $inffynCertBytes = [IO.File]::ReadAllBytes($inffynBundledCertificate)
      $inffynCertStream.Write($inffynCertBytes, 0, $inffynCertBytes.Length)
    } finally { $inffynCertStream.Dispose() }
  }
  if ((Get-InffynCertificateHash $RootCertificate) -cne $inffynCertificateHash) { throw 'Existing default certificate differs from the reviewed certificate; it was not overwritten. Supply a separately verified -RootCertificate path.' }
}
if (!(Test-Path -LiteralPath $RootCertificate -PathType Leaf)) { throw "Certificate not found at '$RootCertificate'. Omit -RootCertificate to prepare the bundled public CA automatically, or provide the downloaded Supabase CA path." }
$inffynCa = New-Object Security.Cryptography.X509Certificates.X509Certificate2($RootCertificate)
if ($inffynCa.HasPrivateKey -or $inffynCa.NotAfter -le (Get-Date) -or $inffynCa.NotBefore -gt (Get-Date)) { throw 'Certificate must be current and contain no private key.' }
if (!$Initialize) {
  [ordered]@{ status='PUBLIC_CERTIFICATE_READY'; ssl_root_cert=[IO.Path]::GetFullPath($RootCertificate); database_contacted=$false; credentials_written=$false } | ConvertTo-Json
  exit 0
}
if (Test-Path -LiteralPath $inffynPrivate) { throw 'The credential directory already exists. It will not be overwritten; choose a new private directory or use your existing setup.' }
New-Item -ItemType Directory -Path $inffynPrivate | Out-Null
$inffynSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$inffynAcl = New-Object Security.AccessControl.DirectorySecurity
$inffynAcl.SetOwner($inffynSid)
$inffynAcl.SetAccessRuleProtection($true, $false)
$inffynAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($inffynSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
$inffynAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
Set-Acl -LiteralPath $inffynPrivate -AclObject $inffynAcl
$inffynPassword = Read-Host 'Existing InfFyn database password (hidden; never paste into chat)' -AsSecureString
$inffynPointer = [IntPtr]::Zero
try {
  if ($inffynPassword.Length -eq 0) { throw 'A non-empty existing database password is required.' }
  $inffynPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($inffynPassword)
  $inffynPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($inffynPointer)
  if ($inffynPlain.Contains("`r") -or $inffynPlain.Contains("`n")) { throw 'The password cannot contain line breaks in a libpq password file.' }
  $inffynEscaped = $inffynPlain.Replace('\', '\\').Replace(':', '\:')
  $inffynPasswordFile = Join-Path $inffynPrivate 'pgpass.conf'
  $inffynStream = New-Object IO.FileStream($inffynPasswordFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $inffynWriter = New-Object IO.StreamWriter($inffynStream, (New-Object Text.UTF8Encoding($false)))
  try { $inffynWriter.WriteLine("${DatabaseHost}:5432:postgres:${DatabaseUser}:${inffynEscaped}") } finally { $inffynWriter.Dispose() }
} finally {
  if ($inffynPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($inffynPointer) }
  $inffynPlain = $null; $inffynEscaped = $null
  if ($inffynPassword) { $inffynPassword.Dispose() }
}
[ordered]@{ status='SECURE_CONNECTION_FILE_PREPARED'; project_ref=$inffynProject; host=$DatabaseHost; port=5432; user=$DatabaseUser; pgpass_file=$inffynPasswordFile; ssl_root_cert=[IO.Path]::GetFullPath($RootCertificate); database_contacted=$false; backup_verified=$false } | ConvertTo-Json
