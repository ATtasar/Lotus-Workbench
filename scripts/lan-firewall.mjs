import { spawnSync } from 'node:child_process';
export async function configureFirewall(settings) {
  if (process.platform !== 'win32') throw new Error('此防火墙配置仅适用于 Windows。');
  const spec = {
    ...settings,
    name: `Lotus-Workbench-Private-LAN-${settings.port}-${settings.address}`,
  };
  // Values are passed as JSON in a scoped environment variable, never composed
  // into PowerShell commands. No router, network-category or global rule edits.
  const script = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$ruleSpec=$env:LOTUS_LAN_RULE_CONFIG | ConvertFrom-Json
if($ruleSpec.checkOnly){ $ruleSpec | Select-Object name,address,phones,port,node,remove | ConvertTo-Json -Depth 4; Write-Output '目标配置：仅 Private 配置文件、指定手机 IP、指定本机地址和 TCP 端口；不更改网络类别。'; exit 0 }
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ throw '请右键 Set-LanFirewall.cmd，选择以管理员身份运行；本步骤需要修改一条受限的 Windows 防火墙规则。' }
$existing=Get-NetFirewallRule -Name $ruleSpec.name -ErrorAction SilentlyContinue
if($existing -and $existing.Group -ne 'LotusWorkbenchPrivateLAN'){ throw '同名规则不属于本应用，未修改。' }
if($ruleSpec.remove){ if($existing){ $existing | Remove-NetFirewallRule }; Write-Output '本应用的对应局域网规则已移除。'; exit 0 }
$addresses=@($ruleSpec.phones | ForEach-Object {[string]$_})
if($addresses.Count -lt 1){ throw '必须先填写允许访问的手机地址。' }
$adapter=Get-NetIPAddress -AddressFamily IPv4 -IPAddress $ruleSpec.address -ErrorAction Stop
$profiles=@(Get-NetConnectionProfile -InterfaceIndex $adapter.InterfaceIndex -ErrorAction SilentlyContinue)
if($existing){ Set-NetFirewallRule -Name $ruleSpec.name -Enabled True -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort $ruleSpec.port -LocalAddress $ruleSpec.address -RemoteAddress $addresses -Program $ruleSpec.node -EdgeTraversalPolicy Block | Out-Null }
else { New-NetFirewallRule -Name $ruleSpec.name -DisplayName '创作者工作台：指定手机访问' -Group 'LotusWorkbenchPrivateLAN' -Enabled True -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort $ruleSpec.port -LocalAddress $ruleSpec.address -RemoteAddress $addresses -Program $ruleSpec.node -EdgeTraversalPolicy Block | Out-Null }
if(-not ($profiles | Where-Object NetworkCategory -eq Private)){ Write-Output '规则已创建，但当前网络不是专用网络，因此此规则不会生效。请仅在确认网络可信后，在 Windows 网络设置中手动改为专用。' }
else { Write-Output '已配置专用网络规则，仅指定手机 IP 可访问当前工作台端口。' }
`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, LOTUS_LAN_RULE_CONFIG: JSON.stringify(spec) },
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0)
    throw new Error(result.stderr || result.error?.message || 'Windows 防火墙配置失败。');
}
