param([string]$InstallRoot = 'C:\CreatorStudio')
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$bin = Join-Path $InstallRoot 'bin'
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if ($node -and (& $node.Source --version) -notmatch '^v24\.') { throw 'Node.js is installed but is not v24. Install Node 24 LTS from https://nodejs.org/en/download, reopen PowerShell and retry. Existing software was not replaced.' }
if (-not $node) {
    Confirm-StudioChange 'Download official Node.js 24 Windows x64 ZIP, verify SHA256, and extract under the application bin directory. No system PATH or existing Node installation will be changed.'
    Protect-StudioDirectory $bin
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $version = ($index | Where-Object { $_.version -match '^v24\.' -and $_.lts } | Select-Object -First 1).version
    if ($version -notmatch '^v24\.\d+\.\d+$') { throw 'Official Node version lookup failed.' }
    $name = "node-$version-win-x64.zip"
    $sums = (Invoke-WebRequest "https://nodejs.org/dist/$version/SHASUMS256.txt" -UseBasicParsing).Content
    $line = @($sums -split "`n" | Where-Object { $_.Trim().EndsWith('  ' + $name) })
    if ($line.Count -ne 1) { throw 'Official Node checksum missing.' }
    $zip = Join-Path $bin $name
    Invoke-WebRequest "https://nodejs.org/dist/$version/$name" -OutFile $zip -UseBasicParsing
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne ($line[0] -split '\s+')[0]) { throw 'Node checksum mismatch; archive was not executed.' }
    Expand-Archive -LiteralPath $zip -DestinationPath $bin -Force
    $env:Path = (Join-Path $bin "node-$version-win-x64") + ';' + $env:Path
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm.cmd missing. Install the official Node 24 package including npm.' }
if (-not (Test-Path -LiteralPath "$bin\caddy.exe")) {
    Confirm-StudioChange 'Download official Caddy Windows amd64 ZIP from GitHub, verify its published checksum, and install in the application bin directory. No service or firewall rule is created by this step.'
    Protect-StudioDirectory $bin
    $release = Invoke-RestMethod 'https://api.github.com/repos/caddyserver/caddy/releases/latest'
    $asset = @($release.assets | Where-Object { $_.name -match '^caddy_[0-9.]+_windows_amd64.zip$' })
    $checksums = @($release.assets | Where-Object { $_.name -match '^caddy_[0-9.]+_checksums.txt$' })
    if ($asset.Count -ne 1 -or $checksums.Count -ne 1) { throw 'Official Caddy download assets not found.' }
    $sums = (Invoke-WebRequest $checksums[0].browser_download_url -UseBasicParsing).Content
    $line = @($sums -split "`n" | Where-Object { $_.Trim().EndsWith('  ' + $asset[0].name) })
    if ($line.Count -ne 1) { throw 'Official Caddy checksum missing.' }
    $hash = ($line[0] -split '\s+')[0]
    $algorithm = if ($hash.Length -eq 128) { 'SHA512' } elseif ($hash.Length -eq 64) { 'SHA256' } else { throw 'Unsupported Caddy checksum format.' }
    $zip = Join-Path $bin $asset[0].name
    Invoke-WebRequest $asset[0].browser_download_url -OutFile $zip -UseBasicParsing
    if ((Get-FileHash -LiteralPath $zip -Algorithm $algorithm).Hash -ne $hash) { throw 'Caddy checksum mismatch; archive was not executed.' }
    Expand-Archive -LiteralPath $zip -DestinationPath $bin -Force
}
& "$bin\caddy.exe" version | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Caddy cannot run. Download Windows amd64 from https://caddyserver.com/download.' }
