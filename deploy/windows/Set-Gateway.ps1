param([string]$InstallRoot = 'C:\CreatorStudio', [Parameter(Mandatory=$true)][string]$Release, [string]$Domain = '', [string]$ServerIp = '47.109.199.148')
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
Assert-StudioChildPath $InstallRoot $Release
$caddy = Join-Path $InstallRoot 'bin\caddy.exe'
if (-not (Test-Path -LiteralPath $caddy)) { throw "Place the official Caddy Windows amd64 binary at $caddy first." }
New-Item -ItemType Directory -Force -Path "$InstallRoot\logs","$InstallRoot\caddy-data" | Out-Null
$environmentPath = Join-Path $InstallRoot 'config\backend.env'
$environment = [IO.File]::ReadAllText($environmentPath)
$dataDir = (Join-Path $InstallRoot 'caddy-data').Replace('\','/')
$logFile = (Join-Path $InstallRoot 'logs\gateway.jsonl').Replace('\','/')
$runtimeLog = (Join-Path $InstallRoot 'logs\caddy-runtime.jsonl').Replace('\','/')
if ($Domain) {
    $Domain = $Domain.ToLowerInvariant()
    if ($Domain -notmatch '^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$' -or $Domain.EndsWith('.example') -or $Domain.EndsWith('.localhost') -or $Domain.EndsWith('.local')) { throw 'Enter a real public DNS domain without a scheme or path.' }
    $web = (Join-Path $Release 'web').Replace('\','/')
    $site = @"
$Domain {
  encode zstd gzip
  request_body {
    max_size 140MB
  }
  header {
    X-Content-Type-Options nosniff
    X-Frame-Options DENY
    Referrer-Policy no-referrer
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  }
  handle /api/* {
    reverse_proxy 127.0.0.1:3000
  }
  handle {
    root * "$web"
    try_files {path} /index.html
    header /index.html Cache-Control "no-store"
    file_server
  }
  log {
    output file "$logFile" {
      roll_size 10MiB
      roll_keep 14
      roll_keep_for 720h
    }
  }
}
"@
    $environment = [regex]::Replace($environment, '(?m)^PUBLIC_ORIGIN=.*$', "PUBLIC_ORIGIN=https://$Domain")
} else {
    $parsedIp = $null
    if (-not [Net.IPAddress]::TryParse($ServerIp, [ref]$parsedIp)) { throw 'Invalid server IP address.' }
    $site = @"
http://$ServerIp {
  handle /api/health/* {
    reverse_proxy 127.0.0.1:3000
  }
  handle {
    respond "HTTPS domain configuration pending. Health probes are available at /api/health/ready." 503
  }
}
"@
    $environment = [regex]::Replace($environment, '(?m)^PUBLIC_ORIGIN=.*$', 'PUBLIC_ORIGIN=')
}
$configuration = @"
{
  admin localhost:2019
  storage file_system {
    root "$dataDir"
  }
  log {
    output file "$runtimeLog" {
      roll_size 10MiB
      roll_keep 14
      roll_keep_for 720h
    }
    format json
  }
}
$site
"@
$candidate = Join-Path $InstallRoot 'config\Caddyfile.next'
[IO.File]::WriteAllText($candidate, $configuration, (New-Object Text.UTF8Encoding($false)))
& $caddy validate --config $candidate --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Gateway validation failed. Existing configuration was not replaced.' }
[IO.File]::WriteAllText($environmentPath, $environment, (New-Object Text.UTF8Encoding($false)))
Copy-Item -LiteralPath $candidate -Destination (Join-Path $InstallRoot 'config\Caddyfile') -Force
Write-Output 'Gateway configuration prepared. Restart the API task and reload Caddy after changing a running installation.'
