param([string]$InstallRoot = 'C:\CreatorStudio', [Parameter(Mandatory=$true)][string]$Release, [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin', [switch]$RegisterOnly)
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
Assert-StudioChildPath $InstallRoot $Release
Assert-StudioOwnedTasks $InstallRoot
if (-not (Test-Path -LiteralPath "$Release\backend\dist\backend\src\main.js")) { throw 'Build a release first.' }
if (-not (Test-Path -LiteralPath "$InstallRoot\config\Caddyfile")) { throw 'Run Set-Gateway.ps1 first.' }
$taskScripts = Join-Path $InstallRoot 'scripts'
Protect-StudioDirectory $InstallRoot
New-Item -ItemType Directory -Force -Path $taskScripts | Out-Null
Copy-Item -LiteralPath "$PSScriptRoot\Common.ps1","$PSScriptRoot\Run-Api.ps1","$PSScriptRoot\Backup-Database.ps1" -Destination $taskScripts -Force
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$nodeExecutable = (Get-Command node.exe).Source
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
if (-not (Get-ScheduledTask -TaskName 'CreatorStudioApi' -ErrorAction SilentlyContinue)) {
    $action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$taskScripts\Run-Api.ps1`" -InstallRoot `"$InstallRoot`" -Release `"$Release`" -NodeExecutable `"$nodeExecutable`"" -WorkingDirectory $InstallRoot
    Register-ScheduledTask -TaskName 'CreatorStudioApi' -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings | Out-Null
}
$backupAction = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$taskScripts\Backup-Database.ps1`" -InstallRoot `"$InstallRoot`" -PgBin `"$PgBin`"" -WorkingDirectory $InstallRoot
$backupTrigger = New-ScheduledTaskTrigger -Daily -At '03:30'
$backupTrigger.StartBoundary = [DateTimeOffset]::Now.ToOffset([TimeSpan]::FromHours(8)).ToString('yyyy-MM-dd') + 'T03:30:00+08:00'
Register-ScheduledTask -TaskName 'CreatorStudioBackup' -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew) -Force | Out-Null
if (-not (Get-Service -Name 'CreatorStudioGateway' -ErrorAction SilentlyContinue)) {
    $caddyCommand = "`"$InstallRoot\bin\caddy.exe`" run --config `"$InstallRoot\config\Caddyfile`" --adapter caddyfile"
    New-Service -Name 'CreatorStudioGateway' -DisplayName 'Creator Studio HTTPS Gateway' -BinaryPathName $caddyCommand -StartupType Automatic | Out-Null
}
& sc.exe failure CreatorStudioGateway reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot configure gateway service recovery.' }
if (-not $RegisterOnly) {
    Start-ScheduledTask -TaskName 'CreatorStudioApi'
    Wait-StudioReady $Release | Out-Null
    Start-Service -Name 'CreatorStudioGateway'
}
Write-Host 'Application task, daily backup and gateway service registered; existing application action preserved.'
