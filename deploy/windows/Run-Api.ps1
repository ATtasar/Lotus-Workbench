param([Parameter(Mandatory=$true)][string]$InstallRoot, [Parameter(Mandatory=$true)][string]$Release, [string]$NodeExecutable = 'C:\Program Files\nodejs\node.exe')
$ErrorActionPreference = 'Stop'
$logDir = Join-Path $InstallRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$entry = Join-Path $Release 'backend\dist\backend\src\main.js'
$env:STUDIO_RELEASE_ID = Split-Path -Leaf $Release
$launcher = Join-Path $logDir ('launcher-' + (Get-Date -Format yyyy-MM-dd) + '.log')
if ((Test-Path -LiteralPath $launcher) -and (Get-Item -LiteralPath $launcher).Length -gt 10MB) { Move-Item -LiteralPath $launcher -Destination ($launcher + '.1') -Force }
& $NodeExecutable "--env-file=$(Join-Path $InstallRoot 'config\backend.env')" $entry *>> $launcher
exit $LASTEXITCODE
