param([Parameter(Mandatory=$true)][string]$Project, [string]$Scratch, [switch]$ParseOnly)
if ($ParseOnly) {
    $failed = $false
    Get-ChildItem -LiteralPath "$Project\deploy\windows" -Filter *.ps1 | ForEach-Object {
        $tokens=$null; $errors=$null
        [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) | Out-Null
        if ($errors) { $failed=$true; $errors | ForEach-Object { Write-Output $_.Message } }
    }
    if ($failed) { exit 1 }
    Write-Output 'PASS: all deployment scripts parse in Windows PowerShell 5.1'
    return
}
. "$Project\deploy\windows\Common.ps1"
$checks = 0
function Assert-True($Value, [string]$Message) { if (-not $Value) { throw $Message }; $script:checks++ }
function Assert-Throws([scriptblock]$Block) { $thrown=$false; try { & $Block } catch { $thrown=$true }; Assert-True $thrown 'Expected operation to be rejected.' }
Assert-StudioChildPath 'C:\CreatorStudio' 'C:\CreatorStudio\releases\one'
Assert-Throws { Assert-StudioChildPath 'C:\CreatorStudio' 'C:\CreatorStudio-other\one' }
Assert-Throws { Assert-StudioChildPath 'C:\CreatorStudio' 'C:\CreatorStudio\..\outside' }
foreach ($listen in @('*','0.0.0.0','::','127.0.0.1,192.168.1.2','')) { Assert-Throws { Assert-StudioLoopback $listen } }
Assert-StudioLoopback '127.0.0.1, ::1'
Assert-StudioLoopback 'localhost'
New-Item -ItemType Directory -Force -Path "$Scratch\config" | Out-Null
$password = [guid]::NewGuid().ToString('N')
$content = "NODE_ENV=production`nHOST=127.0.0.1`nPORT=3000`nDATABASE_URL=postgresql://creator_app:${password}@127.0.0.1:5432/creator_studio`nADMIN_PASSWORD=$password`nPUBLIC_ORIGIN="
[IO.File]::WriteAllText("$Scratch\config\backend.env",$content)
Assert-True ((Get-StudioDatabase $Scratch).Password -eq $password) 'Private environment parse failed.'
[IO.File]::WriteAllText("$Scratch\config\backend.env",$content.Replace('@127.0.0.1:','@0.0.0.0:'))
Assert-Throws { Get-StudioDatabase $Scratch }
$script:foreign = $false
function Get-ScheduledTask { param($TaskName,$ErrorAction); if ($script:foreign) { return [pscustomobject]@{ Actions=@([pscustomobject]@{Arguments='-File "C:\unrelated\task.ps1"'}); Principal=[pscustomobject]@{UserId='SYSTEM'} } } }
function Get-CimInstance { param($ClassName,$Filter); if ($ClassName -eq 'Win32_Service' -and $script:foreignService) { return [pscustomobject]@{PathName='unrelated.exe'} }; if ($ClassName -eq 'Win32_Process') { return @([pscustomobject]@{ProcessId=101; CommandLine='node C:\unrelated\server.js'},[pscustomobject]@{ProcessId=102; CommandLine='node C:\CreatorStudio\releases\one\backend\dist\backend\src\main.js'}) } }
Assert-StudioOwnedTasks 'C:\CreatorStudio'
$script:foreign = $true
Assert-Throws { Assert-StudioOwnedTasks 'C:\CreatorStudio' }
$script:foreign = $false; $script:foreignService = $true
Assert-Throws { Assert-StudioOwnedTasks 'C:\CreatorStudio' }
$script:foreignService = $false
$script:stopped = @()
function Stop-ScheduledTask { param($TaskName) }
function Stop-Process { param($Id,[switch]$Force,$ErrorAction); $script:stopped += $Id }
function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction) }
Stop-StudioApi 'C:\CreatorStudio'
Assert-True ($script:stopped.Count -eq 1 -and $script:stopped[0] -eq 102) 'Unrelated Node process was terminated.'
function Get-NetTCPConnection { param($State,$LocalPort,$ErrorAction); return [pscustomobject]@{LocalPort=$script:testPort;OwningProcess=123} }
function Get-CimInstance { param($ClassName,$Filter); return [pscustomobject]@{Name='unrelated.exe';CommandLine='unrelated.exe';ExecutablePath='C:\unrelated.exe'} }
$script:testPort=80
Assert-Throws { Assert-StudioPorts 'C:\CreatorStudio' }
$script:testPort=3000
Assert-Throws { Assert-StudioPorts 'C:\CreatorStudio' }
function Read-Host { param($Prompt); return 'NO' }
Assert-Throws { Confirm-StudioChange 'TEST ONLY: cancellation must stop changes.' }
$script:attempts = 0
function Invoke-RestMethod { param($Uri,$TimeoutSec); $script:attempts++; return @{status='ok';database='ok';release=$(if ($script:attempts -eq 1) {'old'} else {'new'})} }
function Start-Sleep { param($Seconds,$Milliseconds) }
$health = Wait-StudioReady 'C:\CreatorStudio\releases\new'
Assert-True ($health.release -eq 'new' -and $script:attempts -eq 2) 'Old release incorrectly passed readiness.'
Write-Output "PASS: $checks deployment helper assertions (Windows PowerShell $($PSVersionTable.PSVersion)). No services modified."
