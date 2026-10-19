param([string]$InstallRoot = 'C:\CreatorStudio')
. "$PSScriptRoot\Common.ps1"
$project = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$release = Join-Path $InstallRoot ('releases\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
Assert-StudioChildPath $InstallRoot $release
if (Test-Path -LiteralPath $release) { throw 'Release directory already exists.' }
Push-Location $project
try {
    & npm.cmd ci --include=dev | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    $oldApi = $env:VITE_API_BASE_URL; $oldTarget = $env:VITE_APP_TARGET
    $env:VITE_API_BASE_URL = '/api'; $env:VITE_APP_TARGET = 'web'
    try { & npm.cmd run build:production | Out-Host; if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' } }
    finally { $env:VITE_API_BASE_URL = $oldApi; $env:VITE_APP_TARGET = $oldTarget }
    & npm.cmd --prefix backend ci --include=dev | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
    & npm.cmd --prefix backend run build | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
    New-Item -ItemType Directory -Path "$release\backend" -Force | Out-Null
    Copy-Item -LiteralPath "$project\dist" -Destination "$release\web" -Recurse
    Copy-Item -LiteralPath "$project\backend\dist" -Destination "$release\backend\dist" -Recurse
    Copy-Item -LiteralPath "$project\backend\package.json","$project\backend\package-lock.json" -Destination "$release\backend"
    & npm.cmd --prefix "$release\backend" ci --omit=dev | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Release dependency installation failed.' }
} finally { Pop-Location }
Write-Host "Release built: $release (running application unchanged)."
return $release
