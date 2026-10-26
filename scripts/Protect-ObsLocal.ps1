#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$ObsExecutable, [int]$Port=4455, [string]$ResultPath)
$ErrorActionPreference='Stop'
try {
  $target=(Resolve-Path -LiteralPath $ObsExecutable).Path
  if ((Split-Path -Leaf $target) -ne 'obs64.exe' -or $Port -lt 1024 -or $Port -gt 65535) { throw 'Expected obs64.exe and an unprivileged port.' }
  $ruleName='SignalStrip-OBS-LocalOnly-'+$Port
  $existing=Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($existing) { throw 'A rule with this name already exists. Inspect it before changing anything.' }
  # Block incoming connections from every remote address except IPv4/IPv6 loopback.
  # Does not open any port, change profile defaults, or affect outbound Twitch traffic.
  New-NetFirewallRule -Name $ruleName -DisplayName ('SignalStrip: restrict OBS '+$Port+' to this PC') -Direction Inbound -Action Block -Enabled True -Profile Any -Program $target -Protocol TCP -LocalPort $Port -RemoteAddress @('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') | Out-Null
  $result=@{ok=$true;rule=$ruleName;program=$target;port=$Port;utc=[DateTime]::UtcNow.ToString('o')}
} catch { $result=@{ok=$false;error=$_.Exception.Message} }
if ($ResultPath) { $result | ConvertTo-Json | Set-Content -LiteralPath $ResultPath -Encoding utf8 }
if (!$result.ok) { throw $result.error }
