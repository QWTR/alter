# ALTTER on your server, 24/7 - one-time setup on a Windows VPS (Windows Server 2019+ / Windows 10 1803+).
# Right-click -> "Run with PowerShell" as Administrator, or: powershell -ExecutionPolicy Bypass -File altter-server-setup.ps1
# Installs a full ALTTER (the same app as on your computer, without the window): Node (portable), Caddy (free https),
# the Claude Code and Codex CLIs, and a service that starts with Windows. Your phone connects to it by its https address.
param(
  [string]$Domain = '__DOMAIN__',
  [string]$Dir = 'C:\ALTTER'
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Run this script as Administrator (right-click PowerShell -> Run as administrator).' -ForegroundColor Red
  Read-Host 'Press Enter to close'; exit 1
}
New-Item -ItemType Directory -Force $Dir, "$Dir\data", "$Dir\home", "$Dir\npm" | Out-Null
Set-Location $Dir

if ($Domain -eq '__DOMAIN__' -or -not $Domain) {
  Step 'Finding this server''s public address'
  $ip = (Invoke-RestMethod 'https://api.ipify.org').Trim()
  $Domain = 'server.' + ($ip -replace '\.', '-') + '.sslip.io'
}

Step 'ALTTER files'
$bundle = '__BUNDLE_B64__'
if ($bundle -eq '__BUNDLE_B64__') { throw 'This script has no ALTTER inside - download it from ALTTER -> Settings -> Internet.' }
[IO.File]::WriteAllBytes("$Dir\altter.tgz", [Convert]::FromBase64String($bundle))
Get-ScheduledTask -TaskName 'AltterServer' -ErrorAction SilentlyContinue | Stop-ScheduledTask -ErrorAction SilentlyContinue
foreach ($d in 'app') { if (Test-Path "$Dir\$d") { Remove-Item "$Dir\$d" -Recurse -Force } }
New-Item -ItemType Directory -Force "$Dir\app" | Out-Null
tar -xzf "$Dir\altter.tgz" -C "$Dir\app"
Remove-Item "$Dir\altter.tgz"
if (-not (Test-Path "$Dir\app\altter-server.mjs")) { throw 'Unpacking failed' }

Step 'Node.js'
$node = $null
foreach ($c in "$Dir\node\node.exe", 'C:\AlterRelay\node\node.exe', (Get-Command node -ErrorAction SilentlyContinue).Source) {
  if ($c -and (Test-Path $c) -and [int]((& $c -v).TrimStart('v').Split('.')[0]) -ge 22) { $node = $c; break }
}
if (-not $node) {
  $lts = (Invoke-RestMethod 'https://nodejs.org/dist/index.json') | Where-Object { $_.lts } | Select-Object -First 1
  $name = "node-$($lts.version)-win-x64"
  Invoke-WebRequest "https://nodejs.org/dist/$($lts.version)/$name.zip" -OutFile "$Dir\node.zip"
  Expand-Archive "$Dir\node.zip" -DestinationPath $Dir -Force
  Remove-Item "$Dir\node.zip"
  if (Test-Path "$Dir\node") { Remove-Item "$Dir\node" -Recurse -Force }
  Rename-Item "$Dir\$name" 'node'
  $node = "$Dir\node\node.exe"
}
$nodeDir = Split-Path $node
Write-Host "  $node"

Step 'AI apps (Claude Code, Codex)'
$env:Path = "$nodeDir;$Dir\npm;$env:Path"
& "$nodeDir\npm.cmd" install -g --prefix "$Dir\npm" '@anthropic-ai/claude-code' '@openai/codex' 2>&1 | Select-Object -Last 2

Step 'Service files'
@"
@echo off
set ALTER_HOME=$Dir\data
set ALTER_WEB_DIR=$Dir\app\web
set ALTER_SKILLS_DIR=$Dir\app\skills
set ALTER_RELAY_DIR=$Dir\app\relay
set ALTER_SERVER=1
set USERPROFILE=$Dir\home
set HOME=$Dir\home
set APPDATA=$Dir\home\AppData\Roaming
set LOCALAPPDATA=$Dir\home\AppData\Local
set PATH=$nodeDir;$Dir\npm;%PATH%
cd /d "$Dir"
"$node" "$Dir\app\altter-server.mjs" start --port 7433 --host 127.0.0.1 >> "$Dir\altter.log" 2>&1
"@ | Set-Content -Encoding ascii "$Dir\run-altter.cmd"
# log in to the AIs as the service will see it (same home folder)
@"
@echo off
set USERPROFILE=$Dir\home
set HOME=$Dir\home
set APPDATA=$Dir\home\AppData\Roaming
set LOCALAPPDATA=$Dir\home\AppData\Local
set PATH=$nodeDir;$Dir\npm;%PATH%
echo Log in to Claude (a browser opens). When it says you are logged in, type /exit.
call claude
echo.
echo Optional - log in to Codex too:
call codex login
pause
"@ | Set-Content -Encoding ascii "$Dir\login-ai.cmd"

Step 'Caddy (https)'
$relayCaddy = 'C:\AlterRelay\Caddyfile'
$block = @"

$Domain {
  encode gzip
  reverse_proxy 127.0.0.1:7433 {
    flush_interval -1
  }
}
"@
if (Test-Path $relayCaddy) {
  # the relay already runs Caddy on 443: add this site to it
  $cur = Get-Content $relayCaddy -Raw
  if ($cur -notmatch [regex]::Escape($Domain)) { Add-Content -Encoding ascii $relayCaddy $block }
  Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-ScheduledTask -TaskName 'AlterRelayCaddy' -ErrorAction SilentlyContinue
} else {
  if (-not (Test-Path "$Dir\caddy.exe")) { Invoke-WebRequest 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile "$Dir\caddy.exe" }
  $block.Trim() | Set-Content -Encoding ascii "$Dir\Caddyfile"
  @"
@echo off
cd /d "$Dir"
"$Dir\caddy.exe" run --config "$Dir\Caddyfile" >> "$Dir\caddy.log" 2>&1
"@ | Set-Content -Encoding ascii "$Dir\run-caddy.cmd"
}

Step 'Firewall (ports 80, 443)'
foreach ($p in 80, 443) {
  if (-not (Get-NetFirewallRule -DisplayName "ALTTER $p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "ALTTER $p" -Direction Inbound -Protocol TCP -LocalPort $p -Action Allow | Out-Null
  }
}

Step 'Services (start with Windows, restart on failure)'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup
$tasks = @{ 'AltterServer' = "$Dir\run-altter.cmd" }
if (-not (Test-Path $relayCaddy)) { $tasks['AltterCaddy'] = "$Dir\run-caddy.cmd"; Get-Process caddy -ErrorAction SilentlyContinue | Stop-Process -Force }
foreach ($n in $tasks.Keys) {
  Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $n -Action (New-ScheduledTaskAction -Execute $tasks[$n]) -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  Start-ScheduledTask -TaskName $n
}

Step 'Checking'
Start-Sleep -Seconds 8
$local = $false
foreach ($i in 1..10) { try { Invoke-RestMethod 'http://127.0.0.1:7433/api/health' -TimeoutSec 5 | Out-Null; $local = $true; break } catch { Start-Sleep -Seconds 3 } }
$public = $false
foreach ($i in 1..8) { try { Invoke-WebRequest "https://$Domain/" -UseBasicParsing -TimeoutSec 10 | Out-Null; $public = $true; break } catch { Start-Sleep -Seconds 4 } }
"https://$Domain" | Set-Content -Encoding ascii "$Dir\address.txt"

Write-Host ''
if ($local) { Write-Host '  ALTTER is running on this server.' -ForegroundColor Green } else { Write-Host "  ALTTER did not start - see $Dir\altter.log" -ForegroundColor Yellow }
if (-not $public) { Write-Host '  https is not reachable yet. If your VPS provider has its own firewall, allow TCP 80 and 443 there.' -ForegroundColor Yellow }
Write-Host ''
Write-Host "  Address:  https://$Domain" -ForegroundColor White
Write-Host ''
Write-Host '  Next (2 minutes):' -ForegroundColor White
Write-Host "   1. Run $Dir\login-ai.cmd and log in to Claude (and Codex if you use it)."
Write-Host '   2. Open http://127.0.0.1:7433 in a browser ON THIS SERVER -> finish setup -> Settings -> Devices -> pair your phone.'
Write-Host '   3. On the phone: Settings -> Devices -> turn notifications on.'
Write-Host ''
Start-Process 'http://127.0.0.1:7433' -ErrorAction SilentlyContinue
Read-Host 'Press Enter to close'
