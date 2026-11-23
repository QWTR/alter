# ALTTER Relay - one-time setup on a Windows VPS (Windows Server 2016+ / Windows 10+).
# Right-click → "Run with PowerShell" (as Administrator), or:  powershell -ExecutionPolicy Bypass -File setup-vps.ps1
# It installs Node (portable) and Caddy (free https certificate), sets the relay up as a service that starts with Windows,
# and opens ports 80 and 443. Downloaded by ALTTER → Settings → Internet, it already has your domain and key inside.
param(
  [string]$Domain = '__DOMAIN__',
  [string]$Key = '__KEY__',
  [string]$Dir = 'C:\AlterRelay'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Run this script as Administrator (right-click PowerShell -> Run as administrator).' -ForegroundColor Red
  Read-Host 'Press Enter to close'; exit 1
}

New-Item -ItemType Directory -Force $Dir | Out-Null
Set-Location $Dir

if ($Domain -eq '__DOMAIN__' -or -not $Domain) {
  Step 'Finding this server''s public address'
  $ip = (Invoke-RestMethod 'https://api.ipify.org').Trim()
  $Domain = ($ip -replace '\.', '-') + '.sslip.io'
}
if ($Key -eq '__KEY__' -or $Key.Length -lt 16) {
  $bytes = New-Object byte[] 24; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $Key = [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

Step 'Relay'
$relayB64 = '__RELAY_B64__'
if ($relayB64 -ne '__RELAY_B64__') { [IO.File]::WriteAllBytes("$Dir\relay.mjs", [Convert]::FromBase64String($relayB64)) }
elseif (Test-Path "$PSScriptRoot\relay.mjs") { Copy-Item "$PSScriptRoot\relay.mjs" "$Dir\relay.mjs" -Force }
if (-not (Test-Path "$Dir\relay.mjs")) { throw 'relay.mjs is missing - put it next to this script.' }

Step 'Node.js'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node -or [int]((& $node -v).TrimStart('v').Split('.')[0]) -lt 20) {
  $lts = (Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.lts } | Select-Object -First 1
  $name = "node-$($lts.version)-win-x64"
  Invoke-WebRequest "https://nodejs.org/dist/$($lts.version)/$name.zip" -OutFile "$Dir\node.zip"
  Expand-Archive "$Dir\node.zip" -DestinationPath $Dir -Force
  Remove-Item "$Dir\node.zip"
  if (Test-Path "$Dir\node") { Remove-Item "$Dir\node" -Recurse -Force }
  Rename-Item "$Dir\$name" 'node'
  $node = "$Dir\node\node.exe"
}
Write-Host "  $node"

Step 'Caddy (https)'
if (-not (Test-Path "$Dir\caddy.exe")) {
  Invoke-WebRequest 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile "$Dir\caddy.exe"
}
@"
$Domain {
  encode gzip
  reverse_proxy 127.0.0.1:8787 {
    flush_interval -1
  }
}
"@ | Set-Content -Encoding ascii "$Dir\Caddyfile"

@"
@echo off
set ALTER_RELAY_KEY=$Key
"$node" "$Dir\relay.mjs" >> "$Dir\relay.log" 2>&1
"@ | Set-Content -Encoding ascii "$Dir\run-relay.cmd"
@"
@echo off
cd /d "$Dir"
"$Dir\caddy.exe" run --config "$Dir\Caddyfile" >> "$Dir\caddy.log" 2>&1
"@ | Set-Content -Encoding ascii "$Dir\run-caddy.cmd"

Step 'Firewall (ports 80, 443)'
foreach ($p in 80, 443) {
  if (-not (Get-NetFirewallRule -DisplayName "ALTTER Relay $p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "ALTTER Relay $p" -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
  }
}

Step 'Services (start with Windows, restart on failure)'
foreach ($n in 'AlterRelay', 'AlterRelayCaddy') {
  Stop-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue
}
Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'AlterRelay' -Action (New-ScheduledTaskAction -Execute "$Dir\run-relay.cmd") -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Register-ScheduledTask -TaskName 'AlterRelayCaddy' -Action (New-ScheduledTaskAction -Execute "$Dir\run-caddy.cmd") -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName 'AlterRelay'
Start-ScheduledTask -TaskName 'AlterRelayCaddy'

Step 'Checking'
Start-Sleep -Seconds 6
$ok = $false
foreach ($i in 1..10) {
  try { $h = Invoke-RestMethod "https://$Domain/_alter/health" -TimeoutSec 10; $ok = $true; break } catch { Start-Sleep -Seconds 4 }
}
"https://$Domain`n$Key" | Set-Content -Encoding ascii "$Dir\connection.txt"

Write-Host ''
if ($ok) { Write-Host '  Relay is up.' -ForegroundColor Green }
else { Write-Host '  Could not reach https://'$Domain' yet. If your VPS provider has its own firewall (security group), allow TCP 80 and 443 there. Logs: '$Dir'\caddy.log' -ForegroundColor Yellow }
Write-Host ''
Write-Host "  Address:  https://$Domain" -ForegroundColor White
Write-Host "  Key:      $Key" -ForegroundColor White
Write-Host "  (saved in $Dir\connection.txt)"
Write-Host ''
Write-Host '  In ALTTER: Settings -> Internet -> Own server: the address and key are already filled in if you downloaded this script from ALTTER. Click Connect.'
Read-Host 'Press Enter to close'
