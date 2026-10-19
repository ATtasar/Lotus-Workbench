param([string]$InstallRoot = 'C:\CreatorStudio', [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin', [Parameter(Mandatory=$true)][string]$BackupFile)
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
$db = Get-StudioDatabase $InstallRoot
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw 'Backup file not found.' }
if (-not (Test-Path -LiteralPath "$BackupFile.sha256")) { throw 'SHA256 sidecar is missing. Use a verified backup created by Backup-Database.ps1.' }
if ((Get-FileHash -LiteralPath $BackupFile -Algorithm SHA256).Hash -ne ([IO.File]::ReadAllText("$BackupFile.sha256")).Trim()) { throw 'Backup checksum mismatch. Restore cancelled.' }
& "$PgBin\pg_restore.exe" --list $BackupFile | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Invalid PostgreSQL backup archive.' }
$target = 'creator_restore_' + (Get-Date -Format yyyyMMddHHmmss) + '_' + [guid]::NewGuid().ToString('N').Substring(0,8)
Confirm-StudioChange "Restore into a NEW database $target for verification/recovery. The live creator_studio database and application configuration will not be changed. The new database is retained even if validation fails."
$securePassword = Read-Host 'PostgreSQL postgres administrator password' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential('postgres', $securePassword)
$oldPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $credential.GetNetworkCredential().Password
    Assert-StudioLoopback (Invoke-StudioSql $PgBin postgres 'SHOW listen_addresses' postgres)
    Invoke-StudioSql $PgBin postgres "CREATE DATABASE $target OWNER creator_app" postgres | Out-Null
    & "$PgBin\pg_restore.exe" -w -h 127.0.0.1 -p 5432 -U postgres -d $target --role=creator_app --no-owner --no-acl --exit-on-error --single-transaction $BackupFile
    if ($LASTEXITCODE -ne 0) { throw "Restore failed. Live data unchanged; diagnostic database retained: $target" }
    $summary = Invoke-StudioSql $PgBin $target 'SELECT (SELECT count(*) FROM studio_users),(SELECT count(*) FROM studio_workspaces),(SELECT count(*) FROM studio_files)' postgres
    Write-Host "Restore succeeded into $target. Users|workspaces|files: $summary"
    Write-Host 'This proves the archive restores; compare counts and application content with your backup point. Production was NOT switched. Keep the original database and ask Codex before a recovery cutover.'
} finally { $env:PGPASSWORD = $oldPassword; $db = $null; $credential = $null; $securePassword = $null }
