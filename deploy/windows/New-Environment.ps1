param([string]$InstallRoot = 'C:\CreatorStudio')
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
$configDir = Join-Path $InstallRoot 'config'
$environmentPath = Join-Path $configDir 'backend.env'
if (Test-Path -LiteralPath $environmentPath) { throw 'Environment already exists; it has not been overwritten.' }
New-Item -ItemType Directory -Path $configDir -Force | Out-Null
& icacls.exe $configDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to restrict configuration permissions.' }
$securePassword = Read-Host 'Set the creator login password (at least 12 characters; it will not be printed)' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential('creator', $securePassword)
$adminPassword = $credential.GetNetworkCredential().Password
if ($adminPassword.Length -lt 12 -or $adminPassword.Length -gt 1024 -or $adminPassword.Contains('"') -or $adminPassword.Contains('\') -or $adminPassword.Contains("`n") -or $adminPassword.Contains("`r")) { throw 'Use 12-1024 characters without quotes, backslashes or line breaks.' }
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$databasePassword = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$logDir = (Join-Path $InstallRoot 'logs').Replace('\','/')
$content = @"
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://creator_app:${databasePassword}@127.0.0.1:5432/creator_studio
PUBLIC_ORIGIN=
CORS_ORIGINS=
ADMIN_USERNAME=creator
ADMIN_PASSWORD="$adminPassword"
COOKIE_SAME_SITE=Lax
LOG_DIR=$logDir
"@
[IO.File]::WriteAllText($environmentPath, $content, (New-Object Text.UTF8Encoding($false)))
$adminPassword = $null; $databasePassword = $null; $content = $null
Write-Output "Private configuration created: $environmentPath. No passwords were printed."
