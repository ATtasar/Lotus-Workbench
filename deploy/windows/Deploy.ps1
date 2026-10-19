param(
    [ValidateSet('Deploy','Check','Status','Start','Stop','Restart','Logs','Backup','Restore')][string]$Action = 'Deploy',
    [string]$InstallRoot = 'C:\CreatorStudio',
    [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
    [string]$ServerIp = '47.109.199.148',
    [string]$Domain,
    [string]$BackupFile
)
. "$PSScriptRoot\Common.ps1"
$stage = 'Administrator and directory checks'; $mutex = $null; $locked = $false
try {
    Assert-StudioAdministrator
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    if ($InstallRoot -notmatch '^[A-Za-z]:\\[^"\r\n]+$' -or $InstallRoot -match '[%&|<>]') { throw 'Use an absolute local installation directory, for example C:\CreatorStudio.' }
    $project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd('\')
    $statePath = Join-Path $InstallRoot 'config\deployment.json'
    $state = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
    if ($state -and -not $PSBoundParameters.ContainsKey('PgBin') -and $state.pgBin) { $PgBin = $state.pgBin }
    # Portable Node installed by this tool is available to all subsequent child scripts.
    $portable = @(Get-ChildItem -Path "$InstallRoot\bin\node-v24.*-win-x64\node.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
    if ($portable.Count) { $env:Path = $portable[0].DirectoryName + ';' + $env:Path }
    if ($Action -eq 'Logs') {
        Get-ChildItem -LiteralPath "$InstallRoot\logs" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,Length,LastWriteTime | Format-Table
        $latest = Get-ChildItem -LiteralPath "$InstallRoot\logs" -Filter 'launcher-*.log' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) { Get-Content -LiteralPath $latest.FullName -Tail 60 }
        return
    }
    if ($Action -eq 'Status') {
        if ($state) { Write-Host ('Last gateway probe verified: ' + $state.gatewayProbeVerified + '; configured domain: ' + $state.domain) }
        Get-Service '*postgres*','CreatorStudioGateway' -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table
        Get-ScheduledTask -TaskName 'CreatorStudioApi','CreatorStudioBackup' -ErrorAction SilentlyContinue | Select-Object TaskName,State | Format-Table
        Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(80,443,3000,5432,2019) } | Select-Object LocalAddress,LocalPort | Format-Table
        Invoke-RestMethod 'http://127.0.0.1:3000/api/health/ready' -TimeoutSec 5 | ConvertTo-Json
        Get-ScheduledTaskInfo -TaskName CreatorStudioBackup -ErrorAction SilentlyContinue | Select-Object LastRunTime,LastTaskResult,NextRunTime | Format-List
        return
    }
    Assert-StudioOwnedTasks $InstallRoot
    if ($Action -in @('Start','Stop','Restart')) {
        Confirm-StudioChange "$Action the Creator Studio API task and gateway only. PostgreSQL, firewall and remote access will not change."
        if ($Action -in @('Stop','Restart')) {
            Stop-Service CreatorStudioGateway
            Stop-StudioApi $InstallRoot
        }
        if ($Action -in @('Start','Restart')) {
            if (-not $state) { throw 'Deployment state missing. Run Deploy to complete/recover the installation.' }
            Start-ScheduledTask -TaskName CreatorStudioApi
            Wait-StudioReady $state.release | ConvertTo-Json
            Start-Service CreatorStudioGateway
        }
        Write-Host "DONE: $Action" -ForegroundColor Green
        return
    }
    if ($Action -eq 'Backup') { & "$PSScriptRoot\Backup-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin; return }
    if ($Action -eq 'Restore') {
        if (-not $BackupFile) { throw 'Supply -BackupFile with the full .dump path. The .sha256 file must be beside it.' }
        & "$PSScriptRoot\Restore-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin -BackupFile $BackupFile
        return
    }
    $stage = 'Operating system, disk and dependency checks'
    $os = Get-CimInstance Win32_OperatingSystem
    if (-not [Environment]::Is64BitOperatingSystem -or $os.ProductType -eq 1 -or [int]$os.BuildNumber -lt 20348) { throw 'Deployment requires Windows Server 2022 or newer, x64. Check mode and tests do not install anything on a desktop OS.' }
    $disk = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $InstallRoot.Substring(0,2) + "'")
    if (-not $disk -or $disk.FreeSpace -lt 4GB) { throw 'At least 4 GB of free space is required on the installation drive (plus space for existing database backups).' }
    Write-Host ('OS: ' + $os.Caption + '; free space: ' + [math]::Round($disk.FreeSpace/1GB,1) + ' GB')
    foreach ($file in @('package.json','package-lock.json','backend\package.json','backend\package-lock.json','backend\src\schema.sql','deploy\init-db.sql')) { if (-not (Test-Path -LiteralPath (Join-Path $project $file))) { throw "Project file missing: $file. Extract the complete deployment source package." } }
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    Write-Host ('Node: ' + $(if ($node) { & $node.Source --version } else { 'MISSING (automatic portable installation available)' }))
    Write-Host ('npm: ' + $(if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { & npm.cmd --version } else { 'MISSING' }))
    Write-Host ('PostgreSQL tools: ' + $(if (Test-Path -LiteralPath "$PgBin\psql.exe") { $PgBin } else { 'MISSING' }))
    Write-Host ('Caddy: ' + $(if (Test-Path -LiteralPath "$InstallRoot\bin\caddy.exe") { 'found' } else { 'MISSING (automatic installation available)' }))
    $pgServices = @(Get-Service '*postgres*' -ErrorAction SilentlyContinue)
    $pgServices | Select-Object Name,Status,StartType | Format-Table | Out-Host
    Assert-StudioPorts $InstallRoot
    if ($Action -eq 'Check') {
        if (Test-Path -LiteralPath "$InstallRoot\config\backend.env") {
            $db = Get-StudioDatabase $InstallRoot; $oldPassword = $env:PGPASSWORD
            try { $env:PGPASSWORD = $db.Password; Assert-StudioLoopback (Invoke-StudioSql $PgBin creator_studio 'SHOW listen_addresses'); Invoke-StudioSql $PgBin creator_studio 'SELECT 1' | Out-Null } finally { $env:PGPASSWORD = $oldPassword; $db = $null }
        }
        Write-Host 'CHECK complete. No downloads, installation, service changes or database writes were performed.'
        return
    }
    foreach ($tool in @('psql.exe','pg_dump.exe','pg_restore.exe')) { if (-not (Test-Path -LiteralPath "$PgBin\$tool")) { throw 'Install PostgreSQL 17 x64 with Server + Command Line Tools from https://www.postgresql.org/download/windows/ . Use port 5432 and keep the postgres password. Reopen Administrator PowerShell and rerun this same command. For a custom path add -PgBin.' } }
    $matchedPgServices = @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -like ('*' + (Join-Path $PgBin 'pg_ctl.exe') + '*') })
    if ($matchedPgServices.Count -ne 1) { throw 'Cannot uniquely identify the PostgreSQL Windows service for -PgBin. Check services.msc and the PostgreSQL installation path; no service was guessed or changed.' }
    Confirm-StudioChange "Deploy into $InstallRoot. Build production files; create protected config only if absent; back up an existing database before migrations; create/update CreatorStudio tasks and gateway; allow automatic startup. Existing data, passwords and uploads will be retained. There will be a brief interruption on updates. No firewall, RDP or Aliyun security group will change."
    $mutex = New-Object Threading.Mutex($false, 'Global\CreatorStudioDeployment')
    $locked = $mutex.WaitOne(0)
    if (-not $locked) { throw 'Another deployment is running. Wait for it to finish.' }
    $stage = 'Install missing Node/Caddy (separate confirmations)'
    Protect-StudioDirectory $InstallRoot
    & "$PSScriptRoot\Install-Tools.ps1" -InstallRoot $InstallRoot
    $stage = 'Private environment and database'
    $pgService = Get-Service -Name $matchedPgServices[0].Name
    if ($pgService.Status -ne 'Running' -or $pgService.StartType -ne 'Automatic') {
        Confirm-StudioChange ('Set PostgreSQL service ' + $pgService.Name + ' to automatic startup and start it if stopped. This affects boot startup for all databases hosted by this service; a running database will not be restarted by this step.')
        Set-Service -Name $pgService.Name -StartupType Automatic
        if ($pgService.Status -ne 'Running') { Start-Service -Name $pgService.Name }
    }
    if (-not (Test-Path -LiteralPath "$InstallRoot\config\backend.env")) { & "$PSScriptRoot\New-Environment.ps1" -InstallRoot $InstallRoot }
    $db = Get-StudioDatabase $InstallRoot
    $oldPassword = $env:PGPASSWORD; $databaseReady = $false
    try {
        $env:PGPASSWORD = $db.Password
        try { Assert-StudioLoopback (Invoke-StudioSql $PgBin creator_studio 'SHOW listen_addresses'); Invoke-StudioSql $PgBin creator_studio 'SELECT 1' | Out-Null; $databaseReady = $true } catch { }
    } finally { $env:PGPASSWORD = $oldPassword }
    if (-not $databaseReady) { & "$PSScriptRoot\Initialize-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin }
    $db = Get-StudioDatabase $InstallRoot
    if (-not $PSBoundParameters.ContainsKey('Domain')) { $Domain = if ($db.Config.PUBLIC_ORIGIN) { ([uri]$db.Config.PUBLIC_ORIGIN).Host } else { '' } }
    $db = $null
    $stage = 'Production build (running release remains available)'
    $release = & "$PSScriptRoot\Build-Release.ps1" -InstallRoot $InstallRoot
    $stage = 'Verified backup, service registration and release switch'
    $existingTask = Get-ScheduledTask -TaskName CreatorStudioApi -ErrorAction SilentlyContinue
    if (-not $existingTask -or -not (Test-Path -LiteralPath "$InstallRoot\config\Caddyfile")) {
        & "$PSScriptRoot\Backup-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin -NoPrune | Out-Null
        & "$PSScriptRoot\Set-Gateway.ps1" -InstallRoot $InstallRoot -Release $release -Domain $Domain -ServerIp $ServerIp
    }
    & "$PSScriptRoot\Install-Tasks.ps1" -InstallRoot $InstallRoot -Release $release -PgBin $PgBin -RegisterOnly
    & "$PSScriptRoot\Switch-Release.ps1" -InstallRoot $InstallRoot -Release $release -PgBin $PgBin -Domain $Domain -ServerIp $ServerIp
    $stage = 'Final health checks'
    $health = Wait-StudioReady $release
    if ((Get-Service CreatorStudioGateway).Status -ne 'Running') { throw 'Gateway service is not running.' }
    # Keep the actual healthy release recorded if a later DNS/HTTPS probe fails.
    $manifest = @{ release=$release; project=$project; updatedAt=[DateTimeOffset]::Now.ToString('o'); domain=$Domain; serverIp=$ServerIp; pgBin=$PgBin; gatewayProbeVerified=$false }
    [IO.File]::WriteAllText("$statePath.next", ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath "$statePath.next" -Destination $statePath -Force
    $probe = if ($Domain) { 'https://' + $Domain + '/api/health/ready' } else { 'http://127.0.0.1/api/health/ready' }
    if ($Domain) { $gatewayHealth = Invoke-RestMethod $probe -TimeoutSec 20 }
    else { $gatewayHealth = Invoke-RestMethod $probe -Headers @{ Host=$ServerIp } -TimeoutSec 10 }
    if ($gatewayHealth.release -ne $health.release) { throw 'Gateway is not serving the expected release. Check local port 80 and Caddy logs.' }
    $manifest.gatewayProbeVerified = $true
    [IO.File]::WriteAllText("$statePath.next", ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath "$statePath.next" -Destination $statePath -Force
    $health | ConvertTo-Json | Out-Host
    Write-Host 'DONE: production build, database, API task, gateway and daily backup configured.' -ForegroundColor Green
    if (-not $Domain) { Write-Host "HTTPS PENDING: IP health probe only: http://$ServerIp/api/health/ready . Public login remains disabled." -ForegroundColor Yellow }
} catch {
    Write-Host "FAILED at: $stage" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host 'STOPPED. Do not delete config/database or rerun New-Environment to fix a password. Send the FAILED stage + error and the last launcher error to Codex. Never send backend.env, backup archives, cookies or passwords.'
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
