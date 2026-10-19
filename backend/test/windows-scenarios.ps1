param([string]$Project, [string]$Scratch)
$ErrorActionPreference = 'Stop'
$fixture = Join-Path $Scratch 'fixture'
$release = Join-Path $Scratch 'releases\test'
New-Item -ItemType Directory -Force -Path $fixture,"$release\backend\dist\backend\src","$Scratch\config" | Out-Null
Copy-Item -LiteralPath "$Project\deploy\windows\Common.ps1","$Project\deploy\windows\Install-Tasks.ps1","$Project\deploy\windows\Switch-Release.ps1","$Project\deploy\windows\Run-Api.ps1" -Destination $fixture
# Test doubles are confined to this fixture. The production files are never modified.
Add-Content -LiteralPath "$fixture\Common.ps1" -Value @'
function Assert-StudioAdministrator { }
function Protect-StudioDirectory([string]$Path) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
'@
[IO.File]::WriteAllText("$release\backend\dist\backend\src\main.js",'// fixture only')
[IO.File]::WriteAllText("$fixture\Backup-Database.ps1",'param($InstallRoot,$PgBin,[switch]$NoPrune); Write-Host BACKUP_FIXTURE')
[IO.File]::WriteAllText("$fixture\Set-Gateway.ps1",@'
param($InstallRoot,$Release,$Domain,$ServerIp)
[IO.File]::WriteAllText("$InstallRoot\config\backend.env",'changed environment')
[IO.File]::WriteAllText("$InstallRoot\config\Caddyfile",'changed gateway')
throw 'SIMULATED_GATEWAY_FAILURE'
'@)
$global:studioTestTasks = @{}; $global:studioTestService = $null; $global:studioTestApiRegistrations = 0; $global:studioTestServiceCreations = 0
function Get-ScheduledTask { param($TaskName,$ErrorAction); return $global:studioTestTasks[$TaskName] }
function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel); return [pscustomobject]@{UserId=$UserId} }
function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable,$ExecutionTimeLimit,$RestartCount,$RestartInterval,$MultipleInstances); return @{} }
function New-ScheduledTaskTrigger { param([switch]$AtStartup,[switch]$Daily,$At); return [pscustomobject]@{StartBoundary=''} }
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory); return [pscustomobject]@{Execute=$Execute;Arguments=$Argument} }
function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Principal,$Settings,[switch]$Force); if ($TaskName -eq 'CreatorStudioApi') { $global:studioTestApiRegistrations++ }; $global:studioTestTasks[$TaskName] = [pscustomobject]@{Actions=@($Action);Principal=$Principal} }
function New-Service { param($Name,$DisplayName,$BinaryPathName,$StartupType); $global:studioTestServiceCreations++; $global:studioTestService = [pscustomobject]@{PathName=$BinaryPathName;Status='Stopped'} }
function Get-Service { param($Name,$ErrorAction); return $global:studioTestService }
function Get-CimInstance { param($ClassName,$Filter); if ($ClassName -eq 'Win32_Service') { return $global:studioTestService } }
function sc.exe { $global:LASTEXITCODE=0 }
function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction) }
function Stop-ScheduledTask { param($TaskName) }
function Start-ScheduledTask { param($TaskName) }
function Set-ScheduledTask { param($TaskName,$Action); $global:studioTestTasks[$TaskName].Actions=@($Action) }
[IO.File]::WriteAllText("$Scratch\config\Caddyfile",'original gateway')
& "$fixture\Install-Tasks.ps1" -InstallRoot $Scratch -Release $release -RegisterOnly
$originalAction = $global:studioTestTasks['CreatorStudioApi'].Actions[0].Arguments
& "$fixture\Install-Tasks.ps1" -InstallRoot $Scratch -Release $release -RegisterOnly
if ($global:studioTestApiRegistrations -ne 1 -or $global:studioTestServiceCreations -ne 1 -or $global:studioTestTasks.Count -ne 2) { throw 'Repeated installation duplicated services or application task.' }
if ($global:studioTestTasks['CreatorStudioApi'].Actions[0].Arguments -ne $originalAction) { throw 'Repeated registration changed the running application action.' }
$private = "NODE_ENV=production`nPUBLIC_ORIGIN=https://old.example.com`n"
[IO.File]::WriteAllText("$Scratch\config\backend.env",$private)
$failed = $false
try { & "$fixture\Switch-Release.ps1" -InstallRoot $Scratch -Release $release } catch { $failed=$true; if ($_.Exception.Message -notlike '*SIMULATED_GATEWAY_FAILURE*') { throw } }
if (-not $failed) { throw 'Simulated release failure was ignored.' }
if ([IO.File]::ReadAllText("$Scratch\config\backend.env") -ne $private) { throw 'Private environment was not restored.' }
if ([IO.File]::ReadAllText("$Scratch\config\Caddyfile") -ne 'original gateway') { throw 'Gateway was not restored.' }
if ($global:studioTestTasks['CreatorStudioApi'].Actions[0].Arguments -ne $originalAction) { throw 'Previous task action was not restored.' }
Write-Output 'PASS: repeated registration and failed release rollback. All service/task operations mocked; no system configuration changed.'
