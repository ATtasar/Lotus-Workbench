param([string]$InstallRoot = 'C:\CreatorStudio', [Parameter(Mandatory=$true)][string]$Release, [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin', [string]$Domain, [string]$ServerIp = '47.109.199.148')
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
Assert-StudioChildPath $InstallRoot $Release
Assert-StudioOwnedTasks $InstallRoot
$oldTask = Get-ScheduledTask -TaskName 'CreatorStudioApi'
$config = Read-StudioEnvironment (Join-Path $InstallRoot 'config\backend.env')
if (-not $PSBoundParameters.ContainsKey('Domain')) { $Domain = if ($config.PUBLIC_ORIGIN) { ([uri]$config.PUBLIC_ORIGIN).Host } else { '' } }
& "$PSScriptRoot\Backup-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin -NoPrune | Out-Null
$gatewayPath = Join-Path $InstallRoot 'config\Caddyfile'
$environmentPath = Join-Path $InstallRoot 'config\backend.env'
$stamp = (Get-Date -Format yyyyMMddHHmmss) + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$oldGateway = "$gatewayPath.before-$stamp"
$oldEnvironment = "$environmentPath.before-$stamp"
Copy-Item -LiteralPath $gatewayPath -Destination $oldGateway
Copy-Item -LiteralPath $environmentPath -Destination $oldEnvironment
$nodeExecutable = (Get-Command node.exe).Source
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$InstallRoot\scripts\Run-Api.ps1`" -InstallRoot `"$InstallRoot`" -Release `"$Release`" -NodeExecutable `"$nodeExecutable`"" -WorkingDirectory $InstallRoot
try {
    & "$PSScriptRoot\Set-Gateway.ps1" -InstallRoot $InstallRoot -Release $Release -Domain $Domain -ServerIp $ServerIp
    Stop-StudioApi $InstallRoot
    Set-ScheduledTask -TaskName 'CreatorStudioApi' -Action $action | Out-Null
    Start-ScheduledTask -TaskName 'CreatorStudioApi'
    Wait-StudioReady $Release | Out-Null
    if ((Get-Service CreatorStudioGateway).Status -ne 'Running') { Start-Service CreatorStudioGateway }
    & "$InstallRoot\bin\caddy.exe" reload --config $gatewayPath --adapter caddyfile | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Gateway reload failed.' }
} catch {
    $reason = $_.Exception.Message
    $rollbackOk = $false
    try {
        Stop-StudioApi $InstallRoot
        Set-ScheduledTask -TaskName 'CreatorStudioApi' -Action $oldTask.Actions | Out-Null
        Copy-Item -LiteralPath $oldGateway -Destination $gatewayPath -Force
        Copy-Item -LiteralPath $oldEnvironment -Destination $environmentPath -Force
        Start-ScheduledTask -TaskName 'CreatorStudioApi'
        if ((Get-Service CreatorStudioGateway).Status -eq 'Running') {
            & "$InstallRoot\bin\caddy.exe" reload --config $gatewayPath --adapter caddyfile | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'Gateway rollback reload failed.' }
        }
        $rollbackOk = $true
    } catch { }
    if ($rollbackOk) { throw "Release switch failed: $reason Previous task action, private environment and gateway config restored. Check Status and launcher logs. Database was NOT rolled back." }
    throw "Release switch AND automatic recovery failed. Stop here; send the stage and launcher error to Codex. Preserved recovery files: $oldGateway and $oldEnvironment (do NOT share their contents). Database was NOT rolled back."
}
Write-Host 'Release switched. Database, attachments and previous releases retained.'
