param([string]$SessionDir, [int]$Dns, [int]$Routes, [switch]$FailRoute, [switch]$Shared)
$ErrorActionPreference = 'Stop'
$global:testOperations = New-Object Collections.Generic.List[object]
$global:testRoutes = @()
$global:testIp = $null
function Get-NetAdapter { param([switch]$IncludeHidden) @{ ifIndex=42; InterfaceGuid=[guid]'12345678-1234-1234-1234-123456789012' } }
function Get-DnsClientServerAddress { param($InterfaceIndex,$AddressFamily) @{ ServerAddresses=@('192.0.2.53') } }
function Get-DnsClient { param($InterfaceIndex) @{ ConnectionSpecificSuffix='before.test' } }
function Get-NetIPInterface { param($InterfaceIndex,$AddressFamily) @{ InterfaceMetric=25; AutomaticMetric='Enabled' } }
function Set-NetIPInterface { param($InterfaceIndex,$AddressFamily,$AutomaticMetric,$InterfaceMetric) $global:testOperations.Add(@{action='metric';value=$InterfaceMetric}) }
function Find-NetRoute { param($RemoteIPAddress) @{ InterfaceIndex=7; NextHop='192.0.2.1' } }
function Get-NetRoute {
    param($DestinationPrefix,$InterfaceIndex,$NextHop,$ErrorAction)
    $global:testRoutes | Where-Object { $_.prefix -eq $DestinationPrefix -and $_.index -eq $InterfaceIndex -and $_.nextHop -eq $NextHop }
}
function New-NetRoute {
    param($DestinationPrefix,$InterfaceIndex,$NextHop,$RouteMetric,$PolicyStore)
    if ($FailRoute -and $InterfaceIndex -eq 42) { throw 'Simulated route failure' }
    $route=@{ prefix=$DestinationPrefix; index=$InterfaceIndex; nextHop=$NextHop }
    $global:testRoutes += $route
    $global:testOperations.Add(@{ action='route-add'; prefix=$DestinationPrefix; index=$InterfaceIndex })
}
function Remove-NetRoute {
    param([Parameter(ValueFromPipeline=$true)]$InputObject,[switch]$Confirm)
    process {
        $global:testOperations.Add(@{ action='route-remove'; prefix=$InputObject.prefix; index=$InputObject.index })
        $global:testRoutes=@($global:testRoutes | Where-Object { !($_.prefix -eq $InputObject.prefix -and $_.index -eq $InputObject.index -and $_.nextHop -eq $InputObject.nextHop) })
    }
}
function Get-NetIPAddress { param($InterfaceIndex,$IPAddress,$ErrorAction) $global:testIp }
function New-NetIPAddress {
    param($InterfaceIndex,$IPAddress,$PrefixLength,$PolicyStore)
    $global:testIp=@{ ip=$IPAddress; index=$InterfaceIndex }
    $global:testOperations.Add(@{ action='ip-add'; index=$InterfaceIndex })
}
function Remove-NetIPAddress {
    param([Parameter(ValueFromPipeline=$true)]$InputObject,[switch]$Confirm)
    process { $global:testIp=$null; $global:testOperations.Add(@{ action='ip-remove'; index=$InputObject.index }) }
}
function Set-DnsClientServerAddress {
    param($InterfaceIndex,$ServerAddresses,[switch]$ResetServerAddresses)
    $global:testOperations.Add(@{ action='dns'; index=$InterfaceIndex; servers=@($ServerAddresses) })
}
function Set-DnsClient { param($InterfaceIndex,$ConnectionSpecificSuffix) $global:testOperations.Add(@{ action='suffix'; value=$ConnectionSpecificSuffix }) }
$env:MYVPNS_SESSION_DIR=$SessionDir
$env:MYVPNS_SET_DNS=[string]$Dns
$env:MYVPNS_SET_ROUTES=[string]$Routes
$env:TUNIDX='42'
$env:VPNGATEWAY='203.0.113.5'
$env:INTERNAL_IP4_ADDRESS='198.18.0.2'
$env:INTERNAL_IP4_DNS='198.18.0.53 198.18.0.54'
$env:CISCO_DEF_DOMAIN='corp.test'
$env:CISCO_SPLIT_INC='1'
$env:CISCO_SPLIT_INC_0_ADDR='198.18.0.0'
$env:CISCO_SPLIT_INC_0_MASKLEN='24'
$env:CISCO_SPLIT_EXC='0'
$network=Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'packaging/windows-network.ps1'
$env:reason='connect'
$connectOutput=@(& $network)
$connectedRoutes=@($global:testRoutes)
if ($Shared) {
    $other=Join-Path (Split-Path -Parent $SessionDir) 'session-other'
    New-Item -ItemType Directory -Path $other -Force | Out-Null
    @{ routes=@(@{prefix='203.0.113.5/32';index=7;nextHop='192.0.2.1'}) } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $other 'network-state.json')
}
$env:reason='disconnect'
$null=& $network
$countAfterDisconnect=$global:testOperations.Count
$null=& $network
@{ connected=$connectOutput; operations=@($global:testOperations.ToArray()); connectedRoutes=$connectedRoutes; remaining=@($global:testRoutes);
   duplicateCleanupChanges=($global:testOperations.Count-$countAfterDisconnect); stateExists=(Test-Path (Join-Path $SessionDir 'network-state.json')) } | ConvertTo-Json -Depth 8 -Compress
