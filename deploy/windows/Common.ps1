$ErrorActionPreference = 'Stop'
function Read-StudioEnvironment([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "Environment file missing: $Path" }
    $configRoot = Split-Path -Parent (Split-Path -Parent ([IO.Path]::GetFullPath($Path)))
    $portable = @(Get-ChildItem -Path "$configRoot\bin\node-v24.*-win-x64\node.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending)
    $nodeExecutable = if ($portable.Count) { $portable[0].FullName } else { (Get-Command node.exe).Source }
    $raw = & $nodeExecutable -e "process.stdout.write(JSON.stringify(require('node:util').parseEnv(require('node:fs').readFileSync(process.argv[1], 'utf8'))))" $Path
    if ($LASTEXITCODE -ne 0) { throw 'Unable to parse environment file' }
    return ($raw | ConvertFrom-Json)
}
function Assert-StudioAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this script in an Administrator PowerShell window.' }
}
function Assert-StudioChildPath([string]$Root, [string]$Path) {
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $target = [IO.Path]::GetFullPath($Path)
    if (-not $target.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw 'Path must be inside the installation directory.' }
}
function Confirm-StudioChange([string]$Message) {
    Write-Host $Message -ForegroundColor Yellow
    if ((Read-Host 'Type YES to continue; any other answer cancels') -cne 'YES') { throw 'Cancelled. No further changes were made.' }
}
function Protect-StudioDirectory([string]$Path) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    & icacls.exe $Path /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Cannot protect directory permissions: $Path" }
}
function Get-StudioDatabase([string]$InstallRoot) {
    $config = Read-StudioEnvironment (Join-Path $InstallRoot 'config\backend.env')
    try { $uri = [uri]$config.DATABASE_URL } catch { throw 'Invalid DATABASE_URL in private config (value hidden).' }
    if ($uri.Scheme -notin @('postgres','postgresql') -or $uri.Host -ne '127.0.0.1' -or $uri.Port -ne 5432 -or $uri.AbsolutePath -ne '/creator_studio' -or $uri.Query) { throw 'This Windows deployment requires creator_studio on 127.0.0.1:5432. Remote databases are not permitted.' }
    $parts = $uri.UserInfo -split ':',2
    if ($parts.Count -ne 2 -or [uri]::UnescapeDataString($parts[0]) -ne 'creator_app' -or -not $parts[1] -or $parts[1] -match 'REPLACE') { throw 'Expected creator_app and a real database password in the protected config.' }
    if ($config.NODE_ENV -ne 'production' -or $config.HOST -ne '127.0.0.1' -or $config.PORT -ne '3000') { throw 'Production API must bind to 127.0.0.1:3000.' }
    if ($config.ADMIN_PASSWORD -match 'REPLACE' -or $config.ADMIN_PASSWORD.Length -lt 12) { throw 'Set a real creator password of at least 12 characters in the protected config.' }
    if ($config.PUBLIC_ORIGIN -and $config.PUBLIC_ORIGIN -notmatch '^https://[a-zA-Z0-9.-]+$') { throw 'PUBLIC_ORIGIN must be empty or an HTTPS domain origin.' }
    return @{ Config=$config; User='creator_app'; Password=[uri]::UnescapeDataString($parts[1]); Name='creator_studio' }
}
function Invoke-StudioSql([string]$PgBin, [string]$Database, [string]$Sql, [string]$User = 'creator_app') {
    # Never pass passwords/connection URLs on the command line. Never echo SQL on error.
    $oldPreference = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $output = & "$PgBin\psql.exe" -X -w -h 127.0.0.1 -p 5432 -U $User -d $Database -v ON_ERROR_STOP=1 -At -c $Sql 2>$null; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $oldPreference }
    if ($code -ne 0) { throw 'PostgreSQL command failed. Check local service, password and database permissions; SQL and credentials were withheld.' }
    return ($output -join "`n").Trim()
}
function Assert-StudioLoopback([string]$Listen) {
    $addresses = @($Listen.Split(',') | ForEach-Object { $_.Trim() })
    if (-not $addresses.Count -or @($addresses | Where-Object { $_ -notin @('localhost','127.0.0.1','::1') }).Count) { throw 'PostgreSQL must listen only on loopback. Run Deploy again to review the PostgreSQL configuration prompt.' }
}
function Assert-StudioOwnedTasks([string]$InstallRoot) {
    foreach ($name in @('CreatorStudioApi','CreatorStudioBackup')) {
        $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        if ($task) {
            $scriptName = if ($name -eq 'CreatorStudioApi') { 'Run-Api.ps1' } else { 'Backup-Database.ps1' }
            $expected = '-File "' + (Join-Path $InstallRoot "scripts\$scriptName") + '"'
            if (@($task.Actions).Count -ne 1 -or -not $task.Actions[0].Arguments.Contains($expected) -or $task.Principal.UserId -notin @('SYSTEM','S-1-5-18')) { throw "Existing $name is not owned by this installation. Nothing was overwritten." }
        }
    }
    $service = Get-CimInstance Win32_Service -Filter "Name='CreatorStudioGateway'"
    if ($service -and $service.PathName -ne ('"' + (Join-Path $InstallRoot 'bin\caddy.exe') + '" run --config "' + (Join-Path $InstallRoot 'config\Caddyfile') + '" --adapter caddyfile')) { throw 'Existing gateway belongs to a different installation. Nothing was overwritten.' }
}
function Wait-StudioReady([string]$Release) {
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health/ready' -TimeoutSec 2
            if ($health.status -eq 'ok' -and $health.database -eq 'ok' -and $health.release -eq (Split-Path -Leaf $Release)) { return $health }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw 'API readiness failed after 30 attempts. Check logs/launcher-*.log, local PostgreSQL and private configuration. The gateway was not switched.'
}
function Stop-StudioApi([string]$InstallRoot) {
    Stop-ScheduledTask -TaskName 'CreatorStudioApi'
    # A killed PowerShell task can leave its child Node process behind. Stop only our exact entry.
    $processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
    foreach ($process in $processes) {
        if ($process.CommandLine -and $process.CommandLine.Contains((Join-Path $InstallRoot 'releases\')) -and $process.CommandLine.Contains('\backend\dist\backend\src\main.js')) { Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop }
    }
    for ($i=0; $i -lt 20; $i++) {
        if (-not (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 250
    }
    throw 'Port 3000 is still occupied. No unrelated process was terminated.'
}
function Assert-StudioPorts([string]$InstallRoot) {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(80,443,3000,2019) })
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $listener.OwningProcess)
        $ours = $process.CommandLine -and (
            ($listener.LocalPort -eq 3000 -and $process.Name -eq 'node.exe' -and $process.CommandLine.Contains((Join-Path $InstallRoot 'releases\')) -and $process.CommandLine.Contains('\backend\dist\backend\src\main.js')) -or
            ($listener.LocalPort -in @(80,443,2019) -and $process.ExecutablePath -eq (Join-Path $InstallRoot 'bin\caddy.exe') -and $process.CommandLine.Contains((Join-Path $InstallRoot 'config\Caddyfile')))
        )
        if (-not $ours) { throw "Port $($listener.LocalPort) is occupied by another application (PID $($listener.OwningProcess)). Keep that application running and ask Codex to resolve the conflict. No unrelated process was stopped." }
    }
}
