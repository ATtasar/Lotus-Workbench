param([string]$InstallRoot = 'C:\CreatorStudio', [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin')
. "$PSScriptRoot\Common.ps1"
Assert-StudioAdministrator
$db = Get-StudioDatabase $InstallRoot
$oldPassword = $env:PGPASSWORD; $oldAppPassword = $env:APP_DB_PASSWORD
$securePassword = Read-Host 'PostgreSQL postgres administrator password (set in its installer)' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential('postgres', $securePassword)
$env:PGPASSWORD = $credential.GetNetworkCredential().Password
try {
    $listen = Invoke-StudioSql $PgBin 'postgres' 'SHOW listen_addresses' 'postgres'
    $exists = Invoke-StudioSql $PgBin 'postgres' "SELECT count(*) FROM pg_database WHERE datname='creator_studio'" 'postgres'
    $safeListen = $true
    try { Assert-StudioLoopback $listen } catch { $safeListen = $false }
    if (-not $safeListen) {
        if ($exists -eq '1') { & "$PSScriptRoot\Backup-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin -AsAdministrator -NoPrune -BeforeHardening | Out-Null }
        $services = @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -like ('*' + (Join-Path $PgBin 'pg_ctl.exe') + '*') })
        if ($services.Count -ne 1) { throw "Cannot identify this PostgreSQL service. Set listen_addresses='127.0.0.1' in its configuration and restart the correct service, then rerun Deploy." }
        Confirm-StudioChange ('Set PostgreSQL listen_addresses to 127.0.0.1 and restart ' + $services[0].Name + '. This briefly disconnects ALL databases using that service. Firewall/RDP rules will not change.')
        $configFile = Invoke-StudioSql $PgBin 'postgres' 'SHOW config_file' 'postgres'
        $autoConfig = Join-Path (Split-Path -Parent $configFile) 'postgresql.auto.conf'
        if (Test-Path -LiteralPath $autoConfig) { Copy-Item -LiteralPath $autoConfig -Destination ($autoConfig + '.creator-before-' + (Get-Date -Format yyyyMMddHHmmss)) }
        Invoke-StudioSql $PgBin 'postgres' "ALTER SYSTEM SET listen_addresses = '127.0.0.1'" 'postgres' | Out-Null
        Restart-Service -Name $services[0].Name
        Start-Sleep -Seconds 2
        Assert-StudioLoopback (Invoke-StudioSql $PgBin 'postgres' 'SHOW listen_addresses' 'postgres')
    }
    if ($exists -eq '1') {
        & "$PSScriptRoot\Backup-Database.ps1" -InstallRoot $InstallRoot -PgBin $PgBin -AsAdministrator -NoPrune | Out-Null
    } else {
        Confirm-StudioChange 'Create only the missing creator_app role / creator_studio database. Existing roles and passwords will never be reset.'
    }
    $env:APP_DB_PASSWORD = $db.Password
    & "$PgBin\psql.exe" -X -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres -d postgres -f "$PSScriptRoot\..\init-db.sql" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Database initialization failed. Existing databases and passwords were retained.' }
    $env:PGPASSWORD = $db.Password
    Invoke-StudioSql $PgBin creator_studio 'SELECT 1' | Out-Null
    Write-Host 'Database ready. Existing passwords and records were retained.'
} finally {
    $env:PGPASSWORD = $oldPassword; $env:APP_DB_PASSWORD = $oldAppPassword
    $db = $null; $credential = $null; $securePassword = $null
}
