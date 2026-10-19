param([string]$InstallRoot = 'C:\CreatorStudio', [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin', [switch]$AsAdministrator, [switch]$NoPrune, [switch]$BeforeHardening)
. "$PSScriptRoot\Common.ps1"
$db = Get-StudioDatabase $InstallRoot
$oldPassword = $env:PGPASSWORD
$user = if ($AsAdministrator) { 'postgres' } else { $db.User }
$backupDir = Join-Path $InstallRoot 'backups'
Protect-StudioDirectory $backupDir
$file = Join-Path $backupDir ('creator-' + (Get-Date -Format yyyyMMdd-HHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.dump')
try {
    if (-not $AsAdministrator) { $env:PGPASSWORD = $db.Password }
    if (-not ($AsAdministrator -and $BeforeHardening)) { Assert-StudioLoopback (Invoke-StudioSql $PgBin 'postgres' 'SHOW listen_addresses' $user) }
    & "$PgBin\pg_dump.exe" -w -h 127.0.0.1 -p 5432 -U $user -d creator_studio --format=custom --no-owner --no-acl "--file=$file.partial"
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed; the previous backups were retained.' }
    & "$PgBin\pg_restore.exe" --list "$file.partial" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Backup archive verification failed.' }
    Move-Item -LiteralPath "$file.partial" -Destination $file
    if ((Get-Item -LiteralPath $file).Length -lt 100) { throw 'Backup archive is unexpectedly small. Previous backups were retained.' }
    [IO.File]::WriteAllText("$file.sha256", (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Backup verified (archive catalog + SHA256): $file"
    $logDir = Join-Path $InstallRoot 'logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -LiteralPath (Join-Path $logDir ('backup-' + (Get-Date -Format yyyy-MM-dd) + '.log')) -Value ((Get-Date -Format o) + ' verified: ' + (Split-Path -Leaf $file))
    if ($NoPrune) { return $file }
    Get-ChildItem -LiteralPath $backupDir -File -Filter 'creator-*.dump' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | ForEach-Object { Assert-StudioChildPath $backupDir $_.FullName; Remove-Item -LiteralPath $_.FullName; if (Test-Path -LiteralPath ($_.FullName + '.sha256')) { Remove-Item -LiteralPath ($_.FullName + '.sha256') } }
    $logDir = Join-Path $InstallRoot 'logs'
    if (Test-Path -LiteralPath $logDir) { Get-ChildItem -LiteralPath $logDir -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | ForEach-Object { Assert-StudioChildPath $logDir $_.FullName; Remove-Item -LiteralPath $_.FullName } }
    return $file
} finally { $env:PGPASSWORD = $oldPassword; $db = $null }
