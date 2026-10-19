[CmdletBinding()]
param([string]$DataRoot,[switch]$NoBrowser)
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
    if(-not(Get-Command node -ErrorAction SilentlyContinue)){throw 'Install Node.js 24 LTS from https://nodejs.org/ and reopen the terminal.'}
    $arguments=@('scripts/local-windows.mjs','install')
    if($DataRoot){$arguments+=@('--data-root',$DataRoot)}
    if($NoBrowser){$arguments+='--no-browser'}
    & node @arguments
    if($LASTEXITCODE -ne 0){throw ('Local operation failed, exit code: '+$LASTEXITCODE)}
} finally { Pop-Location }
