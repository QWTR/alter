$ErrorActionPreference = 'Stop'
$repoDir = Split-Path -Parent $PSScriptRoot
$env:ALTER_HOME = 'G:\ALTTER-Repair\altter-plan-test-data'
Set-Location -LiteralPath $repoDir
if (Get-NetTCPConnection -State Listen -LocalPort 4317 -ErrorAction SilentlyContinue) {
    Write-Host 'Instancja na porcie 4317 już działa. Otwórz http://127.0.0.1:4317'
    exit 0
}
Write-Host 'ALTTER test: http://127.0.0.1:4317 (osobne dane, bez zmian w produkcji)'
node packages/core/src/cli.ts start --port 4317 --local
